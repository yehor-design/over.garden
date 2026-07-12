import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";

import { assertVisualFixturePassportEvidenceResult } from "./passport-evidence";

const EXPECTED = VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.find(
  (scenario) => scenario.id === "public-plant-dense",
)!;
const EXPECTED_MEDIA_KEYS = VISUAL_FIXTURE_MANIFEST.media
  .filter((media) => EXPECTED.expectedTimelineEntryIds.includes(media.entryId))
  .map((media) => media.derivativeKey);

describe("visual fixture passport evidence verifier", () => {
  it("accepts an exact production-loader result", () => {
    expect(() =>
      assertVisualFixturePassportEvidenceResult(EXPECTED, EXPECTED_MEDIA_KEYS, {
        status: 200,
        objectKind: EXPECTED.objectKind,
        identityState: EXPECTED.identityState,
        timelineEntryIds: EXPECTED.expectedTimelineEntryIds,
        mediaKeys: [...EXPECTED_MEDIA_KEYS].reverse(),
      }),
    ).not.toThrow();
  });

  it("rejects stale lifecycle, identity, timeline, and media evidence", () => {
    const exact = {
      status: 200 as const,
      objectKind: EXPECTED.objectKind,
      identityState: EXPECTED.identityState,
      timelineEntryIds: EXPECTED.expectedTimelineEntryIds,
      mediaKeys: EXPECTED_MEDIA_KEYS,
    };

    expect(() =>
      assertVisualFixturePassportEvidenceResult(EXPECTED, EXPECTED_MEDIA_KEYS, {
        ...exact,
        status: 404,
      }),
    ).toThrow(/returned 404/);
    expect(() =>
      assertVisualFixturePassportEvidenceResult(EXPECTED, EXPECTED_MEDIA_KEYS, {
        ...exact,
        identityState: "unknown",
      }),
    ).toThrow(/identity/);
    expect(() =>
      assertVisualFixturePassportEvidenceResult(EXPECTED, EXPECTED_MEDIA_KEYS, {
        ...exact,
        timelineEntryIds: exact.timelineEntryIds.slice(1),
      }),
    ).toThrow(/timeline/);
    expect(() =>
      assertVisualFixturePassportEvidenceResult(EXPECTED, EXPECTED_MEDIA_KEYS, {
        ...exact,
        mediaKeys: [],
      }),
    ).toThrow(/media/);
  });

  it("accepts an exact gone lifecycle without leaking private content", () => {
    const gone = VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.find(
      (scenario) => scenario.id === "public-gone",
    )!;

    expect(() =>
      assertVisualFixturePassportEvidenceResult(gone, [], {
        status: 410,
        objectKind: null,
        identityState: null,
        timelineEntryIds: [],
        mediaKeys: [],
      }),
    ).not.toThrow();
  });
});
