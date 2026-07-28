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
import {
  assertProviderBinding,
  DigitalOceanDatabaseProvider,
} from "../src/server/restore-readiness";

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
  const recoveryMode = Boolean(argValue("--environment"));
  await assertRecoveryTargetBeforeAccess();
  await pool.query("set statement_timeout = '10min'");
  await pool.query("set lock_timeout = '30s'");
  const before = recoveryMode ? await collectProtectedRowCounts() : null;
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

  const after = recoveryMode ? await collectProtectedRowCounts() : null;
  if (recoveryMode && JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      "Recovery bootstrap changed protected restored-row aggregates.",
    );
  }

  console.log(
    recoveryMode
      ? "Database bootstrap complete (provider-bound disposable target; protected aggregates unchanged)."
      : "Database bootstrap complete.",
  );
}

async function assertRecoveryTargetBeforeAccess() {
  const environment = argValue("--environment");
  if (!environment) return;
  if (
    environment !== "recovery-drill" ||
    argValue("--confirm-environment") !== environment
  ) {
    throw new Error(
      "Recovery bootstrap requires matching recovery-drill confirmation.",
    );
  }
  const clusterId = requiredArg("--recovery-cluster-id");
  const productionId = requiredArg("--production-cluster-id");
  const clusterName = requiredArg("--recovery-cluster-name");
  const engine = requiredArg("--recovery-engine");
  const region = requiredArg("--recovery-region");
  const provider = new DigitalOceanDatabaseProvider();
  const cluster = await provider.getCluster(clusterId);
  const host = await provider.getHost(clusterId);
  assertProviderBinding({
    provider: cluster,
    expectedId: clusterId,
    expectedName: clusterName,
    expectedEngine: engine,
    expectedRegion: region,
    providerHost: host,
    databaseUrl: connectionString!,
    productionId,
    ca: process.env.DATABASE_SSL_CA ?? "",
  });
}

async function collectProtectedRowCounts() {
  const result = await pool.query<{
    auth_users: string;
    journal_entries: string;
    media_assets: string;
    plant_objects: string;
  }>(`
    select
      case when to_regclass('public.user') is null then 0 else (select count(*) from "user") end::text as auth_users,
      case when to_regclass('public.journal_entries') is null then 0 else (select count(*) from journal_entries) end::text as journal_entries,
      case when to_regclass('public.media_assets') is null then 0 else (select count(*) from media_assets) end::text as media_assets,
      case when to_regclass('public.plant_objects') is null then 0 else (select count(*) from plant_objects) end::text as plant_objects
  `);
  return result.rows[0];
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  return process.argv[index + 1];
}

function requiredArg(name: string): string {
  const value = argValue(name);
  if (!value) throw new Error(`${name} is required for recovery bootstrap.`);
  return value;
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
