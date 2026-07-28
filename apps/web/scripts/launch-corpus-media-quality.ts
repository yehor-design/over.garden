import { Pool } from "pg";

import { LAUNCH_MEDIA_QUALITY_POLICY_VERSION } from "@/lib/media/launch-media-quality";
import {
  LAUNCH_CORPUS_INVENTORY_SQL,
  assertLaunchCorpusInventorySqlIsSelectOnly,
} from "@/server/launch-corpus/inventory";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

type Environment = "local" | "production";

const argv = process.argv.slice(2);
const environment = readEnvironment(argv);
if (readFlag(argv, "--confirm-environment") !== environment) {
  throw new Error("Environment confirmation does not match.");
}
if (readFlag(argv, "--mode") !== "inventory") {
  throw new Error("Only SELECT-only inventory mode is supported.");
}
if (environment === "production" && !process.env.DATABASE_SSL) {
  process.env.DATABASE_SSL = "true";
}

assertLaunchCorpusInventorySqlIsSelectOnly();

async function main() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("Missing supported database connection.");
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  try {
    const result = await pool.query<{ qualityClass: string; count: string }>(
      LAUNCH_CORPUS_INVENTORY_SQL.launchMediaQualityCounts,
    );
    const counts = Object.fromEntries(
      result.rows.map((row) => [row.qualityClass, Number(row.count)]),
    );
    console.log(
      JSON.stringify({
        ok: true,
        issue: "OVE-231",
        environment,
        mode: "inventory",
        redacted: true,
        selectOnly: true,
        providerObjectReads: 0,
        policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
        counts,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function readEnvironment(input: string[]): Environment {
  const value = readFlag(input, "--environment");
  if (value !== "local" && value !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return value;
}

function readFlag(input: string[], name: string): string | null {
  const index = input.indexOf(name);
  return index < 0 ? null : (input[index + 1] ?? null);
}
