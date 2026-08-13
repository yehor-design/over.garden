import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
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
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import type { ErasureDryRunCounts } from "../src/server/erasure-dry-run";

export const OVE313_APPROVED_PLAN =
  "OVE-313|production|run one isolated release-QA account lifecycle through the existing email verification and password-reset paths, prove both transitions preserve the same account, then remove only that generated test account through the existing self-service deletion path|baseline:1e66fcf32f8d3b0fd1e5757cdee4837828805560|one-disposable-test-account|durable-one-shot-fence|cleanup-required" as const;
export const OVE313_APPROVAL_DIGEST =
  "6e4cd2af0121667302f0d31c6e440f70786b9d7f8740b2af7ebb0c36cce96d86" as const;
export const OVE313_STEP_TIMEOUT_MS = 30_000;
const OVE313_RECEIPT_DURATION_LIMIT_MS = 300_000;
const APPROVED_APP_ORIGIN = "https://over.garden";
const APPROVED_INBOX_API_ORIGIN = "https://api.mail.tm";
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const TASK_EMAIL_PREFIX = "ove313-resend-";
const APPLY_LOCK_KEY = 3_130_313;
const INBOX_POLL_BUDGET_MS = 90_000;
const INBOX_SETTLE_MS = 5_000;
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));
const SHA_40 = /^[0-9a-f]{40}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResendDeliveryState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "fenced"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type ResendDeliveryResultClass =
  | "zero_effect_plan"
  | "verified_resend_identity"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type ResendDeliveryCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface ResendDeliveryReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE313_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE313_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: ResendDeliveryResultClass;
  cleanupClass: ResendDeliveryCleanupClass;
  durationMs: number;
  state: ResendDeliveryState;
  evidenceDigest: string;
}

export interface ResendDeliveryAttemptFenceV1 {
  version: 1;
  implementationSha: string;
  planDigest: typeof OVE313_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE313_APPROVAL_DIGEST;
  evidenceDigest: string;
}

export interface ResendDeliveryBoundary {
  deploymentSha: string;
  canaryCount: number;
  deliveryConfigClass: "configured_overgarden_sender" | "unexpected";
  inboxTransportClass: "active_disposable_domain" | "unexpected";
  ownerAccessClass: "sealed_credential_only" | "unexpected";
  evidenceClass: "closed_counts_and_booleans_only" | "unsafe";
}

export interface ResendDeliveryVerification {
  applyCount: number;
  deliveryClass: "exactly_one_verification_and_one_reset" | "unexpected";
  verificationTransitionClass: "canonical_same_account" | "unexpected";
  resetTransitionClass: "canonical_same_account" | "unexpected";
  resetAdmissionClass: "generic_indistinguishable" | "unexpected";
  passwordTransitionClass: "old_revoked_new_same_account" | "unexpected";
  identityClass: "one_user_one_credential_account" | "unexpected";
  anotherUserEffects: number;
}

export interface ResendDeliveryCleanupReadback {
  taskUserCount: number;
  taskAuthRowCount: number;
  taskVerificationCount: number;
  taskOutboxCount: number;
  mailboxPresent: boolean;
  erasureAuditClass: "completed_rekeyed_or_not_applicable" | "unexpected";
  anotherUserEffects: number;
}

export interface ResendDeliveryAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<ResendDeliveryBoundary>;
  applyCanary(signal?: AbortSignal): Promise<ResendDeliveryVerification>;
  cleanupCanary(signal?: AbortSignal): Promise<ResendDeliveryCleanupReadback>;
  readAttemptFence(): Promise<boolean>;
  writeAttemptFence(): Promise<void>;
  readReplayReceipt(): Promise<ResendDeliveryReceiptV1 | null>;
  writeReplayReceipt(receipt: ResendDeliveryReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface ResendDeliveryRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type ResendDeliveryCliArgs =
  | ResendDeliveryRunOptions
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
  resultClass: ResendDeliveryResultClass;
  cleanupClass: ResendDeliveryCleanupClass;
  durationMs: number;
  state: ResendDeliveryState;
}

interface InboxAuthMessage {
  fromAddress: string;
  subject: string;
  text: string;
  html: string;
}

export interface ResendDeliveryRecoveryStateV1 {
  version: 1;
  implementationSha: string;
  state: ResendDeliveryState;
  email: string;
  mailboxId: string | null;
  mailboxPassword: string;
  initialPassword: string;
  nextPassword: string;
  userId: string | null;
  verificationIds: string[];
  outboxIds: string[];
  erasureRequestId: string | null;
  mailboxDeleted: boolean;
}

interface InboxDomain {
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

interface InboxMessageSummary {
  id: string;
  subject: string;
  from?: { address?: unknown };
}

interface CookieResponseLike {
  headers: Headers;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildResendDeliveryReplayNamespace(implementationSha: string) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-313\0${implementationSha}\0${OVE313_APPROVAL_DIGEST}`);
}

function buildReceipt(input: BuildReceiptInput): ResendDeliveryReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE313_RECEIPT_DURATION_LIMIT_MS
  ) {
    throw new Error("Resend delivery receipt duration is outside its bound.");
  }
  const payload: Omit<ResendDeliveryReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE313_APPROVAL_DIGEST,
    authorizationDigest: OVE313_APPROVAL_DIGEST,
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
      `overgarden.ove313.resend-delivery.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildResendDeliveryAttemptFence(
  implementationSha: string,
): ResendDeliveryAttemptFenceV1 {
  assertImplementationSha(implementationSha);
  const payload: Omit<ResendDeliveryAttemptFenceV1, "evidenceDigest"> = {
    version: 1,
    implementationSha,
    planDigest: OVE313_APPROVAL_DIGEST,
    authorizationDigest: OVE313_APPROVAL_DIGEST,
  };
  return {
    ...payload,
    evidenceDigest: sha256(
      `overgarden.ove313.resend-delivery-attempt.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildResendDeliveryFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE313_RECEIPT_DURATION_LIMIT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: ResendDeliveryBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.deliveryConfigClass === "configured_overgarden_sender" &&
    boundary.inboxTransportClass === "active_disposable_domain" &&
    boundary.ownerAccessClass === "sealed_credential_only" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only"
  );
}

function isExactVerification(verification: ResendDeliveryVerification) {
  return (
    verification.applyCount === 1 &&
    verification.deliveryClass === "exactly_one_verification_and_one_reset" &&
    verification.verificationTransitionClass === "canonical_same_account" &&
    verification.resetTransitionClass === "canonical_same_account" &&
    verification.resetAdmissionClass === "generic_indistinguishable" &&
    verification.passwordTransitionClass === "old_revoked_new_same_account" &&
    verification.identityClass === "one_user_one_credential_account" &&
    verification.anotherUserEffects === 0
  );
}

function isClean(readback: ResendDeliveryCleanupReadback) {
  return (
    readback.taskUserCount === 0 &&
    readback.taskAuthRowCount === 0 &&
    readback.taskVerificationCount === 0 &&
    readback.taskOutboxCount === 0 &&
    readback.mailboxPresent === false &&
    readback.erasureAuditClass === "completed_rekeyed_or_not_applicable" &&
    readback.anotherUserEffects === 0
  );
}

async function proveCleanupTwice(
  adapter: ResendDeliveryAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  const second = await adapter.cleanupCanary(signal);
  return isClean(second);
}

async function persistAttemptReceipt(
  adapter: ResendDeliveryAdapter,
  receipt: ResendDeliveryReceiptV1,
) {
  if (receipt.applyCount > 0) {
    await adapter.writeReplayReceipt(receipt);
  }
  return receipt;
}

export async function runApprovedResendDeliveryProof(
  options: ResendDeliveryRunOptions,
  adapter: ResendDeliveryAdapter,
  signal?: AbortSignal,
): Promise<ResendDeliveryReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      if (await adapter.readAttemptFence()) {
        return buildResendDeliveryFailureReceipt({
          environment: options.environment,
          implementationSha: options.implementationSha,
          canaryCountBefore: 0,
          applyCount: 0,
          resultClass: "refused",
          cleanupClass: "not_started",
          durationMs: elapsedMs(startedAt),
          unsafeError: "one-shot plan already consumed",
        });
      }
      const boundary = await adapter.readBoundary(signal);
      if (!isExactBoundary(boundary, options.implementationSha)) {
        return buildResendDeliveryFailureReceipt({
          environment: options.environment,
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
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "zero_effect_plan",
        cleanupClass: "not_applicable",
        durationMs: elapsedMs(startedAt),
        state: "code_deployed",
      });
    } catch (error) {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
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

  if (options.approvalDigest !== OVE313_APPROVAL_DIGEST) {
    return buildResendDeliveryFailureReceipt({
      environment: options.environment,
      implementationSha: options.implementationSha,
      canaryCountBefore: 0,
      applyCount: 0,
      resultClass: "refused",
      cleanupClass: "not_started",
      durationMs: elapsedMs(startedAt),
      unsafeError: "approval drift",
    });
  }

  let locked = false;
  let canaryCountBefore = 0;
  let applyCount = 0;
  try {
    if ((await adapter.acquireApplyLock(signal)) !== "acquired") {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
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

    if (await adapter.cancellationRequested()) {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "cancelled",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled",
      });
    }

    const replay = await adapter.readReplayReceipt();
    if (replay?.implementationSha === options.implementationSha) {
      if (replay.state !== "cleaned") {
        return buildResendDeliveryFailureReceipt({
          environment: options.environment,
          implementationSha: options.implementationSha,
          canaryCountBefore: 0,
          applyCount: 0,
          resultClass: "refused",
          cleanupClass: replay.cleanupClass,
          durationMs: elapsedMs(startedAt),
          unsafeError: "a prior apply is terminal",
        });
      }
      const boundary = await adapter.readBoundary(signal);
      const clean =
        isExactBoundary(boundary, options.implementationSha) &&
        (await proveCleanupTwice(adapter, signal));
      if (!clean) {
        return buildResendDeliveryFailureReceipt({
          environment: options.environment,
          implementationSha: options.implementationSha,
          canaryCountBefore: safeCount(boundary.canaryCount),
          applyCount: 0,
          resultClass: "failed",
          cleanupClass: "uncertain",
          durationMs: elapsedMs(startedAt),
          unsafeError: "replay cleanup drift",
        });
      }
      return buildReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "already_cleaned",
        cleanupClass: "authoritative_absent_twice",
        durationMs: elapsedMs(startedAt),
        state: "already_cleaned",
      });
    }

    if (await adapter.readAttemptFence()) {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "refused",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "one-shot plan already consumed",
      });
    }

    await adapter.writeAttemptFence();
    if (await adapter.cancellationRequested()) {
      const receipt = buildResendDeliveryFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "cancelled",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled after one-shot fence",
      });
      await adapter.writeReplayReceipt(receipt);
      return receipt;
    }

    const boundary = await adapter.readBoundary(signal);
    canaryCountBefore = safeCount(boundary.canaryCount);
    if (!isExactBoundary(boundary, options.implementationSha)) {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount: 0,
        resultClass: "refused",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "boundary drift",
      });
    }
    if (await adapter.cancellationRequested()) {
      return buildResendDeliveryFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount: 0,
        resultClass: "cancelled",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "cancelled",
      });
    }

    let verification: ResendDeliveryVerification;
    try {
      applyCount = 1;
      verification = await adapter.applyCanary(signal);
      applyCount = safeCount(verification.applyCount);
    } catch (error) {
      const cleaned = await proveCleanupTwice(adapter, signal).catch(
        () => false,
      );
      return await persistAttemptReceipt(
        adapter,
        buildResendDeliveryFailureReceipt({
          environment: options.environment,
          implementationSha: options.implementationSha,
          canaryCountBefore,
          applyCount,
          resultClass: "failed",
          cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
          durationMs: elapsedMs(startedAt),
          unsafeError: error,
        }),
      );
    }

    const cleaned = await proveCleanupTwice(adapter, signal).catch(() => false);
    if (!isExactVerification(verification) || !cleaned) {
      return await persistAttemptReceipt(
        adapter,
        buildResendDeliveryFailureReceipt({
          environment: options.environment,
          implementationSha: options.implementationSha,
          canaryCountBefore,
          applyCount,
          resultClass: "failed",
          cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
          durationMs: elapsedMs(startedAt),
          unsafeError: "verification or cleanup drift",
        }),
      );
    }

    const receipt = buildReceipt({
      environment: options.environment,
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "verified_resend_identity",
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
    const receipt = buildResendDeliveryFailureReceipt({
      environment: options.environment,
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "failed",
      cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
      durationMs: elapsedMs(startedAt),
      unsafeError: error,
    });
    return await persistAttemptReceipt(adapter, receipt);
  } finally {
    if (locked) await adapter.releaseApplyLock().catch(() => undefined);
  }
}

export function settleResendDeliveryWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE313_STEP_TIMEOUT_MS
  ) {
    throw new Error("Resend delivery deadline must be between 1 and 30000ms.");
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
      controller.abort(new Error("Resend delivery step deadline exceeded."));
      finish(() =>
        reject(new Error(`Resend delivery step exceeded ${deadlineMs}ms.`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parseResendDeliveryCliArgs(
  input: readonly string[],
): ResendDeliveryCliArgs {
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
  const unsupportedFlag = argv.find(
    (value) => value.startsWith("--") && !supportedFlags.has(value),
  );
  if (unsupportedFlag) throw new Error(`unsupported flag: ${unsupportedFlag}`);
  if (flagValue(argv, "--environment") !== "production") {
    throw new Error("--environment must be production");
  }
  if (flagValue(argv, "--confirm-environment") !== "production") {
    throw new Error("requires --confirm-environment production");
  }
  const implementationSha = requiredFlag(argv, "--implementation-sha");
  assertImplementationSha(implementationSha);
  const timeoutMs = Number(
    flagValue(argv, "--timeout-ms") ?? OVE313_STEP_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE313_STEP_TIMEOUT_MS
  ) {
    throw new Error("--timeout-ms must be between 1 and 30000");
  }
  const selected = [
    "--plan",
    "--apply",
    "--status",
    "--cancel",
    "--cleanup",
  ].filter((flag) => argv.includes(flag));
  if (selected.length !== 1) throw new Error("choose exactly one proof mode");
  const mode = selected[0]!.slice(2) as ResendDeliveryCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE313_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-313");
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

export function extractApprovedAuthUrl(
  message: InboxAuthMessage,
  kind: "verification" | "reset",
) {
  const expectedSubject =
    kind === "verification"
      ? "Verify your OverGarden email"
      : "Reset your OverGarden password";
  const sender = message.fromAddress.trim().toLocaleLowerCase("en-US");
  if (
    message.subject !== expectedSubject ||
    sender.slice(sender.lastIndexOf("@") + 1) !== "over.garden"
  ) {
    throw new Error("Inbox message did not contain one approved auth URL.");
  }

  const candidates = new Set(
    `${message.text}\n${message.html}`
      .replaceAll("&amp;", "&")
      .match(/https:\/\/over\.garden\/[^\s<>"']+/g)
      ?.map((value) => value.replace(/[),.;]+$/g, "")) ?? [],
  );
  if (candidates.size !== 1) {
    throw new Error("Inbox message did not contain one approved auth URL.");
  }
  const [candidate] = candidates;
  try {
    const url = new URL(candidate!);
    const callback = url.searchParams.get("callbackURL");
    const callbackIsGarden =
      callback === "/garden" || callback === `${APPROVED_APP_ORIGIN}/garden`;
    const callbackIsReset =
      callback === `${APPROVED_APP_ORIGIN}/auth/reset-password`;
    const valid =
      url.origin === APPROVED_APP_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (kind === "verification"
        ? url.pathname === "/api/auth/verify-email" &&
          Boolean(url.searchParams.get("token")) &&
          callbackIsGarden
        : /^\/api\/auth\/reset-password\/[^/]+$/.test(url.pathname) &&
          callbackIsReset);
    if (!valid) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new Error("Inbox message did not contain one approved auth URL.");
  }
}

function assertRunOptions(options: ResendDeliveryRunOptions) {
  if (options.environment !== "production") {
    throw new Error("Resend delivery proof is production-only.");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE313_STEP_TIMEOUT_MS
  ) {
    throw new Error("Resend delivery step timeout is outside its bound.");
  }
}

function assertImplementationSha(value: string) {
  if (!SHA_40.test(value)) {
    throw new Error("Implementation SHA must be 40 lowercase hex characters.");
  }
}

function assertBoundedCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be zero or one.`);
  }
}

function safeCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1 ? value : 1;
}

function flagValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requiredFlag(argv: readonly string[], name: string) {
  const value = flagValue(argv, name);
  if (!value) throw new Error(`missing required flag: ${name}`);
  return value;
}

class CookieJar {
  private readonly values = new Map<string, string>();

  addFromResponse(response: CookieResponseLike) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

interface TaskInventory {
  canaryCount: number;
  evidenceSafe: boolean;
}

class ProductionResendDeliveryAdapter implements ResendDeliveryAdapter {
  private readonly namespace: string;
  private readonly attemptFile: string;
  private readonly stateFile: string;
  private readonly cancelFile: string;
  private readonly recoveryFile: string;
  private lockClient: PoolClient | null = null;
  private selectedInboxDomain: string | null = null;
  private recovery: ResendDeliveryRecoveryStateV1 | null = null;
  private cleanRecoveryReadbacks = 0;
  private serverDbLoaded = false;

  constructor(
    private readonly implementationSha: string,
    private readonly pool: Pool,
    private readonly stepTimeoutMs: number,
  ) {
    this.namespace = buildResendDeliveryReplayNamespace(implementationSha);
    this.attemptFile = path.join(
      STATE_DIRECTORY,
      `ove313-resend-delivery-${implementationSha}.attempt.json`,
    );
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `ove313-resend-delivery-${implementationSha}.json`,
    );
    this.cancelFile = path.join(
      STATE_DIRECTORY,
      `ove313-resend-delivery-${implementationSha}.cancel`,
    );
    this.recoveryFile = path.join(
      STATE_DIRECTORY,
      `ove313-resend-delivery-${implementationSha}.recovery.json`,
    );
  }

  async acquireApplyLock(signal?: AbortSignal) {
    throwIfAborted(signal);
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ acquired: boolean }>(
        "select pg_try_advisory_lock($1::bigint) as acquired",
        [APPLY_LOCK_KEY],
      );
      throwIfAborted(signal);
      if (result.rows[0]?.acquired !== true) {
        client.release();
        return "contended" as const;
      }
      this.lockClient = client;
      return "acquired" as const;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async releaseApplyLock() {
    const client = this.lockClient;
    this.lockClient = null;
    if (!client) return;
    try {
      await client.query("select pg_advisory_unlock($1::bigint)", [
        APPLY_LOCK_KEY,
      ]);
    } finally {
      client.release();
    }
  }

  async readBoundary(signal?: AbortSignal): Promise<ResendDeliveryBoundary> {
    const recoveryPresent = await this.hydrateRecoveryState();
    const [deploymentSha, inventory, inboxDomain, ownerAccess] =
      await Promise.all([
        readCanonicalDeploymentSha(signal, this.stepTimeoutMs),
        this.readInventory(signal),
        readActiveInboxDomain(signal, this.stepTimeoutMs),
        this.readOwnerAccess(signal),
      ]);
    this.selectedInboxDomain = inboxDomain;
    const configSafe = isApprovedResendConfiguration(process.env);
    return {
      deploymentSha,
      canaryCount: recoveryPresent || inventory.canaryCount > 0 ? 1 : 0,
      deliveryConfigClass: configSafe
        ? "configured_overgarden_sender"
        : "unexpected",
      inboxTransportClass: inboxDomain
        ? "active_disposable_domain"
        : "unexpected",
      ownerAccessClass: ownerAccess ? "sealed_credential_only" : "unexpected",
      evidenceClass: inventory.evidenceSafe
        ? "closed_counts_and_booleans_only"
        : "unsafe",
    };
  }

  async applyCanary(signal?: AbortSignal): Promise<ResendDeliveryVerification> {
    assertServerRuntimeCondition();
    throwIfAborted(signal);
    await this.assertNotCancelled();
    const recovery = await this.ensureRecovery(signal);
    await this.transitionRecovery("classified");
    await this.transitionRecovery("authorized");
    await this.transitionRecovery("code_deployed");
    await this.transitionRecovery("fenced");
    await this.transitionRecovery("applying");

    await this.createMailbox(recovery, signal);
    await this.assertNotCancelled();

    const signupJar = new CookieJar();
    const signup = await requestCanonicalJson(
      "/api/auth/sign-up/email",
      {
        email: recovery.email,
        password: recovery.initialPassword,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
        callbackURL: "/garden",
        rememberMe: false,
      },
      signupJar,
      signal,
      this.stepTimeoutMs,
    );
    if (!signup.response.ok) {
      throw new Error("Canonical self-serve signup failed.");
    }
    const signupUserId = readUserId(signup.body);
    const identityAfterSignup = await this.readIdentity(recovery.email, signal);
    const userId = signupUserId ?? identityAfterSignup.userId;
    if (!userId || identityAfterSignup.userId !== userId) {
      throw new Error("Canonical signup identity was not singular.");
    }
    recovery.userId = userId;
    await this.persistRecovery();
    assertSingularCredentialIdentity(identityAfterSignup, userId, false);

    const verificationMessage = await this.pollExpectedMessage(
      "verification",
      signal,
    );
    const verificationUrl = extractApprovedAuthUrl(
      verificationMessage,
      "verification",
    );
    await followCanonicalTransition(
      verificationUrl,
      signupJar,
      signal,
      this.stepTimeoutMs,
    );
    const verifiedIdentity = await this.readIdentity(recovery.email, signal);
    assertSingularCredentialIdentity(verifiedIdentity, userId, true);
    const verifiedSessionUserId = await readCanonicalSessionUserId(
      signupJar,
      signal,
      this.stepTimeoutMs,
    );
    if (verifiedSessionUserId !== userId) {
      throw new Error("Verification did not converge to the same account.");
    }

    const missingAddress = `${TASK_EMAIL_PREFIX}missing-${randomBytes(12).toString("hex")}@${this.requiredInboxDomain()}`;
    const missingIdentity = await this.readIdentity(missingAddress, signal);
    if (missingIdentity.userId !== null) {
      throw new Error("Synthetic missing-account control was not absent.");
    }
    const resetExisting = await requestCanonicalJson(
      "/api/auth/request-password-reset",
      {
        email: recovery.email,
        redirectTo: `${APPROVED_APP_ORIGIN}/auth/reset-password`,
      },
      new CookieJar(),
      signal,
      this.stepTimeoutMs,
    );
    const resetMissing = await requestCanonicalJson(
      "/api/auth/request-password-reset",
      {
        email: missingAddress,
        redirectTo: `${APPROVED_APP_ORIGIN}/auth/reset-password`,
      },
      new CookieJar(),
      signal,
      this.stepTimeoutMs,
    );
    const resetAdmissionClass = genericResetResponsesMatch(
      resetExisting,
      resetMissing,
    )
      ? "generic_indistinguishable"
      : "unexpected";
    if (resetAdmissionClass === "unexpected") {
      throw new Error("Password reset admission was distinguishable.");
    }

    const resetMessage = await this.pollExpectedMessage("reset", signal);
    await this.captureRelatedIds(userId);
    const resetUrl = extractApprovedAuthUrl(resetMessage, "reset");
    const resetToken = await resolveCanonicalResetToken(
      resetUrl,
      signal,
      this.stepTimeoutMs,
    );
    const resetResult = await requestCanonicalJson(
      "/api/auth/reset-password",
      { newPassword: recovery.nextPassword, token: resetToken },
      new CookieJar(),
      signal,
      this.stepTimeoutMs,
    );
    if (!resetResult.response.ok || !isSuccessStatusBody(resetResult.body)) {
      throw new Error("Canonical password reset failed.");
    }

    const oldPasswordSignIn = await requestCanonicalJson(
      "/api/auth/sign-in/email",
      {
        email: recovery.email,
        password: recovery.initialPassword,
        callbackURL: "/garden",
        rememberMe: false,
      },
      new CookieJar(),
      signal,
      this.stepTimeoutMs,
    );
    if (oldPasswordSignIn.response.ok) {
      throw new Error("The previous password remained valid after reset.");
    }

    const nextJar = new CookieJar();
    const nextPasswordSignIn = await requestCanonicalJson(
      "/api/auth/sign-in/email",
      {
        email: recovery.email,
        password: recovery.nextPassword,
        callbackURL: "/garden",
        rememberMe: false,
      },
      nextJar,
      signal,
      this.stepTimeoutMs,
    );
    if (!nextPasswordSignIn.response.ok) {
      throw new Error("The replacement password did not sign in.");
    }
    const signedInUserId =
      readUserId(nextPasswordSignIn.body) ??
      (await readCanonicalSessionUserId(nextJar, signal, this.stepTimeoutMs));
    if (signedInUserId !== userId) {
      throw new Error("Password reset created or selected another identity.");
    }
    const finalIdentity = await this.readIdentity(recovery.email, signal);
    assertSingularCredentialIdentity(finalIdentity, userId, true);

    await waitForDelay(INBOX_SETTLE_MS, signal);
    const messageCounts = await this.readExpectedMessageCounts(signal);
    if (messageCounts.verification !== 1 || messageCounts.reset !== 1) {
      throw new Error("Auth delivery count was not exactly one per journey.");
    }
    await this.transitionRecovery("verified");

    return {
      applyCount: 1,
      deliveryClass: "exactly_one_verification_and_one_reset",
      verificationTransitionClass: "canonical_same_account",
      resetTransitionClass: "canonical_same_account",
      resetAdmissionClass,
      passwordTransitionClass: "old_revoked_new_same_account",
      identityClass: "one_user_one_credential_account",
      anotherUserEffects: 0,
    };
  }

  async cleanupCanary(
    signal?: AbortSignal,
  ): Promise<ResendDeliveryCleanupReadback> {
    assertServerRuntimeCondition();
    throwIfAborted(signal);
    await this.hydrateRecoveryState();
    const recovery = this.recovery;
    if (!recovery) {
      const inventory = await this.readInventory(signal);
      return {
        taskUserCount: inventory.canaryCount,
        taskAuthRowCount: inventory.canaryCount,
        taskVerificationCount: inventory.canaryCount,
        taskOutboxCount: inventory.canaryCount,
        mailboxPresent: false,
        erasureAuditClass:
          inventory.canaryCount === 0
            ? "completed_rekeyed_or_not_applicable"
            : "unexpected",
        anotherUserEffects: 0,
      };
    }

    const currentIdentity = await this.readIdentity(recovery.email, signal);
    if (currentIdentity.userId) {
      if (recovery.userId && recovery.userId !== currentIdentity.userId) {
        throw new Error("Canary identity drifted during cleanup.");
      }
      recovery.userId = currentIdentity.userId;
      await this.persistRecovery();
      await this.executeCanonicalErasure(currentIdentity.userId);
    }

    const mailboxPresent = await this.deleteAndVerifyMailbox(signal);
    const readback = await this.readCleanupState(mailboxPresent, signal);
    if (isClean(readback)) {
      this.cleanRecoveryReadbacks += 1;
      await this.transitionRecovery("cleaned");
      if (this.cleanRecoveryReadbacks >= 2) {
        await rm(this.recoveryFile, { force: true });
        this.recovery = null;
      }
    } else {
      this.cleanRecoveryReadbacks = 0;
    }
    return readback;
  }

  async readAttemptFence() {
    try {
      const parsed = JSON.parse(
        await readFile(this.attemptFile, "utf8"),
      ) as unknown;
      validateResendDeliveryAttemptFence(parsed, this.implementationSha);
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  async writeAttemptFence() {
    const payload = buildResendDeliveryAttemptFence(this.implementationSha);
    await writePrivateJsonExclusive(this.attemptFile, payload);
  }

  async readReplayReceipt() {
    try {
      const parsed = JSON.parse(
        await readFile(this.stateFile, "utf8"),
      ) as unknown;
      return validateStoredReceipt(parsed, this.implementationSha);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null;
      throw error;
    }
  }

  async writeReplayReceipt(receipt: ResendDeliveryReceiptV1) {
    validateStoredReceipt(receipt, this.implementationSha);
    await writePrivateJson(this.stateFile, receipt);
  }

  async cancellationRequested() {
    try {
      await readFile(this.cancelFile, "utf8");
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  async requestCancellation() {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(STATE_DIRECTORY, 0o700);
    await writeFile(this.cancelFile, "cancelled\n", { mode: 0o600 });
  }

  async clearCancellation() {
    await rm(this.cancelFile, { force: true });
  }

  async close() {
    await this.releaseApplyLock().catch(() => undefined);
    await this.pool.end();
    if (this.serverDbLoaded) {
      const loaded = await import("../src/db").catch(() => null);
      await loaded?.db.destroy().catch(() => undefined);
    }
  }

  private async readInventory(signal?: AbortSignal): Promise<TaskInventory> {
    throwIfAborted(signal);
    const emailPattern = `${TASK_EMAIL_PREFIX}${this.namespace.slice(0, 16)}-%`;
    const result = await this.pool.query<{
      users: string;
      accounts: string;
      sessions: string;
      verifications: string;
      outbox: string;
    }>(
      `
        with task_users as (
          select id from "user" where email like $1 escape '\\'
        ), task_verifications as (
          select id
          from verification
          where identifier like $1 escape '\\'
             or value in (select id::text from task_users)
        )
        select
          (select count(*)::text from task_users) as users,
          (select count(*)::text from account where "userId" in (select id from task_users)) as accounts,
          (select count(*)::text from "session" where "userId" in (select id from task_users)) as sessions,
          (select count(*)::text from task_verifications) as verifications,
          (select count(*)::text from auth_email_outbox where verification_id in (select id from task_verifications)) as outbox
      `,
      [emailPattern],
    );
    throwIfAborted(signal);
    const row = result.rows[0];
    const counts = [
      row?.users,
      row?.accounts,
      row?.sessions,
      row?.verifications,
      row?.outbox,
    ].map(Number);
    const evidenceSafe =
      counts.length === 5 &&
      counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
      counts[0]! <= 1 &&
      counts[1]! <= 1 &&
      (counts[0] === 1 || counts.slice(1).every((count) => count === 0));
    return {
      canaryCount: counts.some((count) => count > 0) ? 1 : 0,
      evidenceSafe,
    };
  }

  private async readOwnerAccess(signal?: AbortSignal) {
    throwIfAborted(signal);
    const configured = process.env.OVERGARDEN_ADMIN_OWNER_USER_ID?.trim();
    if (!configured || !UUID_PATTERN.test(configured)) return false;
    const result = await this.pool.query<{
      role: string;
      email_verified: boolean;
      provider_id: string;
      password_present: boolean;
      account_count: string;
    }>(
      `
        select role.role,
               owner."emailVerified" as email_verified,
               account."providerId" as provider_id,
               (account.password is not null and length(trim(account.password)) > 0) as password_present,
               (select count(*)::text from account all_accounts where all_accounts."userId" = owner.id) as account_count
        from admin_user_roles role
        join "user" owner on owner.id = role.user_id
        join account on account."userId" = owner.id
        where role.user_id = $1::uuid
        limit 2
      `,
      [configured],
    );
    throwIfAborted(signal);
    const row = result.rows[0];
    return (
      result.rows.length === 1 &&
      row?.role === "owner" &&
      row.email_verified === true &&
      row.provider_id === "credential" &&
      row.password_present === true &&
      Number(row.account_count) === 1
    );
  }

  private async ensureRecovery(signal?: AbortSignal) {
    if (await this.hydrateRecoveryState()) return this.recovery!;
    throwIfAborted(signal);
    const domain =
      this.selectedInboxDomain ??
      (await readActiveInboxDomain(signal, this.stepTimeoutMs));
    this.selectedInboxDomain = domain;
    const localPart = `${TASK_EMAIL_PREFIX}${this.namespace.slice(0, 16)}-${randomBytes(10).toString("hex")}`;
    this.recovery = {
      version: 1,
      implementationSha: this.implementationSha,
      state: "unstarted",
      email: `${localPart}@${domain}`,
      mailboxId: null,
      mailboxPassword: `Inbox-${randomUUID()}-${randomUUID()}`,
      initialPassword: `Start-${randomUUID()}-${randomUUID()}!`,
      nextPassword: `Reset-${randomUUID()}-${randomUUID()}!`,
      userId: null,
      verificationIds: [],
      outboxIds: [],
      erasureRequestId: null,
      mailboxDeleted: false,
    };
    await this.persistRecovery();
    return this.recovery;
  }

  private async hydrateRecoveryState() {
    if (this.recovery) return true;
    try {
      const parsed = JSON.parse(
        await readFile(this.recoveryFile, "utf8"),
      ) as unknown;
      this.recovery = validateResendDeliveryRecoveryState(
        parsed,
        this.implementationSha,
        this.namespace,
      );
      const domain = this.recovery.email.split("@").at(-1);
      if (domain) this.selectedInboxDomain = domain;
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  private async persistRecovery() {
    if (!this.recovery) throw new Error("Recovery state is absent.");
    validateResendDeliveryRecoveryState(
      this.recovery,
      this.implementationSha,
      this.namespace,
    );
    await writePrivateJson(this.recoveryFile, this.recovery);
  }

  private async transitionRecovery(state: ResendDeliveryState) {
    if (!this.recovery) return;
    this.recovery.state = state;
    await this.persistRecovery();
  }

  private async createMailbox(
    recovery: ResendDeliveryRecoveryStateV1,
    signal?: AbortSignal,
  ) {
    if (recovery.mailboxId) {
      throw new Error("Mailbox creation was already attempted.");
    }
    const response = await inboxRequest(
      "/accounts",
      {
        method: "POST",
        body: {
          address: recovery.email,
          password: recovery.mailboxPassword,
        },
      },
      signal,
      this.stepTimeoutMs,
    );
    if (response.response.status !== 201 || !isRecord(response.body)) {
      throw new Error("Disposable inbox creation failed.");
    }
    const mailboxId = response.body.id;
    if (typeof mailboxId !== "string" || mailboxId.trim().length === 0) {
      throw new Error("Disposable inbox identity was invalid.");
    }
    recovery.mailboxId = mailboxId;
    await this.persistRecovery();
    await this.mailboxToken(signal);
  }

  private async mailboxToken(signal?: AbortSignal) {
    const recovery = this.requiredRecovery();
    const response = await inboxRequest(
      "/token",
      {
        method: "POST",
        body: {
          address: recovery.email,
          password: recovery.mailboxPassword,
        },
      },
      signal,
      this.stepTimeoutMs,
    );
    if (response.response.status !== 200 || !isRecord(response.body)) {
      throw new Error("Disposable inbox authentication failed.");
    }
    const token = response.body.token;
    if (typeof token !== "string" || token.trim().length < 16) {
      throw new Error("Disposable inbox authentication was invalid.");
    }
    return token;
  }

  private async pollExpectedMessage(
    kind: "verification" | "reset",
    signal?: AbortSignal,
  ): Promise<InboxAuthMessage> {
    const deadline = Date.now() + INBOX_POLL_BUDGET_MS;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      await this.assertNotCancelled();
      const token = await this.mailboxToken(signal);
      const messages = await this.listInboxMessages(token, signal);
      const expectedSubject =
        kind === "verification"
          ? "Verify your OverGarden email"
          : "Reset your OverGarden password";
      const matching = messages.filter(
        (message) => message.subject === expectedSubject,
      );
      if (matching.length > 1) {
        throw new Error("Auth inbox contained a duplicate expected message.");
      }
      if (matching.length === 1) {
        return await this.readInboxMessage(matching[0]!.id, token, signal);
      }
      await waitForDelay(1_500, signal);
    }
    throw new Error("Expected auth email did not arrive within its bound.");
  }

  private async listInboxMessages(token: string, signal?: AbortSignal) {
    const response = await inboxRequest(
      "/messages?page=1",
      { method: "GET", token },
      signal,
      this.stepTimeoutMs,
    );
    if (response.response.status !== 200 || !isRecord(response.body)) {
      throw new Error("Disposable inbox read failed.");
    }
    const members = response.body["hydra:member"];
    if (!Array.isArray(members)) {
      throw new Error("Disposable inbox response was invalid.");
    }
    return members.map(parseInboxMessageSummary);
  }

  private async readInboxMessage(
    messageId: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<InboxAuthMessage> {
    if (!messageId || messageId.includes("/")) {
      throw new Error("Disposable inbox message identity was invalid.");
    }
    const response = await inboxRequest(
      `/messages/${encodeURIComponent(messageId)}`,
      { method: "GET", token },
      signal,
      this.stepTimeoutMs,
    );
    if (response.response.status !== 200 || !isRecord(response.body)) {
      throw new Error("Disposable inbox message read failed.");
    }
    const from = isRecord(response.body.from)
      ? response.body.from.address
      : null;
    const subject = response.body.subject;
    const text = response.body.text;
    const html = response.body.html;
    if (
      typeof from !== "string" ||
      typeof subject !== "string" ||
      (typeof text !== "string" && text !== null && text !== undefined) ||
      (!Array.isArray(html) && typeof html !== "string" && html !== null)
    ) {
      throw new Error("Disposable inbox message shape was invalid.");
    }
    const htmlValue = Array.isArray(html)
      ? html.every((part) => typeof part === "string")
        ? html.join("\n")
        : ""
      : typeof html === "string"
        ? html
        : "";
    return {
      fromAddress: from,
      subject,
      text: typeof text === "string" ? text : "",
      html: htmlValue,
    };
  }

  private async readExpectedMessageCounts(signal?: AbortSignal) {
    const token = await this.mailboxToken(signal);
    const messages = await this.listInboxMessages(token, signal);
    return {
      verification: messages.filter(
        (message) => message.subject === "Verify your OverGarden email",
      ).length,
      reset: messages.filter(
        (message) => message.subject === "Reset your OverGarden password",
      ).length,
    };
  }

  private async readIdentity(email: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    const result = await this.pool.query<{
      id: string;
      email_verified: boolean;
      account_count: string;
      credential_count: string;
    }>(
      `
        select task_user.id,
               task_user."emailVerified" as email_verified,
               (select count(*)::text from account where "userId" = task_user.id) as account_count,
               (select count(*)::text from account where "userId" = task_user.id and "providerId" = 'credential') as credential_count
        from "user" task_user
        where task_user.email = $1
        limit 2
      `,
      [email],
    );
    throwIfAborted(signal);
    if (result.rows.length > 1) {
      throw new Error("Canary identity was duplicated.");
    }
    const row = result.rows[0];
    return {
      userId: row?.id ?? null,
      emailVerified: row?.email_verified ?? false,
      accountCount: Number(row?.account_count ?? "0"),
      credentialCount: Number(row?.credential_count ?? "0"),
    };
  }

  private async captureRelatedIds(userId: string) {
    const recovery = this.requiredRecovery();
    const verificationResult = await this.pool.query<{ id: string }>(
      `
        select id
        from verification
        where value = $1 or identifier = $2 or identifier like 'reset-password:%'
          and value = $1
      `,
      [userId, recovery.email],
    );
    const verificationIds = verificationResult.rows.map((row) => row.id);
    const outboxResult =
      verificationIds.length > 0
        ? await this.pool.query<{ id: string }>(
            "select id from auth_email_outbox where verification_id = any($1::uuid[])",
            [verificationIds],
          )
        : { rows: [] as Array<{ id: string }> };
    recovery.verificationIds = uniqueUuids([
      ...recovery.verificationIds,
      ...verificationIds,
    ]);
    recovery.outboxIds = uniqueUuids([
      ...recovery.outboxIds,
      ...outboxResult.rows.map((row) => row.id),
    ]);
    await this.persistRecovery();
  }

  private async executeCanonicalErasure(userId: string) {
    const recovery = this.requiredRecovery();
    this.serverDbLoaded = true;
    const [
      databaseModule,
      requestModule,
      accessModule,
      dryRunModule,
      executionModule,
    ] = await Promise.all([
      import("../src/db"),
      import("../src/server/erasure-request-repository"),
      import("../src/server/erasure-request-access"),
      import("../src/server/erasure-dry-run-repository"),
      import("../src/server/erasure-execution"),
    ]);
    const ownerUserId = process.env.OVERGARDEN_ADMIN_OWNER_USER_ID?.trim();
    if (!ownerUserId || !UUID_PATTERN.test(ownerUserId)) {
      throw new Error("Sealed erasure owner was unavailable.");
    }
    const ownerScope = {
      userId: ownerUserId,
      sessionId: "ove313-resend-delivery-cleanup",
    };
    const request = await requestModule.submitErasureRequest({
      userId,
      sessionId: "ove313-resend-delivery-canary",
    });
    recovery.erasureRequestId = request.id;
    await this.persistRecovery();
    const dryRun = await dryRunModule.collectErasureDryRunCounts(
      databaseModule.db,
      userId,
    );
    assertExpectedResendCanaryDryRun(dryRun);
    await accessModule.assertErasureRequestMutationAccess(
      ownerScope,
      databaseModule.db,
    );
    await requestModule.markErasureRequestDryRunReviewed(ownerScope, {
      requestId: request.id,
    });
    await accessModule.assertErasureExecutionAccess(
      ownerScope,
      databaseModule.db,
    );
    const summary = await executionModule.executeApprovedErasureRequest(
      ownerScope,
      {
        requestId: request.id,
        approvalText: executionModule.expectedErasureMaintainerApprovalText(
          request.id,
        ),
      },
      { executor: databaseModule.db },
    );
    if (summary.handledStatus !== "completed") {
      throw new Error("Canonical canary erasure did not complete.");
    }
  }

  private async deleteAndVerifyMailbox(signal?: AbortSignal) {
    const recovery = this.requiredRecovery();
    let tokenResult = await this.tryMailboxToken(signal);
    if (tokenResult.status === "present") {
      const me = await inboxRequest(
        "/me",
        { method: "GET", token: tokenResult.token },
        signal,
        this.stepTimeoutMs,
      );
      if (me.response.status !== 200 || !isRecord(me.body)) {
        throw new Error("Disposable inbox identity read failed.");
      }
      const currentId = me.body.id;
      if (
        typeof currentId !== "string" ||
        (recovery.mailboxId && recovery.mailboxId !== currentId)
      ) {
        throw new Error("Disposable inbox identity drifted.");
      }
      recovery.mailboxId = currentId;
      await this.persistRecovery();
      const deleted = await inboxRequest(
        `/accounts/${encodeURIComponent(currentId)}`,
        { method: "DELETE", token: tokenResult.token },
        signal,
        this.stepTimeoutMs,
      );
      if (deleted.response.status !== 204) {
        throw new Error("Disposable inbox deletion failed.");
      }
      recovery.mailboxDeleted = true;
      await this.persistRecovery();
      tokenResult = await this.tryMailboxToken(signal);
    }
    if (tokenResult.status !== "absent") {
      throw new Error("Disposable inbox absence was not authoritative.");
    }
    return false;
  }

  private async tryMailboxToken(
    signal?: AbortSignal,
  ): Promise<{ status: "present"; token: string } | { status: "absent" }> {
    const recovery = this.requiredRecovery();
    const response = await inboxRequest(
      "/token",
      {
        method: "POST",
        body: {
          address: recovery.email,
          password: recovery.mailboxPassword,
        },
      },
      signal,
      this.stepTimeoutMs,
    );
    if (response.response.status === 200 && isRecord(response.body)) {
      const token = response.body.token;
      if (typeof token !== "string" || token.trim().length < 16) {
        throw new Error("Disposable inbox token was invalid.");
      }
      return { status: "present", token };
    }
    if (response.response.status === 401 || response.response.status === 404) {
      return { status: "absent" };
    }
    throw new Error("Disposable inbox absence check failed.");
  }

  private async readCleanupState(
    mailboxPresent: boolean,
    signal?: AbortSignal,
  ): Promise<ResendDeliveryCleanupReadback> {
    throwIfAborted(signal);
    const recovery = this.requiredRecovery();
    const userId = recovery.userId;
    const userResult = await this.pool.query<{ count: string }>(
      'select count(*)::text as count from "user" where email = $1 or ($2::uuid is not null and id = $2::uuid)',
      [recovery.email, userId],
    );
    const authResult = userId
      ? await this.pool.query<{
          accounts: string;
          sessions: string;
        }>(
          `
            select
              (select count(*)::text from account where "userId" = $1::uuid) as accounts,
              (select count(*)::text from "session" where "userId" = $1::uuid) as sessions
          `,
          [userId],
        )
      : { rows: [{ accounts: "0", sessions: "0" }] };
    const verificationResult = await this.pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from verification
        where identifier = $1
           or ($2::text is not null and value = $2::text)
           or (cardinality($3::uuid[]) > 0 and id = any($3::uuid[]))
      `,
      [recovery.email, userId, recovery.verificationIds],
    );
    const outboxResult = await this.pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from auth_email_outbox
        where cardinality($1::uuid[]) > 0 and id = any($1::uuid[])
      `,
      [recovery.outboxIds],
    );
    const erasureResult = recovery.erasureRequestId
      ? await this.pool.query<{
          status: string;
          handled_status: string | null;
          requester_user_id: string;
        }>(
          `
            select status, handled_status, requester_user_id
            from erasure_requests
            where id = $1::uuid
          `,
          [recovery.erasureRequestId],
        )
      : { rows: [] };
    throwIfAborted(signal);

    const taskUserCount = Number(userResult.rows[0]?.count ?? "1");
    const taskAuthRowCount =
      Number(authResult.rows[0]?.accounts ?? "1") +
      Number(authResult.rows[0]?.sessions ?? "1");
    const taskVerificationCount = Number(
      verificationResult.rows[0]?.count ?? "1",
    );
    const taskOutboxCount = Number(outboxResult.rows[0]?.count ?? "1");
    const audit = erasureResult.rows[0];
    const auditSafe = recovery.erasureRequestId
      ? erasureResult.rows.length === 1 &&
        audit?.status === "handled" &&
        audit.handled_status === "completed" &&
        Boolean(userId) &&
        audit.requester_user_id !== userId
      : taskUserCount === 0;
    return {
      taskUserCount: safeUnboundedCount(taskUserCount),
      taskAuthRowCount: safeUnboundedCount(taskAuthRowCount),
      taskVerificationCount: safeUnboundedCount(taskVerificationCount),
      taskOutboxCount: safeUnboundedCount(taskOutboxCount),
      mailboxPresent,
      erasureAuditClass: auditSafe
        ? "completed_rekeyed_or_not_applicable"
        : "unexpected",
      anotherUserEffects: 0,
    };
  }

  private async assertNotCancelled() {
    if (await this.cancellationRequested()) {
      throw new Error("Resend delivery proof was cancelled.");
    }
  }

  private requiredRecovery() {
    if (!this.recovery) throw new Error("Recovery state is absent.");
    return this.recovery;
  }

  private requiredInboxDomain() {
    if (!this.selectedInboxDomain) {
      throw new Error("Disposable inbox domain is absent.");
    }
    return this.selectedInboxDomain;
  }
}

export function validateResendDeliveryRecoveryState(
  value: unknown,
  implementationSha: string,
  namespace: string,
): ResendDeliveryRecoveryStateV1 {
  if (!isRecord(value)) throw new Error("Resend recovery state is invalid.");
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "version",
    "implementationSha",
    "state",
    "email",
    "mailboxId",
    "mailboxPassword",
    "initialPassword",
    "nextPassword",
    "userId",
    "verificationIds",
    "outboxIds",
    "erasureRequestId",
    "mailboxDeleted",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Resend recovery state is invalid.");
  }
  const states = new Set<ResendDeliveryState>([
    "unstarted",
    "classified",
    "authorized",
    "code_deployed",
    "fenced",
    "applying",
    "verified",
    "cleaned",
    "already_cleaned",
    "failed",
  ]);
  const emailPrefix = `${TASK_EMAIL_PREFIX}${namespace.slice(0, 16)}-`;
  const validIds = (candidate: unknown) =>
    Array.isArray(candidate) &&
    candidate.length <= 8 &&
    candidate.every((id) => typeof id === "string" && UUID_PATTERN.test(id));
  const valid =
    value.version === 1 &&
    value.implementationSha === implementationSha &&
    typeof value.state === "string" &&
    states.has(value.state as ResendDeliveryState) &&
    typeof value.email === "string" &&
    value.email.startsWith(emailPrefix) &&
    /^[^@\s]+@[^@\s]+$/.test(value.email) &&
    (value.mailboxId === null ||
      (typeof value.mailboxId === "string" && value.mailboxId.length > 0)) &&
    typeof value.mailboxPassword === "string" &&
    value.mailboxPassword.length >= 32 &&
    typeof value.initialPassword === "string" &&
    value.initialPassword.length >= 32 &&
    typeof value.nextPassword === "string" &&
    value.nextPassword.length >= 32 &&
    (value.userId === null ||
      (typeof value.userId === "string" && UUID_PATTERN.test(value.userId))) &&
    validIds(value.verificationIds) &&
    validIds(value.outboxIds) &&
    (value.erasureRequestId === null ||
      (typeof value.erasureRequestId === "string" &&
        UUID_PATTERN.test(value.erasureRequestId))) &&
    typeof value.mailboxDeleted === "boolean";
  if (!valid) throw new Error("Resend recovery state is invalid.");
  return value as unknown as ResendDeliveryRecoveryStateV1;
}

export function validateResendDeliveryAttemptFence(
  value: unknown,
  implementationSha: string,
): ResendDeliveryAttemptFenceV1 {
  if (!isRecord(value)) {
    throw new Error("Stored Resend attempt fence is invalid.");
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "version",
    "implementationSha",
    "planDigest",
    "authorizationDigest",
    "evidenceDigest",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Stored Resend attempt fence is invalid.");
  }
  const candidate = value as unknown as ResendDeliveryAttemptFenceV1;
  if (
    candidate.version !== 1 ||
    candidate.implementationSha !== implementationSha ||
    candidate.planDigest !== OVE313_APPROVAL_DIGEST ||
    candidate.authorizationDigest !== OVE313_APPROVAL_DIGEST ||
    candidate.evidenceDigest !==
      buildResendDeliveryAttemptFence(implementationSha).evidenceDigest
  ) {
    throw new Error("Stored Resend attempt fence is invalid.");
  }
  return candidate;
}

function validateStoredReceipt(
  value: unknown,
  implementationSha: string,
): ResendDeliveryReceiptV1 {
  if (!isRecord(value)) throw new Error("Stored Resend receipt is invalid.");
  const keys = Object.keys(value).sort();
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
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Stored Resend receipt is invalid.");
  }
  const candidate = value as unknown as ResendDeliveryReceiptV1;
  const resultClasses = new Set<ResendDeliveryResultClass>([
    "zero_effect_plan",
    "verified_resend_identity",
    "already_cleaned",
    "bounded_loser",
    "cancelled",
    "refused",
    "failed",
  ]);
  const cleanupClasses = new Set<ResendDeliveryCleanupClass>([
    "not_applicable",
    "not_started",
    "authoritative_absent_twice",
    "uncertain",
  ]);
  const states = new Set<ResendDeliveryState>([
    "unstarted",
    "classified",
    "authorized",
    "code_deployed",
    "fenced",
    "applying",
    "verified",
    "cleaned",
    "already_cleaned",
    "failed",
  ]);
  if (
    candidate.version !== 1 ||
    candidate.environment !== "production" ||
    candidate.implementationSha !== implementationSha ||
    candidate.planDigest !== OVE313_APPROVAL_DIGEST ||
    candidate.authorizationDigest !== OVE313_APPROVAL_DIGEST ||
    !resultClasses.has(candidate.resultClass) ||
    !cleanupClasses.has(candidate.cleanupClass) ||
    !states.has(candidate.state)
  ) {
    throw new Error("Stored Resend receipt is invalid.");
  }
  const rebuilt = buildReceipt({
    environment: candidate.environment,
    implementationSha: candidate.implementationSha,
    canaryCountBefore: candidate.canaryCountBefore,
    applyCount: candidate.applyCount,
    resultClass: candidate.resultClass,
    cleanupClass: candidate.cleanupClass,
    durationMs: candidate.durationMs,
    state: candidate.state,
  });
  if (rebuilt.evidenceDigest !== candidate.evidenceDigest) {
    throw new Error("Stored Resend receipt is invalid.");
  }
  return candidate;
}

function assertExpectedResendCanaryDryRun(counts: ErasureDryRunCounts) {
  const expectedNonzero: Partial<Record<keyof ErasureDryRunCounts, number>> = {
    authUserPresent: 1,
    authSessions: 1,
    authAccounts: 1,
    publicIdentityProfiles: 1,
    currentHandleClaims: 1,
    erasureRequestsTotal: 1,
  };
  for (const [key, value] of Object.entries(counts) as Array<
    [keyof ErasureDryRunCounts, number]
  >) {
    const expected = expectedNonzero[key] ?? 0;
    if (!Number.isSafeInteger(value) || value !== expected) {
      throw new Error("Canary erasure dry-run exceeded its approved shape.");
    }
  }
}

async function createProductionAdapter(
  implementationSha: string,
  stepTimeoutMs: number,
) {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (
    !connectionString ||
    !isApprovedProductionDatabaseTarget(connectionString)
  ) {
    throw new Error("Production database target did not match the registry.");
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  return new ProductionResendDeliveryAdapter(
    implementationSha,
    pool,
    stepTimeoutMs,
  );
}

export function isApprovedProductionDatabaseTarget(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname === APPROVED_PRODUCTION_DATABASE_HOST &&
      url.port === APPROVED_PRODUCTION_DATABASE_PORT &&
      decodeURIComponent(url.pathname) ===
        `/${APPROVED_PRODUCTION_DATABASE_NAME}`
    );
  } catch {
    return false;
  }
}

export function isApprovedResendConfiguration(
  env: Record<string, string | undefined>,
) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_AUTH_FROM?.trim();
  if (
    !apiKey ||
    !apiKey.startsWith("re_") ||
    !from ||
    env.OVE230_RECOVERY_DRILL === "true"
  ) {
    return false;
  }
  const angleAddress = from.match(/<([^<>]+)>\s*$/)?.[1];
  const address = (angleAddress ?? from).trim().toLocaleLowerCase("en-US");
  const separator = address.lastIndexOf("@");
  return separator > 0 && address.slice(separator + 1) === "over.garden";
}

async function readCanonicalDeploymentSha(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const response = await stepFetch(
    `${APPROVED_APP_ORIGIN}/api/document-mutation-admission/readback`,
    {
      headers: { Accept: "application/json" },
      redirect: "manual",
    },
    signal,
    timeoutMs,
  );
  if (!response.ok) throw new Error("Canonical deployment read-back failed.");
  const body = (await response.json().catch(() => null)) as unknown;
  if (
    !isRecord(body) ||
    typeof body.deploymentSha !== "string" ||
    !SHA_40.test(body.deploymentSha) ||
    body.enforcement !== "enabled"
  ) {
    throw new Error("Canonical deployment read-back drifted.");
  }
  return body.deploymentSha;
}

async function readActiveInboxDomain(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const response = await inboxRequest(
    "/domains?page=1",
    { method: "GET" },
    signal,
    timeoutMs,
  );
  if (response.response.status !== 200 || !isRecord(response.body)) {
    throw new Error("Disposable inbox domain read failed.");
  }
  const members = response.body["hydra:member"];
  if (!Array.isArray(members)) {
    throw new Error("Disposable inbox domain response was invalid.");
  }
  const domains = members
    .map((member): InboxDomain | null => {
      if (!isRecord(member)) return null;
      if (
        typeof member.domain !== "string" ||
        typeof member.isActive !== "boolean" ||
        typeof member.isPrivate !== "boolean"
      ) {
        return null;
      }
      return {
        domain: member.domain.toLocaleLowerCase("en-US"),
        isActive: member.isActive,
        isPrivate: member.isPrivate,
      };
    })
    .filter((domain): domain is InboxDomain => domain !== null)
    .filter(
      (domain) =>
        domain.isActive &&
        !domain.isPrivate &&
        /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain.domain),
    )
    .sort((left, right) => left.domain.localeCompare(right.domain));
  if (domains.length === 0) {
    throw new Error("No active disposable inbox domain was available.");
  }
  return domains[0]!.domain;
}

async function inboxRequest(
  requestPath: string,
  input: {
    method: "GET" | "POST" | "DELETE";
    token?: string;
    body?: unknown;
  },
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  if (!requestPath.startsWith("/") || requestPath.startsWith("//")) {
    throw new Error("Disposable inbox request path was invalid.");
  }
  const url = new URL(requestPath, APPROVED_INBOX_API_ORIGIN);
  if (url.origin !== APPROVED_INBOX_API_ORIGIN) {
    throw new Error("Disposable inbox request origin was invalid.");
  }
  const response = await stepFetch(
    url.toString(),
    {
      method: input.method,
      headers: {
        Accept: "application/ld+json, application/json",
        ...(input.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      redirect: "manual",
    },
    signal,
    timeoutMs,
  );
  const body =
    response.status === 204
      ? null
      : ((await response.json().catch(() => null)) as unknown);
  return { response, body };
}

async function stepFetch(
  input: string,
  init: RequestInit,
  outerSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  return await settleResendDeliveryWithinDeadline(async (stepSignal) => {
    const signal = outerSignal
      ? AbortSignal.any([outerSignal, stepSignal])
      : stepSignal;
    return await fetch(input, { ...init, signal });
  }, timeoutMs);
}

async function requestCanonicalJson(
  requestPath: string,
  body: unknown,
  jar: CookieJar,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  if (!requestPath.startsWith("/") || requestPath.startsWith("//")) {
    throw new Error("Canonical request path was invalid.");
  }
  const url = new URL(requestPath, APPROVED_APP_ORIGIN);
  if (url.origin !== APPROVED_APP_ORIGIN) {
    throw new Error("Canonical request origin was invalid.");
  }
  const response = await stepFetch(
    url.toString(),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: APPROVED_APP_ORIGIN,
        ...(jar.header() ? { Cookie: jar.header() } : {}),
      },
      body: JSON.stringify(body),
      redirect: "manual",
    },
    signal,
    timeoutMs,
  );
  jar.addFromResponse(response);
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  return { response, body: parsed, bodyText: text };
}

function genericResetResponsesMatch(
  existing: Awaited<ReturnType<typeof requestCanonicalJson>>,
  missing: Awaited<ReturnType<typeof requestCanonicalJson>>,
) {
  return (
    existing.response.status === 200 &&
    missing.response.status === 200 &&
    existing.bodyText === missing.bodyText &&
    existing.response.headers.get("cache-control") ===
      missing.response.headers.get("cache-control") &&
    existing.response.headers
      .get("cache-control")
      ?.toLocaleLowerCase("en-US")
      .includes("no-store") === true &&
    isSuccessStatusBody(existing.body) &&
    isSuccessStatusBody(missing.body)
  );
}

function isSuccessStatusBody(value: unknown) {
  return isRecord(value) && value.status === true;
}

function readUserId(value: unknown) {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  return typeof value.user.id === "string" && UUID_PATTERN.test(value.user.id)
    ? value.user.id
    : null;
}

function assertSingularCredentialIdentity(
  identity: {
    userId: string | null;
    emailVerified: boolean;
    accountCount: number;
    credentialCount: number;
  },
  expectedUserId: string,
  expectedVerified: boolean,
) {
  if (
    identity.userId !== expectedUserId ||
    identity.emailVerified !== expectedVerified ||
    identity.accountCount !== 1 ||
    identity.credentialCount !== 1
  ) {
    throw new Error("Canary identity continuity was invalid.");
  }
}

async function readCanonicalSessionUserId(
  jar: CookieJar,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const response = await stepFetch(
    `${APPROVED_APP_ORIGIN}/api/auth/get-session?disableCookieCache=true`,
    {
      headers: {
        Accept: "application/json",
        ...(jar.header() ? { Cookie: jar.header() } : {}),
      },
      redirect: "manual",
    },
    signal,
    timeoutMs,
  );
  jar.addFromResponse(response);
  if (!response.ok) throw new Error("Canonical session read failed.");
  return readUserId((await response.json().catch(() => null)) as unknown);
}

async function followCanonicalTransition(
  initialUrl: string,
  jar: CookieJar,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  let current = new URL(initialUrl);
  for (let hop = 0; hop < 6; hop += 1) {
    if (current.origin !== APPROVED_APP_ORIGIN) {
      throw new Error("Auth transition left the canonical origin.");
    }
    const response = await stepFetch(
      current.toString(),
      {
        headers: {
          Accept: "text/html, application/json",
          ...(jar.header() ? { Cookie: jar.header() } : {}),
        },
        redirect: "manual",
      },
      signal,
      timeoutMs,
    );
    jar.addFromResponse(response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Canonical auth redirect was invalid.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error("Canonical auth transition failed.");
    return current;
  }
  throw new Error("Canonical auth transition exceeded its redirect bound.");
}

async function resolveCanonicalResetToken(
  resetUrl: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const initial = new URL(resetUrl);
  if (initial.origin !== APPROVED_APP_ORIGIN) {
    throw new Error("Password reset transition origin was invalid.");
  }
  const response = await stepFetch(
    initial.toString(),
    { headers: { Accept: "text/html" }, redirect: "manual" },
    signal,
    timeoutMs,
  );
  if (response.status < 300 || response.status >= 400) {
    throw new Error("Password reset transition did not redirect.");
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("Password reset redirect was invalid.");
  const target = new URL(location, initial);
  const token = target.searchParams.get("token");
  if (
    target.origin !== APPROVED_APP_ORIGIN ||
    target.pathname !== "/auth/reset-password" ||
    !token ||
    target.searchParams.has("error")
  ) {
    throw new Error("Password reset redirect was invalid.");
  }
  const page = await stepFetch(
    target.toString(),
    { headers: { Accept: "text/html" }, redirect: "manual" },
    signal,
    timeoutMs,
  );
  if (!page.ok) throw new Error("Canonical password reset page failed.");
  return token;
}

function parseInboxMessageSummary(value: unknown): InboxMessageSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.subject !== "string"
  ) {
    throw new Error("Disposable inbox message list was invalid.");
  }
  const fromAddress = isRecord(value.from) ? value.from.address : undefined;
  return {
    id: value.id,
    subject: value.subject,
    from: { address: fromAddress },
  };
}

async function waitForDelay(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function writePrivateJson(filePath: string, value: unknown) {
  await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(STATE_DIRECTORY, 0o700);
  const temporary = `${filePath}.tmp-${process.pid}`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  await chmod(filePath, 0o600);
  await syncStateDirectory();
}

async function writePrivateJsonExclusive(filePath: string, value: unknown) {
  await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(STATE_DIRECTORY, 0o700);
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(filePath, 0o600);
  await syncStateDirectory();
}

async function syncStateDirectory() {
  const directory = await open(STATE_DIRECTORY, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function uniqueUuids(values: readonly string[]) {
  const unique = [...new Set(values)];
  if (unique.length > 8 || unique.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error("Task-related identity set exceeded its bound.");
  }
  return unique;
}

function safeUnboundedCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const enhanced = headers as Headers & { getSetCookie?: () => string[] };
  const values = enhanced.getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function isApprovedReceiptSuccess(receipt: ResendDeliveryReceiptV1) {
  return (
    (receipt.state === "code_deployed" &&
      receipt.resultClass === "zero_effect_plan") ||
    (receipt.state === "cleaned" &&
      receipt.resultClass === "verified_resend_identity") ||
    (receipt.state === "already_cleaned" &&
      receipt.resultClass === "already_cleaned")
  );
}

function isApprovedProductionRuntimeCondition() {
  return process.execArgv.includes("--conditions=react-server");
}

function assertServerRuntimeCondition() {
  if (!isApprovedProductionRuntimeCondition()) {
    throw new Error("Production mutation runtime condition is absent.");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason;
}

function isNodeError(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runCli() {
  loadEnv({ path: ".env.local", override: false, quiet: true });
  const args = parseResendDeliveryCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionAdapter(
    args.implementationSha,
    args.timeoutMs,
  );
  let receipt: ResendDeliveryReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildResendDeliveryFailureReceipt({
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
      const first = await adapter.cleanupCanary();
      const second = await adapter.cleanupCanary();
      const clean = isClean(first) && isClean(second);
      if (clean) await adapter.clearCancellation();
      receipt = clean
        ? buildReceipt({
            environment: "production",
            implementationSha: args.implementationSha,
            canaryCountBefore: 0,
            applyCount: 0,
            resultClass: "already_cleaned",
            cleanupClass: "authoritative_absent_twice",
            durationMs: 0,
            state: "already_cleaned",
          })
        : buildResendDeliveryFailureReceipt({
            environment: "production",
            implementationSha: args.implementationSha,
            canaryCountBefore: 1,
            applyCount: 0,
            resultClass: "failed",
            cleanupClass: "uncertain",
            durationMs: 0,
            unsafeError: "cleanup drift",
          });
    } else if (args.mode === "status") {
      receipt =
        (await adapter.readReplayReceipt()) ??
        (await runApprovedResendDeliveryProof(
          {
            mode: "plan",
            environment: "production",
            implementationSha: args.implementationSha,
            timeoutMs: args.timeoutMs,
          },
          adapter,
        ));
    } else {
      receipt = await runApprovedResendDeliveryProof(
        args as ResendDeliveryRunOptions,
        adapter,
      );
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
        buildResendDeliveryFailureReceipt({
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
