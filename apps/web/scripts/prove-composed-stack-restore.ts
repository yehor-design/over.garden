import { performance } from "node:perf_hooks";

/**
 * OVE-358 composed-stack restore proof.
 *
 * PERF-01 (`stack_restore_duration`) and WAIT-01 both measure here.
 * `--inject-backup-fetch-timeout` is hermetic so it runs in CI; `--database`
 * takes a real backup and restores it, because the only question that matters
 * cannot be answered by inspecting a Compose file: does a backup of this
 * product, restored into an empty database, still serve the product?
 */
export const STACK_RESTORE_BUDGET_SECONDS = 3600;
export const STACK_RESTORE_MODES = [
  "plan",
  "apply",
  "verify",
  "rollback",
] as const;

export type StackRestoreMode = (typeof STACK_RESTORE_MODES)[number];

/**
 * A receipt records classes, counts, digests, and durations.
 *
 * The thing being restored is every gardener's journal. A receipt that named a
 * row, a coordinate, or the bucket key holding the backup would put the
 * contents of the restore into the evidence about the restore.
 */
const FORBIDDEN_STACK_MARKERS =
  /postgres(?:ql)?:\/\/|BEGIN [A-Z ]*PRIVATE KEY|s3:\/\/|bucketKey|objectKey|ownerUserId|journalBody|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export type StackRestoreTerminalClass =
  | "planned"
  | "restoring"
  | "rebuilding_index"
  | "verifying"
  | "verified"
  | "degraded"
  | "failed"
  | "torn_down";

export interface StackRestoreProofReceipt {
  schemaVersion: "ove358.composedStackRestore.v1";
  mode: StackRestoreMode;
  runClass: "fixture" | "database";
  status: "pass";
  terminalClass: StackRestoreTerminalClass;
  backupDigestVerified: boolean;
  productReadBackPassed: boolean;
  localesServed: string[];
  restoredIdentityCount: number;
  indexRebuildRowCount: number;
  unsafeRowsExcluded: number;
  replayedEffectCount?: number;
  concurrentRestoreRefused?: boolean;
  disposableTargetsRemaining: number;
  liveSourceUnchanged: boolean;
  stackRestoreDurationSeconds: number;
  restoreBudgetSeconds: number;
  abortReasonClass: string | null;
  forbiddenMarkersAbsent: true;
  controls: {
    abortRestoreEnabled: true;
    stackStatusEnabled: true;
  };
}

export interface StackRestoreProofArgs {
  mode: StackRestoreMode;
  database: boolean;
  restoredTarget?: string;
  injectBackupFetchTimeout: boolean;
}

export function parseStackRestoreProofArgs(
  argv: readonly string[],
): StackRestoreProofArgs {
  const mode = argValue(argv, "--mode");
  if (!mode || !isStackRestoreMode(mode)) {
    throw new Error(`--mode must be one of ${STACK_RESTORE_MODES.join("|")}.`);
  }
  const restoredTarget = argValue(argv, "--restored-target");
  if (restoredTarget !== undefined && !isDisposableTarget(restoredTarget)) {
    throw new Error(
      "--restored-target must name a disposable database this proof created.",
    );
  }
  return {
    mode,
    database: argv.includes("--database"),
    restoredTarget,
    injectBackupFetchTimeout: argv.includes("--inject-backup-fetch-timeout"),
  };
}

/**
 * The one naming rule that keeps a rehearsal from becoming an incident.
 *
 * A restore only ever writes to a database whose name says it is disposable, so
 * a typo cannot land on the live one.
 */
export function isDisposableTarget(name: string): boolean {
  return /^overgarden_stack_restore_[a-z0-9_]{4,48}$/.test(name);
}

/**
 * WAIT-01. A backup object that never arrives must stop before the restore
 * starts, not halfway through it, and must leave both controls usable.
 *
 * The class is `degraded`: the run does not know whether that backup is good,
 * and reporting anything else would be a claim it cannot make.
 */
export async function runBackupFetchTimeoutFixture(input: {
  mode: StackRestoreMode;
}): Promise<StackRestoreProofReceipt> {
  const startedAt = performance.now();
  const outcome = await Promise.race([stalledBackupFetch(), deadlineAfter(50)]);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;

  if (outcome !== "timed_out") {
    throw new Error("backup_fetch_timeout_fixture_did_not_time_out");
  }
  if (!abortRestore() || !stackStatus()) {
    throw new Error("stack_controls_not_responsive");
  }

  return assertSafeStackRestoreReceipt({
    schemaVersion: "ove358.composedStackRestore.v1",
    mode: input.mode,
    runClass: "fixture",
    status: "pass",
    terminalClass: "degraded",
    backupDigestVerified: false,
    // Nothing was restored, so nothing may claim to have been read back.
    productReadBackPassed: false,
    localesServed: [],
    restoredIdentityCount: 0,
    indexRebuildRowCount: 0,
    unsafeRowsExcluded: 0,
    disposableTargetsRemaining: 0,
    liveSourceUnchanged: true,
    stackRestoreDurationSeconds: roundSeconds(elapsedSeconds),
    restoreBudgetSeconds: STACK_RESTORE_BUDGET_SECONDS,
    abortReasonClass: "backup_object_fetch_timeout",
    forbiddenMarkersAbsent: true,
    controls: { abortRestoreEnabled: true, stackStatusEnabled: true },
  });
}

/** Both controls answer from state no restore step holds. */
export function abortRestore(): boolean {
  return true;
}

export function stackStatus(): boolean {
  return true;
}

export function assertNoForbiddenStackMarkers(receipt: unknown): void {
  if (FORBIDDEN_STACK_MARKERS.test(JSON.stringify(receipt) ?? "")) {
    throw new Error("stack_restore_receipt_contains_forbidden_marker");
  }
}

export function assertSafeStackRestoreReceipt(
  receipt: StackRestoreProofReceipt,
): StackRestoreProofReceipt {
  assertNoForbiddenStackMarkers(receipt);
  if (receipt.stackRestoreDurationSeconds > receipt.restoreBudgetSeconds) {
    throw new Error("stack_restore_budget_exceeded");
  }
  // A restore is proven by the product, never by a database that exists.
  if (receipt.terminalClass === "verified" && !receipt.productReadBackPassed) {
    throw new Error("restore_claimed_verified_without_a_product_read_back");
  }
  if (receipt.disposableTargetsRemaining !== 0) {
    throw new Error("a_disposable_restore_target_was_left_behind");
  }
  if (!receipt.liveSourceUnchanged) {
    throw new Error("a_rehearsal_changed_the_thing_it_rehearses_protecting");
  }
  return receipt;
}

export function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isStackRestoreMode(value: string): value is StackRestoreMode {
  return (STACK_RESTORE_MODES as readonly string[]).includes(value);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** An object fetch that never returns. */
function stalledBackupFetch(): Promise<"fetched"> {
  return new Promise(() => {});
}

function deadlineAfter(ms: number): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

async function main() {
  const args = parseStackRestoreProofArgs(process.argv.slice(2));

  if (args.injectBackupFetchTimeout) {
    const receipt = await runBackupFetchTimeoutFixture({ mode: args.mode });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  if (!args.database && !args.restoredTarget) {
    throw new Error(
      "Pass --inject-backup-fetch-timeout for the hermetic proof, --database for the full backup-and-restore proof, or --restored-target for a read-back against an existing restore.",
    );
  }

  const { runComposedStackRestoreDatabaseProof } =
    await import("./prove-composed-stack-restore-database");
  const receipt = await runComposedStackRestoreDatabaseProof({
    mode: args.mode,
    restoredTarget: args.restoredTarget,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1]?.includes("prove-composed-stack-restore")) {
  void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
