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
  buildLaunchCorpusCheckReport,
  buildLaunchCorpusPlanReport,
  LAUNCH_CORPUS_INVENTORY_SQL,
  type LaunchCorpusContentClassCount,
  type LaunchCorpusInventoryRows,
} from "../src/server/launch-corpus/inventory";
import { assertLocalCoverMatrixComplete } from "../src/lib/launch-corpus/cover-matrix";
import { tryResolveVisualFixtureEnvironment } from "../src/lib/visual-fixtures/environment";

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
assertLocalCoverMatrixComplete();

async function main() {
  const argv = process.argv.slice(2);
  const earlyEnvironment = readFlag(argv, "--environment");
  if (earlyEnvironment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }
  const environment = requireEnvironment(argv);
  const requireLaunchReady = argv.includes("--require-launch-ready");
  const baseUrl = readFlag(argv, "--base-url");

  if (environment === "production") {
    const fixtureEnv = tryResolveVisualFixtureEnvironment(process.env);
    if (fixtureEnv) {
      throw new Error(
        "Visual fixtures resolved in a production check environment — refuse.",
      );
    }
  }

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
    const plan = buildLaunchCorpusPlanReport({ environment, inventory });
    const report = buildLaunchCorpusCheckReport({
      environment,
      plan,
      requireLaunchReady,
    });

    const guestProbe =
      baseUrl && environment === "production"
        ? await probeGuestSurface(baseUrl)
        : null;

    console.log(
      JSON.stringify(
        {
          ok: report.ok && (guestProbe?.ok ?? true),
          environment,
          mode: "check",
          issue: "OVE-199",
          evidenceClass: "launch_corpus_check",
          report,
          guestProbe,
        },
        null,
        2,
      ),
    );

    if (!report.ok || (guestProbe && !guestProbe.ok)) {
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

async function probeGuestSurface(baseUrl: string): Promise<{
  ok: boolean;
  technicalLabelInHtml: boolean;
  englishEnumLeak: boolean;
}> {
  const url = new URL("/", baseUrl).toString();
  const response = await fetch(url, {
    headers: { accept: "text/html" },
    redirect: "follow",
  });
  const html = await response.text();
  const technicalLabelInHtml =
    /OVE-\d+|\bsmoke\b|\bfixture\b|\blorem\b|\bplaceholder\b/i.test(html);
  const englishEnumLeak = /\bPlants\b|\bAnimals\b|\bSpecies\b|\bBreeds\b/.test(
    html,
  );
  return {
    ok: response.ok && !technicalLabelInHtml && !englishEnumLeak,
    technicalLabelInHtml,
    englishEnumLeak,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
