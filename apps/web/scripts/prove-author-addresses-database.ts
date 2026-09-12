/**
 * Executes migration `0070`, its rollback and its triggers instead of reading
 * them (OVE-428).
 *
 * The three things only running can show:
 *
 *   1. **The triggers close the old address and open the new one.** A slug that
 *      moves has to leave a history row behind with `valid_to` set, or the old
 *      address stops answering 308 and a published URL goes dead (ADR-0029 D8).
 *   2. **The migration replays.** It is the first one in this repository that
 *      adds a column and a constraint naming it in the same file, and the first
 *      draft had them in the wrong order — the `CHECK` ran before the column
 *      existed and every bootstrap failed with `42703`. A replay of every
 *      migration in order is what caught it.
 *   3. **The rollback really rolls back.** It drops two tables, two triggers,
 *      three functions, a column and a constraint; a `drop ... if exists` that
 *      names the wrong object succeeds silently and leaves the schema half
 *      undone.
 *
 * It builds its own disposable database and drops it, so it never writes to
 * the database whose connection string it borrows.
 */
import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { readFileSync } from "node:fs";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";

const MIGRATION = "0070_ove428_author_scoped_addresses.sql";
const ROLLBACK = "rollback/0070_ove428_author_scoped_addresses.down.sql";

const USER_ID = "00000000-0000-4000-8000-0000000004a0";
const SPACE_ID = "00000000-0000-4000-8000-0000000004a1";
const OBJECT_ID = "00000000-0000-4000-8000-0000000004a2";
const ENTRY_ID = "00000000-0000-4000-8000-0000000004a3";

async function seed(pool: Pool): Promise<string> {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Proof gardener', 'ove428-proof@example.test', true, now(), now())`,
    [USER_ID],
  );
  // A handle is claimed for every user at sign-up, and `user_public_profiles`
  // holds a foreign key to it, so the proof reads the handle it was given
  // rather than renaming it. What the addresses are named after is the point;
  // what the handle itself is is not.
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [USER_ID],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("author_addresses_proof_handle_missing");
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Proof space')`,
    [SPACE_ID, USER_ID],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Томат', 'plant', 'unknown')`,
    [OBJECT_ID, USER_ID, SPACE_ID],
  );
  await pool.query(
    `insert into journal_entries
       (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
        visibility, lifecycle_state, published_at, public_slug, source_language,
        client_mutation_id)
     values ($1, $2, $3, $4, 'Полив без календарної пастки', 'Текст запису.',
             'object', 'public', 'active', now(), 'polyv-old-slug', 'uk', $5)`,
    [ENTRY_ID, USER_ID, SPACE_ID, OBJECT_ID, `ove428-proof-${ENTRY_ID}`],
  );
  return handle;
}

export async function runAuthorAddressesDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const disposable = `overgarden_author_addresses_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  const failures: string[] = [];
  const expect = (name: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      failures.push(`${name}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
    }
  };

  try {
    const applicationSql = await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    );
    await pool.query(applicationSql[0]!.sql);
    const authOptions = {
      appName: "OverGarden",
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "ove428-disposable-proof-secret-value-not-a-credential",
      database: { db, type: "postgres", casing: "snake" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
    } satisfies BetterAuthOptions;
    betterAuth(authOptions);
    await (await getMigrations(authOptions)).runMigrations();
    for (const migration of applicationSql) {
      await pool.query(migration.sql);
    }

    // 2. Replay: every migration again, in order, on a schema that has them.
    for (const migration of applicationSql) {
      await pool.query(migration.sql);
    }

    const handle = await seed(pool);

    // 1. The triggers. The insert wrote the first history row; moving the slug
    // must close it and open the next.
    const opened = await pool.query(
      `select author_handle, slug, valid_to is null as open
       from journal_entry_slug_history where journal_entry_id = $1`,
      [ENTRY_ID],
    );
    expect("history after insert", opened.rows, [
      { author_handle: handle, slug: "polyv-old-slug", open: true },
    ]);

    await pool.query(
      `update journal_entries set public_slug = 'полив-без-календарної-пастки' where id = $1`,
      [ENTRY_ID],
    );
    const moved = await pool.query(
      `select slug, valid_to is null as open
       from journal_entry_slug_history where journal_entry_id = $1 order by slug`,
      [ENTRY_ID],
    );
    expect("history after a move", moved.rows, [
      { slug: "polyv-old-slug", open: false },
      { slug: "полив-без-календарної-пастки", open: true },
    ]);

    await pool.query(
      `update plant_objects set public_slug = 'томат' where id = $1`,
      [OBJECT_ID],
    );
    const passport = await pool.query(
      `select author_handle, slug, valid_to is null as open
       from plant_object_slug_history where plant_object_id = $1`,
      [OBJECT_ID],
    );
    expect("passport history", passport.rows, [
      { author_handle: handle, slug: "томат", open: true },
    ]);

    // The passport slug is unique per gardener, so a second object may not
    // take a name the first already has.
    const duplicate = await pool
      .query(
        `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state, public_slug)
         values (gen_random_uuid(), $1, $2, 'Томат', 'plant', 'unknown', 'томат')`,
        [USER_ID, SPACE_ID],
      )
      .then(() => "accepted")
      .catch((error: unknown) => (error as { code?: string }).code ?? "unknown");
    expect("a second passport with the same name", duplicate, "23505");

    // And the CHECK refuses a shape the slugifier cannot produce.
    const malformed = await pool
      .query(
        `update plant_objects set public_slug = 'Томат' where id = $1`,
        [OBJECT_ID],
      )
      .then(() => "accepted")
      .catch((error: unknown) => (error as { code?: string }).code ?? "unknown");
    expect("an upper-case passport slug", malformed, "23514");

    // 3. The rollback, then forward again.
    await pool.query(readFileSync(path.join(process.cwd(), "sql", ROLLBACK), "utf8"));
    const afterRollback = await pool.query(
      `select
         to_regclass('journal_entry_slug_history') is null as history_gone,
         to_regclass('plant_object_slug_history') is null as passport_history_gone,
         not exists (
           select 1 from information_schema.columns
           where table_name = 'plant_objects' and column_name = 'public_slug'
         ) as column_gone`,
    );
    expect("rollback", afterRollback.rows[0], {
      history_gone: true,
      passport_history_gone: true,
      column_gone: true,
    });

    await pool.query(readFileSync(path.join(process.cwd(), "sql", MIGRATION), "utf8"));
    const afterReplay = await pool.query(
      `select to_regclass('journal_entry_slug_history') is not null as history_back,
              count(*)::int as rows
       from journal_entry_slug_history`,
    );
    expect("forward again", afterReplay.rows[0]?.history_back, true);

    return {
      schemaVersion: "overgarden.authorAddressesDatabaseProof.v1",
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
  const receipt = await runAuthorAddressesDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-author-addresses-database.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
