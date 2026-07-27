import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureCommunityScenario,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";
import { getPublicCommunityPage } from "@/server/community-repository";
import { scopedToUser } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureCommunityActualResult {
  status: 200 | 404;
  visibleIds: readonly string[];
  totalCount: number;
  hasNextPage: boolean;
  membershipState: "active" | "left" | "banned" | null;
  isModerator: boolean;
  lifecycleState: string | null;
  participationState: string | null;
  pendingReportContributionIds: readonly string[];
  closedDiscussionContributionIds: readonly string[];
  publicDerivativeOnly: boolean;
  privatePayloadExcluded: boolean;
}

export function assertVisualFixtureCommunityEvidenceResult(
  expected: VisualFixtureCommunityScenario,
  actual: VisualFixtureCommunityActualResult,
) {
  if (actual.status !== expected.expectedStatus) {
    throw new Error(
      `Community evidence ${expected.id} returned ${actual.status}, expected ${expected.expectedStatus}.`,
    );
  }
  if (expected.expectedStatus === 404) return;

  if (
    !sameOrderedValues(
      expected.expectedVisibleContributionIds,
      actual.visibleIds,
    )
  ) {
    throw new Error(
      `Community evidence ${expected.id} visible journals diverged from the manifest.`,
    );
  }
  const visible = new Set(actual.visibleIds);
  if (expected.expectedHiddenContributionIds.some((id) => visible.has(id))) {
    throw new Error(`Community evidence ${expected.id} leaked hidden content.`);
  }
  if (actual.totalCount !== expected.expectedItemCount) {
    throw new Error(
      `Community evidence ${expected.id} total count diverged from the manifest.`,
    );
  }
  if (actual.hasNextPage !== expected.expectedHasNextPage) {
    throw new Error(
      `Community evidence ${expected.id} pagination diverged from the manifest.`,
    );
  }
  if (actual.membershipState !== expected.expectedMembershipState) {
    throw new Error(
      `Community evidence ${expected.id} membership diverged from the manifest.`,
    );
  }
  if (expected.actorRole === "moderator" && !actual.isModerator) {
    throw new Error(`Community evidence ${expected.id} lost moderator access.`);
  }
  if (
    expected.state === "pending-report" &&
    actual.pendingReportContributionIds.length === 0
  ) {
    throw new Error(
      `Community evidence ${expected.id} lost its pending report.`,
    );
  }
  if (
    expected.state === "closed-discussion" &&
    actual.closedDiscussionContributionIds.length === 0
  ) {
    throw new Error(
      `Community evidence ${expected.id} lost its closed discussion.`,
    );
  }
  if (
    expected.state === "closed-participation" &&
    actual.participationState !== "closed"
  ) {
    throw new Error(
      `Community evidence ${expected.id} reopened participation unexpectedly.`,
    );
  }
  if (expected.state === "archived" && actual.lifecycleState !== "archived") {
    throw new Error(
      `Community evidence ${expected.id} lost its archived read-only state.`,
    );
  }
  if (!actual.publicDerivativeOnly) {
    throw new Error(`Community evidence ${expected.id} exposed unsafe media.`);
  }
  if (!actual.privatePayloadExcluded) {
    throw new Error(
      `Community evidence ${expected.id} exposed private payload.`,
    );
  }
}

export async function verifyVisualFixtureCommunityEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  for (const expected of manifest.communityEvidence.scenarios) {
    const actual = await readCommunityEvidence(expected, executor);
    assertVisualFixtureCommunityEvidenceResult(expected, actual);
  }
  return manifest.communityEvidence.scenarios.length;
}

async function readCommunityEvidence(
  expected: VisualFixtureCommunityScenario,
  executor: QueryExecutor,
): Promise<VisualFixtureCommunityActualResult> {
  const url = new URL(expected.path, "https://visual-fixtures.invalid");
  const query = url.searchParams.get("q");
  const kindValue = url.searchParams.get("kind");
  const kind =
    kindValue === "plant" || kindValue === "animal" ? kindValue : "all";
  const viewerScope = expected.actorId ? scopedToUser(expected.actorId) : null;
  const community = await getPublicCommunityPage(expected.communitySlug, "uk", {
    viewerScope,
    query,
    kind,
    executor,
    mediaUrlForKey: (key) =>
      `https://visual-fixtures.invalid/${encodeURI(key)}`,
  });
  if (!community) return emptyCommunityEvidence(404);

  const stateSuppressesRows =
    expected.state === "loading" || expected.state === "error";
  const items = stateSuppressesRows ? [] : community.contributions.items;
  const filteredResult = Boolean(query) || kind !== "all";
  const serialized = JSON.stringify(community);
  const mediaUrls = [
    community.coverUrl,
    ...community.contributions.items.map((item) => item.coverUrl),
  ].filter((value): value is string => Boolean(value));

  return {
    status: 200,
    visibleIds: items.map((item) => item.id),
    totalCount: stateSuppressesRows
      ? 0
      : filteredResult
        ? items.length
        : community.activeContributionCount,
    hasNextPage: stateSuppressesRows
      ? false
      : Boolean(community.contributions.nextCursor),
    membershipState: community.viewer.membershipState,
    isModerator: community.viewer.isModerator,
    lifecycleState: community.lifecycleState,
    participationState: community.participationState,
    pendingReportContributionIds: community.contributions.items
      .filter((item) => item.viewerReportState !== null)
      .map((item) => item.id),
    closedDiscussionContributionIds: community.contributions.items
      .filter((item) => item.discussionState === "closed")
      .map((item) => item.id),
    publicDerivativeOnly: mediaUrls.every(
      (value) =>
        value.startsWith("https://visual-fixtures.invalid/") &&
        !/quarantine|original/i.test(value),
    ),
    privatePayloadExcluded:
      !/ownerUserId|quarantineKey|latitude|longitude|coordinates|sessionId|email/i.test(
        serialized,
      ),
  };
}

function emptyCommunityEvidence(
  status: 404,
): VisualFixtureCommunityActualResult {
  return {
    status,
    visibleIds: [],
    totalCount: 0,
    hasNextPage: false,
    membershipState: null,
    isModerator: false,
    lifecycleState: null,
    participationState: null,
    pendingReportContributionIds: [],
    closedDiscussionContributionIds: [],
    publicDerivativeOnly: true,
    privatePayloadExcluded: true,
  };
}

function sameOrderedValues(
  expected: readonly string[],
  actual: readonly string[],
) {
  return (
    expected.length === actual.length &&
    expected.every((value, index) => value === actual[index])
  );
}
