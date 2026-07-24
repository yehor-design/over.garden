/**
 * OVE-201 restore readiness smoke (recovery-drill).
 * Connects only to a disposable fork DATABASE_URL. Never targets production.
 * Evidence: booleans, counts, hashes, durations — no credentials or private content.
 */

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  assertRestoreTargetGate,
  buildRestoreReadinessReport,
  hostnameFromDatabaseUrl,
  RESTORE_READINESS_POLICY,
} from "../src/server/restore-readiness";

loadEnv({ path: ".env.local", override: false });

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function parseMsFlag(argv: string[], name: string): number | null {
  const raw = readFlag(argv, name);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number of milliseconds.`);
  }
  return Math.trunc(n);
}

async function main() {
  const argv = process.argv.slice(2);
  const environment = readFlag(argv, "--environment");
  const confirmEnvironment = readFlag(argv, "--confirm-environment");
  const confirmClusterId = readFlag(argv, "--confirm-cluster-id");
  const productionClusterId = readFlag(argv, "--production-cluster-id");
  const disposableClusterName = readFlag(argv, "--disposable-cluster-name");

  if (
    !environment ||
    !confirmEnvironment ||
    !confirmClusterId ||
    !productionClusterId ||
    !disposableClusterName
  ) {
    throw new Error(
      "Required: --environment recovery-drill --confirm-environment recovery-drill --confirm-cluster-id <uuid> --production-cluster-id <uuid> --disposable-cluster-name overgarden-pitr-drill-YYYYMMDD",
    );
  }

  process.env.DATABASE_SSL = process.env.DATABASE_SSL ?? "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL for recovery-drill.");
  }

  const hostname = hostnameFromDatabaseUrl(connectionString);
  const gate = assertRestoreTargetGate({
    environment,
    confirmEnvironment,
    confirmClusterId,
    productionClusterId,
    disposableClusterName,
    databaseUrlHostname: hostname,
    requireSslCa: environment === "recovery-drill",
    hasSslCa: Boolean(process.env.DATABASE_SSL_CA?.trim()),
  });

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    const report = await buildRestoreReadinessReport(db, {
      actualRpoMs: parseMsFlag(argv, "--actual-rpo-ms"),
      actualRtoMs: parseMsFlag(argv, "--actual-rto-ms"),
    });

    console.log(
      JSON.stringify(
        {
          ok: report.ok,
          environment: gate.environment,
          issue: "OVE-201",
          evidenceClass: "managed-restore-readiness",
          policyVersion: RESTORE_READINESS_POLICY,
          confirmClusterIdClass: "uuid_confirmed_non_production",
          disposableClusterNameClass: gate.disposableClusterName,
          hostnameClass: hostname.includes("ondigitalocean.com")
            ? "managed_digitalocean_host"
            : "other_host",
          report,
        },
        null,
        2,
      ),
    );

    if (!report.ok) {
      process.exitCode = 2;
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "restore readiness smoke failed",
  );
  process.exitCode = 1;
});
