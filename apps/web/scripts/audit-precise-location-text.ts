/**
 * OVE-234 — read-only precise-location audit.
 *
 * Reports counts, classifications, and row identifiers only. The scanned text
 * never leaves the process, so the output is safe to attach to an issue.
 */

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
  PRECISE_LOCATION_INVENTORY_SQL,
  PRECISE_LOCATION_SURFACE_KEYS,
  assertPreciseLocationInventorySqlIsSelectOnly,
  buildPreciseLocationInventoryReport,
  classifyPreciseLocationSurface,
  formatPreciseLocationInventoryReport,
  type PreciseLocationInventoryRow,
  type PreciseLocationSurfaceReport,
} from "../src/server/privacy/precise-location-inventory";

const envFile = argValue("--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });

const caFile = argValue("--ca-file");
if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

assertPreciseLocationInventorySqlIsSelectOnly();

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

async function main() {
  const surfaces: PreciseLocationSurfaceReport[] = [];

  for (const surface of PRECISE_LOCATION_SURFACE_KEYS) {
    const result = await pool.query<PreciseLocationInventoryRow>(
      PRECISE_LOCATION_INVENTORY_SQL[surface],
    );
    surfaces.push(classifyPreciseLocationSurface(surface, result.rows));
  }

  const report = buildPreciseLocationInventoryReport(surfaces);
  process.stdout.write(formatPreciseLocationInventoryReport(report));

  if (!report.clean && process.argv.includes("--fail-on-findings")) {
    process.exitCode = 1;
  }
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
