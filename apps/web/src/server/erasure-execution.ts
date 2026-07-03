import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  deletePublicDerivativeObject,
  deleteQuarantineObject,
} from "@/lib/storage";
import { formatErasureRequestReference } from "@/lib/privacy/disclosures";
import type { RequestScope } from "@/server/request-scope";

const OPEN_REQUEST_STATUSES = ["submitted", "reviewing"] as const;
const JOURNAL_ENTRY_UNINDEX_KIND = "journal_entry_unindex";
const MATCHING_QUEUE_NAME = "matching";
const ERASED_ENTRY_TITLE = "Erased journal entry";
const ERASED_ENTRY_BODY = "This entry was erased by request.";
const ERASED_SPACE_NAME = "Erased garden";
const ERASED_OBJECT_NAME = "Erased object";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type ErasureMediaObjectReference =
  | { bucket: "quarantine"; objectKey: string }
  | { bucket: "public_derivative"; objectKey: string };

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
  const erasedSubjectUserId = deps.erasedSubjectUserId ?? randomUUID();
  const deleteMediaObject = deps.deleteMediaObject ?? deleteR2MediaObject;

  const executableRequest = await buildExecutableErasureRequestQuery(
    executor,
    requestId,
  ).executeTakeFirst();

  if (!executableRequest) {
    throw new Error(
      "Erasure request must be open and dry-run reviewed before irreversible execution.",
    );
  }

  const requesterUserId = executableRequest.requesterUserId;
  const mediaObjects = await listMediaObjectReferencesForErasure(
    executor,
    requesterUserId,
  );

  for (const mediaObject of mediaObjects) {
    await deleteMediaObject(mediaObject);
  }

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

    const publicEntryRows = await buildListPublicJournalEntriesForErasureQuery(
      trx,
      requesterUserId,
    ).execute();

    await buildDeleteVerificationRowsForErasureQuery(
      trx,
      requesterUserId,
    ).execute();
    await buildDeleteAuthSessionsForErasureQuery(trx, requesterUserId).execute();
    await buildDeleteAuthAccountsForErasureQuery(trx, requesterUserId).execute();
    await buildDeletePilotInviteGrantForErasureQuery(
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
    await buildDeletePendingJournalSearchJobsForErasureQuery(
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
    await buildAnonymizePilotInterviewSubjectsForErasureQuery(
      trx,
      requesterUserId,
      now,
    ).execute();
    await buildAnonymizeLineageProvenanceEdgesForErasureQuery(trx, {
      requesterUserId,
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
    await buildAnonymizeJournalEntriesForErasureQuery(trx, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).execute();

    for (const entry of publicEntryRows) {
      await buildEnqueueErasureJournalUnindexJobQuery(trx, {
        requestId,
        journalEntryId: entry.id,
        erasedSubjectUserId,
      }).executeTakeFirst();
    }

    await buildAnonymizeErasureRequestSubjectsQuery(trx, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).execute();
    await buildCompleteApprovedErasureRequestQuery(trx, scope, {
      requestId,
      now,
    }).executeTakeFirstOrThrow();
    await buildDeleteAuthUserForErasureQuery(trx, requesterUserId).execute();

    return publicEntryRows;
  });

  return {
    requestId,
    erasedSubjectUserId,
    requesterUserId,
    mediaObjectsDeleted: mediaObjects.length,
    publicEntriesQueuedForUnindex: publicEntries.length,
  };
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
    ])
    .where("id", "=", requestId)
    .where("status", "in", OPEN_REQUEST_STATUSES)
    .where("dry_run_reviewed_at", "is not", null)
    .limit(1);
}

export function buildListMediaObjectsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "quarantine_key as quarantineKey",
      "derivative_key as derivativeKey",
    ])
    .where("owner_user_id", "=", requesterUserId);
}

export function buildListPublicJournalEntriesForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["id", "public_slug as publicSlug"])
    .where("owner_user_id", "=", requesterUserId)
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("public_slug", "is not", null);
}

export function buildDeleteVerificationRowsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor.deleteFrom("verification").where(
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

export function buildDeletePilotInviteGrantForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
) {
  return executor
    .deleteFrom("pilot_invite_grants")
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
  return executor
    .deleteFrom("job_queue")
    .where("status", "in", ["pending", "processing", "failed"])
    .where(sql`payload->>'userId'`, "=", requesterUserId)
    .where(sql`payload->>'kind'`, "in", [
      "journal_entry_index",
      JOURNAL_ENTRY_UNINDEX_KIND,
    ]);
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

export function buildAnonymizePilotInterviewSubjectsForErasureQuery(
  executor: QueryExecutor,
  requesterUserId: string,
  now: Date,
) {
  return executor
    .updateTable("pilot_interview_learnings")
    .set({
      subject_user_id: null,
      redacted_note: null,
      updated_at: now,
    })
    .where("subject_user_id", "=", requesterUserId);
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
      source_reference_label: sql<string | null>`case
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
      entry_date: toDateOnly(input.now),
      visibility: "private",
      lifecycle_state: "archived",
      public_noindex: true,
      published_at: null,
      archived_at: input.now,
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

export function buildEnqueueErasureJournalUnindexJobQuery(
  executor: QueryExecutor,
  input: {
    requestId: string;
    journalEntryId: string;
    erasedSubjectUserId: string;
  },
) {
  const payload = {
    kind: JOURNAL_ENTRY_UNINDEX_KIND,
    journalEntryId: input.journalEntryId,
    userId: input.erasedSubjectUserId,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE_NAME,
      payload,
      idempotency_key: `journal_entry_unindex:${input.journalEntryId}:erasure:${input.requestId}`,
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

async function listMediaObjectReferencesForErasure(
  executor: QueryExecutor,
  requesterUserId: string,
): Promise<ErasureMediaObjectReference[]> {
  const rows = await buildListMediaObjectsForErasureQuery(
    executor,
    requesterUserId,
  ).execute();

  return rows.flatMap((row) => {
    const references: ErasureMediaObjectReference[] = [
      { bucket: "quarantine", objectKey: row.quarantineKey },
    ];

    if (row.derivativeKey) {
      references.push({
        bucket: "public_derivative",
        objectKey: row.derivativeKey,
      });
    }

    return references;
  });
}

async function deleteR2MediaObject(reference: ErasureMediaObjectReference) {
  if (reference.bucket === "quarantine") {
    await deleteQuarantineObject(reference.objectKey);
    return;
  }

  await deletePublicDerivativeObject(reference.objectKey);
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
