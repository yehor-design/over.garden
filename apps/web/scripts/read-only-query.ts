/**
 * Runs one read-only, bounded SQL statement and prints its rows.
 *
 * Every statement runs inside `begin read only` with a statement timeout: one
 * unbounded read once held this managed database at 100% for seven hours and
 * paged the owner.
 *
 *   pnpm exec tsx scripts/read-only-query.ts --env-file /abs/prod.env --sql "select 1"
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

function valueFor(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const envFile = valueFor(argv, "--env-file");
  const statement = valueFor(argv, "--sql");
  if (!statement) throw new Error("--sql is required");
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant)\b/iu.test(statement)) {
    throw new Error("This runner reads. Write with a reviewed migration.");
  }
  if (envFile) loadEnv({ path: envFile, override: true });
  else loadEnv({ path: ".env.local", quiet: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("read_only_query_database_url_missing");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
    connectionTimeoutMillis: 15_000,
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await db.connection().execute(async (connection) => {
      await sql`begin read only`.execute(connection);
      await sql`set local statement_timeout = '30s'`.execute(connection);
      const result = await sql.raw(statement).execute(connection);
      console.log(JSON.stringify(result.rows, null, 1));
      await sql`rollback`.execute(connection);
    });
  } finally {
    await db.destroy().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
