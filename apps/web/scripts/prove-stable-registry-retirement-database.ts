import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";
import { classifyDatabaseHost } from "./apply-reviewed-migration";

/**
 * Executes the Stable Registry retirement migration (0053) instead of reading
 * it, in the three places it has to be right.
 *
 *   * `--disposable` (default): a fresh bootstrap up to 0052, then 0053, then
 *     its rollback, then 0053 again. Every dropped object must be gone, every
 *     retained object present with the same row count, the rollback must bring
 *     every dropped object back, and the second application must land exactly
 *     where the first did.
 *   * `--loopback-rollback`: the same before/after comparison on the owner's
 *     loopback database, which holds the real EPPO capture, inside one
 *     transaction that always rolls back. This is the proof that the retained
 *     tables keep every row.
 *   * `--inventory`: a read-only picture of whatever database the environment
 *     names — host class, which objects 0053 would drop and how many rows they
 *     hold, and whether every retained table is present. It writes nothing and
 *     is what the owner reads before approving a production run.
 *
 * Output is aggregate: object names from this file's own lists, booleans, and
 * row counts. Never a row, a value, or a connection string.
 */
export const RETIREMENT_MIGRATION = "0053";

/** In the order 0053 drops them: children before the tables they reference. */
export const DROPPED_TABLES = [
  "catalog_registry_extension_pack_user_names",
  "catalog_registry_extension_pack_names",
  "catalog_registry_extension_pack_rows",
  "catalog_registry_extension_packs",
  "catalog_registry_edition_diffs",
  "catalog_registry_item_relations",
  "catalog_registry_activation_sequence",
  "stable_registry_product_projection_outbox",
  "stable_registry_product_catalog_names",
  "stable_registry_product_catalog_records",
  "stable_registry_public_catalog_search_terms",
  "stable_registry_public_catalog_records",
  "catalog_registry_search_outbox",
  "catalog_registry_activations",
  "catalog_registry_active_pointers",
  "catalog_registry_decisions",
  "catalog_registry_exception_groups",
  "catalog_registry_release_members",
  "catalog_registry_releases",
  "catalog_item_revisions",
] as const;

export const DROPPED_FUNCTIONS = [
  "prevent_catalog_item_revision_mutation",
  "prevent_catalog_registry_release_member_mutation",
  "prevent_catalog_registry_decision_mutation",
  "prevent_catalog_registry_activation_mutation",
  "enforce_catalog_registry_release_transition",
  "enforce_catalog_registry_exception_group_mutation",
  "enforce_catalog_registry_release_rollback_transition",
  "materialize_stable_registry_public_catalog_release",
  "stable_registry_product_public_slug",
  "materialize_stable_registry_product_release",
  "materialize_stable_registry_product_projection",
  "enforce_catalog_registry_extension_pack_transition",
  "prevent_approved_extension_pack_row_mutation",
  "materialize_stable_registry_extension_pack",
  "prevent_catalog_registry_item_relation_mutation",
  "prevent_catalog_registry_activation_sequence_mutation",
  "prevent_approved_edition_diff_mutation",
  "stable_registry_edition_affected_objects",
] as const;

export const DROPPED_CONSTRAINTS = [
  "job_queue_stable_registry_foundation_build_payload_check",
  "job_queue_stable_registry_extension_pack_build_payload_check",
  "job_queue_stable_registry_edition_build_payload_check",
] as const;

export const DROPPED_TRIGGER = {
  name: "catalog_registry_public_catalog_materialize",
  table: "catalog_registry_releases",
} as const;

export const DROPPED_INDEX = "stable_registry_product_catalog_names_trgm_idx";

/** ADR-0025 D2 plus the gardener catalog D3 leaves alone. */
export const RETAINED_TABLES = [
  "catalog_source_capture_runs",
  "catalog_source_capture_units",
  "catalog_source_records",
  "catalog_source_snapshots",
  "catalog_source_links",
  "catalog_source_refresh_events",
  "catalog_source_refresh_records",
  "stable_registry_public_eppo_records",
  "stable_registry_public_eppo_search_terms",
  "catalog_items",
  "catalog_item_names",
] as const;

export const RETAINED_FUNCTIONS = [
  "stable_registry_public_safe_label",
  "materialize_stable_registry_public_eppo_capture",
  "materialize_stable_registry_public_read_models",
] as const;

export const RETAINED_TRIGGER = {
  name: "catalog_registry_public_eppo_materialize",
  table: "catalog_source_capture_runs",
} as const;

export const RETAINED_INDEX = "catalog_item_names_display_trgm_idx";

type Queryable = Pool | PoolClient;

export interface SchemaSnapshot {
  droppedTablesPresent: string[];
  droppedFunctionsPresent: string[];
  droppedConstraintsPresent: string[];
  droppedTriggerPresent: boolean;
  droppedIndexPresent: boolean;
  droppedRowCounts: Record<string, number>;
  retainedTablesAbsent: string[];
  retainedFunctionsAbsent: string[];
  retainedTriggerPresent: boolean;
  retainedIndexPresent: boolean;
  retainedRowCounts: Record<string, number>;
  readModelMentionsCatalogRelease: boolean;
  readModelMentionsEppoCapture: boolean;
}

export async function readSchemaSnapshot(
  queryable: Queryable,
): Promise<SchemaSnapshot> {
  const droppedTablesPresent: string[] = [];
  const droppedRowCounts: Record<string, number> = {};
  for (const table of DROPPED_TABLES) {
    if (await tablePresent(queryable, table)) {
      droppedTablesPresent.push(table);
      droppedRowCounts[table] = await rowCount(queryable, table);
    }
  }
  const droppedFunctionsPresent: string[] = [];
  for (const name of DROPPED_FUNCTIONS) {
    if (await functionPresent(queryable, name)) droppedFunctionsPresent.push(name);
  }
  const droppedConstraintsPresent: string[] = [];
  for (const name of DROPPED_CONSTRAINTS) {
    if (await constraintPresent(queryable, name)) {
      droppedConstraintsPresent.push(name);
    }
  }
  const retainedTablesAbsent: string[] = [];
  const retainedRowCounts: Record<string, number> = {};
  for (const table of RETAINED_TABLES) {
    if (await tablePresent(queryable, table)) {
      retainedRowCounts[table] = await rowCount(queryable, table);
    } else {
      retainedTablesAbsent.push(table);
    }
  }
  const retainedFunctionsAbsent: string[] = [];
  for (const name of RETAINED_FUNCTIONS) {
    if (!(await functionPresent(queryable, name))) {
      retainedFunctionsAbsent.push(name);
    }
  }
  const readModel = await functionBody(
    queryable,
    "materialize_stable_registry_public_read_models",
  );

  return {
    droppedTablesPresent,
    droppedFunctionsPresent,
    droppedConstraintsPresent,
    droppedTriggerPresent: await triggerPresent(
      queryable,
      DROPPED_TRIGGER.name,
      DROPPED_TRIGGER.table,
    ),
    droppedIndexPresent: await indexPresent(queryable, DROPPED_INDEX),
    droppedRowCounts,
    retainedTablesAbsent,
    retainedFunctionsAbsent,
    retainedTriggerPresent: await triggerPresent(
      queryable,
      RETAINED_TRIGGER.name,
      RETAINED_TRIGGER.table,
    ),
    retainedIndexPresent: await indexPresent(queryable, RETAINED_INDEX),
    retainedRowCounts,
    readModelMentionsCatalogRelease: readModel.includes(
      "materialize_stable_registry_public_catalog_release",
    ),
    readModelMentionsEppoCapture: readModel.includes(
      "materialize_stable_registry_public_eppo_capture",
    ),
  };
}

/** Everything 0053 removes is still there, everything it keeps is there too. */
function assertBeforeRetirement(snapshot: SchemaSnapshot, label: string) {
  if (snapshot.droppedTablesPresent.length !== DROPPED_TABLES.length) {
    throw new Error(`${label}: a table 0053 drops is already absent`);
  }
  if (snapshot.droppedFunctionsPresent.length !== DROPPED_FUNCTIONS.length) {
    throw new Error(`${label}: a function 0053 drops is already absent`);
  }
  if (
    snapshot.droppedConstraintsPresent.length !== DROPPED_CONSTRAINTS.length
  ) {
    throw new Error(`${label}: a constraint 0053 drops is already absent`);
  }
  if (!snapshot.droppedTriggerPresent || !snapshot.droppedIndexPresent) {
    throw new Error(`${label}: the catalog trigger or index is already absent`);
  }
  if (!snapshot.readModelMentionsCatalogRelease) {
    throw new Error(`${label}: the read-model function lacks its catalog branch`);
  }
  assertRetained(snapshot, label);
}

/** Everything 0053 removes is gone, everything it keeps is intact. */
function assertAfterRetirement(snapshot: SchemaSnapshot, label: string) {
  if (snapshot.droppedTablesPresent.length !== 0) {
    throw new Error(
      `${label}: tables survived 0053: ${snapshot.droppedTablesPresent.join(",")}`,
    );
  }
  if (snapshot.droppedFunctionsPresent.length !== 0) {
    throw new Error(
      `${label}: functions survived 0053: ${snapshot.droppedFunctionsPresent.join(",")}`,
    );
  }
  if (snapshot.droppedConstraintsPresent.length !== 0) {
    throw new Error(
      `${label}: constraints survived 0053: ${snapshot.droppedConstraintsPresent.join(",")}`,
    );
  }
  if (snapshot.droppedTriggerPresent || snapshot.droppedIndexPresent) {
    throw new Error(`${label}: the catalog trigger or index survived 0053`);
  }
  if (snapshot.readModelMentionsCatalogRelease) {
    throw new Error(`${label}: the read-model function still names the catalog release`);
  }
  assertRetained(snapshot, label);
}

function assertRetained(snapshot: SchemaSnapshot, label: string) {
  if (snapshot.retainedTablesAbsent.length !== 0) {
    throw new Error(
      `${label}: retained tables absent: ${snapshot.retainedTablesAbsent.join(",")}`,
    );
  }
  if (snapshot.retainedFunctionsAbsent.length !== 0) {
    throw new Error(
      `${label}: retained functions absent: ${snapshot.retainedFunctionsAbsent.join(",")}`,
    );
  }
  if (!snapshot.retainedTriggerPresent) {
    throw new Error(`${label}: the EPPO materialize trigger is absent`);
  }
  if (!snapshot.retainedIndexPresent) {
    throw new Error(`${label}: the catalog_item_names trigram index is absent`);
  }
  if (!snapshot.readModelMentionsEppoCapture) {
    throw new Error(`${label}: the read-model function lost its EPPO branch`);
  }
}

function assertSameRetainedCounts(
  before: SchemaSnapshot,
  after: SchemaSnapshot,
  label: string,
) {
  for (const table of RETAINED_TABLES) {
    if (before.retainedRowCounts[table] !== after.retainedRowCounts[table]) {
      throw new Error(`${label}: row count changed for retained table ${table}`);
    }
  }
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function migrationSql(number: string) {
  const sqlDirectory = path.join(process.cwd(), "sql");
  const file = path.join(
    sqlDirectory,
    `${number}_ove385_retire_stable_registry_release_tables.sql`,
  );
  return readFileSync(file, "utf8");
}

function rollbackSql(number: string) {
  const file = path.join(
    process.cwd(),
    "sql",
    "rollback",
    `${number}_ove385_retire_stable_registry_release_tables.down.sql`,
  );
  return readFileSync(file, "utf8");
}

/**
 * The fresh-bootstrap proof: 0053 forward, back, and forward again on a
 * database this proof creates and drops.
 */
export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = requiredEnv("DATABASE_URL");

  const disposable = `overgarden_ove385_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), RETIREMENT_MIGRATION);
    await seedRetainedRows(pool);

    const before = await readSchemaSnapshot(pool);
    assertBeforeRetirement(before, "before");
    if (sumCounts(before.droppedRowCounts) !== 0) {
      throw new Error("before: a fresh bootstrap holds registry rows");
    }

    await pool.query(migrationSql(RETIREMENT_MIGRATION));
    const after = await readSchemaSnapshot(pool);
    assertAfterRetirement(after, "after");
    assertSameRetainedCounts(before, after, "after");

    await pool.query(rollbackSql(RETIREMENT_MIGRATION));
    const restored = await readSchemaSnapshot(pool);
    assertBeforeRetirement(restored, "rollback");
    assertSameRetainedCounts(before, restored, "rollback");

    await pool.query(migrationSql(RETIREMENT_MIGRATION));
    const again = await readSchemaSnapshot(pool);
    assertAfterRetirement(again, "reapply");
    assertSameRetainedCounts(before, again, "reapply");

    return {
      schemaVersion: "ove385.stableRegistryRetirement.v1",
      mode: "disposable",
      status: "pass",
      droppedTableCount: DROPPED_TABLES.length,
      droppedFunctionCount: DROPPED_FUNCTIONS.length,
      droppedConstraintCount: DROPPED_CONSTRAINTS.length,
      retainedTableCount: RETAINED_TABLES.length,
      retainedRowsSeeded: sumCounts(before.retainedRowCounts),
      retainedRowCountsIdentical: true,
      rollbackRecreatedEveryObject: true,
      reapplyIdempotent: true,
      readModelKeepsOnlyEppoBranch: true,
    };
  } finally {
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

/**
 * The retained-data proof on the owner's loopback database: 0053 inside one
 * transaction that is rolled back, with the row count of every retained table
 * compared before and after. DDL is transactional in Postgres, so the database
 * is byte-for-byte what it was when this returns.
 */
export async function runLoopbackRollbackProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL"), max: 1 });
  const client = await pool.connect();
  try {
    // The loopback database is whatever the owner last bootstrapped; it need
    // not carry every constraint a fresh bootstrap would. What must hold is
    // that the retained layer is intact before, intact after, and that the
    // rollback of the transaction leaves the schema exactly as it was found.
    const untouched = await readSchemaSnapshot(client);
    assertRetained(untouched, "loopback");

    await client.query("begin");
    let after: SchemaSnapshot;
    try {
      await client.query("set local lock_timeout = '30s'");
      await client.query(migrationSql(RETIREMENT_MIGRATION));
      after = await readSchemaSnapshot(client);
    } finally {
      await client.query("rollback");
    }
    assertAfterRetirement(after, "loopback after");
    assertSameRetainedCounts(untouched, after, "loopback after");

    const restored = await readSchemaSnapshot(client);
    if (JSON.stringify(restored) !== JSON.stringify(untouched)) {
      throw new Error("loopback restored: the schema differs from what was found");
    }

    return {
      schemaVersion: "ove385.stableRegistryRetirement.v1",
      mode: "loopback-rollback",
      status: "pass",
      hostClass: "loopback",
      retainedRowCounts: untouched.retainedRowCounts,
      retainedRowCountsIdentical: true,
      droppedTablesPresentBefore: untouched.droppedTablesPresent.length,
      droppedConstraintsPresentBefore:
        untouched.droppedConstraintsPresent.length,
      droppedRowsTotal: sumCounts(untouched.droppedRowCounts),
      droppedTableCount: DROPPED_TABLES.length,
      transactionRolledBack: true,
      schemaRestoredExactly: true,
    };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

/**
 * Read-only. Names the host class and reports what 0053 would find: which of
 * the objects it drops exist and how many rows the tables hold, and whether
 * every retained table is present. Runs against whatever the environment
 * names, so it is also the production inventory the owner reads before
 * approving the migration.
 */
export async function runInventory() {
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("inventory_database_url_missing");
  const hostClass = classifyDatabaseHost(new URL(connectionString).hostname);
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  try {
    const database = (await pool.query("select current_database() as db"))
      .rows[0]?.db as string;
    const snapshot = await readSchemaSnapshot(pool);
    return {
      schemaVersion: "ove385.stableRegistryRetirement.v1",
      mode: "inventory",
      hostClass,
      database,
      readOnly: true,
      dropTargets: DROPPED_TABLES.map((table) => ({
        table,
        present: snapshot.droppedTablesPresent.includes(table),
        rowCount: snapshot.droppedRowCounts[table] ?? null,
      })),
      droppedRowsTotal: sumCounts(snapshot.droppedRowCounts),
      droppedFunctionsPresent: snapshot.droppedFunctionsPresent.length,
      droppedConstraintsPresent: snapshot.droppedConstraintsPresent.length,
      retained: RETAINED_TABLES.map((table) => ({
        table,
        present: !snapshot.retainedTablesAbsent.includes(table),
        rowCount: snapshot.retainedRowCounts[table] ?? null,
      })),
      retainedTablesAbsent: snapshot.retainedTablesAbsent,
      retainedTriggerPresent: snapshot.retainedTriggerPresent,
      readModelMentionsCatalogRelease: snapshot.readModelMentionsCatalogRelease,
      alreadyApplied:
        snapshot.droppedTablesPresent.length === 0 &&
        snapshot.droppedConstraintsPresent.length === 0,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function applyMigrationsBefore(
  pool: Pool,
  connectionString: string,
  number: string,
) {
  const applicationSql = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  await pool.query(applicationSql[0]!.sql);

  const authDb = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, max: 1 }),
    }),
  });
  const authOptions = {
    appName: "OverGarden",
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    secret: "ove385-disposable-proof-secret-value-not-a-credential",
    database: { db: authDb, type: "postgres", casing: "snake" },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
  } satisfies BetterAuthOptions;
  betterAuth(authOptions);
  await (await getMigrations(authOptions)).runMigrations();
  await authDb.destroy();

  for (const migration of applicationSql) {
    if (migration.name.slice(0, 4) >= number) continue;
    await pool.query(migration.sql);
  }
}

/**
 * One row in each retained table the base seed leaves empty, so "the count is
 * identical" is a statement about rows that exist, not about two zeros.
 */
async function seedRetainedRows(pool: Pool) {
  const snapshotId = randomUUID();
  const captureId = randomUUID();
  const digest = "a".repeat(64);
  await pool.query(
    `insert into catalog_source_snapshots (
       id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1,'eppo-codes','EPPO','taxonomy','ove385','https://data.eppo.int/',
       'Open Licence','ove385',$2, now(), now(), 'imported')`,
    [snapshotId, digest],
  );
  await pool.query(
    `insert into catalog_source_capture_runs (
       id, source_snapshot_id, capture_schema_version, capture_tool_revision,
       source_host, endpoint_family, request_schema_version, openapi_sha256,
       license_sha256, observed_started_at, observed_ended_at,
       inventory_start_total, inventory_end_total, inventory_unique_codes,
       inventory_page_count, inventory_start_sha256, inventory_end_sha256,
       manifest_sha256, zero_product_receipt, state
     ) values ($1,$2,'ove385',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
       1, 1, 1, 1, $3, $3, $3,
       '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
    [captureId, snapshotId, digest, "b".repeat(40)],
  );
  await pool.query(
    `insert into stable_registry_public_eppo_records (
       capture_id, source_snapshot_id, eppo_code, object_kind, display_name,
       search_normalized, evidence_state, observed_at, source_name, source_url,
       license
     ) values ($1, $2, 'LYPES', 'plant', 'Solanum lycopersicum',
       'solanum lycopersicum', 'source_record_not_approved', now(), 'EPPO',
       'https://data.eppo.int/', 'Open Licence')`,
    [captureId, snapshotId],
  );
}

async function tablePresent(queryable: Queryable, table: string) {
  const result = await queryable.query<{ present: boolean }>(
    "select to_regclass($1) is not null as present",
    [`public.${table}`],
  );
  return result.rows[0]?.present === true;
}

async function rowCount(queryable: Queryable, table: string) {
  // Table names come from this file's own lists, never from input.
  const result = await queryable.query<{ count: string }>(
    `select count(*)::text as count from "${table}"`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function functionPresent(queryable: Queryable, name: string) {
  const result = await queryable.query(
    `select 1 from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

async function functionBody(queryable: Queryable, name: string) {
  const result = await queryable.query<{ body: string }>(
    `select pg_get_functiondef(p.oid) as body from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return result.rows[0]?.body ?? "";
}

async function constraintPresent(queryable: Queryable, name: string) {
  const result = await queryable.query(
    "select 1 from pg_constraint where conname = $1",
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

async function triggerPresent(
  queryable: Queryable,
  name: string,
  table: string,
) {
  const result = await queryable.query(
    `select 1 from pg_trigger as t
       join pg_class as c on c.oid = t.tgrelid
      where t.tgname = $1 and c.relname = $2 and not t.tgisinternal`,
    [name, table],
  );
  return (result.rowCount ?? 0) > 0;
}

async function indexPresent(queryable: Queryable, name: string) {
  const result = await queryable.query(
    "select 1 from pg_indexes where schemaname = 'public' and indexname = $1",
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const receipt = argv.includes("--inventory")
    ? await runInventory()
    : argv.includes("--loopback-rollback")
      ? await runLoopbackRollbackProof()
      : await runDisposableProof();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1]?.includes("prove-stable-registry-retirement-database")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "stable_registry_retirement_proof_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
