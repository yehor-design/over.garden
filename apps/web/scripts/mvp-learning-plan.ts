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
  assertMvpLearningInventorySqlIsSelectOnly,
  buildMvpLearningPlanReport,
  MVP_LEARNING_INVENTORY_SQL,
} from "../src/server/mvp-learning/plan";
import {
  EDITORIAL_SEED_ACTOR_CLASS,
  REAL_CLOSED_PILOT_ACTOR_CLASS,
  REAL_SELF_SERVE_ACTOR_CLASS,
} from "../src/lib/garden/actor-class";

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
  return environment as "local" | "production";
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function argValue(name: string): string | null {
  return readFlag(process.argv.slice(2), name);
}

assertMvpLearningInventorySqlIsSelectOnly();

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
    const inventoryResult = await pool.query(MVP_LEARNING_INVENTORY_SQL);
    const legacyEventRemaps = [];
    for (const pair of [
      { from: "self_serve", to: REAL_SELF_SERVE_ACTOR_CLASS },
      { from: "closed_pilot", to: REAL_CLOSED_PILOT_ACTOR_CLASS },
      { from: "editorial", to: EDITORIAL_SEED_ACTOR_CLASS },
    ] as const) {
      const result = await pool.query(
        `select count(*)::int as events from analytics_events where properties ->> 'actor_class' = $1`,
        [pair.from],
      );
      legacyEventRemaps.push({
        from: pair.from,
        to: pair.to,
        events: Number(result.rows[0]?.events ?? 0),
      });
    }

    const report = buildMvpLearningPlanReport({
      environment,
      inventory: inventoryResult.rows,
      legacyEventRemaps,
    });
    console.log(
      JSON.stringify({ ok: true, issue: "OVE-200", report }, null, 2),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "mvp-learning plan failed",
  );
  process.exitCode = 1;
});
