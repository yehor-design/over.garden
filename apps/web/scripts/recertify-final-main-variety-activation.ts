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
import {
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import { gardenFirstEntryPreselectionPath } from "../src/lib/garden/public-paths";
import { containsPreciseLocationText } from "../src/lib/privacy/precise-location-text";

export const OVE305_APPROVED_PLAN =
  "OVE-305|production|resolve one globally selectable safe plant-variety slug through the canonical gardenFirstEntryPreselectionPath, open that exact public_variety preselection in the prepared owner garden, save one disposable first-entry canary with only the safe slug and public_variety enum, read it back, then erase the exact canary|baseline:8ce1dec637234af06c8b5ca2c5c4837f0aec3f2c|one-canary|cleanup-required" as const;
export const OVE305_APPROVAL_DIGEST =
  "1faedba60ec4716626ad764a97d11452ea27845ddf5d87fc8cd779587e03bb23" as const;
export const OVE305_VARIETY_ACTIVATION_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const APPROVED_APP_ORIGIN = "https://over.garden";
const TASK_EMAIL_PREFIX = "ove305-variety-activation-";
const TASK_EMAIL_SUFFIX = "@over.garden";
const TASK_TITLE = "OVE-305 disposable variety activation proof";
const TASK_BODY = "Synthetic non-personal public variety activation proof.";
const TASK_SPACE_NAME = "OVE-305 disposable activation space";
const TASK_PLANT_NAME = "OVE-305 disposable activation plant";
const APPLY_LOCK_KEY = 3_050_305;
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));

export type VarietyActivationState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type VarietyActivationResultClass =
  | "zero_effect_plan"
  | "verified_variety_activation"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type VarietyActivationCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface VarietyActivationReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE305_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE305_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: VarietyActivationResultClass;
  cleanupClass: VarietyActivationCleanupClass;
  durationMs: number;
  state: VarietyActivationState;
  evidenceDigest: string;
}

export interface VarietyActivationBoundary {
  deploymentSha: string;
  canaryCount: number;
  catalogClass: "eligible_public_variety" | "unexpected";
  ownerAccessClass: "task_owned_or_absent" | "another_owner";
  evidenceClass: "closed_counts_and_booleans_only" | "unsafe";
}

export interface VarietyActivationVerification {
  applyCount: number;
  ctaClass: "canonical_safe_slug" | "unexpected";
  preselectionClass: "catalog_selected_public_variety" | "unexpected";
  ownerScopeClass: "one_owner_object_entry" | "unexpected";
  attributionClass: "public_variety" | "unexpected";
  preciseLocationPresent: boolean;
  forbiddenEvidencePresent: boolean;
  anotherOwnerEffects: number;
}

export interface VarietyActivationCleanupReadback {
  taskCanaryCount: number;
  attributionPresent: boolean;
  durableIntentPresent: boolean;
  anotherOwnerEffects: number;
}

export interface VarietyActivationAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<VarietyActivationBoundary>;
  applyCanary(signal?: AbortSignal): Promise<VarietyActivationVerification>;
  cleanupCanary(
    signal?: AbortSignal,
  ): Promise<VarietyActivationCleanupReadback>;
  readReplayReceipt(): Promise<VarietyActivationReceiptV1 | null>;
  writeReplayReceipt(receipt: VarietyActivationReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface VarietyActivationRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type VarietyActivationCliArgs =
  | VarietyActivationRunOptions
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
  resultClass: VarietyActivationResultClass;
  cleanupClass: VarietyActivationCleanupClass;
  durationMs: number;
  state: VarietyActivationState;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildVarietyActivationReplayNamespace(
  implementationSha: string,
) {
  assertImplementationSha(implementationSha);
  return sha256(`OVE-305\0${implementationSha}\0${OVE305_APPROVAL_DIGEST}`);
}

function buildReceipt(input: BuildReceiptInput): VarietyActivationReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE305_VARIETY_ACTIVATION_TIMEOUT_MS
  ) {
    throw new Error(
      "variety activation duration must be between 0 and 30000ms",
    );
  }
  const payload: Omit<VarietyActivationReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE305_APPROVAL_DIGEST,
    authorizationDigest: OVE305_APPROVAL_DIGEST,
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
      `overgarden.ove305.variety-activation.v1\0${JSON.stringify(payload)}`,
    ),
  };
}

export function buildVarietyActivationFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE305_VARIETY_ACTIVATION_TIMEOUT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: VarietyActivationBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.catalogClass === "eligible_public_variety" &&
    boundary.ownerAccessClass === "task_owned_or_absent" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only"
  );
}

function isExactVerification(verification: VarietyActivationVerification) {
  return (
    verification.applyCount === 1 &&
    verification.ctaClass === "canonical_safe_slug" &&
    verification.preselectionClass === "catalog_selected_public_variety" &&
    verification.ownerScopeClass === "one_owner_object_entry" &&
    verification.attributionClass === "public_variety" &&
    verification.preciseLocationPresent === false &&
    verification.forbiddenEvidencePresent === false &&
    verification.anotherOwnerEffects === 0
  );
}

function isClean(readback: VarietyActivationCleanupReadback) {
  return (
    readback.taskCanaryCount === 0 &&
    readback.attributionPresent === false &&
    readback.durableIntentPresent === false &&
    readback.anotherOwnerEffects === 0
  );
}

async function proveCleanupTwice(
  adapter: VarietyActivationAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  const second = await adapter.cleanupCanary(signal);
  return isClean(second);
}

export async function runApprovedVarietyActivationProof(
  options: VarietyActivationRunOptions,
  adapter: VarietyActivationAdapter,
  signal?: AbortSignal,
): Promise<VarietyActivationReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      const boundary = await adapter.readBoundary(signal);
      if (!isExactBoundary(boundary, options.implementationSha)) {
        return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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

  if (options.approvalDigest !== OVE305_APPROVAL_DIGEST) {
    return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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
      replay.planDigest === OVE305_APPROVAL_DIGEST &&
      replay.state === "cleaned"
    ) {
      const boundary = await adapter.readBoundary(signal);
      const clean =
        isExactBoundary(boundary, options.implementationSha) &&
        (await proveCleanupTwice(adapter, signal));
      if (!clean) {
        return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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

    let verification: VarietyActivationVerification;
    try {
      applyCount = 1;
      verification = await adapter.applyCanary(signal);
      applyCount = safeCount(verification.applyCount);
    } catch (error) {
      const cleaned = await proveCleanupTwice(adapter, signal).catch(
        () => false,
      );
      return buildVarietyActivationFailureReceipt({
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
      return buildVarietyActivationFailureReceipt({
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
      resultClass: "verified_variety_activation",
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
    return buildVarietyActivationFailureReceipt({
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

export function settleVarietyActivationWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE305_VARIETY_ACTIVATION_TIMEOUT_MS
  ) {
    throw new Error(
      "variety activation deadline must be between 1 and 30000ms",
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
      controller.abort(new Error("Variety activation deadline exceeded."));
      finish(() =>
        reject(new Error(`variety activation exceeded ${deadlineMs}ms`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parseVarietyActivationCliArgs(
  input: readonly string[],
): VarietyActivationCliArgs {
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
    flagValue(argv, "--timeout-ms") ?? OVE305_VARIETY_ACTIVATION_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE305_VARIETY_ACTIVATION_TIMEOUT_MS
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
  const mode = selected[0]!.slice(2) as VarietyActivationCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment: "production", implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE305_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-305");
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

export function classifyPublicVarietyPreselectionPath(
  preselectionPath: string,
  publicSlug: string,
): Pick<
  VarietyActivationVerification,
  "ctaClass" | "preciseLocationPresent" | "forbiddenEvidencePresent"
> {
  const safeSlug = /^[a-z0-9](?:[a-z0-9-]{0,94}[a-z0-9])?$/.test(publicSlug);
  const expectedHref = `/garden?catalog=${publicSlug}&source=public-variety`;
  const exactCta = safeSlug && preselectionPath === expectedHref;
  const preciseLocationPresent = containsPreciseLocationText(preselectionPath);
  const forbiddenEvidencePresent =
    !preselectionPath.startsWith("/garden?") ||
    /[?&](?:referrer|returnTo|url)=/i.test(preselectionPath) ||
    /(?:owner_user_id|quarantine\/|coordinates|latitude|longitude)/i.test(
      preselectionPath,
    );
  return {
    ctaClass: exactCta ? "canonical_safe_slug" : "unexpected",
    preciseLocationPresent,
    forbiddenEvidencePresent,
  };
}

interface TaskInventory {
  canaryCount: number;
  evidenceSafe: boolean;
}

export interface VarietyActivationRecoveryStateV1 {
  version: 1;
  implementationSha: string;
  entryIds: string[];
  plantObjectIds: string[];
}

export function validateVarietyActivationRecoveryState(
  value: unknown,
  implementationSha: string,
): VarietyActivationRecoveryStateV1 {
  const expectedKeys = [
    "version",
    "implementationSha",
    "entryIds",
    "plantObjectIds",
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
    !Array.isArray(value.plantObjectIds) ||
    value.plantObjectIds.length !== 1 ||
    !value.plantObjectIds.every(
      (plantObjectId): plantObjectId is string =>
        typeof plantObjectId === "string" && isUuid(plantObjectId),
    ) ||
    new Set(value.plantObjectIds).size !== value.plantObjectIds.length
  ) {
    throw new Error("Variety activation recovery state drifted.");
  }
  return {
    version: 1,
    implementationSha,
    entryIds: [...value.entryIds],
    plantObjectIds: [...value.plantObjectIds],
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

class ProductionVarietyActivationAdapter implements VarietyActivationAdapter {
  private lockClient: PoolClient | null = null;
  private readonly email: string;
  private readonly stateFile: string;
  private readonly cancelFile: string;
  private readonly recoveryFile: string;
  private userId: string | null = null;
  private readonly entryIds = new Set<string>();
  private readonly plantObjectIds = new Set<string>();
  private serverDbLoaded = false;
  private cleanRecoveryReadbacks = 0;

  constructor(
    private readonly implementationSha: string,
    private readonly pool: Pool,
  ) {
    const namespace = buildVarietyActivationReplayNamespace(
      implementationSha,
    ).slice(0, 24);
    this.email = `${TASK_EMAIL_PREFIX}${namespace}${TASK_EMAIL_SUFFIX}`;
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `ove305-variety-activation-${implementationSha}.json`,
    );
    this.cancelFile = path.join(
      STATE_DIRECTORY,
      `ove305-variety-activation-${implementationSha}.cancel`,
    );
    this.recoveryFile = path.join(
      STATE_DIRECTORY,
      `ove305-variety-activation-${implementationSha}.recovery.json`,
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

  async readBoundary(signal?: AbortSignal): Promise<VarietyActivationBoundary> {
    const recoveryPresent = await this.hydrateRecoveryState();
    const [deploymentSha, inventory, catalog] = await Promise.all([
      readCanonicalDeploymentSha(signal),
      this.readInventory(signal),
      this.readEligiblePublicVariety(signal),
    ]);
    return {
      deploymentSha,
      canaryCount: inventory.canaryCount > 0 || recoveryPresent ? 1 : 0,
      catalogClass: catalog ? "eligible_public_variety" : "unexpected",
      ownerAccessClass: "task_owned_or_absent",
      evidenceClass: inventory.evidenceSafe
        ? "closed_counts_and_booleans_only"
        : "unsafe",
    };
  }

  async applyCanary(
    signal?: AbortSignal,
  ): Promise<VarietyActivationVerification> {
    throwIfAborted(signal);
    await this.assertNotCancelled();
    const catalog = await this.readEligiblePublicVariety(signal);
    if (!catalog) throw new Error("Eligible public variety was unavailable.");
    const cta = catalog.cta;

    const jar = new CookieJar();
    const { userId, generation } = await this.createAuthenticatedOwner(
      jar,
      signal,
    );
    this.userId = userId;
    await this.assertNotCancelled();

    const preselectionPath = gardenFirstEntryPreselectionPath(
      catalog.publicSlug,
    );
    const preselectionResponse = await fetch(
      `${APPROVED_APP_ORIGIN}${preselectionPath}`,
      {
        headers: { Accept: "text/html", Cookie: jar.header() },
        redirect: "error",
        signal,
      },
    );
    if (
      preselectionResponse.status !== 200 ||
      !preselectionResponse.headers.get("content-type")?.includes("text/html")
    ) {
      throw new Error("Canonical garden preselection was unavailable.");
    }
    await preselectionResponse.body?.cancel();
    await this.assertNotCancelled();

    const created = await requestJson<{
      entry?: { id?: unknown };
      plantObject?: { id?: unknown; catalogItemId?: unknown };
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
          catalogItemId: catalog.id,
          userAddedCatalogName: null,
          varietyText: null,
          title: TASK_TITLE,
          body: TASK_BODY,
          entryDate: "2026-08-13",
          locationVisibility: "hidden",
          coarseRegionCode: null,
          clientMutationId: randomUUID(),
          syncStatus: "online",
          activationSource: "public_variety",
          mediaAssetId: null,
        },
      },
      signal,
    );
    const entryId = created.entry?.id;
    const plantObjectId = created.plantObject?.id;
    if (
      typeof entryId !== "string" ||
      !isUuid(entryId) ||
      typeof plantObjectId !== "string" ||
      !isUuid(plantObjectId) ||
      created.plantObject?.catalogItemId !== catalog.id
    ) {
      throw new Error("Variety activation canary did not settle.");
    }
    this.entryIds.add(entryId);
    this.plantObjectIds.add(plantObjectId);
    await this.writeRecoveryState();
    const exactReadback = await this.assertPrivateVarietyActivation(
      userId,
      entryId,
      plantObjectId,
      catalog,
      signal,
    );
    await this.assertNotCancelled();

    return {
      applyCount: 1,
      ...cta,
      preselectionClass: "catalog_selected_public_variety",
      ownerScopeClass: exactReadback.ownerScopeClass,
      attributionClass: exactReadback.attributionClass,
      forbiddenEvidencePresent:
        cta.forbiddenEvidencePresent || exactReadback.forbiddenEvidencePresent,
      preciseLocationPresent:
        cta.preciseLocationPresent || exactReadback.preciseLocationPresent,
      anotherOwnerEffects: exactReadback.anotherOwnerEffects,
    };
  }

  async cleanupCanary(
    signal?: AbortSignal,
  ): Promise<VarietyActivationCleanupReadback> {
    throwIfAborted(signal);
    await this.hydrateRecoveryState();
    const owner = await this.resolveTaskOwner();
    if (owner) this.userId = owner;
    const userId = this.userId;
    const rows = userId ? await this.readTaskActivationRows(userId) : [];
    if (rows.length > 1) {
      throw new Error("Task journal count exceeded the approved bound.");
    }
    for (const row of rows) {
      this.entryIds.add(row.entryId);
      this.plantObjectIds.add(row.plantObjectId);
    }

    if (userId) await this.deleteExactTaskRows(userId);
    const inventory = await this.readInventory(signal);
    const residue = userId
      ? await this.readTaskResidue(userId)
      : { database: false, attribution: false, durableIntent: false };
    const readback = {
      taskCanaryCount: inventory.canaryCount > 0 || residue.database ? 1 : 0,
      attributionPresent: residue.attribution,
      durableIntentPresent: residue.durableIntent,
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

  async writeReplayReceipt(receipt: VarietyActivationReceiptV1) {
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

  private async readEligiblePublicVariety(signal?: AbortSignal) {
    throwIfAborted(signal);
    const result = await this.pool.query<{
      id: string;
      public_slug: string;
    }>(
      `
        select id, public_slug
        from catalog_items
        where catalog_kind = 'plant_variety'
          and status in ('seeded', 'confirmed')
          and created_by_user_id is null
          and public_slug is not null
        order by public_slug asc
        limit 1
      `,
    );
    const row = result.rows[0];
    if (
      !row ||
      !isUuid(row.id) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,94}[a-z0-9])?$/.test(row.public_slug)
    ) {
      return null;
    }
    const preselectionPath = gardenFirstEntryPreselectionPath(row.public_slug);
    const cta = classifyPublicVarietyPreselectionPath(
      preselectionPath,
      row.public_slug,
    );
    if (
      cta.ctaClass !== "canonical_safe_slug" ||
      cta.preciseLocationPresent ||
      cta.forbiddenEvidencePresent
    ) {
      return null;
    }
    return { id: row.id, publicSlug: row.public_slug, cta };
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
    const password = `Ove305!${randomUUID()}${randomUUID()}`;
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

    await this.pool.query(
      `
        insert into learning_actor_attributions (
          user_id, actor_class, source, classified_at, created_at, updated_at
        )
        values ($1::uuid, 'production_smoke', 'operator_plan', now(), now(), now())
        on conflict (user_id) do update set
          actor_class = 'production_smoke',
          source = 'operator_plan',
          classified_at = now(),
          updated_at = now()
      `,
      [userId],
    );

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

  private async assertPrivateVarietyActivation(
    userId: string,
    entryId: string,
    plantObjectId: string,
    catalog: { id: string; publicSlug: string },
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const result = await this.pool.query<{
      visibility: string;
      lifecycle_state: string;
      title: string;
      body: string;
      plant_object_id: string;
      catalog_item_id: string | null;
      catalog_public_slug: string | null;
      catalog_kind: string | null;
      catalog_status: string | null;
      variety_state: string;
      space_location_visibility: string;
      space_coarse_region_code: string | null;
      object_location_visibility: string;
      object_coarse_region_code: string | null;
      spaces: number;
      objects: number;
      journals: number;
    }>(
      `
        select entry.visibility, entry.lifecycle_state, entry.title, entry.body,
               object.id as plant_object_id,
               object.catalog_item_id,
               catalog.public_slug as catalog_public_slug,
               catalog.catalog_kind,
               catalog.status as catalog_status,
               object.variety_state,
               space.location_visibility as space_location_visibility,
               space.coarse_region_code as space_coarse_region_code,
               object.location_visibility as object_location_visibility,
               object.coarse_region_code as object_coarse_region_code,
               (select count(*)::int from spaces where owner_user_id = $2::uuid) as spaces,
               (select count(*)::int from plant_objects where owner_user_id = $2::uuid) as objects,
               (select count(*)::int from journal_entries where owner_user_id = $2::uuid) as journals
        from journal_entries entry
        join spaces space
          on space.id = entry.space_id and space.owner_user_id = entry.owner_user_id
        join plant_objects object
          on object.id = entry.plant_object_id and object.owner_user_id = entry.owner_user_id
        join catalog_items catalog
          on catalog.id = object.catalog_item_id
        where entry.id = $1::uuid
          and entry.owner_user_id = $2::uuid
          and object.id = $3::uuid
      `,
      [entryId, userId, plantObjectId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.visibility !== "private" ||
      row.lifecycle_state !== "active" ||
      row.plant_object_id !== plantObjectId ||
      row.catalog_item_id !== catalog.id ||
      row.catalog_public_slug !== catalog.publicSlug ||
      row.catalog_kind !== "plant_variety" ||
      (row.catalog_status !== "seeded" && row.catalog_status !== "confirmed") ||
      row.variety_state !== "selected" ||
      row.space_location_visibility !== "hidden" ||
      row.object_location_visibility !== "hidden" ||
      row.space_coarse_region_code !== null ||
      row.object_coarse_region_code !== null ||
      row.spaces !== 1 ||
      row.objects !== 1 ||
      row.journals !== 1 ||
      containsPreciseLocationText({ title: row.title, body: row.body })
    ) {
      throw new Error("Task public-variety owner boundary drifted.");
    }

    const attribution = await waitFor(
      async () => {
        throwIfAborted(signal);
        const events = await this.pool.query<{ properties: unknown }>(
          `
            select properties
            from analytics_events
            where owner_user_id = $1::uuid
              and journal_entry_id = $2::uuid
            order by created_at asc
          `,
          [userId, entryId],
        );
        if (events.rows.length === 0) return null;
        const properties = events.rows
          .map((event) => event.properties)
          .filter(isRecord);
        const attributed = properties.filter(
          (value) => value.activation_source !== undefined,
        );
        if (
          attributed.length === 0 ||
          !attributed.every(
            (value) =>
              value.activation_source === "public_variety" &&
              value.actor_class === "production_smoke",
          )
        ) {
          return null;
        }
        const serialized = JSON.stringify(properties);
        const forbiddenEvidencePresent =
          /https?:|\b(?:referrer|url|body|content|email|ip|user_agent|coordinates|latitude|longitude)\b/i.test(
            serialized,
          );
        return {
          forbiddenEvidencePresent,
          preciseLocationPresent: containsPreciseLocationText(properties),
        };
      },
      7_000,
      100,
      signal,
    );
    if (!attribution) {
      throw new Error("Bounded public-variety attribution did not converge.");
    }

    const crossOwner = await this.pool.query<{ effects: number }>(
      `
        select (
          (select count(*) from journal_entries where id = $1::uuid and owner_user_id <> $3::uuid)
          + (select count(*) from plant_objects where id = $2::uuid and owner_user_id <> $3::uuid)
        )::int as effects
      `,
      [entryId, plantObjectId, userId],
    );
    return {
      ownerScopeClass: "one_owner_object_entry" as const,
      attributionClass: "public_variety" as const,
      forbiddenEvidencePresent: attribution.forbiddenEvidencePresent,
      preciseLocationPresent: attribution.preciseLocationPresent,
      anotherOwnerEffects: crossOwner.rows[0]?.effects ?? 1,
    };
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

  private async readTaskActivationRows(userId: string) {
    const result = await this.pool.query<{
      entry_id: string;
      plant_object_id: string;
    }>(
      `
        select id as entry_id, plant_object_id
        from journal_entries
        where owner_user_id = $1::uuid
      `,
      [userId],
    );
    return result.rows.map((row) => ({
      entryId: row.entry_id,
      plantObjectId: row.plant_object_id,
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
        "delete from learning_attribution_outbox where user_id = $1::uuid",
        [userId],
      );
      await client.query(
        "delete from analytics_events where owner_user_id = $1::uuid",
        [userId],
      );
      await client.query(
        "delete from learning_actor_attributions where user_id = $1::uuid",
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

  private async readTaskResidue(userId: string) {
    const entryIds = [...this.entryIds];
    const result = await this.pool.query<{
      database: boolean;
      attribution: boolean;
      durable_intent: boolean;
    }>(
      `
        select
        (
          exists(select 1 from "user" where id = $1 and email = $2)
          or exists(select 1 from "session" where "userId" = $1)
          or exists(select 1 from "account" where "userId" = $1)
          or exists(select 1 from user_public_profiles where user_id = $1::uuid)
          or exists(select 1 from user_handle_registry where user_id = $1::uuid)
          or exists(select 1 from spaces where owner_user_id = $1::uuid)
          or exists(select 1 from plant_objects where owner_user_id = $1::uuid)
          or exists(select 1 from journal_entries where owner_user_id = $1::uuid)
          or (
            cardinality($3::uuid[]) > 0
            and exists(
              select 1 from public_projection_intents
              where entity_id = any($3::uuid[])
            )
          )
        ) as database,
        (
          exists(select 1 from analytics_events where owner_user_id = $1::uuid)
          or exists(select 1 from learning_actor_attributions where user_id = $1::uuid)
        ) as attribution,
        exists(
          select 1 from learning_attribution_outbox where user_id = $1::uuid
        ) as durable_intent
      `,
      [userId, this.email, entryIds],
    );
    const row = result.rows[0];
    return {
      database: row?.database === true,
      attribution: row?.attribution === true,
      durableIntent: row?.durable_intent === true,
    };
  }

  private async writeRecoveryState() {
    const state = validateVarietyActivationRecoveryState(
      {
        version: 1,
        implementationSha: this.implementationSha,
        entryIds: [...this.entryIds],
        plantObjectIds: [...this.plantObjectIds],
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
      const state = validateVarietyActivationRecoveryState(
        JSON.parse(await readFile(this.recoveryFile, "utf8")) as unknown,
        this.implementationSha,
      );
      for (const entryId of state.entryIds) this.entryIds.add(entryId);
      for (const plantObjectId of state.plantObjectIds) {
        this.plantObjectIds.add(plantObjectId);
      }
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

  private async assertNotCancelled() {
    if (await this.cancellationRequested()) {
      throw new Error("Variety activation proof was cancelled.");
    }
  }
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
  return new ProductionVarietyActivationAdapter(implementationSha, pool);
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
      [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
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
          reject(new Error("Variety activation proof was cancelled."));
        },
        { once: true },
      );
    });
  }
  return null;
}

function isApprovedReceiptSuccess(receipt: VarietyActivationReceiptV1) {
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
): VarietyActivationReceiptV1 {
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
    value.planDigest !== OVE305_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE305_APPROVAL_DIGEST ||
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
    resultClass: value.resultClass as VarietyActivationResultClass,
    cleanupClass: value.cleanupClass as VarietyActivationCleanupClass,
    durationMs: value.durationMs,
    state: value.state as VarietyActivationState,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error("Stored receipt digest drifted.");
  }
  return value as unknown as VarietyActivationReceiptV1;
}

const RESULT_CLASSES = new Set<string>([
  "zero_effect_plan",
  "verified_variety_activation",
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
    throw new Error("Variety activation proof was cancelled.");
}

function assertRunOptions(options: VarietyActivationRunOptions) {
  if (options.environment !== "production") {
    throw new Error("variety activation proof is production-only");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE305_VARIETY_ACTIVATION_TIMEOUT_MS
  ) {
    throw new Error("variety activation timeout is invalid");
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
  const args = parseVarietyActivationCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionAdapter(args.implementationSha);
  let receipt: VarietyActivationReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildVarietyActivationFailureReceipt({
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
        : buildVarietyActivationFailureReceipt({
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
        (await runApprovedVarietyActivationProof(
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
          controller.abort(new Error("Variety activation deadline exceeded.")),
        args.timeoutMs,
      );
      try {
        receipt = await runApprovedVarietyActivationProof(
          args as VarietyActivationRunOptions,
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
        receipt = buildVarietyActivationFailureReceipt({
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
        buildVarietyActivationFailureReceipt({
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
