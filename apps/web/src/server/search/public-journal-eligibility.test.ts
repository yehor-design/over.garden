import { describe, expect, it } from "vitest";

import { resolveCoverPresentation } from "./public-journal-eligibility";

const VERIFIED_MEDIA = {
  coverMediaId: "00000000-0000-4000-8000-000000000011",
  coverUsageRole: "cover_only",
  coverDerivativeKey: "derivatives/cover.webp",
  explicitCoverMediaAssetId: "00000000-0000-4000-8000-000000000011",
  revokedAt: null,
} as const;

describe("public journal cover projection quality", () => {
  it("keeps a verified converted cover exact", () => {
    expect(
      resolveCoverPresentation(
        VERIFIED_MEDIA,
        (key) => `https://media.over.garden/${key}`,
      ),
    ).toEqual({
      coverSource: "separate",
      coverPublicUrl: "https://media.over.garden/derivatives/cover.webp",
      coverProjectionQuality: "verified",
    });
  });

  it("omits a missing final derivative", () => {
    expect(
      resolveCoverPresentation(
        { ...VERIFIED_MEDIA, coverDerivativeKey: null },
        (key) => `https://media.over.garden/${key}`,
      ),
    ).toEqual({
      coverSource: "none",
      coverPublicUrl: null,
      coverProjectionQuality: "verified",
    });
  });

  it("omits an unavailable optional cover URL instead of dropping the journal", () => {
    expect(
      resolveCoverPresentation(VERIFIED_MEDIA, () => {
        throw new Error("provider configuration unavailable");
      }),
    ).toEqual({
      coverSource: "none",
      coverPublicUrl: null,
      coverProjectionQuality: "partial",
    });
  });

  it("never resolves a positively revoked cover URL", () => {
    const resolvePublicUrl = () =>
      "https://media.over.garden/derivatives/revoked.webp";

    expect(
      resolveCoverPresentation(
        { ...VERIFIED_MEDIA, revokedAt: new Date("2026-08-21T01:00:00.000Z") },
        resolvePublicUrl,
      ),
    ).toEqual({
      coverSource: "none",
      coverPublicUrl: null,
      coverProjectionQuality: "unverified",
    });
  });
});
