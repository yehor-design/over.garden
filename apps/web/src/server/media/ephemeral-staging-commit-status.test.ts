import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  selectFrom: vi.fn(),
  entry: null as Record<string, unknown> | null,
  media: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db", () => ({
  db: { selectFrom: database.selectFrom },
}));

import { signEphemeralMediaText } from "@/lib/media/ephemeral-staging-crypto";
import { resetMediaVariantSchemaProbeForTests } from "@/server/media/media-variant-schema";
import {
  readEphemeralMediaCommitStatus,
  verifyCommitStatusRequest,
  type EphemeralMediaCommitStatusRequest,
} from "./ephemeral-staging-commit-status";

const SECRET = Buffer.alloc(32, 11).toString("base64url");
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const PUBLISH_ID = "00000000-0000-4000-8000-000000000010";
const SESSION_ID = "00000000-0000-4000-8000-000000000002";
const MEDIA_ID = "00000000-0000-4000-8000-000000000003";
const RETAINED_MEDIA_ID = "00000000-0000-4000-8000-000000000004";

describe("ephemeral media commit-status boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET = SECRET;
    database.entry = {
      id: PUBLISH_ID,
      owner_user_id: OWNER_ID,
      published_at: new Date("2026-08-23T10:00:00.000Z"),
      lifecycle_state: "active",
      visibility: "public",
    };
    database.media = [
      {
        id: MEDIA_ID,
        owner_user_id: OWNER_ID,
        upload_generation: 2,
        declared_size_bytes: "123",
        intrinsic_width: 800,
        intrinsic_height: 600,
        derivative_key: `derivatives/${MEDIA_ID}/2.webp`,
        revoked_at: null,
      },
    ];
    database.selectFrom.mockImplementation((table: string) => {
      if (table === "journal_entries") {
        const chain = {
          select: () => chain,
          where: () => chain,
          executeTakeFirst: async () => database.entry,
        };
        return chain;
      }
      const chain = {
        select: () => chain,
        where: () => chain,
        orderBy: () => chain,
        execute: async () => database.media,
      };
      return chain;
    });
  });

  it("authenticates and parses one bounded exact-media read-back", async () => {
    const value = fixture();
    const body = JSON.stringify(value);
    const signature = await signEphemeralMediaText(
      SECRET,
      "commit-status",
      body,
    );
    const request = new Request(
      "https://over.garden/api/media/staging/commit-status",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-overgarden-staging-signature": `v1:${signature}`,
        },
        body,
      },
    );

    await expect(verifyCommitStatusRequest(request)).resolves.toEqual(value);
  });

  it("rejects an oversized chunked body before accepting a valid prefix", async () => {
    const value = fixture();
    const body = `${JSON.stringify(value)}${" ".repeat(4_097)}`;
    const signature = await signEphemeralMediaText(
      SECRET,
      "commit-status",
      body,
    );
    const request = new Request(
      "https://over.garden/api/media/staging/commit-status",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-overgarden-staging-signature": `v1:${signature}`,
        },
        body,
      },
    );

    await expect(verifyCommitStatusRequest(request)).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("returns committed only for the exact active public owner/media set", async () => {
    const input = fixture();

    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe(
      "committed",
    );

    database.media = [
      { ...database.media[0], derivative_key: "derivatives/wrong.webp" },
    ];
    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe(
      "indeterminate",
    );

    database.entry = null;
    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe("absent");
  });

  it("commits a variant object through its primary row, and through the recorded edges once 0047 is live", async () => {
    const variantItem = {
      mediaAssetId: MEDIA_ID,
      generation: 2,
      variant: 1280 as const,
      sizeBytes: 45,
      width: 1280,
      height: 960,
      publicKey: `derivatives/${MEDIA_ID}/2-1280.webp`,
    };
    const base = fixture();
    const input = {
      ...base,
      expectedMedia: [...base.expectedMedia, variantItem],
    };
    const body = JSON.stringify(input);
    const signature = await signEphemeralMediaText(
      SECRET,
      "commit-status",
      body,
    );
    await expect(
      verifyCommitStatusRequest(
        new Request("https://over.garden/api/media/staging/commit-status", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-overgarden-staging-signature": `v1:${signature}`,
          },
          body,
        }),
      ),
    ).resolves.toEqual(input);

    // Before migration 0047 nothing records variants: the primary row stands.
    resetMediaVariantSchemaProbeForTests(false);
    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe(
      "committed",
    );
    // Once the columns exist, the variant must be recorded on the row.
    resetMediaVariantSchemaProbeForTests(true);
    database.media = [
      { ...database.media[0], variant_long_edges: [480] },
    ];
    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe(
      "indeterminate",
    );
    database.media = [
      { ...database.media[0], variant_long_edges: [1280, 480] },
    ];
    await expect(readEphemeralMediaCommitStatus(input)).resolves.toBe(
      "committed",
    );
    resetMediaVariantSchemaProbeForTests(null);
    // A variant key at the wrong path is not a read-back.
    await expect(
      verifyCommitStatusRequest(
        new Request("https://over.garden/api/media/staging/commit-status", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-overgarden-staging-signature": `v1:${await signEphemeralMediaText(
              SECRET,
              "commit-status",
              JSON.stringify({
                ...base,
                expectedMedia: [
                  { ...variantItem, publicKey: `derivatives/${MEDIA_ID}/2.webp` },
                ],
              }),
            )}`,
          },
          body: JSON.stringify({
            ...base,
            expectedMedia: [
              { ...variantItem, publicKey: `derivatives/${MEDIA_ID}/2.webp` },
            ],
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("proves an edit claim as a committed subset while unrelated retained media stays attached", async () => {
    database.media.push({
      id: RETAINED_MEDIA_ID,
      owner_user_id: OWNER_ID,
      upload_generation: 1,
      declared_size_bytes: "321",
      intrinsic_width: 640,
      intrinsic_height: 480,
      derivative_key: `derivatives/${RETAINED_MEDIA_ID}/1.webp`,
      revoked_at: null,
    });

    await expect(readEphemeralMediaCommitStatus(fixture())).resolves.toBe(
      "committed",
    );

    database.media = database.media.filter((row) => row.id !== MEDIA_ID);
    await expect(readEphemeralMediaCommitStatus(fixture())).resolves.toBe(
      "indeterminate",
    );
  });
});

function fixture(): EphemeralMediaCommitStatusRequest {
  return {
    publishId: PUBLISH_ID,
    receiptSetDigest: "B".repeat(43),
    ownerSubjectHash: "1XaxxuW7yQ8BpdJ1UWjON4dyg1K0LY8x3jQGyNsW6hM",
    stagingSessionId: SESSION_ID,
    issuedAtSeconds: Math.floor(Date.now() / 1_000),
    nonce: "n_1234567890abcdef",
    expectedMedia: [
      {
        mediaAssetId: MEDIA_ID,
        generation: 2,
        sizeBytes: 123,
        width: 800,
        height: 600,
        publicKey: `derivatives/${MEDIA_ID}/2.webp`,
      },
    ],
  };
}
