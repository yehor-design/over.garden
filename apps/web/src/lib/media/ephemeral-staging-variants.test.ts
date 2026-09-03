import { describe, expect, it } from "vitest";

import {
  EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO,
  EPHEMERAL_MEDIA_PLACEHOLDER_MAX_BYTES,
  EPHEMERAL_MEDIA_VARIANT_LONG_EDGES,
  ephemeralMediaPublicKey,
  ephemeralMediaUploadPath,
  isEphemeralMediaPlaceholderDataUri,
  isEphemeralMediaVariant,
  parseEphemeralMediaReservation,
  parseEphemeralMediaStagingSession,
  parseEphemeralMediaUploadDescription,
} from "./ephemeral-staging-contract";

const SESSION = "00000000-0000-4000-8000-000000000002";
const MEDIA = "00000000-0000-4000-8000-000000000003";
const SHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    stagingSessionId: SESSION,
    mediaAssetId: MEDIA,
    generation: 3,
    sha256: SHA,
    sizeBytes: 1_024,
    width: 1280,
    height: 960,
    ...overrides,
  };
}

describe("ephemeral staging variants (OVE-371)", () => {
  it("knows exactly the primary and the two variant long edges", () => {
    expect(EPHEMERAL_MEDIA_VARIANT_LONG_EDGES).toEqual([1280, 480]);
    expect(EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO).toBe(3);
    expect(isEphemeralMediaVariant(0)).toBe(true);
    expect(isEphemeralMediaVariant(1280)).toBe(true);
    expect(isEphemeralMediaVariant(2560)).toBe(false);
    expect(isEphemeralMediaVariant("480")).toBe(false);
  });

  it("parses an absent variant as the primary and refuses unknown edges", () => {
    expect(parseEphemeralMediaReservation(reservation())).toMatchObject({
      variant: 0,
    });
    expect(
      parseEphemeralMediaReservation(reservation({ variant: 480 })),
    ).toMatchObject({ variant: 480 });
    expect(parseEphemeralMediaReservation(reservation({ variant: 640 }))).toBe(
      null,
    );
    expect(
      parseEphemeralMediaReservation(reservation({ variant: null })),
    ).toBeNull();
  });

  it("places a variant behind the generation on the upload path and in R2", () => {
    const base = `/v1/staging/${SESSION}/${MEDIA}/3`;
    expect(
      ephemeralMediaUploadPath({
        stagingSessionId: SESSION,
        mediaAssetId: MEDIA,
        generation: 3,
      }),
    ).toBe(base);
    expect(
      ephemeralMediaUploadPath({
        stagingSessionId: SESSION,
        mediaAssetId: MEDIA,
        generation: 3,
        variant: 0,
      }),
    ).toBe(base);
    expect(
      ephemeralMediaUploadPath({
        stagingSessionId: SESSION,
        mediaAssetId: MEDIA,
        generation: 3,
        variant: 1280,
      }),
    ).toBe(`${base}/v1280`);
    expect(
      ephemeralMediaPublicKey({ mediaAssetId: MEDIA, generation: 3, variant: 0 }),
    ).toBe(`derivatives/${MEDIA}/3.webp`);
    expect(
      ephemeralMediaPublicKey({
        mediaAssetId: MEDIA,
        generation: 3,
        variant: 480,
      }),
    ).toBe(`derivatives/${MEDIA}/3-480.webp`);
  });

  it("describes a variant upload by its path and headers (OVE-372)", () => {
    const headers = new Headers({
      "content-sha256": SHA,
      "x-media-width": "480",
      "x-media-height": "360",
    });
    expect(
      parseEphemeralMediaUploadDescription({
        binding: {
          stagingSessionId: SESSION,
          mediaAssetId: MEDIA,
          generation: 3,
          variant: 480,
        },
        headers,
        contentLength: 1_024,
      }),
    ).toEqual({
      stagingSessionId: SESSION,
      mediaAssetId: MEDIA,
      generation: 3,
      variant: 480,
      sha256: SHA,
      sizeBytes: 1_024,
      width: 480,
      height: 360,
    });
    expect(
      parseEphemeralMediaUploadDescription({
        binding: { stagingSessionId: SESSION, mediaAssetId: MEDIA, generation: 3 },
        headers: new Headers({ "content-sha256": SHA }),
        contentLength: 1_024,
      }),
    ).toBeNull();
    expect(
      parseEphemeralMediaStagingSession(
        { stagingSessionId: SESSION, sessionCapability: "s".repeat(40), expiresAt: 2_000_000_900 },
        SESSION,
      ),
    ).toEqual({
      stagingSessionId: SESSION,
      sessionCapability: "s".repeat(40),
      expiresAt: 2_000_000_900,
    });
    expect(
      parseEphemeralMediaStagingSession(
        { stagingSessionId: MEDIA, sessionCapability: "s".repeat(40), expiresAt: 2_000_000_900 },
        SESSION,
      ),
    ).toBeNull();
  });

  it("admits only a small inline WebP as a placeholder", () => {
    const bytes = (length: number) =>
      `data:image/webp;base64,${Buffer.alloc(length, 1).toString("base64")}`;
    expect(EPHEMERAL_MEDIA_PLACEHOLDER_MAX_BYTES).toBe(400);
    expect(isEphemeralMediaPlaceholderDataUri(bytes(400))).toBe(true);
    expect(isEphemeralMediaPlaceholderDataUri(bytes(401))).toBe(false);
    expect(isEphemeralMediaPlaceholderDataUri(bytes(0))).toBe(false);
    expect(
      isEphemeralMediaPlaceholderDataUri("data:image/png;base64,AAAA"),
    ).toBe(false);
    expect(isEphemeralMediaPlaceholderDataUri("data:image/webp;base64,A")).toBe(
      false,
    );
    expect(isEphemeralMediaPlaceholderDataUri(42)).toBe(false);
  });
});
