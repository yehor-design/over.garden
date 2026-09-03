import "server-only";

import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  isBase64UrlSha256,
  isPositiveSafeInteger,
  isSafeNonce,
  isSubjectHash,
  isUuid,
  parseEphemeralMediaReservation,
  type EphemeralMediaCapabilityClaims,
  type EphemeralMediaReservationRequest,
  type EphemeralMediaSessionCapabilityClaims,
} from "@/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  parseEphemeralMediaSigningPolicy,
  signEphemeralMediaToken,
  verifyEphemeralMediaToken,
  type EphemeralMediaSigningPolicy,
} from "@/lib/media/ephemeral-staging-crypto";

export class EphemeralMediaCapabilityError extends Error {
  readonly code = "capability_invalid";

  constructor() {
    super("The ephemeral media capability is invalid.");
    this.name = "EphemeralMediaCapabilityError";
  }
}

export function resolveEphemeralMediaSigningPolicy(
  env: Record<string, string | undefined> = process.env,
): EphemeralMediaSigningPolicy {
  return parseEphemeralMediaSigningPolicy({
    secrets: env.EPHEMERAL_MEDIA_CAPABILITY_SECRETS,
    currentVersion: env.EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION,
  });
}

export async function issueEphemeralStagingCapability(
  input: EphemeralMediaReservationRequest & { ownerUserId: string },
  options: {
    policy?: EphemeralMediaSigningPolicy;
    ownerHashSecret?: string;
    purpose?: "upload" | "delete";
    nowSeconds?: number;
    nonce?: string;
  } = {},
): Promise<{
  capability: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
}> {
  const policy = options.policy ?? resolveEphemeralMediaSigningPolicy();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const nonce = options.nonce ?? crypto.randomUUID().replace(/-/g, "");
  if (
    !validOwnerUserId(input.ownerUserId) ||
    !isPositiveSafeInteger(nowSeconds) ||
    !isSafeNonce(nonce) ||
    !parseEphemeralMediaReservation({
      stagingSessionId: input.stagingSessionId,
      mediaAssetId: input.mediaAssetId,
      generation: input.generation,
      variant: input.variant ?? 0,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    })
  ) {
    throw new Error("ephemeral_media_capability_input_invalid");
  }
  const ownerSubjectHash = await deriveEphemeralMediaOwnerSubjectHash(
    options.ownerHashSecret ?? resolveOwnerHashSecret(),
    input.ownerUserId,
  );
  const claims: EphemeralMediaCapabilityClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "capability",
    keyVersion: policy.active.version,
    purpose: options.purpose ?? "upload",
    ownerSubjectHash,
    stagingSessionId: input.stagingSessionId,
    mediaAssetId: input.mediaAssetId,
    generation: input.generation,
    variant: input.variant ?? 0,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    issuedAtSeconds: nowSeconds,
    expiresAtSeconds: nowSeconds + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce,
  };
  return {
    capability: await signEphemeralMediaToken(
      claims as unknown as Record<string, unknown>,
      policy.active,
    ),
    issuedAtSeconds: claims.issuedAtSeconds,
    expiresAtSeconds: claims.expiresAtSeconds,
  };
}

export async function verifyEphemeralStagingCapability(
  token: string,
  input: {
    policy?: EphemeralMediaSigningPolicy;
    purpose: "upload" | "delete";
    ownerUserId?: string;
    ownerSubjectHash?: string;
    ownerHashSecret?: string;
    nowSeconds?: number;
  },
): Promise<EphemeralMediaCapabilityClaims> {
  const policy = input.policy ?? resolveEphemeralMediaSigningPolicy();
  const payload = await verifyEphemeralMediaToken(token, policy);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    !isCapabilityClaims(payload) ||
    payload.purpose !== input.purpose ||
    Boolean(input.ownerUserId) === Boolean(input.ownerSubjectHash)
  ) {
    throw new EphemeralMediaCapabilityError();
  }
  let expectedOwnerHash = input.ownerSubjectHash;
  if (input.ownerUserId) {
    expectedOwnerHash = await deriveEphemeralMediaOwnerSubjectHash(
      input.ownerHashSecret ?? resolveOwnerHashSecret(),
      input.ownerUserId,
    );
  }
  if (
    (expectedOwnerHash && payload.ownerSubjectHash !== expectedOwnerHash) ||
    payload.issuedAtSeconds > nowSeconds + 30 ||
    payload.expiresAtSeconds < nowSeconds ||
    payload.expiresAtSeconds - payload.issuedAtSeconds !==
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS
  ) {
    throw new EphemeralMediaCapabilityError();
  }
  return payload;
}

export async function issueEphemeralStagingSessionCapability(
  input: {
    ownerUserId: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    purpose: "claim" | "finalize";
  },
  options: {
    policy?: EphemeralMediaSigningPolicy;
    ownerHashSecret?: string;
    nowSeconds?: number;
    nonce?: string;
  } = {},
): Promise<{
  capability: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
}> {
  const policy = options.policy ?? resolveEphemeralMediaSigningPolicy();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const nonce = options.nonce ?? crypto.randomUUID().replace(/-/g, "");
  if (
    !isUuid(input.stagingSessionId) ||
    !isUuid(input.publishId) ||
    !isBase64UrlSha256(input.receiptSetDigest) ||
    !validOwnerUserId(input.ownerUserId) ||
    !isPositiveSafeInteger(nowSeconds) ||
    !isSafeNonce(nonce)
  ) {
    throw new Error("ephemeral_media_session_capability_invalid");
  }
  const ownerSubjectHash = await deriveEphemeralMediaOwnerSubjectHash(
    options.ownerHashSecret ?? resolveOwnerHashSecret(),
    input.ownerUserId,
  );
  const claims: EphemeralMediaSessionCapabilityClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "session_capability",
    keyVersion: policy.active.version,
    purpose: input.purpose,
    ownerSubjectHash,
    stagingSessionId: input.stagingSessionId,
    publishId: input.publishId,
    receiptSetDigest: input.receiptSetDigest,
    issuedAtSeconds: nowSeconds,
    expiresAtSeconds: nowSeconds + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce,
  };
  return {
    capability: await signEphemeralMediaToken(
      claims as unknown as Record<string, unknown>,
      policy.active,
    ),
    issuedAtSeconds: claims.issuedAtSeconds,
    expiresAtSeconds: claims.expiresAtSeconds,
  };
}

export async function verifyEphemeralStagingSessionCapability(
  token: string,
  input: {
    policy?: EphemeralMediaSigningPolicy;
    purpose: "claim" | "finalize";
    ownerUserId?: string;
    ownerSubjectHash?: string;
    ownerHashSecret?: string;
    nowSeconds?: number;
  },
): Promise<EphemeralMediaSessionCapabilityClaims> {
  const policy = input.policy ?? resolveEphemeralMediaSigningPolicy();
  const payload = await verifyEphemeralMediaToken(token, policy);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    !isSessionCapabilityClaims(payload) ||
    payload.purpose !== input.purpose ||
    Boolean(input.ownerUserId) === Boolean(input.ownerSubjectHash)
  ) {
    throw new EphemeralMediaCapabilityError();
  }
  let expectedOwnerHash = input.ownerSubjectHash;
  if (input.ownerUserId) {
    expectedOwnerHash = await deriveEphemeralMediaOwnerSubjectHash(
      input.ownerHashSecret ?? resolveOwnerHashSecret(),
      input.ownerUserId,
    );
  }
  if (
    (expectedOwnerHash && payload.ownerSubjectHash !== expectedOwnerHash) ||
    payload.issuedAtSeconds > nowSeconds + 30 ||
    payload.expiresAtSeconds < nowSeconds ||
    payload.expiresAtSeconds - payload.issuedAtSeconds !==
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS
  ) {
    throw new EphemeralMediaCapabilityError();
  }
  return payload;
}

function isCapabilityClaims(
  value: unknown,
): value is EphemeralMediaCapabilityClaims {
  const candidate = value as Record<string, unknown> | null;
  return Boolean(
    candidate &&
    candidate.protocol === EPHEMERAL_MEDIA_STAGING_PROTOCOL &&
    candidate.kind === "capability" &&
    Number.isSafeInteger(candidate.keyVersion) &&
    ["upload", "delete"].includes(String(candidate.purpose)) &&
    isSubjectHash(candidate.ownerSubjectHash) &&
    parseEphemeralMediaReservation({
      stagingSessionId: candidate.stagingSessionId,
      mediaAssetId: candidate.mediaAssetId,
      generation: candidate.generation,
      sha256: candidate.sha256,
      sizeBytes: candidate.sizeBytes,
      width: candidate.width,
      height: candidate.height,
    }) !== null &&
    isPositiveSafeInteger(candidate.issuedAtSeconds) &&
    isPositiveSafeInteger(candidate.expiresAtSeconds) &&
    isSafeNonce(candidate.nonce),
  );
}

function isSessionCapabilityClaims(
  value: unknown,
): value is EphemeralMediaSessionCapabilityClaims {
  const candidate = value as Record<string, unknown> | null;
  return Boolean(
    candidate &&
    candidate.protocol === EPHEMERAL_MEDIA_STAGING_PROTOCOL &&
    candidate.kind === "session_capability" &&
    Number.isSafeInteger(candidate.keyVersion) &&
    ["claim", "finalize"].includes(String(candidate.purpose)) &&
    isSubjectHash(candidate.ownerSubjectHash) &&
    isUuid(candidate.stagingSessionId) &&
    isUuid(candidate.publishId) &&
    isBase64UrlSha256(candidate.receiptSetDigest) &&
    isPositiveSafeInteger(candidate.issuedAtSeconds) &&
    isPositiveSafeInteger(candidate.expiresAtSeconds) &&
    isSafeNonce(candidate.nonce),
  );
}

function resolveOwnerHashSecret(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET;
  if (!value) throw new Error("ephemeral_media_signing_unavailable");
  return value;
}

function validOwnerUserId(value: string) {
  return value.length > 0 && value.length <= 256;
}
