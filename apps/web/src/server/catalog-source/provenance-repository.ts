import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";

const MAX_SOURCE_PROVENANCE_ROWS = 25;
const SOURCE_PROVENANCE_HISTORY_MULTIPLIER = 4;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CatalogSourceProvenanceHistoryRow {
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogPublicSlug: string | null;
  catalogKind: string;
  catalogStatus: string;
  catalogSource: string;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  allowedUsage: JsonValue;
  sourceRecordKey: string;
  parserVersion: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  projectionStatus: string;
}

export interface CatalogSourceProvenanceCurationRow
  extends CatalogSourceProvenanceHistoryRow {
  auditLinkCount: number;
  projectedAliases: CatalogSourceProjectedAlias[];
}

export interface CatalogSourceProjectedAlias {
  displayName: string;
  locale: string;
  script: string;
  aliasKind: string;
  status: string;
  sourceSlug: string;
  sourceMethod: string;
  sourceRecordKey: string | null;
  confidence: number;
  license: string;
  attributionRequired: boolean;
  projectedToTypeahead: boolean;
  isPrimary: boolean | null;
  projectionNotes: string | null;
}

export async function listCatalogSourceProvenanceForCuration(
  limit = MAX_SOURCE_PROVENANCE_ROWS,
  executor: QueryExecutor = db,
): Promise<CatalogSourceProvenanceCurationRow[]> {
  const normalizedLimit = normalizeSourceProvenanceLimit(limit);
  const rows = await buildCatalogSourceProvenanceForCurationQuery(
    executor,
    normalizedLimit * SOURCE_PROVENANCE_HISTORY_MULTIPLIER,
  ).execute();
  const currentRows = toCurrentCatalogSourceProvenanceRows(rows).slice(
    0,
    normalizedLimit,
  );
  const aliasesByCatalogItemId = await readProjectedAliasesByCatalogItemId(
    executor,
    currentRows.map((row) => row.catalogItemId),
  );

  return currentRows.map((row) => ({
    catalogItemId: row.catalogItemId,
    catalogCanonicalName: row.catalogCanonicalName,
    catalogPublicSlug: row.catalogPublicSlug,
    catalogKind: row.catalogKind,
    catalogStatus: row.catalogStatus,
    catalogSource: row.catalogSource,
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceVersion: row.sourceVersion,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attributionRequired: Boolean(row.attributionRequired),
    attributionText: row.attributionText,
    allowedUsage: row.allowedUsage,
    sourceRecordKey: row.sourceRecordKey,
    parserVersion: row.parserVersion,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    projectionStatus: row.projectionStatus,
    auditLinkCount: row.auditLinkCount,
    projectedAliases: aliasesByCatalogItemId.get(row.catalogItemId) ?? [],
  }));
}

export function buildCatalogSourceProvenanceForCurationQuery(
  executor: QueryExecutor,
  limit = MAX_SOURCE_PROVENANCE_ROWS,
) {
  return executor
    .selectFrom("catalog_source_links")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_source_links.catalog_item_id",
    )
    .innerJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
      "catalog_source_links.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.license as license",
      "catalog_source_snapshots.license_url as licenseUrl",
      "catalog_source_snapshots.attribution_required as attributionRequired",
      "catalog_source_snapshots.attribution_text as attributionText",
      "catalog_source_snapshots.allowed_usage as allowedUsage",
      "catalog_source_links.source_record_key as sourceRecordKey",
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
      "catalog_source_records.projection_status as projectionStatus",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .orderBy("catalog_source_snapshots.verified_at", "desc")
    .orderBy("catalog_source_snapshots.fetched_at", "desc")
    .orderBy("catalog_source_snapshots.source_version", "desc")
    .orderBy("catalog_source_snapshots.parser_version", "desc")
    .orderBy("catalog_items.canonical_name", "asc")
    .limit(normalizeSourceProvenanceHistoryLimit(limit));
}

export function toCurrentCatalogSourceProvenanceRows(
  rows: CatalogSourceProvenanceHistoryRow[],
): Array<CatalogSourceProvenanceHistoryRow & { auditLinkCount: number }> {
  const currentRows = new Map<
    string,
    CatalogSourceProvenanceHistoryRow & { auditLinkCount: number }
  >();

  for (const row of rows) {
    const key = catalogSourceProvenanceCurrentKey(row);
    const current = currentRows.get(key);

    if (!current) {
      currentRows.set(key, { ...row, auditLinkCount: 1 });
      continue;
    }

    current.auditLinkCount += 1;

    if (isNewerCatalogSourceProvenanceRow(row, current)) {
      currentRows.set(key, {
        ...row,
        auditLinkCount: current.auditLinkCount,
      });
    }
  }

  return [...currentRows.values()].sort(compareCatalogSourceProvenanceRows);
}

export function buildCatalogSourceProjectedAliasesForCurationQuery(
  executor: QueryExecutor,
  catalogItemIds: string[],
) {
  return executor
    .selectFrom("catalog_alias_projections")
    .leftJoin(
      "catalog_item_names",
      "catalog_item_names.id",
      "catalog_alias_projections.catalog_item_name_id",
    )
    .select([
      "catalog_alias_projections.catalog_item_id as catalogItemId",
      "catalog_alias_projections.display_name as displayName",
      "catalog_alias_projections.locale as locale",
      "catalog_alias_projections.script as script",
      "catalog_alias_projections.alias_kind as aliasKind",
      "catalog_alias_projections.status as status",
      "catalog_alias_projections.source_slug as sourceSlug",
      "catalog_alias_projections.source_method as sourceMethod",
      "catalog_alias_projections.source_record_key as sourceRecordKey",
      "catalog_alias_projections.confidence as confidence",
      "catalog_alias_projections.license as license",
      "catalog_alias_projections.attribution_required as attributionRequired",
      "catalog_item_names.is_primary as isPrimary",
      "catalog_alias_projections.projection_notes as projectionNotes",
    ])
    .where("catalog_alias_projections.catalog_item_id", "in", catalogItemIds)
    .orderBy(
      sql<number>`case ${sql.ref("catalog_alias_projections.status")}
        when 'accepted' then 0
        when 'review_needed' then 1
        when 'generated' then 2
        when 'rejected' then 3
        else 4
      end`,
      "asc",
    )
    .orderBy("catalog_alias_projections.locale", "asc")
    .orderBy("catalog_alias_projections.display_name", "asc");
}

function normalizeSourceProvenanceLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_SOURCE_PROVENANCE_ROWS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SOURCE_PROVENANCE_ROWS);
}

function normalizeSourceProvenanceHistoryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_SOURCE_PROVENANCE_ROWS;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_SOURCE_PROVENANCE_ROWS * SOURCE_PROVENANCE_HISTORY_MULTIPLIER,
  );
}

function catalogSourceProvenanceCurrentKey(
  row: CatalogSourceProvenanceHistoryRow,
) {
  return [
    row.catalogSource,
    row.catalogKind,
    normalizeCatalogSourceProvenanceText(row.catalogCanonicalName),
    row.sourceSlug,
    row.sourceRecordKey,
  ].join(":");
}

function compareCatalogSourceProvenanceRows(
  left: CatalogSourceProvenanceHistoryRow,
  right: CatalogSourceProvenanceHistoryRow,
) {
  return (
    compareDateDesc(left.verifiedAt, right.verifiedAt) ||
    compareDateDesc(left.fetchedAt, right.fetchedAt) ||
    right.sourceVersion.localeCompare(left.sourceVersion) ||
    right.parserVersion.localeCompare(left.parserVersion) ||
    left.catalogCanonicalName.localeCompare(right.catalogCanonicalName) ||
    left.sourceRecordKey.localeCompare(right.sourceRecordKey)
  );
}

function isNewerCatalogSourceProvenanceRow(
  candidate: CatalogSourceProvenanceHistoryRow,
  current: CatalogSourceProvenanceHistoryRow,
) {
  return compareCatalogSourceProvenanceRows(candidate, current) < 0;
}

function compareDateDesc(left: Date | string, right: Date | string) {
  return dateMillis(right) - dateMillis(left);
}

function dateMillis(value: Date | string) {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalizeCatalogSourceProvenanceText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function readProjectedAliasesByCatalogItemId(
  executor: QueryExecutor,
  catalogItemIds: string[],
) {
  const uniqueCatalogItemIds = [...new Set(catalogItemIds)];
  const aliasesByCatalogItemId = new Map<
    string,
    CatalogSourceProjectedAlias[]
  >();
  if (uniqueCatalogItemIds.length === 0) return aliasesByCatalogItemId;

  const rows = await buildCatalogSourceProjectedAliasesForCurationQuery(
    executor,
    uniqueCatalogItemIds,
  ).execute();

  for (const row of rows) {
    const aliases = aliasesByCatalogItemId.get(row.catalogItemId) ?? [];
    aliases.push({
      displayName: row.displayName,
      locale: row.locale,
      script: row.script,
      aliasKind: row.aliasKind,
      status: row.status,
      sourceSlug: row.sourceSlug,
      sourceMethod: row.sourceMethod,
      sourceRecordKey: row.sourceRecordKey,
      confidence: Number(row.confidence),
      license: row.license,
      attributionRequired: Boolean(row.attributionRequired),
      projectedToTypeahead: row.isPrimary !== null,
      isPrimary: row.isPrimary === null ? null : Boolean(row.isPrimary),
      projectionNotes: row.projectionNotes,
    });
    aliasesByCatalogItemId.set(row.catalogItemId, aliases);
  }

  return aliasesByCatalogItemId;
}
