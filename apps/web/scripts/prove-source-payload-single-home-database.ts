import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  buildClaimEppoSourceRecordBatchQuery,
  buildDeduplicateEppoSourceRecordPayloadsQuery,
  buildListEppoCapturedSnapshotsQuery,
  buildReconstructEppoSourceRecordPayloadQuery,
  buildRestoreEppoSourceRecordPayloadsQuery,
  EPPO_DETAIL_ENDPOINT_CLASSES,
} from "../src/server/catalog-source/eppo-observed-capture-repository";
import { loadVersionedApplicationSql } from "./application-sql";
import {
  assertSafeSourcePayloadReceipt,
  relationSizeClass,
  roundMs,
  SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
  type SourcePayloadMode,
  type SourcePayloadProofReceipt,
} from "./prove-source-payload-single-home";

/** Migrations this proof owns: base schema, observed capture, payload home. */
const SOURCE_PAYLOAD_MIGRATIONS = /^(0001|0023|0042)_/u;

/** Enough rows, at the real per-row cost, for a size change to be unambiguous. */
const REPRODUCIBLE_RECORDS = 120;
const UNIT_PAYLOAD_BYTES = 5_000;

/**
 * Proves the deduplication against migration 0042 and real rows.
 *
 * The whole slice rests on one claim a compile-only test cannot check: that the
 * capture units still reproduce, byte for byte, the digest the source record
 * was created with. So this builds its own disposable database, seeds the
 * historical inline shape the old materialize wrote, and only then runs the
 * batches — measuring the relation before and after with the dead rows actually
 * reclaimed, because an `update` alone makes a table grow.
 *
 * It never touches the developer database it borrows a connection string from:
 * every effect lands in a database it creates and drops.
 */
export async function runSourcePayloadSingleHomeDatabaseProof(input: {
  mode: SourcePayloadMode;
  batchSize: number;
}): Promise<SourcePayloadProofReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const disposable = `overgarden_ove354_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(requiredEnv("DATABASE_URL"));
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(requiredEnv("DATABASE_URL"));
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);

  const pool = new Pool({ connectionString: targetUrl.toString(), max: 4 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await applySourcePayloadMigrations(pool);
    const seeded = await seedHistoricalInlineShape(pool);

    // The claim the whole slice rests on, checked before anything is dropped.
    const reconstructed = await buildReconstructEppoSourceRecordPayloadQuery(
      db,
      {
        sourceSnapshotId: seeded.snapshotId,
        sourceRecordId: seeded.firstReproducibleCode,
      },
    ).executeTakeFirstOrThrow();
    if (reconstructed.raw_payload_sha256 !== seeded.firstReproducibleDigest) {
      throw new Error("reconstructed_digest_does_not_match_stored_digest");
    }

    const snapshots = await buildListEppoCapturedSnapshotsQuery(db).execute();
    if (snapshots.length !== 1) {
      throw new Error("captured_snapshot_inventory_mismatch");
    }

    const sizeBefore = await reclaimAndMeasure(pool);

    const applied = await runDeduplicationPass(db, {
      snapshotId: seeded.snapshotId,
      batchSize: input.batchSize,
    });
    if (applied.deduplicated !== REPRODUCIBLE_RECORDS) {
      throw new Error("reproducible_records_were_not_deduplicated");
    }
    if (applied.held !== seeded.heldRecords) {
      throw new Error("held_records_were_not_held");
    }

    // Every digest must be byte-identical to its pre-run value, and every
    // deduplicated row must have surrendered its payload.
    const digestsUnchanged = await digestsMatchSeed(pool, seeded.digestBySlug);
    if (!digestsUnchanged) {
      throw new Error("source_payload_digest_changed");
    }
    await assertHomeAndPayloadAgree(pool);

    // A record with no capture units at all keeps its only copy.
    await assertOtherFamilyStaysInline(pool, seeded.otherFamilySnapshotId);

    const sizeAfter = await reclaimAndMeasure(pool);
    if (sizeAfter >= sizeBefore) {
      throw new Error("source_payload_relation_did_not_shrink");
    }

    // AC-04 replay: the same pass again must find nothing left to do.
    const replay = await runDeduplicationPass(db, {
      snapshotId: seeded.snapshotId,
      batchSize: input.batchSize,
    });
    if (replay.deduplicated !== 0) {
      throw new Error("replay_produced_additional_effects");
    }

    // AC-05 race: two claims in flight must never overlap.
    const overlap = await concurrentClaimOverlap(pool, {
      snapshotId: seeded.snapshotId,
      batchSize: Math.max(1, Math.floor(REPRODUCIBLE_RECORDS / 4)),
    });
    if (overlap !== 0) {
      throw new Error("concurrent_claims_overlapped");
    }

    // AC-03: the database, not the script, refuses a disagreeing row.
    await assertPayloadHomeCheckRefusesBothDirections(pool);

    // AC-04 rollback: the payload comes back byte-identical to the original.
    const restored = await runRestorePass(db, {
      snapshotId: seeded.snapshotId,
      batchSize: input.batchSize,
    });
    if (restored !== REPRODUCIBLE_RECORDS) {
      throw new Error("rollback_did_not_restore_every_record");
    }
    await assertRestoredPayloadsReproduceTheirDigest(
      pool,
      seeded.reproducibleCodes,
    );

    // AC-06 abort: an interrupted batch leaves every record where it was.
    await assertAbortedBatchLeavesRecordsInline(pool, db, {
      snapshotId: seeded.snapshotId,
      batchSize: input.batchSize,
    });

    return assertSafeSourcePayloadReceipt({
      schemaVersion: "ove354.sourcePayloadSingleHome.v1",
      mode: input.mode,
      runClass: "database",
      status: "pass",
      terminalClass: "verified",
      batchSize: input.batchSize,
      batchCount: applied.batchCount,
      candidateCount: applied.candidates,
      deduplicatedCount: applied.deduplicated,
      heldCount: applied.held,
      failedCount: 0,
      digestsUnchanged: true,
      relationSizeBeforeClass: relationSizeClass(sizeBefore),
      relationSizeAfterClass: relationSizeClass(sizeAfter),
      relationSizeReduced: true,
      replayedEffectCount: replay.deduplicated,
      concurrentWinnerOverlapCount: overlap,
      restoredCount: restored,
      maxBatchDurationMs: roundMs(applied.maxBatchDurationMs),
      batchBudgetMs: SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
      abortReasonClass: null,
      forbiddenMarkersAbsent: true,
      controls: { abortBackfillEnabled: true, dedupStatusEnabled: true },
    });
  } finally {
    await db.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function applySourcePayloadMigrations(pool: Pool) {
  const migrations = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  const applied = migrations.filter((migration) =>
    SOURCE_PAYLOAD_MIGRATIONS.test(migration.name),
  );
  if (applied.length !== 3) {
    throw new Error("source_payload_migrations_missing");
  }
  for (const migration of applied) {
    await pool.query(migration.sql);
  }
}

interface SeededShape {
  snapshotId: string;
  otherFamilySnapshotId: string;
  firstReproducibleCode: string;
  firstReproducibleDigest: string;
  reproducibleCodes: string[];
  heldRecords: number;
  digestBySlug: Map<string, string>;
}

/**
 * Writes the shape the pre-0042 materialize left behind: one aggregated payload
 * on the record and the same bytes on its units.
 *
 * The held cases are seeded deliberately, because the deduplication is only as
 * trustworthy as its refusals: a wrong digest, an incomplete endpoint set, and
 * a record with no units at all must each survive with their payload intact.
 */
async function seedHistoricalInlineShape(pool: Pool): Promise<SeededShape> {
  const snapshotId = await insertSnapshot(pool, "eppo-codes", "observed-v1");
  const otherFamilySnapshotId = await insertSnapshot(
    pool,
    "ua-state-register",
    "register-v1",
  );
  const captureId = await insertCompletedCapture(pool, snapshotId);

  const digestBySlug = new Map<string, string>();
  const reproducibleCodes: string[] = [];
  let firstReproducibleCode = "";
  let firstReproducibleDigest = "";

  for (let index = 0; index < REPRODUCIBLE_RECORDS; index += 1) {
    const code = taxonCode(index);
    await insertTerminalUnits(pool, captureId, code, index, [
      ...EPPO_DETAIL_ENDPOINT_CLASSES,
    ]);
    const digest = await insertInlineRecordFromUnits(
      pool,
      snapshotId,
      captureId,
      code,
    );
    digestBySlug.set(code, digest);
    reproducibleCodes.push(code);
    if (index === 0) {
      firstReproducibleCode = code;
      firstReproducibleDigest = digest;
    }
  }

  // Held case 1 — the record's stored digest is not what its units reproduce.
  const driftedCode = taxonCode(REPRODUCIBLE_RECORDS);
  await insertTerminalUnits(pool, captureId, driftedCode, REPRODUCIBLE_RECORDS, [
    ...EPPO_DETAIL_ENDPOINT_CLASSES,
  ]);
  const driftedDigest = await insertInlineRecordFromUnits(
    pool,
    snapshotId,
    captureId,
    driftedCode,
    "f".repeat(64),
  );
  digestBySlug.set(driftedCode, driftedDigest);

  // Held case 2 — one endpoint never reached a terminal state.
  const partialCode = taxonCode(REPRODUCIBLE_RECORDS + 1);
  await insertTerminalUnits(
    pool,
    captureId,
    partialCode,
    REPRODUCIBLE_RECORDS + 1,
    EPPO_DETAIL_ENDPOINT_CLASSES.slice(0, 2),
  );
  const partialDigest = await insertInlineRecordFromUnits(
    pool,
    snapshotId,
    captureId,
    partialCode,
    undefined,
    partialCode,
  );
  digestBySlug.set(partialCode, partialDigest);

  // Held case 3 — a record in the captured snapshot with no units at all.
  const orphanDigest = await insertStandaloneInlineRecord(
    pool,
    snapshotId,
    "ORPHAN1",
  );
  digestBySlug.set("ORPHAN1", orphanDigest);

  // A different source family: no capture, so exactly one copy already.
  const otherDigest = await insertStandaloneInlineRecord(
    pool,
    otherFamilySnapshotId,
    "UA-0001",
  );
  digestBySlug.set("UA-0001", otherDigest);

  return {
    snapshotId,
    otherFamilySnapshotId,
    firstReproducibleCode,
    firstReproducibleDigest,
    reproducibleCodes,
    heldRecords: 3,
    digestBySlug,
  };
}

async function insertSnapshot(pool: Pool, slug: string, version: string) {
  const inserted = await pool.query<{ id: string }>(
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1, $2, 'reference', $3, 'https://example.invalid/source',
       'Open Licence', 'ove354-proof', $4, now(), now(), 'imported')
     returning id`,
    [slug, `${slug} proof snapshot`, version, sha256(`${slug}:${version}`)],
  );
  return inserted.rows[0]!.id;
}

async function insertCompletedCapture(pool: Pool, snapshotId: string) {
  const inventorySha = sha256("ove354-inventory");
  const inserted = await pool.query<{ id: string }>(
    `insert into catalog_source_capture_runs (
       source_slug, source_snapshot_id, capture_schema_version,
       capture_tool_revision, state, source_host, endpoint_family,
       request_schema_version, openapi_sha256, license_sha256,
       observed_started_at, observed_ended_at, inventory_start_total,
       inventory_end_total, inventory_unique_codes, inventory_page_count,
       inventory_start_sha256, inventory_end_sha256, manifest_sha256,
       zero_product_receipt
     ) values (
       'eppo-codes', $1, 'ove354-proof', $2, 'completed', 'api.eppo.int',
       'gd/v2', 'ove354-proof', $3, $4, now(), now(), $5, $5, $5, 1, $6, $6, $7,
       '{"status":"verified"}'::jsonb
     ) returning id`,
    [
      snapshotId,
      "a".repeat(40),
      sha256("openapi"),
      sha256("license"),
      REPRODUCIBLE_RECORDS + 2,
      inventorySha,
      sha256("manifest"),
    ],
  );
  return inserted.rows[0]!.id;
}

async function insertTerminalUnits(
  pool: Pool,
  captureId: string,
  code: string,
  ordinal: number,
  endpointClasses: readonly string[],
) {
  for (const endpointClass of endpointClasses) {
    const payload = syntheticUnitPayload(code, endpointClass);
    await pool.query(
      `insert into catalog_source_capture_units (
         capture_id, unit_kind, unit_key, eppo_code, identifier_class,
         endpoint_class, inventory_ordinal, state, request_schema_version,
         observed_at, http_status_class, response_sha256, raw_payload
       ) values ($1, 'taxon_endpoint', $2, $2, 'documented_eppo_code', $3, $4,
         'captured', 'ove354-proof', now(), '2xx', $5, $6::jsonb)`,
      [
        captureId,
        code,
        endpointClass,
        ordinal,
        sha256(`${code}:${endpointClass}`),
        JSON.stringify(payload),
      ],
    );
  }
}

/**
 * Reproduces the exact statement the pre-0042 materialize ran for one code:
 * the aggregated payload inline, and its digest beside it.
 */
async function insertInlineRecordFromUnits(
  pool: Pool,
  snapshotId: string,
  captureId: string,
  code: string,
  overrideDigest?: string,
  incompleteRecordKey?: string,
) {
  const aggregate = await pool.query<{ payload: unknown; digest: string }>(
    `select
       jsonb_object_agg(units.endpoint_class, units.raw_payload order by units.endpoint_class) as payload,
       encode(digest(convert_to(jsonb_object_agg(units.endpoint_class, units.raw_payload order by units.endpoint_class)::text, 'utf8'), 'sha256'), 'hex') as digest
       from catalog_source_capture_units units
      where units.capture_id = $1
        and units.eppo_code = $2
        and units.unit_kind = 'taxon_endpoint'
        and units.state in ('captured', 'source_only', 'forbidden', 'not_applicable')
      group by units.eppo_code`,
    [captureId, code],
  );
  const row = aggregate.rows[0];
  if (!row) throw new Error("proof_seed_produced_no_aggregate");
  const digest = overrideDigest ?? row.digest;
  await pool.query(
    `insert into catalog_source_records (
       source_snapshot_id, source_record_id, raw_payload, raw_payload_home,
       raw_payload_sha256, projection_status
     ) values ($1, $2, $3::jsonb, 'inline', $4, 'quarantined')`,
    [
      snapshotId,
      incompleteRecordKey ?? code,
      JSON.stringify(row.payload),
      digest,
    ],
  );
  return digest;
}

async function insertStandaloneInlineRecord(
  pool: Pool,
  snapshotId: string,
  recordKey: string,
) {
  const payload = { record: recordKey, body: syntheticText(recordKey, 2_000) };
  const digest = sha256(JSON.stringify(payload));
  await pool.query(
    `insert into catalog_source_records (
       source_snapshot_id, source_record_id, raw_payload, raw_payload_home,
       raw_payload_sha256, projection_status
     ) values ($1, $2, $3::jsonb, 'inline', $4, 'projected')`,
    [snapshotId, recordKey, JSON.stringify(payload), digest],
  );
  return digest;
}

interface PassResult {
  batchCount: number;
  candidates: number;
  deduplicated: number;
  held: number;
  maxBatchDurationMs: number;
}

async function runDeduplicationPass(
  db: Kysely<Database>,
  input: { snapshotId: string; batchSize: number },
): Promise<PassResult> {
  const result: PassResult = {
    batchCount: 0,
    candidates: 0,
    deduplicated: 0,
    held: 0,
    maxBatchDurationMs: 0,
  };
  const exhausted = new Set<string>();

  for (;;) {
    const startedAt = performance.now();
    const batch = await db.transaction().execute(async (transaction) => {
      const claimed = await buildClaimEppoSourceRecordBatchQuery(transaction, {
        sourceSnapshotId: input.snapshotId,
        payloadHome: "inline",
        batchSize: input.batchSize,
      }).execute();
      // A held record stays inline and would be claimed again forever, so a
      // pass ends when a batch brings nothing it has not already seen.
      const fresh = claimed.filter((row) => !exhausted.has(row.id));
      if (fresh.length === 0) return { claimed: 0, moved: 0 };
      const moved = await buildDeduplicateEppoSourceRecordPayloadsQuery(
        transaction,
        { recordIds: fresh.map((row) => row.id) },
      ).execute();
      for (const row of fresh) exhausted.add(row.id);
      return { claimed: fresh.length, moved: moved.length };
    });
    const batchDurationMs = performance.now() - startedAt;
    result.maxBatchDurationMs = Math.max(
      result.maxBatchDurationMs,
      batchDurationMs,
    );
    if (batch.claimed === 0) break;
    result.batchCount += 1;
    result.candidates += batch.claimed;
    result.deduplicated += batch.moved;
    result.held += batch.claimed - batch.moved;
    if (result.batchCount > 1_000) {
      throw new Error("source_payload_pass_did_not_converge");
    }
  }

  return result;
}

async function runRestorePass(
  db: Kysely<Database>,
  input: { snapshotId: string; batchSize: number },
): Promise<number> {
  let restored = 0;
  for (;;) {
    const moved = await db.transaction().execute(async (transaction) => {
      const claimed = await buildClaimEppoSourceRecordBatchQuery(transaction, {
        sourceSnapshotId: input.snapshotId,
        payloadHome: "capture_units",
        batchSize: input.batchSize,
      }).execute();
      if (claimed.length === 0) return 0;
      const rebuilt = await buildRestoreEppoSourceRecordPayloadsQuery(
        transaction,
        { recordIds: claimed.map((row) => row.id) },
      ).execute();
      return rebuilt.length;
    });
    if (moved === 0) break;
    restored += moved;
  }
  return restored;
}

/**
 * AC-05. Both transactions claim at the same time and neither waits, so a
 * record can appear in at most one of the two sets.
 */
async function concurrentClaimOverlap(
  pool: Pool,
  input: { snapshotId: string; batchSize: number },
): Promise<number> {
  const left = await pool.connect();
  const right = await pool.connect();
  try {
    await left.query("begin");
    await right.query("begin");
    const [leftRows, rightRows] = await Promise.all([
      claimIds(left, input),
      claimIds(right, input),
    ]);
    await left.query("rollback");
    await right.query("rollback");
    const leftSet = new Set(leftRows);
    return rightRows.filter((id) => leftSet.has(id)).length;
  } finally {
    left.release();
    right.release();
  }
}

async function claimIds(
  client: PoolClient,
  input: { snapshotId: string; batchSize: number },
): Promise<string[]> {
  const claimed = await client.query<{ id: string }>(
    `select id from catalog_source_records
      where source_snapshot_id = $1 and raw_payload_home = 'capture_units'
      order by id asc limit $2 for update skip locked`,
    [input.snapshotId, input.batchSize],
  );
  return claimed.rows.map((row) => row.id);
}

/** AC-06. A batch that never commits leaves every record exactly as it was. */
async function assertAbortedBatchLeavesRecordsInline(
  pool: Pool,
  db: Kysely<Database>,
  input: { snapshotId: string; batchSize: number },
) {
  const before = await countByHome(pool);
  await db
    .transaction()
    .execute(async (transaction) => {
      const claimed = await buildClaimEppoSourceRecordBatchQuery(transaction, {
        sourceSnapshotId: input.snapshotId,
        payloadHome: "inline",
        batchSize: input.batchSize,
      }).execute();
      await buildDeduplicateEppoSourceRecordPayloadsQuery(transaction, {
        recordIds: claimed.map((row) => row.id),
      }).execute();
      throw new Error("operator_aborted_backfill");
    })
    .catch((error: unknown) => {
      if ((error as Error).message !== "operator_aborted_backfill") throw error;
    });
  const after = await countByHome(pool);
  if (before.inline !== after.inline || before.captureUnits !== after.captureUnits) {
    throw new Error("aborted_batch_left_a_half_applied_effect");
  }
}

/** AC-03. Both directions of the disagreement must be refused by the database. */
async function assertPayloadHomeCheckRefusesBothDirections(pool: Pool) {
  // An inline row emptied without moving its home.
  const emptiedWhileInline = await refused(
    pool,
    `update catalog_source_records set raw_payload = null
      where raw_payload_home = 'inline' and raw_payload is not null`,
  );
  // A row declared moved while it still holds the bytes.
  const keptWhileMoved = await refused(
    pool,
    `update catalog_source_records set raw_payload_home = 'capture_units'
      where raw_payload_home = 'inline' and raw_payload is not null`,
  );
  // A home outside the closed set.
  const unknownHome = await refused(
    pool,
    `update catalog_source_records set raw_payload_home = 'object_storage'
      where raw_payload_home = 'inline'`,
  );
  if (!emptiedWhileInline || !keptWhileMoved || !unknownHome) {
    throw new Error("payload_home_check_did_not_refuse");
  }
}

async function refused(pool: Pool, statement: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(statement.replace(" limit_marker", ""));
    await client.query("rollback");
    return false;
  } catch {
    await client.query("rollback").catch(() => undefined);
    return true;
  } finally {
    client.release();
  }
}

async function digestsMatchSeed(pool: Pool, expected: Map<string, string>) {
  const rows = await pool.query<{
    source_record_id: string;
    raw_payload_sha256: string;
  }>(`select source_record_id, raw_payload_sha256 from catalog_source_records`);
  if (rows.rows.length !== expected.size) return false;
  return rows.rows.every(
    (row) => expected.get(row.source_record_id) === row.raw_payload_sha256,
  );
}

async function assertHomeAndPayloadAgree(pool: Pool) {
  const violations = await pool.query<{ count: string }>(
    `select count(*)::text as count from catalog_source_records
      where (raw_payload_home = 'inline' and raw_payload is null)
         or (raw_payload_home = 'capture_units' and raw_payload is not null)`,
  );
  if (violations.rows[0]?.count !== "0") {
    throw new Error("payload_home_and_presence_disagree");
  }
}

async function assertOtherFamilyStaysInline(pool: Pool, snapshotId: string) {
  const rows = await pool.query<{ raw_payload_home: string }>(
    `select raw_payload_home from catalog_source_records
      where source_snapshot_id = $1`,
    [snapshotId],
  );
  if (rows.rows.some((row) => row.raw_payload_home !== "inline")) {
    throw new Error("a_source_family_without_capture_units_was_deduplicated");
  }
}

/**
 * The restored bytes must reproduce the digest the record was created with.
 *
 * Only the records that were actually deduplicated are checked: the held cases
 * were seeded to be irreproducible on purpose, and asserting against them would
 * be asserting against the fixture rather than the restore.
 */
async function assertRestoredPayloadsReproduceTheirDigest(
  pool: Pool,
  reproducibleCodes: readonly string[],
) {
  const mismatched = await pool.query<{ count: string }>(
    `select count(*)::text as count from catalog_source_records
      where source_record_id = any($1::text[])
        and (
          raw_payload_home <> 'inline'
          or raw_payload is null
          or encode(digest(convert_to(raw_payload::text, 'utf8'), 'sha256'), 'hex')
               <> raw_payload_sha256
        )`,
    [reproducibleCodes],
  );
  if (mismatched.rows[0]?.count !== "0") {
    throw new Error("restored_payload_does_not_reproduce_its_digest");
  }
}

async function countByHome(pool: Pool) {
  const rows = await pool.query<{ raw_payload_home: string; count: string }>(
    `select raw_payload_home, count(*)::text as count
       from catalog_source_records group by raw_payload_home`,
  );
  return {
    inline: Number(
      rows.rows.find((row) => row.raw_payload_home === "inline")?.count ?? 0,
    ),
    captureUnits: Number(
      rows.rows.find((row) => row.raw_payload_home === "capture_units")
        ?.count ?? 0,
    ),
  };
}

/**
 * An `update` that nulls a column leaves the old row versions behind, so the
 * relation grows before it shrinks. Reclaiming first is what makes the
 * before/after comparison mean what it says.
 */
async function reclaimAndMeasure(pool: Pool): Promise<number> {
  await pool.query("vacuum full catalog_source_records");
  await pool.query("analyze catalog_source_records");
  const size = await pool.query<{ bytes: string }>(
    `select pg_total_relation_size('catalog_source_records')::text as bytes`,
  );
  return Number(size.rows[0]!.bytes);
}

function taxonCode(index: number): string {
  return `AA${index.toString().padStart(3, "0")}`;
}

/**
 * Deterministic, poorly compressible filler at the observed per-row cost.
 *
 * Repeated characters would collapse under TOAST compression and the measured
 * reduction would prove nothing about real payloads.
 */
function syntheticText(seed: string, bytes: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let state = 0;
  for (const character of seed) {
    state = (state * 31 + character.charCodeAt(0)) >>> 0;
  }
  let out = "";
  while (out.length < bytes) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    out += alphabet[state % alphabet.length];
  }
  return out;
}

/**
 * Real EPPO payloads carry accented Latin and Cyrillic preferred names, so the
 * fixture carries them too. An ASCII-only fixture would let a change to the
 * digest's text encoding pass unnoticed, and the digest is the only thing
 * standing between a smaller table and destroyed provenance.
 */
const NON_ASCII_NAME_EVIDENCE = [
  "Solanum lycopersicum",
  "tomate cerise à grappes",
  "Gemüsepaprika",
  "помідор",
  "домат",
  "Чорнобривці",
] as const;

function syntheticUnitPayload(code: string, endpointClass: string) {
  return {
    endpoint: endpointClass,
    preferredNames: [...NON_ASCII_NAME_EVIDENCE],
    observed: syntheticText(`${code}:${endpointClass}`, UNIT_PAYLOAD_BYTES),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
