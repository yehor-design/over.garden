import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  assertVisualFixtureCommunityEvidenceResult,
  type VisualFixtureCommunityActualResult,
} from "./community-evidence";

const scenario = (id: string) =>
  VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.find(
    (candidate) => candidate.id === id,
  )!;

function exactResult(id: string): VisualFixtureCommunityActualResult {
  const expected = scenario(id);
  return {
    status: expected.expectedStatus,
    visibleIds: expected.expectedVisibleContributionIds,
    totalCount: expected.expectedItemCount,
    hasNextPage: expected.expectedHasNextPage,
    membershipState: expected.expectedMembershipState,
    isModerator: expected.actorRole === "moderator",
    lifecycleState: expected.state === "archived" ? "archived" : "active",
    participationState:
      expected.state === "closed-participation" ? "closed" : "open",
    pendingReportContributionIds:
      expected.state === "pending-report"
        ? [expected.expectedVisibleContributionIds[0]!]
        : [],
    closedDiscussionContributionIds:
      expected.state === "closed-discussion"
        ? [expected.expectedVisibleContributionIds[0]!]
        : [],
    publicDerivativeOnly: true,
    privatePayloadExcluded: true,
  };
}

describe("visual fixture community evidence verifier", () => {
  it("accepts exact public, role, safety, and lifecycle states", () => {
    for (const id of [
      "ove184-community-empty",
      "ove184-community-dense",
      "ove184-community-member",
      "ove184-community-moderator",
      "ove184-community-blocked",
      "ove184-community-banned",
      "ove184-community-pending-report",
      "ove184-community-removed-content",
      "ove184-community-archived",
      "ove184-community-closed-discussion",
      "ove184-community-closed-participation",
      "ove184-community-unavailable",
    ]) {
      expect(() =>
        assertVisualFixtureCommunityEvidenceResult(
          scenario(id),
          exactResult(id),
        ),
      ).not.toThrow();
    }
  });

  it("rejects visible, hidden, pagination, membership, and moderation drift", () => {
    const blocked = scenario("ove184-community-blocked");
    const exact = exactResult(blocked.id);
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(blocked, {
        ...exact,
        visibleIds: exact.visibleIds.slice(1),
      }),
    ).toThrow(/visible journals/);
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(blocked, {
        ...exact,
        visibleIds: [
          ...exact.visibleIds.slice(1),
          blocked.expectedHiddenContributionIds[0]!,
        ],
      }),
    ).toThrow(/visible journals|hidden content/);
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(blocked, {
        ...exact,
        hasNextPage: !exact.hasNextPage,
      }),
    ).toThrow(/pagination/);

    const moderator = scenario("ove184-community-moderator");
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(moderator, {
        ...exactResult(moderator.id),
        isModerator: false,
      }),
    ).toThrow(/moderator/);

    const archived = scenario("ove184-community-archived");
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(archived, {
        ...exactResult(archived.id),
        lifecycleState: "active",
      }),
    ).toThrow(/archived/);
  });

  it("rejects unsafe media and private payloads", () => {
    const expected = scenario("ove184-community-typical");
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(expected, {
        ...exactResult(expected.id),
        publicDerivativeOnly: false,
      }),
    ).toThrow(/unsafe media/);
    expect(() =>
      assertVisualFixtureCommunityEvidenceResult(expected, {
        ...exactResult(expected.id),
        privatePayloadExcluded: false,
      }),
    ).toThrow(/private payload/);
  });
});
