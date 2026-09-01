import "./neutralise-server-only";

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

/**
 * Applies exactly one reviewed migration file to a database, and reports
 * whether its index is present.
 *
 * `bootstrap-db.ts` re-applies every migration and currently cannot complete
 * against a database that has already had
 * `0038_ove349_retire_legacy_journal_media.sql`: that file drops
 * `media_assets.quarantine_key`, while `0005_ove202_ove207_journal_document_cover.sql`
 * still references it. The ordering is correct on a fresh database and broken
 * on a mature one, so the rerun fails at 0005 and every later migration —
 * including any new one — is unreachable. Until that is fixed, a single
 * reviewed migration still has to be able to land.
 *
 * Deliberate narrowness, because this points at production:
 *
 *   * `--mode verify` is the default; applying requires asking for it.
 *   * The file is read from the repository, never inlined, so what is applied
 *     cannot drift from what is in git.
 *   * It refuses anything that is not a single `create index if not exists`.
 *     That statement is idempotent and additive: it creates no column, drops
 *     nothing, and rewrites no row. Widening this is a decision, not a tweak.
 *
 * Evidence is structural only: an index name, a definition, a boolean, a
 * duration. No connection string, password, certificate body, or table row is
 * read into output.
 */
export const APPLY_MODES = ["verify", "apply"] as const;
export type ApplyMode = (typeof APPLY_MODES)[number];

const SINGLE_INDEX_STATEMENT =
  /^create index if not exists\s+([a-z0-9_]+)[\s\S]*$/i;

/** Strips comment lines and blank space, leaving the executable statement. */
export function extractStatement(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
}

/**
 * Refuses anything outside the narrow shape this script is allowed to run.
 * Returns the index name so the caller can report on it.
 */
export function assertSingleIndexStatement(statement: string): string {
  const bodies = statement.split(";").filter((part) => part.trim());
  if (bodies.length !== 1) {
    throw new Error("apply_refused_multiple_statements");
  }
  const match = SINGLE_INDEX_STATEMENT.exec(statement);
  if (!match) throw new Error("apply_refused_not_a_create_index");
  return match[1]!;
}

export function parseApplyArgs(argv: readonly string[]) {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const mode = valueFor("--mode") ?? "verify";
  if (!(APPLY_MODES as readonly string[]).includes(mode)) {
    throw new Error("apply_mode_invalid");
  }
  const sqlFile = valueFor("--sql-file");
  const envFile = valueFor("--env-file");
  const caFile = valueFor("--ca-file");
  if (!sqlFile) throw new Error("apply_sql_file_required");
  if (!envFile) throw new Error("apply_env_file_required");
  if (!caFile) throw new Error("apply_ca_file_required");
  return { mode: mode as ApplyMode, sqlFile, envFile, caFile };
}

async function main() {
  const args = parseApplyArgs(process.argv.slice(2));
  loadEnv({ path: args.envFile });

  // Mirror `bootstrap-db.ts`: the certificate arrives as a file and is handed
  // to the shared resolver through the environment, so this script uses the one
  // tested connection path instead of a parallel one of its own.
  //
  // Both settings are load-bearing. `resolvePgConnectionString` strips
  // `sslmode` from the URL once a CA is present — without that, the driver
  // builds its own TLS config from the system trust store and rejects
  // DigitalOcean's CA as self-signed. And `resolveDatabaseSsl` returns false by
  // default when the connection came from `DATABASE_URL`, so omitting
  // `DATABASE_SSL` silently downgrades to a plaintext connection the server
  // then refuses.
  process.env.DATABASE_SSL_CA = readFileSync(args.caFile, "utf8");
  process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("apply_database_url_missing");

  const statement = extractStatement(readFileSync(args.sqlFile, "utf8"));
  const indexName = assertSingleIndexStatement(statement);

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  try {
    const present = async () =>
      (
        await pool.query(
          "select indexdef from pg_indexes where indexname = $1",
          [indexName],
        )
      ).rows[0]?.indexdef as string | undefined;

    const before = await present();
    const receipt: Record<string, unknown> = {
      mode: args.mode,
      indexName,
      presentBefore: Boolean(before),
    };

    if (args.mode === "apply" && !before) {
      const startedAt = Date.now();
      await pool.query(statement);
      receipt.appliedMs = Date.now() - startedAt;
    }

    const after = await present();
    receipt.presentAfter = Boolean(after);
    receipt.definition = after ?? null;
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (!after && args.mode === "apply") process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes("apply-single-migration")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
