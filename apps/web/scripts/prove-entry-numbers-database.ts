/**
 * Executes migration `0076` instead of reading it (OVE-464).
 *
 * An entry is addressed by its number — `/@{handle}/post/{n}` (ADR-0029 D9,
 * amendment of 2026-09-18) — and the owner's decision has four clauses that a
 * reader of the SQL can only believe and a database can show:
 *
 *   1. **Existing entries are numbered by publish date, oldest first**, per
 *      author, and a row that was never an address is left without a number.
 *   2. **Two concurrent publishes by one author get two numbers**, and a
 *      publish that rolls back leaves no gap behind it.
 *   3. **A number is never reused.** Deletion purges the row (ADR-0021), so
 *      `max() + 1` would hand a purged entry's number to the next publish and
 *      an old shared link would start opening somebody's new entry.
 *   4. **The migration replays**, on an empty schema and on one holding rows,
 *      without renumbering anything; and its rollback really rolls back.
 *
 * It also runs the two reads the proxy decides a status from — the lookup by
 * `(handle, number)` and the resolution of an older name — against real rows,
 * because a compiled SQL string proves the shape of a question and not that
 * Postgres can answer it.
 *
 * It builds its own disposable database and drops it, so it never writes to
 * the database whose connection string it borrows.
 */
import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  getPublicJournalEntryLifecycleLookup,
  publicJournalEntryNameKey,
  publicJournalEntryNumberKey,
} from "../src/server/journal-repository";
import { resolveJournalEntryAddress } from "../src/server/journal-slug-repository";
import { loadVersionedApplicationSql } from "./application-sql";

const MIGRATION = "0076_ove464_journal_entry_numbers.sql";
const ROLLBACK = "rollback/0076_ove464_journal_entry_numbers.down.sql";

const OLENA = "00000000-0000-4000-8000-0000000046a0";
const OLENA_SPACE = "00000000-0000-4000-8000-0000000046a1";
const OLENA_OBJECT = "00000000-0000-4000-8000-0000000046a2";
const YEHOR = "00000000-0000-4000-8000-0000000046b0";
const YEHOR_SPACE = "00000000-0000-4000-8000-0000000046b1";
const YEHOR_OBJECT = "00000000-0000-4000-8000-0000000046b2";
/** Where account erasure re-keys an erased gardener's entries to. */
const ERASED_SUBJECT = "00000000-0000-4000-8000-0000000046e0";

type Queryable = Pool | PoolClient;

async function seedGardener(
  pool: Pool,
  input: { userId: string; spaceId: string; objectId: string; email: string },
): Promise<string> {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Proof gardener', $2, true, now(), now())`,
    [input.userId, input.email],
  );
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Proof space')`,
    [input.spaceId, input.userId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Томат', 'plant', 'unknown')`,
    [input.objectId, input.userId, input.spaceId],
  );
  // A handle is claimed for every user at sign-up; the proof reads the one it
  // was given rather than inventing one the registry would refuse.
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [input.userId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("entry_numbers_proof_handle_missing");
  return handle;
}

async function insertEntry(
  executor: Queryable,
  input: {
    ownerUserId: string;
    spaceId: string;
    objectId: string;
    slug: string;
    publishedAt?: string;
    number?: number;
    deleted?: boolean;
  },
): Promise<number | null> {
  const id = randomUUID();
  const result = await executor.query<{ author_entry_number: number | null }>(
    `insert into journal_entries
       (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
        visibility, lifecycle_state, published_at, public_slug, source_language,
        client_mutation_id, deleted_at, purge_after, public_gone_at
        ${input.number === undefined ? "" : ", author_entry_number"})
     values ($1, $2, $3, $4, $5, 'Текст запису.', 'object', 'public', $6,
             coalesce($7::timestamptz, now()), $5, 'uk', $8,
             case when $9 then now() end,
             case when $9 then now() + interval '7 days' end,
             case when $9 then now() end
             ${input.number === undefined ? "" : ", $10"})
     returning author_entry_number`,
    [
      id,
      input.ownerUserId,
      input.spaceId,
      input.objectId,
      input.slug,
      input.deleted ? "deleted_retention" : "active",
      input.publishedAt ?? null,
      `ove464-proof-${id}`,
      Boolean(input.deleted),
      ...(input.number === undefined ? [] : [input.number]),
    ],
  );
  return result.rows[0]?.author_entry_number ?? null;
}

export async function runEntryNumbersDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const disposable = `overgarden_entry_numbers_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  // Three connections: the concurrency cases need two transactions open at
  // once and a third to look at what they left.
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 3 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  const failures: string[] = [];
  const expect = (name: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      failures.push(
        `${name}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`,
      );
    }
  };
  const codeOf = (work: Promise<unknown>) =>
    work
      .then(() => "accepted")
      .catch((error: unknown) => (error as { code?: string }).code ?? "unknown");
  const numbersOf = async (ownerUserId: string) =>
    (
      await pool.query<{ slug: string; n: number | null }>(
        `select public_slug as slug, author_entry_number as n
         from journal_entries where owner_user_id = $1
         order by author_entry_number nulls last, public_slug`,
        [ownerUserId],
      )
    ).rows;
  const counterOf = async (ownerUserId: string) =>
    (
      await pool.query<{ last_number: number }>(
        `select last_number from journal_entry_number_counters where owner_user_id = $1`,
        [ownerUserId],
      )
    ).rows[0]?.last_number ?? null;

  try {
    const applicationSql = await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    );
    await pool.query(applicationSql[0]!.sql);
    const authOptions = {
      appName: "OverGarden",
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "ove464-disposable-proof-secret-value-not-a-credential",
      database: { db, type: "postgres", casing: "snake" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
    } satisfies BetterAuthOptions;
    betterAuth(authOptions);
    await (await getMigrations(authOptions)).runMigrations();
    for (const migration of applicationSql) await pool.query(migration.sql);
    // 4a. Replay on a schema that already has everything, holding no rows.
    for (const migration of applicationSql) await pool.query(migration.sql);

    const olena = await seedGardener(pool, {
      userId: OLENA,
      spaceId: OLENA_SPACE,
      objectId: OLENA_OBJECT,
      email: "ove464-olena@example.test",
    });
    const yehor = await seedGardener(pool, {
      userId: YEHOR,
      spaceId: YEHOR_SPACE,
      objectId: YEHOR_OBJECT,
      email: "ove464-yehor@example.test",
    });
    const olenaRows = { ownerUserId: OLENA, spaceId: OLENA_SPACE, objectId: OLENA_OBJECT };
    const yehorRows = { ownerUserId: YEHOR, spaceId: YEHOR_SPACE, objectId: YEHOR_OBJECT };

    // 1. The backfill. The entries have to exist *before* the migration, the
    // way production's do, so the schema is rolled back, the rows are written
    // in an order that is not their publish order, and `0076` runs over them.
    await pool.query(readFileSync(path.join(process.cwd(), "sql", ROLLBACK), "utf8"));
    const afterRollback = await pool.query(
      `select
         to_regclass('journal_entry_number_counters') is null as counters_gone,
         to_regprocedure('assign_journal_entry_number(uuid)') is null as function_gone,
         not exists (
           select 1 from pg_trigger where tgname = 'journal_entry_number_assign_trg'
         ) as trigger_gone,
         not exists (
           select 1 from information_schema.columns
           where table_name = 'journal_entries' and column_name = 'author_entry_number'
         ) as column_gone`,
    );
    expect("rollback", afterRollback.rows[0], {
      counters_gone: true,
      function_gone: true,
      trigger_gone: true,
      column_gone: true,
    });

    const before = async (
      rows: typeof olenaRows,
      slug: string,
      publishedAt: string,
      deleted = false,
    ) => {
      const id = randomUUID();
      await pool.query(
        `insert into journal_entries
           (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
            visibility, lifecycle_state, published_at, public_slug, source_language,
            client_mutation_id, deleted_at, purge_after, public_gone_at)
         values ($1, $2, $3, $4, $5, 'Текст запису.', 'object', 'public', $6,
                 $7::timestamptz, $5, 'uk', $8,
                 case when $9 then now() end,
                 case when $9 then now() + interval '7 days' end,
                 case when $9 then now() end)`,
        [
          id,
          rows.ownerUserId,
          rows.spaceId,
          rows.objectId,
          slug,
          deleted ? "deleted_retention" : "active",
          publishedAt,
          `ove464-proof-${id}`,
          deleted,
        ],
      );
    };
    await before(olenaRows, "третій", "2026-03-01T10:00:00Z");
    await before(olenaRows, "перший", "2026-01-01T10:00:00Z");
    await before(olenaRows, "видалений", "2026-01-15T10:00:00Z", true);
    await before(olenaRows, "другий", "2026-02-01T10:00:00Z");
    await before(yehorRows, "кратък-и-отговорен-запис-след", "2026-02-10T10:00:00Z");

    const migration = readFileSync(path.join(process.cwd(), "sql", MIGRATION), "utf8");
    await pool.query(migration);
    expect("existing entries, oldest first, per author", await numbersOf(OLENA), [
      { slug: "перший", n: 1 },
      { slug: "другий", n: 2 },
      { slug: "третій", n: 3 },
      // Deleted before the address existed: it never had a number, and its
      // old name still answers 410 for the retention window.
      { slug: "видалений", n: null },
    ]);
    expect("the second author starts at one", await numbersOf(YEHOR), [
      { slug: "кратък-и-отговорен-запис-след", n: 1 },
    ]);
    expect("counters after the backfill", [await counterOf(OLENA), await counterOf(YEHOR)], [3, 1]);

    // 4b. Replay with rows in the table: nothing is renumbered.
    await pool.query(migration);
    await pool.query(migration);
    expect("replay leaves the numbers alone", (await numbersOf(OLENA)).map((r) => r.n), [1, 2, 3, null]);
    expect("replay leaves the counter alone", await counterOf(OLENA), 3);

    // The trigger: a publish gets the next number without being told to.
    expect("the next publish", await insertEntry(pool, { ...olenaRows, slug: "четвертий" }), 4);
    // An insert that brings its own number keeps it, and the counter moves
    // past it so the next publish cannot collide with it.
    expect("an explicit number is kept", await insertEntry(pool, { ...olenaRows, slug: "десятий", number: 10 }), 10);
    expect("and the counter follows it", await insertEntry(pool, { ...olenaRows, slug: "одинадцятий" }), 11);
    expect(
      "a number twice under one author",
      await codeOf(insertEntry(pool, { ...olenaRows, slug: "дубль", number: 10 })),
      "23505",
    );
    expect(
      "zero is not a number",
      await codeOf(insertEntry(pool, { ...olenaRows, slug: "нуль", number: 0 })),
      "23514",
    );
    // A failed insert takes its increment back with it: no gap.
    expect("the counter after two refused inserts", await counterOf(OLENA), 11);

    // 3. Never reused. The author's newest entry is deleted and then purged —
    // the row is gone, which is what ADR-0021's retention ends in.
    await pool.query(
      `delete from journal_entries where owner_user_id = $1 and author_entry_number = 11`,
      [OLENA],
    );
    expect(
      "max() + 1 would say eleven",
      (await pool.query(`select max(author_entry_number) + 1 as n from journal_entries where owner_user_id = $1`, [OLENA])).rows[0]?.n,
      11,
    );
    expect("the publish after a purge", await insertEntry(pool, { ...olenaRows, slug: "дванадцятий" }), 12);

    // 2. Concurrency. Two transactions publish for one author at once; the
    // second waits on the counter row and takes the next number.
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await second.query("begin");
      const held = await insertEntry(first, { ...yehorRows, slug: "паралельний-перший" });
      let secondSettled = false;
      const waiting = insertEntry(second, { ...yehorRows, slug: "паралельний-другий" }).then(
        (n) => {
          secondSettled = true;
          return n;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect("the second publish waits for the first", secondSettled, false);
      await first.query("commit");
      const followed = await waiting;
      await second.query("commit");
      expect("two concurrent publishes", [held, followed], [2, 3]);

      // And when the first one rolls back, the second takes its number: a
      // publish that failed leaves no hole in the author's count.
      await first.query("begin");
      await second.query("begin");
      const abandoned = await insertEntry(first, { ...yehorRows, slug: "відкочений" });
      const afterRollbackNumber = insertEntry(second, { ...yehorRows, slug: "після-відкату" });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("rollback");
      const taken = await afterRollbackNumber;
      await second.query("commit");
      expect("a rolled-back publish leaves no gap", [abandoned, taken], [4, 4]);
    } finally {
      first.release();
      second.release();
    }

    // The two reads the proxy decides a status from, against real rows.
    expect(
      "the lookup by handle and number",
      await getPublicJournalEntryLifecycleLookup(publicJournalEntryNumberKey(yehor, 1), db),
      {
        status: "active",
        publicSlug: "кратък-и-отговорен-запис-след",
        entryNumber: 1,
        addressHandle: yehor,
      },
    );
    expect(
      "a number the author has not reached",
      await getPublicJournalEntryLifecycleLookup(publicJournalEntryNumberKey(yehor, 99), db),
      { status: "not_found" },
    );
    expect(
      "the same number under the other author is another entry",
      (await getPublicJournalEntryLifecycleLookup(publicJournalEntryNumberKey(olena, 1), db)),
      { status: "active", publicSlug: "перший", entryNumber: 1, addressHandle: olena },
    );
    expect(
      "an older name resolves to the number, under its author",
      await resolveJournalEntryAddress("кратък-и-отговорен-запис-след", db, yehor),
      { handle: yehor, entryNumber: 1 },
    );
    expect(
      "and without a handle, as /journal/{slug} asks",
      await resolveJournalEntryAddress("кратък-и-отговорен-запис-след", db),
      { handle: yehor, entryNumber: 1 },
    );
    expect(
      "the same name under another gardener is nothing",
      await resolveJournalEntryAddress("кратък-и-отговорен-запис-след", db, olena),
      null,
    );
    expect(
      "a deleted entry says so at the name it was shared under",
      await getPublicJournalEntryLifecycleLookup(publicJournalEntryNameKey("видалений", olena), db),
      { status: "gone" },
    );

    // A renamed entry keeps its number: the address does not follow the name.
    await pool.query(
      `update journal_entries set public_slug = 'перейменований' where owner_user_id = $1 and author_entry_number = 1`,
      [YEHOR],
    );
    expect(
      "the old name still reaches the same number",
      await resolveJournalEntryAddress("кратък-и-отговорен-запис-след", db, yehor),
      { handle: yehor, entryNumber: 1 },
    );

    // Account erasure re-keys the entries to a synthetic owner with an UPDATE.
    // The trigger is `before insert`, so it does not fire, the numbers travel
    // with the rows, and the synthetic owner gets no counter of its own.
    await pool.query(
      `update journal_entries set owner_user_id = $2 where owner_user_id = $1`,
      [OLENA, ERASED_SUBJECT],
    );
    await pool.query(`delete from journal_entry_number_counters where owner_user_id = $1`, [OLENA]);
    expect(
      "erasure keeps the numbers and grows no counter",
      {
        numbers: (await numbersOf(ERASED_SUBJECT)).map((row) => row.n),
        counter: await counterOf(ERASED_SUBJECT),
        left: await counterOf(OLENA),
      },
      { numbers: [1, 2, 3, 4, 10, 12, null], counter: null, left: null },
    );

    return {
      schemaVersion: "overgarden.entryNumbersDatabaseProof.v1",
      status: failures.length === 0 ? "pass" : "fail",
      failures,
    };
  } finally {
    await db.destroy().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function main() {
  const receipt = await runEntryNumbersDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-entry-numbers-database.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
