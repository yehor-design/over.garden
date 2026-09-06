import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";

/**
 * Executed proof of migration 0063 (OVE-391, ADR-0026 D10): the auth email
 * outbox carries the owner's weekly catalog digest beside the password reset
 * it was built for.
 *
 * `0015` keyed every row to a `verification` row and pinned the kind to one
 * value, so the shape of the two messages is the whole risk: a digest with no
 * verification, a reset with no payload, and never two unsent digests for one
 * owner. A compile-only test cannot see a CHECK; these statements run.
 *
 *   pnpm schema:owner-digest:prove-database
 */
const MIGRATION = "0063";
const BETTER_AUTH_SCHEMA = `
  create table "user" (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null unique,
    "emailVerified" boolean not null,
    image text,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null default current_timestamp
  );
  create table "session" (
    id uuid primary key default gen_random_uuid(),
    "expiresAt" timestamptz not null,
    token text not null unique,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null,
    "ipAddress" text,
    "userAgent" text,
    "userId" uuid not null references "user"(id) on delete cascade
  );
  create table "account" (
    id uuid primary key default gen_random_uuid(),
    "accountId" text not null,
    "providerId" text not null,
    "userId" uuid not null references "user"(id) on delete cascade,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    scope text,
    password text,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null default current_timestamp
  );
  create table "verification" (
    id uuid primary key default gen_random_uuid(),
    identifier text not null,
    value text not null,
    "expiresAt" timestamptz not null,
    "createdAt" timestamptz default current_timestamp,
    "updatedAt" timestamptz default current_timestamp
  );
`;

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const disposable = `overgarden_ove391_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  pool.on("error", () => undefined);

  try {
    await pool.query(BETTER_AUTH_SCHEMA);
    for (const migration of await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    )) {
      await pool.query(migration.sql);
    }

    const owner = (
      await pool.query<{ id: string }>(
        `insert into "user" (name, email, "emailVerified") values ('ove391 owner', $1, true) returning id`,
        [`ove391-${disposable.slice(-8)}@example.test`],
      )
    ).rows[0]!.id;

    const digest = await pool.query<{ id: string }>(
      `insert into auth_email_outbox (kind, payload, recipient_user_id)
       values ('owner_catalog_digest', $1::jsonb, $2) returning id`,
      [JSON.stringify({ openItems: 3, withObjects: 2 }), owner],
    );

    const refused: string[] = [];
    const attempts: Array<[string, string, unknown[]]> = [
      [
        "digest_without_payload",
        `insert into auth_email_outbox (kind, recipient_user_id) values ('owner_catalog_digest', $1)`,
        [owner],
      ],
      [
        "digest_without_recipient",
        `insert into auth_email_outbox (kind, payload) values ('owner_catalog_digest', '{}'::jsonb)`,
        [],
      ],
      [
        "second_unsent_digest_for_one_owner",
        `insert into auth_email_outbox (kind, payload, recipient_user_id) values ('owner_catalog_digest', '{}'::jsonb, $1)`,
        [owner],
      ],
      [
        "reset_carrying_a_payload",
        `insert into auth_email_outbox (kind, payload) values ('password_reset', '{}'::jsonb)`,
        [],
      ],
      [
        "unknown_kind",
        `insert into auth_email_outbox (kind, payload, recipient_user_id) values ('newsletter', '{}'::jsonb, $1)`,
        [owner],
      ],
    ];
    for (const [label, statement, parameters] of attempts) {
      try {
        await pool.query(statement, parameters);
        throw new Error(`Constraint did not refuse ${label}.`);
      } catch (reason) {
        if (reason instanceof Error && reason.message.startsWith("Constraint did not")) {
          throw reason;
        }
        refused.push(label);
      }
    }

    // A delivered digest frees the slot for next week's run.
    await pool.query(
      `update auth_email_outbox set state = 'sent', terminalized_at = now(), sent_at = now() where id = $1`,
      [digest.rows[0]!.id],
    );
    const second = await pool.query(
      `insert into auth_email_outbox (kind, payload, recipient_user_id)
       values ('owner_catalog_digest', '{"openItems":1}'::jsonb, $1) returning id`,
      [owner],
    );

    // A password reset still works exactly as 0015 wrote it.
    const verification = (
      await pool.query<{ id: string }>(
        `insert into verification (identifier, value, "expiresAt")
         values ('reset-password:ove391', $1, now() + interval '1 hour') returning id`,
        [owner],
      )
    ).rows[0]!.id;
    const reset = await pool.query(
      `insert into auth_email_outbox (verification_id) values ($1) returning id, kind`,
      [verification],
    );

    const rollbackSql = readFileSync(
      path.join(process.cwd(), "sql", "rollback", `${MIGRATION}_ove391_owner_catalog_digest_outbox.down.sql`),
      "utf8",
    );
    await pool.query(rollbackSql);
    const afterRollback = (
      await pool.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
         where table_name = 'auth_email_outbox'
           and column_name in ('payload', 'recipient_user_id', 'verification_id')
         order by column_name`,
      )
    ).rows;
    const resetSurvived = (
      await pool.query<{ n: number }>(
        `select count(*)::int as n from auth_email_outbox where kind = 'password_reset'`,
      )
    ).rows[0]!.n;

    const migrationSql = readFileSync(
      path.join(process.cwd(), "sql", `${MIGRATION}_ove391_owner_catalog_digest_outbox.sql`),
      "utf8",
    );
    await pool.query(migrationSql);
    await pool.query(migrationSql);

    console.log(
      JSON.stringify({
        ok: true,
        migration: MIGRATION,
        digestEnqueued: digest.rows.length === 1,
        refused,
        slotFreedAfterDelivery: second.rows.length === 1,
        passwordResetUnchanged: reset.rows[0]?.kind === "password_reset",
        afterRollback,
        resetSurvivedRollback: resetSurvived,
        reappliedAndReplayed: true,
      }),
    );
  } finally {
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason);
  process.exit(1);
});
