import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS,
  EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
  EPHEMERAL_MEDIA_MAX_BYTES,
  EPHEMERAL_MEDIA_MAX_DIMENSION,
  EPHEMERAL_MEDIA_MAX_PER_SESSION,
  EPHEMERAL_MEDIA_MAX_PIXELS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS,
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  isBase64UrlSha256,
  isCanonicalSha256,
  isPositiveSafeInteger,
  isSafeNonce,
  isSubjectHash,
  isUuid,
  type EphemeralMediaCapabilityClaims,
  type EphemeralMediaSessionCapabilityClaims,
  type EphemeralMediaStagingReceiptClaims,
} from "../../../src/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaPublicOwnershipProof,
  parseEphemeralMediaSigningPolicy,
  requireStrongSecret,
  signEphemeralMediaToken,
  signEphemeralMediaText,
  verifyEphemeralMediaToken,
  type EphemeralMediaSigningPolicy,
} from "../../../src/lib/media/ephemeral-staging-crypto";
import {
  MediaStagingSession,
  type ClaimItemInput,
  type MediaStagingEnv,
} from "./staging-session";
import { corsHeaders, parseWorkerRoute, type WorkerRoute } from "./http-policy";

export { MediaStagingSession };
export { corsHeaders, parseWorkerRoute } from "./http-policy";

export interface Env extends MediaStagingEnv {
  MEDIA_STAGING_SESSIONS: DurableObjectNamespace<MediaStagingSession>;
  MEDIA_STAGING_UPLOAD_RATE_LIMIT: RateLimit;
  EPHEMERAL_MEDIA_CAPABILITY_SECRETS: string;
  EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: string;
  EPHEMERAL_MEDIA_RECEIPT_SECRETS: string;
  EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION: string;
  EPHEMERAL_MEDIA_PUBLIC_BASE_URL: string;
  EPHEMERAL_MEDIA_PROTOCOL_VERSION: string;
  WORKER_VERSION?: WorkerVersionMetadata;
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") return preflight(request, origin);
    const route = parseWorkerRoute(
      new URL(request.url).pathname,
      request.method,
    );
    if (!route)
      return closedResponse(
        { code: "route_not_found" },
        404,
        origin,
        request.method,
      );
    if (origin && !corsHeaders(origin, request.method)) {
      return closedResponse(
        { code: "origin_not_allowed" },
        403,
        null,
        request.method,
      );
    }
    const configured = configurationReady(env);
    if (route.operation === "status") {
      return closedResponse(
        {
          status: configured ? "ready" : "degraded",
          protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
          configuredProtocol: env.EPHEMERAL_MEDIA_PROTOCOL_VERSION,
          versionId: env.WORKER_VERSION?.id ?? null,
        },
        configured ? 200 : 503,
        origin,
        request.method,
      );
    }
    if (!configured) {
      return closedResponse(
        { code: "staging_configuration_unavailable" },
        503,
        origin,
        request.method,
      );
    }
    try {
      switch (route.operation) {
        case "upload":
          return await handleUpload(request, env, ctx, route, origin);
        case "delete":
          return await handleDelete(request, env, route, origin);
        case "claim":
          return await handleClaim(request, env, route, origin);
        case "finalize":
          return await handleFinalize(request, env, route, origin);
      }
    } catch (error) {
      const classified = classifyWorkerError(error);
      return closedResponse(
        { code: classified.code },
        classified.status,
        origin,
        request.method,
      );
    }
  },
};

export default worker;

async function handleUpload(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  route: Extract<WorkerRoute, { operation: "upload" }>,
  origin: string | null,
) {
  const token = bearerToken(request);
  const policy = capabilityPolicy(env);
  const claims = await verifyMediaCapability(token, policy, "upload");
  assertMediaRoute(claims, route);
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "image/webp"
  ) {
    throw workerError("content_type_invalid", 415);
  }
  if (request.headers.has("content-encoding"))
    throw workerError("content_encoding_invalid", 400);
  const contentLength = parseContentLength(
    request.headers.get("content-length"),
  );
  const declaredSha256 = request.headers.get("content-sha256");
  if (
    contentLength !== claims.sizeBytes ||
    declaredSha256 !== claims.sha256 ||
    contentLength > EPHEMERAL_MEDIA_MAX_BYTES ||
    !request.body
  ) {
    throw workerError("upload_declaration_mismatch", 400);
  }
  const uploadControlDeadlineAtMs = controlDeadlineAt();
  const edgeAdmission = await bounded(
    env.MEDIA_STAGING_UPLOAD_RATE_LIMIT.limit({
      key: claims.ownerSubjectHash,
    }),
    remainingDeadlineMs(
      uploadControlDeadlineAtMs,
      "owner_admission_unavailable",
    ),
    "owner_admission_unavailable",
  );
  if (!edgeAdmission.success) throw workerError("owner_rate_limit", 429);
  const ownerAdmission = await bounded(
    ownerAdmissionStub(env, claims.ownerSubjectHash).admitOwnerUpload({
      ownerSubjectHash: claims.ownerSubjectHash,
      stagingSessionId: claims.stagingSessionId,
      nowMs: Date.now(),
      deadlineAtMs: uploadControlDeadlineAtMs,
    }),
    remainingDeadlineMs(
      uploadControlDeadlineAtMs,
      "owner_admission_unavailable",
    ),
    "owner_admission_unavailable",
  );
  if (ownerAdmission.status === "rejected") {
    if (
      ownerAdmission.code === "owner_rate_limit" ||
      ownerAdmission.code === "owner_session_limit"
    ) {
      throw workerError(ownerAdmission.code, 429);
    }
    throw workerError("owner_admission_unavailable", 503);
  }
  const storageDigest = await signEphemeralMediaText(
    env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
    "staging-object",
    [
      claims.ownerSubjectHash,
      claims.stagingSessionId,
      claims.mediaAssetId,
      String(claims.generation),
      claims.sha256,
    ].join("\0"),
  );
  const storageKey = `staging/${storageDigest}.webp`;
  const stub = sessionStub(env, claims.stagingSessionId);
  const nowMs = Date.now();
  const begin = await bounded(
    stub.beginUpload({
      ownerSubjectHash: claims.ownerSubjectHash,
      stagingSessionId: claims.stagingSessionId,
      mediaAssetId: claims.mediaAssetId,
      generation: claims.generation,
      sha256: claims.sha256,
      sizeBytes: claims.sizeBytes,
      width: claims.width,
      height: claims.height,
      nonce: claims.nonce,
      storageKey,
      nowMs,
      deadlineAtMs: uploadControlDeadlineAtMs,
    }),
    remainingDeadlineMs(uploadControlDeadlineAtMs, "coordinator_timeout"),
    "coordinator_timeout",
  );
  if (begin.status === "rejected")
    throw workerError(begin.code, conflictStatus(begin.code));
  if (begin.status === "replay") {
    return closedResponse(stagedResponse(begin), 200, origin, request.method);
  }
  const uploadDeadlineAtMs = Date.now() + EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS;
  if (begin.supersededStorageKeys.length > 0) {
    await bounded(
      env.MEDIA_STAGING_BUCKET.delete(begin.supersededStorageKeys),
      remainingDeadlineMs(uploadDeadlineAtMs, "replacement_cleanup_timeout"),
      "replacement_cleanup_timeout",
    );
    const cleanup = await bounded(
      stub.completeSupersededDeletes({
        ownerSubjectHash: claims.ownerSubjectHash,
        stagingSessionId: claims.stagingSessionId,
        storageKeys: begin.supersededStorageKeys,
        deadlineAtMs: uploadDeadlineAtMs,
      }),
      remainingDeadlineMs(uploadDeadlineAtMs, "coordinator_timeout"),
      "coordinator_timeout",
    );
    if (cleanup.status !== "deleted") {
      throw workerError(cleanup.code, 503);
    }
  }
  let stored: R2Object | null = null;
  if (begin.status === "recover") {
    stored = await bounded(
      env.MEDIA_STAGING_BUCKET.head(begin.storageKey),
      remainingDeadlineMs(uploadDeadlineAtMs, "upload_timeout"),
      "upload_timeout",
    );
    if (!matchesStoredObject(stored, claims)) stored = null;
  }
  if (!stored) {
    try {
      stored = await bounded(
        env.MEDIA_STAGING_BUCKET.put(begin.storageKey, request.body, {
          onlyIf: { etagDoesNotMatch: "*" },
          sha256: ownedArrayBuffer(base64ToBytes(claims.sha256)),
          httpMetadata: {
            contentType: "image/webp",
            cacheControl: "private, no-store",
          },
          customMetadata: {
            protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
            sha256: claims.sha256,
            generation: String(claims.generation),
          },
        }),
        remainingDeadlineMs(uploadDeadlineAtMs, "upload_timeout"),
        "upload_timeout",
      );
      if (!stored)
        stored = await bounded(
          env.MEDIA_STAGING_BUCKET.head(begin.storageKey),
          remainingDeadlineMs(uploadDeadlineAtMs, "upload_timeout"),
          "upload_timeout",
        );
    } catch (error) {
      ctx.waitUntil(
        stub
          .abortUpload({
            mediaAssetId: claims.mediaAssetId,
            generation: claims.generation,
            attempt: begin.attempt,
            deadlineAtMs: controlDeadlineAt(),
          })
          .then(
            () => undefined,
            () => undefined,
          ),
      );
      if (isClassifiedWorkerError(error)) throw error;
      throw workerError(classifyR2PutError(error), 422);
    }
  }
  if (!matchesStoredObject(stored, claims)) {
    await env.MEDIA_STAGING_BUCKET.delete(begin.storageKey);
    await stub.abortUpload({
      mediaAssetId: claims.mediaAssetId,
      generation: claims.generation,
      attempt: begin.attempt,
      deadlineAtMs: controlDeadlineAt(),
    });
    throw workerError("checksum_mismatch", 422);
  }
  const stagedAtSeconds = Math.floor(Date.now() / 1_000);
  const leaseExpiresAtSeconds =
    stagedAtSeconds + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS;
  const receiptPolicy = receiptSigningPolicy(env);
  const receiptClaims: EphemeralMediaStagingReceiptClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "staging_receipt",
    keyVersion: receiptPolicy.active.version,
    ownerSubjectHash: claims.ownerSubjectHash,
    stagingSessionId: claims.stagingSessionId,
    mediaAssetId: claims.mediaAssetId,
    generation: claims.generation,
    sha256: claims.sha256,
    sizeBytes: claims.sizeBytes,
    width: claims.width,
    height: claims.height,
    stagedAtSeconds,
    leaseExpiresAtSeconds,
    receiptNonce: crypto.randomUUID().replace(/-/g, ""),
  };
  const stagingReceipt = await signEphemeralMediaToken(
    receiptClaims as unknown as Record<string, unknown>,
    receiptPolicy.active,
  );
  const deleteClaims: EphemeralMediaCapabilityClaims = {
    ...claims,
    keyVersion: policy.active.version,
    purpose: "delete",
    issuedAtSeconds: stagedAtSeconds,
    expiresAtSeconds: leaseExpiresAtSeconds,
    nonce: crypto.randomUUID().replace(/-/g, ""),
  };
  const deleteCapability = await signEphemeralMediaToken(
    deleteClaims as unknown as Record<string, unknown>,
    policy.active,
  );
  const complete = await bounded(
    stub.completeUpload({
      mediaAssetId: claims.mediaAssetId,
      generation: claims.generation,
      attempt: begin.attempt,
      stagingReceipt,
      deleteCapability,
      leaseExpiresAtMs: leaseExpiresAtSeconds * 1_000,
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (complete.status === "rejected") throw workerError(complete.code, 409);
  const responseReceipt =
    complete.status === "replay"
      ? stagedResponse(complete)
      : stagedResponse({
          stagingReceipt,
          deleteCapability,
          leaseExpiresAtMs: leaseExpiresAtSeconds * 1_000,
        });
  return closedResponse(
    responseReceipt,
    begin.status === "recover" || complete.status === "replay" ? 200 : 201,
    origin,
    request.method,
    stored!.httpEtag,
  );
}

async function handleDelete(
  request: Request,
  env: Env,
  route: Extract<WorkerRoute, { operation: "delete" }>,
  origin: string | null,
) {
  const claims = await verifyMediaCapability(
    bearerToken(request),
    capabilityPolicy(env),
    "delete",
  );
  assertMediaRoute(claims, route);
  const stub = sessionStub(env, claims.stagingSessionId);
  const begin = await bounded(
    stub.beginDelete({
      ownerSubjectHash: claims.ownerSubjectHash,
      stagingSessionId: claims.stagingSessionId,
      mediaAssetId: claims.mediaAssetId,
      generation: claims.generation,
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (begin.status === "rejected") throw workerError(begin.code, 409);
  if (begin.status === "delete") {
    const stagingKeys = [
      ...new Set([
        ...(begin.stagingKey ? [begin.stagingKey] : []),
        ...begin.pendingStagingKeys,
      ]),
    ];
    await bounded(
      stagingKeys.length > 0
        ? env.MEDIA_STAGING_BUCKET.delete(stagingKeys)
        : Promise.resolve(),
      EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
      "delete_timeout",
    );
    const complete = await bounded(
      stub.completeDelete({
        mediaAssetId: claims.mediaAssetId,
        generation: claims.generation,
        deadlineAtMs: controlDeadlineAt(),
      }),
      EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
      "coordinator_timeout",
    );
    if (complete.status !== "deleted") throw workerError(complete.code, 503);
  }
  return closedResponse({ status: "deleted" }, 200, origin, request.method);
}

async function handleClaim(
  request: Request,
  env: Env,
  route: Extract<WorkerRoute, { operation: "claim" }>,
  origin: string | null,
) {
  const policy = capabilityPolicy(env);
  const capability = await verifySessionCapability(
    bearerToken(request),
    policy,
    "claim",
  );
  if (capability.stagingSessionId !== route.stagingSessionId) {
    throw workerError("capability_invalid", 401);
  }
  const body = await readBoundedJson(request, 64 * 1_024);
  const parsed = parseClaimBody(body);
  if (!parsed) throw workerError("claim_invalid", 400);
  if (
    capability.publishId !== parsed.publishId ||
    capability.receiptSetDigest !==
      (await receiptSetDigest(parsed.stagingReceipts))
  ) {
    throw workerError("capability_invalid", 401);
  }
  const receiptPolicy = receiptSigningPolicy(env);
  const receipts: EphemeralMediaStagingReceiptClaims[] = [];
  for (const token of parsed.stagingReceipts) {
    const receipt = await verifyStagingReceipt(token, receiptPolicy);
    if (
      receipt.ownerSubjectHash !== capability.ownerSubjectHash ||
      receipt.stagingSessionId !== route.stagingSessionId
    ) {
      throw workerError("receipt_mismatch", 409);
    }
    receipts.push(receipt);
  }
  const items: ClaimItemInput[] = await Promise.all(
    receipts.map(async (receipt, index) => ({
      mediaAssetId: receipt.mediaAssetId,
      generation: receipt.generation,
      sha256: receipt.sha256,
      sizeBytes: receipt.sizeBytes,
      stagingReceipt: parsed.stagingReceipts[index]!,
      publicKey: `derivatives/${receipt.mediaAssetId}/${receipt.generation}.webp`,
      publicOwnershipProof: await deriveEphemeralMediaPublicOwnershipProof(
        env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
        receipt,
      ),
    })),
  );
  const stub = sessionStub(env, route.stagingSessionId);
  const claimDeadlineAtMs = Date.now() + EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS;
  const begin = await bounded(
    stub.beginClaim({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId: parsed.publishId,
      nowMs: Date.now(),
      deadlineAtMs: controlDeadlineAt(),
      receiptSetDigest: capability.receiptSetDigest,
      items,
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (begin.status === "rejected") throw workerError(begin.code, 409);
  for (const item of begin.items) {
    const ownershipProof = item.publicOwnershipProof;
    if (!isBase64UrlSha256(ownershipProof)) {
      throw workerError("public_ownership_proof_unavailable", 409);
    }
    if (item.publicReady === 1) continue;
    const source = await bounded(
      env.MEDIA_STAGING_BUCKET.get(item.stagingKey),
      remainingDeadlineMs(claimDeadlineAtMs, "claim_timeout"),
      "claim_timeout",
    );
    if (
      !source ||
      source.size !== item.sizeBytes ||
      source.customMetadata?.sha256 !== item.sha256
    ) {
      throw workerError("staging_object_unavailable", 503);
    }
    let promoted: R2Object | null = await bounded(
      env.PUBLIC_MEDIA_BUCKET.put(item.publicKey, source.body, {
        onlyIf: { etagDoesNotMatch: "*" },
        sha256: ownedArrayBuffer(base64ToBytes(item.sha256)),
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "private, no-store",
        },
        customMetadata: {
          protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
          sha256: item.sha256,
          publicationState: "claimed",
          ownershipProof,
        },
      }),
      remainingDeadlineMs(claimDeadlineAtMs, "claim_timeout"),
      "claim_timeout",
    );
    if (!promoted)
      promoted = await bounded(
        env.PUBLIC_MEDIA_BUCKET.head(item.publicKey),
        remainingDeadlineMs(claimDeadlineAtMs, "claim_timeout"),
        "claim_timeout",
      );
    if (
      !promoted ||
      promoted.size !== item.sizeBytes ||
      promoted.customMetadata?.sha256 !== item.sha256 ||
      promoted.customMetadata?.ownershipProof !== ownershipProof ||
      !["claimed", "committed"].includes(
        promoted.customMetadata?.publicationState ?? "",
      )
    ) {
      throw workerError("public_object_collision", 409);
    }
    const completed = await bounded(
      stub.completeClaim({
        mediaAssetId: item.mediaAssetId,
        generation: item.generation,
        deadlineAtMs: Math.min(controlDeadlineAt(), claimDeadlineAtMs),
      }),
      Math.min(
        EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
        remainingDeadlineMs(claimDeadlineAtMs, "claim_timeout"),
      ),
      "coordinator_timeout",
    );
    if (completed.status !== "claimed") throw workerError(completed.code, 409);
  }
  const claimedByMediaAssetId = new Map(
    begin.items.map((item) => [item.mediaAssetId, item] as const),
  );
  const orderedClaimedItems = items.map((requested) => {
    const claimed = claimedByMediaAssetId.get(requested.mediaAssetId);
    if (!claimed || claimed.generation !== requested.generation) {
      throw workerError("claim_response_mismatch", 409);
    }
    return claimed;
  });
  return closedResponse(
    {
      status: "claimed",
      publishId: parsed.publishId,
      publicMedia: orderedClaimedItems.map((item) => ({
        mediaAssetId: item.mediaAssetId,
        generation: item.generation,
        sha256: item.sha256,
        sizeBytes: item.sizeBytes,
        width: item.width,
        height: item.height,
        publicPath: item.publicKey,
      })),
    },
    200,
    origin,
    request.method,
  );
}

async function handleFinalize(
  request: Request,
  env: Env,
  route: Extract<WorkerRoute, { operation: "finalize" }>,
  origin: string | null,
) {
  const capability = await verifySessionCapability(
    bearerToken(request),
    capabilityPolicy(env),
    "finalize",
  );
  if (capability.stagingSessionId !== route.stagingSessionId) {
    throw workerError("capability_invalid", 401);
  }
  const body = await readBoundedJson(request, 2_048);
  const publishId =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    isUuid((body as Record<string, unknown>).publishId)
      ? String((body as Record<string, unknown>).publishId)
      : null;
  if (
    !publishId ||
    Object.keys(body as Record<string, unknown>).some(
      (key) => key !== "publishId",
    )
  ) {
    throw workerError("finalize_invalid", 400);
  }
  if (capability.publishId !== publishId) {
    throw workerError("capability_invalid", 401);
  }
  const stub = sessionStub(env, route.stagingSessionId);
  const begin = await bounded(
    stub.beginFinalize({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId,
      receiptSetDigest: capability.receiptSetDigest,
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (begin.status === "rejected") throw workerError(begin.code, 409);
  if (begin.status === "finalized") {
    return closedResponse({ status: "finalized" }, 200, origin, request.method);
  }
  const commitStatus = await bounded(
    stub.commitStatus({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId,
      receiptSetDigest: capability.receiptSetDigest,
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "commit_status_timeout",
  );
  if (commitStatus !== "committed") {
    throw workerError(
      commitStatus === "absent"
        ? "commit_absent"
        : "commit_status_indeterminate",
      commitStatus === "absent" ? 409 : 503,
    );
  }
  const locked = await bounded(
    stub.lockFinalize({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId,
      receiptSetDigest: capability.receiptSetDigest,
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (locked.status === "rejected") throw workerError(locked.code, 409);
  if (locked.status === "finalized") {
    return closedResponse({ status: "finalized" }, 200, origin, request.method);
  }
  const prepared = await bounded(
    stub.prepareFinalize({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId,
      receiptSetDigest: capability.receiptSetDigest,
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "finalize_timeout",
  );
  if (prepared.status !== "prepared") {
    throw workerError(prepared.code, 503);
  }
  if (locked.stagingKeys.length > 0) {
    await bounded(
      env.MEDIA_STAGING_BUCKET.delete(locked.stagingKeys),
      EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
      "delete_timeout",
    );
  }
  const complete = await bounded(
    stub.completeFinalize({
      ownerSubjectHash: capability.ownerSubjectHash,
      stagingSessionId: route.stagingSessionId,
      publishId,
      receiptSetDigest: capability.receiptSetDigest,
      nowMs: Date.now(),
      deadlineAtMs: controlDeadlineAt(),
    }),
    EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS,
    "coordinator_timeout",
  );
  if (complete.status !== "finalized") throw workerError(complete.code, 409);
  return closedResponse({ status: "finalized" }, 200, origin, request.method);
}

function preflight(request: Request, origin: string | null) {
  const requestedMethod =
    request.headers.get("access-control-request-method") ?? "OPTIONS";
  if (!origin || !corsHeaders(origin, requestedMethod)) {
    return closedResponse({ code: "origin_not_allowed" }, 403, null, "OPTIONS");
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, requestedMethod)!,
  });
}

function closedResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  method: string,
  etag?: string,
) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  if (etag) headers.set("etag", etag);
  if (origin) {
    const cors = corsHeaders(origin, method);
    if (cors)
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function stagedResponse(input: {
  stagingReceipt: string;
  deleteCapability: string;
  leaseExpiresAtMs: number;
}) {
  return {
    status: "staged",
    stagingReceipt: input.stagingReceipt,
    deleteCapability: input.deleteCapability,
    leaseExpiresAt: new Date(input.leaseExpiresAtMs).toISOString(),
  };
}

function capabilityPolicy(env: Env) {
  return parseEphemeralMediaSigningPolicy({
    secrets: env.EPHEMERAL_MEDIA_CAPABILITY_SECRETS,
    currentVersion: env.EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION,
  });
}

function receiptSigningPolicy(env: Env) {
  return parseEphemeralMediaSigningPolicy({
    secrets: env.EPHEMERAL_MEDIA_RECEIPT_SECRETS,
    currentVersion: env.EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION,
  });
}

async function verifyMediaCapability(
  token: string,
  policy: EphemeralMediaSigningPolicy,
  purpose: "upload" | "delete",
): Promise<EphemeralMediaCapabilityClaims> {
  const value = await verifyEphemeralMediaToken(token, policy);
  const now = Math.floor(Date.now() / 1_000);
  if (
    !isMediaCapability(value) ||
    value.purpose !== purpose ||
    value.issuedAtSeconds > now + 30 ||
    value.expiresAtSeconds < now ||
    value.expiresAtSeconds - value.issuedAtSeconds !==
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS
  )
    throw workerError("capability_invalid", 401);
  return value;
}

async function verifySessionCapability(
  token: string,
  policy: EphemeralMediaSigningPolicy,
  purpose: "claim" | "finalize",
): Promise<EphemeralMediaSessionCapabilityClaims> {
  const value = await verifyEphemeralMediaToken(token, policy);
  const now = Math.floor(Date.now() / 1_000);
  if (
    !isSessionCapability(value) ||
    value.purpose !== purpose ||
    value.issuedAtSeconds > now + 30 ||
    value.expiresAtSeconds < now ||
    value.expiresAtSeconds - value.issuedAtSeconds !==
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS
  )
    throw workerError("capability_invalid", 401);
  return value;
}

async function verifyStagingReceipt(
  token: string,
  policy: EphemeralMediaSigningPolicy,
): Promise<EphemeralMediaStagingReceiptClaims> {
  const value = await verifyEphemeralMediaToken(token, policy);
  const now = Math.floor(Date.now() / 1_000);
  if (
    !isStagingReceipt(value) ||
    value.stagedAtSeconds > now + 30 ||
    value.leaseExpiresAtSeconds < now ||
    value.leaseExpiresAtSeconds - value.stagedAtSeconds !==
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS
  ) {
    throw workerError("receipt_invalid", 409);
  }
  return value;
}

function isMediaCapability(
  value: unknown,
): value is EphemeralMediaCapabilityClaims {
  const item = value as Record<string, unknown> | null;
  return Boolean(
    item &&
    item.protocol === EPHEMERAL_MEDIA_STAGING_PROTOCOL &&
    item.kind === "capability" &&
    Number.isSafeInteger(item.keyVersion) &&
    ["upload", "delete"].includes(String(item.purpose)) &&
    isSubjectHash(item.ownerSubjectHash) &&
    isUuid(item.stagingSessionId) &&
    isUuid(item.mediaAssetId) &&
    isPositiveSafeInteger(item.generation) &&
    isCanonicalSha256(item.sha256) &&
    isPositiveSafeInteger(item.sizeBytes) &&
    item.sizeBytes <= EPHEMERAL_MEDIA_MAX_BYTES &&
    isPositiveSafeInteger(item.width) &&
    isPositiveSafeInteger(item.height) &&
    item.width <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    item.height <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    item.width * item.height <= EPHEMERAL_MEDIA_MAX_PIXELS &&
    Number.isSafeInteger(item.issuedAtSeconds) &&
    Number.isSafeInteger(item.expiresAtSeconds) &&
    isSafeNonce(item.nonce),
  );
}

function isSessionCapability(
  value: unknown,
): value is EphemeralMediaSessionCapabilityClaims {
  const item = value as Record<string, unknown> | null;
  return Boolean(
    item &&
    item.protocol === EPHEMERAL_MEDIA_STAGING_PROTOCOL &&
    item.kind === "session_capability" &&
    Number.isSafeInteger(item.keyVersion) &&
    ["claim", "finalize"].includes(String(item.purpose)) &&
    isSubjectHash(item.ownerSubjectHash) &&
    isUuid(item.stagingSessionId) &&
    isUuid(item.publishId) &&
    isBase64UrlSha256(item.receiptSetDigest) &&
    Number.isSafeInteger(item.issuedAtSeconds) &&
    Number.isSafeInteger(item.expiresAtSeconds) &&
    isSafeNonce(item.nonce),
  );
}

function isStagingReceipt(
  value: unknown,
): value is EphemeralMediaStagingReceiptClaims {
  const item = value as Record<string, unknown> | null;
  return Boolean(
    item &&
    item.protocol === EPHEMERAL_MEDIA_STAGING_PROTOCOL &&
    item.kind === "staging_receipt" &&
    Number.isSafeInteger(item.keyVersion) &&
    isSubjectHash(item.ownerSubjectHash) &&
    isUuid(item.stagingSessionId) &&
    isUuid(item.mediaAssetId) &&
    isPositiveSafeInteger(item.generation) &&
    isCanonicalSha256(item.sha256) &&
    isPositiveSafeInteger(item.sizeBytes) &&
    item.sizeBytes <= EPHEMERAL_MEDIA_MAX_BYTES &&
    isPositiveSafeInteger(item.width) &&
    isPositiveSafeInteger(item.height) &&
    item.width <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    item.height <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    item.width * item.height <= EPHEMERAL_MEDIA_MAX_PIXELS &&
    Number.isSafeInteger(item.stagedAtSeconds) &&
    Number.isSafeInteger(item.leaseExpiresAtSeconds) &&
    isSafeNonce(item.receiptNonce),
  );
}

function assertMediaRoute(
  claims: EphemeralMediaCapabilityClaims,
  route: Extract<WorkerRoute, { operation: "upload" | "delete" }>,
) {
  if (
    claims.stagingSessionId !== route.stagingSessionId ||
    claims.mediaAssetId !== route.mediaAssetId ||
    claims.generation !== route.generation
  )
    throw workerError("capability_invalid", 401);
}

function matchesStoredObject(
  stored: R2Object | null,
  claims: Pick<
    EphemeralMediaCapabilityClaims,
    "sizeBytes" | "sha256" | "generation"
  >,
) {
  return Boolean(
    stored &&
    stored.size === claims.sizeBytes &&
    stored.customMetadata?.sha256 === claims.sha256 &&
    stored.customMetadata?.generation === String(claims.generation) &&
    (!stored.checksums.sha256 ||
      bytesToBase64(new Uint8Array(stored.checksums.sha256)) === claims.sha256),
  );
}

function sessionStub(env: Env, stagingSessionId: string) {
  return env.MEDIA_STAGING_SESSIONS.getByName(stagingSessionId, {
    locationHint: "weur",
  }) as unknown as MediaStagingSession;
}

function ownerAdmissionStub(env: Env, ownerSubjectHash: string) {
  return env.MEDIA_STAGING_SESSIONS.getByName(
    `owner-admission-v1:${ownerSubjectHash}`,
    { locationHint: "weur" },
  ) as unknown as MediaStagingSession;
}

function bearerToken(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_.-]{40,4096})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw workerError("capability_invalid", 401);
  return match[1]!;
}

function parseContentLength(value: string | null) {
  if (!value || !/^(?:[1-9]\d*)$/.test(value))
    throw workerError("content_length_invalid", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw workerError("content_length_invalid", 400);
  return parsed;
}

async function readBoundedJson(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    throw workerError("request_invalid", 400);
  }
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw workerError("request_too_large", 413);
  if (!request.body) throw workerError("request_invalid", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw workerError("request_too_large", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (isClassifiedWorkerError(error)) throw error;
    throw workerError("request_invalid", 400);
  } finally {
    reader.releaseLock();
  }
}

function parseClaimBody(
  value: unknown,
): { publishId: string; stagingReceipts: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).some(
      (key) => !["publishId", "stagingReceipts"].includes(key),
    )
  )
    return null;
  if (
    !isUuid(item.publishId) ||
    !Array.isArray(item.stagingReceipts) ||
    item.stagingReceipts.length < 1 ||
    item.stagingReceipts.length > EPHEMERAL_MEDIA_MAX_PER_SESSION ||
    item.stagingReceipts.some(
      (receipt) =>
        typeof receipt !== "string" ||
        receipt.length < 40 ||
        receipt.length > 4_096,
    )
  )
    return null;
  return {
    publishId: item.publishId,
    stagingReceipts: item.stagingReceipts as string[],
  };
}

async function receiptSetDigest(receipts: readonly string[]) {
  return bytesToBase64Url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(receipts.join("\0")),
      ),
    ),
  );
}

function classifyR2PutError(error: unknown) {
  const value = error as { name?: string; message?: string };
  return /digest|checksum|bad.?digest/i.test(
    `${value?.name ?? ""} ${value?.message ?? ""}`,
  )
    ? "checksum_mismatch"
    : "storage_unavailable";
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function conflictStatus(code: string) {
  return code === "session_media_limit" ? 409 : 409;
}

async function bounded<T>(
  promise: Promise<T>,
  deadlineMs: number,
  code: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(workerError(code, 503)), deadlineMs);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function workerError(code: string, status: number) {
  return Object.assign(new Error("ephemeral_media_worker_error"), {
    code,
    status,
  });
}

function classifyWorkerError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error
  ) {
    return {
      code: String((error as { code: unknown }).code),
      status: Number((error as { status: unknown }).status),
    };
  }
  return { code: "staging_unavailable", status: 503 };
}

function controlDeadlineAt() {
  return Date.now() + EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS;
}

function remainingDeadlineMs(deadlineAtMs: number, code: string) {
  const remaining = deadlineAtMs - Date.now();
  if (remaining <= 0) throw workerError(code, 503);
  return remaining;
}

function isClassifiedWorkerError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && "status" in error,
  );
}

function configurationReady(env: Env) {
  try {
    if (
      env.EPHEMERAL_MEDIA_PROTOCOL_VERSION !== EPHEMERAL_MEDIA_STAGING_PROTOCOL
    )
      return false;
    capabilityPolicy(env);
    receiptSigningPolicy(env);
    requireStrongSecret(env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET);
    const commitStatusUrl = new URL(env.EPHEMERAL_MEDIA_COMMIT_STATUS_URL);
    const publicBaseUrl = new URL(env.EPHEMERAL_MEDIA_PUBLIC_BASE_URL);
    return (
      commitStatusUrl.href ===
        "https://over.garden/api/media/staging/commit-status" &&
      publicBaseUrl.href === "https://media.over.garden/" &&
      typeof env.MEDIA_STAGING_UPLOAD_RATE_LIMIT?.limit === "function"
    );
  } catch {
    return false;
  }
}
