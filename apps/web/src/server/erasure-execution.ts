import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import { formatErasureRequestReference } from "@/lib/privacy/disclosures";
import { revokeMediaObjectBytes } from "@/server/media/lifecycle-revoke";
import type { RequestScope } from "@/server/request-scope";
import {
  arePublicProjectionsConverged,
  convergePublicProjectionsNow,
  recordPublicProjectionIntent,
} from "@/server/search/public-projection-outbox";
import { ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID } from "@/server/system-actors";

const OPEN_REQUEST_STATUSES = ["submitted", "reviewing"] as const;
const ERASURE_MEDIA_DELETE_KIND = "erasure_media_object_delete";
const ERASURE_QUEUE_NAME = "erasure";
const ERASED_ENTRY_TITLE = "Erased journal entry";
const ERASED_ENTRY_BODY = "This entry was erased by request.";
const ERASED_SPACE_NAME = "Erased garden";
const ERASED_OBJECT_NAME = "Erased object";
const ERASED_LINEAGE_QUESTION_TEXT =
  "This lineage question was erased by request.";
export { ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID } from "@/server/system-actors";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type ErasureMediaObjectReference = {
  bucket: "public_derivative";
  objectKey: string;
};

export interface ExecuteApprovedErasureRequestInput {
  requestId: string;
  approvalText: string;
}

export interface ExecuteApprovedErasureRequestDeps {
  executor?: Kysely<Database>;
  now?: Date;
  erasedSubjectUserId?: string;
  deleteMediaObject?: (reference: ErasureMediaObjectReference) => Promise<void>;
}

export interface ErasureExecutionSummary {
  requestId: string;
  erasedSubjectUserId: string;
  requesterUserId: string;
  mediaObjectsDeleted: number;
  publicEntriesQueuedForUnindex: number;
  handledStatus: "cleanup_pending" | "completed";
}

export async function executeApprovedErasureRequest(
  scope: RequestScope,
  input: ExecuteApprovedErasureRequestInput,
  deps: ExecuteApprovedErasureRequestDeps = {},
): Promise<ErasureExecutionSummary> {
  const requestId = normalizeErasureRequestId(input.requestId);
  assertMaintainerApprovalPhrase(requestId, input.approvalText);

  const executor = deps.executor ?? db;
  const now = deps.now ?? new Date();
  const deleteMediaObject = deps.deleteMediaObject ?? deleteR2MediaObject;

  const existing = await buildLoadErasureRequestForExecutionQuery(
    executor,
    requestId,
  ).executeTakeFirst();

  if (!existing) {
    throw new Error(
      "Erasure request must be open and dry-run reviewed, or already in cleanup_pending, before irreversible execution.",
    );
  }

  if (existing.handledStatus === "completed") {
    return {
      requestId,
      erasedSubjectUserId: existing.requesterUserId,
      requesterUserId: existing.requesterUserId,
      mediaObjectsDeleted: 0,
      publicEntriesQueuedForUnindex: 0,
      handledStatus: "completed",
    };
  }

  let erasedSubjectUserId = deps.erasedSubjectUserId ?? randomUUID();
  let requesterUserId = existing.requesterUserId;
  let publicEntriesQueuedForUnindex = 0;

  if (existing.handledStatus !== "cleanup_pending") {
    erasedSubjectUserId = deps.erasedSubjectUserId ?? randomUUID();
    requesterUserId = existing.requesterUserId;

    const publicEntries = await executor.transaction().execute(async (trx) => {
      const request = await buildExecutableErasureRequestQuery(
        trx,
        requestId,
      ).executeTakeFirst();

      if (!request) {
        throw new Error(
          "Erasure request must remain open and dry-run reviewed during execution.",
        );
      }

      const mediaObjects = await listMediaObjectReferencesForErasure(
        trx,
        requesterUserId,
      );
      const publicEntryRows =
        await buildListPublicJournalEntriesForErasureQuery(
          trx,
          requesterUserId,
        ).execute();

      for (const mediaObject of mediaObjects) {
        await buildEnqueueErasureMediaDeleteJobQuery(trx, {
          requestId,
          mediaObject,
        }).executeTakeFirst();
      }

      await buildClearJournalCoverMediaForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildDeleteVerificationRowsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteAuthSessionsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteAuthAccountsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteLearningActorAttributionForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteOwnedAnalyticsEventsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteOwnedMediaAssetsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildScrubAllJobQueuePayloadsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteOwnedJournalEntryObjectMentionsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteOwnedJournalEntryCatalogMentionsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildDeleteOwnedJournalMutationReceiptsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();

      await buildDetachOwnedPlantObjectsFromUserCatalogForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildDeleteOwnedProvisionalCatalogItemsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();
      await buildAnonymizeOwnedCatalogOperatorFieldsForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildAnonymizeCatalogMatchReviewersForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildAnonymizeCatalogAliasReviewersForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildAnonymizeVarietySeedProofAuthorsForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildAnonymizeLineageProvenanceEdgesForErasureQuery(trx, {
        requesterUserId,
        now,
      }).execute();
      await buildAnonymizeLineagePendingSourceIdentitiesForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildAnonymizeLineageClaimAuditEventsForErasureQuery(
        trx,
        requesterUserId,
      ).execute();

      await buildRekeyCommunityModerationActorsForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId: ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID,
        now,
      }).execute();

      await buildAnonymizeSpacesForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildAnonymizePlantObjectsForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildAnonymizeLineageNodeFollowsForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildAnonymizeLineageQuestionsForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildAnonymizeJournalEntriesForErasureQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();

      // OVE-242/OVE-215: the removal intent for every public entry is written
      // in the same transaction as the erasure itself, keyed to the synthetic
      // erased-subject id. Erasure can no longer be recorded as executed while
      // nothing durable owes the public index a deletion.
      for (const entry of publicEntryRows) {
        await recordPublicProjectionIntent(trx, {
          entityId: entry.id,
          ownerUserId: erasedSubjectUserId,
          desiredState: "absent",
          reason: "erasure",
        });
      }

      await buildNullErasureOperatorLinksForErasureQuery(
        trx,
        requesterUserId,
        now,
      ).execute();
      await buildAnonymizeErasureRequestSubjectsQuery(trx, {
        requesterUserId,
        erasedSubjectUserId,
        now,
      }).execute();
      await buildMarkErasureCleanupPendingQuery(trx, scope, {
        requestId,
        now,
      }).executeTakeFirstOrThrow();
      await buildDeleteAuthUserForErasureQuery(trx, requesterUserId).execute();

      return publicEntryRows;
    });

    publicEntriesQueuedForUnindex = publicEntries.length;
  } else {
    erasedSubjectUserId = existing.requesterUserId;
    requesterUserId = existing.requesterUserId;
  }

  const mediaObjectsDeleted = await processErasureMediaCleanupJobs(
    executor,
    requestId,
    deleteMediaObject,
  );
  const mediaCleanupConverged = await areErasureMediaCleanupJobsConverged(
    executor,
    requestId,
  );

  // OVE-242/OVE-215: erasure is only `completed` once every public projection
  // it owes has verifiably converged to absence. A queued or retrying removal
  // keeps the request in `cleanup_pending`, so the product never claims a
  // deletion it has not proved.
  const erasedEntryIds = await listErasureProjectionEntityIds(
    executor,
    requestId,
    erasedSubjectUserId,
  );
  await convergePublicProjectionsNow(erasedEntryIds, executor);
  const publicProjectionsConverged = await arePublicProjectionsConverged(
    erasedEntryIds,
    executor,
  );

  if (!mediaCleanupConverged || !publicProjectionsConverged) {
    await buildMarkErasureCleanupPendingQuery(executor, scope, {
      requestId,
      now,
    }).executeTakeFirstOrThrow();

    return {
      requestId,
      erasedSubjectUserId,
      requesterUserId,
      mediaObjectsDeleted,
      publicEntriesQueuedForUnindex,
      handledStatus: "cleanup_pending",
    };
  }

  await buildCompleteApprovedErasureRequestQuery(executor, scope, {
    requestId,
    now,
  }).executeTakeFirstOrThrow();

  return {
    requestId,
    erasedSubjectUserId,
    requesterUserId,
    mediaObjectsDeleted,
    publicEntriesQueuedForUnindex,
    handledStatus: "completed",
  };
}

export async function areErasureMediaCleanupJobsConverged(
  executor: QueryExecutor,
  requestId: string,
): Promise<boolean> {
  const row = await buildCountUnconvergedErasureMediaCleanupJobsQuery(
    executor,
    requestId,
  ).executeTakeFirst();
  return Number(row?.count ?? 0) === 0;
}

export function buildCountUnconvergedErasureMediaCleanupJobsQuery(
  executor: QueryExecutor,
  requestId: string,
) {
  return executor
    .selectFrom("job_queue")
    .select(sql<number>`count(*)`.as("count"))
    .where("queue_name", "=", ERASURE_QUEUE_NAME)
    .where(sql`payload->>'kind'`, "=", ERASURE_MEDIA_DELETE_KIND)
    .where(sql`payload->>'requestId'`, "=", requestId)
    .where("status", "!=", "done");
}

/**
 * OVE-242. Ids of the public projections this erasure owes. Reads the outbox by
 * the synthetic erased-subject id, so a resumed `cleanup_pending` execution
 * sees exactly the same set as the first pass.
 */
async function listErasureProjectionEntityIds(
  executor: Kysely<Database>,
  requestId: string,
  erasedSubjectUserId: string,
): Promise<string[]> {
  const rows = await executor
    .selectFrom("public_projection_intents")
    .select("entity_id as entityId")
    .where("entity_kind", "=", "journal_entry")
    .where("owner_user_id", "=", erasedSubjectUserId)
    .where("desired_reason", "=", "erasure")
    .execute();
  void requestId;
  return rows.map((row) => row.entityId);
}

export function expectedErasureMaintainerApprovalText(requestId: string) {
  return `APPROVE ${formatErasureRequestReference(
    normalizeErasureRequestId(requestId),
  )} IRREVERSIBLE ERASURE`;
}

export function buildExecutableErasureRequestQuery(
  executor: QueryExecutor,
  requestId: string,
) {
  return executor
    .selectFrom("erasure_requests")
    .select([
      "id",
      "requester_user_id as requesterUserId",
      "dry_run_reviewed_at as dryRunReviewedAt",
      "handled_status as handledStatus",
    ])
    .where("id", "=", requestId)
    .where("status", "in", OPEN_REQUEST_STATUSES)
    .where("dry_run_reviewed_at", "is not", null)
    .limit(1);
}

export function buildLoadErasureRequestForExecutionQuery(
  executor: QueryExecutor,
  requestId: string,
) {
  return executor
    .selectFrom("erasure_requests")
    .select([
      "id",
      "requester_user_id as requesterUserId",
      "dry_run_reviewed_at as dryRunReviewedAt",
      "handled_status as handledStatus",
      "status",
    ])
    .where("id", "=", requestId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("status", "in", [...OPEN_REQUEST_STATUSES]),
          eb("dry_run_reviewed_at", "is not", null),
        ]),
        eb.and([
          eb("status", "=", "handled"),
          eb("handled_status", "in", ["cleanup_pending", "completed"]),
        ]),
      ]),
    )
    .limit(1);
}

export function buildListMediaObjectsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("media_assets")
    .select("derivative_key as derivativeKey")
    .where("owner_user_id", "=", requesterUserId);
}

/**
 * OVE-353: deletion-pending entries are erasure candidates too, not just
 * active ones. The owner's own delete already recorded an absent intent, but
 * that intent can reach `dead` after its bounded attempts and nothing would
 * retry it. Erasure is exactly where that has to be repaired, so it re-asserts
 * absence under its own stronger reason rather than trusting the earlier one.
 */
export function buildListPublicJournalEntriesForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["id", "public_slug as publicSlug"])
    .where("owner_user_id", "=", requesterUserId)
    .where("visibility", "=", "public")
    .where("lifecycle_state", "in", ["active", "deleted_retention"])
    .where("public_slug", "is not", null);
}

export function buildDeleteVerificationRowsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("verification")
    .where(
      "identifier",
      "in",
      executor
        .selectFrom("user")
        .select("email")
        .where("id", "=", requesterUserId),
    );
}

export function buildDeleteAuthSessionsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor.deleteFrom("session").where("userId", "=", requesterUserId);
}

export function buildDeleteAuthAccountsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor.deleteFrom("account").where("userId", "=", requesterUserId);
}

export function buildDeleteAuthUserForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor.deleteFrom("user").where("id", "=", requesterUserId);
}

export function buildDeleteLearningActorAttributionForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("learning_actor_attributions")
    .where("user_id", "=", requesterUserId);
}

export function buildDeleteOwnedAnalyticsEventsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("analytics_events")
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDeleteOwnedMediaAssetsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("media_assets")
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDeletePendingJournalSearchJobsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return buildScrubAllJobQueuePayloadsForErasureQuery(
    executor,
    requesterUserId,
  );
}

export function buildScrubAllJobQueuePayloadsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("job_queue")
    .where((eb) =>
      eb.or([
        eb(sql`payload->>'userId'`, "=", requesterUserId),
        eb(sql`payload::text`, "like", `%${requesterUserId}%`),
      ]),
    );
}

export function buildClearJournalCoverMediaForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("journal_entries")
    .set({
      cover_media_asset_id: null,
      updated_at: now,
    })
    .where("owner_user_id", "=", requesterUserId)
    .where("cover_media_asset_id", "is not", null);
}

export function buildDeleteOwnedJournalEntryObjectMentionsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("journal_entry_object_mentions")
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDeleteOwnedJournalEntryCatalogMentionsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("journal_entry_catalog_mentions")
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDeleteOwnedJournalMutationReceiptsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("journal_entry_mutation_receipts")
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDetachOwnedPlantObjectsFromUserCatalogForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("plant_objects")
    .set({
      catalog_item_id: null,
      variety_text: null,
      variety_state: "unknown",
      updated_at: now,
    })
    .where("owner_user_id", "=", requesterUserId);
}

export function buildDeleteOwnedProvisionalCatalogItemsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("catalog_items")
    .where("created_by_user_id", "=", requesterUserId)
    .where("status", "=", "provisional");
}

export function buildAnonymizeOwnedCatalogOperatorFieldsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_items")
    .set({
      created_by_user_id: null,
      reviewed_by_user_id: null,
      updated_at: now,
    })
    .where((eb) =>
      eb.or([
        eb("created_by_user_id", "=", requesterUserId),
        eb("reviewed_by_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildAnonymizeLineageProvenanceEdgesForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_provenance_edges")
    .set({
      consent_state: "anonymized",
      erasure_state: "anonymized",
      source_owner_user_id: sql<string | null>`case
        when source_kind = 'source_reference'
          and source_reference_kind = 'person'
          and source_owner_user_id = ${input.requesterUserId}
        then null
        else source_owner_user_id
      end`,
      source_reference_label: sql<string | null>`case
        when source_kind = 'source_reference'
          and source_reference_kind = 'person'
          and source_owner_user_id is not null
          and source_owner_user_id <> ${input.requesterUserId}
        then null
        when source_kind = 'source_reference' then 'Erased source'
        else source_reference_label
      end`,
      client_mutation_id: sql<string>`'erased:' || "lineage_provenance_edges"."id"::text`,
      updated_at: input.now,
    })
    .where((eb) =>
      eb.or([
        eb("owner_user_id", "=", input.requesterUserId),
        eb("source_owner_user_id", "=", input.requesterUserId),
        eb.exists(
          eb
            .selectFrom("lineage_pending_source_identities")
            .select(sql`1`.as("one"))
            .whereRef(
              "lineage_pending_source_identities.id",
              "=",
              "lineage_provenance_edges.source_pending_identity_id",
            )
            .where((innerEb) =>
              innerEb.or([
                innerEb(
                  "lineage_pending_source_identities.created_by_user_id",
                  "=",
                  input.requesterUserId,
                ),
                innerEb(
                  "lineage_pending_source_identities.claimed_by_user_id",
                  "=",
                  input.requesterUserId,
                ),
              ]),
            ),
        ),
      ]),
    );
}

export function buildAnonymizeLineagePendingSourceIdentitiesForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("lineage_pending_source_identities")
    .set({
      display_label: "Erased pending source",
      invite_state: "anonymized",
      created_by_user_id: sql<string | null>`case
        when created_by_user_id = ${requesterUserId} then null
        else created_by_user_id
      end`,
      claimed_by_user_id: sql<string | null>`case
        when claimed_by_user_id = ${requesterUserId} then null
        else claimed_by_user_id
      end`,
      updated_at: now,
    })
    .where((eb) =>
      eb.or([
        eb("created_by_user_id", "=", requesterUserId),
        eb("claimed_by_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildAnonymizeLineageClaimAuditEventsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .updateTable("lineage_provenance_edge_audit_events")
    .set({
      actor_user_id: sql<string | null>`case
        when actor_user_id = ${requesterUserId} then null
        else actor_user_id
      end`,
      target_user_id: sql<string | null>`case
        when target_user_id = ${requesterUserId} then null
        else target_user_id
      end`,
    })
    .where((eb) =>
      eb.or([
        eb("actor_user_id", "=", requesterUserId),
        eb("target_user_id", "=", requesterUserId),
      ]),
    );
}

export function buildAnonymizeLineageNodeFollowsForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_node_follows")
    .set({
      follower_user_id: sql<string>`case
        when follower_user_id = ${input.requesterUserId} then ${input.erasedSubjectUserId}
        else follower_user_id
      end`,
      target_owner_user_id: sql<string>`case
        when target_owner_user_id in (${input.requesterUserId}, ${input.erasedSubjectUserId})
          then ${input.erasedSubjectUserId}
        else target_owner_user_id
      end`,
      follow_state: "anonymized",
      updated_at: input.now,
    })
    .where((eb) =>
      eb.or([
        eb("follower_user_id", "=", input.requesterUserId),
        eb("target_owner_user_id", "=", input.requesterUserId),
        eb("target_owner_user_id", "=", input.erasedSubjectUserId),
      ]),
    );
}

export function buildAnonymizeLineageQuestionsForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_questions")
    .set({
      asker_user_id: sql<string>`case
        when asker_user_id = ${input.requesterUserId} then ${input.erasedSubjectUserId}
        else asker_user_id
      end`,
      recipient_user_id: sql<string>`case
        when recipient_user_id = ${input.requesterUserId} then ${input.erasedSubjectUserId}
        else recipient_user_id
      end`,
      question_text: ERASED_LINEAGE_QUESTION_TEXT,
      question_state: "anonymized",
      client_mutation_id: sql<string>`'erased:' || "lineage_questions"."id"::text`,
      updated_at: input.now,
    })
    .where((eb) =>
      eb.or([
        eb("asker_user_id", "=", input.requesterUserId),
        eb("recipient_user_id", "=", input.requesterUserId),
      ]),
    );
}

export function buildAnonymizeSpacesForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("spaces")
    .set({
      owner_user_id: input.erasedSubjectUserId,
      display_name: ERASED_SPACE_NAME,
      location_visibility: "hidden",
      coarse_region_code: null,
      updated_at: input.now,
    })
    .where("owner_user_id", "=", input.requesterUserId);
}

export function buildAnonymizePlantObjectsForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      owner_user_id: input.erasedSubjectUserId,
      display_name: ERASED_OBJECT_NAME,
      catalog_item_id: null,
      variety_text: null,
      variety_state: "unknown",
      location_visibility: "hidden",
      coarse_region_code: null,
      updated_at: input.now,
    })
    .where("owner_user_id", "=", input.requesterUserId);
}

export function buildAnonymizeJournalEntriesForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      owner_user_id: input.erasedSubjectUserId,
      title: ERASED_ENTRY_TITLE,
      body: ERASED_ENTRY_BODY,
      content_document: null,
      content_schema_version: null,
      cover_media_asset_id: null,
      journal_revision: sql`journal_revision + 1`,
      entry_date: toDateOnly(input.now),
      visibility: "public",
      lifecycle_state: "deleted_retention",
      public_noindex: true,
      published_at: sql<Date>`coalesce(published_at, ${input.now})`,
      archived_at: null,
      // OVE-353: erasure never *extends* a retention horizon. A journal the
      // owner had already deleted keeps the timestamps it was given, so an
      // erasure request cannot postpone its physical purge by seven more days.
      deleted_at: sql<Date>`coalesce(deleted_at, now())`,
      purge_after: sql<Date>`coalesce(purge_after, now() + interval '7 days')`,
      public_gone_at: sql<Date>`case
        when public_slug is not null then coalesce(public_gone_at, ${input.now})
        else public_gone_at
      end`,
      first_publication_disclosure_version: null,
      first_publication_disclosed_at: null,
      client_mutation_id: sql<string>`'erased:' || "journal_entries"."id"::text`,
      updated_at: input.now,
    })
    .where("owner_user_id", "=", input.requesterUserId);
}

export function buildAnonymizeErasureRequestSubjectsQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      requester_user_id: input.erasedSubjectUserId,
      updated_at: input.now,
    })
    .where("requester_user_id", "=", input.requesterUserId);
}

export function buildCompleteApprovedErasureRequestQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    requestId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      status: "handled",
      handled_at: input.now,
      handled_status: "completed",
      handled_by_user_id: scope.userId,
      updated_at: input.now,
    })
    .where("id", "=", input.requestId)
    .returning("id");
}

export function buildMarkErasureCleanupPendingQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    requestId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      status: "handled",
      handled_at: input.now,
      handled_status: "cleanup_pending",
      handled_by_user_id: scope.userId,
      updated_at: input.now,
    })
    .where("id", "=", input.requestId)
    .returning("id");
}

export function buildEnqueueErasureMediaDeleteJobQuery(
  executor: QueryExecutor,
  input: {
    requestId: string;
    mediaObject: ErasureMediaObjectReference;
  },
) {
  const payload = {
    kind: ERASURE_MEDIA_DELETE_KIND,
    requestId: input.requestId,
    bucket: input.mediaObject.bucket,
    objectKey: input.mediaObject.objectKey,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: ERASURE_QUEUE_NAME,
      payload,
      idempotency_key: `erasure_media_delete:${input.requestId}:${input.mediaObject.bucket}:${input.mediaObject.objectKey}`,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          payload,
          status: "pending",
          attempts: 0,
          locked_at: null,
          locked_by: null,
          last_error: null,
          available_at: sql`now()`,
          updated_at: sql`now()`,
        }),
    )
    .returning("id");
}

export function buildRekeyCommunityModerationActorsForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return {
    execute: async () => {
      await executor
        .updateTable("community_contributions")
        .set({
          removed_by_user_id: input.erasedSubjectUserId,
          updated_at: input.now,
        })
        .where("removed_by_user_id", "=", input.requesterUserId)
        .execute();
      await executor
        .updateTable("community_contribution_reports")
        .set({
          resolved_by_user_id: input.erasedSubjectUserId,
          updated_at: input.now,
        })
        .where("resolved_by_user_id", "=", input.requesterUserId)
        .execute();
      await executor
        .updateTable("community_moderation_audit_log")
        .set({
          actor_user_id: input.erasedSubjectUserId,
        })
        .where("actor_user_id", "=", input.requesterUserId)
        .execute();
      await executor
        .updateTable("community_moderators")
        .set({
          granted_by_user_id: null,
          updated_at: input.now,
        })
        .where("granted_by_user_id", "=", input.requesterUserId)
        .execute();
    },
  };
}

export function buildAnonymizeCatalogMatchReviewersForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      reviewed_by_user_id: null,
      updated_at: now,
    })
    .where("reviewed_by_user_id", "=", requesterUserId);
}

export function buildAnonymizeCatalogAliasReviewersForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_alias_projections")
    .set({
      reviewed_by_user_id: null,
      updated_at: now,
    })
    .where("reviewed_by_user_id", "=", requesterUserId);
}

export function buildAnonymizeVarietySeedProofAuthorsForErasureQuery(
  executor: QueryExecutor,
  input: {
    requesterUserId: string;
    erasedSubjectUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("variety_seed_proofs")
    .set({
      author_user_id: input.erasedSubjectUserId,
      updated_at: input.now,
    })
    .where("author_user_id", "=", input.requesterUserId);
}

export function buildNullErasureOperatorLinksForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("erasure_requests")
    .set({
      handled_by_user_id: sql`case
        when handled_by_user_id = ${requesterUserId} then null
        else handled_by_user_id
      end`,
      dry_run_reviewed_by_user_id: sql`case
        when dry_run_reviewed_by_user_id = ${requesterUserId} then null
        else dry_run_reviewed_by_user_id
      end`,
      updated_at: now,
    })
    .where((eb) =>
      eb.or([
        eb("handled_by_user_id", "=", requesterUserId),
        eb("dry_run_reviewed_by_user_id", "=", requesterUserId),
      ]),
    );
}

async function processErasureMediaCleanupJobs(
  executor: QueryExecutor,
  requestId: string,
  deleteMediaObject: (reference: ErasureMediaObjectReference) => Promise<void>,
): Promise<number> {
  const jobs = await executor
    .selectFrom("job_queue")
    .select(["id", "payload", "status"])
    .where("queue_name", "=", ERASURE_QUEUE_NAME)
    .where(sql`payload->>'kind'`, "=", ERASURE_MEDIA_DELETE_KIND)
    .where(sql`payload->>'requestId'`, "=", requestId)
    .where("status", "in", ["pending", "processing", "failed"])
    .execute();

  let deleted = 0;
  for (const job of jobs) {
    const payload = job.payload as {
      bucket?: string;
      objectKey?: string;
    };
    if (
      payload.bucket !== "public_derivative" ||
      typeof payload.objectKey !== "string" ||
      payload.objectKey.length === 0
    ) {
      throw new Error("Erasure media cleanup job payload is malformed.");
    }

    await deleteMediaObject({
      bucket: payload.bucket,
      objectKey: payload.objectKey,
    });
    deleted += 1;

    await executor
      .updateTable("job_queue")
      .set({
        status: "done",
        locked_at: null,
        locked_by: null,
        last_error: null,
        updated_at: sql`now()`,
      })
      .where("id", "=", job.id)
      .execute();
  }

  return deleted;
}

async function listMediaObjectReferencesForErasure(
  executor: QueryExecutor,
  requesterUserId: string,
): Promise<ErasureMediaObjectReference[]> {
  const rows = await buildListMediaObjectsForErasureQuery(
    executor,
    requesterUserId,
  ).execute();

  return rows.map((row) => ({
    bucket: "public_derivative" as const,
    objectKey: row.derivativeKey,
  }));
}

async function deleteR2MediaObject(reference: ErasureMediaObjectReference) {
  await revokeMediaObjectBytes(reference);
}

function assertMaintainerApprovalPhrase(requestId: string, value: string) {
  const expected = expectedErasureMaintainerApprovalText(requestId);
  if (value.trim() !== expected) {
    throw new Error(
      `Maintainer approval phrase is required. Type: ${expected}`,
    );
  }
}

function normalizeErasureRequestId(value: string) {
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new Error("Invalid erasure request id.");
  }

  return trimmed.toLowerCase();
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
