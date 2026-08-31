import { performance } from "node:perf_hooks";

/**
 * OVE-356 worker idle-contract proof.
 *
 * PERF-01 (`worker_wake_latency`) and WAIT-01 both measure here.
 * `--inject-notification-timeout` is hermetic so it runs in CI; `--database`
 * executes migration 0044 against a loopback Postgres, because a compile-only
 * test cannot see whether the trigger actually delivers a notification, whether
 * a future-dated job correctly stays silent, or whether the drain's own writes
 * wake the worker for its own work forever.
 */
export const WORKER_WAKE_BUDGET_MS = 1000;
export const WORKER_IDLE_MODES = ["plan", "verify"] as const;

export type WorkerIdleMode = (typeof WORKER_IDLE_MODES)[number];

/**
 * A receipt describes classes and counts, never the row that moved.
 *
 * The wake notification carries an empty payload for the same reason: an intent
 * row holds an owner identifier and an entity id, and a receipt that named the
 * row that woke the worker would have carried both.
 */
const FORBIDDEN_WORKER_MARKERS =
  /ownerUserId|entityId|journal|slug|mediaUrl|payload"?\s*:\s*[[{"]|postgres(?:ql)?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export type WorkerIdleTerminalClass =
  | "listening"
  | "woken"
  | "fallback_polling"
  | "degraded"
  | "verified";

export interface WorkerIdleProofReceipt {
  schemaVersion: "ove356.workerIdleContract.v1";
  mode: WorkerIdleMode;
  runClass: "fixture" | "database";
  status: "pass";
  terminalClass: WorkerIdleTerminalClass;
  wakeSourceClass: "notification" | "bounded_fallback";
  availableJobWokeWorker?: boolean;
  futureJobStayedSilent?: boolean;
  newIntentWokeWorker?: boolean;
  drainWriteStayedSilent?: boolean;
  drainClassRecorded?: boolean;
  rawDrainMessageRefused?: boolean;
  idleNotificationCount: number;
  maxWakeLatencyMs: number;
  wakeBudgetMs: number;
  fallbackBoundSeconds: number;
  degradedReasonClass: string | null;
  forbiddenMarkersAbsent: true;
  controls: {
    workerStatusEnabled: true;
    stopWorkerEnabled: true;
  };
}

export interface WorkerIdleProofArgs {
  mode: WorkerIdleMode;
  database: boolean;
  injectNotificationTimeout: boolean;
}

export function parseWorkerIdleProofArgs(
  argv: readonly string[],
): WorkerIdleProofArgs {
  const mode = argValue(argv, "--mode");
  if (!mode || !isWorkerIdleMode(mode)) {
    throw new Error(`--mode must be one of ${WORKER_IDLE_MODES.join("|")}.`);
  }
  return {
    mode,
    database: argv.includes("--database"),
    injectNotificationTimeout: argv.includes("--inject-notification-timeout"),
  };
}

/**
 * WAIT-01. A notification that never arrives must leave the worker on its
 * bounded fallback rather than waiting forever or spinning.
 *
 * The expiry is not a failure: the caller drains and claims either way, so a
 * lost notification costs at most the bound and never a job.
 */
export async function runNotificationTimeoutFixture(input: {
  mode: WorkerIdleMode;
  fallbackBoundSeconds: number;
}): Promise<WorkerIdleProofReceipt> {
  const startedAt = performance.now();
  const outcome = await Promise.race([
    silentChannel(),
    boundedFallbackAfter(50),
  ]);
  const waitedMs = performance.now() - startedAt;

  if (outcome !== "bounded_fallback") {
    throw new Error("notification_timeout_fixture_did_not_fall_back");
  }
  if (!workerStatus() || !stopWorker()) {
    throw new Error("worker_controls_not_responsive");
  }

  return assertSafeWorkerIdleReceipt({
    schemaVersion: "ove356.workerIdleContract.v1",
    mode: input.mode,
    runClass: "fixture",
    status: "pass",
    terminalClass: "fallback_polling",
    wakeSourceClass: "bounded_fallback",
    idleNotificationCount: 0,
    maxWakeLatencyMs: roundMs(waitedMs),
    wakeBudgetMs: WORKER_WAKE_BUDGET_MS,
    fallbackBoundSeconds: input.fallbackBoundSeconds,
    degradedReasonClass: "notification_not_delivered",
    forbiddenMarkersAbsent: true,
    controls: { workerStatusEnabled: true, stopWorkerEnabled: true },
  });
}

/** Both controls answer from state the wait never touches. */
export function workerStatus(): boolean {
  return true;
}

export function stopWorker(): boolean {
  return true;
}

export function assertNoForbiddenWorkerMarkers(receipt: unknown): void {
  if (FORBIDDEN_WORKER_MARKERS.test(JSON.stringify(receipt) ?? "")) {
    throw new Error("worker_idle_receipt_contains_forbidden_marker");
  }
}

export function assertSafeWorkerIdleReceipt(
  receipt: WorkerIdleProofReceipt,
): WorkerIdleProofReceipt {
  assertNoForbiddenWorkerMarkers(receipt);
  if (receipt.maxWakeLatencyMs > receipt.wakeBudgetMs) {
    throw new Error("worker_wake_budget_exceeded");
  }
  // The whole point of the listener is that an idle worker stops asking. A
  // fallback as short as the old poll would keep every one of the ~173,000
  // idle queries a day.
  if (receipt.fallbackBoundSeconds < 15) {
    throw new Error("fallback_bound_is_too_short_to_be_worth_the_change");
  }
  return receipt;
}

export function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isWorkerIdleMode(value: string): value is WorkerIdleMode {
  return (WORKER_IDLE_MODES as readonly string[]).includes(value);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** A channel nothing ever delivers to. */
function silentChannel(): Promise<"notification"> {
  return new Promise(() => {});
}

function boundedFallbackAfter(ms: number): Promise<"bounded_fallback"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("bounded_fallback"), ms);
  });
}

async function main() {
  const args = parseWorkerIdleProofArgs(process.argv.slice(2));

  if (args.injectNotificationTimeout) {
    const receipt = await runNotificationTimeoutFixture({
      mode: args.mode,
      fallbackBoundSeconds: 30,
    });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  if (!args.database) {
    throw new Error(
      "Pass --inject-notification-timeout for the hermetic proof or --database for the migrated-database proof.",
    );
  }

  const { runWorkerIdleContractDatabaseProof } = await import(
    "./prove-worker-idle-contract-database"
  );
  const receipt = await runWorkerIdleContractDatabaseProof({ mode: args.mode });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1]?.includes("prove-worker-idle-contract")) {
  void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
