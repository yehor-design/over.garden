import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import { assertVisualFixtureProfileEvidenceResult } from "./profile-evidence";

const EXPECTED = VISUAL_FIXTURE_MANIFEST.profileEvidence.scenarios.find(
  (scenario) => scenario.id === "gardener-dense",
)!;

describe("visual fixture profile evidence verifier", () => {
  it("accepts the exact production profile projection", () => {
    expect(() =>
      assertVisualFixtureProfileEvidenceResult(EXPECTED, {
        status: 200,
        publicObjectCount: EXPECTED.expectedPublicObjectCount,
        publicEntryCount: EXPECTED.expectedPublicEntryCount,
        objectIds: EXPECTED.expectedObjectIds,
        journalEntryIds: EXPECTED.expectedJournalEntryIds,
        followerCount: EXPECTED.expectedFollowerCount,
        followingCount: EXPECTED.expectedFollowingCount,
        hasAvatar: EXPECTED.expectedAvatar,
      }),
    ).not.toThrow();
  });

  it("rejects stale counts, ordering, relationship, and avatar states", () => {
    const exact = {
      status: 200 as const,
      publicObjectCount: EXPECTED.expectedPublicObjectCount,
      publicEntryCount: EXPECTED.expectedPublicEntryCount,
      objectIds: EXPECTED.expectedObjectIds,
      journalEntryIds: EXPECTED.expectedJournalEntryIds,
      followerCount: EXPECTED.expectedFollowerCount,
      followingCount: EXPECTED.expectedFollowingCount,
      hasAvatar: EXPECTED.expectedAvatar,
    };

    expect(() =>
      assertVisualFixtureProfileEvidenceResult(EXPECTED, {
        ...exact,
        publicObjectCount: exact.publicObjectCount + 1,
      }),
    ).toThrow(/counts/);
    expect(() =>
      assertVisualFixtureProfileEvidenceResult(EXPECTED, {
        ...exact,
        journalEntryIds: exact.journalEntryIds.slice(1),
      }),
    ).toThrow(/ordered evidence/);
    expect(() =>
      assertVisualFixtureProfileEvidenceResult(EXPECTED, {
        ...exact,
        followerCount: (exact.followerCount ?? 0) + 1,
      }),
    ).toThrow(/relationship/);
    expect(() =>
      assertVisualFixtureProfileEvidenceResult(EXPECTED, {
        ...exact,
        hasAvatar: !exact.hasAvatar,
      }),
    ).toThrow(/avatar/);
  });

  it("accepts one generic unavailable result for private, removed, and blocked profiles", () => {
    for (const id of [
      "private-unavailable",
      "removed-unavailable",
      "blocked-unavailable",
    ]) {
      const expected = VISUAL_FIXTURE_MANIFEST.profileEvidence.scenarios.find(
        (scenario) => scenario.id === id,
      )!;
      expect(() =>
        assertVisualFixtureProfileEvidenceResult(expected, {
          status: 404,
          publicObjectCount: 0,
          publicEntryCount: 0,
          objectIds: [],
          journalEntryIds: [],
          followerCount: null,
          followingCount: null,
          hasAvatar: false,
        }),
      ).not.toThrow();
    }
  });
});
