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

export const OVE303_APPROVAL_DIGEST =
  "01ac266c46154a8dac4b56acd7b9855374e2aff1efd59aa18ad38c4cf81e3a1b" as const;
export const OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const APPROVED_APP_ORIGIN = "https://over.garden";
const TASK_EMAIL_PREFIX = "ove303-public-journal-ssr-";
const TASK_EMAIL_SUFFIX = "@over.garden";
const TASK_TITLE = "OVE-303 disposable public journal proof";
const TASK_BODY = "Synthetic non-personal server-rendered journal proof.";
const APPLY_LOCK_KEY = 3_030_303;
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));

export type PublicJournalSsrState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type PublicJournalSsrResultClass =
  | "zero_effect_plan"
  | "verified_public_journal_ssr"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type PublicJournalSsrCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface PublicJournalSsrReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE303_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE303_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: PublicJournalSsrResultClass;
  cleanupClass: PublicJournalSsrCleanupClass;
  durationMs: number;
  state: PublicJournalSsrState;
  evidenceDigest: string;
}

export interface PublicJournalSsrBoundary {
  deploymentSha: string;
  canaryCount: number;
  ownerAccessClass: "task_owned_or_absent" | "another_owner";
  evidenceClass: "closed_counts_and_booleans_only" | "unsafe";
}

export interface PublicJournalSsrVerification {
  applyCount: number;
  responseClass: "http_200" | "unexpected";
  renderClass: "server_rendered" | "not_server_rendered";
  robotsClass: "noindex_nofollow" | "unexpected";
  locationClass: "hidden" | "unexpected";
  publicEligibilityClass: "canonical_public_only" | "unexpected";
  searchProjectionClass: "exact_safe_present" | "unexpected";
  preciseLocationPresent: boolean;
  privateContentPresent: boolean;
  anotherOwnerEffects: number;
}

export interface PublicJournalSsrCleanupReadback {
  taskCanaryCount: number;
  publicRoutePresent: boolean;
  searchDocumentPresent: boolean;
  anotherOwnerEffects: number;
}

export interface PublicJournalSsrAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<PublicJournalSsrBoundary>;
  applyCanary(signal?: AbortSignal): Promise<PublicJournalSsrVerification>;
  cleanupCanary(signal?: AbortSignal): Promise<PublicJournalSsrCleanupReadback>;
  readReplayReceipt(): Promise<PublicJournalSsrReceiptV1 | null>;
  writeReplayReceipt(receipt: PublicJournalSsrReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface PublicJournalSsrRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type PublicJournalSsrCliArgs =
  | PublicJournalSsrRunOptions
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
  resultClass: PublicJournalSsrResultClass;
  cleanupClass: PublicJournalSsrCleanupClass;
  durationMs: number;
  state: PublicJournalSsrState;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPublicJournalSsrReplayNamespace(
  implementationSha: string,
) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-303\0${implementationSha}\0${OVE303_APPROVAL_DIGEST}`);
}

function buildReceipt(input: BuildReceiptInput): PublicJournalSsrReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS
  ) {
    throw new Error(
      "public journal SSR duration must be between 0 and 30000ms",
    );
  }
  const payload: Omit<PublicJournalSsrReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE303_APPROVAL_DIGEST,
    authorizationDigest: OVE303_APPROVAL_DIGEST,
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
      `overgarden.ove303.public-journal-ssr.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildPublicJournalSsrFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: PublicJournalSsrBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.ownerAccessClass === "task_owned_or_absent" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only"
  );
}

function isExactVerification(verification: PublicJournalSsrVerification) {
  return (
    verification.applyCount === 1 &&
    verification.responseClass === "http_200" &&
    verification.renderClass === "server_rendered" &&
    verification.robotsClass === "noindex_nofollow" &&
    verification.locationClass === "hidden" &&
    verification.publicEligibilityClass === "canonical_public_only" &&
    verification.searchProjectionClass === "exact_safe_present" &&
    verification.preciseLocationPresent === false &&
    verification.privateContentPresent === false &&
    verification.anotherOwnerEffects === 0
  );
}

function isClean(readback: PublicJournalSsrCleanupReadback) {
  return (
    readback.taskCanaryCount === 0 &&
    readback.publicRoutePresent === false &&
    readback.searchDocumentPresent === false &&
    readback.anotherOwnerEffects === 0
  );
}

async function proveCleanupTwice(
  adapter: PublicJournalSsrAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  const second = await adapter.cleanupCanary(signal);
  return isClean(second);
}

export async function runApprovedPublicJournalSsrProof(
  options: PublicJournalSsrRunOptions,
  adapter: PublicJournalSsrAdapter,
  signal?: AbortSignal,
): Promise<PublicJournalSsrReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      const boundary = await adapter.readBoundary(signal);
      if (!isExactBoundary(boundary, options.implementationSha)) {
        return buildPublicJournalSsrFailureReceipt({
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
      return buildPublicJournalSsrFailureReceipt({
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

  if (options.approvalDigest !== OVE303_APPROVAL_DIGEST) {
    return buildPublicJournalSsrFailureReceipt({
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
      return buildPublicJournalSsrFailureReceipt({
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
      return buildPublicJournalSsrFailureReceipt({
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
    if (
      replay?.implementationSha === options.implementationSha &&
      replay.planDigest === OVE303_APPROVAL_DIGEST &&
      replay.state === "cleaned"
    ) {
      const boundary = await adapter.readBoundary(signal);
      const clean =
        isExactBoundary(boundary, options.implementationSha) &&
        (await proveCleanupTwice(adapter, signal));
      if (!clean) {
        return buildPublicJournalSsrFailureReceipt({
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

    const boundary = await adapter.readBoundary(signal);
    canaryCountBefore = safeCount(boundary.canaryCount);
    if (!isExactBoundary(boundary, options.implementationSha)) {
      return buildPublicJournalSsrFailureReceipt({
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
      return buildPublicJournalSsrFailureReceipt({
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

    let verification: PublicJournalSsrVerification;
    try {
      applyCount = 1;
      verification = await adapter.applyCanary(signal);
      applyCount = safeCount(verification.applyCount);
    } catch (error) {
      const cleaned = await proveCleanupTwice(adapter, signal).catch(
        () => false,
      );
      return buildPublicJournalSsrFailureReceipt({
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
      return buildPublicJournalSsrFailureReceipt({
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
      resultClass: "verified_public_journal_ssr",
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
    return buildPublicJournalSsrFailureReceipt({
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

export function settlePublicJournalSsrWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS
  ) {
    throw new Error(
      "public journal SSR deadline must be between 1 and 30000ms",
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
      controller.abort(new Error("Public journal SSR deadline exceeded."));
      finish(() =>
        reject(new Error(`public journal SSR exceeded ${deadlineMs}ms`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parsePublicJournalSsrCliArgs(
  input: readonly string[],
): PublicJournalSsrCliArgs {
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
    flagValue(argv, "--timeout-ms") ?? OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS
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
  const mode = selected[0]!.slice(2) as PublicJournalSsrCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE303_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-303");
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

export function classifyPublicJournalSsrHtml(
  html: string,
  privateMarker: string,
): Pick<
  PublicJournalSsrVerification,
  | "responseClass"
  | "renderClass"
  | "robotsClass"
  | "preciseLocationPresent"
  | "privateContentPresent"
> {
  const lower = html.toLowerCase();
  const forbiddenMarkers = [
    privateMarker,
    "owner_user_id",
    "quarantine/",
    "coordinates",
    "latitude",
    "longitude",
  ].filter(Boolean);
  return {
    responseClass: "http_200",
    renderClass: html.includes('data-public-journal-entry="true"')
      ? "server_rendered"
      : "not_server_rendered",
    robotsClass: html.includes("noindex, nofollow")
      ? "noindex_nofollow"
      : "unexpected",
    preciseLocationPresent: containsPreciseLocationText(html),
    privateContentPresent: forbiddenMarkers.some((marker) =>
      lower.includes(marker.toLowerCase()),
    ),
  };
}

export function resolveApprovedPublicJournalRedirect(
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

class ProductionPublicJournalSsrAdapter implements PublicJournalSsrAdapter {
  private lockClient: PoolClient | null = null;
  private readonly email: string;
  private readonly stateFile: string;
  private readonly cancelFile: string;
  private userId: string | null = null;
  private sessionId: string | null = null;
  private readonly entryIds = new Set<string>();
  private readonly publicPaths = new Set<string>();
  private serverDbLoaded = false;

  constructor(
    private readonly implementationSha: string,
    private readonly pool: Pool,
  ) {
    const namespace = buildPublicJournalSsrReplayNamespace(
      implementationSha,
    ).slice(0, 24);
    this.email = `${TASK_EMAIL_PREFIX}${namespace}${TASK_EMAIL_SUFFIX}`;
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `ove303-public-journal-ssr-${implementationSha}.json`,
    );
    this.cancelFile = path.join(
      STATE_DIRECTORY,
      `ove303-public-journal-ssr-${implementationSha}.cancel`,
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

  async readBoundary(signal?: AbortSignal): Promise<PublicJournalSsrBoundary> {
    const [deploymentSha, inventory] = await Promise.all([
      readCanonicalDeploymentSha(signal),
      this.readInventory(signal),
    ]);
    return {
      deploymentSha,
      canaryCount: inventory.canaryCount,
      ownerAccessClass: "task_owned_or_absent",
      evidenceClass: inventory.evidenceSafe
        ? "closed_counts_and_booleans_only"
        : "unsafe",
    };
  }

  async applyCanary(
    signal?: AbortSignal,
  ): Promise<PublicJournalSsrVerification> {
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
          spaceName: "OVE-303 disposable proof space",
          plantName: "OVE-303 disposable proof plant",
          objectKind: "plant",
          catalogItemId: null,
          userAddedCatalogName: "OVE-303 disposable proof plant",
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
    await this.assertPrivateHiddenEntry(userId, entryId);
    await this.assertNotCancelled();

    this.serverDbLoaded = true;
    const [{ db }, journal, projection] = await Promise.all([
      import("../src/db"),
      import("../src/server/journal-repository"),
      import("../src/server/search/public-projection-outbox"),
    ]);
    const published = await journal.publishJournalEntry(
      { userId, sessionId },
      { entryId, disclosureAccepted: true },
    );
    this.publicPaths.add(published.publicUrl);
    await projection.convergePublicProjectionsNow([entryId], db);
    const exactProjection = await waitFor(
      async () => {
        const state = await projection.verifyPublicProjection(db, entryId);
        return state.observedState === "present" && state.matchesCurrentDatabase
          ? state
          : null;
      },
      7_000,
      200,
      signal,
    );
    if (!exactProjection) {
      throw new Error("Public journal search projection did not converge.");
    }

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

    const response = await fetchApprovedPublicJournalResponse(
      published.publicUrl,
      signal,
    );
    if (
      response.status !== 200 ||
      new URL(response.url).origin !== APPROVED_APP_ORIGIN
    ) {
      throw new Error("Canonical public journal response was unavailable.");
    }
    const html = await response.text();
    const classified = classifyPublicJournalSsrHtml(html, this.email);

    return {
      applyCount: 1,
      ...classified,
      locationClass: "hidden",
      publicEligibilityClass: "canonical_public_only",
      searchProjectionClass: "exact_safe_present",
      anotherOwnerEffects: 0,
    };
  }

  async cleanupCanary(
    signal?: AbortSignal,
  ): Promise<PublicJournalSsrCleanupReadback> {
    throwIfAborted(signal);
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
          7_000,
          200,
          signal,
        );
        if (!absent) {
          throw new Error("Public journal projection cleanup was uncertain.");
        }
      }
    }

    for (const publicPath of this.publicPaths) {
      const status = await readPublicStatus(publicPath, signal);
      if (!isAuthoritativePublicAbsence(status)) {
        throw new Error("Public journal route cleanup was not authoritative.");
      }
    }

    if (userId) await this.deleteExactTaskRows(userId);
    const inventory = await this.readInventory(signal);
    const publicRoutePresent = await this.anyPublicRoutePresent(signal);
    const searchDocumentPresent = await this.anySearchDocumentPresent();
    const databaseResidue = userId
      ? await this.hasTaskDatabaseResidue(userId)
      : false;
    return {
      taskCanaryCount: inventory.canaryCount > 0 || databaseResidue ? 1 : 0,
      publicRoutePresent,
      searchDocumentPresent,
      anotherOwnerEffects: 0,
    };
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

  async writeReplayReceipt(receipt: PublicJournalSsrReceiptV1) {
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
    const password = `Ove303!${randomUUID()}${randomUUID()}`;
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
        signal,
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
        signal,
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
              select 1 from public_projection_intents
              where entity_id = any($3::uuid[])
            )
          )
        ) as residue
      `,
      [userId, this.email, entryIds],
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

  private async assertNotCancelled() {
    if (await this.cancellationRequested()) {
      throw new Error("Public journal SSR proof was cancelled.");
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
  return new ProductionPublicJournalSsrAdapter(implementationSha, pool);
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
      signal,
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
    signal,
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
      signal,
    });
  const initial = await request(initialUrl.href);
  if (initial.status < 300 || initial.status >= 400) return initial;

  const redirectUrl = resolveApprovedPublicJournalRedirect(
    publicPath,
    initial.status,
    initial.headers.get("location"),
  );
  if (!redirectUrl) {
    throw new Error("Public journal redirect was outside the approved boundary.");
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
          reject(new Error("Public journal SSR proof was cancelled."));
        },
        { once: true },
      );
    });
  }
  return null;
}

function isApprovedReceiptSuccess(receipt: PublicJournalSsrReceiptV1) {
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
): PublicJournalSsrReceiptV1 {
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
    value.planDigest !== OVE303_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE303_APPROVAL_DIGEST ||
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
    resultClass: value.resultClass as PublicJournalSsrResultClass,
    cleanupClass: value.cleanupClass as PublicJournalSsrCleanupClass,
    durationMs: value.durationMs,
    state: value.state as PublicJournalSsrState,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error("Stored receipt digest drifted.");
  }
  return value as unknown as PublicJournalSsrReceiptV1;
}

const RESULT_CLASSES = new Set<string>([
  "zero_effect_plan",
  "verified_public_journal_ssr",
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
  if (signal?.aborted)
    throw new Error("Public journal SSR proof was cancelled.");
}

function assertRunOptions(options: PublicJournalSsrRunOptions) {
  if (options.environment !== "production") {
    throw new Error("public journal SSR proof is production-only");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE303_PUBLIC_JOURNAL_SSR_TIMEOUT_MS
  ) {
    throw new Error("public journal SSR timeout is invalid");
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
  const args = parsePublicJournalSsrCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionAdapter(args.implementationSha);
  let receipt: PublicJournalSsrReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildPublicJournalSsrFailureReceipt({
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
        : buildPublicJournalSsrFailureReceipt({
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
        (await runApprovedPublicJournalSsrProof(
          {
            mode: "plan",
            environment: "production",
            implementationSha: args.implementationSha,
            timeoutMs: args.timeoutMs,
          },
          adapter,
        ));
    } else {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(
        () =>
          controller.abort(new Error("Public journal SSR deadline exceeded.")),
        args.timeoutMs,
      );
      try {
        receipt = await runApprovedPublicJournalSsrProof(
          args as PublicJournalSsrRunOptions,
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
        receipt = buildPublicJournalSsrFailureReceipt({
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
        buildPublicJournalSsrFailureReceipt({
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
