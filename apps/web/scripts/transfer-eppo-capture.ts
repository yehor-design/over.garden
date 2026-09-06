/**
 * Copy the completed EPPO observed captures from the loopback database into
 * production (OVE-394, ADR-0026 D11).
 *
 * The captures can only be taken on a loopback database: the capture tool
 * refuses a remote host, on purpose, so a run that spends a day against a
 * provider can never write to production by accident. That leaves this: the
 * rows have to be moved deliberately, by capture id, with every unique key
 * respected.
 *
 * Not a `pg_restore`. Production already holds source snapshots from earlier
 * imports, and a blind restore would collide on their unique keys or, worse,
 * overwrite them. This copies exactly the rows two capture ids reach:
 *
 *   catalog_source_snapshots        the captures' own snapshot rows
 *   catalog_source_capture_runs     the runs
 *   catalog_source_capture_units    every unit, including the payloads
 *   catalog_source_records          the quarantined records they materialized
 *   catalog_source_links            any link already made to those records
 *   stable_registry_public_eppo_records        the public archive
 *   stable_registry_public_eppo_search_terms   and its prefix terms
 *
 * Every insert is `on conflict do nothing`, so a re-run adds what is missing
 * and changes nothing that is there. The receipt is a before and after row
 * count per table on both sides, which is what makes "it transferred" a fact
 * rather than a claim.
 *
 * Usage, from `apps/web`:
 *
 *   pnpm exec tsx scripts/transfer-eppo-capture.ts --mode inventory \
 *     --env-file /abs/path/prod.env
 *   pnpm exec tsx scripts/transfer-eppo-capture.ts --mode transfer \
 *     --env-file /abs/path/prod.env --confirm-target production
 *
 * The source is this checkout's own `DATABASE_URL` and must be loopback; the
 * target comes from the pulled production environment file and must not be.
 * Neither DSN is ever printed: the receipt names host classes and database
 * names only.
 */
import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  classifyDatabaseHost,
  type HostClass,
} from "./apply-reviewed-migration";

export const EPPO_TRANSFER_MODES = ["inventory", "transfer"] as const;
export type EppoTransferMode = (typeof EPPO_TRANSFER_MODES)[number];

/**
 * The tables, in the order their foreign keys allow.
 *
 * `catalog_source_snapshots` must exist before the runs that reference it, the
 * runs before their units, the records before the links and the archive rows,
 * and the archive records before their search terms. Reordering this list is
 * how a transfer half-lands.
 */
export const EPPO_TRANSFER_TABLES = [
  "catalog_source_snapshots",
  "catalog_source_capture_runs",
  "catalog_source_capture_units",
  "catalog_source_records",
  "catalog_source_links",
  "stable_registry_public_eppo_records",
  "stable_registry_public_eppo_search_terms",
] as const;

export type EppoTransferTable = (typeof EPPO_TRANSFER_TABLES)[number];

/** How many rows one round trip carries. Units are large and there are ~776k. */
const COPY_BATCH_ROWS = 2_000;

export interface EppoTransferArgs {
  mode: EppoTransferMode;
  envFile: string | undefined;
  confirmTarget: string | undefined;
  captureIds: readonly string[];
  allowTargetHostClass: HostClass;
  /** Where the loopback source's `DATABASE_URL` is read from. */
  sourceEnvFile: string;
}

export function parseEppoTransferArgs(
  argv: readonly string[],
): EppoTransferArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const mode = valueFor("--mode") ?? "inventory";
  if (!(EPPO_TRANSFER_MODES as readonly string[]).includes(mode)) {
    throw new Error("transfer_mode_invalid");
  }
  const captures = valueFor("--capture-ids");
  const captureIds = captures
    ? captures.split(",").map((value) => value.trim())
    : [];
  for (const value of captureIds) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      )
    ) {
      throw new Error("transfer_capture_id_invalid");
    }
  }
  const allowTargetHostClass =
    valueFor("--allow-target-host-class") ?? "digitalocean_managed";
  if (
    !["digitalocean_managed", "loopback", "other"].includes(
      allowTargetHostClass,
    )
  ) {
    throw new Error("transfer_host_class_invalid");
  }
  return {
    mode: mode as EppoTransferMode,
    envFile: valueFor("--env-file"),
    confirmTarget: valueFor("--confirm-target"),
    captureIds,
    allowTargetHostClass: allowTargetHostClass as HostClass,
    sourceEnvFile: valueFor("--source-env-file") ?? ".env.local",
  };
}

/**
 * Which rows of one table belong to the given captures.
 *
 * Each clause reaches the capture ids by the shortest path the schema offers,
 * so a table is never copied wholesale. `catalog_source_links` is included for
 * completeness: today the EPPO records are quarantined and have none, and a
 * later reconciliation in production creates its own rather than importing the
 * loopback rehearsal's.
 */
export function buildSelectForTable(table: EppoTransferTable): string {
  switch (table) {
    case "catalog_source_snapshots":
      return `select snapshot.* from catalog_source_snapshots as snapshot
              where snapshot.id in (
                select run.source_snapshot_id from catalog_source_capture_runs as run
                where run.id = any($1::uuid[]) and run.source_snapshot_id is not null
              )`;
    case "catalog_source_capture_runs":
      return `select run.* from catalog_source_capture_runs as run
              where run.id = any($1::uuid[])`;
    case "catalog_source_capture_units":
      return `select unit.* from catalog_source_capture_units as unit
              where unit.capture_id = any($1::uuid[])`;
    case "catalog_source_records":
      return `select record.* from catalog_source_records as record
              where record.source_snapshot_id in (
                select run.source_snapshot_id from catalog_source_capture_runs as run
                where run.id = any($1::uuid[]) and run.source_snapshot_id is not null
              )`;
    case "catalog_source_links":
      return `select link.* from catalog_source_links as link
              where link.source_record_id in (
                select record.id from catalog_source_records as record
                where record.source_snapshot_id in (
                  select run.source_snapshot_id from catalog_source_capture_runs as run
                  where run.id = any($1::uuid[]) and run.source_snapshot_id is not null
                )
              )`;
    case "stable_registry_public_eppo_records":
      return `select archive.* from stable_registry_public_eppo_records as archive
              where archive.capture_id = any($1::uuid[])`;
    case "stable_registry_public_eppo_search_terms":
      return `select term.* from stable_registry_public_eppo_search_terms as term
              where term.capture_id = any($1::uuid[])`;
  }
}

/** Every completed EPPO capture in the source database, oldest first. */
const COMPLETED_CAPTURES_SQL = `
  select id::text as id,
         source_snapshot_id::text as source_snapshot_id,
         observed_ended_at,
         inventory_unique_codes::text as codes
  from catalog_source_capture_runs
  where source_slug = 'eppo-codes' and state = 'completed'
  order by observed_ended_at
`;

async function countRows(
  client: PoolClient,
  table: EppoTransferTable,
  captureIds: readonly string[],
): Promise<number> {
  const result = await client.query(
    `select count(*)::int as count from (${buildSelectForTable(table)}) as scoped`,
    [captureIds],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Copy one table's scoped rows, batch by batch.
 *
 * Each row travels as one JSON object and Postgres turns it back into a row of
 * the target's own type. That is not a stylistic choice. Half of what this
 * moves is `raw_payload`, a `jsonb` column that usually holds a JSON *array* —
 * a taxon's names, its taxonomy, its hosts — and a driver that sees a
 * JavaScript array in a parameter sends a Postgres array literal, not JSON. The
 * insert would fail on the first names payload, or worse, store something else.
 * Round-tripping the whole row through `to_jsonb` keeps the array nested, where
 * it stays JSON, and `jsonb_populate_record` maps every column by the target's
 * declared type instead of by the driver's guess.
 *
 * It also means the statement names no columns, so a migration that widens a
 * table needs no edit here, and a column the target lacks is simply not
 * populated rather than silently shifting the values that follow it.
 */
async function copyTable(
  source: PoolClient,
  target: PoolClient,
  table: EppoTransferTable,
  captureIds: readonly string[],
): Promise<number> {
  const rows = await source.query<{ row: unknown }>(
    `select to_jsonb(scoped) as row from (${buildSelectForTable(table)}) as scoped`,
    [captureIds],
  );
  if (rows.rowCount === 0) return 0;
  let inserted = 0;

  for (let offset = 0; offset < rows.rows.length; offset += COPY_BATCH_ROWS) {
    const batch = rows.rows
      .slice(offset, offset + COPY_BATCH_ROWS)
      .map((entry) => entry.row);
    const result = await target.query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, entry)).*
       from jsonb_array_elements($1::jsonb) as entry
       on conflict do nothing`,
      [JSON.stringify(batch)],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function openPool(connectionString: string, env: NodeJS.ProcessEnv) {
  const resolution = resolveDatabaseConnection(env);
  return new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(env, resolution),
  });
}

async function main() {
  const args = parseEppoTransferArgs(process.argv.slice(2));

  // The source is this checkout's own environment, read before the production
  // file is loaded over it. Reading it afterwards is how a transfer would copy
  // production onto itself. `.env.local` is loaded here rather than by the
  // runner so a plain `pnpm exec tsx` names the loopback database the captures
  // actually live in, and never the shell's leftovers.
  loadEnv({ path: args.sourceEnvFile, override: false });
  const sourceResolution = resolveDatabaseConnection(process.env);
  const sourceConnectionString = resolvePgConnectionString(
    process.env,
    sourceResolution,
  );
  if (!sourceConnectionString) throw new Error("transfer_source_url_missing");
  const sourceHostClass = classifyDatabaseHost(
    new URL(sourceConnectionString).hostname,
  );
  if (sourceHostClass !== "loopback") {
    throw new Error(`transfer_refused_source_host_class_${sourceHostClass}`);
  }
  const sourceEnv = { ...process.env };

  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const targetResolution = resolveDatabaseConnection(process.env);
  const targetConnectionString = resolvePgConnectionString(
    process.env,
    targetResolution,
  );
  if (!targetConnectionString) throw new Error("transfer_target_url_missing");
  const targetHostClass = classifyDatabaseHost(
    new URL(targetConnectionString).hostname,
  );
  if (targetConnectionString === sourceConnectionString) {
    throw new Error("transfer_refused_same_database");
  }
  if (
    args.mode === "transfer" &&
    targetHostClass !== args.allowTargetHostClass
  ) {
    throw new Error(`transfer_refused_target_host_class_${targetHostClass}`);
  }
  if (args.mode === "transfer" && args.confirmTarget !== "production") {
    throw new Error("transfer_target_not_confirmed");
  }

  const sourcePool = await openPool(sourceConnectionString, sourceEnv);
  const targetPool = await openPool(targetConnectionString, process.env);
  const source = await sourcePool.connect();
  const target = await targetPool.connect();

  try {
    const captures = await source.query(COMPLETED_CAPTURES_SQL);
    const available = captures.rows.map((row) => String(row.id));
    const captureIds =
      args.captureIds.length > 0 ? [...args.captureIds] : available;
    const missing = captureIds.filter((id) => !available.includes(id));
    if (missing.length > 0) throw new Error("transfer_capture_not_completed");
    if (captureIds.length === 0)
      throw new Error("transfer_no_completed_capture");

    const sourceDatabase = (
      await source.query("select current_database() as db")
    ).rows[0]?.db as string;
    const targetDatabase = (
      await target.query("select current_database() as db")
    ).rows[0]?.db as string;

    const before: Record<string, { source: number; target: number }> = {};
    for (const table of EPPO_TRANSFER_TABLES) {
      before[table] = {
        source: await countRows(source, table, captureIds),
        target: await countRows(target, table, captureIds),
      };
    }

    if (args.mode === "inventory") {
      process.stdout.write(
        `${JSON.stringify(
          {
            mode: "inventory",
            sourceHostClass,
            targetHostClass,
            sourceDatabase,
            targetDatabase,
            captures: captures.rows.map((row) => ({
              captureId: String(row.id),
              codes: Number(row.codes),
              observedEndedAt: row.observed_ended_at,
              selected: captureIds.includes(String(row.id)),
            })),
            rows: before,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const startedAt = Date.now();
    const inserted: Record<string, number> = {};
    // One transaction: a capture whose units landed but whose run did not is
    // not a capture, and the terminal-shape constraint would not catch it.
    await target.query("begin");
    try {
      for (const table of EPPO_TRANSFER_TABLES) {
        inserted[table] = await copyTable(source, target, table, captureIds);
      }
      await target.query("commit");
    } catch (error) {
      await target.query("rollback");
      throw error;
    }

    const after: Record<string, number> = {};
    for (const table of EPPO_TRANSFER_TABLES) {
      after[table] = await countRows(target, table, captureIds);
    }
    const mismatched = EPPO_TRANSFER_TABLES.filter(
      (table) => after[table] !== before[table]!.source,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "transfer",
          sourceHostClass,
          targetHostClass,
          sourceDatabase,
          targetDatabase,
          captureIds,
          durationMs: Date.now() - startedAt,
          rows: Object.fromEntries(
            EPPO_TRANSFER_TABLES.map((table) => [
              table,
              {
                source: before[table]!.source,
                targetBefore: before[table]!.target,
                inserted: inserted[table] ?? 0,
                targetAfter: after[table] ?? 0,
              },
            ]),
          ),
          closure: mismatched.length === 0 ? "verified" : "incomplete",
        },
        null,
        2,
      )}\n`,
    );
    if (mismatched.length > 0) {
      throw new Error(`transfer_row_count_mismatch:${mismatched.join(",")}`);
    }
  } finally {
    source.release();
    target.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

const isEntrypoint =
  process.argv[1]?.endsWith("transfer-eppo-capture.ts") === true;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "eppo_transfer_error",
        errorClass:
          error instanceof Error &&
          /^[a-z0-9_]+(?::[a-z0-9_,]+)?$/u.test(error.message)
            ? error.message
            : "unknown_error",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
