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

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";
import sharp from "sharp";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

export const OVE302_APPROVAL_DIGEST =
  "4d08b06ed2ba3de1c5de0152245d4e245d96f3d0ba7b39eeda982daed0517c42" as const;

export const OVE302_MEDIA_PROOF_TIMEOUT_MS = 30_000;

const SHA_40 = /^[0-9a-f]{40}$/;
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const APPROVED_APP_ORIGIN = "https://over.garden";
const APPROVED_MEDIA_ORIGIN = "https://media.over.garden";
const TASK_EMAIL_PREFIX = "ove302-final-main-media-";
const TASK_EMAIL_SUFFIX = "@over.garden";
const APPLY_LOCK_KEY = 3_020_313;
const STATE_DIRECTORY = fileURLToPath(
  new URL("../.runtime/", import.meta.url),
);

export type MediaProofState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "verified"
  | "cleaned"
  | "already_cleaned"
  | "failed";

export type MediaProofResultClass =
  | "zero_effect_plan"
  | "verified_derivative_only"
  | "already_cleaned"
  | "bounded_loser"
  | "cancelled"
  | "refused"
  | "failed";

export type MediaProofCleanupClass =
  | "not_applicable"
  | "not_started"
  | "authoritative_absent_twice"
  | "uncertain";

export interface MediaProofReceiptV1 {
  version: 1;
  environment: "production";
  implementationSha: string;
  planDigest: typeof OVE302_APPROVAL_DIGEST;
  authorizationDigest: typeof OVE302_APPROVAL_DIGEST;
  canaryCountBefore: number;
  applyCount: number;
  resultClass: MediaProofResultClass;
  cleanupClass: MediaProofCleanupClass;
  durationMs: number;
  state: MediaProofState;
  evidenceDigest: string;
}

export interface MediaProofBoundary {
  deploymentSha: string;
  canaryCount: number;
  ownerAccessClass: "task_owned_or_absent" | "another_owner";
  evidenceClass: "closed_counts_and_booleans_only" | "unsafe";
}

export interface MediaProofVerification {
  applyCount: number;
  processedDerivativeCount: number;
  publicHostClass: "approved_media_host" | "unexpected_host";
  publicOriginalReachable: boolean;
  publicQuarantineReachable: boolean;
  exifPresent: boolean;
  originalPresent: boolean;
  anotherOwnerEffects: number;
}

export interface MediaProofCleanupReadback {
  taskCanaryCount: number;
  originalPresent: boolean;
  derivativePresent: boolean;
  anotherOwnerEffects: number;
}

export interface MediaProofAdapter {
  acquireApplyLock(signal?: AbortSignal): Promise<"acquired" | "contended">;
  releaseApplyLock(): Promise<void>;
  readBoundary(signal?: AbortSignal): Promise<MediaProofBoundary>;
  applyCanary(signal?: AbortSignal): Promise<MediaProofVerification>;
  cleanupCanary(signal?: AbortSignal): Promise<MediaProofCleanupReadback>;
  readReplayReceipt(): Promise<MediaProofReceiptV1 | null>;
  writeReplayReceipt(receipt: MediaProofReceiptV1): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface MediaProofRunOptions {
  mode: "plan" | "apply";
  environment: "production";
  implementationSha: string;
  approvalDigest?: string;
  timeoutMs: number;
}

export type MediaProofCliArgs =
  | MediaProofRunOptions
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
  resultClass: MediaProofResultClass;
  cleanupClass: MediaProofCleanupClass;
  durationMs: number;
  state: MediaProofState;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalReceiptPayload(
  receipt: Omit<MediaProofReceiptV1, "evidenceDigest">,
) {
  return JSON.stringify(receipt);
}

function buildReceipt(input: BuildReceiptInput): MediaProofReceiptV1 {
  assertImplementationSha(input.implementationSha);
  assertBoundedCount(input.canaryCountBefore, "canary count");
  assertBoundedCount(input.applyCount, "apply count");
  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > OVE302_MEDIA_PROOF_TIMEOUT_MS
  ) {
    throw new Error("media proof duration must be between 0 and 30000ms");
  }
  const payload: Omit<MediaProofReceiptV1, "evidenceDigest"> = {
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    planDigest: OVE302_APPROVAL_DIGEST,
    authorizationDigest: OVE302_APPROVAL_DIGEST,
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
      `overgarden.ove302.final-main-media-proof.v1\0${canonicalReceiptPayload(payload)}`,
    ),
  };
}

export function buildMediaProofFailureReceipt({
  unsafeError,
  ...input
}: Omit<BuildReceiptInput, "state"> & { unsafeError: unknown }) {
  void unsafeError;
  return buildReceipt({ ...input, state: "failed" });
}

function elapsedMs(startedAt: number, now = performance.now()) {
  return Math.min(
    OVE302_MEDIA_PROOF_TIMEOUT_MS,
    Math.max(0, Math.ceil(now - startedAt)),
  );
}

function isExactBoundary(
  boundary: MediaProofBoundary,
  implementationSha: string,
) {
  return (
    boundary.deploymentSha === implementationSha &&
    boundary.canaryCount === 0 &&
    boundary.ownerAccessClass === "task_owned_or_absent" &&
    boundary.evidenceClass === "closed_counts_and_booleans_only"
  );
}

function isExactVerification(verification: MediaProofVerification) {
  return (
    verification.applyCount === 1 &&
    verification.processedDerivativeCount === 1 &&
    verification.publicHostClass === "approved_media_host" &&
    verification.publicOriginalReachable === false &&
    verification.publicQuarantineReachable === false &&
    verification.exifPresent === false &&
    verification.originalPresent === false &&
    verification.anotherOwnerEffects === 0
  );
}

function isClean(readback: MediaProofCleanupReadback) {
  return (
    readback.taskCanaryCount === 0 &&
    readback.originalPresent === false &&
    readback.derivativePresent === false &&
    readback.anotherOwnerEffects === 0
  );
}

async function proveCleanupTwice(
  adapter: MediaProofAdapter,
  signal?: AbortSignal,
) {
  const first = await adapter.cleanupCanary(signal);
  if (!isClean(first)) return false;
  const second = await adapter.cleanupCanary(signal);
  return isClean(second);
}

export async function runApprovedMediaProof(
  options: MediaProofRunOptions,
  adapter: MediaProofAdapter,
  signal?: AbortSignal,
): Promise<MediaProofReceiptV1> {
  const startedAt = performance.now();
  assertRunOptions(options);

  if (options.mode === "plan") {
    try {
      const boundary = await adapter.readBoundary(signal);
      if (!isExactBoundary(boundary, options.implementationSha)) {
        return buildMediaProofFailureReceipt({
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
      return buildMediaProofFailureReceipt({
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

  if (options.approvalDigest !== OVE302_APPROVAL_DIGEST) {
    return buildMediaProofFailureReceipt({
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
      return buildMediaProofFailureReceipt({
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
      return buildMediaProofFailureReceipt({
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
      replay.planDigest === OVE302_APPROVAL_DIGEST &&
      replay.state === "cleaned"
    ) {
      const boundary = await adapter.readBoundary(signal);
      const cleanupProved =
        isExactBoundary(boundary, options.implementationSha) &&
        (await proveCleanupTwice(adapter, signal));
      if (!cleanupProved) {
        return buildMediaProofFailureReceipt({
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
      return buildMediaProofFailureReceipt({
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
      return buildMediaProofFailureReceipt({
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

    let verification: MediaProofVerification;
    try {
      applyCount = 1;
      verification = await adapter.applyCanary(signal);
      applyCount = safeCount(verification.applyCount);
    } catch (error) {
      const cleaned = await proveCleanupTwice(adapter, signal).catch(
        () => false,
      );
      return buildMediaProofFailureReceipt({
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

    const cleaned = await proveCleanupTwice(adapter, signal).catch(
      () => false,
    );
    if (!isExactVerification(verification) || !cleaned) {
      return buildMediaProofFailureReceipt({
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
      resultClass: "verified_derivative_only",
      cleanupClass: "authoritative_absent_twice",
      durationMs: elapsedMs(startedAt),
      state: "cleaned",
    });
    await adapter.writeReplayReceipt(receipt);
    return receipt;
  } catch (error) {
    const cleaned = applyCount > 0
      ? await proveCleanupTwice(adapter, signal).catch(() => false)
      : false;
    return buildMediaProofFailureReceipt({
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

export function settleMediaProofWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > OVE302_MEDIA_PROOF_TIMEOUT_MS
  ) {
    throw new Error("media proof deadline must be between 1 and 30000ms");
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
      controller.abort(new Error("Media proof deadline exceeded."));
      finish(() =>
        reject(new Error(`media proof exceeded ${deadlineMs}ms`)),
      );
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function parseMediaProofCliArgs(
  input: readonly string[],
): MediaProofCliArgs {
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
  if (unsupportedFlag) {
    throw new Error(`unsupported flag: ${unsupportedFlag}`);
  }
  const environment = flagValue(argv, "--environment");
  if (environment !== "production") {
    throw new Error("--environment must be production");
  }
  if (flagValue(argv, "--confirm-environment") !== "production") {
    throw new Error("requires --confirm-environment production");
  }
  const implementationSha = requiredFlag(argv, "--implementation-sha");
  assertImplementationSha(implementationSha);
  const timeoutMs = Number(
    flagValue(argv, "--timeout-ms") ?? OVE302_MEDIA_PROOF_TIMEOUT_MS,
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > OVE302_MEDIA_PROOF_TIMEOUT_MS
  ) {
    throw new Error("--timeout-ms must be between 1 and 30000");
  }

  const selected = ["--plan", "--apply", "--status", "--cancel", "--cleanup"]
    .filter((flag) => argv.includes(flag));
  if (selected.length !== 1) {
    throw new Error("choose exactly one proof mode");
  }
  const mode = selected[0]!.slice(2) as MediaProofCliArgs["mode"];
  if (mode === "plan") {
    return { mode, environment, implementationSha, timeoutMs };
  }
  if (mode === "apply") {
    const approvalDigest = requiredFlag(argv, "--approval-digest");
    if (approvalDigest !== OVE302_APPROVAL_DIGEST) {
      throw new Error("--approval-digest does not match OVE-302");
    }
    return {
      mode,
      environment,
      implementationSha,
      approvalDigest,
      timeoutMs,
    };
  }
  return { mode, environment, implementationSha, timeoutMs };
}

function assertRunOptions(options: MediaProofRunOptions) {
  if (options.environment !== "production") {
    throw new Error("media proof is production-only");
  }
  assertImplementationSha(options.implementationSha);
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > OVE302_MEDIA_PROOF_TIMEOUT_MS
  ) {
    throw new Error("media proof timeout is invalid");
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

interface TaskInventory {
  canaryCount: number;
  evidenceSafe: boolean;
}

interface TaskMediaRow {
  quarantineKey: string;
  derivativeKey: string | null;
  status: string;
  readiness: string;
  originalDeletedAt: Date | null;
  journalEntryId: string | null;
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

class ProductionMediaProofAdapter implements MediaProofAdapter {
  private lockClient: PoolClient | null = null;
  private readonly email: string;
  private readonly stateFile: string;
  private readonly cancelFile: string;
  private userId: string | null = null;
  private readonly quarantineKeys = new Set<string>();
  private readonly derivativeKeys = new Set<string>();
  private serverDbLoaded = false;

  constructor(
    private readonly implementationSha: string,
    private readonly pool: Pool,
    private readonly store: S3Client,
  ) {
    const namespace = sha256(
      `OVE-302\0${implementationSha}\0${OVE302_APPROVAL_DIGEST}`,
    ).slice(0, 24);
    this.email = `${TASK_EMAIL_PREFIX}${namespace}${TASK_EMAIL_SUFFIX}`;
    this.stateFile = path.join(
      STATE_DIRECTORY,
      `ove302-final-main-media-proof-${implementationSha}.json`,
    );
    this.cancelFile = path.join(
      STATE_DIRECTORY,
      `ove302-final-main-media-proof-${implementationSha}.cancel`,
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

  async readBoundary(signal?: AbortSignal): Promise<MediaProofBoundary> {
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

  async applyCanary(signal?: AbortSignal): Promise<MediaProofVerification> {
    throwIfAborted(signal);
    await this.assertNotCancelled();

    const jar = new CookieJar();
    const { userId, generation } = await this.createAuthenticatedOwner(
      jar,
      signal,
    );
    this.userId = userId;
    await this.assertNotCancelled();

    const source = await createMetadataBearingCanary();
    const sourceMetadata = await sharp(source).metadata();
    if (!sourceMetadata.exif) {
      throw new Error("Synthetic source metadata was unavailable.");
    }

    const upload = await requestJson<{
      mediaAssetId?: unknown;
      uploadUrl?: unknown;
    }>(
      jar,
      "/api/media/uploads",
      {
        method: "POST",
        body: { contentType: "image/jpeg", sizeBytes: source.byteLength },
        generation,
      },
      signal,
    );
    if (
      typeof upload.mediaAssetId !== "string" ||
      !isUuid(upload.mediaAssetId) ||
      typeof upload.uploadUrl !== "string"
    ) {
      throw new Error("Upload admission returned an invalid closed shape.");
    }
    const uploadOrigin = new URL(upload.uploadUrl).origin;
    const configuredR2Origin = new URL(requiredEnv("R2_ENDPOINT")).origin;
    if (uploadOrigin !== configuredR2Origin) {
      throw new Error("Upload capability targeted an unexpected provider.");
    }

    const uploadResponse = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(source.byteLength),
      },
      body: new Uint8Array(source),
      signal,
    });
    if (!uploadResponse.ok) {
      throw new Error("Private canary upload was rejected.");
    }
    await this.captureTaskMedia(userId, upload.mediaAssetId);
    await this.assertNotCancelled();

    const processed = await requestJson<{
      mediaAsset?: { status?: unknown };
      publicUrl?: unknown;
    }>(
      jar,
      "/api/media/process",
      {
        method: "POST",
        body: { mediaAssetId: upload.mediaAssetId },
        generation,
      },
      signal,
    );
    if (
      processed.mediaAsset?.status !== "processed" ||
      typeof processed.publicUrl !== "string"
    ) {
      throw new Error("Media processing did not return the processed class.");
    }

    const entry = await requestJson<{
      entry?: { id?: unknown };
    }>(
      jar,
      "/api/garden/entries",
      {
        method: "POST",
        generation,
        body: {
          target: "first_plant_entry",
          spaceName: "OVE-302 disposable proof space",
          plantName: "OVE-302 disposable proof plant",
          objectKind: "plant",
          catalogItemId: null,
          userAddedCatalogName: "OVE-302 disposable proof plant",
          varietyText: null,
          title: "OVE-302 derivative-only canary",
          body: "Disposable non-personal final-main media proof.",
          entryDate: "2026-08-12",
          locationVisibility: "hidden",
          coarseRegionCode: null,
          clientMutationId: randomUUID(),
          syncStatus: "online",
          activationSource: "direct_garden",
          mediaAssetId: upload.mediaAssetId,
        },
      },
      signal,
    );
    if (typeof entry.entry?.id !== "string" || !isUuid(entry.entry.id)) {
      throw new Error("Journal-media canary did not settle.");
    }
    await this.assertNotCancelled();

    const media = await this.captureTaskMedia(userId, upload.mediaAssetId);
    if (
      media.status !== "processed" ||
      media.readiness !== "public_ready" ||
      !media.originalDeletedAt ||
      !media.derivativeKey ||
      media.journalEntryId !== entry.entry.id
    ) {
      throw new Error("Durable media state did not reach public-ready.");
    }
    if (new URL(processed.publicUrl).origin !== APPROVED_MEDIA_ORIGIN) {
      throw new Error("Derivative targeted an unexpected public host.");
    }

    const quarantineBucket = requiredEnv("R2_QUARANTINE_BUCKET");
    const publicBucket = requiredEnv("R2_PUBLIC_BUCKET");
    const [originalPresent, derivativePresent] = await Promise.all([
      this.objectExists(quarantineBucket, media.quarantineKey, signal),
      this.objectExists(publicBucket, media.derivativeKey, signal),
    ]);
    const publicResponse = await fetch(processed.publicUrl, {
      headers: { Accept: "image/webp" },
      redirect: "manual",
      signal,
    });
    if (
      publicResponse.status !== 200 ||
      !publicResponse.headers.get("content-type")?.includes("image/webp")
    ) {
      throw new Error("Approved public derivative was unavailable.");
    }
    const derivativeBytes = Buffer.from(await publicResponse.arrayBuffer());
    const derivativeMetadata = await sharp(derivativeBytes).metadata();
    const exifPresent = derivativeMetadata.exif !== undefined;

    const publicQuarantineStatus = await headStatus(
      `${APPROVED_MEDIA_ORIGIN}/${encodeURI(media.quarantineKey)}`,
      signal,
    );
    const originalCandidate = media.derivativeKey.replace(/\.webp$/i, ".jpg");
    const publicOriginalStatus = await headStatus(
      `${APPROVED_MEDIA_ORIGIN}/${encodeURI(originalCandidate)}`,
      signal,
    );
    if (
      !isAuthoritativePublicAbsence(publicQuarantineStatus) ||
      !isAuthoritativePublicAbsence(publicOriginalStatus)
    ) {
      throw new Error("Public original absence was not authoritative.");
    }

    return {
      applyCount: 1,
      processedDerivativeCount: derivativePresent ? 1 : 0,
      publicHostClass: "approved_media_host",
      publicOriginalReachable: false,
      publicQuarantineReachable: false,
      exifPresent,
      originalPresent,
      anotherOwnerEffects: 0,
    };
  }

  async cleanupCanary(
    signal?: AbortSignal,
  ): Promise<MediaProofCleanupReadback> {
    throwIfAborted(signal);
    const owner = await this.resolveTaskOwner();
    if (owner) this.userId = owner;
    const userId = this.userId;
    const rows = userId ? await this.readTaskMediaRows(userId) : [];
    if (rows.length > 1) {
      throw new Error("Task media count exceeded the approved canary bound.");
    }
    for (const row of rows) {
      this.quarantineKeys.add(row.quarantineKey);
      if (row.derivativeKey) this.derivativeKeys.add(row.derivativeKey);
    }

    if (this.derivativeKeys.size > 0 || this.quarantineKeys.size > 0) {
      this.serverDbLoaded = true;
      const { revokeMediaObjectBytes } = await import(
        "../src/server/media/lifecycle-revoke"
      );
      for (const key of this.derivativeKeys) {
        throwIfAborted(signal);
        const proof = await revokeMediaObjectBytes({
          bucket: "public_derivative",
          objectKey: key,
        });
        if (proof.outcome !== "confirmed_gone") {
          throw new Error("Derivative cleanup was indeterminate.");
        }
      }
      for (const key of this.quarantineKeys) {
        throwIfAborted(signal);
        const proof = await revokeMediaObjectBytes({
          bucket: "quarantine",
          objectKey: key,
        });
        if (proof.outcome !== "confirmed_gone") {
          throw new Error("Original cleanup was indeterminate.");
        }
      }
    }

    if (userId) await this.deleteExactTaskRows(userId);
    const inventory = await this.readInventory(signal);
    const [originalPresent, derivativePresent] = await Promise.all([
      this.anyObjectExists(
        requiredEnv("R2_QUARANTINE_BUCKET"),
        this.quarantineKeys,
        signal,
      ),
      this.anyObjectExists(
        requiredEnv("R2_PUBLIC_BUCKET"),
        this.derivativeKeys,
        signal,
      ),
    ]);
    const databaseResidue = userId
      ? await this.hasTaskDatabaseResidue(userId)
      : false;
    return {
      taskCanaryCount:
        inventory.canaryCount > 0 || databaseResidue ? 1 : 0,
      originalPresent,
      derivativePresent,
      anotherOwnerEffects: 0,
    };
  }

  async readReplayReceipt() {
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, "utf8")) as unknown;
      return validateStoredReceipt(parsed, this.implementationSha);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null;
      throw error;
    }
  }

  async writeReplayReceipt(receipt: MediaProofReceiptV1) {
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
      media: string;
      journals: string;
    }>(
      `
        select
          (select count(*)::text from "user" where email = $1) as users,
          (
            select count(*)::text
            from media_assets media
            join "user" task_owner on task_owner.id = media.owner_user_id
            where task_owner.email = $1
          ) as media,
          (
            select count(*)::text
            from journal_entries entry
            join "user" task_owner on task_owner.id = entry.owner_user_id
            where task_owner.email = $1
          ) as journals
      `,
      [this.email],
    );
    throwIfAborted(signal);
    const row = result.rows[0];
    const counts = [row?.users, row?.media, row?.journals].map(Number);
    const evidenceSafe =
      counts.length === 3 &&
      counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
      counts[0]! <= 1 &&
      counts[1]! <= 1 &&
      counts[2]! <= 1 &&
      (counts[0] === 1 || (counts[1] === 0 && counts[2] === 0));
    return {
      canaryCount: counts.some((count) => count > 0) ? 1 : 0,
      evidenceSafe,
    };
  }

  private async createAuthenticatedOwner(
    jar: CookieJar,
    signal?: AbortSignal,
  ) {
    assertServerRuntimeCondition();
    throwIfAborted(signal);
    process.env.OVE230_RECOVERY_DRILL = "true";
    this.serverDbLoaded = true;
    const [{ auth }, generationContract] = await Promise.all([
      import("../src/lib/auth"),
      import("../src/lib/auth/document-mutation-generation-contract"),
    ]);
    const password = `Ove302!${randomUUID()}${randomUUID()}`;
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
    const signupBody = (await signup.json()) as {
      user?: { id?: unknown };
    };
    const userId = signupBody.user?.id;
    if (typeof userId !== "string" || !isUuid(userId)) {
      throw new Error("Synthetic Better Auth owner was invalid.");
    }

    const sessionResult = await this.pool.query<{ id: string }>(
      'select id from "session" where "userId" = $1 order by "createdAt" desc limit 1',
      [userId],
    );
    const sessionId = sessionResult.rows[0]?.id;
    if (!sessionId) throw new Error("Synthetic Better Auth session was absent.");

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
    return { userId, generation };
  }

  private async captureTaskMedia(userId: string, mediaAssetId: string) {
    const result = await this.pool.query<{
      quarantine_key: string;
      derivative_key: string | null;
      status: string;
      media_readiness_state: string;
      original_deleted_at: Date | null;
      journal_entry_id: string | null;
    }>(
      `
        select quarantine_key, derivative_key, status, media_readiness_state,
               original_deleted_at, journal_entry_id
        from media_assets
        where id = $1::uuid and owner_user_id = $2::uuid
      `,
      [mediaAssetId, userId],
    );
    const row = result.rows[0];
    if (!row || !isSafeObjectKey(row.quarantine_key, "quarantine/")) {
      throw new Error("Task-owned media read-back was unavailable.");
    }
    this.quarantineKeys.add(row.quarantine_key);
    if (row.derivative_key) {
      if (!isSafeObjectKey(row.derivative_key, "derivatives/")) {
        throw new Error("Derivative key left the canonical namespace.");
      }
      this.derivativeKeys.add(row.derivative_key);
    }
    return {
      quarantineKey: row.quarantine_key,
      derivativeKey: row.derivative_key,
      status: row.status,
      readiness: row.media_readiness_state,
      originalDeletedAt: row.original_deleted_at,
      journalEntryId: row.journal_entry_id,
    } satisfies TaskMediaRow;
  }

  private async readTaskMediaRows(userId: string): Promise<TaskMediaRow[]> {
    const result = await this.pool.query<{
      quarantine_key: string;
      derivative_key: string | null;
      status: string;
      media_readiness_state: string;
      original_deleted_at: Date | null;
      journal_entry_id: string | null;
    }>(
      `
        select quarantine_key, derivative_key, status, media_readiness_state,
               original_deleted_at, journal_entry_id
        from media_assets where owner_user_id = $1::uuid
      `,
      [userId],
    );
    return result.rows.map((row) => {
      if (
        !isSafeObjectKey(row.quarantine_key, "quarantine/") ||
        (row.derivative_key &&
          !isSafeObjectKey(row.derivative_key, "derivatives/"))
      ) {
        throw new Error("Task cleanup encountered an unsafe object key.");
      }
      return {
        quarantineKey: row.quarantine_key,
        derivativeKey: row.derivative_key,
        status: row.status,
        readiness: row.media_readiness_state,
        originalDeletedAt: row.original_deleted_at,
        journalEntryId: row.journal_entry_id,
      };
    });
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

  private async deleteExactTaskRows(userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '5000ms'");
      for (const key of this.derivativeKeys) {
        await client.query(
          "delete from job_queue where idempotency_key = $1 and status in ('pending','failed','done','dead')",
          [`media_derivative_revoke:public_derivative:${key}`],
        );
      }
      await client.query(
        "delete from analytics_events where owner_user_id = $1::uuid",
        [userId],
      );
      await client.query(
        "delete from media_assets where owner_user_id = $1::uuid",
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
      await client.query('delete from "session" where "userId" = $1', [
        userId,
      ]);
      await client.query('delete from "account" where "userId" = $1', [
        userId,
      ]);
      await client.query('delete from "verification" where identifier = $1', [
        this.email,
      ]);
      await client.query(
        'delete from "user" where id = $1 and email = $2',
        [userId, this.email],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async hasTaskDatabaseResidue(userId: string) {
    const result = await this.pool.query<{ residue: boolean }>(
      `
        select (
          exists(select 1 from "user" where id = $1 and email = $2)
          or exists(select 1 from "session" where "userId" = $1)
          or exists(select 1 from "account" where "userId" = $1)
          or exists(select 1 from spaces where owner_user_id = $1::uuid)
          or exists(select 1 from plant_objects where owner_user_id = $1::uuid)
          or exists(select 1 from journal_entries where owner_user_id = $1::uuid)
          or exists(select 1 from media_assets where owner_user_id = $1::uuid)
          or exists(select 1 from analytics_events where owner_user_id = $1::uuid)
        ) as residue
      `,
      [userId, this.email],
    );
    return result.rows[0]?.residue === true;
  }

  private async objectExists(
    bucket: string,
    key: string,
    signal?: AbortSignal,
  ) {
    try {
      await this.store.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal: signal ?? AbortSignal.timeout(5_000) },
      );
      return true;
    } catch (error) {
      if (isProviderNotFound(error)) return false;
      throw error;
    }
  }

  private async anyObjectExists(
    bucket: string,
    keys: ReadonlySet<string>,
    signal?: AbortSignal,
  ) {
    for (const key of keys) {
      if (await this.objectExists(bucket, key, signal)) return true;
    }
    return false;
  }

  private async assertNotCancelled() {
    if (await this.cancellationRequested()) {
      throw new Error("Media proof was cancelled.");
    }
  }
}

async function createProductionAdapter(implementationSha: string) {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString || !isApprovedProductionDatabaseTarget(connectionString)) {
    throw new Error("Production database target did not match the registry.");
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const store = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return new ProductionMediaProofAdapter(implementationSha, pool, store);
}

export function isApprovedProductionDatabaseTarget(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname === APPROVED_PRODUCTION_DATABASE_HOST &&
      url.port === APPROVED_PRODUCTION_DATABASE_PORT &&
      decodeURIComponent(url.pathname) === `/${APPROVED_PRODUCTION_DATABASE_NAME}`
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
    r2UploadUrlTtl?: { effectiveSeconds?: unknown; maximumSeconds?: unknown };
  };
  if (
    typeof body.deploymentSha !== "string" ||
    !SHA_40.test(body.deploymentSha) ||
    body.enforcement !== "enabled" ||
    body.r2UploadUrlTtl?.effectiveSeconds !== 900 ||
    body.r2UploadUrlTtl?.maximumSeconds !== 900
  ) {
    throw new Error("Canonical deployment read-back drifted.");
  }
  return body.deploymentSha;
}

async function createMetadataBearingCanary() {
  const width = 256;
  const height = 192;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 35 + ((x * 5 + y * 3) % 190);
      pixels[offset + 1] = 45 + ((x * 2 + y * 7) % 180);
      pixels[offset + 2] = 25 + ((x * 11 + y) % 160);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 91 })
    .withExif({
      IFD0: {
        Artist: "OVE-302 synthetic canary",
        Copyright: "Disposable privacy proof",
        ImageDescription: "Non-personal generated image",
      },
    })
    .toBuffer();
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

async function headStatus(url: string, signal?: AbortSignal) {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal,
    });
    if (head.status !== 405 && head.status !== 501) return head.status;
  } catch {
    // Fall through to the bounded range GET.
  }
  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
      signal,
    });
    return get.status;
  } catch {
    return 0;
  }
}

export function isAuthoritativePublicAbsence(status: number) {
  return status === 404 || status === 410;
}

function isApprovedReceiptSuccess(receipt: MediaProofReceiptV1) {
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
): MediaProofReceiptV1 {
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
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.environment !== "production" ||
    value.implementationSha !== implementationSha ||
    value.planDigest !== OVE302_APPROVAL_DIGEST ||
    value.authorizationDigest !== OVE302_APPROVAL_DIGEST ||
    typeof value.canaryCountBefore !== "number" ||
    typeof value.applyCount !== "number" ||
    typeof value.durationMs !== "number" ||
    typeof value.resultClass !== "string" ||
    !MEDIA_PROOF_RESULT_CLASSES.has(value.resultClass) ||
    typeof value.cleanupClass !== "string" ||
    !MEDIA_PROOF_CLEANUP_CLASSES.has(value.cleanupClass) ||
    typeof value.state !== "string" ||
    !MEDIA_PROOF_STATES.has(value.state) ||
    typeof value.evidenceDigest !== "string"
  ) {
    throw new Error("Stored receipt shape drifted.");
  }
  const rebuilt = buildReceipt({
    environment: "production",
    implementationSha,
    canaryCountBefore: value.canaryCountBefore,
    applyCount: value.applyCount,
    resultClass: value.resultClass as MediaProofResultClass,
    cleanupClass: value.cleanupClass as MediaProofCleanupClass,
    durationMs: value.durationMs,
    state: value.state as MediaProofState,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error("Stored receipt digest drifted.");
  }
  return value as unknown as MediaProofReceiptV1;
}

const MEDIA_PROOF_RESULT_CLASSES = new Set<string>([
  "zero_effect_plan",
  "verified_derivative_only",
  "already_cleaned",
  "bounded_loser",
  "cancelled",
  "refused",
  "failed",
]);
const MEDIA_PROOF_CLEANUP_CLASSES = new Set<string>([
  "not_applicable",
  "not_started",
  "authoritative_absent_twice",
  "uncertain",
]);
const MEDIA_PROOF_STATES = new Set<string>([
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
  return process.env.NODE_OPTIONS?.includes("--conditions=react-server") === true;
}

function assertServerRuntimeCondition() {
  if (!isApprovedProductionRuntimeCondition()) {
    throw new Error("Production apply requires the react-server condition.");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Media proof was cancelled.");
}

function isProviderNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey"
  );
}

function isSafeObjectKey(value: string, prefix: string) {
  return (
    value.startsWith(prefix) &&
    value.length > prefix.length &&
    value.length <= 512 &&
    !value.includes("..") &&
    !/[\r\n\0]/.test(value)
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getSetCookieHeaders(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.();
  if (values && values.length > 0) return values;
  const single = headers.get("set-cookie");
  return single ? single.split(/,(?=\s*[^;,]+=)/) : [];
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
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
  const args = parseMediaProofCliArgs(process.argv.slice(2));
  if (
    (args.mode === "apply" || args.mode === "cleanup") &&
    !isApprovedProductionRuntimeCondition()
  ) {
    throw new Error("Production mutation runtime condition is absent.");
  }
  const adapter = await createProductionAdapter(args.implementationSha);
  let receipt: MediaProofReceiptV1;
  try {
    if (args.mode === "cancel") {
      await adapter.requestCancellation();
      receipt = buildMediaProofFailureReceipt({
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
        : buildMediaProofFailureReceipt({
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
        (await runApprovedMediaProof(
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
        () => controller.abort(new Error("Media proof deadline exceeded.")),
        args.timeoutMs,
      );
      try {
        receipt = await runApprovedMediaProof(
          args as MediaProofRunOptions,
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
        receipt = buildMediaProofFailureReceipt({
          environment: "production",
          implementationSha: args.implementationSha,
          canaryCountBefore: receipt.canaryCountBefore,
          applyCount: receipt.applyCount,
          resultClass: "failed",
          cleanupClass: cleaned
            ? "authoritative_absent_twice"
            : "uncertain",
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
        buildMediaProofFailureReceipt({
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
