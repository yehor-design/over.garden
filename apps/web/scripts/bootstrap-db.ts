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
import {
  classifyProtectedIdentityTransition,
  ERASED_MODERATION_ACTOR_USER_ID,
  ProtectedIdentityTransitionError,
} from "../src/server/restore-readiness/runtime";

const envFile = argValue("--env-file") ?? ".env.local";
const caFile = argValue("--ca-file");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const recoveryEnvironment = argValue("--environment");
let recoveryBootstrapStage = "initializing";

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
  const recoveryMode = Boolean(recoveryEnvironment);
  recoveryBootstrapStage = "provider_binding";
  await assertRecoveryTargetBeforeAccess();
  recoveryBootstrapStage = "timeout_policy";
  await pool.query("set statement_timeout = '10min'");
  await pool.query("set lock_timeout = '30s'");
  recoveryBootstrapStage = "protected_identity_before";
  const before = recoveryMode ? await collectProtectedIdentitySnapshot() : null;
  recoveryBootstrapStage = "application_schema";
  const appSql = await readFile(
    path.join(scriptDir, "..", "sql/0001_walking_skeleton.sql"),
    "utf8",
  );
  await pool.query(appSql);

  recoveryBootstrapStage = "better_auth_schema";
  betterAuth(authOptions);
  const migrations = await getMigrations(authOptions);
  await migrations.runMigrations();

  // Re-run idempotent app SQL so app-owned tables can attach optional FKs to
  // Better Auth tables on a fresh database after Better Auth creates them.
  recoveryBootstrapStage = "application_schema_reconcile";
  await pool.query(appSql);

  recoveryBootstrapStage = "protected_identity_after";
  const after = recoveryMode ? await collectProtectedIdentitySnapshot() : null;
  if (before && after) {
    recoveryBootstrapStage = "protected_identity_validation";
    await assertProtectedIdentityTransition(before, after);
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

interface ProtectedIdentitySnapshot {
  authUsers: Set<string>;
  journalEntries: Set<string>;
  mediaAssets: Set<string>;
  plantObjects: Set<string>;
}

async function collectProtectedIdentitySnapshot(): Promise<ProtectedIdentitySnapshot> {
  const [authUsers, journalEntries, mediaAssets, plantObjects] =
    await Promise.all([
      pool.query<{ id: string }>('select id::text as id from "user"'),
      pool.query<{ id: string }>("select id::text as id from journal_entries"),
      pool.query<{ id: string }>("select id::text as id from media_assets"),
      pool.query<{ id: string }>("select id::text as id from plant_objects"),
    ]);
  return {
    authUsers: new Set(authUsers.rows.map((row) => row.id)),
    journalEntries: new Set(journalEntries.rows.map((row) => row.id)),
    mediaAssets: new Set(mediaAssets.rows.map((row) => row.id)),
    plantObjects: new Set(plantObjects.rows.map((row) => row.id)),
  };
}

async function assertProtectedIdentityTransition(
  before: ProtectedIdentitySnapshot,
  after: ProtectedIdentitySnapshot,
) {
  const { addedAuthUsers, addedPlants } = classifyProtectedIdentityTransition(
    before,
    after,
  );

  if (addedAuthUsers.length > 0) {
    const classified = await pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from "user" auth_user
        where auth_user.id = $1::uuid
          and auth_user.name = 'Erased moderation actor'
          and auth_user.email = 'erased-moderation-actor@invalid.local'
          and auth_user."emailVerified" = false
          and not exists (
            select 1 from user_public_profiles profile
            where profile.user_id = auth_user.id
          )
          and not exists (
            select 1 from user_handle_registry registry
            where registry.user_id = auth_user.id
          )
      `,
      [ERASED_MODERATION_ACTOR_USER_ID],
    );
    if (Number(classified.rows[0]?.count ?? -1) !== 1) {
      throw new ProtectedIdentityTransitionError("AUTH_DRIFT");
    }
  }

  if (addedPlants.length === 0) return;

  const classified = await pool.query<{ count: string }>(
    `
      select count(distinct plant.id)::text as count
      from plant_objects plant
      where plant.id = any($1::uuid[])
        and plant.display_name = 'Skeleton plant'
        and exists (
          select 1
          from journal_entries journal
          where journal.id = any($2::uuid[])
            and journal.plant_object_id = plant.id
            and journal.owner_user_id = plant.owner_user_id
            and journal.space_id = plant.space_id
        )
    `,
    [addedPlants, [...before.journalEntries]],
  );
  if (Number(classified.rows[0]?.count ?? -1) !== addedPlants.length) {
    throw new ProtectedIdentityTransitionError("PLANT_UNCLASSIFIED");
  }
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
    if (recoveryEnvironment) {
      const providerCode = (error as { code?: unknown })?.code;
      const errorCode =
        typeof providerCode === "string" &&
        /^[A-Z0-9_]{2,24}$/.test(providerCode)
          ? providerCode
          : "UNCLASSIFIED";
      console.error(JSON.stringify({ recoveryBootstrapStage, errorCode }));
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  });
