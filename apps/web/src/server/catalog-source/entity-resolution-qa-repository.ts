import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import { SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES } from "@/server/search/catalog-documents";

const MAX_ENTITY_RESOLUTION_ROWS = 240;
const MAX_ENTITY_RESOLUTION_CLUSTERS = 120;
const MATCHING_QUEUE = "matching";
const CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND =
  "catalog_fuzzy_duplicate_qa_refresh";
const CATALOG_FUZZY_DUPLICATE_QA_IDEMPOTENCY_KEY =
  "catalog-fuzzy-duplicate-qa-refresh";

const ENTITY_RESOLUTION_CLUSTER_KIND_LIMITS = {
  likely_duplicate: 24,
  fuzzy_duplicate: 24,
  source_disagreement: 24,
  alias_collision: 48,
  manual_review_required: 24,
  blocked_projection: 24,
  canonical_concept: 16,
} satisfies Record<CatalogEntityResolutionClusterKind, number>;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type CatalogEntityResolutionClusterKind =
  | "canonical_concept"
  | "likely_duplicate"
  | "fuzzy_duplicate"
  | "alias_collision"
  | "source_disagreement"
  | "blocked_projection"
  | "manual_review_required";

export type CatalogEntityResolutionRecommendedAction =
  | "merge_review"
  | "hold"
  | "reject"
  | "review_needed"
  | "no_action";

export interface CatalogEntityResolutionCatalogRow {
  catalogItemId: string;
  canonicalName: string;
  normalizedName: string | null;
  catalogKind: string;
  status: string;
  source: string;
  publicSlug: string | null;
  typeaheadNameCount: number | string | bigint;
  sourceLinkCount: number | string | bigint;
  sourceNames: string | null;
  sourceSlugs: string | null;
}

export interface CatalogEntityResolutionAliasCollisionRow {
  normalizedAlias: string;
  sampleDisplayName: string;
  catalogItemCount: number | string | bigint;
  sourceCount: number | string | bigint;
  canonicalNames: string | null;
  catalogKinds: string | null;
  sources: string | null;
}

export interface CatalogEntityResolutionSourceCandidateSummaryRow {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  projectionStatus: string;
  reviewStatus: string | null;
  curatorDecision: string | null;
  candidateKind: string | null;
  sampleDisplayName: string | null;
  rowCount: number | string | bigint;
}

export interface CatalogEntityResolutionFuzzyDuplicateRow {
  pairKey: string;
  leftCatalogItemId: string;
  leftCanonicalName: string;
  leftNormalizedName: string | null;
  leftCatalogKind: string;
  leftStatus: string;
  leftSource: string;
  leftPublicSlug: string | null;
  leftLocale: string;
  rightCatalogItemId: string;
  rightCanonicalName: string;
  rightNormalizedName: string | null;
  rightCatalogKind: string;
  rightStatus: string;
  rightSource: string;
  rightPublicSlug: string | null;
  rightLocale: string;
  score: number | string | bigint;
  scoreBucket: string;
  reasonCodes: string[];
  localeRelation: string;
  recommendedAction: string;
  matcherVersion: string;
  generatedAt: Date | string;
  evidenceStatus: "current" | "stale";
  totalCount: number | string | bigint;
}

export interface CatalogEntityResolutionClusterMember {
  label: string;
  normalizedLabel?: string;
  locale?: string;
  catalogKind?: string;
  source?: string;
  status?: string;
  publicSlug?: string | null;
  typeaheadNameCount?: number;
  sourceLinkCount?: number;
  rowCount?: number;
}

export interface CatalogEntityResolutionCluster {
  id: string;
  kind: CatalogEntityResolutionClusterKind;
  title: string;
  riskLevel: "info" | "review_needed" | "blocked";
  reason: string;
  recommendedAction: CatalogEntityResolutionRecommendedAction;
  actionHref: string;
  fuzzyScore?: number;
  fuzzyScoreBucket?: string;
  reasonCodes?: string[];
  localeRelation?: "same_locale" | "cross_locale";
  evidenceStatus?: "current" | "stale";
  members: CatalogEntityResolutionClusterMember[];
}

export interface CatalogEntityResolutionQaReport {
  schemaVersion: "ove162.catalogEntityResolutionQa.v2";
  issue: "OVE-162";
  generatedAt: string;
  evidenceSafety: "linear_safe_redacted";
  summary: {
    clusterCount: number;
    sourceBackedCatalogRowsReviewed: number;
    aliasCollisionRowsReviewed: number;
    sourceCandidateGroupsReviewed: number;
    fuzzyDuplicatePairCount: number;
    fuzzyDuplicateRowsReviewed: number;
    groups: Array<{
      kind: CatalogEntityResolutionClusterKind;
      label: string;
      count: number;
      nextAction: string;
    }>;
  };
  clusters: CatalogEntityResolutionCluster[];
  leakCheck: "passed";
}

export const CATALOG_ENTITY_RESOLUTION_CLUSTER_GROUPS: Array<{
  kind: CatalogEntityResolutionClusterKind;
  label: string;
  nextAction: string;
}> = [
  {
    kind: "fuzzy_duplicate",
    label: "Fuzzy duplicate",
    nextAction: "Merge review or hold",
  },
  {
    kind: "likely_duplicate",
    label: "Likely duplicate",
    nextAction: "Merge review",
  },
  {
    kind: "source_disagreement",
    label: "Source disagreement",
    nextAction: "Review canonical source precedence",
  },
  {
    kind: "alias_collision",
    label: "Alias collision",
    nextAction: "Hold alias or merge manually",
  },
  {
    kind: "manual_review_required",
    label: "Manual review required",
    nextAction: "Review source candidate lane",
  },
  {
    kind: "blocked_projection",
    label: "Blocked projection",
    nextAction: "Reject or keep source-only",
  },
  {
    kind: "canonical_concept",
    label: "Canonical concept",
    nextAction: "No destructive action",
  },
];

const FORBIDDEN_ENTITY_RESOLUTION_EVIDENCE_MARKERS = [
  "raw_payload",
  "rawPayload",
  "source_only_fields",
  "sourceOnlyFields",
  "rawPayloadSha256",
  "sourceRecordId",
  "sourceRecordKey",
  "source_record_id",
  "source_record_key",
  "email",
  "ipAddress",
  "ip_address",
  "userAgent",
  "user_agent",
  "cookie",
  "token",
  "journalTitle",
  "journalBody",
  "ownerUserId",
  "owner_user_id",
  "mediaAsset",
  "media_assets",
  "quarantineKey",
  "derivativeKey",
  "preciseLocation",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
] as const;

export async function readCatalogEntityResolutionQaReport(
  executor: QueryExecutor,
): Promise<CatalogEntityResolutionQaReport> {
  const catalogRows =
    await buildCatalogEntityResolutionCatalogRowsQuery(executor).execute();
  const aliasCollisionRows =
    await buildCatalogEntityResolutionAliasCollisionRowsQuery(
      executor,
    ).execute();
  const sourceCandidateRows =
    await buildCatalogEntityResolutionSourceCandidateSummaryQuery(
      executor,
    ).execute();
  const fuzzyDuplicateRows =
    await buildCatalogEntityResolutionFuzzyDuplicateRowsQuery(
      executor,
    ).execute();

  return buildCatalogEntityResolutionQaReport({
    generatedAt: new Date().toISOString(),
    catalogRows,
    aliasCollisionRows,
    sourceCandidateRows,
    fuzzyDuplicateRows,
  });
}

export function buildCatalogEntityResolutionQaReport(input: {
  generatedAt: string;
  catalogRows: CatalogEntityResolutionCatalogRow[];
  aliasCollisionRows: CatalogEntityResolutionAliasCollisionRow[];
  sourceCandidateRows: CatalogEntityResolutionSourceCandidateSummaryRow[];
  fuzzyDuplicateRows: CatalogEntityResolutionFuzzyDuplicateRow[];
}): CatalogEntityResolutionQaReport {
  const clusters = limitEntityResolutionClusters([
    ...buildCatalogConceptClusters(input.catalogRows),
    ...buildAliasCollisionClusters(input.aliasCollisionRows),
    ...buildSourceCandidateClusters(input.sourceCandidateRows),
    ...buildFuzzyDuplicateClusters(input.fuzzyDuplicateRows),
  ]);

  const report: CatalogEntityResolutionQaReport = {
    schemaVersion: "ove162.catalogEntityResolutionQa.v2",
    issue: "OVE-162",
    generatedAt: input.generatedAt,
    evidenceSafety: "linear_safe_redacted",
    summary: {
      clusterCount: clusters.length,
      sourceBackedCatalogRowsReviewed: input.catalogRows.length,
      aliasCollisionRowsReviewed: input.aliasCollisionRows.length,
      sourceCandidateGroupsReviewed: input.sourceCandidateRows.length,
      fuzzyDuplicatePairCount: input.fuzzyDuplicateRows[0]
        ? numberValue(input.fuzzyDuplicateRows[0].totalCount)
        : 0,
      fuzzyDuplicateRowsReviewed: input.fuzzyDuplicateRows.length,
      groups: CATALOG_ENTITY_RESOLUTION_CLUSTER_GROUPS.map((group) => ({
        ...group,
        count: clusters.filter((cluster) => cluster.kind === group.kind).length,
      })),
    },
    clusters,
    leakCheck: "passed",
  };

  assertCatalogEntityResolutionEvidenceSafe(report);
  return report;
}

export function buildCatalogEntityResolutionFuzzyDuplicateRowsQuery(
  executor: QueryExecutor,
  limit = MAX_ENTITY_RESOLUTION_ROWS,
) {
  return executor
    .selectFrom("catalog_fuzzy_duplicate_suggestions")
    .innerJoin(
      "catalog_items as fuzzy_left_catalog_item",
      "fuzzy_left_catalog_item.id",
      "catalog_fuzzy_duplicate_suggestions.left_catalog_item_id",
    )
    .innerJoin(
      "catalog_items as fuzzy_right_catalog_item",
      "fuzzy_right_catalog_item.id",
      "catalog_fuzzy_duplicate_suggestions.right_catalog_item_id",
    )
    .select([
      "catalog_fuzzy_duplicate_suggestions.pair_key as pairKey",
      "fuzzy_left_catalog_item.id as leftCatalogItemId",
      "fuzzy_left_catalog_item.canonical_name as leftCanonicalName",
      "fuzzy_left_catalog_item.normalized_name as leftNormalizedName",
      "fuzzy_left_catalog_item.catalog_kind as leftCatalogKind",
      "fuzzy_left_catalog_item.status as leftStatus",
      "fuzzy_left_catalog_item.source as leftSource",
      "fuzzy_left_catalog_item.public_slug as leftPublicSlug",
      "fuzzy_left_catalog_item.locale as leftLocale",
      "fuzzy_right_catalog_item.id as rightCatalogItemId",
      "fuzzy_right_catalog_item.canonical_name as rightCanonicalName",
      "fuzzy_right_catalog_item.normalized_name as rightNormalizedName",
      "fuzzy_right_catalog_item.catalog_kind as rightCatalogKind",
      "fuzzy_right_catalog_item.status as rightStatus",
      "fuzzy_right_catalog_item.source as rightSource",
      "fuzzy_right_catalog_item.public_slug as rightPublicSlug",
      "fuzzy_right_catalog_item.locale as rightLocale",
      "catalog_fuzzy_duplicate_suggestions.score as score",
      "catalog_fuzzy_duplicate_suggestions.score_bucket as scoreBucket",
      "catalog_fuzzy_duplicate_suggestions.reason_codes as reasonCodes",
      "catalog_fuzzy_duplicate_suggestions.locale_relation as localeRelation",
      "catalog_fuzzy_duplicate_suggestions.recommended_action as recommendedAction",
      "catalog_fuzzy_duplicate_suggestions.matcher_version as matcherVersion",
      "catalog_fuzzy_duplicate_suggestions.generated_at as generatedAt",
      sql<number | string | bigint>`count(*) over()`.as("totalCount"),
      sql<"current" | "stale">`case
        when ${sql.ref("fuzzy_left_catalog_item.updated_at")}
          = ${sql.ref("catalog_fuzzy_duplicate_suggestions.left_updated_at_snapshot")}
         and ${sql.ref("fuzzy_right_catalog_item.updated_at")}
          = ${sql.ref("catalog_fuzzy_duplicate_suggestions.right_updated_at_snapshot")}
        then 'current'
        else 'stale'
      end`.as("evidenceStatus"),
    ])
    .orderBy("catalog_fuzzy_duplicate_suggestions.score", "desc")
    .orderBy("catalog_fuzzy_duplicate_suggestions.pair_key", "asc")
    .limit(normalizeEntityResolutionLimit(limit))
    .$castTo<CatalogEntityResolutionFuzzyDuplicateRow>();
}

export function buildEnqueueCatalogFuzzyDuplicateQaRefreshJobQuery(
  executor: QueryExecutor,
) {
  const payload = {
    kind: CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
  } satisfies JsonValue;
  const now = new Date();

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: CATALOG_FUZZY_DUPLICATE_QA_IDEMPOTENCY_KEY,
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

export function buildCatalogEntityResolutionCatalogRowsQuery(
  executor: QueryExecutor,
  limit = MAX_ENTITY_RESOLUTION_ROWS,
) {
  return executor
    .selectFrom("catalog_items")
    .leftJoin(
      "catalog_item_names",
      "catalog_item_names.catalog_item_id",
      "catalog_items.id",
    )
    .leftJoin(
      "catalog_source_links",
      "catalog_source_links.catalog_item_id",
      "catalog_items.id",
    )
    .leftJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .leftJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.normalized_name as normalizedName",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_items.public_slug as publicSlug",
      sql<number>`count(distinct ${sql.ref("catalog_item_names.id")})::int`.as(
        "typeaheadNameCount",
      ),
      sql<number>`count(distinct ${sql.ref("catalog_source_links.id")})::int`.as(
        "sourceLinkCount",
      ),
      sql<string>`coalesce(string_agg(distinct ${sql.ref("catalog_source_snapshots.source_name")}, ', '), '')`.as(
        "sourceNames",
      ),
      sql<string>`coalesce(string_agg(distinct ${sql.ref("catalog_source_snapshots.source_slug")}, ', '), '')`.as(
        "sourceSlugs",
      ),
    ])
    .where("catalog_items.status", "in", ["seeded", "confirmed"])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.source", "in", [
      ...SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES,
    ])
    .groupBy([
      "catalog_items.id",
      "catalog_items.canonical_name",
      "catalog_items.normalized_name",
      "catalog_items.catalog_kind",
      "catalog_items.status",
      "catalog_items.source",
      "catalog_items.public_slug",
    ])
    .orderBy("catalog_items.updated_at", "desc")
    .limit(normalizeEntityResolutionLimit(limit))
    .$castTo<CatalogEntityResolutionCatalogRow>();
}

export function buildCatalogEntityResolutionAliasCollisionRowsQuery(
  executor: QueryExecutor,
  limit = MAX_ENTITY_RESOLUTION_ROWS,
) {
  return executor
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_item_names.normalized_name as normalizedAlias",
      sql<string>`min(${sql.ref("catalog_item_names.display_name")})`.as(
        "sampleDisplayName",
      ),
      sql<number>`count(distinct ${sql.ref("catalog_items.id")})::int`.as(
        "catalogItemCount",
      ),
      sql<number>`count(distinct ${sql.ref("catalog_items.source")})::int`.as(
        "sourceCount",
      ),
      sql<string>`string_agg(distinct ${sql.ref("catalog_items.canonical_name")}, ' | ')`.as(
        "canonicalNames",
      ),
      sql<string>`string_agg(distinct ${sql.ref("catalog_items.catalog_kind")}, ', ')`.as(
        "catalogKinds",
      ),
      sql<string>`string_agg(distinct ${sql.ref("catalog_items.source")}, ', ')`.as(
        "sources",
      ),
    ])
    .where("catalog_items.status", "in", ["seeded", "confirmed"])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.source", "in", [
      ...SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES,
    ])
    .groupBy("catalog_item_names.normalized_name")
    .having(sql<number>`count(distinct ${sql.ref("catalog_items.id")})`, ">", 1)
    .orderBy(
      sql<number>`count(distinct ${sql.ref("catalog_items.id")})`,
      "desc",
    )
    .orderBy("catalog_item_names.normalized_name", "asc")
    .limit(normalizeEntityResolutionLimit(limit))
    .$castTo<CatalogEntityResolutionAliasCollisionRow>();
}

export function buildCatalogEntityResolutionSourceCandidateSummaryQuery(
  executor: QueryExecutor,
  limit = MAX_ENTITY_RESOLUTION_ROWS,
) {
  const reviewStatus = sql<
    string | null
  >`catalog_source_records.allowed_projection #>> '{reviewQueue,reviewStatus}'`;
  const curatorDecision = sql<
    string | null
  >`catalog_source_records.allowed_projection #>> '{reviewQueue,curatorDecision}'`;
  const candidateKind = sql<
    string | null
  >`catalog_source_records.allowed_projection #>> '{reviewQueue,candidateKind}'`;

  return executor
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_snapshots.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_records.projection_status as projectionStatus",
      reviewStatus.as("reviewStatus"),
      curatorDecision.as("curatorDecision"),
      candidateKind.as("candidateKind"),
      sql<
        string | null
      >`min(catalog_source_records.allowed_projection #>> '{reviewQueue,displayName}')`.as(
        "sampleDisplayName",
      ),
      sql<number>`count(*)::int`.as("rowCount"),
    ])
    .groupBy([
      "catalog_source_snapshots.source_slug",
      "catalog_source_snapshots.source_name",
      "catalog_source_snapshots.source_version",
      "catalog_source_records.projection_status",
      reviewStatus,
      curatorDecision,
      candidateKind,
    ])
    .having(sql<number>`count(*)`, ">", 0)
    .orderBy("catalog_source_snapshots.source_slug", "asc")
    .orderBy("catalog_source_records.projection_status", "asc")
    .limit(normalizeEntityResolutionLimit(limit))
    .$castTo<CatalogEntityResolutionSourceCandidateSummaryRow>();
}

function buildCatalogConceptClusters(
  rows: CatalogEntityResolutionCatalogRow[],
): CatalogEntityResolutionCluster[] {
  const clusters: CatalogEntityResolutionCluster[] = [];
  const byCanonicalKind = groupBy(rows, (row) =>
    [
      normalizeEntityResolutionText(row.normalizedName ?? row.canonicalName),
      row.catalogKind,
    ].join(":"),
  );

  for (const groupRows of byCanonicalKind.values()) {
    if (groupRows.length > 1) {
      const first = groupRows[0];
      const sources = unique(groupRows.map((row) => row.source));
      clusters.push({
        id: clusterId(
          "likely_duplicate",
          groupRows.map((row) => row.catalogItemId),
        ),
        kind: "likely_duplicate",
        title: first
          ? `${first.canonicalName} appears as ${groupRows.length} source-backed catalog rows`
          : "Source-backed duplicate cluster",
        riskLevel: "review_needed",
        reason:
          "Multiple source-backed catalog rows share the same normalized canonical identity and kind. Keep one selectable concept after manual review.",
        recommendedAction: "merge_review",
        actionHref: "/garden/catalog/curation",
        members: groupRows.map(catalogRowMember),
      });

      if (sources.length > 1) {
        clusters.push({
          id: clusterId(
            "source_disagreement",
            groupRows.map((row) => `${row.source}:${row.catalogItemId}`),
          ),
          kind: "source_disagreement",
          title: `${first?.canonicalName ?? "Catalog concept"} spans ${sources.length} source families`,
          riskLevel: "review_needed",
          reason:
            "The same normalized concept appears across source families. Confirm source precedence and attribution before production proof.",
          recommendedAction: "review_needed",
          actionHref: "/garden/catalog/curation",
          members: groupRows.map(catalogRowMember),
        });
      }
    }
  }

  for (const row of rows) {
    const sourceLinkCount = numberValue(row.sourceLinkCount);
    if (sourceLinkCount > 1) {
      clusters.push({
        id: clusterId("canonical_concept", [row.catalogItemId]),
        kind: "canonical_concept",
        title: `${row.canonicalName} has ${sourceLinkCount} safe source links`,
        riskLevel: "info",
        reason:
          "One canonical catalog concept carries multiple source proofs. This is acceptable when provenance remains auditable and typeahead remains one selectable suggestion.",
        recommendedAction: "no_action",
        actionHref: "/garden/catalog/curation",
        members: [catalogRowMember(row)],
      });
    }
  }

  return clusters;
}

function buildAliasCollisionClusters(
  rows: CatalogEntityResolutionAliasCollisionRow[],
): CatalogEntityResolutionCluster[] {
  return rows.map((row) => ({
    id: clusterId("alias_collision", [row.normalizedAlias, row.canonicalNames]),
    kind: "alias_collision",
    title: `"${row.sampleDisplayName}" is attached to ${numberValue(row.catalogItemCount)} catalog concepts`,
    riskLevel: "review_needed",
    reason:
      "One normalized alias resolves to multiple source-backed catalog concepts. Confirm whether this is a true synonym, a homonym, or a false-positive merge risk.",
    recommendedAction: "review_needed",
    actionHref: "/garden/catalog/curation",
    members: [
      {
        label: row.canonicalNames ?? row.normalizedAlias,
        catalogKind: row.catalogKinds ?? undefined,
        source: row.sources ?? undefined,
        rowCount: numberValue(row.catalogItemCount),
      },
    ],
  }));
}

function buildSourceCandidateClusters(
  rows: CatalogEntityResolutionSourceCandidateSummaryRow[],
): CatalogEntityResolutionCluster[] {
  return rows.flatMap((row) => {
    const kind = sourceCandidateClusterKind(row);
    if (!kind) return [];

    const rowCount = numberValue(row.rowCount);
    return [
      {
        id: clusterId(kind, [
          row.sourceSlug,
          row.sourceVersion,
          row.projectionStatus,
          row.reviewStatus,
          row.curatorDecision,
          row.candidateKind,
        ]),
        kind,
        title: `${row.sourceSlug} ${sourceCandidateTitleStatus(row)} (${rowCount})`,
        riskLevel: kind === "blocked_projection" ? "blocked" : "review_needed",
        reason:
          kind === "blocked_projection"
            ? "These rows are intentionally blocked or rejected and must stay out of product suggestions unless a later gate supersedes the decision."
            : "These rows still need operator review before product projection can be trusted.",
        recommendedAction: kind === "blocked_projection" ? "reject" : "hold",
        actionHref: `/garden/catalog/curation?sourceStatus=${kind === "blocked_projection" ? "blocked" : "review_needed"}`,
        members: [
          {
            label: row.sampleDisplayName ?? row.sourceName,
            source: row.sourceSlug,
            status: sourceCandidateTitleStatus(row),
            rowCount,
          },
        ],
      } satisfies CatalogEntityResolutionCluster,
    ];
  });
}

function buildFuzzyDuplicateClusters(
  rows: CatalogEntityResolutionFuzzyDuplicateRow[],
): CatalogEntityResolutionCluster[] {
  return rows.map((row) => {
    const evidenceStatus =
      row.evidenceStatus === "current" ? "current" : "stale";
    const localeRelation =
      row.localeRelation === "same_locale" ? "same_locale" : "cross_locale";
    const recommendedAction =
      evidenceStatus === "stale" || localeRelation === "cross_locale"
        ? "hold"
        : "merge_review";
    const score = numberValue(row.score);

    return {
      id: clusterId("fuzzy_duplicate", [row.pairKey]),
      kind: "fuzzy_duplicate",
      title: `${row.leftCanonicalName} and ${row.rightCanonicalName} are a ${score}% near match`,
      riskLevel: "review_needed",
      reason:
        evidenceStatus === "stale"
          ? "Catalog inputs changed after this RapidFuzz run. Hold the pair and refresh evidence before any review decision."
          : localeRelation === "cross_locale"
            ? "RapidFuzz found a cross-locale near-name match. Keep the concepts separate until locale and source provenance are reviewed."
            : "RapidFuzz found a deterministic same-locale near-name match. Review the pair manually; this evidence cannot merge catalog rows.",
      recommendedAction,
      actionHref: "/garden/catalog/curation",
      fuzzyScore: score,
      fuzzyScoreBucket: row.scoreBucket,
      reasonCodes: row.reasonCodes,
      localeRelation,
      evidenceStatus,
      members: [
        fuzzyCatalogRowMember({
          label: row.leftCanonicalName,
          normalizedLabel: row.leftNormalizedName,
          catalogKind: row.leftCatalogKind,
          source: row.leftSource,
          status: row.leftStatus,
          publicSlug: row.leftPublicSlug,
          locale: row.leftLocale,
        }),
        fuzzyCatalogRowMember({
          label: row.rightCanonicalName,
          normalizedLabel: row.rightNormalizedName,
          catalogKind: row.rightCatalogKind,
          source: row.rightSource,
          status: row.rightStatus,
          publicSlug: row.rightPublicSlug,
          locale: row.rightLocale,
        }),
      ],
    } satisfies CatalogEntityResolutionCluster;
  });
}

function limitEntityResolutionClusters(
  clusters: CatalogEntityResolutionCluster[],
) {
  const byKind = groupBy(clusters, (cluster) => cluster.kind);
  const limited: CatalogEntityResolutionCluster[] = [];

  for (const group of CATALOG_ENTITY_RESOLUTION_CLUSTER_GROUPS) {
    limited.push(
      ...(byKind.get(group.kind) ?? []).slice(
        0,
        ENTITY_RESOLUTION_CLUSTER_KIND_LIMITS[group.kind],
      ),
    );
  }

  return limited.slice(0, MAX_ENTITY_RESOLUTION_CLUSTERS);
}

function sourceCandidateClusterKind(
  row: CatalogEntityResolutionSourceCandidateSummaryRow,
): CatalogEntityResolutionClusterKind | null {
  if (
    row.projectionStatus === "rejected" ||
    row.curatorDecision === "blocked_source_only"
  ) {
    return "blocked_projection";
  }
  if (row.projectionStatus !== "projected") return "manual_review_required";
  return null;
}

function sourceCandidateTitleStatus(
  row: CatalogEntityResolutionSourceCandidateSummaryRow,
) {
  return [row.projectionStatus, row.reviewStatus, row.curatorDecision]
    .filter(Boolean)
    .join(" / ");
}

function catalogRowMember(
  row: CatalogEntityResolutionCatalogRow,
): CatalogEntityResolutionClusterMember {
  return {
    label: row.canonicalName,
    catalogKind: row.catalogKind,
    source: row.source,
    status: row.status,
    publicSlug: row.publicSlug,
    typeaheadNameCount: numberValue(row.typeaheadNameCount),
    sourceLinkCount: numberValue(row.sourceLinkCount),
  };
}

function fuzzyCatalogRowMember(input: {
  label: string;
  normalizedLabel: string | null;
  catalogKind: string;
  source: string;
  status: string;
  publicSlug: string | null;
  locale: string;
}): CatalogEntityResolutionClusterMember {
  return {
    label: input.label,
    normalizedLabel: input.normalizedLabel ?? undefined,
    catalogKind: input.catalogKind,
    source: input.source,
    status: input.status,
    publicSlug: input.publicSlug,
    locale: input.locale,
  };
}

export function assertCatalogEntityResolutionEvidenceSafe(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertCatalogEntityResolutionEvidenceSafe(item);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (
      FORBIDDEN_ENTITY_RESOLUTION_EVIDENCE_MARKERS.includes(
        key as (typeof FORBIDDEN_ENTITY_RESOLUTION_EVIDENCE_MARKERS)[number],
      )
    ) {
      throw new Error(
        `Entity-resolution QA report contains forbidden field: ${key}`,
      );
    }
    assertCatalogEntityResolutionEvidenceSafe(child);
  }
}

function clusterId(
  kind: CatalogEntityResolutionClusterKind,
  parts: Array<string | null | undefined>,
) {
  const hash = createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 12);
  return `ove162:${kind}:${hash}`;
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
      continue;
    }
    groups.set(key, [item]);
  }
  return groups;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalizeEntityResolutionText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function numberValue(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeEntityResolutionLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_ENTITY_RESOLUTION_ROWS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ENTITY_RESOLUTION_ROWS);
}
