import { describe, expect, it } from "vitest";

import {
  JOURNAL_MEDIA_USAGE_COVER_ONLY,
  JOURNAL_MEDIA_USAGE_INLINE,
  OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID,
  OVE_207_BROWSER_SCENARIO_IDS,
  OVE_207_PRIMARY_BROWSER_SCENARIO_ID,
  inferCoverModeFromAggregate,
  resolveEffectiveJournalCover,
  type JournalCoverCandidate,
} from "@/lib/garden/journal-cover-contract";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";

function documentWithImages(
  mediaAssetIds: readonly string[],
): JournalDocumentV1 {
  return {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: mediaAssetIds.map((mediaAssetId, index) => ({
      id: `img-${index + 1}`,
      type: "image" as const,
      mediaAssetId,
    })),
  };
}

function candidate(
  mediaAssetId: string,
  usageRole: typeof JOURNAL_MEDIA_USAGE_INLINE | typeof JOURNAL_MEDIA_USAGE_COVER_ONLY = JOURNAL_MEDIA_USAGE_INLINE,
): JournalCoverCandidate {
  return {
    mediaAssetId,
    usageRole,
    derivativeKey: `deriv/${mediaAssetId}.webp`,
    revokedAt: null,
    altText: null,
  };
}

describe("OVE-207 journal cover contract", () => {
  it("falls back to the first reachable final inline in document order", () => {
    const document = documentWithImages(["later", "earlier"]);
    const candidatesById = new Map([
      ["later", candidate("later")],
      ["earlier", candidate("earlier")],
    ]);
    const resolved = resolveEffectiveJournalCover({
      document,
      explicitCoverMediaAssetId: null,
      candidatesById,
    });
    expect(resolved).toMatchObject({
      mediaAssetId: "later",
      source: "automatic_inline",
      mode: "automatic",
      focalX: 0.5,
      focalY: 0.5,
    });
  });

  it("prefers a valid explicit inline cover over document order", () => {
    const document = documentWithImages(["a", "b"]);
    const candidatesById = new Map([
      ["a", candidate("a")],
      ["b", candidate("b")],
    ]);
    const resolved = resolveEffectiveJournalCover({
      document,
      explicitCoverMediaAssetId: "b",
      candidatesById,
    });
    expect(resolved).toMatchObject({
      mediaAssetId: "b",
      source: "explicit_inline",
      mode: "explicit_inline",
    });
  });

  it("uses a cover-only separate asset when explicitly claimed", () => {
    const document = documentWithImages(["story"]);
    const candidatesById = new Map([
      ["story", candidate("story")],
      ["cover", candidate("cover", JOURNAL_MEDIA_USAGE_COVER_ONLY)],
    ]);
    const resolved = resolveEffectiveJournalCover({
      document,
      explicitCoverMediaAssetId: "cover",
      candidatesById,
    });
    expect(resolved).toMatchObject({
      mediaAssetId: "cover",
      source: "separate",
      mode: "separate",
    });
  });

  it("fails closed when an explicit final cover is revoked", () => {
    const document = documentWithImages(["ok"]);
    const candidatesById = new Map([
      ["ok", candidate("ok")],
      [
        "broken",
        {
          ...candidate("broken"),
          revokedAt: new Date("2026-08-24T00:00:00.000Z"),
        },
      ],
    ]);
    const resolved = resolveEffectiveJournalCover({
      document,
      explicitCoverMediaAssetId: "broken",
      candidatesById,
    });
    expect(resolved.mediaAssetId).toBe("ok");
    expect(resolved.source).toBe("automatic_inline");
  });

  it("infers mode from aggregate cover role", () => {
    expect(
      inferCoverModeFromAggregate({
        explicitCoverMediaAssetId: null,
        candidatesById: new Map(),
      }),
    ).toBe("automatic");
    expect(
      inferCoverModeFromAggregate({
        explicitCoverMediaAssetId: "x",
        candidatesById: new Map([
          ["x", candidate("x", JOURNAL_MEDIA_USAGE_COVER_ONLY)],
        ]),
      }),
    ).toBe("separate");
  });

  it("keeps OVE-207 scenario and locale participant ids stable", () => {
    expect(OVE_207_PRIMARY_BROWSER_SCENARIO_ID).toBe(
      "locale-transition-with-cover",
    );
    expect(OVE_207_BROWSER_SCENARIO_IDS).toHaveLength(8);
    expect(OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID).toBe(
      "owner-composer-cover-upload",
    );
  });

  it("has uk/bg/ru cover copy parity", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getJournalCoverControlsCopy(locale);
      expect(copy.sectionLabel.length).toBeGreaterThan(0);
      expect(copy.keepAsCover.length).toBeGreaterThan(0);
      expect(copy.removeEverywhere.length).toBeGreaterThan(0);
    }
  });
});
