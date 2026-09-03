import "server-only";

import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "@/lib/bounded-json-response";
import {
  EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS,
  EPHEMERAL_MEDIA_MAX_BYTES,
  EPHEMERAL_MEDIA_MAX_DIMENSION,
  EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO,
  EPHEMERAL_MEDIA_MAX_PER_SESSION,
  EPHEMERAL_MEDIA_MAX_PIXELS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  bytesToBase64Url,
  isCanonicalSha256,
  isEphemeralMediaVariant,
  isPositiveSafeInteger,
  isSafeNonce,
  isSubjectHash,
  isUuid,
  type EphemeralMediaStagingReceiptClaims,
} from "@/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  parseEphemeralMediaSigningPolicy,
  verifyEphemeralMediaToken,
  type EphemeralMediaSigningPolicy,
} from "@/lib/media/ephemeral-staging-crypto";
import {
  claimedMediaFromPhotos,
  type ClaimedEphemeralPublicationMedia,
  type EphemeralPublicationPhoto,
} from "@/lib/media/claimed-media";
import {
  issueEphemeralStagingSessionCapability,
  resolveEphemeralMediaSigningPolicy,
} from "./ephemeral-staging-capability";

export type {
  ClaimedEphemeralPublicationMedia,
  ClaimedEphemeralPublicationVariant,
  EphemeralPublicationPhoto,
} from "@/lib/media/claimed-media";

export class EphemeralPublicationHandoffError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EphemeralPublicationHandoffError";
  }
}

interface PublicationReceiptDependencies {
  receiptPolicy?: EphemeralMediaSigningPolicy;
  ownerHashSecret?: string;
  nowSeconds?: number;
}

interface PublicationHandoffDependencies extends PublicationReceiptDependencies {
  capabilityPolicy?: EphemeralMediaSigningPolicy;
  nonce?: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
}

/**
 * Receipts arrive grouped per photo, each primary followed by its variants,
 * in the order of `orderedMediaAssetIds` when given. A variant without a
 * primary, a duplicate variant, or a variant larger than its primary is a
 * malformed set, never a partial success.
 */
export async function verifyEphemeralPublicationReceipts(
  input: {
    ownerUserId: string;
    stagingSessionId?: string;
    stagingReceipts: readonly string[];
    orderedMediaAssetIds?: readonly string[];
  },
  dependencies: PublicationReceiptDependencies = {},
): Promise<{
  receiptSetDigest: string;
  stagingSessionId: string;
  /** Every receipt in wire order. */
  media: EphemeralMediaStagingReceiptClaims[];
  photos: EphemeralPublicationPhoto[];
}> {
  if (
    (input.stagingSessionId !== undefined && !isUuid(input.stagingSessionId)) ||
    input.stagingReceipts.length < 1 ||
    input.stagingReceipts.length >
      EPHEMERAL_MEDIA_MAX_PER_SESSION * EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO ||
    (input.orderedMediaAssetIds !== undefined &&
      (input.orderedMediaAssetIds.length < 1 ||
        input.orderedMediaAssetIds.length > EPHEMERAL_MEDIA_MAX_PER_SESSION ||
        new Set(input.orderedMediaAssetIds).size !==
          input.orderedMediaAssetIds.length))
  ) {
    throw new EphemeralPublicationHandoffError("receipt_set_invalid");
  }
  const policy = dependencies.receiptPolicy ?? resolveReceiptPolicy();
  const ownerHashSecret =
    dependencies.ownerHashSecret ?? requireOwnerHashSecret();
  const expectedOwnerHash = await deriveEphemeralMediaOwnerSubjectHash(
    ownerHashSecret,
    input.ownerUserId,
  );
  const now = dependencies.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const media: EphemeralMediaStagingReceiptClaims[] = [];
  const photos: EphemeralPublicationPhoto[] = [];
  let stagingSessionId = input.stagingSessionId ?? null;
  for (let index = 0; index < input.stagingReceipts.length; index += 1) {
    const payload = await verifyEphemeralMediaToken(
      input.stagingReceipts[index]!,
      policy,
    );
    if (!isStagingReceipt(payload)) {
      throw new EphemeralPublicationHandoffError("receipt_invalid");
    }
    if (
      payload.ownerSubjectHash !== expectedOwnerHash ||
      (stagingSessionId !== null &&
        payload.stagingSessionId !== stagingSessionId)
    ) {
      throw new EphemeralPublicationHandoffError("receipt_mismatch");
    }
    stagingSessionId ??= payload.stagingSessionId;
    // A receipt's lease is the Durable Object's, renewed by touches while the
    // composer lives (OVE-372); the claim answers `receipt_expired` from the
    // row. Only a receipt from the future is refused here.
    if (payload.stagedAtSeconds > now + 30) {
      throw new EphemeralPublicationHandoffError("receipt_expired");
    }
    media.push(payload);
    const variant = payload.variant ?? 0;
    if (variant === 0) {
      if (
        input.orderedMediaAssetIds !== undefined &&
        payload.mediaAssetId !== input.orderedMediaAssetIds[photos.length]
      ) {
        throw new EphemeralPublicationHandoffError("receipt_mismatch");
      }
      photos.push({ primary: payload, variants: [] });
      continue;
    }
    const photo = photos[photos.length - 1];
    if (
      !photo ||
      photo.primary.mediaAssetId !== payload.mediaAssetId ||
      photo.primary.generation !== payload.generation ||
      photo.variants.some((item) => item.variant === variant) ||
      payload.width > photo.primary.width ||
      payload.height > photo.primary.height ||
      Math.max(payload.width, payload.height) !== variant
    ) {
      throw new EphemeralPublicationHandoffError("receipt_set_invalid");
    }
    photo.variants.push(payload);
  }
  if (
    new Set(photos.map((photo) => photo.primary.mediaAssetId)).size !==
      photos.length ||
    (input.orderedMediaAssetIds !== undefined &&
      photos.length !== input.orderedMediaAssetIds.length)
  ) {
    throw new EphemeralPublicationHandoffError("receipt_set_invalid");
  }
  return {
    receiptSetDigest: await digestReceiptSet(input.stagingReceipts),
    stagingSessionId: stagingSessionId!,
    media,
    photos,
  };
}

export async function claimEphemeralPublicationMedia(
  input: {
    ownerUserId: string;
    publishId: string;
    stagingSessionId?: string;
    stagingReceipts: readonly string[];
    orderedMediaAssetIds: readonly string[];
  },
  dependencies: PublicationHandoffDependencies = {},
): Promise<{
  receiptSetDigest: string;
  stagingSessionId: string;
  publicMedia: ClaimedEphemeralPublicationMedia[];
}> {
  if (!isUuid(input.publishId)) {
    throw new EphemeralPublicationHandoffError("publish_id_invalid");
  }
  const verified = await verifyEphemeralPublicationReceipts(
    input,
    dependencies,
  );
  const issued = await issueEphemeralStagingSessionCapability(
    {
      ownerUserId: input.ownerUserId,
      stagingSessionId: verified.stagingSessionId,
      publishId: input.publishId,
      receiptSetDigest: verified.receiptSetDigest,
      purpose: "claim",
    },
    {
      policy:
        dependencies.capabilityPolicy ?? resolveEphemeralMediaSigningPolicy(),
      ownerHashSecret: dependencies.ownerHashSecret ?? requireOwnerHashSecret(),
      nowSeconds: dependencies.nowSeconds,
      nonce: dependencies.nonce,
    },
  );
  const { response, body } = await deadlineJsonFetch(
    dependencies.fetcher ?? fetch,
    `${resolveBaseUrl(dependencies.baseUrl)}/v1/staging/${verified.stagingSessionId}/claim`,
    {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${issued.capability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publishId: input.publishId,
        stagingReceipts: input.stagingReceipts,
      }),
    },
    64 * 1_024,
    EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS,
  );
  if (!response.ok) {
    throw new EphemeralPublicationHandoffError(responseCode(body));
  }
  const publicMedia = validateClaimResponse(body, {
    publishId: input.publishId,
    photos: verified.photos,
  });
  return {
    receiptSetDigest: verified.receiptSetDigest,
    stagingSessionId: verified.stagingSessionId,
    publicMedia,
  };
}

export async function finalizeEphemeralPublicationMedia(
  input: {
    ownerUserId: string;
    publishId: string;
    stagingSessionId: string;
    receiptSetDigest: string;
  },
  dependencies: PublicationHandoffDependencies = {},
): Promise<void> {
  const issued = await issueEphemeralStagingSessionCapability(
    { ...input, purpose: "finalize" },
    {
      policy:
        dependencies.capabilityPolicy ?? resolveEphemeralMediaSigningPolicy(),
      ownerHashSecret: dependencies.ownerHashSecret ?? requireOwnerHashSecret(),
      nowSeconds: dependencies.nowSeconds,
      nonce: dependencies.nonce,
    },
  );
  const { response, body } = await deadlineJsonFetch(
    dependencies.fetcher ?? fetch,
    `${resolveBaseUrl(dependencies.baseUrl)}/v1/staging/${input.stagingSessionId}/finalize`,
    {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${issued.capability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ publishId: input.publishId }),
    },
    2_048,
    15_000,
  );
  if (!response.ok || !isRecord(body) || body.status !== "finalized") {
    throw new EphemeralPublicationHandoffError(responseCode(body));
  }
}

function validateClaimResponse(
  value: unknown,
  expected: {
    publishId: string;
    photos: readonly EphemeralPublicationPhoto[];
  },
): ClaimedEphemeralPublicationMedia[] {
  const expectedCount = expected.photos.reduce(
    (count, photo) => count + 1 + photo.variants.length,
    0,
  );
  if (
    !isRecord(value) ||
    value.status !== "claimed" ||
    value.publishId !== expected.publishId ||
    !Array.isArray(value.publicMedia) ||
    value.publicMedia.length !== expectedCount
  ) {
    throw new EphemeralPublicationHandoffError("claim_response_invalid");
  }
  const rawByMediaKey = new Map<string, Record<string, unknown>>();
  for (const raw of value.publicMedia) {
    if (!isRecord(raw)) {
      throw new EphemeralPublicationHandoffError("claim_response_invalid");
    }
    const variant = raw.variant ?? 0;
    if (
      typeof raw.mediaAssetId !== "string" ||
      !isEphemeralMediaVariant(variant)
    ) {
      throw new EphemeralPublicationHandoffError("claim_response_invalid");
    }
    const key = `${raw.mediaAssetId}#${variant}`;
    if (rawByMediaKey.has(key)) {
      throw new EphemeralPublicationHandoffError("claim_response_invalid");
    }
    rawByMediaKey.set(key, raw);
  }
  const claimed = claimedMediaFromPhotos(expected.photos);
  for (const [index, photo] of expected.photos.entries()) {
    const media = claimed[index]!;
    assertClaimedObject(
      rawByMediaKey.get(`${photo.primary.mediaAssetId}#0`),
      photo.primary,
      media.publicPath,
    );
    for (const [variantIndex, receipt] of photo.variants.entries()) {
      assertClaimedObject(
        rawByMediaKey.get(`${receipt.mediaAssetId}#${receipt.variant}`),
        receipt,
        (media.variants ?? [])[variantIndex]!.publicPath,
      );
    }
  }
  return claimed;
}

function assertClaimedObject(
  raw: Record<string, unknown> | undefined,
  receipt: EphemeralMediaStagingReceiptClaims,
  expectedPath: string,
) {
  if (
    !raw ||
    raw.mediaAssetId !== receipt.mediaAssetId ||
    raw.generation !== receipt.generation ||
    raw.sha256 !== receipt.sha256 ||
    raw.sizeBytes !== receipt.sizeBytes ||
    raw.width !== receipt.width ||
    raw.height !== receipt.height ||
    raw.publicPath !== expectedPath
  ) {
    throw new EphemeralPublicationHandoffError("claim_response_mismatch");
  }
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
    (item.variant === undefined || isEphemeralMediaVariant(item.variant)) &&
    isCanonicalSha256(item.sha256) &&
    isPositiveSafeInteger(item.sizeBytes) &&
    Number(item.sizeBytes) <= EPHEMERAL_MEDIA_MAX_BYTES &&
    isPositiveSafeInteger(item.width) &&
    isPositiveSafeInteger(item.height) &&
    Number(item.width) <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    Number(item.height) <= EPHEMERAL_MEDIA_MAX_DIMENSION &&
    Number(item.width) * Number(item.height) <= EPHEMERAL_MEDIA_MAX_PIXELS &&
    Number.isSafeInteger(item.stagedAtSeconds) &&
    Number.isSafeInteger(item.leaseExpiresAtSeconds) &&
    isSafeNonce(item.receiptNonce),
  );
}

function resolveReceiptPolicy() {
  return parseEphemeralMediaSigningPolicy({
    secrets: process.env.EPHEMERAL_MEDIA_RECEIPT_SECRETS,
    currentVersion: process.env.EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION,
  });
}

function requireOwnerHashSecret() {
  const value = process.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET;
  if (!value) throw new Error("ephemeral_media_signing_unavailable");
  return value;
}

function resolveBaseUrl(configured?: string) {
  const raw = configured ?? process.env.EPHEMERAL_MEDIA_STAGING_BASE_URL;
  const value = raw?.trim() || "https://media-stage.over.garden";
  const url = new URL(value);
  const exactProduction = url.href === "https://media-stage.over.garden/";
  const local =
    process.env.VERCEL_ENV !== "production" &&
    url.protocol === "http:" &&
    url.hostname === "localhost" &&
    url.pathname === "/" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  if (!exactProduction && !local) {
    throw new EphemeralPublicationHandoffError("staging_base_url_invalid");
  }
  return url.origin;
}

async function digestReceiptSet(receipts: readonly string[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(receipts.join("\0")),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function deadlineJsonFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  maxResponseBytes: number,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const body = await boundedJson(response, maxResponseBytes);
    return { response, body };
  } catch (error) {
    if (error instanceof EphemeralPublicationHandoffError) throw error;
    if (controller.signal.aborted) {
      throw new EphemeralPublicationHandoffError("staging_request_timeout");
    }
    throw new EphemeralPublicationHandoffError("staging_request_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function boundedJson(response: Response, maxBytes: number) {
  try {
    return await readBoundedJsonResponse(response, maxBytes);
  } catch (error) {
    if (
      error instanceof BoundedJsonResponseError &&
      error.code === "too_large"
    ) {
      throw new EphemeralPublicationHandoffError("staging_response_too_large");
    }
    if (!(error instanceof BoundedJsonResponseError)) throw error;
    throw new EphemeralPublicationHandoffError("staging_response_invalid");
  }
}

function responseCode(value: unknown) {
  return isRecord(value) && typeof value.code === "string"
    ? value.code
    : "staging_request_failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
