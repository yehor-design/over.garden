/**
 * Marks a local development account's email as verified.
 *
 * Local only, and it says so in code: `assertLoopbackDatabaseEnvironment`
 * refuses any DSN that is not loopback, so this cannot touch production no
 * matter which env file is loaded. Sign-up over the API writes the user and
 * the credential row but leaves `emailVerified` false — the verification mail
 * needs a `RESEND_API_KEY` the scratch database's environment has not got.
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
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
  const email = valueFor(process.argv.slice(2), "--email");
  if (!email) throw new Error("--email is required");
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("local_database_url_missing");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const result = await sql<{ id: string }>`
      update "user" set "emailVerified" = true where email = ${email}
      returning id
    `.execute(db);
    console.log(JSON.stringify({ verified: result.rows }, null, 1));
  } finally {
    await db.destroy().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
