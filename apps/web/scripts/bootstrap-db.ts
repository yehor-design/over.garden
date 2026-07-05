import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

const envFile = argValue("--env-file") ?? ".env.local";
const caFile = argValue("--ca-file");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

loadEnv({ path: envFile });

if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);

if (!connectionString) {
  throw new Error("Missing supported database connection env");
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: resolveDatabaseSslConfig(process.env, resolution),
});
const db = new Kysely({ dialect: new PostgresDialect({ pool }) });

const authOptions = {
  appName: "OverGarden",
  baseURL:
    process.env.BETTER_AUTH_URL ??
    process.env.PUBLIC_SITE_URL ??
    "http://localhost:3000",
  basePath: "/api/auth",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "migration-only-overgarden-better-auth-secret",
  database: {
    db,
    type: "postgres",
    casing: "snake",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  advanced: {
    cookiePrefix: "overgarden",
    database: {
      generateId: "uuid",
    },
  },
} satisfies BetterAuthOptions;

async function main() {
  const appSql = await readFile(
    path.join(scriptDir, "..", "sql/0001_walking_skeleton.sql"),
    "utf8",
  );
  await pool.query(appSql);

  betterAuth(authOptions);
  const migrations = await getMigrations(authOptions);
  await migrations.runMigrations();

  // Re-run idempotent app SQL so app-owned tables can attach optional FKs to
  // Better Auth tables on a fresh database after Better Auth creates them.
  await pool.query(appSql);

  console.log("Database bootstrap complete.");
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  return process.argv[index + 1];
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
