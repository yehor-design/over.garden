import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";

import {
  resolveDatabaseConnection,
  resolvePgConnectionString,
} from "../src/db/connection";

export const OVE307_APPROVED_PLAN =
  "OVE-307-amendment-1|production|after two matching read-only parity classifications at exact main e95eb8d8de7d95128e085f5332da63e7edeea43d report ten stale public journal documents and drift field class entryDate only, execute one bounded canonical public-index repair batch for exactly reindex=10, unindexDelete=0, deleteInvalid=0, then perform two matching read-only classifications requiring zeroGap true and every gap and terminal class zero|baseline:e95eb8d8de7d95128e085f5332da63e7edeea43d|policy:ove242.publicIndexParity.v3|one-apply|cleanup:verified-convergence" as const;
export const OVE307_APPROVAL_DIGEST =
  "765ab7a989c970f2ac9bd356f61d0ab83b88dde1749ba61835099f7f0d361356" as const;
export const OVE307_REPAIR_TIMEOUT_MS = 180_000;
export const OVE307_DIRECT_REQUEST_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const APPROVED_APP_ORIGIN = "https://over.garden";
const APPROVED_MEILISEARCH_ORIGIN = "https://meili.over.garden";
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const APPROVED_POLICY = "ove242.publicIndexParity.v3";
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));
const execFileAsync = promisify(execFile);
const REPORT_KEYS = [
  "counts",
  "driftFieldClasses",
  "evidenceSafety",
  "expectedCorpusHash",
  "invalidReasonClasses",
  "issue",
  "observedCorpusHash",
  "policyVersion",
  "zeroGap",
] as const;
const COUNT_KEYS = [
  "duplicate",
  "expected",
  "extraneous",
  "invalid_id",
  "meiliDocumentCount",
  "missing",
  "overdue",
  "pending",
  "postgresEligibleCount",
  "projection_dead",
  "projection_overdue",
  "projection_unconverged",
  "stale",
  "terminal_failure",
  "unsafe_schema",
] as const;

export interface SafeParityCounts {
  expected: number;
  missing: number;
  extraneous: number;
  stale: number;
  unsafe_schema: number;
  duplicate: number;
  invalid_id: number;
  pending: number;
  overdue: number;
  terminal_failure: number;
  projection_unconverged: number;
  projection_overdue: number;
  projection_dead: number;
  meiliDocumentCount: number;
  postgresEligibleCount: number;
}

export interface SafeParityReport {
  policyVersion: "ove242.publicIndexParity.v3";
  issue: "OVE-227";
  zeroGap: boolean;
  counts: SafeParityCounts;
  driftFieldClasses: string[];
  invalidReasonClasses: string[];
  expectedCorpusHash: string;
  observedCorpusHash: string;
  evidenceSafety: "counts_classes_and_safe_hashes";
}

export interface SafeRepairPlan {
  policyVersion: "ove242.publicIndexParity.v3";
  issue: "OVE-227";
  actions: {
    reindex: number;
    unindexDelete: number;
    deleteInvalid: number;
  };
  evidenceSafety: "counts_classes_and_safe_hashes";
}

export interface SafeRepairResult {
  plan: SafeRepairPlan;
  applied: {
    reindexUpserted: number;
    deleted: number;
  };
  after: SafeParityReport;
}

export type PublicSearchParityResultClass =
  | "zero_effect_plan"
  | "verified_zero_gap"
  | "already_verified"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type PublicSearchParityConvergenceClass =
  | "not_started"
  | "matching_zero_gap_twice"
  | "uncertain";

export type PublicSearchParityState =
  | "code_deployed"
  | "verified"
  | "already_verified"
  | "failed";

export interface PublicSearchParityReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE307_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE307_APPROVAL_DIGEST;
  applyCount: number;
  before: SafeParityReport | null;
  plan: SafeRepairPlan | null;
  after: SafeParityReport | null;
  resultClass: PublicSearchParityResultClass;
  convergenceClass: PublicSearchParityConvergenceClass;
  durationMs: number;
  state: PublicSearchParityState;
  evidenceDigest: string;
}

export interface PublicSearchParityAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readDeploymentSha(signal?: AbortSignal): Promise<string>;
  classify(signal?: AbortSignal): Promise<SafeParityReport>;
  plan(signal?: AbortSignal): Promise<SafeRepairPlan>;
  claimApplyAttempt(): Promise<"claimed" | "already_claimed">;
  readApplyAttempt(): Promise<boolean>;
  apply(signal?: AbortSignal): Promise<SafeRepairResult>;
  cancellationRequested(): Promise<boolean>;
  readReplayReceipt(): Promise<PublicSearchParityReceiptV1 | null>;
  writeReplayReceipt(receipt: PublicSearchParityReceiptV1): Promise<void>;
}

export interface PublicSearchParityRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type PublicSearchParityCliArgs =
  | PublicSearchParityRunOptions
  | {
      mode: "status";
      environment: "production";
      implementationSha: string;
      timeoutMs: number;
    }
  | {
      mode: "cancel";
      environment: "production";
      implementationSha: string;
      timeoutMs: number;
    };

interface BuildReceiptInput {
  implementationSha: string;
  applyCount: number;
  before: SafeParityReport | null;
  plan: SafeRepairPlan | null;
  after: SafeParityReport | null;
  resultClass: PublicSearchParityResultClass;
  convergenceClass: PublicSearchParityConvergenceClass;
  durationMs: number;
  state: PublicSearchParityState;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPublicSearchParityNamespace(implementationSha: string) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-307\0${implementationSha}\0${OVE307_APPROVAL_DIGEST}`);
}

export function isApprovedPublicSearchProviderBinding(input: {
  databaseUrl: string;
  meiliHost: string;
}) {
  try {
    const databaseUrl = new URL(input.databaseUrl);
    return (
      databaseUrl.hostname === APPROVED_PRODUCTION_DATABASE_HOST &&
      databaseUrl.port === APPROVED_PRODUCTION_DATABASE_PORT &&
      databaseUrl.pathname.replace(/^\//, "") ===
        APPROVED_PRODUCTION_DATABASE_NAME &&
      new URL(input.meiliHost).origin === APPROVED_MEILISEARCH_ORIGIN
    );
  } catch {
    return false;
  }
}

function buildReceipt(input: BuildReceiptInput): PublicSearchParityReceiptV1 {
  assertImplementationSha(input.implementationSha);
  if (
    !Number.isSafeInteger(input.applyCount) ||
    input.applyCount < 0 ||
    input.applyCount > 1
  ) {
    throw new Error("apply count must be zero or one");
  }
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE307_REPAIR_TIMEOUT_MS
  ) {
    throw new Error(
      `repair duration must be between 0 and ${OVE307_REPAIR_TIMEOUT_MS}ms`,
    );
  }
  const payload: Omit<PublicSearchParityReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: "production",
    implementationSha: input.implementationSha,
    planDigest: OVE307_APPROVAL_DIGEST,
    authorizationDigest: OVE307_APPROVAL_DIGEST,
    applyCount: input.applyCount,
    before: input.before,
    plan: input.plan,
    after: input.after,
    resultClass: input.resultClass,
    convergenceClass: input.convergenceClass,
    durationMs: input.durationMs,
    state: input.state,
  };
  return {
    ...payload,
    evidenceDigest: sha256(
      `overgarden.ove307.public-search-parity.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

function failureReceipt(
  input: Omit<BuildReceiptInput, "state"> & { unsafeError?: unknown },
) {
  void input.unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number) {
  return Math.min(
    OVE307_REPAIR_TIMEOUT_MS,
    Math.max(0, Math.ceil(performance.now() - startedAt)),
  );
}

function hasExactZeroCounts(
  counts: SafeParityCounts,
  expected: number,
  stale: number,
) {
  return (
    hasExactKeys(counts, COUNT_KEYS) &&
    counts.expected === expected &&
    counts.missing === 0 &&
    counts.extraneous === 0 &&
    counts.stale === stale &&
    counts.unsafe_schema === 0 &&
    counts.duplicate === 0 &&
    counts.invalid_id === 0 &&
    counts.pending === 0 &&
    counts.overdue === 0 &&
    counts.terminal_failure === 0 &&
    counts.projection_unconverged === 0 &&
    counts.projection_overdue === 0 &&
    counts.projection_dead === 0 &&
    counts.meiliDocumentCount === 10 &&
    counts.postgresEligibleCount === 10
  );
}

function isExactBefore(report: SafeParityReport) {
  return (
    hasExactKeys(report, REPORT_KEYS) &&
    report.policyVersion === APPROVED_POLICY &&
    report.issue === "OVE-227" &&
    report.zeroGap === false &&
    hasExactZeroCounts(report.counts, 0, 10) &&
    JSON.stringify(report.driftFieldClasses) ===
      JSON.stringify(["entryDate"]) &&
    report.invalidReasonClasses.length === 0 &&
    HASH_64.test(report.expectedCorpusHash) &&
    HASH_64.test(report.observedCorpusHash) &&
    report.expectedCorpusHash !== report.observedCorpusHash &&
    report.evidenceSafety === "counts_classes_and_safe_hashes"
  );
}

function isExactPlan(plan: SafeRepairPlan) {
  return (
    hasExactKeys(plan, [
      "actions",
      "evidenceSafety",
      "issue",
      "policyVersion",
    ]) &&
    hasExactKeys(plan.actions, ["deleteInvalid", "reindex", "unindexDelete"]) &&
    plan.policyVersion === APPROVED_POLICY &&
    plan.issue === "OVE-227" &&
    plan.actions.reindex === 10 &&
    plan.actions.unindexDelete === 0 &&
    plan.actions.deleteInvalid === 0 &&
    plan.evidenceSafety === "counts_classes_and_safe_hashes"
  );
}

function isExactAfter(report: SafeParityReport) {
  return (
    hasExactKeys(report, REPORT_KEYS) &&
    report.policyVersion === APPROVED_POLICY &&
    report.issue === "OVE-227" &&
    report.zeroGap === true &&
    hasExactZeroCounts(report.counts, 10, 0) &&
    report.driftFieldClasses.length === 0 &&
    report.invalidReasonClasses.length === 0 &&
    HASH_64.test(report.expectedCorpusHash) &&
    report.expectedCorpusHash === report.observedCorpusHash &&
    report.evidenceSafety === "counts_classes_and_safe_hashes"
  );
}

function isExactApply(result: SafeRepairResult) {
  return (
    isExactPlan(result.plan) &&
    result.applied.reindexUpserted === 10 &&
    result.applied.deleted === 0 &&
    isExactAfter(result.after)
  );
}

function matchingReports(first: SafeParityReport, second: SafeParityReport) {
  return JSON.stringify(first) === JSON.stringify(second);
}

async function readExactBoundary(
  adapter: PublicSearchParityAdapter,
  implementationSha: string,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const deploymentSha = await adapter.readDeploymentSha(signal);
  throwIfAborted(signal);
  const before = await adapter.classify(signal);
  throwIfAborted(signal);
  const plan = await adapter.plan(signal);
  throwIfAborted(signal);
  return {
    before,
    plan,
    exact:
      deploymentSha === implementationSha &&
      isExactBefore(before) &&
      isExactPlan(plan),
  };
}

export async function runApprovedPublicSearchParityProof(
  options: PublicSearchParityRunOptions,
  adapter: PublicSearchParityAdapter,
  signal?: AbortSignal,
): Promise<PublicSearchParityReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      if (await adapter.readApplyAttempt()) {
        return failureReceipt({
          implementationSha: options.implementationSha,
          applyCount: 0,
          before: null,
          plan: null,
          after: null,
          resultClass: "refused",
          convergenceClass: "uncertain",
          durationMs: elapsedMs(startedAt),
          unsafeError: "attempt already exists",
        });
      }
      const boundary = await readExactBoundary(
        adapter,
        options.implementationSha,
        signal,
      );
      if (!boundary.exact) {
        return failureReceipt({
          implementationSha: options.implementationSha,
          applyCount: 0,
          before: null,
          plan: null,
          after: null,
          resultClass: "refused",
          convergenceClass: "not_started",
          durationMs: elapsedMs(startedAt),
          unsafeError: "boundary drift",
        });
      }
      return buildReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before: boundary.before,
        plan: boundary.plan,
        after: null,
        resultClass: "zero_effect_plan",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        state: "code_deployed",
      });
    } catch (error) {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before: null,
        plan: null,
        after: null,
        resultClass: "failed",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: error,
      });
    }
  }

  if (options.approvalDigest !== OVE307_APPROVAL_DIGEST) {
    return failureReceipt({
      implementationSha: options.implementationSha,
      applyCount: 0,
      before: null,
      plan: null,
      after: null,
      resultClass: "refused",
      convergenceClass: "not_started",
      durationMs: elapsedMs(startedAt),
      unsafeError: "authorization drift",
    });
  }

  const replay = await adapter.readReplayReceipt();
  if (replay?.state === "verified") {
    return buildReceipt({
      implementationSha: options.implementationSha,
      applyCount: replay.applyCount,
      before: replay.before,
      plan: replay.plan,
      after: replay.after,
      resultClass: "already_verified",
      convergenceClass: replay.convergenceClass,
      durationMs: elapsedMs(startedAt),
      state: "already_verified",
    });
  }

  let locked = false;
  let claimed = false;
  let before: SafeParityReport | null = null;
  let plan: SafeRepairPlan | null = null;
  try {
    if ((await adapter.acquireApplyLock(signal)) !== "acquired") {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before: null,
        plan: null,
        after: null,
        resultClass: "bounded_loser",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply lock contended",
      });
    }
    locked = true;

    const lockedReplay = await adapter.readReplayReceipt();
    if (lockedReplay?.state === "verified") {
      return buildReceipt({
        implementationSha: options.implementationSha,
        applyCount: lockedReplay.applyCount,
        before: lockedReplay.before,
        plan: lockedReplay.plan,
        after: lockedReplay.after,
        resultClass: "already_verified",
        convergenceClass: lockedReplay.convergenceClass,
        durationMs: elapsedMs(startedAt),
        state: "already_verified",
      });
    }
    if (await adapter.readApplyAttempt()) {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 1,
        before: null,
        plan: null,
        after: null,
        resultClass: "refused",
        convergenceClass: "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply is single-use",
      });
    }
    if (await adapter.cancellationRequested()) {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before: null,
        plan: null,
        after: null,
        resultClass: "cancelled",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled before classification",
      });
    }

    const boundary = await readExactBoundary(
      adapter,
      options.implementationSha,
      signal,
    );
    before = boundary.before;
    plan = boundary.plan;
    if (!boundary.exact) {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before: null,
        plan: null,
        after: null,
        resultClass: "refused",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "boundary drift",
      });
    }
    if (await adapter.cancellationRequested()) {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 0,
        before,
        plan,
        after: null,
        resultClass: "cancelled",
        convergenceClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled before attempt claim",
      });
    }
    if ((await adapter.claimApplyAttempt()) !== "claimed") {
      return failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 1,
        before,
        plan,
        after: null,
        resultClass: "refused",
        convergenceClass: "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply is single-use",
      });
    }
    claimed = true;
    throwIfAborted(signal);

    const applied = await adapter.apply(signal);
    throwIfAborted(signal);
    if (!isExactApply(applied)) {
      const failed = failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 1,
        before,
        plan,
        after: null,
        resultClass: "failed",
        convergenceClass: "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply result drift",
      });
      await adapter.writeReplayReceipt(failed);
      return failed;
    }

    const first = await adapter.classify(signal);
    throwIfAborted(signal);
    const second = await adapter.classify(signal);
    throwIfAborted(signal);
    if (
      !isExactAfter(first) ||
      !isExactAfter(second) ||
      !matchingReports(first, second) ||
      !matchingReports(applied.after, second)
    ) {
      const failed = failureReceipt({
        implementationSha: options.implementationSha,
        applyCount: 1,
        before,
        plan,
        after: second,
        resultClass: "failed",
        convergenceClass: "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "terminal classification drift",
      });
      await adapter.writeReplayReceipt(failed);
      return failed;
    }

    const receipt = buildReceipt({
      implementationSha: options.implementationSha,
      applyCount: 1,
      before,
      plan,
      after: second,
      resultClass: "verified_zero_gap",
      convergenceClass: "matching_zero_gap_twice",
      durationMs: elapsedMs(startedAt),
      state: "verified",
    });
    await adapter.writeReplayReceipt(receipt);
    return receipt;
  } catch (error) {
    const failed = failureReceipt({
      implementationSha: options.implementationSha,
      applyCount: claimed ? 1 : 0,
      before,
      plan,
      after: null,
      resultClass: "failed",
      convergenceClass: claimed ? "uncertain" : "not_started",
      durationMs: elapsedMs(startedAt),
      unsafeError: error,
    });
    if (claimed)
      await adapter.writeReplayReceipt(failed).catch(() => undefined);
    return failed;
  } finally {
    if (locked) await adapter.releaseApplyLock().catch(() => undefined);
  }
}

export function settlePublicSearchParityWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE307_REPAIR_TIMEOUT_MS
  ) {
    throw new Error(
      `repair deadline must be between 1 and ${OVE307_REPAIR_TIMEOUT_MS}ms`,
    );
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
      controller.abort(
        new Error("Public search parity repair deadline exceeded."),
      );
      finish(() =>
        reject(
          new Error(`public search parity repair exceeded ${deadlineMs}ms`),
        ),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parsePublicSearchParityCliArgs(
  input: readonly string[],
): PublicSearchParityCliArgs {
  const argv = input.filter((value) => value !== "--");
  const supported = new Set([
    "--environment",
    "--confirm-environment",
    "--implementation-sha",
    "--approval-digest",
    "--timeout-ms",
    "--plan",
    "--apply",
    "--status",
    "--cancel",
  ]);
  const unsupported = argv.find(
    (value) => value.startsWith("--") && !supported.has(value),
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
    flagValue(argv, "--timeout-ms") ?? OVE307_REPAIR_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE307_REPAIR_TIMEOUT_MS
  ) {
    throw new Error(
      `--timeout-ms must be between 1 and ${OVE307_REPAIR_TIMEOUT_MS}`,
    );
  }
  const selected = ["--plan", "--apply", "--status", "--cancel"].filter(
    (flag) => argv.includes(flag),
  );
  if (selected.length !== 1) throw new Error("choose exactly one proof mode");
  const mode = selected[0]!.slice(2) as PublicSearchParityCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE307_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-307");
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

class ProductionPublicSearchParityAdapter implements PublicSearchParityAdapter {
  private readonly namespace: string;
  private readonly lockPath: string;
  private readonly attemptPath: string;
  private readonly cancelPath: string;
  private readonly receiptPath: string;

  constructor(implementationSha: string) {
    this.namespace = buildPublicSearchParityNamespace(implementationSha);
    this.lockPath = path.join(STATE_DIRECTORY, `ove307-${this.namespace}.lock`);
    this.attemptPath = path.join(
      STATE_DIRECTORY,
      `ove307-${this.namespace}.attempt`,
    );
    this.cancelPath = path.join(
      STATE_DIRECTORY,
      `ove307-${this.namespace}.cancel`,
    );
    this.receiptPath = path.join(
      STATE_DIRECTORY,
      `ove307-${this.namespace}.receipt.json`,
    );
  }

  async acquireApplyLock() {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    try {
      await mkdir(this.lockPath, { mode: 0o700 });
      return "acquired" as const;
    } catch (error) {
      if (nodeErrorCode(error) === "EEXIST") return "contended" as const;
      throw error;
    }
  }

  async releaseApplyLock() {
    await rm(this.lockPath, { recursive: true, force: true });
  }

  async readDeploymentSha(signal?: AbortSignal) {
    throwIfAborted(signal);
    assertProductionProviderBinding();
    const response = await fetch(
      `${APPROVED_APP_ORIGIN}/api/document-mutation-admission/readback`,
      { signal: boundedRequestSignal(signal) },
    );
    if (!response.ok) throw new Error("deployment read-back unavailable");
    const body = (await response.json()) as unknown;
    if (
      !isRecord(body) ||
      typeof body.deploymentSha !== "string" ||
      !SHA_40.test(body.deploymentSha) ||
      body.enforcement !== "enabled" ||
      !isRecord(body.r2Addressing) ||
      body.r2Addressing.environmentClass !== "production" ||
      body.r2Addressing.enforcement !== "verified"
    ) {
      throw new Error("deployment read-back contract drift");
    }
    const [{ stdout: localHead }, { stdout: originMain }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        timeout: 5_000,
      }),
      execFileAsync("git", ["rev-parse", "origin/main"], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        timeout: 5_000,
      }),
    ]);
    if (
      localHead.trim() !== body.deploymentSha ||
      originMain.trim() !== body.deploymentSha
    ) {
      throw new Error("local, origin/main, and deployment SHA drift");
    }
    return body.deploymentSha;
  }

  async classify(signal?: AbortSignal) {
    throwIfAborted(signal);
    const parity = await loadCanonicalParityModule();
    const report = parity.redactParityReportForEvidence(
      await parity.classifyPublicJournalIndexParity(),
    ) as SafeParityReport;
    throwIfAborted(signal);
    return report;
  }

  async plan(signal?: AbortSignal) {
    throwIfAborted(signal);
    const parity = await loadCanonicalParityModule();
    const plan =
      (await parity.planPublicJournalIndexRepair()) as SafeRepairPlan;
    throwIfAborted(signal);
    return plan;
  }

  async claimApplyAttempt() {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    try {
      const handle = await open(this.attemptPath, "wx", 0o600);
      try {
        await handle.writeFile("claimed\n", "utf8");
      } finally {
        await handle.close();
      }
      return "claimed" as const;
    } catch (error) {
      if (nodeErrorCode(error) === "EEXIST") {
        return "already_claimed" as const;
      }
      throw error;
    }
  }

  async readApplyAttempt() {
    return pathExists(this.attemptPath);
  }

  async apply(signal?: AbortSignal) {
    throwIfAborted(signal);
    const parity = await loadCanonicalParityModule();
    const result = await parity.applyPublicJournalIndexRepair({
      batchSize: 10,
    });
    throwIfAborted(signal);
    return {
      plan: result.plan as SafeRepairPlan,
      applied: result.applied,
      after: parity.redactParityReportForEvidence(
        result.after,
      ) as SafeParityReport,
    };
  }

  async cancellationRequested() {
    return pathExists(this.cancelPath);
  }

  async requestCancellation() {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await writeFile(this.cancelPath, "cancelled\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(this.cancelPath, 0o600);
  }

  async readReplayReceipt() {
    try {
      const parsed = JSON.parse(
        await readFile(this.receiptPath, "utf8"),
      ) as unknown;
      return isValidStoredReceipt(parsed) ? parsed : null;
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  async writeReplayReceipt(receipt: PublicSearchParityReceiptV1) {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.receiptPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(receipt)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.receiptPath);
  }
}

async function loadCanonicalParityModule() {
  return import("../src/server/search/public-journal-parity");
}

function isValidStoredReceipt(
  value: unknown,
): value is PublicSearchParityReceiptV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "after",
      "applyCount",
      "authorizationDigest",
      "before",
      "convergenceClass",
      "durationMs",
      "environment",
      "evidenceDigest",
      "implementationSha",
      "plan",
      "planDigest",
      "resultClass",
      "state",
      "version",
    ]) ||
    value.version !== 1 ||
    value.environment !== "production" ||
    typeof value.implementationSha !== "string" ||
    !SHA_40.test(value.implementationSha) ||
    value.planDigest !== OVE307_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE307_APPROVAL_DIGEST ||
    !Number.isSafeInteger(value.applyCount) ||
    Number(value.applyCount) < 0 ||
    Number(value.applyCount) > 1 ||
    !Number.isSafeInteger(value.durationMs) ||
    Number(value.durationMs) < 0 ||
    Number(value.durationMs) > OVE307_REPAIR_TIMEOUT_MS ||
    (value.before !== null &&
      (!isRecord(value.before) ||
        !isExactBefore(value.before as unknown as SafeParityReport))) ||
    (value.plan !== null &&
      (!isRecord(value.plan) ||
        !isExactPlan(value.plan as unknown as SafeRepairPlan))) ||
    (value.after !== null &&
      (!isRecord(value.after) ||
        !isExactAfter(value.after as unknown as SafeParityReport))) ||
    ![
      "zero_effect_plan",
      "verified_zero_gap",
      "already_verified",
      "bounded_loser",
      "cancelled",
      "refused",
      "failed",
    ].includes(String(value.resultClass)) ||
    !["not_started", "matching_zero_gap_twice", "uncertain"].includes(
      String(value.convergenceClass),
    ) ||
    !["code_deployed", "verified", "already_verified", "failed"].includes(
      String(value.state),
    ) ||
    typeof value.evidenceDigest !== "string" ||
    !HASH_64.test(value.evidenceDigest)
  ) {
    return false;
  }
  const { evidenceDigest, ...payload } = value;
  return (
    sha256(
      `overgarden.ove307.public-search-parity.v1\0${JSON.stringify(payload)}`,
    ) === evidenceDigest
  );
}

function boundedRequestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(OVE307_DIRECT_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function assertProductionProviderBinding() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) {
    throw new Error("production database binding is unavailable");
  }
  if (
    !isApprovedPublicSearchProviderBinding({
      databaseUrl: connectionString,
      meiliHost: process.env.MEILISEARCH_HOST ?? "",
    })
  ) {
    throw new Error("production provider binding drift");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("operation cancelled");
  }
}

function assertImplementationSha(value: string) {
  if (!SHA_40.test(value)) {
    throw new Error("implementation SHA must be 40 lowercase hex characters");
  }
}

function assertRunOptions(options: PublicSearchParityRunOptions) {
  if (options.environment !== "production") {
    throw new Error("environment must be production");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE307_REPAIR_TIMEOUT_MS
  ) {
    throw new Error("invalid repair timeout");
  }
}

function flagValue(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index < 0 ? null : (argv[index + 1] ?? null);
}

function requiredFlag(argv: readonly string[], flag: string) {
  const value = flagValue(argv, flag);
  if (!value || value.startsWith("--")) {
    throw new Error(`missing ${flag}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expectedKeys: readonly string[]): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expectedKeys].sort())
  );
}

function nodeErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

async function pathExists(target: string) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  loadEnv({ path: ".env.local" });
  process.env.DATABASE_SSL ||= "true";
  const args = parsePublicSearchParityCliArgs(process.argv.slice(2));
  const adapter = new ProductionPublicSearchParityAdapter(
    args.implementationSha,
  );

  if (args.mode === "cancel") {
    await adapter.requestCancellation();
    console.log(
      JSON.stringify({
        version: 1,
        environment: "production",
        implementationSha: args.implementationSha,
        resultClass: "cancelled",
        state: "failed",
        evidenceSafety: "closed_fields_only",
      }),
    );
    return;
  }

  if (args.mode === "status") {
    const receipt = await adapter.readReplayReceipt();
    console.log(
      JSON.stringify(
        receipt ?? {
          version: 1,
          environment: "production",
          implementationSha: args.implementationSha,
          applyAttempted: await adapter.readApplyAttempt(),
          cancellationRequested: await adapter.cancellationRequested(),
          resultClass: "not_started",
          evidenceSafety: "closed_fields_only",
        },
        null,
        2,
      ),
    );
    return;
  }

  const receipt = await settlePublicSearchParityWithinDeadline(
    (signal) => runApprovedPublicSearchParityProof(args, adapter, signal),
    args.timeoutMs,
  );
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.state === "failed") process.exitCode = 2;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  void main().catch((error: unknown) => {
    void error;
    console.error(
      JSON.stringify({
        version: 1,
        environment: "production",
        issue: "OVE-307",
        resultClass: "failed",
        state: "failed",
        evidenceSafety: "closed_fields_only",
      }),
    );
    process.exitCode = 1;
  });
}
