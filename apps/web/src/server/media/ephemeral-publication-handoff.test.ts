import { describe, expect, it, vi } from "vitest";

import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  type EphemeralMediaStagingReceiptClaims,
} from "@/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  signEphemeralMediaToken,
  type EphemeralMediaSigningPolicy,
} from "@/lib/media/ephemeral-staging-crypto";
import {
  claimEphemeralPublicationMedia,
  verifyEphemeralPublicationReceipts,
} from "./ephemeral-publication-handoff";

const OWNER = "2c732b1d-968c-4721-9a20-9e5495014bbc";
const SESSION = "46045ba1-d1dc-465a-aea9-0240785e3aa0";
const PUBLISH = "0bcaa85b-34ad-4fda-b1df-8705892e5cb4";
const MEDIA = "8f5fa87d-b94e-4217-b68d-28303827ad89";
const SECRET = "q".repeat(43);
const policy: EphemeralMediaSigningPolicy = {
  active: { version: 7, value: "r".repeat(43) },
  keys: [{ version: 7, value: "r".repeat(43) }],
};

async function receipt(
  overrides: Partial<EphemeralMediaStagingReceiptClaims> = {},
) {
  const now = 2_000_000_000;
  const claims: EphemeralMediaStagingReceiptClaims = {
    protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
    kind: "staging_receipt",
    keyVersion: policy.active.version,
    ownerSubjectHash: await deriveEphemeralMediaOwnerSubjectHash(SECRET, OWNER),
    stagingSessionId: SESSION,
    mediaAssetId: MEDIA,
    generation: 1,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sizeBytes: 4,
    width: 1,
    height: 1,
    stagedAtSeconds: now,
    leaseExpiresAtSeconds: now + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    receiptNonce: "n".repeat(32),
    ...overrides,
  };
  return signEphemeralMediaToken(
    claims as unknown as Record<string, unknown>,
    policy.active,
  );
}

describe("ephemeral publication handoff", () => {
  it("authenticates the receipt owner/session and exact frozen media order", async () => {
    const token = await receipt();

    await expect(
      verifyEphemeralPublicationReceipts(
        {
          ownerUserId: OWNER,
          stagingSessionId: SESSION,
          stagingReceipts: [token],
          orderedMediaAssetIds: [MEDIA],
        },
        {
          receiptPolicy: policy,
          ownerHashSecret: SECRET,
          nowSeconds: 2_000_000_010,
        },
      ),
    ).resolves.toMatchObject({
      receiptSetDigest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      media: [{ mediaAssetId: MEDIA, generation: 1 }],
    });
  });

  it("derives a unique media set when edit verification has no frozen full order", async () => {
    const token = await receipt();

    await expect(
      verifyEphemeralPublicationReceipts(
        {
          ownerUserId: OWNER,
          stagingReceipts: [token],
        },
        {
          receiptPolicy: policy,
          ownerHashSecret: SECRET,
          nowSeconds: 2_000_000_010,
        },
      ),
    ).resolves.toMatchObject({
      stagingSessionId: SESSION,
      media: [{ mediaAssetId: MEDIA, generation: 1 }],
    });

    const duplicate = await receipt({ receiptNonce: "d".repeat(32) });
    await expect(
      verifyEphemeralPublicationReceipts(
        {
          ownerUserId: OWNER,
          stagingReceipts: [token, duplicate],
        },
        {
          receiptPolicy: policy,
          ownerHashSecret: SECRET,
          nowSeconds: 2_000_000_010,
        },
      ),
    ).rejects.toMatchObject({ code: "receipt_set_invalid" });
  });

  it("rejects a validly signed receipt from another owner before claim", async () => {
    const otherHash = await deriveEphemeralMediaOwnerSubjectHash(
      SECRET,
      "06d23b5b-38e8-41ee-80ac-3a965eb3f354",
    );
    const token = await receipt({ ownerSubjectHash: otherHash });

    await expect(
      verifyEphemeralPublicationReceipts(
        {
          ownerUserId: OWNER,
          stagingSessionId: SESSION,
          stagingReceipts: [token],
          orderedMediaAssetIds: [MEDIA],
        },
        {
          receiptPolicy: policy,
          ownerHashSecret: SECRET,
          nowSeconds: 2_000_000_010,
        },
      ),
    ).rejects.toMatchObject({ code: "receipt_mismatch" });
  });

  it("accepts only a claim response that exactly matches the authenticated receipts", async () => {
    const token = await receipt();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "claimed",
        publishId: PUBLISH,
        publicMedia: [
          {
            mediaAssetId: MEDIA,
            generation: 1,
            sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            sizeBytes: 4,
            width: 1,
            height: 1,
            publicPath: `derivatives/${MEDIA}/1.webp`,
          },
        ],
      }),
    );

    await expect(
      claimEphemeralPublicationMedia(
        {
          ownerUserId: OWNER,
          publishId: PUBLISH,
          stagingSessionId: SESSION,
          stagingReceipts: [token],
          orderedMediaAssetIds: [MEDIA],
        },
        {
          receiptPolicy: policy,
          capabilityPolicy: policy,
          ownerHashSecret: SECRET,
          nowSeconds: 2_000_000_010,
          nonce: "x".repeat(32),
          fetcher,
        },
      ),
    ).resolves.toMatchObject({
      receiptSetDigest: expect.any(String),
      publicMedia: [
        { mediaAssetId: MEDIA, publicPath: `derivatives/${MEDIA}/1.webp` },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://media-stage.over.garden/v1/staging/${SESSION}/claim`,
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
  });

  it("keeps the claim deadline active while the provider response body is stalled", async () => {
    vi.useFakeTimers();
    const token = await receipt();
    let stalledBody!: ReadableStreamDefaultController<Uint8Array>;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        markFetchStarted();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stalledBody = controller;
              init?.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("deadline", "AbortError")),
                { once: true },
              );
            },
          }),
        );
      },
    ) as unknown as typeof fetch;
    const claim = claimEphemeralPublicationMedia(
      {
        ownerUserId: OWNER,
        publishId: PUBLISH,
        stagingSessionId: SESSION,
        stagingReceipts: [token],
        orderedMediaAssetIds: [MEDIA],
      },
      {
        receiptPolicy: policy,
        capabilityPolicy: policy,
        ownerHashSecret: SECRET,
        nowSeconds: 2_000_000_010,
        nonce: "x".repeat(32),
        fetcher,
      },
    );
    let observed: unknown = null;
    void claim.catch((error) => {
      observed = error;
    });
    await fetchStarted;
    await vi.advanceTimersByTimeAsync(45_001);
    await Promise.resolve();
    const deadlineOutcome = observed;
    if (observed === null) {
      stalledBody.error(new DOMException("test cleanup", "AbortError"));
    }
    await claim.catch(() => undefined);
    vi.useRealTimers();

    expect(deadlineOutcome).toMatchObject({ code: "staging_request_timeout" });
  });
});
