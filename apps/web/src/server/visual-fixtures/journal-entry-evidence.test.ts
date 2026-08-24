import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  assertVisualFixtureJournalEntryEvidenceResult,
  type VisualFixtureJournalEntryActualResult,
} from "./journal-entry-evidence";

const EXPECTED = VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.find(
  (scenario) => scenario.id === "recent-mixed-gallery",
)!;
const EXPECTED_MEDIA_KEYS = VISUAL_FIXTURE_MANIFEST.media
  .filter((media) => media.entryId === EXPECTED.entryId)
  .map((media) => media.derivativeKey);

describe("visual fixture journal-entry evidence verifier", () => {
  it("accepts an exact production-loader chapter result", () => {
    const actual: VisualFixtureJournalEntryActualResult = {
      status: 200,
      contextKind: EXPECTED.contextKind,
      objectKind: EXPECTED.objectKind,
      contentLength: EXPECTED.contentLength,
      mediaKeys: [...EXPECTED_MEDIA_KEYS].reverse(),
      mentionCount: EXPECTED.expectedMentionCount,
      hasNewer: EXPECTED.expectedNewer,
      hasOlder: EXPECTED.expectedOlder,
      ownerControlVisible: false,
    };

    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(
        EXPECTED,
        EXPECTED_MEDIA_KEYS,
        actual,
      ),
    ).not.toThrow();
  });

  it("rejects stale context, content, gallery, chronology, mentions, and owner scope", () => {
    const owner = VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.find(
      (scenario) => scenario.id === "owner-controls",
    )!;
    const exact: VisualFixtureJournalEntryActualResult = {
      status: 200,
      contextKind: owner.contextKind,
      objectKind: owner.objectKind,
      contentLength: owner.contentLength,
      mediaKeys: VISUAL_FIXTURE_MANIFEST.media
        .filter((media) => media.entryId === owner.entryId)
        .map((media) => media.derivativeKey),
      mentionCount: owner.expectedMentionCount,
      hasNewer: owner.expectedNewer,
      hasOlder: owner.expectedOlder,
      ownerControlVisible: true,
    };

    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        contextKind: "space",
      }),
    ).toThrow(/context/);
    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        contentLength: exact.contentLength === "short" ? "normal" : "short",
      }),
    ).toThrow(/content/);
    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        mediaKeys: [],
      }),
    ).toThrow(/media/);
    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        hasOlder: !exact.hasOlder,
      }),
    ).toThrow(/chronology/);
    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        mentionCount: 99,
      }),
    ).toThrow(/mentions/);
    expect(() =>
      assertVisualFixtureJournalEntryEvidenceResult(owner, exact.mediaKeys, {
        ...exact,
        ownerControlVisible: false,
      }),
    ).toThrow(/owner control/);
  });

  it("accepts generic nonexistent 404 and removed 410 lifecycle results", () => {
    for (const id of ["nonexistent-404", "gone-410", "missing-404"]) {
      const expected =
        VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.find(
          (scenario) => scenario.id === id,
        )!;
      expect(() =>
        assertVisualFixtureJournalEntryEvidenceResult(expected, [], {
          status: expected.expectedStatus,
          contextKind: null,
          objectKind: null,
          contentLength: null,
          mediaKeys: [],
          mentionCount: 0,
          hasNewer: false,
          hasOlder: false,
          ownerControlVisible: false,
        }),
      ).not.toThrow();
    }
  });
});
