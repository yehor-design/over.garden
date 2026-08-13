import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
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
import { containsPreciseLocationText } from "../src/lib/privacy/precise-location-text";
import { PREFIXED_PUBLIC_LOCALES } from "../src/lib/public-localization";

export const OVE306_APPROVED_PLAN =
  "OVE-306-amendment-1|production|after the exhausted clean failure, create and publish one fresh owner-scoped disposable journal canary, allow the canonical live worker and transactional projection outbox a bounded 180-second total proof budget, observe one identifiers-only index job reach done and one public-only document appear, archive it, observe one identifiers-only unindex job reach done and authoritative absence, then erase the exact canary|baseline:a79b8a71025b8b4d4e7d706b2fe477e81865182a|one-fresh-canary|cleanup-required|supersedes:2863b7e1b10d04e574e5cd53daf604dbe8dc4d121b1bbe1bd1114ab2a81f1c49" as const;
export const OVE306_APPROVAL_DIGEST =
  "601472f9690bad019e4e3a066ed98b653d77662fb65adf5087133b1625ee0346" as const;
export const OVE306_JOURNAL_WORKER_TIMEOUT_MS = 180_000;
export const OVE306_ASYNC_WAIT_TIMEOUT_MS = 60_000;
export const OVE306_DIRECT_REQUEST_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const APPROVED_APP_ORIGIN = "https://over.garden";
const APPROVED_MATCHING_ORIGIN = "https://matching.over.garden";
const MATCHING_RUNTIME_SCHEMA = "ove194.matchingRuntime.v1";
const MATCHING_SCHEMA_COMPATIBILITY = "ove190.matching-schema.v1";
const MATCHING_HANDLER_MANIFEST = [
  "catalog_alias_suggestions_refresh",
  "catalog_fuzzy_duplicate_qa_refresh",
  "catalog_match_suggestions_refresh",
  "catalog_typeahead_reindex",
  "journal_entry_index",
  "journal_entry_unindex",
] as const;
const TASK_EMAIL_PREFIX = "ove306-journal-worker-";
const TASK_EMAIL_SUFFIX = "@over.garden";
const TASK_TITLE = "OVE-306 disposable worker proof";
const TASK_BODY = "Synthetic non-personal worker convergence proof.";
const TASK_SPACE_NAME = "OVE-306 disposable worker space";
const TASK_PLANT_NAME = "OVE-306 disposable worker plant";
const APPLY_LOCK_KEY = 3_060_306;
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));

export type JournalWorkerState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type JournalWorkerResultClass =
  | "zero_effect_plan"
  | "verified_journal_worker"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type JournalWorkerCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface JournalWorkerReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE306_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE306_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: JournalWorkerResultClass;
  cleanupClass: JournalWorkerCleanupClass;
  durationMs: number;
  state: JournalWorkerState;
  evidenceDigest: string;
}

export interface JournalWorkerBoundary {
  deploymentSha: string;
  canaryCount: number;
  ownerAccessClass: "task_owned_or_absent" | "another_owner";
  evidenceClass: "closed_counts_and_booleans_only" | "unsafe";
  workerCapabilityClass: "ready_exact_handlers" | "unexpected";
}

export interface JournalWorkerVerification {
  applyCount: number;
  indexJobClass: "done_identifiers_only" | "unexpected";
  publicDocumentClass: "public_safe_exact_shape" | "unexpected";
  unindexJobClass: "done_identifiers_only" | "unexpected";
  staleDocumentClass: "authoritative_absent" | "unexpected";
  parityClass: "converged" | "unexpected";
  responseClass: "http_410" | "unexpected";
  tombstoneClass: "generic_content_free" | "unexpected";
  robotsClass: "noindex_nofollow" | "unexpected";
  publicEligibilityClass: "revoked" | "unexpected";
  searchProjectionClass: "authoritative_absent" | "unexpected";
  preciseLocationPresent: boolean;
  privateContentPresent: boolean;
  anotherOwnerEffects: number;
}

export interface JournalWorkerCleanupReadback {
  taskCanaryCount: number;
  publicRoutePresent: boolean;
  searchDocumentPresent: boolean;
  anotherOwnerEffects: number;
}

export interface JournalWorkerAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<JournalWorkerBoundary>;
  readApplyAttempt(): Promise<boolean>;
  claimApplyAttempt(): Promise<"claimed" | "already_claimed">;
  applyCanary(signal?: AbortSignal): Promise<JournalWorkerVerification>;
  cleanupCanary(signal?: AbortSignal): Promise<JournalWorkerCleanupReadback>;
  readReplayReceipt(): Promise<JournalWorkerReceiptV1 | null>;
  writeReplayReceipt(receipt: JournalWorkerReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface JournalWorkerRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type JournalWorkerCliArgs =
  | JournalWorkerRunOptions
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
  resultClass: JournalWorkerResultClass;
  cleanupClass: JournalWorkerCleanupClass;
  durationMs: number;
  state: JournalWorkerState;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedRequestSignal(signal?: AbortSignal) {
  const requestTimeout = AbortSignal.timeout(OVE306_DIRECT_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, requestTimeout]) : requestTimeout;
}

export function buildJournalWorkerReplayNamespace(implementationSha: string) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-306\0${implementationSha}\0${OVE306_APPROVAL_DIGEST}`);
}

function buildReceipt(input: BuildReceiptInput): JournalWorkerReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE306_JOURNAL_WORKER_TIMEOUT_MS
  ) {
    throw new Error(
      `journal worker duration must be between 0 and ${OVE306_JOURNAL_WORKER_TIMEOUT_MS}ms`,
    );
  }
  const payload: Omit<JournalWorkerReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE306_APPROVAL_DIGEST,
    authorizationDigest: OVE306_APPROVAL_DIGEST,
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
      `overgarden.ove306.journal-worker.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildJournalWorkerFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE306_JOURNAL_WORKER_TIMEOUT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: JournalWorkerBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.ownerAccessClass === "task_owned_or_absent" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only" &&
    boundary.workerCapabilityClass === "ready_exact_handlers"
  );
}

function isExactVerification(verification: JournalWorkerVerification) {
  return (
    verification.applyCount === 1 &&
    verification.indexJobClass === "done_identifiers_only" &&
    verification.publicDocumentClass === "public_safe_exact_shape" &&
    verification.unindexJobClass === "done_identifiers_only" &&
    verification.staleDocumentClass === "authoritative_absent" &&
    verification.parityClass === "converged" &&
    verification.responseClass === "http_410" &&
    verification.tombstoneClass === "generic_content_free" &&
    verification.robotsClass === "noindex_nofollow" &&
    verification.publicEligibilityClass === "revoked" &&
    verification.searchProjectionClass === "authoritative_absent" &&
    verification.preciseLocationPresent === false &&
    verification.privateContentPresent === false &&
    verification.anotherOwnerEffects === 0
  );
}

function isClean(readback: JournalWorkerCleanupReadback) {
  return (
    readback.taskCanaryCount === 0 &&
    readback.publicRoutePresent === false &&
    readback.searchDocumentPresent === false &&
    readback.anotherOwnerEffects === 0
  );
}

type JournalWorkerJobKind = "journal_entry_index" | "journal_entry_unindex";

export function isExactIdentifiersOnlyJournalJobPayload(
  payload: unknown,
  kind: JournalWorkerJobKind,
  journalEntryId: string,
  userId: string,
) {
  return (
    isRecord(payload) &&
    JSON.stringify(Object.keys(payload).sort()) ===
      JSON.stringify(["journalEntryId", "kind", "userId"]) &&
    payload.kind === kind &&
    payload.journalEntryId === journalEntryId &&
    payload.userId === userId &&
    isUuid(journalEntryId) &&
    isUuid(userId)
  );
}

async function proveCleanupTwice(
  adapter: JournalWorkerAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  const second = await adapter.cleanupCanary(signal);
  return isClean(second);
}

export async function runApprovedJournalWorkerProof(
  options: JournalWorkerRunOptions,
  adapter: JournalWorkerAdapter,
  signal?: AbortSignal,
): Promise<JournalWorkerReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      if (await adapter.readApplyAttempt()) {
        return buildJournalWorkerFailureReceipt({
          environment: options.environment,
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
        return buildJournalWorkerFailureReceipt({
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
      return buildJournalWorkerFailureReceipt({
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

  if (options.approvalDigest !== OVE306_APPROVAL_DIGEST) {
    return buildJournalWorkerFailureReceipt({
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
      return buildJournalWorkerFailureReceipt({
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

    if ((await adapter.claimApplyAttempt()) !== "claimed") {
      return buildJournalWorkerFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore: 0,
        applyCount: 0,
        resultClass: "refused",
        cleanupClass: "not_started",
        durationMs: elapsedMs(startedAt),
        unsafeError: "apply is single-use",
      });
    }

    if (await adapter.cancellationRequested()) {
      return buildJournalWorkerFailureReceipt({
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

    const boundary = await adapter.readBoundary(signal);
    canaryCountBefore = safeCount(boundary.canaryCount);
    if (!isExactBoundary(boundary, options.implementationSha)) {
      return buildJournalWorkerFailureReceipt({
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
      return buildJournalWorkerFailureReceipt({
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

    let verification: JournalWorkerVerification;
    try {
      applyCount = 1;
      verification = await adapter.applyCanary(signal);
      applyCount = safeCount(verification.applyCount);
    } catch (error) {
      const cleaned = await proveCleanupTwice(adapter, signal).catch(
        () => false,
      );
      return buildJournalWorkerFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount,
        resultClass: "failed",
        cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: error,
      });
    }

    const cleaned = await proveCleanupTwice(adapter, signal).catch(() => false);
    if (!isExactVerification(verification) || !cleaned) {
      return buildJournalWorkerFailureReceipt({
        environment: options.environment,
        implementationSha: options.implementationSha,
        canaryCountBefore,
        applyCount,
        resultClass: "failed",
        cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
        durationMs: elapsedMs(startedAt),
        unsafeError: "verification or cleanup drift",
      });
    }

    const receipt = buildReceipt({
      environment: options.environment,
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "verified_journal_worker",
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
    return buildJournalWorkerFailureReceipt({
      environment: options.environment,
      implementationSha: options.implementationSha,
      canaryCountBefore,
      applyCount,
      resultClass: "failed",
      cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
      durationMs: elapsedMs(startedAt),
      unsafeError: error,
    });
  } finally {
    if (locked) await adapter.releaseApplyLock().catch(() => undefined);
  }
}

export function settleJournalWorkerWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE306_JOURNAL_WORKER_TIMEOUT_MS
  ) {
    throw new Error(
      `journal worker deadline must be between 1 and ${OVE306_JOURNAL_WORKER_TIMEOUT_MS}ms`,
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
      controller.abort(new Error("Journal worker deadline exceeded."));
      finish(() =>
        reject(new Error(`journal worker exceeded ${deadlineMs}ms`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parseJournalWorkerCliArgs(
  input: readonly string[],
): JournalWorkerCliArgs {
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
    flagValue(argv, "--timeout-ms") ?? OVE306_JOURNAL_WORKER_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE306_JOURNAL_WORKER_TIMEOUT_MS
  ) {
    throw new Error(
      `--timeout-ms must be between 1 and ${OVE306_JOURNAL_WORKER_TIMEOUT_MS}`,
    );
  }

  const selected = [
    "--plan",
    "--apply",
    "--status",
    "--cancel",
    "--cleanup",
  ].filter((flag) => argv.includes(flag));
  if (selected.length !== 1) throw new Error("choose exactly one proof mode");
  const mode = selected[0]!.slice(2) as JournalWorkerCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE306_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-306");
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

export function classifyJournalWorkerHtml(
  html: string,
  privateMarkers: readonly string[],
  robotsHeader: string | null,
): Pick<
  JournalWorkerVerification,
  | "tombstoneClass"
  | "robotsClass"
  | "preciseLocationPresent"
  | "privateContentPresent"
> {
  const lower = html.toLowerCase();
  const forbiddenMarkers = [
    ...privateMarkers,
    "owner_user_id",
    "data-public-journal-entry",
    "quarantine/",
    "coordinates",
    "latitude",
    "longitude",
  ].filter(Boolean);
  const preciseLocationPresent = containsPreciseLocationText(html);
  const privateContentPresent = forbiddenMarkers.some((marker) =>
    lower.includes(marker.toLowerCase()),
  );
  const noindexMeta =
    /<meta\s+name=["']robots["']\s+content=["']noindex,\s*nofollow["']\s*\/?>/i.test(
      html,
    );
  const genericShell =
    /^\s*<!doctype html>/i.test(html) &&
    html.includes("<header><span>OverGarden</span>") &&
    !privateContentPresent &&
    !preciseLocationPresent;
  return {
    tombstoneClass: genericShell ? "generic_content_free" : "unexpected",
    robotsClass:
      noindexMeta && robotsHeader?.toLowerCase() === "noindex, nofollow"
        ? "noindex_nofollow"
        : "unexpected",
    preciseLocationPresent,
    privateContentPresent,
  };
}

export function resolveApprovedArchiveRedirect(
  publicPath: string,
  status: number,
  location: string | null,
) {
  if (status !== 307 || !location || !/^\/journal\/[^/]+$/.test(publicPath)) {
    return null;
  }
  try {
    const requested = new URL(publicPath, APPROVED_APP_ORIGIN);
    if (
      requested.origin !== APPROVED_APP_ORIGIN ||
      requested.pathname !== publicPath ||
      requested.search ||
      requested.hash
    ) {
      return null;
    }
    const redirect = new URL(location, APPROVED_APP_ORIGIN);
    if (
      redirect.origin !== APPROVED_APP_ORIGIN ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      !PREFIXED_PUBLIC_LOCALES.some(
        (locale) => redirect.pathname === `/${locale}${publicPath}`,
      )
    ) {
      return null;
    }
    return redirect.href;
  } catch {
    return null;
  }
}

interface TaskInventory {
  canaryCount: number;
  evidenceSafe: boolean;
}

interface TaskJournalRow {
  id: string;
  visibility: string;
  lifecycleState: string;
  publicSlug: string | null;
}

export interface JournalWorkerRecoveryStateV1 {
  version: 1;
  implementationSha: string;
  entryIds: string[];
  publicPaths: string[];
}

export function validateJournalWorkerRecoveryState(
  value: unknown,
  implementationSha: string,
): JournalWorkerRecoveryStateV1 {
  const expectedKeys = [
    "version",
    "implementationSha",
    "entryIds",
    "publicPaths",
  ].sort();
  if (
    !isRecord(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.implementationSha !== implementationSha ||
    !Array.isArray(value.entryIds) ||
    value.entryIds.length !== 1 ||
    !value.entryIds.every(
      (entryId): entryId is string =>
        typeof entryId === "string" && isUuid(entryId),
    ) ||
    new Set(value.entryIds).size !== value.entryIds.length ||
    !Array.isArray(value.publicPaths) ||
    value.publicPaths.length > 1 ||
    !value.publicPaths.every(
      (publicPath): publicPath is string =>
        typeof publicPath === "string" &&
        /^\/journal\/[^/?#]+$/.test(publicPath),
    ) ||
    new Set(value.publicPaths).size !== value.publicPaths.length
  ) {
    throw new Error("Journal worker recovery state drifted.");
  }
  return {
    version: 1,
    implementationSha,
    entryIds: [...value.entryIds],
    publicPaths: [...value.publicPaths],
  };
}

class CookieJar {
  private readonly values = new Map<string, string>();

  addFromResponse(response: Response) {
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

class ProductionJournalWorkerAdapter implements JournalWorkerAdapter {
  private lockClient: PoolClient | null = null;
  private readonly email: string;
  private readonly stateFile: string;
  private readonly attemptFile: string;
  private readonly cancelFile: string;
  private readonly recoveryFile: string;
  private userId: string | null = null;
  private sessionId: string | null = null;
  private readonly entryIds = new Set<string>();
  private readonly publicPaths = new Set<string>();
  private serverDbLoaded = false;
  private cleanRecoveryReadbacks = 0;

  constructor(
    private readonly implementationSha: string,
    private readonly pool: Pool,
  ) {
    const namespace = buildJournalWorkerReplayNamespace(
      implementationSha,
    ).slice(0, 24);
    this.email = `${TASK_EMAIL_PREFIX}${namespace}${TASK_EMAIL_SUFFIX}`;
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `ove306-journal-worker-${implementationSha}.json`,
    );
    this.attemptFile = path.join(
      STATE_DIRECTORY,
      `ove306-journal-worker-${implementationSha}.attempt`,
    );
    this.cancelFile = path.join(
      STATE_DIRECTORY,
      `ove306-journal-worker-${implementationSha}.cancel`,
    );
    this.recoveryFile = path.join(
      STATE_DIRECTORY,
      `ove306-journal-worker-${implementationSha}.recovery.json`,
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

  async readBoundary(signal?: AbortSignal): Promise<JournalWorkerBoundary> {
    const recoveryPresent = await this.hydrateRecoveryState();
    const [deploymentSha, inventory, workerCapabilityClass] = await Promise.all(
      [
        readCanonicalDeploymentSha(signal),
        this.readInventory(signal),
        readWorkerCapabilityClass(signal),
      ],
    );
    return {
      deploymentSha,
      canaryCount: inventory.canaryCount > 0 || recoveryPresent ? 1 : 0,
      ownerAccessClass: "task_owned_or_absent",
      evidenceClass: inventory.evidenceSafe
        ? "closed_counts_and_booleans_only"
        : "unsafe",
      workerCapabilityClass,
    };
  }

  async readApplyAttempt() {
    try {
      await readFile(this.attemptFile, "utf8");
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  async claimApplyAttempt() {
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(STATE_DIRECTORY, 0o700);
    try {
      await writeFile(this.attemptFile, "claimed\n", {
        mode: 0o600,
        flag: "wx",
      });
      await chmod(this.attemptFile, 0o600);
      return "claimed" as const;
    } catch (error) {
      if (isNodeError(error, "EEXIST")) return "already_claimed" as const;
      throw error;
    }
  }

  async applyCanary(signal?: AbortSignal): Promise<JournalWorkerVerification> {
    throwIfAborted(signal);
    await this.assertNotCancelled();
    const jar = new CookieJar();
    const { userId, sessionId, generation } =
      await this.createAuthenticatedOwner(jar, signal);
    this.userId = userId;
    this.sessionId = sessionId;
    await this.assertNotCancelled();

    const created = await requestJson<{
      entry?: { id?: unknown };
    }>(
      jar,
      "/api/garden/entries",
      {
        method: "POST",
        generation,
        body: {
          target: "first_plant_entry",
          spaceName: TASK_SPACE_NAME,
          plantName: TASK_PLANT_NAME,
          objectKind: "plant",
          catalogItemId: null,
          userAddedCatalogName: TASK_PLANT_NAME,
          varietyText: null,
          title: TASK_TITLE,
          body: TASK_BODY,
          entryDate: "2026-08-13",
          locationVisibility: "hidden",
          coarseRegionCode: null,
          clientMutationId: randomUUID(),
          syncStatus: "online",
          activationSource: "direct_garden",
          mediaAssetId: null,
        },
      },
      signal,
    );
    const entryId = created.entry?.id;
    if (typeof entryId !== "string" || !isUuid(entryId)) {
      throw new Error("Journal canary did not settle.");
    }
    this.entryIds.add(entryId);
    await this.writeRecoveryState();
    await this.assertPrivateHiddenEntry(userId, entryId);
    await this.assertNotCancelled();

    this.serverDbLoaded = true;
    const [{ db }, journal, queue, projection] = await Promise.all([
      import("../src/db"),
      import("../src/server/journal-repository"),
      import("../src/server/queue"),
      import("../src/server/search/public-projection-outbox"),
    ]);
    const published = await journal.publishJournalEntry(
      { userId, sessionId },
      { entryId, disclosureAccepted: true },
    );
    this.publicPaths.add(published.publicUrl);
    await this.writeRecoveryState();
    await queue.enqueueJob(
      "matching",
      {
        kind: "journal_entry_index",
        journalEntryId: entryId,
        userId,
      },
      { idempotencyKey: `journal_entry_index:${entryId}` },
    );
    await this.waitForDoneJournalJob(
      `journal_entry_index:${entryId}`,
      "journal_entry_index",
      entryId,
      userId,
      signal,
    );
    const exactProjection = await waitFor(
      async () => {
        const state = await projection.verifyPublicProjection(db, entryId);
        return state.observedState === "present" && state.matchesCurrentDatabase
          ? state
          : null;
      },
      OVE306_ASYNC_WAIT_TIMEOUT_MS,
      200,
      signal,
    );
    if (!exactProjection) {
      throw new Error("Public journal search projection did not converge.");
    }
    await this.waitForProjectionIntent(entryId, "present", signal);

    const expected = await projection.loadExpectedPublicJournalDocument(
      db,
      entryId,
    );
    if (
      !expected ||
      expected.ownerUserId !== userId ||
      expected.document.noindex !== true ||
      expected.document.locationVisibility !== "hidden" ||
      "coarseRegionCode" in expected.document ||
      containsPreciseLocationText(expected.document)
    ) {
      throw new Error("Canonical public-only eligibility drifted.");
    }

    const publishedResponse = await fetchApprovedPublicJournalResponse(
      published.publicUrl,
      signal,
    );
    if (
      publishedResponse.status !== 200 ||
      new URL(publishedResponse.url).origin !== APPROVED_APP_ORIGIN
    ) {
      throw new Error("Canonical public journal did not exist before archive.");
    }
    await this.assertNotCancelled();

    const archived = await journal.archiveJournalEntry(
      { userId, sessionId },
      { entryId },
    );
    if (
      archived.publicGone !== true ||
      archived.publicUrl !== published.publicUrl
    ) {
      throw new Error("Public journal archive did not preserve a gone URL.");
    }
    await this.assertArchivedGoneEntry(userId, entryId);
    await queue.enqueueJob(
      "matching",
      {
        kind: "journal_entry_unindex",
        journalEntryId: entryId,
        userId,
      },
      { idempotencyKey: `journal_entry_unindex:${entryId}` },
    );
    await this.waitForDoneJournalJob(
      `journal_entry_unindex:${entryId}`,
      "journal_entry_unindex",
      entryId,
      userId,
      signal,
    );
    const exactAbsence = await waitFor(
      async () => {
        const state = await projection.verifyPublicProjection(db, entryId);
        return state.observedState === "absent" && state.matchesCurrentDatabase
          ? true
          : null;
      },
      OVE306_ASYNC_WAIT_TIMEOUT_MS,
      200,
      signal,
    );
    if (!exactAbsence) {
      throw new Error(
        "Archived public journal search revocation was uncertain.",
      );
    }
    await this.waitForProjectionIntent(entryId, "absent", signal);
    if (await this.anySearchDocumentPresent()) {
      throw new Error(
        "Archived public journal search document remained present.",
      );
    }
    if (
      (await projection.loadExpectedPublicJournalDocument(db, entryId)) !== null
    ) {
      throw new Error("Archived public journal remained publicly eligible.");
    }

    const response = await fetchApprovedPublicJournalResponse(
      published.publicUrl,
      signal,
    );
    if (
      response.status !== 410 ||
      new URL(response.url).origin !== APPROVED_APP_ORIGIN ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      throw new Error("Canonical archived journal did not return 410.");
    }
    const html = await response.text();
    const classified = classifyJournalWorkerHtml(
      html,
      [
        this.email,
        userId,
        entryId,
        TASK_TITLE,
        TASK_BODY,
        TASK_SPACE_NAME,
        TASK_PLANT_NAME,
      ],
      response.headers.get("x-robots-tag"),
    );

    return {
      applyCount: 1,
      indexJobClass: "done_identifiers_only",
      publicDocumentClass: "public_safe_exact_shape",
      unindexJobClass: "done_identifiers_only",
      staleDocumentClass: "authoritative_absent",
      parityClass: "converged",
      responseClass: "http_410",
      ...classified,
      publicEligibilityClass: "revoked",
      searchProjectionClass: "authoritative_absent",
      anotherOwnerEffects: 0,
    };
  }

  async cleanupCanary(
    signal?: AbortSignal,
  ): Promise<JournalWorkerCleanupReadback> {
    throwIfAborted(signal);
    await this.hydrateRecoveryState();
    const owner = await this.resolveTaskOwner();
    if (owner) this.userId = owner;
    const userId = this.userId;
    const rows = userId ? await this.readTaskJournalRows(userId) : [];
    if (rows.length > 1) {
      throw new Error("Task journal count exceeded the approved bound.");
    }
    for (const row of rows) {
      this.entryIds.add(row.id);
      if (row.publicSlug) this.publicPaths.add(`/journal/${row.publicSlug}`);
    }

    if (userId && rows.length > 0) {
      this.serverDbLoaded = true;
      const [{ db }, journal, projection] = await Promise.all([
        import("../src/db"),
        import("../src/server/journal-repository"),
        import("../src/server/search/public-projection-outbox"),
      ]);
      for (const row of rows) {
        throwIfAborted(signal);
        if (row.lifecycleState === "active") {
          const archived = await journal.archiveJournalEntry(
            { userId, sessionId: this.sessionId ?? undefined },
            { entryId: row.id },
          );
          if (!archived.publicGone && row.visibility === "public") {
            throw new Error("Public journal archive did not become gone.");
          }
        }
        await projection.convergePublicProjectionsNow([row.id], db);
        const absent = await waitFor(
          async () => {
            const state = await projection.verifyPublicProjection(db, row.id);
            return state.observedState === "absent" &&
              state.matchesCurrentDatabase
              ? true
              : null;
          },
          OVE306_ASYNC_WAIT_TIMEOUT_MS,
          200,
          signal,
        );
        if (!absent) {
          throw new Error("Public journal projection cleanup was uncertain.");
        }
        await this.waitForProjectionIntent(row.id, "absent", signal);
      }
    }

    await this.deleteTaskJobsAfterProcessing(signal);

    for (const publicPath of this.publicPaths) {
      const status = await readPublicStatus(publicPath, signal);
      if (!isAuthoritativePublicAbsence(status)) {
        throw new Error("Public journal route cleanup was not authoritative.");
      }
    }

    if (userId) await this.deleteExactTaskRows(userId);
    await this.deleteExactTaskSearchDocuments();
    const inventory = await this.readInventory(signal);
    const publicRoutePresent = await this.anyPublicRoutePresent(signal);
    const searchDocumentPresent = await this.anySearchDocumentPresent();
    const databaseResidue = userId
      ? await this.hasTaskDatabaseResidue(userId)
      : false;
    const taskJobResidue = await this.hasTaskJobResidue();
    const readback = {
      taskCanaryCount:
        inventory.canaryCount > 0 || databaseResidue || taskJobResidue ? 1 : 0,
      publicRoutePresent,
      searchDocumentPresent,
      anotherOwnerEffects: 0,
    };
    if (isClean(readback)) {
      this.cleanRecoveryReadbacks += 1;
      if (this.cleanRecoveryReadbacks >= 2) {
        await rm(this.recoveryFile, { force: true });
      }
    } else {
      this.cleanRecoveryReadbacks = 0;
    }
    return readback;
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

  async writeReplayReceipt(receipt: JournalWorkerReceiptV1) {
    validateStoredReceipt(receipt, this.implementationSha);
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(STATE_DIRECTORY, 0o700);
    const temporary = `${this.stateFile}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
    await rename(temporary, this.stateFile);
    await chmod(this.stateFile, 0o600);
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

  private async waitForDoneJournalJob(
    idempotencyKey: string,
    kind: JournalWorkerJobKind,
    entryId: string,
    userId: string,
    signal?: AbortSignal,
  ) {
    const done = await waitFor(
      async () => {
        const result = await this.pool.query<{
          status: string;
          attempts: number;
          payload: unknown;
          last_error: string | null;
          terminal_error_code: string | null;
        }>(
          `
            select status, attempts, payload, last_error, terminal_error_code
            from job_queue
            where queue_name = 'matching' and idempotency_key = $1
            limit 2
          `,
          [idempotencyKey],
        );
        if (result.rows.length > 1) {
          throw new Error("Task job identity was ambiguous.");
        }
        const row = result.rows[0];
        if (!row) return null;
        if (row.status === "dead") {
          throw new Error("Task job reached a terminal failure class.");
        }
        if (row.status !== "done") return null;
        if (
          !Number.isSafeInteger(row.attempts) ||
          row.attempts < 1 ||
          row.attempts > 5 ||
          row.last_error !== null ||
          row.terminal_error_code !== null ||
          !isExactIdentifiersOnlyJournalJobPayload(
            row.payload,
            kind,
            entryId,
            userId,
          )
        ) {
          throw new Error("Task job completion contract drifted.");
        }
        return true;
      },
      OVE306_ASYNC_WAIT_TIMEOUT_MS,
      150,
      signal,
    );
    if (!done) throw new Error("Task job delivery exceeded its bounded wait.");
  }

  private async waitForProjectionIntent(
    entryId: string,
    desiredState: "present" | "absent",
    signal?: AbortSignal,
  ) {
    const converged = await waitFor(
      async () => {
        const result = await this.pool.query<{
          desired_state: string;
          applied_state: string;
          desired_generation: string;
          applied_generation: string;
          status: string;
        }>(
          `
            select desired_state, applied_state,
                   desired_generation::text, applied_generation::text, status
            from public_projection_intents
            where entity_kind = 'journal_entry' and entity_id = $1::uuid
            limit 2
          `,
          [entryId],
        );
        if (result.rows.length !== 1) return null;
        const row = result.rows[0]!;
        if (row.status === "dead") {
          throw new Error("Task projection reached a terminal failure class.");
        }
        return row.status === "applied" &&
          row.desired_state === desiredState &&
          row.applied_state === desiredState &&
          row.desired_generation === row.applied_generation
          ? true
          : null;
      },
      OVE306_ASYNC_WAIT_TIMEOUT_MS,
      150,
      signal,
    );
    if (!converged) {
      throw new Error("Task projection parity exceeded its bounded wait.");
    }
  }

  private async deleteTaskJobsAfterProcessing(signal?: AbortSignal) {
    if (this.entryIds.size === 0) return;
    const entryIds = [...this.entryIds];
    const removed = await waitFor(
      async () => {
        const client = await this.pool.connect();
        try {
          await client.query("begin");
          await client.query("set local statement_timeout = '3000ms'");
          const locked = await client.query<{ status: string }>(
            `
              select status
              from job_queue
              where queue_name = 'matching'
                and payload->>'journalEntryId' = any($1::text[])
                and payload->>'kind' in (
                  'journal_entry_index',
                  'journal_entry_unindex'
                )
              for update
            `,
            [entryIds],
          );
          if (locked.rows.some((row) => row.status === "processing")) {
            await client.query("rollback");
            return null;
          }
          await client.query(
            `
              delete from job_queue
              where queue_name = 'matching'
                and payload->>'journalEntryId' = any($1::text[])
                and payload->>'kind' in (
                  'journal_entry_index',
                  'journal_entry_unindex'
                )
            `,
            [entryIds],
          );
          await client.query("commit");
          return true;
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      },
      OVE306_ASYNC_WAIT_TIMEOUT_MS,
      150,
      signal,
    );
    if (!removed) {
      throw new Error("Task job cleanup exceeded its bounded wait.");
    }
  }

  private async hasTaskJobResidue() {
    if (this.entryIds.size === 0) return false;
    const result = await this.pool.query<{ residue: boolean }>(
      `
        select exists(
          select 1 from job_queue
          where queue_name = 'matching'
            and payload->>'journalEntryId' = any($1::text[])
            and payload->>'kind' in (
              'journal_entry_index',
              'journal_entry_unindex'
            )
        ) as residue
      `,
      [[...this.entryIds]],
    );
    return result.rows[0]?.residue === true;
  }

  private async readInventory(signal?: AbortSignal): Promise<TaskInventory> {
    throwIfAborted(signal);
    const result = await this.pool.query<{
      users: string;
      profiles: string;
      handles: string;
      spaces: string;
      objects: string;
      journals: string;
    }>(
      `
        select
          (select count(*)::text from "user" where email = $1) as users,
          (
            select count(*)::text from user_public_profiles profile
            join "user" task_owner on task_owner.id = profile.user_id
            where task_owner.email = $1
          ) as profiles,
          (
            select count(*)::text from user_handle_registry registry
            join "user" task_owner on task_owner.id = registry.user_id
            where task_owner.email = $1
          ) as handles,
          (
            select count(*)::text from spaces space
            join "user" task_owner on task_owner.id = space.owner_user_id
            where task_owner.email = $1
          ) as spaces,
          (
            select count(*)::text from plant_objects object
            join "user" task_owner on task_owner.id = object.owner_user_id
            where task_owner.email = $1
          ) as objects,
          (
            select count(*)::text from journal_entries entry
            join "user" task_owner on task_owner.id = entry.owner_user_id
            where task_owner.email = $1
          ) as journals
      `,
      [this.email],
    );
    throwIfAborted(signal);
    const row = result.rows[0];
    const counts = [
      row?.users,
      row?.profiles,
      row?.handles,
      row?.spaces,
      row?.objects,
      row?.journals,
    ].map(Number);
    const evidenceSafe =
      counts.length === 6 &&
      counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
      counts.every((count) => count <= 1) &&
      (counts[0] === 1 || counts.slice(1).every((count) => count === 0));
    return {
      canaryCount: counts.some((count) => count > 0) ? 1 : 0,
      evidenceSafe,
    };
  }

  private async createAuthenticatedOwner(jar: CookieJar, signal?: AbortSignal) {
    assertServerRuntimeCondition();
    throwIfAborted(signal);
    process.env.OVE230_RECOVERY_DRILL = "true";
    this.serverDbLoaded = true;
    const [{ auth }, generationContract] = await Promise.all([
      import("../src/lib/auth"),
      import("../src/lib/auth/document-mutation-generation-contract"),
    ]);
    const password = `Ove304!${randomUUID()}${randomUUID()}`;
    const signup = await auth.handler(
      new Request(`${APPROVED_APP_ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: APPROVED_APP_ORIGIN,
        },
        body: JSON.stringify({
          email: this.email,
          password,
          name: PRIVATE_AUTH_COMPATIBILITY_NAME,
          callbackURL: "/garden",
          rememberMe: false,
        }),
        signal: boundedRequestSignal(signal),
      }),
    );
    jar.addFromResponse(signup);
    if (!signup.ok) throw new Error("Synthetic Better Auth signup failed.");
    const signupBody = (await signup.json()) as { user?: { id?: unknown } };
    const userId = signupBody.user?.id;
    if (typeof userId !== "string" || !isUuid(userId)) {
      throw new Error("Synthetic Better Auth owner was invalid.");
    }

    const [sessionResult, profileResult] = await Promise.all([
      this.pool.query<{ id: string }>(
        'select id from "session" where "userId" = $1 order by "createdAt" desc limit 1',
        [userId],
      ),
      this.pool.query<{ safe: boolean }>(
        `
          select exists(
            select 1
            from user_public_profiles profile
            join user_handle_registry registry
              on registry.user_id = profile.user_id
             and registry.normalized_handle = profile.normalized_handle
             and registry.lifecycle_state = 'current'
            where profile.user_id = $1::uuid
              and profile.profile_visibility = 'public'
              and profile.profile_lifecycle_state = 'active'
              and profile.removed_at is null
              and profile.location_visibility = 'hidden'
              and profile.coarse_region_code is null
          ) as safe
        `,
        [userId],
      ),
    ]);
    const sessionId = sessionResult.rows[0]?.id;
    if (!sessionId || profileResult.rows[0]?.safe !== true) {
      throw new Error(
        "Synthetic owner authority or public-safe profile was absent.",
      );
    }

    const sessionResponse = await fetch(
      `${APPROVED_APP_ORIGIN}/api/auth/get-session?disableCookieCache=true`,
      {
        headers: { Cookie: jar.header(), Accept: "application/json" },
        redirect: "manual",
        signal: boundedRequestSignal(signal),
      },
    );
    jar.addFromResponse(sessionResponse);
    if (!sessionResponse.ok) {
      throw new Error("Canonical session authority was unavailable.");
    }
    const sessionBody = (await sessionResponse.json()) as {
      user?: { id?: unknown };
    };
    if (sessionBody.user?.id !== userId) {
      throw new Error("Canonical session authority did not bind the canary.");
    }

    const issuedAtSeconds = Math.floor(Date.now() / 1_000);
    const generation = generationContract.issueDocumentMutationGeneration({
      ownerUserId: userId,
      sessionId,
      issuedAtSeconds,
      expiresAtSeconds: issuedAtSeconds + 900,
    }).transport;
    return { userId, sessionId, generation };
  }

  private async assertPrivateHiddenEntry(userId: string, entryId: string) {
    const result = await this.pool.query<{
      visibility: string;
      lifecycle_state: string;
      title: string;
      body: string;
      space_location_visibility: string;
      space_coarse_region_code: string | null;
      object_location_visibility: string;
      object_coarse_region_code: string | null;
    }>(
      `
        select entry.visibility, entry.lifecycle_state, entry.title, entry.body,
               space.location_visibility as space_location_visibility,
               space.coarse_region_code as space_coarse_region_code,
               object.location_visibility as object_location_visibility,
               object.coarse_region_code as object_coarse_region_code
        from journal_entries entry
        join spaces space
          on space.id = entry.space_id and space.owner_user_id = entry.owner_user_id
        join plant_objects object
          on object.id = entry.plant_object_id and object.owner_user_id = entry.owner_user_id
        where entry.id = $1::uuid and entry.owner_user_id = $2::uuid
      `,
      [entryId, userId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.visibility !== "private" ||
      row.lifecycle_state !== "active" ||
      row.space_location_visibility !== "hidden" ||
      row.object_location_visibility !== "hidden" ||
      row.space_coarse_region_code !== null ||
      row.object_coarse_region_code !== null ||
      containsPreciseLocationText({ title: row.title, body: row.body })
    ) {
      throw new Error("Task journal private hidden boundary drifted.");
    }
  }

  private async assertArchivedGoneEntry(userId: string, entryId: string) {
    const result = await this.pool.query<{
      visibility: string;
      lifecycle_state: string;
      public_slug: string | null;
      public_gone_at: Date | string | null;
      public_noindex: boolean;
    }>(
      `
        select visibility, lifecycle_state, public_slug, public_gone_at,
               public_noindex
        from journal_entries
        where id = $1::uuid and owner_user_id = $2::uuid
      `,
      [entryId, userId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.visibility !== "private" ||
      row.lifecycle_state !== "archived" ||
      row.public_slug === null ||
      row.public_gone_at === null ||
      row.public_noindex !== true
    ) {
      throw new Error("Task journal archive boundary drifted.");
    }
  }

  private async resolveTaskOwner() {
    const result = await this.pool.query<{ id: string }>(
      'select id from "user" where email = $1 limit 2',
      [this.email],
    );
    if (result.rows.length > 1) {
      throw new Error("Task owner namespace was ambiguous.");
    }
    return result.rows[0]?.id ?? null;
  }

  private async readTaskJournalRows(userId: string): Promise<TaskJournalRow[]> {
    const result = await this.pool.query<{
      id: string;
      visibility: string;
      lifecycle_state: string;
      public_slug: string | null;
    }>(
      `
        select id, visibility, lifecycle_state, public_slug
        from journal_entries
        where owner_user_id = $1::uuid
      `,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      visibility: row.visibility,
      lifecycleState: row.lifecycle_state,
      publicSlug: row.public_slug,
    }));
  }

  private async deleteExactTaskRows(userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '5000ms'");
      for (const entryId of this.entryIds) {
        await client.query(
          `
            delete from job_queue
            where queue_name = 'matching'
              and payload->>'journalEntryId' = $1
              and payload->>'userId' = $2
              and payload->>'kind' in (
                'journal_entry_index',
                'journal_entry_unindex'
              )
          `,
          [entryId, userId],
        );
        await client.query(
          "delete from public_projection_intents where entity_kind = 'journal_entry' and entity_id = $1::uuid and owner_user_id = $2::uuid",
          [entryId, userId],
        );
      }
      await client.query(
        "delete from analytics_events where owner_user_id = $1::uuid",
        [userId],
      );
      await client.query(
        "delete from journal_entries where owner_user_id = $1::uuid",
        [userId],
      );
      await client.query(
        "delete from plant_objects where owner_user_id = $1::uuid",
        [userId],
      );
      await client.query("delete from spaces where owner_user_id = $1::uuid", [
        userId,
      ]);
      await client.query('delete from "session" where "userId" = $1', [userId]);
      await client.query('delete from "account" where "userId" = $1', [userId]);
      await client.query('delete from "verification" where identifier = $1', [
        this.email,
      ]);
      await client.query('delete from "user" where id = $1 and email = $2', [
        userId,
        this.email,
      ]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async hasTaskDatabaseResidue(userId: string) {
    const entryIds = [...this.entryIds];
    const result = await this.pool.query<{ residue: boolean }>(
      `
        select (
          exists(select 1 from "user" where id = $1 and email = $2)
          or exists(select 1 from "session" where "userId" = $1)
          or exists(select 1 from "account" where "userId" = $1)
          or exists(select 1 from user_public_profiles where user_id = $1::uuid)
          or exists(select 1 from user_handle_registry where user_id = $1::uuid)
          or exists(select 1 from spaces where owner_user_id = $1::uuid)
          or exists(select 1 from plant_objects where owner_user_id = $1::uuid)
          or exists(select 1 from journal_entries where owner_user_id = $1::uuid)
          or exists(select 1 from analytics_events where owner_user_id = $1::uuid)
          or (
            cardinality($3::uuid[]) > 0
            and exists(
              select 1 from job_queue
              where queue_name = 'matching'
                and payload->>'journalEntryId' = any($4::text[])
                and payload->>'userId' = $1::text
                and payload->>'kind' in (
                  'journal_entry_index',
                  'journal_entry_unindex'
                )
            )
          )
          or (
            cardinality($3::uuid[]) > 0
            and exists(
              select 1 from public_projection_intents
              where entity_id = any($3::uuid[])
            )
          )
        ) as residue
      `,
      [userId, this.email, entryIds, entryIds],
    );
    return result.rows[0]?.residue === true;
  }

  private async anyPublicRoutePresent(signal?: AbortSignal) {
    for (const publicPath of this.publicPaths) {
      if (
        !isAuthoritativePublicAbsence(
          await readPublicStatus(publicPath, signal),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private async anySearchDocumentPresent() {
    if (this.entryIds.size === 0) return false;
    this.serverDbLoaded = true;
    const { meiliSearchClient } = await import("../src/server/search/client");
    const index = meiliSearchClient().index("journal_entries");
    for (const entryId of this.entryIds) {
      try {
        await index.getDocument(entryId);
        return true;
      } catch (error) {
        if (!isAuthoritativeMeiliDocumentAbsence(error)) {
          throw new Error("Public journal search cleanup read-back failed.");
        }
      }
    }
    return false;
  }

  private async writeRecoveryState() {
    const state = validateJournalWorkerRecoveryState(
      {
        version: 1,
        implementationSha: this.implementationSha,
        entryIds: [...this.entryIds],
        publicPaths: [...this.publicPaths],
      },
      this.implementationSha,
    );
    await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(STATE_DIRECTORY, 0o700);
    const temporary = `${this.recoveryFile}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, this.recoveryFile);
    await chmod(this.recoveryFile, 0o600);
  }

  private async hydrateRecoveryState() {
    try {
      const state = validateJournalWorkerRecoveryState(
        JSON.parse(await readFile(this.recoveryFile, "utf8")) as unknown,
        this.implementationSha,
      );
      for (const entryId of state.entryIds) this.entryIds.add(entryId);
      for (const publicPath of state.publicPaths) {
        this.publicPaths.add(publicPath);
      }
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  private async deleteExactTaskSearchDocuments() {
    if (this.entryIds.size === 0) return;
    this.serverDbLoaded = true;
    const { meiliSearchClient } = await import("../src/server/search/client");
    const client = meiliSearchClient();
    const task = await client
      .index("journal_entries")
      .deleteDocuments([...this.entryIds]);
    const taskUid = Number(
      typeof task === "object" && task && "taskUid" in task
        ? (task as { taskUid?: unknown }).taskUid
        : Number.NaN,
    );
    if (!Number.isFinite(taskUid)) {
      throw new Error("Task-scoped Meilisearch cleanup did not return a task.");
    }
    await client.tasks.waitForTask(taskUid, {
      timeout: OVE306_ASYNC_WAIT_TIMEOUT_MS,
      interval: 50,
    });
  }

  private async assertNotCancelled() {
    if (await this.cancellationRequested()) {
      throw new Error("Journal worker proof was cancelled.");
    }
  }
}

export function isAuthoritativeMeiliDocumentAbsence(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "document_not_found"
  ) {
    return true;
  }
  if (
    isRecord(error) &&
    isRecord(error.cause) &&
    error.cause.code === "document_not_found" &&
    error.cause.type === "invalid_request" &&
    isRecord(error.response) &&
    error.response.status === 404
  ) {
    return true;
  }
  return (
    error instanceof Error && /\bdocument_not_found\b/i.test(error.message)
  );
}

async function createProductionAdapter(implementationSha: string) {
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
  return new ProductionJournalWorkerAdapter(implementationSha, pool);
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

async function readCanonicalDeploymentSha(signal?: AbortSignal) {
  const response = await fetch(
    `${APPROVED_APP_ORIGIN}/api/document-mutation-admission/readback`,
    {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: boundedRequestSignal(signal),
    },
  );
  if (!response.ok) throw new Error("Canonical deployment read-back failed.");
  const body = (await response.json()) as {
    deploymentSha?: unknown;
    enforcement?: unknown;
  };
  if (
    typeof body.deploymentSha !== "string" ||
    !SHA_40.test(body.deploymentSha) ||
    body.enforcement !== "enabled"
  ) {
    throw new Error("Canonical deployment read-back drifted.");
  }
  return body.deploymentSha;
}

async function readWorkerCapabilityClass(
  signal?: AbortSignal,
): Promise<JournalWorkerBoundary["workerCapabilityClass"]> {
  try {
    const [capabilitiesResponse, readinessResponse] = await Promise.all([
      fetch(`${APPROVED_MATCHING_ORIGIN}/capabilities`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: boundedRequestSignal(signal),
      }),
      fetch(`${APPROVED_MATCHING_ORIGIN}/ready`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: boundedRequestSignal(signal),
      }),
    ]);
    if (!capabilitiesResponse.ok || !readinessResponse.ok) return "unexpected";
    const capabilities = (await capabilitiesResponse.json()) as unknown;
    const readiness = (await readinessResponse.json()) as unknown;
    return isExactMatchingRuntimeReadback(capabilities, false) &&
      isExactMatchingRuntimeReadback(readiness, true)
      ? "ready_exact_handlers"
      : "unexpected";
  } catch {
    return "unexpected";
  }
}

export function isExactMatchingRuntimeReadback(value: unknown, ready: boolean) {
  if (!isRecord(value)) return false;
  const release = isRecord(value.release) ? value.release : null;
  const queue = isRecord(value.queue) ? value.queue : null;
  const handlers = queue?.supportedHandlers;
  if (
    value.schemaVersion !== MATCHING_RUNTIME_SCHEMA ||
    value.service !== "overgarden-matching" ||
    value.status !== (ready ? "ready" : "available") ||
    !release ||
    typeof release.commitSha !== "string" ||
    !SHA_40.test(release.commitSha) ||
    typeof release.imageDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(release.imageDigest) ||
    release.schemaCompatibilityClass !== MATCHING_SCHEMA_COMPATIBILITY ||
    !queue ||
    queue.name !== "matching" ||
    !Array.isArray(handlers) ||
    JSON.stringify([...handlers].sort()) !==
      JSON.stringify([...MATCHING_HANDLER_MANIFEST].sort())
  ) {
    return false;
  }
  if (!ready) return true;
  const dependencies = isRecord(value.dependencies) ? value.dependencies : null;
  const recovery =
    dependencies && isRecord(dependencies.queueRecovery)
      ? dependencies.queueRecovery
      : null;
  return (
    dependencies !== null &&
    ["api", "postgres", "jobQueue", "meilisearch", "worker"].every(
      (key) =>
        isRecord(dependencies[key]) && dependencies[key].status === "available",
    ) &&
    recovery !== null &&
    recovery.claimCompatible === "available" &&
    recovery.handlerCompatible === "available" &&
    recovery.unsupportedRetryingClass === "none"
  );
}

async function requestJson<T>(
  jar: CookieJar,
  requestPath: string,
  input: { method: "POST"; body: unknown; generation: string },
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${APPROVED_APP_ORIGIN}${requestPath}`, {
    method: input.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: APPROVED_APP_ORIGIN,
      Cookie: jar.header(),
      "x-overgarden-document-generation": input.generation,
    },
    body: JSON.stringify(input.body),
    redirect: "manual",
    signal: boundedRequestSignal(signal),
  });
  jar.addFromResponse(response);
  if (!response.ok) {
    throw new Error(
      `Canonical mutation returned status class ${Math.floor(response.status / 100)}xx.`,
    );
  }
  return (await response.json()) as T;
}

async function readPublicStatus(publicPath: string, signal?: AbortSignal) {
  try {
    const response = await fetchApprovedPublicJournalResponse(
      publicPath,
      signal,
    );
    return response.status;
  } catch {
    return 0;
  }
}

async function fetchApprovedPublicJournalResponse(
  publicPath: string,
  signal?: AbortSignal,
) {
  const initialUrl = new URL(publicPath, APPROVED_APP_ORIGIN);
  if (
    initialUrl.origin !== APPROVED_APP_ORIGIN ||
    initialUrl.pathname !== publicPath ||
    initialUrl.search ||
    initialUrl.hash ||
    !/^\/journal\/[^/]+$/.test(publicPath)
  ) {
    throw new Error("Public journal path was outside the approved boundary.");
  }
  const request = (url: string) =>
    fetch(url, {
      headers: { Accept: "text/html" },
      redirect: "manual",
      signal: boundedRequestSignal(signal),
    });
  const initial = await request(initialUrl.href);
  if (initial.status < 300 || initial.status >= 400) return initial;

  const redirectUrl = resolveApprovedArchiveRedirect(
    publicPath,
    initial.status,
    initial.headers.get("location"),
  );
  if (!redirectUrl) {
    throw new Error(
      "Public journal redirect was outside the approved boundary.",
    );
  }
  const terminal = await request(redirectUrl);
  if (terminal.status >= 300 && terminal.status < 400) {
    throw new Error("Public journal redirect chain exceeded one hop.");
  }
  if (new URL(terminal.url).origin !== APPROVED_APP_ORIGIN) {
    throw new Error("Public journal terminal origin drifted.");
  }
  return terminal;
}

function isAuthoritativePublicAbsence(status: number) {
  return status === 404 || status === 410;
}

async function waitFor<T>(
  read: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs: number,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const value = await read();
    if (value !== null) return value;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Journal worker proof was cancelled."));
        },
        { once: true },
      );
    });
  }
  return null;
}

function isApprovedReceiptSuccess(receipt: JournalWorkerReceiptV1) {
  return (
    receipt.state === "cleaned" ||
    receipt.state === "already_cleaned" ||
    (receipt.state === "code_deployed" &&
      receipt.resultClass === "zero_effect_plan")
  );
}

function validateStoredReceipt(
  value: unknown,
  implementationSha: string,
): JournalWorkerReceiptV1 {
  if (!isRecord(value)) throw new Error("Stored receipt was not an object.");
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
    value.planDigest !== OVE306_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE306_APPROVAL_DIGEST ||
    typeof value.canaryCountBefore !== "number" ||
    typeof value.applyCount !== "number" ||
    typeof value.durationMs !== "number" ||
    typeof value.resultClass !== "string" ||
    !RESULT_CLASSES.has(value.resultClass) ||
    typeof value.cleanupClass !== "string" ||
    !CLEANUP_CLASSES.has(value.cleanupClass) ||
    typeof value.state !== "string" ||
    !STATES.has(value.state) ||
    typeof value.evidenceDigest !== "string"
  ) {
    throw new Error("Stored receipt shape drifted.");
  }
  const rebuilt = buildReceipt({
    environment: "production",
    implementationSha,
    canaryCountBefore: value.canaryCountBefore,
    applyCount: value.applyCount,
    resultClass: value.resultClass as JournalWorkerResultClass,
    cleanupClass: value.cleanupClass as JournalWorkerCleanupClass,
    durationMs: value.durationMs,
    state: value.state as JournalWorkerState,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error("Stored receipt digest drifted.");
  }
  return value as unknown as JournalWorkerReceiptV1;
}

const RESULT_CLASSES = new Set<string>([
  "zero_effect_plan",
  "verified_journal_worker",
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

function isApprovedProductionRuntimeCondition() {
  return (
    process.env.NODE_OPTIONS?.includes("--conditions=react-server") === true
  );
}

function assertServerRuntimeCondition() {
  if (!isApprovedProductionRuntimeCondition()) {
    throw new Error("Production apply requires the react-server condition.");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Journal worker proof was cancelled.");
}

function assertRunOptions(options: JournalWorkerRunOptions) {
  if (options.environment !== "production") {
    throw new Error("journal worker proof is production-only");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE306_JOURNAL_WORKER_TIMEOUT_MS
  ) {
    throw new Error("journal worker timeout is invalid");
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

function getSetCookieHeaders(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.();
  if (values && values.length > 0) return values;
  const single = headers.get("set-cookie");
  return single ? single.split(/,(?=\s*[^;,]+=)/) : [];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

async function runCli() {
  loadEnv({ path: ".env.local", override: false, quiet: true });
  const args = parseJournalWorkerCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionAdapter(args.implementationSha);
  let receipt: JournalWorkerReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildJournalWorkerFailureReceipt({
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
      const first = await adapter.cleanupCanary();
      const second = await adapter.cleanupCanary();
      const clean = isClean(first) && isClean(second);
      if (clean) await adapter.clearCancellation();
      receipt = clean
        ? prior?.state === "cleaned"
          ? prior
          : prior
            ? buildJournalWorkerFailureReceipt({
                environment: "production",
                implementationSha: args.implementationSha,
                canaryCountBefore: prior.canaryCountBefore,
                applyCount: prior.applyCount,
                resultClass: "failed",
                cleanupClass: "authoritative_absent_twice",
                durationMs: prior.durationMs,
                unsafeError: "cleanup recovered a prior failure",
              })
            : buildReceipt({
                environment: "production",
                implementationSha: args.implementationSha,
                canaryCountBefore: 0,
                applyCount: 0,
                resultClass: "already_cleaned",
                cleanupClass: "authoritative_absent_twice",
                durationMs: 0,
                state: "already_cleaned",
              })
        : buildJournalWorkerFailureReceipt({
            environment: "production",
            implementationSha: args.implementationSha,
            canaryCountBefore: prior?.canaryCountBefore ?? 1,
            applyCount: prior?.applyCount ?? 0,
            resultClass: "failed",
            cleanupClass: "uncertain",
            durationMs: 0,
            unsafeError: "cleanup drift",
          });
    } else if (args.mode === "status") {
      const stored = await adapter.readReplayReceipt();
      receipt =
        stored ??
        (await settleJournalWorkerWithinDeadline(
          (signal) =>
            runApprovedJournalWorkerProof(
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
        () => controller.abort(new Error("Journal worker deadline exceeded.")),
        args.timeoutMs,
      );
      try {
        receipt = await runApprovedJournalWorkerProof(
          args as JournalWorkerRunOptions,
          adapter,
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
      const actualDurationMs = Math.ceil(performance.now() - startedAt);
      if (
        actualDurationMs > args.timeoutMs ||
        (args.mode === "apply" &&
          receipt.state === "failed" &&
          receipt.cleanupClass === "uncertain")
      ) {
        const cleaned =
          args.mode === "apply"
            ? await proveCleanupTwice(adapter).catch(() => false)
            : false;
        receipt = buildJournalWorkerFailureReceipt({
          environment: "production",
          implementationSha: args.implementationSha,
          canaryCountBefore: receipt.canaryCountBefore,
          applyCount: receipt.applyCount,
          resultClass: "failed",
          cleanupClass: cleaned ? "authoritative_absent_twice" : "uncertain",
          durationMs: Math.min(args.timeoutMs, actualDurationMs),
          unsafeError: "deadline or cleanup recovery",
        });
      }
    }
    if (args.mode === "apply" || args.mode === "cleanup") {
      await adapter.writeReplayReceipt(receipt);
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
        buildJournalWorkerFailureReceipt({
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
