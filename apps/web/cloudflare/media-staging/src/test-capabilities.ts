import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  bytesToBase64Url,
  type EphemeralMediaSessionCapabilityClaims,
  type EphemeralMediaStagingSessionClaims,
  type EphemeralMediaVariant,
} from "../../../src/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  parseEphemeralMediaSigningPolicy,
  signEphemeralMediaToken,
} from "../../../src/lib/media/ephemeral-staging-crypto";

interface TestCapabilityEnv {
  EPHEMERAL_MEDIA_CAPABILITY_SECRETS: string;
  EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: string;
  EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET: string;
}

/**
 * The per-session upload capability (OVE-372). The per-object fields the old
 * reservation carried are accepted and ignored so existing call sites read
 * the same; an upload is described by its path and headers instead.
 */
export async function issueWorkerStagingSessionForTest(
  env: TestCapabilityEnv,
  input: { ownerUserId: string; stagingSessionId: string },
) {
  const policy = capabilityPolicy(env);
  const now = Math.floor(Date.now() / 1_000);
  const claims: EphemeralMediaStagingSessionClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "staging_session",
    keyVersion: policy.active.version,
    ownerSubjectHash: await deriveEphemeralMediaOwnerSubjectHash(
      env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
      input.ownerUserId,
    ),
    stagingSessionId: input.stagingSessionId,
    issuedAtSeconds: now,
    expiresAtSeconds: now + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce: crypto.randomUUID().replace(/-/g, ""),
  };
  return {
    capability: await signEphemeralMediaToken(
      claims as unknown as Record<string, unknown>,
      policy.active,
    ),
  };
}

export async function issueWorkerUploadCapabilityForTest(
  env: TestCapabilityEnv,
  input: {
    ownerUserId: string;
    stagingSessionId: string;
    mediaAssetId?: string;
    generation?: number;
    variant?: EphemeralMediaVariant;
    sha256?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
  },
) {
  return issueWorkerStagingSessionForTest(env, {
    ownerUserId: input.ownerUserId,
    stagingSessionId: input.stagingSessionId,
  });
}

export async function issueWorkerSessionCapabilityForTest(
  env: TestCapabilityEnv,
  input: {
    ownerUserId: string;
    stagingSessionId: string;
    publishId: string;
    stagingReceipts: string[];
    purpose: "claim" | "finalize";
  },
) {
  const policy = capabilityPolicy(env);
  const now = Math.floor(Date.now() / 1_000);
  const claims: EphemeralMediaSessionCapabilityClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "session_capability",
    keyVersion: policy.active.version,
    purpose: input.purpose,
    ownerSubjectHash: await deriveEphemeralMediaOwnerSubjectHash(
      env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
      input.ownerUserId,
    ),
    stagingSessionId: input.stagingSessionId,
    publishId: input.publishId,
    receiptSetDigest: await receiptSetDigest(input.stagingReceipts),
    issuedAtSeconds: now,
    expiresAtSeconds: now + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nonce: crypto.randomUUID().replace(/-/g, ""),
  };
  return {
    capability: await signEphemeralMediaToken(
      claims as unknown as Record<string, unknown>,
      policy.active,
    ),
    receiptSetDigest: claims.receiptSetDigest,
  };
}

function capabilityPolicy(env: TestCapabilityEnv) {
  return parseEphemeralMediaSigningPolicy({
    secrets: env.EPHEMERAL_MEDIA_CAPABILITY_SECRETS,
    currentVersion: env.EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION,
  });
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
