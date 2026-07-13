import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureManifest,
  type VisualFixtureSocialScenario,
} from "@/lib/visual-fixtures/manifest";
import {
  findPublicEngagementTarget,
  getEngagementSummary,
  listEngagementBookmarks,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import {
  groupNotificationEvents,
  listFollowedFeedPage,
  listNotificationCenterPage,
} from "@/server/social-return-repository";
import { listWishlistShelfItems } from "@/server/wishlist-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureSocialActualResult {
  status: 200 | 410;
  visibleIds: readonly string[];
  hasNextPage: boolean;
  groupedItemCount: number | null;
  publicDerivativeOnly: boolean;
  privatePayloadExcluded: boolean;
}

export function assertVisualFixtureSocialEvidenceResult(
  expected: VisualFixtureSocialScenario,
  actual: VisualFixtureSocialActualResult,
) {
  if (actual.status !== expected.expectedStatus) {
    throw new Error(
      `Social evidence ${expected.id} returned ${actual.status}, expected ${expected.expectedStatus}.`,
    );
  }
  if (expected.expectedStatus === 410) return;

  assertSameMembers(
    expected.id,
    expected.expectedVisibleIds,
    actual.visibleIds,
  );
  const visible = new Set(actual.visibleIds);
  if (expected.expectedHiddenIds.some((id) => visible.has(id))) {
    throw new Error(`Social evidence ${expected.id} leaked a hidden item.`);
  }
  if (actual.visibleIds.length !== expected.expectedItemCount) {
    throw new Error(
      `Social evidence ${expected.id} count diverged from the manifest.`,
    );
  }
  if (actual.hasNextPage !== expected.expectedHasNextPage) {
    throw new Error(
      `Social evidence ${expected.id} pagination diverged from the manifest.`,
    );
  }
  if (!actual.publicDerivativeOnly) {
    throw new Error(`Social evidence ${expected.id} exposed unsafe media.`);
  }
  if (!actual.privatePayloadExcluded) {
    throw new Error(
      `Social evidence ${expected.id} exposed private payload text.`,
    );
  }

  if (
    expected.state === "grouped" &&
    (actual.groupedItemCount === null ||
      actual.groupedItemCount >= actual.visibleIds.length)
  ) {
    throw new Error(`Social evidence ${expected.id} did not form a group.`);
  }
  if (
    expected.state === "individual" &&
    actual.groupedItemCount !== actual.visibleIds.length
  ) {
    throw new Error(`Social evidence ${expected.id} changed individual rows.`);
  }
}

export async function verifyVisualFixtureSocialReturnEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  for (const expected of manifest.socialEvidence.scenarios) {
    const actual = await readSocialEvidence(expected, manifest, executor);
    assertVisualFixtureSocialEvidenceResult(expected, actual);
  }

  return manifest.socialEvidence.scenarios.length;
}

async function readSocialEvidence(
  expected: VisualFixtureSocialScenario,
  manifest: VisualFixtureManifest,
  executor: QueryExecutor,
): Promise<VisualFixtureSocialActualResult> {
  const scope = expected.actorId ? scopedToUser(expected.actorId) : null;

  if (expected.surface === "journal") {
    const target = {
      kind: expected.targetKind!,
      ref: expected.targetRef!,
    };
    const publicTarget = await findPublicEngagementTarget(
      target,
      executor,
      scope,
    );
    if (!publicTarget) return emptySocialResult(410);

    const page = await getEngagementSummary(target, scope, {}, executor);
    return {
      status: 200,
      visibleIds: page.comments.map((comment) => comment.replyToken),
      hasNextPage: Boolean(page.nextCommentCursor),
      groupedItemCount: null,
      publicDerivativeOnly: true,
      privatePayloadExcluded: true,
    };
  }

  if (!scope) {
    throw new Error(`Social evidence ${expected.id} requires an actor scope.`);
  }

  if (expected.surface === "feed") {
    const page = await listFollowedFeedPage(
      scope,
      { pageSize: manifest.socialEvidence.feedPageSize },
      executor,
    );
    const entryIdBySlug = new Map(
      manifest.entries.flatMap((entry) =>
        entry.publicSlug ? [[entry.publicSlug, entry.id] as const] : [],
      ),
    );
    return {
      status: 200,
      visibleIds: page.items.map(
        (item) =>
          entryIdBySlug.get(item.href.split("/").at(-1) ?? "") ??
          `unrecognized:${item.href}`,
      ),
      hasNextPage: Boolean(page.nextCursor),
      groupedItemCount: null,
      publicDerivativeOnly: page.items.every((item) =>
        isFixturePublicDerivative(item.mediaUrl, manifest),
      ),
      privatePayloadExcluded: true,
    };
  }

  if (expected.surface === "notifications") {
    const page = await listNotificationCenterPage(
      scope,
      "uk",
      { pageSize: manifest.socialEvidence.notificationPageSize },
      executor,
    );
    const serialized = JSON.stringify(page.items);
    const grouped = groupNotificationEvents(page.items);
    return {
      status: 200,
      visibleIds: page.items.map((item) => item.key),
      hasNextPage: Boolean(page.nextCursor),
      groupedItemCount:
        expected.state === "grouped" ? grouped.length : page.items.length,
      publicDerivativeOnly: true,
      privatePayloadExcluded:
        !manifest.socialEvidence.comments.some((comment) =>
          serialized.includes(comment.body),
        ) &&
        !/(?:latitude|longitude|coordinates?|gps|координат)/i.test(serialized),
    };
  }

  if (expected.surface === "bookmarks") {
    const items = await listEngagementBookmarks(scope, executor);
    return {
      status: 200,
      visibleIds: items.map((item) => item.target.ref),
      hasNextPage: items.length > manifest.socialEvidence.bookmarkPageSize,
      groupedItemCount: null,
      publicDerivativeOnly: true,
      privatePayloadExcluded: true,
    };
  }

  const items = await listWishlistShelfItems(scope, executor);
  return {
    status: 200,
    visibleIds: items.flatMap((item) =>
      item.catalog.publicSlug ? [item.catalog.publicSlug] : [],
    ),
    hasNextPage: items.length > 12,
    groupedItemCount: null,
    publicDerivativeOnly: true,
    privatePayloadExcluded: true,
  };
}

function emptySocialResult(status: 410): VisualFixtureSocialActualResult {
  return {
    status,
    visibleIds: [],
    hasNextPage: false,
    groupedItemCount: null,
    publicDerivativeOnly: true,
    privatePayloadExcluded: true,
  };
}

function assertSameMembers(
  id: string,
  expected: readonly string[],
  actual: readonly string[],
) {
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  if (
    expectedSorted.length !== actualSorted.length ||
    expectedSorted.some((item, index) => item !== actualSorted[index])
  ) {
    const expectedSet = new Set(expectedSorted);
    const actualSet = new Set(actualSorted);
    const missing = expectedSorted.filter((item) => !actualSet.has(item));
    const unexpected = actualSorted.filter((item) => !expectedSet.has(item));
    throw new Error(
      `Social evidence ${id} visible items diverged from the manifest (missing: ${missing.join(",") || "none"}; unexpected: ${unexpected.join(",") || "none"}).`,
    );
  }
}

function isFixturePublicDerivative(
  value: string | null,
  manifest: VisualFixtureManifest,
) {
  if (!value) return true;
  if (/quarantine|original/i.test(value)) return false;

  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    return manifest.media.some((media) =>
      pathname.endsWith(`/${media.derivativeKey}`),
    );
  } catch {
    return false;
  }
}
