import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";

const runDatabaseIntegration = process.env.OVE295_RUN_DB_INTEGRATION === "true";
const INDEX_NAMES = [
  "account_google_provider_subject_unique_idx",
  "account_google_user_provider_unique_idx",
] as const;

interface AccountInsert {
  id: string;
  userId: string;
  accountId: string;
}

describe("OVE-295 Google account uniqueness", () => {
  it.skipIf(!runDatabaseIntegration)(
    "reads both exact indexes and admits one row in each 32-way race",
    async () => {
      const connectionString = requiredLocalDatabaseUrl();
      const pool = new Pool({ connectionString, max: 40 });
      const userIds = Array.from({ length: 33 }, () => randomUUID());
      const accountIds = Array.from({ length: 64 }, () => randomUUID());
      const sharedSubject = `ove295-subject-${randomUUID()}`;

      try {
        await expect(readDuplicateGroupCounts(pool)).resolves.toEqual({
          providerSubject: 0,
          userProvider: 0,
        });
        await expect(readGoogleUniquenessIndexes(pool)).resolves.toEqual([
          {
            columns: ['"providerId"', '"accountId"'],
            indexName: INDEX_NAMES[0],
            predicate: expect.stringMatching(
              /"providerId"\s*=\s*'google'(?:::text)?/u,
            ),
            unique: true,
          },
          {
            columns: ['"userId"', '"providerId"'],
            indexName: INDEX_NAMES[1],
            predicate: expect.stringMatching(
              /"providerId"\s*=\s*'google'(?:::text)?/u,
            ),
            unique: true,
          },
        ]);

        await insertSyntheticUsers(pool, userIds);

        const providerSubjectAttempts = userIds.slice(0, 32).map(
          (userId, index): AccountInsert => ({
            id: accountIds[index]!,
            userId,
            accountId: sharedSubject,
          }),
        );
        const providerSubjectRace = await runBarrierRace(
          pool,
          providerSubjectAttempts,
        );
        expect(providerSubjectRace).toEqual({ winners: 1, losers: 31 });
        await expect(
          countGoogleRows(pool, { accountId: sharedSubject }),
        ).resolves.toBe(1);

        const singleUserId = userIds[32]!;
        const userProviderAttempts = accountIds.slice(32).map(
          (id): AccountInsert => ({
            id,
            userId: singleUserId,
            accountId: `ove295-subject-${randomUUID()}`,
          }),
        );
        const userProviderRace = await runBarrierRace(
          pool,
          userProviderAttempts,
        );
        expect(userProviderRace).toEqual({ winners: 1, losers: 31 });
        await expect(
          countGoogleRows(pool, { userId: singleUserId }),
        ).resolves.toBe(1);

        console.info(
          JSON.stringify({
            duplicateGroups: { providerSubject: 0, userProvider: 0 },
            indexes: 2,
            races: {
              providerSubject: providerSubjectRace,
              userProvider: userProviderRace,
            },
          }),
        );
      } finally {
        await pool.query(
          "delete from public.account where id = any($1::uuid[])",
          [accountIds],
        );
        await pool.query(
          'delete from public."user" where id = any($1::uuid[])',
          [userIds],
        );
        await expect(countFixtureRows(pool, accountIds, userIds)).resolves.toBe(
          0,
        );
        await pool.end();
      }
    },
    60_000,
  );
});

async function readDuplicateGroupCounts(pool: Pool) {
  const result = await pool.query<{
    provider_subject: number;
    user_provider: number;
  }>(`
    select
      (
        select count(*)::int
        from (
          select 1
          from public.account
          where "providerId" = 'google'
          group by "providerId", "accountId"
          having count(*) > 1
        ) provider_subject_duplicates
      ) as provider_subject,
      (
        select count(*)::int
        from (
          select 1
          from public.account
          where "providerId" = 'google'
          group by "userId", "providerId"
          having count(*) > 1
        ) user_provider_duplicates
      ) as user_provider
  `);
  return {
    providerSubject: result.rows[0]?.provider_subject ?? -1,
    userProvider: result.rows[0]?.user_provider ?? -1,
  };
}

async function readGoogleUniquenessIndexes(pool: Pool) {
  const result = await pool.query<{
    index_name: string;
    unique: boolean;
    column_one: string;
    column_two: string;
    predicate: string;
  }>(
    `
      select
        index_relation.relname as index_name,
        index_metadata.indisunique as unique,
        pg_get_indexdef(index_metadata.indexrelid, 1, true) as column_one,
        pg_get_indexdef(index_metadata.indexrelid, 2, true) as column_two,
        pg_get_expr(
          index_metadata.indpred,
          index_metadata.indrelid,
          true
        ) as predicate
      from pg_index index_metadata
      join pg_class index_relation
        on index_relation.oid = index_metadata.indexrelid
      join pg_namespace index_namespace
        on index_namespace.oid = index_relation.relnamespace
      where index_namespace.nspname = 'public'
        and index_relation.relname = any($1::text[])
      order by index_relation.relname
    `,
    [[...INDEX_NAMES]],
  );

  return result.rows.map((row) => ({
    columns: [row.column_one, row.column_two],
    indexName: row.index_name,
    predicate: row.predicate,
    unique: row.unique,
  }));
}

async function insertSyntheticUsers(pool: Pool, userIds: readonly string[]) {
  await pool.query(
    `
      insert into public."user" (
        id,
        email,
        "emailVerified",
        image,
        name,
        "updatedAt"
      )
      select
        fixture.id,
        fixture.id::text || '@ove295.invalid',
        true,
        null,
        'OVE-295 synthetic account-link fixture',
        now()
      from unnest($1::uuid[]) as fixture(id)
    `,
    [userIds],
  );
}

async function runBarrierRace(pool: Pool, attempts: readonly AccountInsert[]) {
  const clients = await Promise.all(attempts.map(() => pool.connect()));
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  try {
    await Promise.all(clients.map((client) => client.query("begin")));
    const contenders = clients.map(async (client, index) => {
      await barrier;
      return insertContender(client, attempts[index]!);
    });
    releaseBarrier();
    const outcomes = await Promise.all(contenders);
    const winners = outcomes.filter(
      (outcome) => outcome === "committed",
    ).length;
    return { winners, losers: outcomes.length - winners };
  } finally {
    clients.forEach((client) => client.release());
  }
}

async function insertContender(client: PoolClient, attempt: AccountInsert) {
  try {
    await client.query(
      `
        insert into public.account (
          id,
          "userId",
          "providerId",
          "accountId",
          "updatedAt"
        ) values ($1::uuid, $2::uuid, 'google', $3::text, now())
      `,
      [attempt.id, attempt.userId, attempt.accountId],
    );
    await client.query("commit");
    return "committed" as const;
  } catch {
    await client.query("rollback").catch(() => undefined);
    return "rejected" as const;
  }
}

async function countGoogleRows(
  pool: Pool,
  key: { accountId: string } | { userId: string },
) {
  const predicate =
    "accountId" in key ? '"accountId" = $1::text' : '"userId" = $1::uuid';
  const value = "accountId" in key ? key.accountId : key.userId;
  const result = await pool.query<{ count: number }>(
    `
      select count(*)::int as count
      from public.account
      where "providerId" = 'google' and ${predicate}
    `,
    [value],
  );
  return result.rows[0]?.count ?? -1;
}

async function countFixtureRows(
  pool: Pool,
  accountIds: readonly string[],
  userIds: readonly string[],
) {
  const result = await pool.query<{ count: number }>(
    `
      select (
        (select count(*) from public.account where id = any($1::uuid[]))
        +
        (select count(*) from public."user" where id = any($2::uuid[]))
      )::int as count
    `,
    [accountIds, userIds],
  );
  return result.rows[0]?.count ?? -1;
}

function requiredLocalDatabaseUrl() {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error("OVE-295 database proof is local-only.");
  }
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for OVE-295 DB proof.");

  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.pathname !== "/overgarden"
  ) {
    throw new Error("OVE-295 database proof requires the local OverGarden DB.");
  }
  return value;
}
