import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import { SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES } from "@/server/search/catalog-documents";

const MAX_ENTITY_RESOLUTION_ROWS = 240;
const MAX_ENTITY_RESOLUTION_CLUSTERS = 120;

const ENTITY_RESOLUTION_CLUSTER_KIND_LIMITS = {
  likely_duplicate: 24,
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

export interface CatalogEntityResolutionClusterMember {
  label: string;
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
  members: CatalogEntityResolutionClusterMember[];
}

export interface CatalogEntityResolutionQaReport {
  schemaVersion: "ove89.catalogEntityResolutionQa.v1";
  issue: "OVE-89";
  generatedAt: string;
  evidenceSafety: "linear_safe_redacted";
  summary: {
    clusterCount: number;
    sourceBackedCatalogRowsReviewed: number;
    aliasCollisionRowsReviewed: number;
    sourceCandidateGroupsReviewed: number;
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
  "journalTitle",
  "journalBody",
  "ownerUserId",
  "owner_user_id",
  "mediaAsset",
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

  return buildCatalogEntityResolutionQaReport({
    generatedAt: new Date().toISOString(),
    catalogRows,
    aliasCollisionRows,
    sourceCandidateRows,
  });
}

export function buildCatalogEntityResolutionQaReport(input: {
  generatedAt: string;
  catalogRows: CatalogEntityResolutionCatalogRow[];
  aliasCollisionRows: CatalogEntityResolutionAliasCollisionRow[];
  sourceCandidateRows: CatalogEntityResolutionSourceCandidateSummaryRow[];
}): CatalogEntityResolutionQaReport {
  const clusters = limitEntityResolutionClusters([
    ...buildCatalogConceptClusters(input.catalogRows),
    ...buildAliasCollisionClusters(input.aliasCollisionRows),
    ...buildSourceCandidateClusters(input.sourceCandidateRows),
  ]);

  const report: CatalogEntityResolutionQaReport = {
    schemaVersion: "ove89.catalogEntityResolutionQa.v1",
    issue: "OVE-89",
    generatedAt: input.generatedAt,
    evidenceSafety: "linear_safe_redacted",
    summary: {
      clusterCount: clusters.length,
      sourceBackedCatalogRowsReviewed: input.catalogRows.length,
      aliasCollisionRowsReviewed: input.aliasCollisionRows.length,
      sourceCandidateGroupsReviewed: input.sourceCandidateRows.length,
      groups: CATALOG_ENTITY_RESOLUTION_CLUSTER_GROUPS.map((group) => ({
        ...group,
        count: clusters.filter((cluster) => cluster.kind === group.kind)
          .length,
      })),
    },
    clusters,
    leakCheck: "passed",
  };

  assertCatalogEntityResolutionReportSafe(report);
  return report;
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
    .having(
      sql<number>`count(distinct ${sql.ref("catalog_items.id")})`,
      ">",
      1,
    )
    .orderBy(sql<number>`count(distinct ${sql.ref("catalog_items.id")})`, "desc")
    .orderBy("catalog_item_names.normalized_name", "asc")
    .limit(normalizeEntityResolutionLimit(limit))
    .$castTo<CatalogEntityResolutionAliasCollisionRow>();
}

export function buildCatalogEntityResolutionSourceCandidateSummaryQuery(
  executor: QueryExecutor,
  limit = MAX_ENTITY_RESOLUTION_ROWS,
) {
  const reviewStatus = sql<string | null>`catalog_source_records.allowed_projection #>> '{reviewQueue,reviewStatus}'`;
  const curatorDecision = sql<string | null>`catalog_source_records.allowed_projection #>> '{reviewQueue,curatorDecision}'`;
  const candidateKind = sql<string | null>`catalog_source_records.allowed_projection #>> '{reviewQueue,candidateKind}'`;

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
      sql<string | null>`min(catalog_source_records.allowed_projection #>> '{reviewQueue,displayName}')`.as(
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

function assertCatalogEntityResolutionReportSafe(
  report: CatalogEntityResolutionQaReport,
) {
  const serialized = JSON.stringify(report);
  for (const marker of FORBIDDEN_ENTITY_RESOLUTION_EVIDENCE_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(
        `Entity-resolution QA report contains forbidden marker: ${marker}`,
      );
    }
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
  return `ove89:${kind}:${hash}`;
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
