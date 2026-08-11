import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogItem,
  CatalogKind,
  CatalogMatchConfidenceBucket,
  CatalogMatchType,
  Database,
} from "@/db/schema";
import { createCatalogPublicSlug } from "@/lib/garden/public-paths";
import {
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  buildEnqueueCatalogMatchSuggestionsRefreshJobQuery,
  findSelectableCatalogItem,
  normalizeCatalogItemId,
} from "@/server/catalog-repository";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import type { RequestScope } from "@/server/request-scope";

const MAX_CURATION_CANDIDATES = 25;
const CURATED_USER_SOURCE = "curated_user";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CatalogCurationCandidate {
  id: string;
  displayName: string;
  normalizedName: string | null;
  catalogKind: CatalogKind;
  locale: string;
  status: "provisional";
  source: string;
  createdAt: Date | string;
  affectedObjectCount: number;
  matchSuggestions: CatalogMatchSuggestionReadModel[];
}

export interface CatalogMatchSuggestionReadModel {
  id: string;
  targetCatalogItemId: string | null;
  targetDisplayName: string | null;
  targetCanonicalName: string | null;
  catalogKind: CatalogKind;
  score: number;
  confidenceBucket: CatalogMatchConfidenceBucket;
  matchType: CatalogMatchType;
  reasonCodes: string[];
  normalizedInput: string;
  matchedName: string | null;
  sourceLocale: string;
  targetLocale: string | null;
  sourceScript: string;
  targetScript: string | null;
  status: "pending" | "rejected";
  generatedAt: Date | string;
  reviewedAt: Date | string | null;
  decisionReasonCode: CatalogMatchSuggestionDecisionReason | null;
  decisionResult: CatalogMatchSuggestionDecisionResult | null;
  decisionAffectedObjectCount: number | null;
}

export type CatalogMatchSuggestionRejectionReason =
  | "not_same_entity"
  | "wrong_catalog_kind"
  | "locale_or_script_mismatch"
  | "insufficient_evidence"
  | "other_review_reason";

type CatalogMatchSuggestionDecisionReason =
  | "approved_canonical_match"
  | CatalogMatchSuggestionRejectionReason
  | "legacy_review";

type CatalogMatchSuggestionDecisionResult =
  | "catalog_merged"
  | "suggestion_rejected";

export interface CatalogCurationDecisionInput {
  candidateId: string;
}

export interface MergeCatalogCurationCandidateInput extends CatalogCurationDecisionInput {
  targetCatalogItemId: string;
}

export interface CatalogMatchSuggestionDecisionInput {
  suggestionId: string;
}

export interface RejectCatalogMatchSuggestionInput extends CatalogMatchSuggestionDecisionInput {
  reasonCode: string;
}

export interface CatalogCurationDecisionResult {
  candidate: CatalogItem;
  affectedObjectCount: number;
  publicEntryPaths: string[];
}

export interface CatalogMatchSuggestionReviewResult {
  outcome: "approved" | "rejected" | "stale";
  candidate: CatalogItem | null;
  targetPublicSlug: string | null;
  affectedObjectCount: number;
  publicEntryPaths: string[];
}

export async function listPendingCatalogCurationCandidates(
  limit = MAX_CURATION_CANDIDATES,
): Promise<CatalogCurationCandidate[]> {
  const rows = await buildPendingCatalogCurationCandidatesQuery(
    db,
    limit,
  ).execute();
  const candidateIds = rows.map((row) => row.id);
  const suggestionRows =
    candidateIds.length > 0
      ? await buildPendingCatalogMatchSuggestionsQuery(
          db,
          candidateIds,
        ).execute()
      : [];
  const suggestionsByCandidate = new Map<
    string,
    CatalogMatchSuggestionReadModel[]
  >();

  for (const row of suggestionRows) {
    const suggestions =
      suggestionsByCandidate.get(row.sourceCatalogItemId) ?? [];
    suggestions.push({
      id: row.id,
      targetCatalogItemId: row.targetCatalogItemId,
      targetDisplayName: row.matchedName,
      targetCanonicalName: row.targetCanonicalName,
      catalogKind: row.catalogKind as CatalogKind,
      score: Number(row.score),
      confidenceBucket: row.confidenceBucket as CatalogMatchConfidenceBucket,
      matchType: row.matchType as CatalogMatchType,
      reasonCodes: row.reasonCodes,
      normalizedInput: row.normalizedInput,
      matchedName: row.matchedName,
      sourceLocale: row.sourceLocale,
      targetLocale: row.targetLocale,
      sourceScript: row.sourceScript,
      targetScript: row.targetScript,
      status: row.status as "pending" | "rejected",
      generatedAt: row.generatedAt,
      reviewedAt: row.reviewedAt,
      decisionReasonCode:
        row.decisionReasonCode as CatalogMatchSuggestionDecisionReason | null,
      decisionResult:
        row.decisionResult as CatalogMatchSuggestionDecisionResult | null,
      decisionAffectedObjectCount:
        row.decisionAffectedObjectCount === null
          ? null
          : Number(row.decisionAffectedObjectCount),
    });
    suggestionsByCandidate.set(row.sourceCatalogItemId, suggestions);
  }

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    catalogKind: row.catalogKind as CatalogKind,
    locale: row.locale,
    status: "provisional",
    source: row.source,
    createdAt: row.createdAt,
    affectedObjectCount: Number(row.affectedObjectCount),
    matchSuggestions: suggestionsByCandidate.get(row.id) ?? [],
  }));
}

export async function enqueueCatalogMatchSuggestionsRefresh(
  input: CatalogCurationDecisionInput,
) {
  const candidateId = normalizeCurationCandidateId(input.candidateId);

  return db.transaction().execute(async (trx) => {
    await requirePendingCatalogCurationCandidate(trx, candidateId);
    await buildEnqueueCatalogMatchSuggestionsRefreshJobQuery(
      trx,
      candidateId,
    ).executeTakeFirst();
    return { candidateId };
  });
}

export async function approveCatalogMatchSuggestion(
  scope: RequestScope,
  input: CatalogMatchSuggestionDecisionInput,
): Promise<CatalogMatchSuggestionReviewResult> {
  const suggestionId = normalizeCurationCandidateId(input.suggestionId);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const suggestion = await requirePendingCatalogMatchSuggestion(
      trx,
      suggestionId,
    );

    if (!isCurrentCatalogMatchSuggestion(suggestion)) {
      await buildStaleCatalogMatchSuggestionQuery(
        trx,
        suggestionId,
        now,
      ).executeTakeFirst();
      return staleCatalogMatchSuggestionResult();
    }

    const publicEntryPaths = await publicEntryPathsForCandidate(
      trx,
      suggestion.sourceCatalogItemId,
    );
    const affectedObjects =
      await buildUpdateObjectsForMergedCatalogCandidateQuery(trx, {
        candidateId: suggestion.sourceCatalogItemId,
        targetCatalogItemId: suggestion.targetCatalogItemId,
        varietyText: suggestion.targetCanonicalName,
        now,
      }).execute();
    const candidate = await buildMergeCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId: suggestion.sourceCatalogItemId,
        targetCatalogItemId: suggestion.targetCatalogItemId,
        now,
      },
    ).executeTakeFirstOrThrow();

    await buildApproveCatalogMatchSuggestionQuery(trx, scope, {
      suggestionId,
      decisionAffectedObjectCount: affectedObjects.length,
      now,
    }).executeTakeFirstOrThrow();
    await buildStaleOtherCatalogMatchSuggestionsQuery(trx, {
      sourceCatalogItemId: suggestion.sourceCatalogItemId,
      approvedSuggestionId: suggestionId,
      now,
    }).execute();
    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      outcome: "approved",
      candidate,
      targetPublicSlug: suggestion.targetPublicSlug,
      affectedObjectCount: affectedObjects.length,
      publicEntryPaths,
    };
  });
}

export async function rejectCatalogMatchSuggestion(
  scope: RequestScope,
  input: RejectCatalogMatchSuggestionInput,
): Promise<CatalogMatchSuggestionReviewResult> {
  const suggestionId = normalizeCurationCandidateId(input.suggestionId);
  const reasonCode = normalizeCatalogMatchSuggestionRejectionReason(
    input.reasonCode,
  );
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const suggestion = await requirePendingCatalogMatchSuggestion(
      trx,
      suggestionId,
    );

    if (!isCurrentCatalogMatchSuggestion(suggestion)) {
      await buildStaleCatalogMatchSuggestionQuery(
        trx,
        suggestionId,
        now,
      ).executeTakeFirst();
      return staleCatalogMatchSuggestionResult();
    }

    await buildRejectCatalogMatchSuggestionQuery(trx, scope, {
      suggestionId,
      reasonCode,
      now,
    }).executeTakeFirstOrThrow();

    return {
      outcome: "rejected",
      candidate: null,
      targetPublicSlug: null,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    };
  });
}

export async function confirmCatalogCurationCandidate(
  scope: RequestScope,
  input: CatalogCurationDecisionInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const pendingCandidate = await requirePendingCatalogCurationCandidate(
      trx,
      candidateId,
    );
    const publicEntryPaths = await publicEntryPathsForCandidate(
      trx,
      candidateId,
    );

    const candidate = await buildConfirmCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        now,
        publicSlug: createCatalogPublicSlug(
          pendingCandidate.canonical_name,
          pendingCandidate.id,
        ),
      },
    ).executeTakeFirstOrThrow();

    const affectedObjects =
      await buildUpdateObjectsForConfirmedCatalogCandidateQuery(trx, {
        candidateId,
        varietyText: candidate.canonical_name,
        now,
      }).execute();

    await buildStaleCatalogMatchSuggestionsQuery(
      trx,
      candidateId,
      now,
    ).execute();
    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: affectedObjects.length,
      publicEntryPaths,
    };
  });
}

export async function mergeCatalogCurationCandidate(
  scope: RequestScope,
  input: MergeCatalogCurationCandidateInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const targetCatalogItemId = normalizeCurationCandidateId(
    input.targetCatalogItemId,
  );
  if (candidateId === targetCatalogItemId) {
    throw new Error("A candidate cannot be merged into itself.");
  }

  const now = new Date();

  return db.transaction().execute(async (trx) => {
    await requirePendingCatalogCurationCandidate(trx, candidateId);
    const targetCatalogItem = await findSelectableCatalogItem(
      trx,
      targetCatalogItemId,
    );

    if (!targetCatalogItem) {
      throw new Error("Target catalog item was not found.");
    }

    const publicEntryPaths = await publicEntryPathsForCandidate(
      trx,
      candidateId,
    );

    const affectedObjects =
      await buildUpdateObjectsForMergedCatalogCandidateQuery(trx, {
        candidateId,
        targetCatalogItemId: targetCatalogItem.id,
        varietyText: targetCatalogItem.canonicalName,
        now,
      }).execute();

    const candidate = await buildMergeCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        targetCatalogItemId: targetCatalogItem.id,
        now,
      },
    ).executeTakeFirstOrThrow();

    await buildStaleCatalogMatchSuggestionsQuery(
      trx,
      candidateId,
      now,
    ).execute();
    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: affectedObjects.length,
      publicEntryPaths,
    };
  });
}

export async function rejectCatalogCurationCandidate(
  scope: RequestScope,
  input: CatalogCurationDecisionInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    await requirePendingCatalogCurationCandidate(trx, candidateId);
    const candidate = await buildRejectCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        now,
      },
    ).executeTakeFirstOrThrow();

    await buildStaleCatalogMatchSuggestionsQuery(
      trx,
      candidateId,
      now,
    ).execute();
    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    };
  });
}

export function buildPendingCatalogCurationCandidatesQuery(
  executor: QueryExecutor,
  limit = MAX_CURATION_CANDIDATES,
) {
  const boundedLimit = normalizeCurationLimit(limit);

  return executor
    .selectFrom("catalog_items")
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.catalog_item_id", "=", "catalog_items.id")
        .on("plant_objects.variety_state", "=", "user_added"),
    )
    .select(({ fn }) => [
      "catalog_items.id as id",
      "catalog_items.canonical_name as displayName",
      "catalog_items.normalized_name as normalizedName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.locale as locale",
      "catalog_items.source as source",
      "catalog_items.created_at as createdAt",
      fn.count<number>("plant_objects.id").as("affectedObjectCount"),
    ])
    .where("catalog_items.status", "=", "provisional")
    .where("catalog_items.source", "=", "user_added")
    .where("catalog_items.created_by_user_id", "is not", null)
    .groupBy([
      "catalog_items.id",
      "catalog_items.canonical_name",
      "catalog_items.normalized_name",
      "catalog_items.catalog_kind",
      "catalog_items.locale",
      "catalog_items.source",
      "catalog_items.created_at",
    ])
    .orderBy("catalog_items.created_at", "asc")
    .limit(boundedLimit);
}

export function buildPendingCatalogCurationCandidateByIdQuery(
  executor: QueryExecutor,
  candidateId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .selectAll("catalog_items")
    .where("id", "=", candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null);
}

export function buildPendingCatalogMatchSuggestionsQuery(
  executor: QueryExecutor,
  candidateIds: string[],
) {
  return executor
    .selectFrom("catalog_match_suggestions")
    .innerJoin(
      "catalog_items as source_items",
      "source_items.id",
      "catalog_match_suggestions.source_catalog_item_id",
    )
    .leftJoin(
      "catalog_items as target_items",
      "target_items.id",
      "catalog_match_suggestions.target_catalog_item_id",
    )
    .select([
      "catalog_match_suggestions.id as id",
      "catalog_match_suggestions.source_catalog_item_id as sourceCatalogItemId",
      "catalog_match_suggestions.target_catalog_item_id as targetCatalogItemId",
      "catalog_match_suggestions.target_canonical_name as targetCanonicalName",
      "catalog_match_suggestions.catalog_kind as catalogKind",
      "catalog_match_suggestions.score as score",
      "catalog_match_suggestions.confidence_bucket as confidenceBucket",
      "catalog_match_suggestions.match_type as matchType",
      "catalog_match_suggestions.reason_codes as reasonCodes",
      "catalog_match_suggestions.normalized_input as normalizedInput",
      "catalog_match_suggestions.matched_name as matchedName",
      "catalog_match_suggestions.source_locale as sourceLocale",
      "catalog_match_suggestions.target_locale as targetLocale",
      "catalog_match_suggestions.source_script as sourceScript",
      "catalog_match_suggestions.target_script as targetScript",
      "catalog_match_suggestions.status as status",
      "catalog_match_suggestions.generated_at as generatedAt",
      "catalog_match_suggestions.reviewed_at as reviewedAt",
      "catalog_match_suggestions.decision_reason_code as decisionReasonCode",
      "catalog_match_suggestions.decision_result as decisionResult",
      "catalog_match_suggestions.decision_affected_object_count as decisionAffectedObjectCount",
    ])
    .where(
      "catalog_match_suggestions.source_catalog_item_id",
      "in",
      candidateIds,
    )
    .where("catalog_match_suggestions.status", "in", ["pending", "rejected"])
    .where("source_items.status", "=", "provisional")
    .where("source_items.source", "=", "user_added")
    .where("source_items.created_by_user_id", "is not", null)
    .where((eb) =>
      eb.or([
        eb("catalog_match_suggestions.status", "=", "rejected"),
        eb("catalog_match_suggestions.target_catalog_item_id", "is", null),
        eb.and([
          eb("target_items.status", "in", ["seeded", "confirmed"]),
          eb("target_items.created_by_user_id", "is", null),
          eb(
            "target_items.catalog_kind",
            "=",
            eb.ref("source_items.catalog_kind"),
          ),
        ]),
      ]),
    )
    .orderBy("catalog_match_suggestions.source_catalog_item_id", "asc")
    .orderBy(
      sql`case when catalog_match_suggestions.status = 'pending' then 0 else 1 end`,
      "asc",
    )
    .orderBy("catalog_match_suggestions.score", "desc")
    .orderBy("catalog_match_suggestions.target_canonical_name", "asc");
}

export function buildCatalogMatchSuggestionForDecisionQuery(
  executor: QueryExecutor,
  suggestionId: string,
) {
  return executor
    .selectFrom("catalog_match_suggestions")
    .innerJoin(
      "catalog_items as source_items",
      "source_items.id",
      "catalog_match_suggestions.source_catalog_item_id",
    )
    .innerJoin(
      "catalog_items as target_items",
      "target_items.id",
      "catalog_match_suggestions.target_catalog_item_id",
    )
    .select([
      "catalog_match_suggestions.id as suggestionId",
      "catalog_match_suggestions.source_catalog_item_id as sourceCatalogItemId",
      "catalog_match_suggestions.target_catalog_item_id as targetCatalogItemId",
      "catalog_match_suggestions.target_catalog_item_name_id as targetCatalogItemNameId",
      "catalog_match_suggestions.catalog_kind as catalogKind",
      "catalog_match_suggestions.source_locale as sourceLocale",
      "catalog_match_suggestions.target_canonical_name as targetCanonicalName",
      "catalog_match_suggestions.source_matching_fingerprint as sourceMatchingFingerprint",
      "catalog_match_suggestions.target_matching_fingerprint as targetMatchingFingerprint",
      "source_items.status as sourceStatus",
      "source_items.source as sourceSource",
      "source_items.created_by_user_id as sourceCreatedByUserId",
      "source_items.catalog_kind as sourceCatalogKind",
      "source_items.locale as currentSourceLocale",
      "source_items.canonical_name as currentSourceCanonicalName",
      "source_items.normalized_name as currentSourceNormalizedName",
      "target_items.status as targetStatus",
      "target_items.created_by_user_id as targetCreatedByUserId",
      "target_items.catalog_kind as targetCatalogKind",
      "target_items.canonical_name as currentTargetCanonicalName",
      "target_items.public_slug as targetPublicSlug",
    ])
    .where("catalog_match_suggestions.id", "=", suggestionId)
    .where("catalog_match_suggestions.status", "=", "pending")
    .where("catalog_match_suggestions.suggestion_kind", "=", "canonical_match")
    .forUpdate();
}

export function buildCatalogItemNameForDecisionQuery(
  executor: QueryExecutor,
  catalogItemNameId: string,
) {
  return executor
    .selectFrom("catalog_item_names")
    .select([
      "id",
      "catalog_item_id as catalogItemId",
      "display_name as displayName",
      "normalized_name as normalizedName",
      "locale",
    ])
    .where("id", "=", catalogItemNameId)
    .forUpdate();
}

export function buildConfirmCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    now: Date;
    publicSlug: string;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "confirmed",
      source: CURATED_USER_SOURCE,
      public_slug: input.publicSlug,
      created_by_user_id: null,
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: null,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildMergeCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    targetCatalogItemId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "merged",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: input.targetCatalogItemId,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildRejectCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "rejected",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: null,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildStaleCatalogMatchSuggestionsQuery(
  executor: QueryExecutor,
  candidateId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      status: "stale",
      updated_at: now,
    })
    .where("source_catalog_item_id", "=", candidateId)
    .where("status", "=", "pending");
}

export function buildStaleCatalogMatchSuggestionQuery(
  executor: QueryExecutor,
  suggestionId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      status: "stale",
      updated_at: now,
    })
    .where("id", "=", suggestionId)
    .where("status", "=", "pending")
    .returning(["id"]);
}

export function buildStaleOtherCatalogMatchSuggestionsQuery(
  executor: QueryExecutor,
  input: {
    sourceCatalogItemId: string;
    approvedSuggestionId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      status: "stale",
      updated_at: input.now,
    })
    .where("source_catalog_item_id", "=", input.sourceCatalogItemId)
    .where("id", "!=", input.approvedSuggestionId)
    .where("status", "=", "pending");
}

export function buildApproveCatalogMatchSuggestionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    suggestionId: string;
    decisionAffectedObjectCount: number;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      status: "approved",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      decision_reason_code: "approved_canonical_match",
      decision_result: "catalog_merged",
      decision_affected_object_count: input.decisionAffectedObjectCount,
      updated_at: input.now,
    })
    .where("id", "=", input.suggestionId)
    .where("status", "=", "pending")
    .returning(["id"]);
}

export function buildRejectCatalogMatchSuggestionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    suggestionId: string;
    reasonCode: CatalogMatchSuggestionRejectionReason;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_match_suggestions")
    .set({
      status: "rejected",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      decision_reason_code: input.reasonCode,
      decision_result: "suggestion_rejected",
      decision_affected_object_count: 0,
      updated_at: input.now,
    })
    .where("id", "=", input.suggestionId)
    .where("status", "=", "pending")
    .returning(["id"]);
}

export function buildUpdateObjectsForConfirmedCatalogCandidateQuery(
  executor: QueryExecutor,
  input: {
    candidateId: string;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("catalog_item_id", "=", input.candidateId)
    .where("variety_state", "=", "user_added")
    .returning(["id"]);
}

export function buildUpdateObjectsForMergedCatalogCandidateQuery(
  executor: QueryExecutor,
  input: {
    candidateId: string;
    targetCatalogItemId: string;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      catalog_item_id: input.targetCatalogItemId,
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("catalog_item_id", "=", input.candidateId)
    .where("variety_state", "=", "user_added")
    .returning(["id"]);
}

export function buildPublicEntrySlugsForCatalogCandidateQuery(
  executor: QueryExecutor,
  candidateId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin(
      "plant_objects",
      "plant_objects.id",
      "journal_entries.plant_object_id",
    )
    .select("journal_entries.public_slug as publicSlug")
    .where("plant_objects.catalog_item_id", "=", candidateId)
    .where("plant_objects.variety_state", "=", "user_added")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null);
}

async function requirePendingCatalogCurationCandidate(
  executor: QueryExecutor,
  candidateId: string,
): Promise<CatalogItem> {
  const candidate = await buildPendingCatalogCurationCandidateByIdQuery(
    executor,
    candidateId,
  ).executeTakeFirst();

  if (!candidate) {
    throw new Error("Pending catalog candidate was not found.");
  }

  return candidate;
}

async function requirePendingCatalogMatchSuggestion(
  executor: QueryExecutor,
  suggestionId: string,
) {
  const suggestion = await buildCatalogMatchSuggestionForDecisionQuery(
    executor,
    suggestionId,
  ).executeTakeFirst();

  if (
    !suggestion ||
    !suggestion.targetCatalogItemId ||
    !suggestion.targetCanonicalName
  ) {
    throw new Error("Pending catalog match suggestion was not found.");
  }

  const targetName = suggestion.targetCatalogItemNameId
    ? await buildCatalogItemNameForDecisionQuery(
        executor,
        suggestion.targetCatalogItemNameId,
      ).executeTakeFirst()
    : null;

  return {
    ...suggestion,
    targetCatalogItemId: suggestion.targetCatalogItemId,
    targetCanonicalName: suggestion.targetCanonicalName,
    currentTargetNameId: targetName?.id ?? null,
    currentTargetNameCatalogItemId: targetName?.catalogItemId ?? null,
    currentTargetDisplayName: targetName?.displayName ?? null,
    currentTargetNormalizedName: targetName?.normalizedName ?? null,
    currentTargetLocale: targetName?.locale ?? null,
  };
}

async function publicEntryPathsForCandidate(
  executor: QueryExecutor,
  candidateId: string,
) {
  const rows = await buildPublicEntrySlugsForCatalogCandidateQuery(
    executor,
    candidateId,
  ).execute();

  return rows.flatMap((row) =>
    row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
  );
}

function normalizeCurationCandidateId(value: string | null | undefined) {
  const normalized = normalizeCatalogItemId(value);
  if (!normalized) throw new Error("Catalog candidate id is required.");
  return normalized;
}

export function normalizeCatalogMatchSuggestionRejectionReason(
  value: string | null | undefined,
): CatalogMatchSuggestionRejectionReason {
  switch (value) {
    case "not_same_entity":
    case "wrong_catalog_kind":
    case "locale_or_script_mismatch":
    case "insufficient_evidence":
    case "other_review_reason":
      return value;
    default:
      throw new Error("A valid catalog match rejection reason is required.");
  }
}

function isCurrentCatalogMatchSuggestion(input: {
  sourceCatalogItemId: string;
  targetCatalogItemId: string;
  targetCatalogItemNameId: string | null;
  catalogKind: string;
  sourceLocale: string;
  targetCanonicalName: string | null;
  sourceMatchingFingerprint: string | null;
  targetMatchingFingerprint: string | null;
  sourceStatus: string;
  sourceSource: string;
  sourceCreatedByUserId: string | null;
  sourceCatalogKind: string;
  currentSourceLocale: string;
  currentSourceCanonicalName: string;
  currentSourceNormalizedName: string | null;
  targetStatus: string;
  targetCreatedByUserId: string | null;
  targetCatalogKind: string;
  currentTargetCanonicalName: string;
  currentTargetNameId: string | null;
  currentTargetNameCatalogItemId: string | null;
  currentTargetDisplayName: string | null;
  currentTargetNormalizedName: string | null;
  currentTargetLocale: string | null;
}) {
  const currentSourceLocale = normalizeMatchingLocale(
    input.currentSourceLocale,
  );
  const currentTargetLocale = normalizeMatchingLocale(
    input.currentTargetLocale,
  );

  return (
    input.sourceCatalogItemId !== input.targetCatalogItemId &&
    input.sourceStatus === "provisional" &&
    input.sourceSource === "user_added" &&
    input.sourceCreatedByUserId !== null &&
    input.targetCreatedByUserId === null &&
    (input.targetStatus === "seeded" || input.targetStatus === "confirmed") &&
    input.catalogKind === input.sourceCatalogKind &&
    input.catalogKind === input.targetCatalogKind &&
    input.sourceLocale === currentSourceLocale &&
    input.targetCanonicalName === input.currentTargetCanonicalName &&
    input.currentSourceNormalizedName !== null &&
    input.sourceMatchingFingerprint !== null &&
    input.sourceMatchingFingerprint ===
      buildCatalogMatchFingerprint([
        input.currentSourceCanonicalName,
        input.currentSourceNormalizedName,
        currentSourceLocale,
        input.sourceCatalogKind,
      ]) &&
    input.targetCatalogItemNameId !== null &&
    input.targetMatchingFingerprint !== null &&
    input.currentTargetNameId === input.targetCatalogItemNameId &&
    input.currentTargetNameCatalogItemId === input.targetCatalogItemId &&
    input.currentTargetDisplayName !== null &&
    input.currentTargetNormalizedName !== null &&
    input.currentTargetLocale !== null &&
    input.targetMatchingFingerprint ===
      buildCatalogMatchFingerprint([
        input.targetCatalogItemId,
        input.currentTargetCanonicalName,
        input.targetCatalogKind,
        input.currentTargetNameId,
        input.currentTargetDisplayName,
        input.currentTargetNormalizedName,
        currentTargetLocale,
      ])
  );
}

export function buildCatalogMatchFingerprint(values: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function normalizeMatchingLocale(value: string | null) {
  const locale = value?.trim().toLowerCase().slice(0, 16) ?? "";
  return locale.length >= 2 ? locale : "und";
}

function staleCatalogMatchSuggestionResult(): CatalogMatchSuggestionReviewResult {
  return {
    outcome: "stale",
    candidate: null,
    targetPublicSlug: null,
    affectedObjectCount: 0,
    publicEntryPaths: [],
  };
}

function normalizeCurationLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CURATION_CANDIDATES;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CURATION_CANDIDATES);
}
