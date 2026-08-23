import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  type EphemeralMediaCapabilityClaims,
  type EphemeralMediaSessionCapabilityClaims,
} from "../src/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  parseEphemeralMediaSigningPolicy,
  requireStrongSecret,
  signEphemeralMediaToken,
} from "../src/lib/media/ephemeral-staging-crypto";

export const EPHEMERAL_MEDIA_PROVIDER_PLAN =
  "OVE-346 v1 approved provider plan: create one private R2 staging bucket, one Worker custom domain, one SQLite Durable Object namespace, object-specific signing secrets, 15-minute lease, 1-day lifecycle fallback; no paid-plan upgrade and no legacy deletion.";
export const EPHEMERAL_MEDIA_PROVIDER_PLAN_DIGEST = createHash("sha256")
  .update(EPHEMERAL_MEDIA_PROVIDER_PLAN)
  .digest("hex");

const EXPECTED_ORIGINS = [
  "http://localhost:3000",
  "https://over-garden.vercel.app",
  "https://over.garden",
  "https://www.over.garden",
];

export interface EphemeralMediaProviderReadback {
  accountId: string;
  plan: string;
  bucket: { name: string; storageClass: string; private: boolean };
  worker: { name: string; customDomain: string };
  durableObject: { binding: string; sqlite: boolean; migrationTag: string };
  corsOrigins: string[];
  lifecycleDays: number;
}

export function evaluateEphemeralMediaProviderReadback(
  readback: EphemeralMediaProviderReadback,
) {
  const violations: string[] = [];
  if (readback.accountId !== "cb03b15042adc74edfe2d8201636300a")
    violations.push("account_identity");
  if (readback.plan.toLowerCase() !== "free") violations.push("plan_class");
  if (readback.bucket.name !== "overgarden-media-staging")
    violations.push("bucket_identity");
  if (readback.bucket.storageClass !== "Standard")
    violations.push("storage_class");
  if (!readback.bucket.private) violations.push("bucket_privacy");
  if (readback.worker.name !== "overgarden-media-staging")
    violations.push("worker_identity");
  if (readback.worker.customDomain !== "media-stage.over.garden")
    violations.push("custom_domain");
  if (readback.durableObject.binding !== "MEDIA_STAGING_SESSIONS")
    violations.push("do_binding");
  if (!readback.durableObject.sqlite) violations.push("do_storage");
  if (readback.durableObject.migrationTag !== "v1")
    violations.push("do_migration");
  if (readback.lifecycleDays !== 1) violations.push("lifecycle");
  if (
    JSON.stringify([...readback.corsOrigins].sort()) !==
    JSON.stringify([...EXPECTED_ORIGINS].sort())
  ) {
    violations.push("cors_allowlist");
  }
  return {
    version: "ove346.providerReadback.v1",
    status: violations.length === 0 ? "aligned" : "drift",
    violations,
  } as const;
}

export async function settleBoundedControl<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs = 500,
): Promise<
  { status: "ok"; value: T } | { status: "degraded"; code: "control_timeout" }
> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<{ status: "degraded"; code: "control_timeout" }>(
    (resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({ status: "degraded", code: "control_timeout" });
      }, deadlineMs);
    },
  );
  const completed = operation(controller.signal).then((value) => ({
    status: "ok" as const,
    value,
  }));
  try {
    return await Promise.race([completed, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function verifyEphemeralMediaRepositoryContract(
  repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  ),
) {
  const read = (relativePath: string) =>
    readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const wrangler = read("apps/web/cloudflare/media-staging/wrangler.jsonc");
  const cors = JSON.parse(
    read("apps/web/cloudflare/media-staging/r2-cors.json"),
  ) as {
    rules?: Array<{
      allowed?: { origins?: string[]; methods?: string[]; headers?: string[] };
      exposeHeaders?: string[];
      maxAgeSeconds?: number;
    }>;
  };
  const lifecycle = JSON.parse(
    read("apps/web/cloudflare/media-staging/r2-lifecycle.json"),
  ) as {
    rules?: Array<{
      id?: string;
      enabled?: boolean;
      conditions?: { prefix?: string };
      deleteObjectsTransition?: {
        condition?: { type?: string; maxAge?: number };
      };
      abortMultipartUploadsTransition?: {
        condition?: { type?: string; maxAge?: number };
      };
    }>;
  };
  const envExample = read("apps/web/.env.example");
  const reservationRoute = read(
    "apps/web/src/app/api/media/staging/reservations/route.ts",
  );
  const worker = read("apps/web/cloudflare/media-staging/src/index.ts");
  const coordinator = read(
    "apps/web/cloudflare/media-staging/src/staging-session.ts",
  );
  const cryptoContract = read(
    "apps/web/src/lib/media/ephemeral-staging-crypto.ts",
  );
  const generatedTypes = read(
    "apps/web/cloudflare/media-staging/worker-configuration.d.ts",
  );
  const violations: string[] = [];
  for (const required of [
    '"name": "overgarden-media-staging"',
    '"pattern": "media-stage.over.garden"',
    '"custom_domain": true',
    '"bucket_name": "overgarden-media-staging"',
    '"bucket_name": "overgarden-public"',
    '"name": "MEDIA_STAGING_SESSIONS"',
    '"name": "MEDIA_STAGING_UPLOAD_RATE_LIMIT"',
    '"namespace_id": "346001"',
    '"limit": 30',
    '"period": 60',
    '"invocation_logs": false',
    '"new_sqlite_classes": ["MediaStagingSession"]',
    '"compatibility_date": "2026-08-23"',
  ]) {
    if (!wrangler.includes(required))
      violations.push(`wrangler:${sha(required)}`);
  }
  if (wrangler.includes('"limits"') || wrangler.includes('"cpu_ms"')) {
    violations.push("wrangler:free_plan_cpu_override");
  }
  if (
    wrangler.includes("EPHEMERAL_MEDIA_CAPABILITY_SECRETS") ||
    wrangler.includes("EPHEMERAL_MEDIA_RECEIPT_SECRETS") ||
    wrangler.includes("EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET")
  ) {
    violations.push("wrangler:secret_material_binding");
  }
  const corsRule = cors.rules?.[0];
  if (
    cors.rules?.length !== 1 ||
    JSON.stringify([...(corsRule?.allowed?.origins ?? [])].sort()) !==
      JSON.stringify([...EXPECTED_ORIGINS].sort()) ||
    JSON.stringify(corsRule?.allowed?.methods) !==
      JSON.stringify(["PUT", "HEAD"]) ||
    JSON.stringify(corsRule?.allowed?.headers) !== JSON.stringify(["*"]) ||
    JSON.stringify(corsRule?.exposeHeaders) !== JSON.stringify(["ETag"]) ||
    corsRule?.maxAgeSeconds !== 3600
  ) {
    violations.push("cors:drift");
  }
  const lifecycleRule = lifecycle.rules?.[0];
  if (
    lifecycle.rules?.length !== 1 ||
    lifecycleRule?.id !== "delete-staged-webp-after-1-day" ||
    lifecycleRule.enabled !== true ||
    lifecycleRule.conditions?.prefix !== "staging/" ||
    lifecycleRule.deleteObjectsTransition?.condition?.type !== "Age" ||
    lifecycleRule.deleteObjectsTransition.condition.maxAge !== 86_400 ||
    lifecycleRule.abortMultipartUploadsTransition?.condition?.type !== "Age" ||
    lifecycleRule.abortMultipartUploadsTransition.condition.maxAge !== 86_400
  ) {
    violations.push("lifecycle:drift");
  }
  for (const name of [
    "EPHEMERAL_MEDIA_STAGING_BASE_URL",
    "EPHEMERAL_MEDIA_CAPABILITY_SECRETS",
    "EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION",
    "EPHEMERAL_MEDIA_RECEIPT_SECRETS",
    "EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION",
    "EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET",
  ]) {
    if (!envExample.includes(`${name}=`)) violations.push(`env:${name}`);
  }
  if (
    /@\/db|media-repository|createQuarantinedMediaAsset|journal-draft-repository/.test(
      reservationRoute,
    )
  ) {
    violations.push("reservation:database_effect");
  }
  for (const required of [
    "request.body",
    "MEDIA_STAGING_BUCKET.put",
    "sha256:",
    'etagDoesNotMatch: "*"',
    "PUBLIC_MEDIA_BUCKET.put",
    "verifySessionCapability",
    "deriveEphemeralMediaPublicOwnershipProof",
    "admitOwnerUpload",
    "MEDIA_STAGING_UPLOAD_RATE_LIMIT.limit",
  ]) {
    if (!worker.includes(required)) violations.push(`worker:${sha(required)}`);
  }
  for (const required of [
    "CREATE TABLE IF NOT EXISTS staging_session",
    "CREATE TABLE IF NOT EXISTS staging_media",
    "CREATE TABLE IF NOT EXISTS staging_pending_delete",
    "public_ownership_proof TEXT",
    "CREATE TABLE IF NOT EXISTS owner_admission",
    "CREATE TABLE IF NOT EXISTS owner_active_session",
    "async alarm()",
    "absent_readbacks < 1",
    "nextReconciliationDelayMs",
    "deleteAll",
    "completeSupersededDeletes",
    "MAX_PENDING_DELETES_PER_SESSION = 100",
    "state = 'finalizing'",
    "state = 'abandoning'",
    "customMetadata?.ownershipProof",
  ]) {
    if (!coordinator.includes(required))
      violations.push(`coordinator:${sha(required)}`);
  }
  if (!cryptoContract.includes('"public-object-ownership"')) {
    violations.push("crypto:public_object_ownership_domain");
  }
  if (
    !generatedTypes.includes("MEDIA_STAGING_SESSIONS: DurableObjectNamespace")
  ) {
    violations.push("generated_types:do_binding");
  }
  if (!generatedTypes.includes("MEDIA_STAGING_UPLOAD_RATE_LIMIT: RateLimit")) {
    violations.push("generated_types:rate_limit_binding");
  }
  return {
    version: "ove346.repositoryContract.v1",
    status: violations.length === 0 ? "aligned" : "drift",
    violations,
  } as const;
}

export async function runLiveExplicitDeleteSmoke(
  fetcher: typeof fetch = resolveLiveFetcher(),
) {
  const context = await liveContext();
  const status = await fetcher(`${context.baseUrl}/v1/status`, {
    cache: "no-store",
  });
  const statusBody = await boundedResponseJson(status, 2_048);
  if (
    status.status !== 200 ||
    statusBody.status !== "ready" ||
    statusBody.protocol !== EPHEMERAL_MEDIA_STAGING_PROTOCOL
  ) {
    throw new Error("live_worker_not_ready");
  }
  const preflight = await fetcher(`${context.baseUrl}/v1/status`, {
    method: "OPTIONS",
    headers: {
      origin: "https://over.garden",
      "access-control-request-method": "PUT",
      "access-control-request-headers":
        "authorization,content-type,content-sha256",
    },
  });
  if (
    preflight.status !== 204 ||
    preflight.headers.get("access-control-allow-origin") !==
      "https://over.garden"
  ) {
    throw new Error("live_cors_preflight_failed");
  }
  const staged = await liveStage(context, fetcher);
  const replay = await liveUpload(staged, fetcher);
  if (
    replay.response.status !== 200 ||
    replay.body.stagingReceipt !== staged.stagingReceipt
  ) {
    throw new Error("live_upload_replay_failed");
  }
  const deleteStarted = performance.now();
  const deleted = await fetcher(staged.uploadUrl, {
    method: "DELETE",
    headers: { authorization: `Bearer ${staged.deleteCapability}` },
  });
  const deleteLatencyMs = performance.now() - deleteStarted;
  const deletedBody = await boundedResponseJson(deleted, 2_048);
  if (
    deleted.status !== 200 ||
    deletedBody.status !== "deleted" ||
    deleteLatencyMs > 500
  ) {
    throw new Error("live_delete_failed_or_slow");
  }
  const deleteReplay = await fetcher(staged.uploadUrl, {
    method: "DELETE",
    headers: { authorization: `Bearer ${staged.deleteCapability}` },
  });
  if (
    deleteReplay.status !== 200 ||
    (await boundedResponseJson(deleteReplay, 2_048)).status !== "deleted"
  ) {
    throw new Error("live_delete_replay_failed");
  }
  return {
    version: "ove346.liveExplicitDelete.v1",
    status: "passed",
    workerStatus: statusBody.status,
    cors: "allowed_exact_origin",
    upload: "checksum_verified",
    replay: "same_receipt",
    delete: "absent_idempotent",
    edgeControlLatencyMs: Math.ceil(deleteLatencyMs),
  } as const;
}

export async function runLiveClaimAlarmSmoke(
  fetcher: typeof fetch = resolveLiveFetcher(),
  options: { pollIntervalMs?: number; cleanupDeadlineMs?: number } = {},
) {
  const context = await liveContext();
  const staged = await liveStage(context, fetcher);
  const publishId = randomUUID();
  const sessionCapability = await issueLiveSessionCapability(context, {
    stagingSessionId: staged.stagingSessionId,
    publishId,
    stagingReceipts: [staged.stagingReceipt],
    purpose: "claim",
  });
  const claimStarted = performance.now();
  const claimed = await fetcher(
    `${context.baseUrl}/v1/staging/${staged.stagingSessionId}/claim`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionCapability.capability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publishId,
        stagingReceipts: [staged.stagingReceipt],
      }),
    },
  );
  const claimLatencyMs = performance.now() - claimStarted;
  const claimBody = await boundedResponseJson(claimed, 8_192);
  const publicPath = firstPublicPath(claimBody);
  if (claimed.status !== 200 || !publicPath || claimLatencyMs > 45_000) {
    throw new Error("live_claim_failed_or_slow");
  }
  const publicUrl = new URL(publicPath, context.publicBaseUrl).toString();
  if (!(await publicObjectExists(publicUrl, fetcher))) {
    throw new Error("live_promoted_object_missing");
  }
  const finalizeCapability = await issueLiveSessionCapability(context, {
    stagingSessionId: staged.stagingSessionId,
    publishId,
    stagingReceipts: [staged.stagingReceipt],
    purpose: "finalize",
  });
  const finalized = await fetcher(
    `${context.baseUrl}/v1/staging/${staged.stagingSessionId}/finalize`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${finalizeCapability.capability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ publishId }),
    },
  );
  const finalizeBody = await boundedResponseJson(finalized, 2_048);
  if (finalized.status !== 409 || finalizeBody.code !== "commit_absent") {
    throw new Error("live_finalize_absence_not_closed");
  }
  const cleanupDeadlineMs = options.cleanupDeadlineMs ?? 20 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const cleanupStartedAt = Date.now();
  while (Date.now() - cleanupStartedAt < cleanupDeadlineMs) {
    if (!(await publicObjectExists(publicUrl, fetcher))) {
      return {
        version: "ove346.liveClaimAlarm.v1",
        status: "passed",
        claim: "one_public_object",
        finalize: "commit_absent_closed",
        alarm: "public_object_removed_after_two_absent_readbacks",
        claimLatencyMs: Math.ceil(claimLatencyMs),
        cleanupElapsedMs: Date.now() - cleanupStartedAt,
      } as const;
    }
    await delay(pollIntervalMs);
  }
  throw new Error("live_alarm_cleanup_deadline_exceeded");
}

async function main() {
  if (process.argv.includes("--live-explicit-delete")) {
    console.log(JSON.stringify(await runLiveExplicitDeleteSmoke(), null, 2));
    return;
  }
  if (process.argv.includes("--live-claim-alarm")) {
    console.log(JSON.stringify(await runLiveClaimAlarmSmoke(), null, 2));
    return;
  }
  const repository = verifyEphemeralMediaRepositoryContract();
  const receipt = {
    version: "ove346.providerPlan.v1",
    planDigest: EPHEMERAL_MEDIA_PROVIDER_PLAN_DIGEST,
    status:
      EPHEMERAL_MEDIA_PROVIDER_PLAN_DIGEST ===
        "6fc6a6a32e60964a2b012a64079a2ebab79de1699c816872e1eb503c5dafdd27" &&
      repository.status === "aligned"
        ? "approved"
        : "drift",
    repository,
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "approved") process.exitCode = 1;
}

interface LiveContext {
  baseUrl: string;
  publicBaseUrl: string;
  capabilityPolicy: ReturnType<typeof parseEphemeralMediaSigningPolicy>;
  ownerHashSecret: string;
  ownerSubjectHash: string;
}

interface LiveStageResult {
  stagingSessionId: string;
  uploadUrl: string;
  uploadCapability: string;
  stagingReceipt: string;
  deleteCapability: string;
  body: Uint8Array;
  sha256: string;
}

async function liveContext(): Promise<LiveContext> {
  const capabilityPolicy = parseEphemeralMediaSigningPolicy({
    secrets: process.env.EPHEMERAL_MEDIA_CAPABILITY_SECRETS,
    currentVersion: process.env.EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION,
  });
  const ownerHashSecret = requireStrongSecret(
    process.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
  );
  return {
    baseUrl: exactHttpsOrigin(
      process.env.EPHEMERAL_MEDIA_STAGING_BASE_URL,
      "https://media-stage.over.garden",
    ),
    publicBaseUrl: "https://media.over.garden",
    capabilityPolicy,
    ownerHashSecret,
    ownerSubjectHash: await deriveEphemeralMediaOwnerSubjectHash(
      ownerHashSecret,
      randomUUID(),
    ),
  };
}

async function liveStage(
  context: LiveContext,
  fetcher: typeof fetch,
): Promise<LiveStageResult> {
  const body = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
  const sha256 = createHash("sha256").update(body).digest("base64");
  const stagingSessionId = randomUUID();
  const mediaAssetId = randomUUID();
  const now = Math.floor(Date.now() / 1_000);
  const claims: EphemeralMediaCapabilityClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "capability",
    keyVersion: context.capabilityPolicy.active.version,
    purpose: "upload",
    ownerSubjectHash: context.ownerSubjectHash,
    stagingSessionId,
    mediaAssetId,
    generation: 1,
    sha256,
    sizeBytes: body.byteLength,
    width: 1,
    height: 1,
    issuedAtSeconds: now,
    expiresAtSeconds: now + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const uploadCapability = await signEphemeralMediaToken(
    claims as unknown as Record<string, unknown>,
    context.capabilityPolicy.active,
  );
  const uploadUrl = `${context.baseUrl}/v1/staging/${stagingSessionId}/${mediaAssetId}/1`;
  const uploaded = await liveUpload(
    { body, sha256, uploadUrl, uploadCapability },
    fetcher,
  );
  if (
    uploaded.response.status !== 201 ||
    uploaded.body.status !== "staged" ||
    typeof uploaded.body.stagingReceipt !== "string" ||
    typeof uploaded.body.deleteCapability !== "string"
  ) {
    throw new Error("live_upload_failed");
  }
  return {
    stagingSessionId,
    uploadUrl,
    uploadCapability,
    stagingReceipt: uploaded.body.stagingReceipt,
    deleteCapability: uploaded.body.deleteCapability,
    body,
    sha256,
  };
}

async function liveUpload(
  input: Pick<
    LiveStageResult,
    "body" | "sha256" | "uploadUrl" | "uploadCapability"
  >,
  fetcher: typeof fetch,
) {
  const response = await fetcher(input.uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${input.uploadCapability}`,
      "content-type": "image/webp",
      "content-length": String(input.body.byteLength),
      "content-sha256": input.sha256,
      origin: "https://over.garden",
    },
    body: input.body.buffer.slice(
      input.body.byteOffset,
      input.body.byteOffset + input.body.byteLength,
    ) as ArrayBuffer,
  });
  return { response, body: await boundedResponseJson(response, 8_192) };
}

async function issueLiveSessionCapability(
  context: LiveContext,
  input: {
    stagingSessionId: string;
    publishId: string;
    stagingReceipts: string[];
    purpose: "claim" | "finalize";
  },
) {
  const now = Math.floor(Date.now() / 1_000);
  const receiptSetDigest = createHash("sha256")
    .update(input.stagingReceipts.join("\0"))
    .digest("base64url");
  const claims: EphemeralMediaSessionCapabilityClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "session_capability",
    keyVersion: context.capabilityPolicy.active.version,
    purpose: input.purpose,
    ownerSubjectHash: context.ownerSubjectHash,
    stagingSessionId: input.stagingSessionId,
    publishId: input.publishId,
    receiptSetDigest,
    issuedAtSeconds: now,
    expiresAtSeconds: now + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };
  return {
    capability: await signEphemeralMediaToken(
      claims as unknown as Record<string, unknown>,
      context.capabilityPolicy.active,
    ),
  };
}

async function boundedResponseJson(response: Response, maxBytes: number) {
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes)
    throw new Error("live_response_large");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("live_response_invalid");
  }
}

function firstPublicPath(body: Record<string, unknown>) {
  const media = body.publicMedia;
  if (!Array.isArray(media) || media.length !== 1) return null;
  const item = media[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const path = (item as Record<string, unknown>).publicPath;
  return typeof path === "string" &&
    /^derivatives\/[0-9a-f-]+\/1\.webp$/i.test(path)
    ? path
    : null;
}

async function publicObjectExists(publicUrl: string, fetcher: typeof fetch) {
  const response = await fetcher(publicUrl, {
    method: "HEAD",
    cache: "no-store",
    redirect: "error",
  });
  if (response.status === 404) return false;
  if (response.status !== 200) throw new Error("live_public_head_failed");
  return true;
}

function exactHttpsOrigin(value: string | undefined, expected: string) {
  const url = new URL(value ?? expected);
  if (url.origin !== expected || url.href !== `${expected}/`) {
    throw new Error("live_origin_drift");
  }
  return url.origin;
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

function resolveLiveFetcher(): typeof fetch {
  const edgeIp = process.env.OVE346_LIVE_EDGE_IP?.trim();
  if (!edgeIp) return fetch;
  if (!isIP(edgeIp)) throw new Error("live_edge_ip_invalid");
  return ((input: URL | RequestInfo, init?: RequestInit) =>
    pinnedEdgeFetch(edgeIp, input, init)) as typeof fetch;
}

function pinnedEdgeFetch(
  edgeIp: string,
  input: URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
    input instanceof Request ? input.url : input instanceof URL ? input : input,
  );
  if (url.protocol !== "https:") throw new Error("live_url_invalid");
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set("host", url.hostname);
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  const body = init?.body;
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: edgeIp,
        port: 443,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers: Object.fromEntries(headers.entries()),
        timeout: 130_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 503;
          const responseBody =
            status === 204 || status === 304 || method === "HEAD"
              ? null
              : Buffer.concat(chunks);
          resolve(
            new Response(responseBody, {
              status,
              headers: response.headers as HeadersInit,
            }),
          );
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("live_timeout")));
    request.on("error", reject);
    if (typeof body === "string") request.end(body);
    else if (body instanceof ArrayBuffer)
      request.end(Buffer.from(new Uint8Array(body)));
    else if (ArrayBuffer.isView(body))
      request.end(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
    else if (body === null || body === undefined) request.end();
    else request.destroy(new Error("live_body_unsupported"));
  });
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error) => {
    console.error(
      JSON.stringify({
        version: "ove346.liveFailure.v1",
        status: "failed",
        code: error instanceof Error ? error.message : "unknown",
      }),
    );
    process.exitCode = 1;
  });
}
