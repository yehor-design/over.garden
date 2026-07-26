/**
 * OVE-225 — read-only inventory of existing `job_queue` journal payloads.
 *
 * Reports counts and reason classes only. It never selects, prints, or stores a
 * payload value, and it executes no statement other than the select-only
 * inventory query. Promoting either new CHECK constraint from `not valid` to
 * `validate constraint` is a separate maintainer-gated step; this command
 * produces the approval artifact for that decision and nothing else.
 *
 * Usage:
 *   pnpm exec tsx scripts/inventory-job-queue-payloads.ts \
 *     --environment production --confirm-environment production
 *
 * Flags: --environment, --confirm-environment, --dry-run, --timeout-ms,
 *        --env-file, --ca-file.
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
  assertJobQueueInventorySqlIsSelectOnly,
  buildJobQueueInventoryReport,
  formatJobQueueInventoryReport,
  JOB_QUEUE_PAYLOAD_INVENTORY_SQL,
  runWithDeadline,
  type JobQueueInventoryRow,
} from "../src/server/job-queue-payload-inventory";

const DEFAULT_TIMEOUT_MS = 30_000;

const envFile = argValue("--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });

const caFile = argValue("--ca-file");
if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

const environment = argValue("--environment") ?? "local";
const confirmedEnvironment = argValue("--confirm-environment");
const dryRun = process.argv.includes("--dry-run");
const timeoutMs = Number(argValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

if (environment !== "local" && confirmedEnvironment !== environment) {
  refuse(
    `Refusing to run against ${environment} without --confirm-environment ${environment}`,
  );
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  refuse("--timeout-ms must be a positive number of milliseconds");
}

assertJobQueueInventorySqlIsSelectOnly();

if (dryRun) {
  console.log(
    [
      "OVE-225 job_queue journal payload inventory — dry run, no query executed",
      `environment=${environment} timeout_ms=${timeoutMs}`,
      "planned statement: select-only aggregate over job_queue journal kinds",
      "planned output: counts and reason classes only, no payload values",
    ].join("\n"),
  );
  process.exit(0);
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
  statement_timeout: timeoutMs,
});

async function main() {
  const outcome = await runWithDeadline(
    () =>
      pool.query<{ kind: string; reason_class: string; row_count: string }>(
        JOB_QUEUE_PAYLOAD_INVENTORY_SQL,
      ),
    timeoutMs,
  );

  if (outcome.status === "timed_out") {
    console.error(
      [
        "OVE-225 job_queue journal payload inventory: timed out",
        `environment=${environment} timeout_ms=${outcome.timeoutMs}`,
        "no counts observed; rerun with a larger --timeout-ms",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const rows: JobQueueInventoryRow[] = outcome.value.rows.map((row) => ({
    kind: row.kind,
    reasonClass: row.reason_class,
    rowCount: Number(row.row_count),
  }));

  const report = buildJobQueueInventoryReport(rows);
  console.log(
    formatJobQueueInventoryReport(report, { environment, dryRun, timeoutMs }),
  );

  if (report.violations !== 0) {
    process.exitCode = 1;
  }
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  return process.argv[index + 1];
}

main()
  .finally(async () => {
    await pool.end();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
