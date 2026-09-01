import { describe, expect, it } from "vitest";

import {
  issueEphemeralStagingCapability,
  issueEphemeralStagingSessionCapability,
  resolveEphemeralMediaSigningPolicy,
  verifyEphemeralStagingCapability,
  verifyEphemeralStagingSessionCapability,
} from "./ephemeral-staging-capability";

const SECRET = Buffer.alloc(32, 7).toString("base64url");
const ROTATED_SECRET = Buffer.alloc(32, 8).toString("base64url");
const OWNER_HASH_SECRET = Buffer.alloc(32, 9).toString("base64url");
const NOW = 1_787_477_600;
const FIXTURE = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  stagingSessionId: "00000000-0000-4000-8000-000000000002",
  mediaAssetId: "00000000-0000-4000-8000-000000000003",
  generation: 2,
  sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  sizeBytes: 123,
  width: 800,
  height: 600,
} as const;

describe("ephemeral staging capability", () => {
  it("issues one owner/object/purpose-bound capability and verifies it", async () => {
    const policy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
    });
    const issued = await issueEphemeralStagingCapability(FIXTURE, {
      policy,
      ownerHashSecret: OWNER_HASH_SECRET,
      nowSeconds: NOW,
      nonce: "n_1234567890abcdef",
    });

    await expect(
      verifyEphemeralStagingCapability(issued.capability, {
        policy,
        ownerHashSecret: OWNER_HASH_SECRET,
        purpose: "upload",
        ownerUserId: FIXTURE.ownerUserId,
        nowSeconds: NOW + 1,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        purpose: "upload",
        stagingSessionId: FIXTURE.stagingSessionId,
        mediaAssetId: FIXTURE.mediaAssetId,
        generation: 2,
        sha256: FIXTURE.sha256,
        sizeBytes: 123,
        ownerSubjectHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      }),
    );
    expect(issued.issuedAtSeconds).toBe(NOW);
    expect(issued.expiresAtSeconds).toBe(NOW + 900);
    expect(Number.isSafeInteger(issued.expiresAtSeconds)).toBe(true);
  });

  it.each([
    ["wrong purpose", { purpose: "delete" as const, nowSeconds: NOW + 1 }],
    [
      "wrong owner",
      {
        ownerUserId: "00000000-0000-4000-8000-000000000099",
        nowSeconds: NOW + 1,
      },
    ],
    ["expired", { nowSeconds: NOW + 901 }],
  ])("rejects %s without disclosing claims", async (_label, override) => {
    const policy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_SECRET_VERSION: undefined,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
    });
    const issued = await issueEphemeralStagingCapability(FIXTURE, {
      policy,
      ownerHashSecret: OWNER_HASH_SECRET,
      nowSeconds: NOW,
      nonce: "n_1234567890abcdef",
    });

    await expect(
      verifyEphemeralStagingCapability(issued.capability, {
        policy,
        ownerHashSecret: OWNER_HASH_SECRET,
        purpose: "upload",
        ownerUserId: FIXTURE.ownerUserId,
        ...override,
      }),
    ).rejects.toMatchObject({ code: "capability_invalid" });
  });

  it("refuses an unbound verifier call without exactly one owner proof", async () => {
    const policy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
    });
    const issued = await issueEphemeralStagingCapability(FIXTURE, {
      policy,
      ownerHashSecret: OWNER_HASH_SECRET,
      nowSeconds: NOW,
      nonce: "n_1234567890abcdef",
    });

    await expect(
      verifyEphemeralStagingCapability(issued.capability, {
        policy,
        purpose: "upload",
        nowSeconds: NOW + 1,
      }),
    ).rejects.toMatchObject({ code: "capability_invalid" });
  });

  it("fails closed for malformed, weak, duplicate, or non-current key policy", () => {
    for (const env of [
      {},
      {
        EPHEMERAL_MEDIA_CAPABILITY_SECRETS: "1:weak",
        EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
      },
      {
        EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET},1:${SECRET}`,
        EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
      },
      {
        EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `2:${SECRET},1:${SECRET}`,
        EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
      },
    ]) {
      expect(() => resolveEphemeralMediaSigningPolicy(env)).toThrow(
        "ephemeral_media_signing_unavailable",
      );
    }
  });

  it("refuses to sign a typed caller that bypasses reservation bounds", async () => {
    const policy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
    });
    await expect(
      issueEphemeralStagingCapability(
        { ...FIXTURE, sizeBytes: 32 * 1024 * 1024 + 1 },
        {
          policy,
          ownerHashSecret: OWNER_HASH_SECRET,
          nowSeconds: NOW,
          nonce: "n_1234567890abcdef",
        },
      ),
    ).rejects.toThrow("ephemeral_media_capability_input_invalid");
  });

  it("binds claim/finalize to the frozen receipt digest and keeps owner identity stable across signing-key rotation", async () => {
    const originalPolicy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
    });
    const rotatedPolicy = resolveEphemeralMediaSigningPolicy({
      EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `2:${ROTATED_SECRET},1:${SECRET}`,
      EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "2",
    });
    const input = {
      ownerUserId: FIXTURE.ownerUserId,
      stagingSessionId: FIXTURE.stagingSessionId,
      publishId: "00000000-0000-4000-8000-000000000004",
      receiptSetDigest: "B".repeat(43),
      purpose: "claim" as const,
    };
    const original = await issueEphemeralStagingSessionCapability(input, {
      policy: originalPolicy,
      ownerHashSecret: OWNER_HASH_SECRET,
      nowSeconds: NOW,
      nonce: "n_1234567890abcdef",
    });
    const rotated = await issueEphemeralStagingSessionCapability(input, {
      policy: rotatedPolicy,
      ownerHashSecret: OWNER_HASH_SECRET,
      nowSeconds: NOW,
      nonce: "n_fedcba0987654321",
    });

    const [originalClaims, rotatedClaims] = await Promise.all([
      verifyEphemeralStagingSessionCapability(original.capability, {
        policy: originalPolicy,
        ownerHashSecret: OWNER_HASH_SECRET,
        purpose: "claim",
        ownerUserId: FIXTURE.ownerUserId,
        nowSeconds: NOW + 1,
      }),
      verifyEphemeralStagingSessionCapability(rotated.capability, {
        policy: rotatedPolicy,
        ownerHashSecret: OWNER_HASH_SECRET,
        purpose: "claim",
        ownerUserId: FIXTURE.ownerUserId,
        nowSeconds: NOW + 1,
      }),
    ]);
    expect(rotatedClaims.ownerSubjectHash).toBe(
      originalClaims.ownerSubjectHash,
    );
    expect(rotatedClaims.receiptSetDigest).toBe(input.receiptSetDigest);
    await expect(
      verifyEphemeralStagingSessionCapability(rotated.capability, {
        policy: rotatedPolicy,
        ownerHashSecret: OWNER_HASH_SECRET,
        purpose: "finalize",
        ownerUserId: FIXTURE.ownerUserId,
        nowSeconds: NOW + 1,
      }),
    ).rejects.toMatchObject({ code: "capability_invalid" });
  });
});
