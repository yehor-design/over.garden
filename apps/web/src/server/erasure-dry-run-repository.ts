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
    mediaAssetsTotal,
    mediaAssetsQuarantined,
    mediaAssetsProcessed,
    mediaAssetsFailed,
    publicSlugs,
    publicGoneTombstones,
    analyticsEvents,
    catalogProvisionalItems,
    plantObjectsUserAdded,
    searchPublicActiveEntries,
    searchPendingIndexJobs,
    searchPendingUnindexJobs,
    pilotInterviewRecords,
    erasureRequestsTotal,
  ] = await Promise.all([
    countAuthUserPresent(executor, requesterUserId),
    countAuthSessions(executor, requesterUserId),
    countAuthAccounts(executor, requesterUserId),
    countPilotInviteGrantPresent(executor, requesterUserId),
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
    countMediaAssets(executor, requesterUserId),
    countMediaAssets(executor, requesterUserId, "quarantined"),
    countMediaAssets(executor, requesterUserId, "processed"),
    countMediaAssets(executor, requesterUserId, "failed"),
    countJournalEntriesWithPublicSlug(executor, requesterUserId),
    countJournalEntriesWithPublicGone(executor, requesterUserId),
    countOwnedRows(executor, "analytics_events", requesterUserId),
    countCatalogProvisionalItems(executor, requesterUserId),
    countPlantObjectsUserAdded(executor, requesterUserId),
    countJournalEntries(executor, requesterUserId, {
      visibility: "public",
      lifecycleState: "active",
    }),
    countPendingJournalSearchJobs(executor, requesterUserId, "journal_entry_index"),
    countPendingJournalSearchJobs(
      executor,
      requesterUserId,
      "journal_entry_unindex",
    ),
    countPilotInterviewRecords(executor, requesterUserId),
    countErasureRequestsForUser(executor, requesterUserId),
  ]);

  return {
    authUserPresent,
    authSessions,
    authAccounts,
    pilotInviteGrantPresent,
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
    mediaAssetsTotal,
    mediaAssetsQuarantined,
    mediaAssetsProcessed,
    mediaAssetsFailed,
    publicSlugs,
    publicGoneTombstones,
    analyticsEvents,
    catalogProvisionalItems,
    plantObjectsUserAdded,
    searchPublicActiveEntries,
    searchPendingIndexJobs,
    searchPendingUnindexJobs,
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

export function buildCountOwnedRowsQuery(
  executor: QueryExecutor,
  table: "spaces" | "plant_objects" | "analytics_events",
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

async function countOwnedRows(
  executor: QueryExecutor,
  table: "spaces" | "plant_objects" | "analytics_events",
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

function toCount(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10);
  return value ?? 0;
}
