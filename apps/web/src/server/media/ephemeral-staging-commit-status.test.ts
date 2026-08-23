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
        declared_media_type: "image/webp",
        admitted_media_type: "image/webp",
        derivative_key: `derivatives/${MEDIA_ID}/2.webp`,
        media_readiness_state: "public_ready",
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

  it("proves an edit claim as a committed subset while unrelated retained media stays attached", async () => {
    database.media.push({
      id: RETAINED_MEDIA_ID,
      owner_user_id: OWNER_ID,
      upload_generation: 1,
      declared_size_bytes: "321",
      intrinsic_width: 640,
      intrinsic_height: 480,
      declared_media_type: "image/webp",
      admitted_media_type: "image/webp",
      derivative_key: `derivatives/${RETAINED_MEDIA_ID}/1.webp`,
      media_readiness_state: "public_ready",
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
