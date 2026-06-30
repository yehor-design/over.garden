import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  GENEBANK_LONG_TAIL_PARSER_VERSION,
  GRIN_GENEBANK_SOURCE,
  genebankLongTailDefinition,
  genebankLongTailPromotionProjection,
} from "@/lib/catalog/genebank-long-tail";
import {
  buildEnqueueGenebankTypeaheadReindexJobQuery,
  buildInsertGenebankSourceLinkQuery,
  buildMarkGenebankRecordProjectedQuery,
  buildUpsertGenebankCatalogItemQuery,
  buildUpsertGenebankCatalogNameQuery,
} from "@/server/catalog-source/genebank-long-tail-import";
import type { RequestScope } from "@/server/request-scope";

const MAX_SOURCE_CANDIDATES = 40;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type CatalogSourceCandidateReviewStatus =
  | "quarantined"
  | "review_needed"
  | "projected"
  | "rejected";

export interface CatalogSourceCandidateReviewRow {
  sourceRecordId: string;
  sourceRecordKey: string;
  projectionStatus: string;
  allowedProjection: JsonValue;
  updatedAt: Date | string;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  allowedUsage: JsonValue;
  parserVersion: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  catalogItemId: string | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  catalogStatus: string | null;
  catalogKind: string | null;
  typeaheadNameCount: number | string | bigint;
}

export interface CatalogSourceCandidateReviewItem {
  sourceRecordId: string;
  sourceRecordKey: string;
  status: CatalogSourceCandidateReviewStatus;
  projectionStatus: string;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  allowedUsage: string[];
  parserVersion: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  updatedAt: Date | string;
  review: {
    displayName: string;
    candidateKind: string | null;
    speciesName: string | null;
    reviewStatus: string | null;
    legalStatus: string | null;
    curatorDecision: string | null;
    sourceRowReference: string | null;
  };
  promotionPreview: {
    canonicalName: string;
    catalogKind: string;
    source: string;
    sourceId: string;
    aliases: Array<{
      displayName: string;
      locale: string;
      isPrimary: boolean;
    }>;
  } | null;
  projectedCatalog: {
    catalogItemId: string;
    canonicalName: string;
    publicSlug: string | null;
    status: string;
    catalogKind: string;
    typeaheadNameCount: number;
  } | null;
  actions: {
    canPromote: boolean;
    canHold: boolean;
    canReject: boolean;
    blockedReason: string | null;
  };
}

export interface CatalogSourceCandidateDecisionInput {
  sourceRecordId: string;
}

export interface CatalogSourceCandidateDecisionResult {
  sourceRecordId: string;
  sourceRecordKey: string;
  status: CatalogSourceCandidateReviewStatus;
  catalogItemId: string | null;
  catalogPublicSlug: string | null;
}

export async function listCatalogSourceCandidatesForReview(
  limit = MAX_SOURCE_CANDIDATES,
): Promise<CatalogSourceCandidateReviewItem[]> {
  const rows = await buildCatalogSourceCandidatesForReviewQuery(
    db,
    limit,
  ).execute();

  return rows.map(toCatalogSourceCandidateReviewItem);
}

export async function promoteCatalogSourceCandidate(
  scope: RequestScope,
  input: CatalogSourceCandidateDecisionInput,
): Promise<CatalogSourceCandidateDecisionResult> {
  void scope;
  const sourceRecordId = normalizeSourceRecordId(input.sourceRecordId);

  return db.transaction().execute(async (trx) => {
    const row = await requireCatalogSourceCandidateForDecision(
      trx,
      sourceRecordId,
    );
    const candidate = toCatalogSourceCandidateReviewItem({
      ...row,
      catalogItemId: null,
      catalogCanonicalName: null,
      catalogPublicSlug: null,
      catalogStatus: null,
      catalogKind: null,
      typeaheadNameCount: 0,
    });

    if (!candidate.actions.canPromote) {
      throw new Error(
        candidate.actions.blockedReason ?? "Source candidate cannot promote.",
      );
    }

    const projection = genebankLongTailPromotionProjection();
    const catalogItem = await buildUpsertGenebankCatalogItemQuery(
      trx,
      projection,
    ).executeTakeFirstOrThrow();

    for (const alias of projection.aliases) {
      await buildUpsertGenebankCatalogNameQuery(trx, {
        catalogItemId: catalogItem.id,
        ...alias,
      }).execute();
    }

    await buildInsertGenebankSourceLinkQuery(trx, {
      catalogItemId: catalogItem.id,
      sourceRecordId: candidate.sourceRecordId,
      sourceRecordKey: candidate.sourceRecordKey,
    }).execute();

    await buildMarkGenebankRecordProjectedQuery(trx, {
      sourceRecordId: candidate.sourceRecordId,
    }).executeTakeFirstOrThrow();

    await buildEnqueueGenebankTypeaheadReindexJobQuery(
      trx,
    ).executeTakeFirstOrThrow();

    return {
      sourceRecordId: candidate.sourceRecordId,
      sourceRecordKey: candidate.sourceRecordKey,
      status: "projected",
      catalogItemId: catalogItem.id,
      catalogPublicSlug: catalogItem.publicSlug,
    };
  });
}

export async function holdCatalogSourceCandidate(
  scope: RequestScope,
  input: CatalogSourceCandidateDecisionInput,
): Promise<CatalogSourceCandidateDecisionResult> {
  void scope;
  const sourceRecordId = normalizeSourceRecordId(input.sourceRecordId);

  return db.transaction().execute(async (trx) => {
    const row = await requireCatalogSourceCandidateForDecision(
      trx,
      sourceRecordId,
    );
    const candidate = toCatalogSourceCandidateReviewItem({
      ...row,
      catalogItemId: null,
      catalogCanonicalName: null,
      catalogPublicSlug: null,
      catalogStatus: null,
      catalogKind: null,
      typeaheadNameCount: 0,
    });

    if (!candidate.actions.canHold) {
      throw new Error("Source candidate cannot be held from this state.");
    }

    const held = await buildHoldCatalogSourceCandidateQuery(trx, {
      sourceRecordId,
      now: new Date(),
    }).executeTakeFirstOrThrow();

    return {
      sourceRecordId,
      sourceRecordKey: held.sourceRecordKey,
      status:
        candidate.review.reviewStatus === "review_needed"
          ? "review_needed"
          : "quarantined",
      catalogItemId: null,
      catalogPublicSlug: null,
    };
  });
}

export async function rejectCatalogSourceCandidate(
  scope: RequestScope,
  input: CatalogSourceCandidateDecisionInput,
): Promise<CatalogSourceCandidateDecisionResult> {
  void scope;
  const sourceRecordId = normalizeSourceRecordId(input.sourceRecordId);

  return db.transaction().execute(async (trx) => {
    const row = await requireCatalogSourceCandidateForDecision(
      trx,
      sourceRecordId,
    );
    const candidate = toCatalogSourceCandidateReviewItem({
      ...row,
      catalogItemId: null,
      catalogCanonicalName: null,
      catalogPublicSlug: null,
      catalogStatus: null,
      catalogKind: null,
      typeaheadNameCount: 0,
    });

    if (!candidate.actions.canReject) {
      throw new Error("Source candidate cannot be rejected from this state.");
    }

    const rejected = await buildRejectCatalogSourceCandidateQuery(trx, {
      sourceRecordId,
      now: new Date(),
    }).executeTakeFirstOrThrow();

    return {
      sourceRecordId,
      sourceRecordKey: rejected.sourceRecordKey,
      status: "rejected",
      catalogItemId: null,
      catalogPublicSlug: null,
    };
  });
}

export function buildCatalogSourceCandidatesForReviewQuery(
  executor: QueryExecutor,
  limit = MAX_SOURCE_CANDIDATES,
) {
  return executor
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .leftJoin("catalog_source_links", (join) =>
      join
        .onRef(
          "catalog_source_links.source_record_id",
          "=",
          "catalog_source_records.id",
        )
        .on("catalog_source_links.projection_kind", "=", "canonical_item"),
    )
    .leftJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_source_links.catalog_item_id",
    )
    .leftJoin(
      "catalog_item_names",
      "catalog_item_names.catalog_item_id",
      "catalog_items.id",
    )
    .select(({ fn }) => [
      "catalog_source_records.id as sourceRecordId",
      "catalog_source_records.source_record_id as sourceRecordKey",
      "catalog_source_records.projection_status as projectionStatus",
      "catalog_source_records.allowed_projection as allowedProjection",
      "catalog_source_records.updated_at as updatedAt",
      "catalog_source_snapshots.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.license as license",
      "catalog_source_snapshots.license_url as licenseUrl",
      "catalog_source_snapshots.attribution_required as attributionRequired",
      "catalog_source_snapshots.attribution_text as attributionText",
      "catalog_source_snapshots.allowed_usage as allowedUsage",
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.status as catalogStatus",
      "catalog_items.catalog_kind as catalogKind",
      fn
        .count<number>("catalog_item_names.id")
        .distinct()
        .as("typeaheadNameCount"),
    ])
    .groupBy([
      "catalog_source_records.id",
      "catalog_source_records.source_record_id",
      "catalog_source_records.projection_status",
      "catalog_source_records.allowed_projection",
      "catalog_source_records.updated_at",
      "catalog_source_snapshots.source_slug",
      "catalog_source_snapshots.source_name",
      "catalog_source_snapshots.source_version",
      "catalog_source_snapshots.source_url",
      "catalog_source_snapshots.license",
      "catalog_source_snapshots.license_url",
      "catalog_source_snapshots.attribution_required",
      "catalog_source_snapshots.attribution_text",
      "catalog_source_snapshots.allowed_usage",
      "catalog_source_snapshots.parser_version",
      "catalog_source_snapshots.fetched_at",
      "catalog_source_snapshots.verified_at",
      "catalog_items.id",
      "catalog_items.canonical_name",
      "catalog_items.public_slug",
      "catalog_items.status",
      "catalog_items.catalog_kind",
    ])
    .orderBy(
      sql<number>`case ${sql.ref("catalog_source_records.projection_status")}
        when 'quarantined' then 0
        when 'projected' then 1
        when 'rejected' then 2
        else 3
      end`,
      "asc",
    )
    .orderBy("catalog_source_snapshots.verified_at", "desc")
    .orderBy("catalog_source_records.updated_at", "desc")
    .orderBy("catalog_source_records.source_record_id", "asc")
    .limit(normalizeSourceCandidateLimit(limit));
}

export function buildCatalogSourceCandidateForDecisionQuery(
  executor: QueryExecutor,
  sourceRecordId: string,
) {
  return executor
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_records.id as sourceRecordId",
      "catalog_source_records.source_record_id as sourceRecordKey",
      "catalog_source_records.projection_status as projectionStatus",
      "catalog_source_records.allowed_projection as allowedProjection",
      "catalog_source_records.updated_at as updatedAt",
      "catalog_source_snapshots.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.license as license",
      "catalog_source_snapshots.license_url as licenseUrl",
      "catalog_source_snapshots.attribution_required as attributionRequired",
      "catalog_source_snapshots.attribution_text as attributionText",
      "catalog_source_snapshots.allowed_usage as allowedUsage",
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
    ])
    .where("catalog_source_records.id", "=", sourceRecordId)
    .limit(1);
}

export function buildHoldCatalogSourceCandidateQuery(
  executor: QueryExecutor,
  input: { sourceRecordId: string; now: Date },
) {
  return executor
    .updateTable("catalog_source_records")
    .set({
      projection_status: "quarantined",
      updated_at: input.now,
    })
    .where("id", "=", input.sourceRecordId)
    .where("projection_status", "=", "quarantined")
    .returning([
      "id as sourceRecordId",
      "source_record_id as sourceRecordKey",
      "projection_status as projectionStatus",
    ]);
}

export function buildRejectCatalogSourceCandidateQuery(
  executor: QueryExecutor,
  input: { sourceRecordId: string; now: Date },
) {
  return executor
    .updateTable("catalog_source_records")
    .set({
      projection_status: "rejected",
      updated_at: input.now,
    })
    .where("id", "=", input.sourceRecordId)
    .where("projection_status", "=", "quarantined")
    .returning([
      "id as sourceRecordId",
      "source_record_id as sourceRecordKey",
      "projection_status as projectionStatus",
    ]);
}

async function requireCatalogSourceCandidateForDecision(
  executor: QueryExecutor,
  sourceRecordId: string,
) {
  const candidate = await buildCatalogSourceCandidateForDecisionQuery(
    executor,
    sourceRecordId,
  ).executeTakeFirst();

  if (!candidate) {
    throw new Error("Source candidate was not found.");
  }

  return candidate;
}

export function toCatalogSourceCandidateReviewItem(
  row: CatalogSourceCandidateReviewRow,
): CatalogSourceCandidateReviewItem {
  const review = parseSafeReview(row.allowedProjection);
  const promotionPreview = parsePromotionPreview(row.allowedProjection);
  const status = sourceCandidateReviewStatus(row, review);
  const canPromote = canPromoteCatalogSourceCandidate(
    row,
    review,
    promotionPreview,
    status,
  );
  const canHold = status === "quarantined" || status === "review_needed";
  const canReject = status === "quarantined" || status === "review_needed";

  return {
    sourceRecordId: row.sourceRecordId,
    sourceRecordKey: row.sourceRecordKey,
    status,
    projectionStatus: row.projectionStatus,
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceVersion: row.sourceVersion,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attributionRequired: Boolean(row.attributionRequired),
    attributionText: row.attributionText,
    allowedUsage: parseStringArray(row.allowedUsage),
    parserVersion: row.parserVersion,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    updatedAt: row.updatedAt,
    review,
    promotionPreview,
    projectedCatalog:
      row.catalogItemId &&
      row.catalogCanonicalName &&
      row.catalogStatus &&
      row.catalogKind
        ? {
            catalogItemId: row.catalogItemId,
            canonicalName: row.catalogCanonicalName,
            publicSlug: row.catalogPublicSlug,
            status: row.catalogStatus,
            catalogKind: row.catalogKind,
            typeaheadNameCount: Number(row.typeaheadNameCount),
          }
        : null,
    actions: {
      canPromote,
      canHold,
      canReject,
      blockedReason: canPromote
        ? null
        : blockedPromotionReason(row, review, promotionPreview, status),
    },
  };
}

function sourceCandidateReviewStatus(
  row: CatalogSourceCandidateReviewRow,
  review: CatalogSourceCandidateReviewItem["review"],
): CatalogSourceCandidateReviewStatus {
  if (row.projectionStatus === "projected" || row.catalogItemId) {
    return "projected";
  }
  if (row.projectionStatus === "rejected") return "rejected";
  if (review.reviewStatus === "review_needed") return "review_needed";
  return "quarantined";
}

function canPromoteCatalogSourceCandidate(
  row: CatalogSourceCandidateReviewRow,
  review: CatalogSourceCandidateReviewItem["review"],
  promotionPreview: CatalogSourceCandidateReviewItem["promotionPreview"],
  status: CatalogSourceCandidateReviewStatus,
) {
  const definition = genebankLongTailDefinition();

  return (
    status === "quarantined" &&
    row.sourceSlug === GRIN_GENEBANK_SOURCE.slug &&
    row.sourceVersion === GRIN_GENEBANK_SOURCE.version &&
    row.sourceRecordKey === definition.promotableRecordKey &&
    row.projectionStatus === "quarantined" &&
    row.parserVersion === GENEBANK_LONG_TAIL_PARSER_VERSION &&
    review.curatorDecision === "promote_to_canonical_seed" &&
    promotionPreview !== null
  );
}

function blockedPromotionReason(
  row: CatalogSourceCandidateReviewRow,
  review: CatalogSourceCandidateReviewItem["review"],
  promotionPreview: CatalogSourceCandidateReviewItem["promotionPreview"],
  status: CatalogSourceCandidateReviewStatus,
) {
  if (status === "projected") return "Already projected to catalog.";
  if (status === "rejected") return "Rejected source row.";
  if (row.sourceSlug !== GRIN_GENEBANK_SOURCE.slug) {
    return "No UI promotion gate exists for this source yet.";
  }
  if (review.curatorDecision !== "promote_to_canonical_seed") {
    return "Curator decision does not approve canonical seed promotion.";
  }
  if (!promotionPreview) return "Missing safe promotion preview.";
  return "Source candidate is not cleared for UI promotion.";
}

function parseSafeReview(
  allowedProjection: JsonValue,
): CatalogSourceCandidateReviewItem["review"] {
  const reviewQueue = asRecord(asRecord(allowedProjection)?.reviewQueue);

  return {
    displayName:
      stringField(reviewQueue, "displayName") ?? "Unnamed source candidate",
    candidateKind: stringField(reviewQueue, "candidateKind"),
    speciesName: stringField(reviewQueue, "speciesName"),
    reviewStatus: stringField(reviewQueue, "reviewStatus"),
    legalStatus: stringField(reviewQueue, "legalStatus"),
    curatorDecision: stringField(reviewQueue, "curatorDecision"),
    sourceRowReference: stringField(reviewQueue, "sourceRowReference"),
  };
}

function parsePromotionPreview(
  allowedProjection: JsonValue,
): CatalogSourceCandidateReviewItem["promotionPreview"] {
  const promotion = asRecord(asRecord(allowedProjection)?.promotion);
  if (!promotion) return null;

  const canonicalName = stringField(promotion, "canonicalName");
  const catalogKind = stringField(promotion, "catalogKind");
  const source = stringField(promotion, "source");
  const sourceId = stringField(promotion, "sourceId");
  if (!canonicalName || !catalogKind || !source || !sourceId) return null;

  return {
    canonicalName,
    catalogKind,
    source,
    sourceId,
    aliases: arrayField(promotion, "aliases").flatMap((alias) => {
      const record = asRecord(alias);
      const displayName = stringField(record, "displayName");
      const locale = stringField(record, "locale");
      if (!displayName || !locale) return [];

      return [
        {
          displayName,
          locale,
          isPrimary: booleanField(record, "isPrimary") ?? false,
        },
      ];
    }),
  };
}

function parseStringArray(value: JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function booleanField(
  record: Record<string, unknown> | null,
  key: string,
): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function normalizeSourceRecordId(value: string | null | undefined) {
  if (typeof value !== "string") {
    throw new Error("Source record id is required.");
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    throw new Error("Source record id is required.");
  }
  return trimmed;
}

function normalizeSourceCandidateLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_SOURCE_CANDIDATES;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SOURCE_CANDIDATES);
}
