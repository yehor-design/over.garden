import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  normalizeCatalogItemId,
  SELECTABLE_CATALOG_STATUSES,
} from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

const MATCHING_QUEUE = "matching";
const CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND =
  "catalog_alias_suggestions_refresh";
const CATALOG_ALIAS_SUGGESTIONS_IDEMPOTENCY_PREFIX =
  "matching:catalog_alias_suggestions_refresh:";
const CATALOG_ALIAS_SOURCE_SLUG = "overgarden-alias-generator";
const CATALOG_ALIAS_SOURCE_METHOD = "generated";
const CATALOG_ALIAS_GENERATOR_VERSION = "ove160-v1";
const MAX_ALIAS_TARGETS = 12;
const MAX_ALIAS_SUGGESTIONS = 50;
const MAX_ALIAS_QUERY_LENGTH = 120;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CatalogAliasSuggestionTarget {
  id: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  status: string;
  source: string;
  acceptedNameCount: number;
}

export interface CatalogAliasSuggestionReadModel {
  id: string;
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogPublicSlug: string | null;
  catalogKind: string;
  catalogSource: string;
  generatedFromDisplayName: string;
  displayName: string;
  normalizedName: string;
  locale: string;
  script: string;
  aliasKind: string;
  status: "generated" | "review_needed" | "rejected" | "accepted";
  confidence: number;
  reasonCodes: string[];
  generatorVersion: string;
  generatedAt: Date | string;
  reviewedAt: Date | string | null;
  decisionReasonCode: string | null;
  decisionResult: string | null;
}

export type CatalogAliasRejectionReason =
  | "incorrect_variant"
  | "locale_or_script_mismatch"
  | "ambiguous_catalog_identity"
  | "unsafe_generated_form"
  | "other_review_reason";

export interface CatalogAliasSuggestionDecisionInput {
  aliasProjectionId: string;
}

export interface RejectCatalogAliasSuggestionInput extends CatalogAliasSuggestionDecisionInput {
  reasonCode: string;
}

export interface CatalogAliasSuggestionReviewResult {
  outcome: "approved" | "rejected" | "stale" | "collision";
  catalogItemNameId: string | null;
}

export async function listCatalogAliasSuggestionTargets(
  input: { query: string; limit?: number },
  executor: QueryExecutor = db,
): Promise<CatalogAliasSuggestionTarget[]> {
  const query = normalizeCatalogAliasQuery(input.query);
  if (query.length < 2) return [];

  const rows = await buildCatalogAliasSuggestionTargetsQuery(executor, {
    query,
    limit: input.limit ?? MAX_ALIAS_TARGETS,
  }).execute();

  return rows.map((row) => ({
    id: row.id,
    canonicalName: row.canonicalName,
    catalogKind: row.catalogKind,
    locale: row.locale,
    status: row.status,
    source: row.source,
    acceptedNameCount: Number(row.acceptedNameCount),
  }));
}

export async function listCatalogAliasSuggestionsForCuration(
  limit = MAX_ALIAS_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<CatalogAliasSuggestionReadModel[]> {
  const rows = await buildCatalogAliasSuggestionsForCurationQuery(
    executor,
    limit,
  ).execute();

  return rows.map((row) => {
    if (!row.generatorVersion) {
      throw new Error(
        "Generated catalog alias is missing its generator version.",
      );
    }

    return {
      id: row.id,
      catalogItemId: row.catalogItemId,
      catalogCanonicalName: row.catalogCanonicalName,
      catalogPublicSlug: row.catalogPublicSlug,
      catalogKind: row.catalogKind,
      catalogSource: row.catalogSource,
      generatedFromDisplayName: row.generatedFromDisplayName,
      displayName: row.displayName,
      normalizedName: row.normalizedName,
      locale: row.locale,
      script: row.script,
      aliasKind: row.aliasKind,
      status: row.status as CatalogAliasSuggestionReadModel["status"],
      confidence: Number(row.confidence),
      reasonCodes: row.reasonCodes,
      generatorVersion: row.generatorVersion,
      generatedAt: row.generatedAt,
      reviewedAt: row.reviewedAt,
      decisionReasonCode: row.decisionReasonCode,
      decisionResult: row.decisionResult,
    };
  });
}

export async function enqueueCatalogAliasSuggestionsRefresh(input: {
  catalogItemId: string;
}) {
  const catalogItemId = requireCatalogAliasIdentifier(
    input.catalogItemId,
    "Catalog identity",
  );

  return db.transaction().execute(async (trx) => {
    const catalogItem = await buildCatalogAliasSuggestionTargetByIdQuery(
      trx,
      catalogItemId,
    )
      .forUpdate()
      .executeTakeFirst();
    if (!catalogItem) {
      throw new Error("Catalog identity was not found.");
    }

    await buildEnqueueCatalogAliasSuggestionsRefreshJobQuery(
      trx,
      catalogItemId,
    ).executeTakeFirstOrThrow();
    return { catalogItemId };
  });
}

export async function approveCatalogAliasSuggestion(
  scope: RequestScope,
  input: CatalogAliasSuggestionDecisionInput,
): Promise<CatalogAliasSuggestionReviewResult> {
  const aliasProjectionId = requireCatalogAliasIdentifier(
    input.aliasProjectionId,
    "Catalog alias suggestion",
  );
  const now = new Date();

  return db
    .transaction()
    .setIsolationLevel("serializable")
    .execute(async (trx) => {
      const suggestion = await requireCatalogAliasSuggestionForDecision(
        trx,
        aliasProjectionId,
      );
      if (!isCurrentCatalogAliasSuggestion(suggestion)) {
        await buildStaleCatalogAliasProjectionQuery(
          trx,
          aliasProjectionId,
          now,
        ).executeTakeFirst();
        return { outcome: "stale", catalogItemNameId: null };
      }

      const collision = await buildCatalogAliasCollisionQuery(trx, {
        catalogItemId: suggestion.catalogItemId,
        normalizedName: suggestion.normalizedName,
      }).executeTakeFirst();
      if (collision || suggestion.status === "review_needed") {
        await buildHoldCatalogAliasCollisionQuery(
          trx,
          aliasProjectionId,
          now,
        ).executeTakeFirst();
        return { outcome: "collision", catalogItemNameId: null };
      }

      const existingName = await buildExistingCatalogAliasNameQuery(trx, {
        catalogItemId: suggestion.catalogItemId,
        normalizedName: suggestion.normalizedName,
        locale: suggestion.locale,
      }).executeTakeFirst();
      let catalogItemNameId = existingName?.id ?? null;
      let decisionResult: "alias_projected" | "alias_already_projected" =
        "alias_already_projected";

      if (!catalogItemNameId) {
        const inserted = await buildInsertApprovedCatalogAliasNameQuery(trx, {
          catalogItemId: suggestion.catalogItemId,
          displayName: suggestion.displayName,
          normalizedName: suggestion.normalizedName,
          locale: suggestion.locale,
        }).executeTakeFirst();
        catalogItemNameId = inserted?.id ?? null;
        decisionResult = "alias_projected";
      }

      if (!catalogItemNameId) {
        const concurrentName = await buildExistingCatalogAliasNameQuery(trx, {
          catalogItemId: suggestion.catalogItemId,
          normalizedName: suggestion.normalizedName,
          locale: suggestion.locale,
        }).executeTakeFirstOrThrow();
        catalogItemNameId = concurrentName.id;
        decisionResult = "alias_already_projected";
      }

      await buildApproveCatalogAliasProjectionQuery(trx, scope, {
        aliasProjectionId,
        catalogItemNameId,
        decisionResult,
        now,
      }).executeTakeFirstOrThrow();
      await buildEnqueueCatalogTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();

      return { outcome: "approved", catalogItemNameId };
    });
}

export async function rejectCatalogAliasSuggestion(
  scope: RequestScope,
  input: RejectCatalogAliasSuggestionInput,
): Promise<CatalogAliasSuggestionReviewResult> {
  const aliasProjectionId = requireCatalogAliasIdentifier(
    input.aliasProjectionId,
    "Catalog alias suggestion",
  );
  const reasonCode = normalizeCatalogAliasRejectionReason(input.reasonCode);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const suggestion = await requireCatalogAliasSuggestionForDecision(
      trx,
      aliasProjectionId,
    );
    if (!isCurrentCatalogAliasSuggestion(suggestion)) {
      await buildStaleCatalogAliasProjectionQuery(
        trx,
        aliasProjectionId,
        now,
      ).executeTakeFirst();
      return { outcome: "stale", catalogItemNameId: null };
    }

    await buildRejectCatalogAliasProjectionQuery(trx, scope, {
      aliasProjectionId,
      reasonCode,
      now,
    }).executeTakeFirstOrThrow();
    return { outcome: "rejected", catalogItemNameId: null };
  });
}

export function buildCatalogAliasSuggestionTargetsQuery(
  executor: QueryExecutor,
  input: { query: string; limit: number },
) {
  const query = normalizeCatalogAliasQuery(input.query);
  const pattern = `%${query}%`;

  return executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.locale as locale",
      "catalog_items.status as status",
      "catalog_items.source as source",
      sql<number>`(
        select count(*)::integer
        from catalog_item_names
        where catalog_item_names.catalog_item_id = catalog_items.id
      )`.as("acceptedNameCount"),
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where(
      sql<boolean>`(
        catalog_items.canonical_name ilike ${pattern}
        or exists (
          select 1
          from catalog_item_names
          where catalog_item_names.catalog_item_id = catalog_items.id
            and catalog_item_names.display_name ilike ${pattern}
        )
      )`,
    )
    .orderBy("catalog_items.canonical_name", "asc")
    .orderBy("catalog_items.id", "asc")
    .limit(normalizeLimit(input.limit, MAX_ALIAS_TARGETS));
}

export function buildCatalogAliasSuggestionTargetByIdQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null);
}

export function buildCatalogAliasSuggestionsForCurationQuery(
  executor: QueryExecutor,
  limit = MAX_ALIAS_SUGGESTIONS,
) {
  return executor
    .selectFrom("catalog_alias_projections")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_alias_projections.catalog_item_id",
    )
    .innerJoin("catalog_item_names as source_names", (join) =>
      join.onRef(
        "source_names.id",
        "=",
        "catalog_alias_projections.generated_from_catalog_item_name_id",
      ),
    )
    .select([
      "catalog_alias_projections.id as id",
      "catalog_alias_projections.catalog_item_id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.source as catalogSource",
      "source_names.display_name as generatedFromDisplayName",
      "catalog_alias_projections.display_name as displayName",
      "catalog_alias_projections.normalized_name as normalizedName",
      "catalog_alias_projections.locale as locale",
      "catalog_alias_projections.script as script",
      "catalog_alias_projections.alias_kind as aliasKind",
      "catalog_alias_projections.status as status",
      "catalog_alias_projections.confidence as confidence",
      "catalog_alias_projections.reason_codes as reasonCodes",
      "catalog_alias_projections.generator_version as generatorVersion",
      "catalog_alias_projections.generated_at as generatedAt",
      "catalog_alias_projections.reviewed_at as reviewedAt",
      "catalog_alias_projections.decision_reason_code as decisionReasonCode",
      "catalog_alias_projections.decision_result as decisionResult",
    ])
    .where(
      "catalog_alias_projections.source_slug",
      "=",
      CATALOG_ALIAS_SOURCE_SLUG,
    )
    .where(
      "catalog_alias_projections.source_method",
      "=",
      CATALOG_ALIAS_SOURCE_METHOD,
    )
    .where("catalog_alias_projections.status", "in", [
      "generated",
      "review_needed",
      "rejected",
      "accepted",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_alias_projections.generator_version", "is not", null)
    .orderBy(
      sql<number>`case ${sql.ref("catalog_alias_projections.status")}
        when 'generated' then 0
        when 'review_needed' then 1
        when 'rejected' then 2
        when 'accepted' then 3
        else 4
      end`,
      "asc",
    )
    .orderBy("catalog_alias_projections.generated_at", "desc")
    .orderBy("catalog_alias_projections.id", "asc")
    .limit(normalizeLimit(limit, MAX_ALIAS_SUGGESTIONS));
}

export function buildEnqueueCatalogAliasSuggestionsRefreshJobQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  const payload = {
    kind: CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
    catalogItemId,
  } satisfies JsonValue;
  const now = new Date();

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `${CATALOG_ALIAS_SUGGESTIONS_IDEMPOTENCY_PREFIX}${catalogItemId}`,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          status: sql<string>`case
            when job_queue.status = 'processing' then job_queue.status
            else 'pending'
          end`,
          available_at: now,
          locked_at: sql<Date | null>`case
            when job_queue.status = 'processing' then job_queue.locked_at
            else null
          end`,
          locked_by: sql<string | null>`case
            when job_queue.status = 'processing' then job_queue.locked_by
            else null
          end`,
          rerun_requested: sql<boolean>`(job_queue.status = 'processing')`,
          last_error: null,
          updated_at: now,
        }),
    )
    .returningAll();
}

export function buildCatalogAliasSuggestionForDecisionQuery(
  executor: QueryExecutor,
  aliasProjectionId: string,
) {
  return executor
    .selectFrom("catalog_alias_projections")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_alias_projections.catalog_item_id",
    )
    .innerJoin("catalog_item_names as source_names", (join) =>
      join.onRef(
        "source_names.id",
        "=",
        "catalog_alias_projections.generated_from_catalog_item_name_id",
      ),
    )
    .select([
      "catalog_alias_projections.id as id",
      "catalog_alias_projections.catalog_item_id as catalogItemId",
      "catalog_alias_projections.display_name as displayName",
      "catalog_alias_projections.normalized_name as normalizedName",
      "catalog_alias_projections.locale as locale",
      "catalog_alias_projections.status as status",
      "catalog_alias_projections.source_name_fingerprint as sourceNameFingerprint",
      "catalog_alias_projections.generator_version as generatorVersion",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.status as catalogStatus",
      "catalog_items.created_by_user_id as catalogCreatedByUserId",
      "source_names.id as sourceNameId",
      "source_names.catalog_item_id as sourceNameCatalogItemId",
      "source_names.display_name as sourceDisplayName",
      "source_names.normalized_name as sourceNormalizedName",
      "source_names.locale as sourceLocale",
      sql<boolean>`(
        source_names.is_primary = true
        or exists (
          select 1
          from catalog_alias_projections as accepted_source_projections
          where accepted_source_projections.catalog_item_name_id = source_names.id
            and accepted_source_projections.status = 'accepted'
            and accepted_source_projections.source_method <> 'generated'
        )
      )`.as("sourceNameEligible"),
    ])
    .where("catalog_alias_projections.id", "=", aliasProjectionId)
    .where(
      "catalog_alias_projections.source_slug",
      "=",
      CATALOG_ALIAS_SOURCE_SLUG,
    )
    .where(
      "catalog_alias_projections.source_method",
      "=",
      CATALOG_ALIAS_SOURCE_METHOD,
    )
    .where("catalog_alias_projections.status", "in", [
      "generated",
      "review_needed",
    ])
    .forUpdate();
}

export function buildCatalogAliasCollisionQuery(
  executor: QueryExecutor,
  input: { catalogItemId: string; normalizedName: string },
) {
  return executor
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select("catalog_item_names.id as id")
    .where("catalog_item_names.normalized_name", "=", input.normalizedName)
    .where("catalog_item_names.catalog_item_id", "!=", input.catalogItemId)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .orderBy("catalog_item_names.id", "asc")
    .limit(1)
    .forUpdate();
}

export function buildExistingCatalogAliasNameQuery(
  executor: QueryExecutor,
  input: { catalogItemId: string; normalizedName: string; locale: string },
) {
  return executor
    .selectFrom("catalog_item_names")
    .select("catalog_item_names.id as id")
    .where("catalog_item_names.catalog_item_id", "=", input.catalogItemId)
    .where("catalog_item_names.normalized_name", "=", input.normalizedName)
    .where("catalog_item_names.locale", "=", input.locale)
    .forUpdate();
}

export function buildInsertApprovedCatalogAliasNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
  },
) {
  return executor
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: input.catalogItemId,
      display_name: input.displayName,
      normalized_name: input.normalizedName,
      locale: input.locale,
      is_primary: false,
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "normalized_name", "locale"]).doNothing(),
    )
    .returning("id");
}

export function buildApproveCatalogAliasProjectionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    aliasProjectionId: string;
    catalogItemNameId: string;
    decisionResult: "alias_projected" | "alias_already_projected";
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_alias_projections")
    .set({
      catalog_item_name_id: input.catalogItemNameId,
      status: "accepted",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      decision_reason_code: "approved_generated_alias",
      decision_result: input.decisionResult,
      updated_at: input.now,
    })
    .where("id", "=", input.aliasProjectionId)
    .where("source_slug", "=", CATALOG_ALIAS_SOURCE_SLUG)
    .where("source_method", "=", CATALOG_ALIAS_SOURCE_METHOD)
    .where("status", "=", "generated")
    .returning("id");
}

export function buildRejectCatalogAliasProjectionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    aliasProjectionId: string;
    reasonCode: CatalogAliasRejectionReason;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_alias_projections")
    .set({
      catalog_item_name_id: null,
      status: "rejected",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      decision_reason_code: input.reasonCode,
      decision_result: "alias_rejected",
      updated_at: input.now,
    })
    .where("id", "=", input.aliasProjectionId)
    .where("source_slug", "=", CATALOG_ALIAS_SOURCE_SLUG)
    .where("source_method", "=", CATALOG_ALIAS_SOURCE_METHOD)
    .where("status", "in", ["generated", "review_needed"])
    .returning("id");
}

export function buildStaleCatalogAliasProjectionQuery(
  executor: QueryExecutor,
  aliasProjectionId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_alias_projections")
    .set({ status: "stale", updated_at: now })
    .where("id", "=", aliasProjectionId)
    .where("source_slug", "=", CATALOG_ALIAS_SOURCE_SLUG)
    .where("source_method", "=", CATALOG_ALIAS_SOURCE_METHOD)
    .where("status", "in", ["generated", "review_needed"])
    .returning("id");
}

export function buildHoldCatalogAliasCollisionQuery(
  executor: QueryExecutor,
  aliasProjectionId: string,
  now: Date,
) {
  return executor
    .updateTable("catalog_alias_projections")
    .set({
      status: "review_needed",
      reason_codes: sql<string[]>`case
        when 'normalized_collision' = any(reason_codes) then reason_codes
        else array_append(reason_codes, 'normalized_collision')
      end`,
      updated_at: now,
    })
    .where("id", "=", aliasProjectionId)
    .where("source_slug", "=", CATALOG_ALIAS_SOURCE_SLUG)
    .where("source_method", "=", CATALOG_ALIAS_SOURCE_METHOD)
    .where("status", "in", ["generated", "review_needed"])
    .returning("id");
}

export function normalizeCatalogAliasRejectionReason(
  value: string | null | undefined,
): CatalogAliasRejectionReason {
  switch (value) {
    case "incorrect_variant":
    case "locale_or_script_mismatch":
    case "ambiguous_catalog_identity":
    case "unsafe_generated_form":
    case "other_review_reason":
      return value;
    default:
      throw new Error("A valid catalog alias rejection reason is required.");
  }
}

export function buildCatalogAliasSourceFingerprint(values: readonly string[]) {
  return createHash("sha256")
    .update(JSON.stringify(values), "utf8")
    .digest("hex");
}

function isCurrentCatalogAliasSuggestion(input: {
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogKind: string;
  catalogStatus: string;
  catalogCreatedByUserId: string | null;
  sourceNameId: string;
  sourceNameCatalogItemId: string;
  sourceDisplayName: string;
  sourceNormalizedName: string;
  sourceLocale: string;
  sourceNameEligible: boolean;
  sourceNameFingerprint: string | null;
  generatorVersion: string | null;
}) {
  if (
    input.catalogCreatedByUserId !== null ||
    !input.sourceNameEligible ||
    !SELECTABLE_CATALOG_STATUSES.includes(
      input.catalogStatus as (typeof SELECTABLE_CATALOG_STATUSES)[number],
    ) ||
    input.catalogItemId !== input.sourceNameCatalogItemId ||
    input.generatorVersion !== CATALOG_ALIAS_GENERATOR_VERSION
  ) {
    return false;
  }

  return (
    input.sourceNameFingerprint ===
    buildCatalogAliasSourceFingerprint([
      input.catalogItemId,
      input.catalogCanonicalName,
      input.catalogKind,
      input.catalogStatus,
      input.sourceNameId,
      input.sourceDisplayName,
      input.sourceNormalizedName,
      input.sourceLocale,
      CATALOG_ALIAS_GENERATOR_VERSION,
    ])
  );
}

async function requireCatalogAliasSuggestionForDecision(
  executor: QueryExecutor,
  aliasProjectionId: string,
) {
  const suggestion = await buildCatalogAliasSuggestionForDecisionQuery(
    executor,
    aliasProjectionId,
  ).executeTakeFirst();
  if (!suggestion) {
    throw new Error(
      "Catalog alias suggestion was not found or is not reviewable.",
    );
  }
  return suggestion;
}

function normalizeCatalogAliasQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_ALIAS_QUERY_LENGTH);
}

function requireCatalogAliasIdentifier(value: string, label: string): string {
  const normalized = normalizeCatalogItemId(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeLimit(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), fallback);
}
