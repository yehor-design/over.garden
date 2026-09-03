import "./neutralise-server-only";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

/**
 * Applies one reviewed migration from `sql/` inside a single transaction and
 * prints a structural receipt (ADR-0022, owner decision of 2026-09-03: the
 * owner applies migrations without a plan-digest ceremony).
 *
 * Boundaries that stay deliberate:
 *
 *   * `--mode verify` (default) only connects and names the database class;
 *     applying requires `--mode apply`.
 *   * The file is resolved by its four-digit number inside the repository's
 *     `sql/` directory, never inlined, so what runs is what git reviewed.
 *   * `apply` refuses every host class except the managed production instance
 *     unless `--allow-host-class loopback` names a local database explicitly.
 *   * The whole file runs in one transaction; any error rolls it back.
 *   * Output is structural: migration name, host class, database name, the
 *     number of statements, and the elapsed time. Never a value, a row, or the
 *     connection string.
 */
export const APPLY_MODES = ["verify", "apply"] as const;
export type ApplyMode = (typeof APPLY_MODES)[number];
export const HOST_CLASSES = [
  "digitalocean_managed",
  "loopback",
  "other",
] as const;
export type HostClass = (typeof HOST_CLASSES)[number];

export interface ReviewedMigrationArgs {
  mode: ApplyMode;
  migration: string;
  envFile: string | undefined;
  allowHostClass: HostClass;
}

export function parseReviewedMigrationArgs(
  argv: readonly string[],
): ReviewedMigrationArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const mode = valueFor("--mode") ?? "verify";
  if (!(APPLY_MODES as readonly string[]).includes(mode)) {
    throw new Error("apply_mode_invalid");
  }
  const migration = valueFor("--migration");
  if (!migration || !/^\d{4}$/.test(migration)) {
    throw new Error("apply_migration_number_required");
  }
  const allowHostClass =
    valueFor("--allow-host-class") ?? "digitalocean_managed";
  if (!(HOST_CLASSES as readonly string[]).includes(allowHostClass)) {
    throw new Error("apply_host_class_invalid");
  }
  return {
    mode: mode as ApplyMode,
    migration,
    envFile: valueFor("--env-file"),
    allowHostClass: allowHostClass as HostClass,
  };
}

export function classifyDatabaseHost(hostname: string): HostClass {
  if (/\.ondigitalocean\.com$/i.test(hostname)) return "digitalocean_managed";
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return "loopback";
  }
  return "other";
}

export function resolveMigrationFile(sqlDirectory: string, number: string) {
  const matches = readdirSync(sqlDirectory).filter(
    (name) => name.startsWith(`${number}_`) && name.endsWith(".sql"),
  );
  if (matches.length !== 1) throw new Error("apply_migration_not_unique");
  return path.join(sqlDirectory, matches[0]!);
}

export function countStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .filter((part) => part.trim().length > 0).length;
}

async function main() {
  const args = parseReviewedMigrationArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("apply_database_url_missing");
  const hostClass = classifyDatabaseHost(new URL(connectionString).hostname);
  if (args.mode === "apply" && hostClass !== args.allowHostClass) {
    throw new Error(`apply_refused_host_class_${hostClass}`);
  }

  const file = resolveMigrationFile(
    path.join(process.cwd(), "sql"),
    args.migration,
  );
  const sql = readFileSync(file, "utf8");
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const client = await pool.connect();
  try {
    const database = (await client.query("select current_database() as db"))
      .rows[0]?.db as string;
    const receipt: Record<string, unknown> = {
      mode: args.mode,
      migration: path.basename(file),
      statementCount: countStatements(sql),
      hostClass,
      database,
    };
    if (args.mode === "apply") {
      const startedAt = Date.now();
      await client.query("begin");
      try {
        await client.query("set local lock_timeout = '30s'");
        await client.query(sql);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      receipt.appliedMs = Date.now() - startedAt;
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes("apply-reviewed-migration")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
