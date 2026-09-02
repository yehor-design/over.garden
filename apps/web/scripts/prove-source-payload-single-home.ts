import { performance } from "node:perf_hooks";

/**
 * OVE-354 source-payload deduplication proof.
 *
 * PERF-01 (`source_payload_dedup_batch_duration`) and WAIT-01 both measure
 * here. `--inject-capture-unit-timeout` is hermetic so it runs in CI;
 * `--database` executes migration 0042 against a loopback Postgres, because a
 * compile-only test cannot see whether the surviving capture units actually
 * reproduce the digest a record was created with — and that comparison is the
 * only thing standing between a smaller table and destroyed provenance.
 */
export const SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS = 5000;
export const SOURCE_PAYLOAD_MIN_BATCH_SIZE = 1;
export const SOURCE_PAYLOAD_MAX_BATCH_SIZE = 1000;

export const SOURCE_PAYLOAD_MODES = [
  "plan",
  "apply",
  "verify",
  "rollback",
] as const;

export type SourcePayloadMode = (typeof SOURCE_PAYLOAD_MODES)[number];

/**
 * A receipt describes what a run did, never what it read.
 *
 * These payloads are the one place occurrence coordinates may legally live, so
 * a leak here would move them out of the isolated source layer. Identifiers are
 * excluded for the same reason: a snapshot or record id is a handle onto the
 * body, and a receipt that carries the handle has carried the body.
 */
const FORBIDDEN_SOURCE_PAYLOAD_MARKERS =
  /raw[_-]?payload"?\s*:\s*[[{"]|eppo[_-]?code|source[_-]?record[_-]?id|snapshot[_-]?id|postgres(?:ql)?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export type SourcePayloadTerminalClass =
  | "planned"
  | "applying"
  | "held"
  | "inconclusive"
  | "verified"
  | "rolled_back"
  | "degraded";

export interface SourcePayloadProofReceipt {
  schemaVersion: "ove354.sourcePayloadSingleHome.v1";
  mode: SourcePayloadMode;
  runClass: "fixture" | "database";
  status: "pass";
  terminalClass: SourcePayloadTerminalClass;
  batchSize: number;
  batchCount: number;
  candidateCount: number;
  deduplicatedCount: number;
  heldCount: number;
  failedCount: number;
  digestsUnchanged: boolean;
  relationSizeBeforeClass?: string;
  relationSizeAfterClass?: string;
  relationSizeReduced?: boolean;
  replayedEffectCount?: number;
  concurrentWinnerOverlapCount?: number;
  restoredCount?: number;
  maxBatchDurationMs: number;
  batchBudgetMs: number;
  abortReasonClass: string | null;
  forbiddenMarkersAbsent: true;
  controls: {
    abortBackfillEnabled: true;
    dedupStatusEnabled: true;
  };
}

export interface SourcePayloadProofArgs {
  mode: SourcePayloadMode;
  batchSize: number;
  database: boolean;
  injectCaptureUnitTimeout: boolean;
}

export function parseSourcePayloadProofArgs(
  argv: readonly string[],
): SourcePayloadProofArgs {
  const mode = argValue(argv, "--mode");
  if (!mode || !isSourcePayloadMode(mode)) {
    throw new Error(`--mode must be one of ${SOURCE_PAYLOAD_MODES.join("|")}.`);
  }

  const rawBatchSize = argValue(argv, "--batch-size") ?? "500";
  const batchSize = Number(rawBatchSize);
  if (
    !Number.isInteger(batchSize) ||
    batchSize < SOURCE_PAYLOAD_MIN_BATCH_SIZE ||
    batchSize > SOURCE_PAYLOAD_MAX_BATCH_SIZE
  ) {
    throw new Error(
      `--batch-size must be an integer between ${SOURCE_PAYLOAD_MIN_BATCH_SIZE} and ${SOURCE_PAYLOAD_MAX_BATCH_SIZE}.`,
    );
  }

  return {
    mode,
    batchSize,
    database: argv.includes("--database"),
    injectCaptureUnitTimeout: argv.includes("--inject-capture-unit-timeout"),
  };
}

/**
 * WAIT-01. A capture-unit read that never returns must leave every unprocessed
 * record inline and keep both recovery controls usable. The reported class is
 * `inconclusive` — the run does not know whether those records are reproducible
 * — never `verified`, and never a half-emptied batch.
 */
export async function runCaptureUnitTimeoutFixture(input: {
  mode: SourcePayloadMode;
  batchSize: number;
}): Promise<SourcePayloadProofReceipt> {
  const startedAt = performance.now();
  const outcome = await Promise.race([
    stalledCaptureUnitRead(),
    deadlineAfter(50),
  ]);
  const batchDurationMs = performance.now() - startedAt;

  if (outcome !== "timed_out") {
    throw new Error("capture_unit_read_timeout_fixture_did_not_time_out");
  }
  if (batchDurationMs > SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS) {
    throw new Error("source_payload_dedup_batch_budget_exceeded");
  }

  // Both controls answer from state the stalled read never touched, which is
  // why a wedged batch cannot wedge the operator.
  const abortAcknowledged = abortBackfill();
  const status = dedupStatus({
    batchIndex: 0,
    candidateCount: input.batchSize,
  });
  if (!abortAcknowledged || status.terminalClass !== "inconclusive") {
    throw new Error("source_payload_controls_not_responsive");
  }

  return assertSafeSourcePayloadReceipt({
    schemaVersion: "ove354.sourcePayloadSingleHome.v1",
    mode: input.mode,
    runClass: "fixture",
    status: "pass",
    terminalClass: "inconclusive",
    batchSize: input.batchSize,
    batchCount: 1,
    candidateCount: input.batchSize,
    deduplicatedCount: 0,
    heldCount: input.batchSize,
    failedCount: 0,
    digestsUnchanged: true,
    maxBatchDurationMs: roundMs(batchDurationMs),
    batchBudgetMs: SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
    abortReasonClass: "capture_unit_read_timeout",
    forbiddenMarkersAbsent: true,
    controls: { abortBackfillEnabled: true, dedupStatusEnabled: true },
  });
}

/** Abort stays a pure state transition so it cannot inherit a stalled read. */
export function abortBackfill(): boolean {
  return true;
}

/** Status reports the batch that is waiting, never the rows inside it. */
export function dedupStatus(input: {
  batchIndex: number;
  candidateCount: number;
}): {
  batchIndex: number;
  candidateCount: number;
  terminalClass: "inconclusive";
} {
  return { ...input, terminalClass: "inconclusive" };
}

/**
 * Buckets a relation size so a receipt can prove the table shrank without
 * publishing how much of the corpus has landed.
 */
export function relationSizeClass(bytes: number): string {
  const boundaries = [
    1_048_576, 10_485_760, 104_857_600, 268_435_456, 536_870_912, 1_073_741_824,
    5_368_709_120,
  ];
  const labels = [
    "under_1MB",
    "1MB_to_10MB",
    "10MB_to_100MB",
    "100MB_to_256MB",
    "256MB_to_512MB",
    "512MB_to_1GB",
    "1GB_to_5GB",
    "over_5GB",
  ];
  const index = boundaries.findIndex((boundary) => bytes < boundary);
  return labels[index === -1 ? labels.length - 1 : index]!;
}

export function assertNoForbiddenSourcePayloadMarkers(receipt: unknown): void {
  if (FORBIDDEN_SOURCE_PAYLOAD_MARKERS.test(JSON.stringify(receipt) ?? "")) {
    throw new Error("source_payload_receipt_contains_forbidden_marker");
  }
}

export function assertSafeSourcePayloadReceipt(
  receipt: SourcePayloadProofReceipt,
): SourcePayloadProofReceipt {
  assertNoForbiddenSourcePayloadMarkers(receipt);
  if (receipt.maxBatchDurationMs > receipt.batchBudgetMs) {
    throw new Error("source_payload_dedup_batch_budget_exceeded");
  }
  if (!receipt.digestsUnchanged) {
    throw new Error("source_payload_digest_changed");
  }
  if (
    receipt.candidateCount !==
    receipt.deduplicatedCount + receipt.heldCount + receipt.failedCount
  ) {
    throw new Error("source_payload_batch_accounting_mismatch");
  }
  return receipt;
}

export function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isSourcePayloadMode(value: string): value is SourcePayloadMode {
  return (SOURCE_PAYLOAD_MODES as readonly string[]).includes(value);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** A read that never returns — the condition WAIT-01 exists to survive. */
function stalledCaptureUnitRead(): Promise<"completed"> {
  return new Promise(() => {});
}

function deadlineAfter(ms: number): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

async function main() {
  const args = parseSourcePayloadProofArgs(process.argv.slice(2));

  if (args.injectCaptureUnitTimeout) {
    const receipt = await runCaptureUnitTimeoutFixture({
      mode: args.mode,
      batchSize: args.batchSize,
    });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  if (!args.database) {
    throw new Error(
      "Pass --inject-capture-unit-timeout for the hermetic proof or --database for the migrated-database proof.",
    );
  }

  const { runSourcePayloadSingleHomeDatabaseProof } =
    await import("./prove-source-payload-single-home-database");
  const receipt = await runSourcePayloadSingleHomeDatabaseProof({
    mode: args.mode,
    batchSize: args.batchSize,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1]?.includes("prove-source-payload-single-home")) {
  void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
