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
const MEDIA_2 = "0f12d28a-3369-4c31-9779-e0ef2b08e10d";
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
    const secondToken = await receipt({
      mediaAssetId: MEDIA_2,
      receiptNonce: "s".repeat(32),
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "claimed",
        publishId: PUBLISH,
        publicMedia: [
          {
            mediaAssetId: MEDIA_2,
            generation: 1,
            sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            sizeBytes: 4,
            width: 1,
            height: 1,
            publicPath: `derivatives/${MEDIA_2}/1.webp`,
          },
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
          stagingReceipts: [token, secondToken],
          orderedMediaAssetIds: [MEDIA, MEDIA_2],
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
        {
          mediaAssetId: MEDIA_2,
          publicPath: `derivatives/${MEDIA_2}/1.webp`,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://media-stage.over.garden/v1/staging/${SESSION}/claim`,
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
  });

  it("groups a photo's variant receipts behind its primary (OVE-371)", async () => {
    const primary = await receipt({ width: 2560, height: 1920 });
    const large = await receipt({
      variant: 1280,
      width: 1280,
      height: 960,
      sha256: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=",
      receiptNonce: "l".repeat(32),
    });
    const small = await receipt({
      variant: 480,
      width: 480,
      height: 360,
      sha256: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA=",
      receiptNonce: "s".repeat(32),
    });
    const dependencies = {
      receiptPolicy: policy,
      ownerHashSecret: SECRET,
      nowSeconds: 2_000_000_010,
    };

    const verified = await verifyEphemeralPublicationReceipts(
      {
        ownerUserId: OWNER,
        stagingReceipts: [primary, large, small],
        orderedMediaAssetIds: [MEDIA],
      },
      dependencies,
    );
    expect(verified.media).toHaveLength(3);
    expect(verified.photos).toEqual([
      {
        primary: expect.objectContaining({ mediaAssetId: MEDIA, width: 2560 }),
        variants: [
          expect.objectContaining({ variant: 1280 }),
          expect.objectContaining({ variant: 480 }),
        ],
      },
    ]);

    // A variant needs the primary it was cut from, in front of it.
    await expect(
      verifyEphemeralPublicationReceipts(
        { ownerUserId: OWNER, stagingReceipts: [large, primary] },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "receipt_set_invalid" });
    // The same variant twice is not two objects.
    await expect(
      verifyEphemeralPublicationReceipts(
        { ownerUserId: OWNER, stagingReceipts: [primary, small, small] },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "receipt_set_invalid" });
    // A "variant" larger than its primary is not a variant.
    const oversized = await receipt({
      variant: 1280,
      width: 1280,
      height: 960,
      receiptNonce: "o".repeat(32),
    });
    await expect(
      verifyEphemeralPublicationReceipts(
        { ownerUserId: OWNER, stagingReceipts: [await receipt(), oversized] },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "receipt_set_invalid" });
  });

  it("requires the claim response to name every variant object at its own key", async () => {
    const primary = await receipt({ width: 2560, height: 1920 });
    const small = await receipt({
      variant: 480,
      width: 480,
      height: 360,
      sha256: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA=",
      receiptNonce: "s".repeat(32),
    });
    const response = (variantPath: string) =>
      Response.json({
        status: "claimed",
        publishId: PUBLISH,
        publicMedia: [
          {
            mediaAssetId: MEDIA,
            generation: 1,
            sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            sizeBytes: 4,
            width: 2560,
            height: 1920,
            publicPath: `derivatives/${MEDIA}/1.webp`,
          },
          {
            mediaAssetId: MEDIA,
            generation: 1,
            variant: 480,
            sha256: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA=",
            sizeBytes: 4,
            width: 480,
            height: 360,
            publicPath: variantPath,
          },
        ],
      });
    const dependencies = {
      receiptPolicy: policy,
      capabilityPolicy: policy,
      ownerHashSecret: SECRET,
      nowSeconds: 2_000_000_010,
      nonce: "x".repeat(32),
    };
    const input = {
      ownerUserId: OWNER,
      publishId: PUBLISH,
      stagingSessionId: SESSION,
      stagingReceipts: [primary, small],
      orderedMediaAssetIds: [MEDIA],
    };

    await expect(
      claimEphemeralPublicationMedia(input, {
        ...dependencies,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(response(`derivatives/${MEDIA}/1-480.webp`)),
      }),
    ).resolves.toMatchObject({
      publicMedia: [
        {
          mediaAssetId: MEDIA,
          publicPath: `derivatives/${MEDIA}/1.webp`,
          width: 2560,
          variants: [
            {
              variant: 480,
              width: 480,
              height: 360,
              publicPath: `derivatives/${MEDIA}/1-480.webp`,
            },
          ],
        },
      ],
    });
    await expect(
      claimEphemeralPublicationMedia(input, {
        ...dependencies,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(response(`derivatives/${MEDIA}/1.webp`)),
      }),
    ).rejects.toMatchObject({ code: "claim_response_mismatch" });
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
