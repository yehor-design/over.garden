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
export const APPLY_MODES = ["verify", "apply", "inventory"] as const;
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
  const migration =
    valueFor("--migration") ?? (mode === "inventory" ? "0000" : undefined);
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

/**
 * The schema objects a migration creates or drops, read from its own
 * statements: `create table`, `alter table … add column`, `create index`, and
 * `drop table`. Checking each against `information_schema`/`pg_indexes` tells
 * which reviewed migrations a database has not received, without a migration
 * ledger (there is none). A dropped table is expected absent; while it is
 * still present the inventory also reports how many rows it holds, which is
 * the number a destructive migration is gated on.
 */
export type MigrationSentinel =
  | { kind: "table"; table: string }
  | { kind: "column"; table: string; column: string }
  | { kind: "index"; index: string }
  | { kind: "dropped_table"; table: string };

export function extractMigrationSentinels(sql: string): MigrationSentinel[] {
  const body = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const sentinels: MigrationSentinel[] = [];
  for (const match of body.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
  )) {
    sentinels.push({ kind: "table", table: match[1]!.toLowerCase() });
  }
  for (const match of body.matchAll(
    /alter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gi,
  )) {
    const table = match[1]!.toLowerCase();
    for (const column of match[2]!.matchAll(
      /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
    )) {
      sentinels.push({
        kind: "column",
        table,
        column: column[1]!.toLowerCase(),
      });
    }
  }
  for (const match of body.matchAll(
    /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
  )) {
    sentinels.push({ kind: "index", index: match[1]!.toLowerCase() });
  }
  for (const match of body.matchAll(
    /drop\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
  )) {
    sentinels.push({ kind: "dropped_table", table: match[1]!.toLowerCase() });
  }
  return sentinels;
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

  const sqlDirectory = path.join(process.cwd(), "sql");
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const client = await pool.connect();
  try {
    const database = (await client.query("select current_database() as db"))
      .rows[0]?.db as string;
    if (args.mode === "inventory") {
      const names = readdirSync(sqlDirectory)
        .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
        .sort();
      const migrations: Record<string, unknown>[] = [];
      for (const name of names) {
        const sentinels = extractMigrationSentinels(
          readFileSync(path.join(sqlDirectory, name), "utf8"),
        );
        const checks: Array<{
          sentinel: string;
          present: boolean;
          expectedPresent: boolean;
          rowCount?: number;
        }> = [];
        for (const sentinel of sentinels) {
          let present = false;
          let rowCount: number | undefined;
          if (sentinel.kind === "table" || sentinel.kind === "dropped_table") {
            present =
              (
                await client.query(
                  "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1",
                  [sentinel.table],
                )
              ).rowCount === 1;
            if (sentinel.kind === "dropped_table" && present) {
              // The table name comes from a reviewed migration file in `sql/`,
              // never from input.
              rowCount = Number(
                (
                  await client.query<{ count: string }>(
                    `select count(*)::text as count from "${sentinel.table}"`,
                  )
                ).rows[0]?.count ?? 0,
              );
            }
          } else if (sentinel.kind === "column") {
            present =
              (
                await client.query(
                  "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
                  [sentinel.table, sentinel.column],
                )
              ).rowCount === 1;
          } else {
            present =
              (
                await client.query(
                  "select 1 from pg_indexes where schemaname = 'public' and indexname = $1",
                  [sentinel.index],
                )
              ).rowCount === 1;
          }
          checks.push({
            sentinel:
              sentinel.kind === "table"
                ? `table ${sentinel.table}`
                : sentinel.kind === "dropped_table"
                  ? `dropped table ${sentinel.table}`
                  : sentinel.kind === "column"
                    ? `column ${sentinel.table}.${sentinel.column}`
                    : `index ${sentinel.index}`,
            present,
            expectedPresent: sentinel.kind !== "dropped_table",
            ...(rowCount === undefined ? {} : { rowCount }),
          });
        }
        // A created object counts as received when present; a dropped one
        // when absent. `absent` keeps its documented meaning for created
        // objects; `stillPresent` names the drop targets that survive, with
        // their row counts.
        const unmatched = checks.filter(
          (check) => check.present !== check.expectedPresent,
        );
        const absent = unmatched.filter((check) => check.expectedPresent);
        const stillPresent = unmatched.filter((check) => !check.expectedPresent);
        migrations.push({
          migration: name,
          status:
            checks.length === 0
              ? "no_sentinel"
              : unmatched.length === 0
                ? "applied"
                : unmatched.length === checks.length
                  ? "missing"
                  : "partial",
          absent: absent.map((check) => check.sentinel),
          ...(stillPresent.length === 0
            ? {}
            : {
                stillPresent: stillPresent.map((check) => ({
                  sentinel: check.sentinel,
                  rowCount: check.rowCount ?? null,
                })),
              }),
        });
      }
      process.stdout.write(
        `${JSON.stringify({ mode: "inventory", hostClass, database, migrations }, null, 2)}\n`,
      );
      return;
    }
    const file = resolveMigrationFile(sqlDirectory, args.migration);
    const sql = readFileSync(file, "utf8");
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
