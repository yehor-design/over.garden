import { readFileSync } from "node:fs";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  assertLaunchCorpusInventorySqlIsSelectOnly,
  buildLaunchCorpusPlanReport,
  LAUNCH_CORPUS_INVENTORY_SQL,
  type LaunchCorpusContentClassCount,
  type LaunchCorpusInventoryRows,
} from "../src/server/launch-corpus/inventory";

const envFile = argValue("--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });

const caFile = argValue("--ca-file");
if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function argValue(name: string): string | null {
  return readFlag(process.argv.slice(2), name);
}

assertLaunchCorpusInventorySqlIsSelectOnly();

async function main() {
  const argv = process.argv.slice(2);
  const earlyEnvironment = readFlag(argv, "--environment");
  if (earlyEnvironment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }
  const environment = requireEnvironment(argv);

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) {
    throw new Error("Missing supported database connection env (DATABASE_URL)");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  try {
    const inventory = await loadInventory(pool);
    const report = buildLaunchCorpusPlanReport({ environment, inventory });
    console.log(
      JSON.stringify(
        {
          ok: true,
          environment,
          mode: "plan",
          issue: "OVE-199",
          evidenceClass: "launch_corpus_plan",
          report,
        },
        null,
        2,
      ),
    );
    if (!report.launchReady && environment === "production") {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

async function loadInventory(pool: Pool): Promise<LaunchCorpusInventoryRows> {
  const contentClassCounts = await queryClassCounts(
    pool,
    LAUNCH_CORPUS_INVENTORY_SQL.contentClassCounts,
  );
  const publicActiveByClass = await queryClassCounts(
    pool,
    LAUNCH_CORPUS_INVENTORY_SQL.publicActiveByClass,
  );

  return {
    contentClassCounts,
    publicActiveByClass,
    publicActiveTargetIds: await queryIds(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.publicActiveTargets,
    ),
    technicalLabelHits: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.technicalLabelHits,
    ),
    tinyPlaceholderMediaHits: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.tinyPlaceholderMediaHits,
    ),
    visualFixtureMutationHits: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.visualFixtureMutationHits,
    ),
    missingSourceLanguageOnFounderPublic: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.missingSourceLanguageOnFounderPublic,
    ),
    archivedWithPublicSlug: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.archivedWithPublicSlug,
    ),
    privateActive: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.privateActive,
    ),
    publicActiveCount: await queryCount(
      pool,
      LAUNCH_CORPUS_INVENTORY_SQL.publicActiveCount,
    ),
  };
}

async function queryIds(pool: Pool, sql: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(sql);
  return result.rows.map((row) => row.id);
}

async function queryClassCounts(
  pool: Pool,
  sql: string,
): Promise<LaunchCorpusContentClassCount[]> {
  const result = await pool.query<{ contentClass: string; count: string }>(sql);
  return result.rows.map((row) => ({
    contentClass: row.contentClass,
    count: Number(row.count),
  }));
}

async function queryCount(pool: Pool, sql: string): Promise<number> {
  const result = await pool.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
