import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  assembleErasureDryRunPreview,
  type ErasureDryRunCounts,
  type ErasureDryRunPreview,
} from "@/server/erasure-dry-run";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export async function getErasureDryRunPreviewForRequest(input: {
  requestId: string;
  requesterUserId: string;
  executor?: QueryExecutor;
  now?: Date;
}): Promise<ErasureDryRunPreview> {
  const executor = input.executor ?? db;
  const counts = await collectErasureDryRunCounts(
    executor,
    input.requesterUserId,
  );

  return assembleErasureDryRunPreview({
    requestId: input.requestId,
    requesterUserId: input.requesterUserId,
    generatedAt: input.now ?? new Date(),
    counts,
  });
}

export async function collectErasureDryRunCounts(
  executor: QueryExecutor,
  requesterUserId: string,
): Promise<ErasureDryRunCounts> {
  const [
    authUserPresent,
    authSessions,
    authAccounts,
    pilotInviteGrantPresent,
    publicIdentityProfiles,
    currentHandleClaims,
    retiredHandleClaims,
    unreviewedIdentityRows,
    spaces,
    plantObjects,
    lineageProvenanceEdges,
    lineagePendingSourceIdentities,
    lineageProvenanceAuditEvents,
    lineageNodeFollows,
    lineageQuestions,
    journalEntriesTotal,
    journalEntriesPrivateActive,
    journalEntriesPublicActive,
    journalEntriesArchived,
    journalEntryObjectMentions,
    journalEntryCatalogMentions,
    mediaAssetsTotal,
    mediaAssetsQuarantined,
    mediaAssetsProcessed,
    mediaAssetsFailed,
    mediaAssetsCoverOnly,
    mediaAssetsWithExplicitCover,
    profileFollows,
    profileBlocks,
    wishlistItems,
    engagementComments,
    engagementBookmarks,
    notificationReceipts,
    communityMemberships,
    communityContributions,
    communityModerationActorRefs,
    publicSlugs,
    publicGoneTombstones,
    analyticsEvents,
    catalogProvisionalItems,
    plantObjectsUserAdded,
    catalogReviewerLinks,
    searchPublicActiveEntries,
    searchPendingIndexJobs,
    searchPendingUnindexJobs,
    searchTerminalJobsWithUserId,
    pilotInterviewRecords,
    erasureRequestsTotal,
  ] = await Promise.all([
    countAuthUserPresent(executor, requesterUserId),
    countAuthSessions(executor, requesterUserId),
    countAuthAccounts(executor, requesterUserId),
    countPilotInviteGrantPresent(executor, requesterUserId),
    countPublicIdentityProfiles(executor, requesterUserId),
    countHandleClaims(executor, requesterUserId, "current"),
    countHandleClaims(executor, requesterUserId, "retired"),
    countUnreviewedIdentityRows(executor, requesterUserId),
    countOwnedRows(executor, "spaces", requesterUserId),
    countOwnedRows(executor, "plant_objects", requesterUserId),
    countLineageProvenanceEdges(executor, requesterUserId),
    countLineagePendingSourceIdentities(executor, requesterUserId),
    countLineageProvenanceAuditEvents(executor, requesterUserId),
    countLineageNodeFollows(executor, requesterUserId),
    countLineageQuestions(executor, requesterUserId),
    countJournalEntries(executor, requesterUserId),
    countJournalEntries(executor, requesterUserId, {
      visibility: "private",
      lifecycleState: "active",
    }),
    countJournalEntries(executor, requesterUserId, {
      visibility: "public",
      lifecycleState: "active",
    }),
    countJournalEntries(executor, requesterUserId, {
      lifecycleState: "archived",
    }),
    countOwnedRows(executor, "journal_entry_object_mentions", requesterUserId),
    countOwnedRows(executor, "journal_entry_catalog_mentions", requesterUserId),
    countMediaAssets(executor, requesterUserId),
    countMediaAssets(executor, requesterUserId, "quarantined"),
    countMediaAssets(executor, requesterUserId, "processed"),
    countMediaAssets(executor, requesterUserId, "failed"),
    countCoverOnlyMediaAssets(executor, requesterUserId),
    countExplicitJournalCovers(executor, requesterUserId),
    countProfileSocialEdges(executor, requesterUserId),
    countProfileBlocks(executor, requesterUserId),
    countWishlistItems(executor, requesterUserId),
    countEngagementComments(executor, requesterUserId),
    countEngagementBookmarks(executor, requesterUserId),
    countNotificationReceipts(executor, requesterUserId),
    countCommunityMemberships(executor, requesterUserId),
    countCommunityContributions(executor, requesterUserId),
    countCommunityModerationActorRefs(executor, requesterUserId),
    countJournalEntriesWithPublicSlug(executor, requesterUserId),
    countJournalEntriesWithPublicGone(executor, requesterUserId),
    countOwnedRows(executor, "analytics_events", requesterUserId),
    countCatalogProvisionalItems(executor, requesterUserId),
    countPlantObjectsUserAdded(executor, requesterUserId),
    countCatalogReviewerLinks(executor, requesterUserId),
    countJournalEntries(executor, requesterUserId, {
      visibility: "public",
      lifecycleState: "active",
    }),
    countPendingJournalSearchJobs(
      executor,
      requesterUserId,
      "journal_entry_index",
    ),
    countPendingJournalSearchJobs(
      executor,
      requesterUserId,
      "journal_entry_unindex",
    ),
    countTerminalJobQueueRowsWithUserId(executor, requesterUserId),
    countPilotInterviewRecords(executor, requesterUserId),
    countErasureRequestsForUser(executor, requesterUserId),
  ]);

  return {
    authUserPresent,
    authSessions,
    authAccounts,
    pilotInviteGrantPresent,
    publicIdentityProfiles,
    currentHandleClaims,
    retiredHandleClaims,
    unreviewedIdentityRows,
    spaces,
    plantObjects,
    lineageProvenanceEdges,
    lineagePendingSourceIdentities,
    lineageProvenanceAuditEvents,
    lineageNodeFollows,
    lineageQuestions,
    journalEntriesTotal,
    journalEntriesPrivateActive,
    journalEntriesPublicActive,
    journalEntriesArchived,
    journalEntryObjectMentions,
    journalEntryCatalogMentions,
    mediaAssetsTotal,
    mediaAssetsQuarantined,
    mediaAssetsProcessed,
    mediaAssetsFailed,
    mediaAssetsCoverOnly,
    mediaAssetsWithExplicitCover,
    profileFollows,
    profileBlocks,
    wishlistItems,
    engagementComments,
    engagementBookmarks,
    notificationReceipts,
    communityMemberships,
    communityContributions,
    communityModerationActorRefs,
    publicSlugs,
    publicGoneTombstones,
    analyticsEvents,
    catalogProvisionalItems,
    plantObjectsUserAdded,
    catalogReviewerLinks,
    searchPublicActiveEntries,
    searchPendingIndexJobs,
    searchPendingUnindexJobs,
    searchTerminalJobsWithUserId,
    pilotInterviewRecords,
    erasureRequestsTotal,
  };
}

export function buildCountAuthUserPresentQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("user")
    .select(sql<number>`count(*)`.as("count"))
    .where("id", "=", requesterUserId);
}

export function buildCountAuthSessionsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("session")
    .select(sql<number>`count(*)`.as("count"))
    .where("userId", "=", requesterUserId);
}

export function buildCountAuthAccountsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("account")
    .select(sql<number>`count(*)`.as("count"))
    .where("userId", "=", requesterUserId);
}

export function buildCountPilotInviteGrantPresentQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .select(sql<number>`count(*)`.as("count"))
    .where("user_id", "=", requesterUserId);
}

export function buildCountPublicIdentityProfilesQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select(sql<number>`count(*)`.as("count"))
    .where("user_id", "=", requesterUserId);
}

export function buildCountHandleClaimsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  lifecycleState: "current" | "retired",
) {
  return executor
    .selectFrom("user_handle_registry")
    .select(sql<number>`count(*)`.as("count"))
    .where("user_id", "=", requesterUserId)
    .where("lifecycle_state", "=", lifecycleState);
}

export function buildCountUnreviewedIdentityRowsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select(
      sql<number>`(
        case
          when identity_policy_version = 'legacy-unreviewed'
            or display_name_policy_version = 'legacy-unreviewed'
          then 1 else 0
        end
        + (
          select count(*)::int
          from user_handle_registry registry
          where registry.user_id = ${requesterUserId}
            and registry.policy_version = 'legacy-unreviewed'
        )
      )`.as("count"),
    )
    .where("user_id", "=", requesterUserId);
}

export function buildCountOwnedRowsQuery(
  executor: QueryExecutor,
  table:
    | "spaces"
    | "plant_objects"
    | "journal_entry_object_mentions"
    | "journal_entry_catalog_mentions"
    | "analytics_events",
  requesterUserId: string,
) {
  return executor
    .selectFrom(table)
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);
}

export function buildCountLineageProvenanceEdgesQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("owner_user_id", "=", requesterUserId),
        eb("source_owner_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountLineageProvenanceAuditEventsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edge_audit_events")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("actor_user_id", "=", requesterUserId),
        eb("target_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountLineagePendingSourceIdentitiesQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("lineage_pending_source_identities")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("created_by_user_id", "=", requesterUserId),
        eb("claimed_by_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountLineageNodeFollowsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("follower_user_id", "=", requesterUserId),
        eb("target_owner_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountLineageQuestionsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("lineage_questions")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("asker_user_id", "=", requesterUserId),
        eb("recipient_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountJournalEntriesQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  filters: {
    visibility?: "private" | "public";
    lifecycleState?: "active" | "archived";
  } = {},
) {
  let query = executor
    .selectFrom("journal_entries")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);

  if (filters.visibility) {
    query = query.where("visibility", "=", filters.visibility);
  }

  if (filters.lifecycleState) {
    query = query.where("lifecycle_state", "=", filters.lifecycleState);
  }

  return query;
}

export function buildCountJournalEntriesWithPublicSlugQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId)
    .where("public_slug", "is not", null);
}

export function buildCountJournalEntriesWithPublicGoneQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId)
    .where("public_gone_at", "is not", null);
}

export function buildCountMediaAssetsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  status?: "quarantined" | "processed" | "failed",
) {
  let query = executor
    .selectFrom("media_assets")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);

  if (status) {
    query = query.where("status", "=", status);
  }

  return query;
}

export function buildCountCatalogProvisionalItemsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select(sql<number>`count(*)`.as("count"))
    .where("created_by_user_id", "=", requesterUserId)
    .where("status", "=", "provisional");
}

export function buildCountPlantObjectsUserAddedQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId)
    .where("variety_state", "=", "user_added");
}

export function buildCountPendingJournalSearchJobsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  kind: "journal_entry_index" | "journal_entry_unindex",
) {
  return executor
    .selectFrom("job_queue")
    .select(sql<number>`count(*)`.as("count"))
    .where("status", "in", ["pending", "processing", "failed"])
    .where(sql`payload->>'userId'`, "=", requesterUserId)
    .where(sql`payload->>'kind'`, "=", kind);
}

export function buildCountPilotInterviewRecordsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("pilot_interview_learnings")
    .select(sql<number>`count(*)`.as("count"))
    .where("subject_user_id", "=", requesterUserId);
}

export function buildCountErasureRequestsForUserQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("erasure_requests")
    .select(sql<number>`count(*)`.as("count"))
    .where("requester_user_id", "=", requesterUserId);
}

export function buildCountCoverOnlyMediaAssetsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("media_assets")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId)
    .where("usage_role", "=", "cover_only");
}

export function buildCountExplicitJournalCoversQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId)
    .where("cover_media_asset_id", "is not", null);
}

export function buildCountProfileSocialEdgesQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("profile_follows")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("follower_user_id", "=", requesterUserId),
        eb("target_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountProfileBlocksQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("profile_blocks")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("blocker_user_id", "=", requesterUserId),
        eb("blocked_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountWishlistItemsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("wishlist_items")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);
}

export function buildCountEngagementCommentsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("engagement_comments")
    .select(sql<number>`count(*)`.as("count"))
    .where("author_user_id", "=", requesterUserId);
}

export function buildCountEngagementBookmarksQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("engagement_bookmarks")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);
}

export function buildCountNotificationReceiptsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("notification_receipts")
    .select(sql<number>`count(*)`.as("count"))
    .where("owner_user_id", "=", requesterUserId);
}

export function buildCountCommunityMembershipsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("community_memberships")
    .select(sql<number>`count(*)`.as("count"))
    .where("user_id", "=", requesterUserId);
}

export function buildCountCommunityContributionsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("community_contributions")
    .select(sql<number>`count(*)`.as("count"))
    .where((eb) =>
      eb.or([
        eb("contributor_user_id", "=", requesterUserId),
        eb("removed_by_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildCountCommunityModerationActorRefsQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return sql<{ count: number }>`
    select (
      (select count(*)::int from community_contribution_reports
        where resolved_by_user_id = ${requesterUserId})
      + (select count(*)::int from community_moderation_audit_log
        where actor_user_id = ${requesterUserId})
    ) as count
  `.execute(executor);
}

export function buildCountCatalogReviewerLinksQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return sql<{ count: number }>`
    select (
      (select count(*)::int from catalog_items
        where reviewed_by_user_id = ${requesterUserId}
           or created_by_user_id = ${requesterUserId})
      + (select count(*)::int from catalog_match_suggestions
        where reviewed_by_user_id = ${requesterUserId})
      + (select count(*)::int from catalog_alias_projections
        where reviewed_by_user_id = ${requesterUserId})
      + (select count(*)::int from variety_seed_proofs
        where author_user_id = ${requesterUserId})
    ) as count
  `.execute(executor);
}

export function buildCountTerminalJobQueueRowsWithUserIdQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("job_queue")
    .select(sql<number>`count(*)`.as("count"))
    .where("status", "=", "done")
    .where(sql`payload->>'userId'`, "=", requesterUserId);
}

async function countAuthUserPresent(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountAuthUserPresentQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countAuthSessions(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountAuthSessionsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countAuthAccounts(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountAuthAccountsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countPilotInviteGrantPresent(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountPilotInviteGrantPresentQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countPublicIdentityProfiles(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountPublicIdentityProfilesQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countHandleClaims(
  executor: QueryExecutor,
  requesterUserId: string,
  lifecycleState: "current" | "retired",
) {
  const row = await buildCountHandleClaimsQuery(
    executor,
    requesterUserId,
    lifecycleState,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countUnreviewedIdentityRows(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountUnreviewedIdentityRowsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countOwnedRows(
  executor: QueryExecutor,
  table:
    | "spaces"
    | "plant_objects"
    | "journal_entry_object_mentions"
    | "journal_entry_catalog_mentions"
    | "analytics_events",
  requesterUserId: string,
) {
  const row = await buildCountOwnedRowsQuery(
    executor,
    table,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countLineageProvenanceEdges(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountLineageProvenanceEdgesQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countLineageProvenanceAuditEvents(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountLineageProvenanceAuditEventsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countLineagePendingSourceIdentities(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountLineagePendingSourceIdentitiesQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countLineageNodeFollows(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountLineageNodeFollowsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countLineageQuestions(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountLineageQuestionsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countJournalEntries(
  executor: QueryExecutor,
  requesterUserId: string,
  filters: {
    visibility?: "private" | "public";
    lifecycleState?: "active" | "archived";
  } = {},
) {
  const row = await buildCountJournalEntriesQuery(
    executor,
    requesterUserId,
    filters,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countJournalEntriesWithPublicSlug(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountJournalEntriesWithPublicSlugQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countJournalEntriesWithPublicGone(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountJournalEntriesWithPublicGoneQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countMediaAssets(
  executor: QueryExecutor,
  requesterUserId: string,
  status?: "quarantined" | "processed" | "failed",
) {
  const row = await buildCountMediaAssetsQuery(
    executor,
    requesterUserId,
    status,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countCatalogProvisionalItems(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountCatalogProvisionalItemsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countPlantObjectsUserAdded(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountPlantObjectsUserAddedQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countPendingJournalSearchJobs(
  executor: QueryExecutor,
  requesterUserId: string,
  kind: "journal_entry_index" | "journal_entry_unindex",
) {
  const row = await buildCountPendingJournalSearchJobsQuery(
    executor,
    requesterUserId,
    kind,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countPilotInterviewRecords(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountPilotInterviewRecordsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countErasureRequestsForUser(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountErasureRequestsForUserQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countCoverOnlyMediaAssets(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountCoverOnlyMediaAssetsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countExplicitJournalCovers(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountExplicitJournalCoversQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countProfileSocialEdges(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountProfileSocialEdgesQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countProfileBlocks(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountProfileBlocksQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countWishlistItems(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountWishlistItemsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countEngagementComments(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountEngagementCommentsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countEngagementBookmarks(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountEngagementBookmarksQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countNotificationReceipts(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountNotificationReceiptsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countCommunityMemberships(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountCommunityMembershipsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countCommunityContributions(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountCommunityContributionsQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

async function countCommunityModerationActorRefs(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const result = await buildCountCommunityModerationActorRefsQuery(
    executor,
    requesterUserId,
  );
  return toCount(result.rows[0]?.count);
}

async function countCatalogReviewerLinks(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const result = await buildCountCatalogReviewerLinksQuery(
    executor,
    requesterUserId,
  );
  return toCount(result.rows[0]?.count);
}

async function countTerminalJobQueueRowsWithUserId(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  const row = await buildCountTerminalJobQueueRowsWithUserIdQuery(
    executor,
    requesterUserId,
  ).executeTakeFirst();
  return toCount(row?.count);
}

function toCount(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10);
  return value ?? 0;
}
