import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  assertVisualFixtureSocialEvidenceResult,
  type VisualFixtureSocialActualResult,
} from "./social-return-evidence";

const scenario = (id: string) =>
  VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.find(
    (candidate) => candidate.id === id,
  )!;

function exactResult(id: string): VisualFixtureSocialActualResult {
  const expected = scenario(id);
  return {
    status: expected.expectedStatus,
    visibleIds: [...expected.expectedVisibleIds].reverse(),
    hasNextPage: expected.expectedHasNextPage,
    groupedItemCount:
      expected.state === "grouped"
        ? Math.max(0, expected.expectedItemCount - 1)
        : expected.state === "individual"
          ? expected.expectedItemCount
          : null,
    publicDerivativeOnly: true,
    privatePayloadExcluded: true,
  };
}

describe("visual fixture social-return evidence verifier", () => {
  it("accepts exact edge, collection, and lifecycle results", () => {
    for (const id of [
      "comments-page-plus-one",
      "comments-blocked",
      "comments-closed",
      "feed-dense",
      "notifications-individual",
      "notifications-grouped",
      "bookmarks-dense",
      "wishlist-dense",
    ]) {
      expect(() =>
        assertVisualFixtureSocialEvidenceResult(scenario(id), exactResult(id)),
      ).not.toThrow();
    }
  });

  it("rejects visible drift, hidden leakage, count drift, and pagination drift", () => {
    const expected = scenario("bookmarks-dense");
    const exact = exactResult(expected.id);

    expect(() =>
      assertVisualFixtureSocialEvidenceResult(expected, {
        ...exact,
        visibleIds: exact.visibleIds.slice(1),
      }),
    ).toThrow(/visible items/);
    expect(() =>
      assertVisualFixtureSocialEvidenceResult(expected, {
        ...exact,
        visibleIds: [
          ...exact.visibleIds.slice(1),
          expected.expectedHiddenIds[0],
        ],
      }),
    ).toThrow(/visible items|hidden item/);
    expect(() =>
      assertVisualFixtureSocialEvidenceResult(expected, {
        ...exact,
        hasNextPage: false,
      }),
    ).toThrow(/pagination/);
  });

  it("rejects unsafe media, private payloads, and fake grouped states", () => {
    const feed = scenario("feed-dense");
    expect(() =>
      assertVisualFixtureSocialEvidenceResult(feed, {
        ...exactResult(feed.id),
        publicDerivativeOnly: false,
      }),
    ).toThrow(/unsafe media/);

    const notifications = scenario("notifications-dense");
    expect(() =>
      assertVisualFixtureSocialEvidenceResult(notifications, {
        ...exactResult(notifications.id),
        privatePayloadExcluded: false,
      }),
    ).toThrow(/private payload/);

    const grouped = scenario("notifications-grouped");
    expect(() =>
      assertVisualFixtureSocialEvidenceResult(grouped, {
        ...exactResult(grouped.id),
        groupedItemCount: grouped.expectedItemCount,
      }),
    ).toThrow(/group/);
  });
});
