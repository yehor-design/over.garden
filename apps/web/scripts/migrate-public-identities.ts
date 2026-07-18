/**
 * OVE-203 aggregate-only public identity migration and integrity proof.
 *
 * No CLI result contains an email, user id, public handle, display name,
 * rejected term, or raw profile row. Production apply requires an explicit
 * confirmation flag and must be followed by verify and rollback-proof.
 */

import { readFileSync } from "node:fs";

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
  applyPublicIdentityBackfill,
  createKyselyPublicIdentityMigrationStore,
  provePublicIdentityMigrationRollback,
  publicIdentityIntegrityReady,
} from "../src/server/public-identity-integrity";

type MigrationMode = "dry-run" | "apply" | "verify" | "rollback-proof";

interface CliOptions {
  mode: MigrationMode;
  envFile: string;
  caFile?: string;
  confirmApply: boolean;
}

const EVIDENCE_SAFETY =
  "aggregate_only_no_emails_user_ids_handles_display_names_terms_or_rows";

async function main() {
  let mode: MigrationMode | "unknown" = "unknown";
  let db: Kysely<Database> | undefined;

  try {
    const options = parseCliOptions(process.argv.slice(2));
    mode = options.mode;

    loadEnv({ path: options.envFile, override: false, quiet: true });
    if (options.caFile) {
      process.env.DATABASE_SSL_CA = readFileSync(options.caFile, "utf8");
    }

    if (options.mode === "apply" && !options.confirmApply) {
      throw new Error("Explicit apply confirmation is required.");
    }

    const resolution = resolveDatabaseConnection(process.env);
    const connectionString = resolvePgConnectionString(process.env, resolution);
    if (!connectionString) {
      throw new Error("Missing supported database connection env.");
    }

    const pool = new Pool({
      connectionString,
      max: 1,
      ssl: resolveDatabaseSslConfig(process.env, resolution),
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    const store = createKyselyPublicIdentityMigrationStore(db);

    if (options.mode === "dry-run") {
      const report = await store.collectReport();
      writeEvidence({
        ok: true,
        issue: "OVE-203",
        mode: options.mode,
        ready: publicIdentityIntegrityReady(report),
        report,
        evidenceSafety: EVIDENCE_SAFETY,
      });
      return;
    }

    if (options.mode === "apply") {
      const result = await applyPublicIdentityBackfill(store);
      writeEvidence({
        ok: true,
        issue: "OVE-203",
        mode: options.mode,
        ...result,
        evidenceSafety: EVIDENCE_SAFETY,
      });
      return;
    }

    if (options.mode === "rollback-proof") {
      const proof = await provePublicIdentityMigrationRollback(store);
      writeEvidence({
        ok: true,
        issue: "OVE-203",
        mode: options.mode,
        ...proof,
        evidenceSafety: EVIDENCE_SAFETY,
      });
      return;
    }

    const report = await store.collectReport();
    const ready = publicIdentityIntegrityReady(report);
    writeEvidence({
      ok: ready,
      issue: "OVE-203",
      mode: options.mode,
      ready,
      report,
      evidenceSafety: EVIDENCE_SAFETY,
    });

    if (!ready) {
      process.exitCode = 1;
    }
  } catch {
    writeEvidence({
      ok: false,
      issue: "OVE-203",
      mode,
      error: "public_identity_migration_failed",
      evidenceSafety: EVIDENCE_SAFETY,
    });
    process.exitCode = 1;
  } finally {
    try {
      await db?.destroy();
    } catch {
      // Do not allow a provider error to escape the aggregate-only boundary.
      process.exitCode = 1;
    }
  }
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  let mode: MigrationMode | undefined;
  let envFile = ".env.local";
  let caFile: string | undefined;
  let confirmApply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mode") {
      const value = requiredArgument(argv, index, arg);
      if (!isMigrationMode(value)) {
        throw new Error("Unsupported migration mode.");
      }
      mode = value;
      index += 1;
      continue;
    }

    if (arg === "--env-file") {
      envFile = requiredArgument(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--ca-file") {
      caFile = requiredArgument(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--confirm-apply") {
      confirmApply = true;
      continue;
    }

    throw new Error("Unsupported migration option.");
  }

  if (!mode) {
    throw new Error("Migration mode is required.");
  }

  return { mode, envFile, caFile, confirmApply };
}

function requiredArgument(
  argv: readonly string[],
  index: number,
  option: string,
): string {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing argument for ${option}.`);
  }

  return value;
}

function isMigrationMode(value: string): value is MigrationMode {
  return (
    value === "dry-run" ||
    value === "apply" ||
    value === "verify" ||
    value === "rollback-proof"
  );
}

function writeEvidence(value: object) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main();
