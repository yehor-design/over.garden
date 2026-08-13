import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import {
  createProductionJournalWorkerAdapter,
  isApprovedProductionRuntimeCondition,
  waitForJournalWorkerCondition,
  type JournalWorkerBoundary,
  type JournalWorkerCleanupReadback,
  type JournalWorkerVerification,
  type ProductionJournalWorkerTaskConfig,
  type ProductionJournalWorkerAdapter,
} from "./recertify-final-main-journal-worker";

export const OVE310_APPROVED_PLAN =
  "OVE-310|production|classify the production Linux runtime, restart exactly the matching-worker container once, wait for healthy heartbeat, publish and archive one owner-scoped disposable journal canary, verify safe index and unindex convergence, then erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required" as const;
export const OVE310_APPROVAL_DIGEST =
  "c356930237369dc81e5937965a43a0979b5270cc17ad5f1bff163315a75e4bf3" as const;
export const OVE310_WORKER_RECOVERY_TIMEOUT_MS = 180_000;
export const OVE310_DIRECT_PROVIDER_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));
const PRODUCTION_DROPLET = "overgarden-worker-prod-fra1";
const PRODUCTION_ROOT = "/opt/overgarden";
const RELEASE_STATE_DIRECTORY = `${PRODUCTION_ROOT}/release-state`;
const COMPOSE_FILE = `${PRODUCTION_ROOT}/docker-compose.release.yml`;
const ACTIVE_ENV_FILE = `${RELEASE_STATE_DIRECTORY}/active.env`;
const RELEASE_LOCK_FILE = `${RELEASE_STATE_DIRECTORY}/matching-release.lock`;
const PROVIDER_ATTEMPT_FILE = `${RELEASE_STATE_DIRECTORY}/ove310-worker-recovery-${OVE310_APPROVAL_DIGEST}.attempt`;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildLaunchWorkerReplayNamespace(implementationSha: string) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-310\0${implementationSha}\0${OVE310_APPROVAL_DIGEST}`);
}

export const OVE310_JOURNAL_TASK_CONFIG: ProductionJournalWorkerTaskConfig = {
  emailPrefix: "ove310-worker-recovery-",
  emailSuffix: "@over.garden",
  title: "OVE-310 disposable worker recovery proof",
  body: "Synthetic non-personal restart recovery convergence proof.",
  spaceName: "OVE-310 disposable worker recovery space",
  plantName: "OVE-310 disposable worker recovery plant",
  entryDate: "2026-08-13",
  statePrefix: "ove310-worker-recovery",
  applyLockKey: 3_100_310,
  buildReplayNamespace: buildLaunchWorkerReplayNamespace,
};

export type LaunchWorkerRecoveryState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type LaunchWorkerRecoveryResultClass =
  | "zero_effect_plan"
  | "verified_worker_restart_recovery"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type LaunchWorkerRecoveryCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface LaunchWorkerRecoveryReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE310_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE310_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: LaunchWorkerRecoveryResultClass;
  cleanupClass: LaunchWorkerRecoveryCleanupClass;
  durationMs: number;
  state: LaunchWorkerRecoveryState;
  evidenceDigest: string;
}

export interface LaunchWorkerRecoveryBoundary extends JournalWorkerBoundary {
  runtimeClass: "docker_compose_release" | "unexpected";
  roleCount: number;
  restartPolicyClass: "all_unless_stopped" | "unexpected";
  runtimeHealthClass: "all_running_required_health_healthy" | "unexpected";
  providerAttemptClass: "absent" | "present" | "unexpected";
}

export interface WorkerRestartVerification {
  restartCount: number;
  targetClass: "matching_worker_only" | "unexpected";
  workerRestartClass: "same_container_new_start" | "unexpected";
  peerRolesClass: "unchanged" | "unexpected";
  workerHealthClass: "healthy_after_restart" | "unexpected";
  heartbeatClass: "fresh_exact_release" | "unexpected";
}

export interface LaunchWorkerRecoveryAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<LaunchWorkerRecoveryBoundary>;
  readApplyAttempt(): Promise<boolean>;
  claimApplyAttempt(): Promise<"claimed" | "already_claimed">;
  restartWorker(signal?: AbortSignal): Promise<WorkerRestartVerification>;
  applyCanary(signal?: AbortSignal): Promise<JournalWorkerVerification>;
  cleanupCanary(signal?: AbortSignal): Promise<JournalWorkerCleanupReadback>;
  readReplayReceipt(): Promise<LaunchWorkerRecoveryReceiptV1 | null>;
  writeReplayReceipt(receipt: LaunchWorkerRecoveryReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface LaunchWorkerRecoveryRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type LaunchWorkerRecoveryCliArgs =
  | LaunchWorkerRecoveryRunOptions
  | {
      mode: "status" | "cancel" | "cleanup";
      environment: "production";
      implementationSha: string;
      timeoutMs: number;
    };

interface BuildReceiptInput {
  environment: "production";
  implementationSha: string;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: LaunchWorkerRecoveryResultClass;
  cleanupClass: LaunchWorkerRecoveryCleanupClass;
  durationMs: number;
  state: LaunchWorkerRecoveryState;
}

function buildReceipt(input: BuildReceiptInput): LaunchWorkerRecoveryReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE310_WORKER_RECOVERY_TIMEOUT_MS
  ) {
    throw new Error("launch worker recovery duration is invalid");
  }
  const payload: Omit<LaunchWorkerRecoveryReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE310_APPROVAL_DIGEST,
    authorizationDigest: OVE310_APPROVAL_DIGEST,
    canaryCountBefore: input.canaryCountBefore,
    applyCount: input.applyCount,
    resultClass: input.resultClass,
    cleanupClass: input.cleanupClass,
    durationMs: input.durationMs,
    state: input.state,
  };
  return {
    ...payload,
    evidenceDigest: sha256(
      `overgarden.ove310.worker-restart-recovery.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildLaunchWorkerFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE310_WORKER_RECOVERY_TIMEOUT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: LaunchWorkerRecoveryBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.ownerAccessClass === "task_owned_or_absent" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only" &&
    boundary.workerCapabilityClass === "ready_exact_handlers" &&
    boundary.runtimeClass === "docker_compose_release" &&
    boundary.roleCount === 4 &&
    boundary.restartPolicyClass === "all_unless_stopped" &&
    boundary.runtimeHealthClass === "all_running_required_health_healthy" &&
    boundary.providerAttemptClass === "absent"
  );
}

function isExactRestart(value: WorkerRestartVerification) {
  return (
    value.restartCount === 1 &&
    value.targetClass === "matching_worker_only" &&
    value.workerRestartClass === "same_container_new_start" &&
    value.peerRolesClass === "unchanged" &&
    value.workerHealthClass === "healthy_after_restart" &&
    value.heartbeatClass === "fresh_exact_release"
  );
}

function isExactJournalVerification(value: JournalWorkerVerification) {
  return (
    value.applyCount === 1 &&
    value.indexJobClass === "done_identifiers_only" &&
    value.publicDocumentClass === "public_safe_exact_shape" &&
    value.unindexJobClass === "done_identifiers_only" &&
    value.staleDocumentClass === "authoritative_absent" &&
    value.parityClass === "converged" &&
    value.responseClass === "http_410" &&
    value.tombstoneClass === "generic_content_free" &&
    value.robotsClass === "noindex_nofollow" &&
    value.publicEligibilityClass === "revoked" &&
    value.searchProjectionClass === "authoritative_absent" &&
    value.preciseLocationPresent === false &&
    value.privateContentPresent === false &&
    value.anotherOwnerEffects === 0
  );
}

function isClean(value: JournalWorkerCleanupReadback) {
  return (
    value.taskCanaryCount === 0 &&
    value.publicRoutePresent === false &&
    value.searchDocumentPresent === false &&
    value.anotherOwnerEffects === 0
  );
}

async function proveCleanupTwice(
  adapter: LaunchWorkerRecoveryAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  return isClean(await adapter.cleanupCanary(signal));
}

function isCompletedReceipt(receipt: LaunchWorkerRecoveryReceiptV1) {
  return (
    receipt.applyCount === 1 &&
    receipt.resultClass === "verified_worker_restart_recovery" &&
    receipt.cleanupClass === "authoritative_absent_twice" &&
    receipt.state === "cleaned"
  );
}

function buildAlreadyCleanedReceipt(
  implementationSha: string,
  startedAt: number,
) {
  return buildReceipt({
    environment: "production",
    implementationSha,
    canaryCountBefore: 0,
    applyCount: 0,
    resultClass: "already_cleaned",
    cleanupClass: "authoritative_absent_twice",
    durationMs: elapsedMs(startedAt),
    state: "already_cleaned",
  });
}

export async function runApprovedLaunchWorkerRecovery(
  options: LaunchWorkerRecoveryRunOptions,
  adapter: LaunchWorkerRecoveryAdapter,
  signal?: AbortSignal,
): Promise<LaunchWorkerRecoveryReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      if (await adapter.readApplyAttempt()) {
        return buildLaunchWorkerFailureReceipt({
          environment: "production",
          implementationSha: options.implementationSha,
          canaryCountBefore: 0,
          applyCount: 0,
          resultClass: "refused",
          cleanupClass: "not_applicable",
          durationMs: elapsedMs(startedAt),
          unsafeError: "apply already attempted",
        });
      }
      const boundary = await adapter.readBoundary(signal);
      if (!isExactBoundary(boundary, options.implementationSha)) {
        return buildLaunchWorkerFailureReceipt({
          environment: "production",
          implementationSha: options.implementationSha,
          canaryCountBefore: safeCount(boundary.canaryCount),
          applyCount: 0,
          resultClass: "refused",
          cleanupClass: "not_applicable",
          durationMs: elapsedMs(startedAt),
          unsafeError: "boundary drift",
        });
      }
      return buildReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "zero_effect_plan",
        cleanupClass: "not_applicable",
        durationMs: elapsedMs(startedAt),
        state: "code_deployed",
      });
    } catch (error) {
      return buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "failed",
        cleanupClass: "not_applicable",
        durationMs: elapsedMs(startedAt),
        unsafeError: error,
      });
    }
  }

  if (options.approvalDigest !== OVE310_APPROVAL_DIGEST) {
    return buildLaunchWorkerFailureReceipt({
      environment: "production",
      implementationSha: options.implementationSha,
      canaryCountBefore: 0,
      applyCount: 0,
      resultClass: "refused",
      cleanupClass: "not_started",
      durationMs: elapsedMs(startedAt),
      unsafeError: "approval drift",
    });
  }

  const replay = await adapter.readReplayReceipt();
  if (replay) {
    return isCompletedReceipt(replay)
      ? buildAlreadyCleanedReceipt(options.implementationSha, startedAt)
      : replay;
  }

  let locked = false;
  let attemptClaimed = false;
  let canaryCountBefore = 0;
  let applyCount = 0;
  try {
    if ((await adapter.acquireApplyLock(signal)) !== "acquired") {
      return buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "bounded_loser",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "lock contended",
      });
    }
    locked = true;

    const lockedReplay = await adapter.readReplayReceipt();
    if (lockedReplay) {
      return isCompletedReceipt(lockedReplay)
        ? buildAlreadyCleanedReceipt(options.implementationSha, startedAt)
        : lockedReplay;
    }
    if ((await adapter.claimApplyAttempt()) !== "claimed") {
      return buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "refused",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply is single-use",
      });
    }
    attemptClaimed = true;

    if (await adapter.cancellationRequested()) {
      const cancelled = buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "cancelled",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled",
      });
      await adapter.writeReplayReceipt(cancelled);
      return cancelled;
    }

    const boundary = await adapter.readBoundary(signal);
    canaryCountBefore = safeCount(boundary.canaryCount);
    if (!isExactBoundary(boundary, options.implementationSha)) {
      const refused = buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount: 0,
        resultClass: "refused",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "boundary drift",
      });
      await adapter.writeReplayReceipt(refused);
      return refused;
    }

    applyCount = 1;
    const restart = await adapter.restartWorker(signal);
    if (!isExactRestart(restart)) {
      throw new Error("worker restart verification drifted");
    }
    if (await adapter.cancellationRequested()) {
      throw new Error("worker recovery was cancelled after restart");
    }
    const journal = await adapter.applyCanary(signal);
    const cleaned = await proveCleanupTwice(adapter, signal).catch(() => false);
    if (!isExactJournalVerification(journal) || !cleaned) {
      const failure = buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount,
        resultClass: "failed",
        cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "journal verification or cleanup drift",
      });
      await adapter.writeReplayReceipt(failure);
      return failure;
    }

    const receipt = buildReceipt({
      environment: "production",
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "verified_worker_restart_recovery",
      cleanupClass: "authoritative_absent_twice",
      durationMs: elapsedMs(startedAt),
      state: "cleaned",
    });
    await adapter.writeReplayReceipt(receipt);
    return receipt;
  } catch (error) {
    const cleaned =
      applyCount > 0
        ? await proveCleanupTwice(adapter, signal).catch(() => false)
        : false;
    const failure = buildLaunchWorkerFailureReceipt({
      environment: "production",
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "failed",
      cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
      durationMs: elapsedMs(startedAt),
      unsafeError: error,
    });
    if (attemptClaimed)
      await adapter.writeReplayReceipt(failure).catch(() => undefined);
    return failure;
  } finally {
    if (locked) await adapter.releaseApplyLock().catch(() => undefined);
  }
}

export function settleLaunchWorkerRecoveryWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE310_WORKER_RECOVERY_TIMEOUT_MS
  ) {
    throw new Error("launch worker recovery deadline is invalid");
  }
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let open = true;
    const finish = (settle: () => void) => {
      if (!open) return;
      open = false;
      clearTimeout(timer);
      settle();
    };
    const timer = setTimeout(() => {
      controller.abort(new Error("Launch worker recovery deadline exceeded."));
      finish(() =>
        reject(new Error(`launch worker recovery exceeded ${deadlineMs}ms`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parseLaunchWorkerRecoveryCliArgs(
  input: readonly string[],
): LaunchWorkerRecoveryCliArgs {
  const argv = input.filter((value) => value !== "--");
  const supportedFlags = new Set([
    "--environment",
    "--confirm-environment",
    "--implementation-sha",
    "--timeout-ms",
    "--approval-digest",
    "--plan",
    "--apply",
    "--status",
    "--cancel",
    "--cleanup",
  ]);
  const unsupported = argv.find(
    (value) => value.startsWith("--") && !supportedFlags.has(value),
  );
  if (unsupported) throw new Error(`unsupported flag: ${unsupported}`);
  if (flagValue(argv, "--environment") !== "production") {
    throw new Error("--environment must be production");
  }
  if (flagValue(argv, "--confirm-environment") !== "production") {
    throw new Error("requires --confirm-environment production");
  }
  const implementationSha = requiredFlag(argv, "--implementation-sha");
  assertImplementationSha(implementationSha);
  const timeoutMs = Number(
    flagValue(argv, "--timeout-ms") ?? OVE310_WORKER_RECOVERY_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE310_WORKER_RECOVERY_TIMEOUT_MS
  ) {
    throw new Error("--timeout-ms is invalid");
  }
  const selected = [
    "--plan",
    "--apply",
    "--status",
    "--cancel",
    "--cleanup",
  ].filter((flag) => argv.includes(flag));
  if (selected.length !== 1) throw new Error("choose exactly one proof mode");
  const mode = selected[0]!.slice(2) as LaunchWorkerRecoveryCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE310_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-310");
    }
    return {
      mode,
      environment: "production",
      implementationSha,
      approvalDigest,
      timeoutMs,
    };
  }
  return { mode, environment: "production", implementationSha, timeoutMs };
}

interface RuntimeInspectionReadback {
  runtimeClass: "docker_compose_release";
  roleCount: 4;
  restartPolicyClass: "all_unless_stopped";
  runtimeHealthClass: "all_running_required_health_healthy";
  providerAttemptClass: "absent" | "present";
}

interface WorkerRestartProviderReadback {
  restartCount: 1;
  targetClass: "matching_worker_only";
  workerRestartClass: "same_container_new_start";
  peerRolesClass: "unchanged";
  workerHealthClass: "healthy_after_restart";
}

export function parseRuntimeInspectionReadback(
  stdout: string,
): RuntimeInspectionReadback {
  const value = parseExactJson(stdout);
  const expectedKeys = [
    "schemaVersion",
    "runtimeClass",
    "roleCount",
    "restartPolicyClass",
    "runtimeHealthClass",
    "providerAttemptClass",
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(expectedKeys) ||
    value.schemaVersion !== "ove310.runtime-inspection.v1" ||
    value.runtimeClass !== "docker_compose_release" ||
    value.roleCount !== 4 ||
    value.restartPolicyClass !== "all_unless_stopped" ||
    value.runtimeHealthClass !== "all_running_required_health_healthy" ||
    (value.providerAttemptClass !== "absent" &&
      value.providerAttemptClass !== "present")
  ) {
    throw new Error("Production runtime inspection drifted.");
  }
  return {
    runtimeClass: "docker_compose_release",
    roleCount: 4,
    restartPolicyClass: "all_unless_stopped",
    runtimeHealthClass: "all_running_required_health_healthy",
    providerAttemptClass: value.providerAttemptClass,
  };
}

export function parseWorkerRestartReadback(
  stdout: string,
): WorkerRestartProviderReadback {
  const value = parseExactJson(stdout);
  const expectedKeys = [
    "schemaVersion",
    "restartCount",
    "targetClass",
    "workerRestartClass",
    "peerRolesClass",
    "workerHealthClass",
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(expectedKeys) ||
    value.schemaVersion !== "ove310.worker-restart.v1" ||
    value.restartCount !== 1 ||
    value.targetClass !== "matching_worker_only" ||
    value.workerRestartClass !== "same_container_new_start" ||
    value.peerRolesClass !== "unchanged" ||
    value.workerHealthClass !== "healthy_after_restart"
  ) {
    throw new Error("Production worker restart read-back drifted.");
  }
  return {
    restartCount: 1,
    targetClass: "matching_worker_only",
    workerRestartClass: "same_container_new_start",
    peerRolesClass: "unchanged",
    workerHealthClass: "healthy_after_restart",
  };
}

export const OVE310_RUNTIME_INSPECTION_SCRIPT = `set -euo pipefail
PROJECT_NAME="overgarden"
COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "${ACTIVE_ENV_FILE}" --file "${COMPOSE_FILE}")
ATTEMPT_FILE="${PROVIDER_ATTEMPT_FILE}"
ATTEMPT_CLASS="absent"
if [[ -e "$ATTEMPT_FILE" ]]; then ATTEMPT_CLASS="present"; fi
EXPECTED_RELEASE="$(printf '%s\n' matching-api matching-worker)"
EXPECTED_RUNNING="$(printf '%s\n' caddy matching-api matching-worker meilisearch-next)"
CONFIGURED_RELEASE="$("\${COMPOSE[@]}" config --services | LC_ALL=C sort)"
RUNNING="$(docker ps --filter label=com.docker.compose.project="$PROJECT_NAME" --format '{{.Label "com.docker.compose.service"}}' | LC_ALL=C sort)"
[[ "$CONFIGURED_RELEASE" == "$EXPECTED_RELEASE" && "$RUNNING" == "$EXPECTED_RUNNING" ]]
for ROLE in caddy matching-api matching-worker meilisearch-next; do
  ID="$(docker ps -q --filter label=com.docker.compose.project="$PROJECT_NAME" --filter label=com.docker.compose.service="$ROLE")"
  [[ -n "$ID" ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$ID")" == "$PROJECT_NAME" ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$ID")" == "$ROLE" ]]
  [[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$ID")" == "unless-stopped" ]]
  STATUS="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not_configured{{end}}' "$ID")"
  if [[ "$ROLE" == "matching-api" || "$ROLE" == "matching-worker" ]]; then
    [[ "$STATUS" == "running|healthy" ]]
  else
    [[ "$STATUS" == "running|healthy" || "$STATUS" == "running|not_configured" ]]
  fi
done
printf '{"schemaVersion":"ove310.runtime-inspection.v1","runtimeClass":"docker_compose_release","roleCount":4,"restartPolicyClass":"all_unless_stopped","runtimeHealthClass":"all_running_required_health_healthy","providerAttemptClass":"%s"}' "$ATTEMPT_CLASS"`;

export const OVE310_WORKER_RESTART_SCRIPT = `set -euo pipefail
PROJECT_NAME="overgarden"
LOCK_FILE="${RELEASE_LOCK_FILE}"
ATTEMPT_FILE="${PROVIDER_ATTEMPT_FILE}"
COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "${ACTIVE_ENV_FILE}" --file "${COMPOSE_FILE}")
EXPECTED_RELEASE="$(printf '%s\n' matching-api matching-worker)"
EXPECTED_RUNNING="$(printf '%s\n' caddy matching-api matching-worker meilisearch-next)"
[[ "$("\${COMPOSE[@]}" config --services | LC_ALL=C sort)" == "$EXPECTED_RELEASE" ]]
[[ "$(docker ps --filter label=com.docker.compose.project="$PROJECT_NAME" --format '{{.Label "com.docker.compose.service"}}' | LC_ALL=C sort)" == "$EXPECTED_RUNNING" ]]
CADDY_ID="$(docker ps -q --filter label=com.docker.compose.project="$PROJECT_NAME" --filter label=com.docker.compose.service=caddy)"
API_ID="$("\${COMPOSE[@]}" ps -q matching-api)"
WORKER_ID="$("\${COMPOSE[@]}" ps -q matching-worker)"
MEILI_ID="$(docker ps -q --filter label=com.docker.compose.project="$PROJECT_NAME" --filter label=com.docker.compose.service=meilisearch-next)"
assert_role() {
  ROLE="$1"
  ROLE_ID="$2"
  [[ -n "$ROLE_ID" ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$ROLE_ID")" == "$PROJECT_NAME" ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$ROLE_ID")" == "$ROLE" ]]
  [[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$ROLE_ID")" == "unless-stopped" ]]
  ROLE_STATE="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not_configured{{end}}' "$ROLE_ID")"
  if [[ "$ROLE" == "matching-api" || "$ROLE" == "matching-worker" ]]; then
    [[ "$ROLE_STATE" == "running|healthy" ]]
  else
    [[ "$ROLE_STATE" == "running|healthy" || "$ROLE_STATE" == "running|not_configured" ]]
  fi
}
assert_role caddy "$CADDY_ID"
assert_role matching-api "$API_ID"
assert_role matching-worker "$WORKER_ID"
assert_role meilisearch-next "$MEILI_ID"
CADDY_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$CADDY_ID")"
API_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$API_ID")"
WORKER_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$WORKER_ID")"
MEILI_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$MEILI_ID")"
umask 077
set -o noclobber
: > "$ATTEMPT_FILE"
set +o noclobber
flock -n "$LOCK_FILE" timeout 20s "\${COMPOSE[@]}" restart --no-deps matching-worker >/dev/null
ATTEMPT=0
while (( ATTEMPT < 40 )); do
  AFTER_WORKER_ID="$("\${COMPOSE[@]}" ps -q matching-worker)"
  AFTER_WORKER_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$AFTER_WORKER_ID" 2>/dev/null || true)"
  AFTER_WORKER_STATE="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not_configured{{end}}' "$AFTER_WORKER_ID" 2>/dev/null || true)"
  if [[ "$AFTER_WORKER_ID" == "$WORKER_ID" && "$AFTER_WORKER_STARTED" != "$WORKER_STARTED" && "$AFTER_WORKER_STATE" == "running|healthy" ]]; then
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 0.25
done
[[ "$ATTEMPT" -lt 40 ]]
[[ "$(docker ps -q --filter label=com.docker.compose.project="$PROJECT_NAME" --filter label=com.docker.compose.service=caddy)" == "$CADDY_ID" ]]
[[ "$("\${COMPOSE[@]}" ps -q matching-api)" == "$API_ID" ]]
[[ "$(docker ps -q --filter label=com.docker.compose.project="$PROJECT_NAME" --filter label=com.docker.compose.service=meilisearch-next)" == "$MEILI_ID" ]]
[[ "$(docker inspect -f '{{.State.StartedAt}}' "$CADDY_ID")" == "$CADDY_STARTED" ]]
[[ "$(docker inspect -f '{{.State.StartedAt}}' "$API_ID")" == "$API_STARTED" ]]
[[ "$(docker inspect -f '{{.State.StartedAt}}' "$MEILI_ID")" == "$MEILI_STARTED" ]]
[[ "$(docker ps --filter label=com.docker.compose.project="$PROJECT_NAME" --format '{{.Label "com.docker.compose.service"}}' | LC_ALL=C sort)" == "$EXPECTED_RUNNING" ]]
assert_role caddy "$CADDY_ID"
assert_role matching-api "$API_ID"
assert_role matching-worker "$WORKER_ID"
assert_role meilisearch-next "$MEILI_ID"
printf '%s' '{"schemaVersion":"ove310.worker-restart.v1","restartCount":1,"targetClass":"matching_worker_only","workerRestartClass":"same_container_new_start","peerRolesClass":"unchanged","workerHealthClass":"healthy_after_restart"}'`;

export class ProductionLaunchWorkerRecoveryAdapter implements LaunchWorkerRecoveryAdapter {
  private readonly stateFile: string;

  constructor(
    private readonly implementationSha: string,
    private readonly journal: ProductionJournalWorkerAdapter,
  ) {
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `${OVE310_JOURNAL_TASK_CONFIG.statePrefix}-${implementationSha}.operation.json`,
    );
  }

  acquireApplyLock(signal?: AbortSignal) {
    return this.journal.acquireApplyLock(signal);
  }

  releaseApplyLock() {
    return this.journal.releaseApplyLock();
  }

  async readBoundary(
    signal?: AbortSignal,
  ): Promise<LaunchWorkerRecoveryBoundary> {
    const [journalBoundary, runtime] = await Promise.all([
      this.journal.readBoundary(signal),
      runRemoteClosedCommand(OVE310_RUNTIME_INSPECTION_SCRIPT, signal).then(
        parseRuntimeInspectionReadback,
      ),
    ]);
    return { ...journalBoundary, ...runtime };
  }

  readApplyAttempt() {
    return this.journal.readApplyAttempt();
  }

  claimApplyAttempt() {
    return this.journal.claimApplyAttempt();
  }

  async restartWorker(
    signal?: AbortSignal,
  ): Promise<WorkerRestartVerification> {
    const restart = parseWorkerRestartReadback(
      await runRemoteClosedCommand(OVE310_WORKER_RESTART_SCRIPT, signal),
    );
    const heartbeat = await waitForJournalWorkerCondition(
      async () => {
        const boundary = await this.journal.readBoundary(signal);
        return boundary.deploymentSha === this.implementationSha &&
          boundary.canaryCount === 0 &&
          boundary.workerCapabilityClass === "ready_exact_handlers"
          ? true
          : null;
      },
      OVE310_DIRECT_PROVIDER_TIMEOUT_MS,
      250,
      signal,
    );
    return {
      ...restart,
      heartbeatClass: heartbeat ? "fresh_exact_release" : "unexpected",
    };
  }

  applyCanary(signal?: AbortSignal) {
    return this.journal.applyCanary(signal);
  }

  cleanupCanary(signal?: AbortSignal) {
    return this.journal.cleanupCanary(signal);
  }

  async readReplayReceipt() {
    try {
      return validateStoredReceipt(
        JSON.parse(await readFile(this.stateFile, "utf8")) as unknown,
        this.implementationSha,
      );
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null;
      throw error;
    }
  }

  async writeReplayReceipt(receipt: LaunchWorkerRecoveryReceiptV1) {
    validateStoredReceipt(receipt, this.implementationSha);
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(STATE_DIRECTORY, 0o700);
    const temporary = `${this.stateFile}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
    await rename(temporary, this.stateFile);
    await chmod(this.stateFile, 0o600);
  }

  cancellationRequested() {
    return this.journal.cancellationRequested();
  }

  requestCancellation() {
    return this.journal.requestCancellation();
  }

  clearCancellation() {
    return this.journal.clearCancellation();
  }

  close() {
    return this.journal.close();
  }
}

export async function createProductionLaunchWorkerRecoveryAdapter(
  implementationSha: string,
) {
  const journal = await createProductionJournalWorkerAdapter(
    implementationSha,
    OVE310_JOURNAL_TASK_CONFIG,
  );
  return new ProductionLaunchWorkerRecoveryAdapter(implementationSha, journal);
}

async function runRemoteClosedCommand(script: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const encoded = Buffer.from(script, "utf8").toString("base64");
  const remoteCommand = `printf '%s' '${encoded}' | base64 --decode | bash`;
  const keyPath = path.join(homedir(), ".ssh", "id_ed25519");
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "doctl",
      [
        "compute",
        "ssh",
        PRODUCTION_DROPLET,
        "--ssh-key-path",
        keyPath,
        "--ssh-retry-max",
        "0",
        "--ssh-command",
        remoteCommand,
      ],
      {
        encoding: "utf8",
        timeout: OVE310_DIRECT_PROVIDER_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      },
      (error, stdout) => {
        signal?.removeEventListener("abort", abort);
        if (error) reject(new Error("Production worker provider step failed."));
        else resolve(stdout);
      },
    );
    const abort = () => {
      child.kill("SIGKILL");
      reject(new Error("Production worker provider step was cancelled."));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function validateStoredReceipt(
  value: unknown,
  implementationSha: string,
): LaunchWorkerRecoveryReceiptV1 {
  if (!isRecord(value)) throw new Error("Stored OVE-310 receipt was invalid.");
  const expectedKeys = [
    "version",
    "environment",
    "implementationSha",
    "planDigest",
    "authorizationDigest",
    "canaryCountBefore",
    "applyCount",
    "resultClass",
    "cleanupClass",
    "durationMs",
    "state",
    "evidenceDigest",
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.environment !== "production" ||
    value.implementationSha !== implementationSha ||
    value.planDigest !== OVE310_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE310_APPROVAL_DIGEST ||
    typeof value.canaryCountBefore !== "number" ||
    typeof value.applyCount !== "number" ||
    typeof value.durationMs !== "number" ||
    typeof value.resultClass !== "string" ||
    !RESULT_CLASSES.has(value.resultClass) ||
    typeof value.cleanupClass !== "string" ||
    !CLEANUP_CLASSES.has(value.cleanupClass) ||
    typeof value.state !== "string" ||
    !STATES.has(value.state)
  ) {
    throw new Error("Stored OVE-310 receipt shape drifted.");
  }
  const rebuilt = buildReceipt({
    environment: "production",
    implementationSha,
    canaryCountBefore: value.canaryCountBefore,
    applyCount: value.applyCount,
    resultClass: value.resultClass as LaunchWorkerRecoveryResultClass,
    cleanupClass: value.cleanupClass as LaunchWorkerRecoveryCleanupClass,
    durationMs: value.durationMs,
    state: value.state as LaunchWorkerRecoveryState,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error("Stored OVE-310 receipt digest drifted.");
  }
  return value as unknown as LaunchWorkerRecoveryReceiptV1;
}

const RESULT_CLASSES = new Set<string>([
  "zero_effect_plan",
  "verified_worker_restart_recovery",
  "already_cleaned",
  "bounded_loser",
  "cancelled",
  "refused",
  "failed",
]);
const CLEANUP_CLASSES = new Set<string>([
  "not_applicable",
  "not_started",
  "authoritative_absent_twice",
  "uncertain",
]);
const STATES = new Set<string>([
  "unstarted",
  "classified",
  "authorized",
  "code_deployed",
  "applying",
  "verified",
  "cleaned",
  "already_cleaned",
  "failed",
]);

function parseExactJson(stdout: string) {
  if (stdout.trim() !== stdout || stdout.includes("\n")) {
    throw new Error("Provider read-back was not one closed JSON line.");
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Provider read-back was not valid JSON.");
  }
  if (!isRecord(value))
    throw new Error("Provider read-back was not an object.");
  return value;
}

function assertRunOptions(options: LaunchWorkerRecoveryRunOptions) {
  if (options.environment !== "production") {
    throw new Error("launch worker recovery is production-only");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE310_WORKER_RECOVERY_TIMEOUT_MS
  ) {
    throw new Error("launch worker recovery timeout is invalid");
  }
}

function assertImplementationSha(value: string) {
  if (!SHA_40.test(value)) {
    throw new Error("implementation SHA must be 40 lowercase hex characters");
  }
}

function assertBoundedCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be zero or one`);
  }
}

function safeCount(value: number) {
  return Number.isSafeInteger(value) && value === 1 ? 1 : 0;
}

function flagValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requiredFlag(argv: readonly string[], name: string) {
  const value = flagValue(argv, name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Launch worker recovery was cancelled.");
}

function isNodeError(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApprovedReceiptSuccess(receipt: LaunchWorkerRecoveryReceiptV1) {
  return (
    receipt.state === "cleaned" ||
    receipt.state === "already_cleaned" ||
    (receipt.state === "code_deployed" &&
      receipt.resultClass === "zero_effect_plan")
  );
}

async function runCli() {
  loadEnv({ path: ".env.local", override: false, quiet: true });
  const args = parseLaunchWorkerRecoveryCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionLaunchWorkerRecoveryAdapter(
    args.implementationSha,
  );
  let receipt: LaunchWorkerRecoveryReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildLaunchWorkerFailureReceipt({
        environment: "production",
        implementationSha: args.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "cancelled",
        cleanupClass: "not_started",
        durationMs: 0,
        unsafeError: "cancelled",
      });
    } else if (args.mode === "cleanup") {
      const prior = await adapter.readReplayReceipt();
      const attempted = await adapter.readApplyAttempt();
      const clean = await proveCleanupTwice(adapter).catch(() => false);
      if (clean) await adapter.clearCancellation();
      receipt = clean
        ? prior && isCompletedReceipt(prior)
          ? prior
          : prior
            ? buildLaunchWorkerFailureReceipt({
                environment: "production",
                implementationSha: args.implementationSha,
                canaryCountBefore: prior.canaryCountBefore,
                applyCount: prior.applyCount,
                resultClass: "failed",
                cleanupClass: "authoritative_absent_twice",
                durationMs: prior.durationMs,
                unsafeError: "cleanup recovered a prior failure",
              })
            : buildAlreadyCleanedReceipt(
                args.implementationSha,
                performance.now(),
              )
        : buildLaunchWorkerFailureReceipt({
            environment: "production",
            implementationSha: args.implementationSha,
            canaryCountBefore: prior?.canaryCountBefore ?? 1,
            applyCount: prior?.applyCount ?? 0,
            resultClass: "failed",
            cleanupClass: "uncertain",
            durationMs: 0,
            unsafeError: "cleanup drift",
          });
      if (prior || attempted) await adapter.writeReplayReceipt(receipt);
    } else if (args.mode === "status") {
      receipt =
        (await adapter.readReplayReceipt()) ??
        (await settleLaunchWorkerRecoveryWithinDeadline(
          (signal) =>
            runApprovedLaunchWorkerRecovery(
              {
                mode: "plan",
                environment: "production",
                implementationSha: args.implementationSha,
                timeoutMs: args.timeoutMs,
              },
              adapter,
              signal,
            ),
          args.timeoutMs,
        ));
    } else {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(
        () =>
          controller.abort(
            new Error("Launch worker recovery deadline exceeded."),
          ),
        args.timeoutMs,
      );
      try {
        receipt = await runApprovedLaunchWorkerRecovery(
          args as LaunchWorkerRecoveryRunOptions,
          adapter,
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
      const durationMs = Math.ceil(performance.now() - startedAt);
      if (
        durationMs > args.timeoutMs ||
        (args.mode === "apply" &&
          receipt.state === "failed" &&
          receipt.cleanupClass === "uncertain")
      ) {
        const clean =
          args.mode === "apply"
            ? await proveCleanupTwice(adapter).catch(() => false)
            : false;
        receipt = buildLaunchWorkerFailureReceipt({
          environment: "production",
          implementationSha: args.implementationSha,
          canaryCountBefore: receipt.canaryCountBefore,
          applyCount: receipt.applyCount,
          resultClass: "failed",
          cleanupClass: clean ? "authoritative_absent_twice" : "uncertain",
          durationMs: Math.min(args.timeoutMs, durationMs),
          unsafeError: "deadline or cleanup recovery",
        });
        if (args.mode === "apply") await adapter.writeReplayReceipt(receipt);
      }
    }
  } finally {
    await adapter.close();
  }
  console.log(JSON.stringify(receipt));
  if (!isApprovedReceiptSuccess(receipt)) process.exitCode = 1;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  void runCli().catch((error) => {
    const candidate = flagValue(
      process.argv.slice(2).filter((value) => value !== "--"),
      "--implementation-sha",
    );
    const implementationSha =
      candidate && SHA_40.test(candidate) ? candidate : "0".repeat(40);
    console.log(
      JSON.stringify(
        buildLaunchWorkerFailureReceipt({
          environment: "production",
          implementationSha,
          canaryCountBefore: 0,
          applyCount: 0,
          resultClass: "refused",
          cleanupClass: "not_started",
          durationMs: 0,
          unsafeError: error,
        }),
      ),
    );
    process.exitCode = 1;
  });
}
