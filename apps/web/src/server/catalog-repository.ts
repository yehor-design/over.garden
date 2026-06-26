import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogItemStatus, Database } from "@/db/schema";

const MAX_CATALOG_QUERY_LENGTH = 120;
const MAX_CATALOG_SUGGESTIONS = 8;
const MIN_CATALOG_QUERY_LENGTH = 2;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type SelectableCatalogStatus = (typeof SELECTABLE_CATALOG_STATUSES)[number];

export interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: SelectableCatalogStatus;
  source: string;
}

export interface SelectableCatalogItem {
  id: string;
  canonicalName: string;
  locale: string;
  status: SelectableCatalogStatus;
  source: string;
}

export async function searchCatalogSuggestions(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<CatalogSuggestion[]> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) return [];

  const rows = await buildCatalogTypeaheadQuery(
    executor,
    normalizedQuery,
    limit,
  ).execute();

  const suggestions = new Map<string, CatalogSuggestion>();

  for (const row of rows) {
    if (suggestions.has(row.id)) continue;

    suggestions.set(row.id, {
      id: row.id,
      displayName: row.displayName,
      canonicalName: row.canonicalName,
      locale: row.locale,
      status: row.status as SelectableCatalogStatus,
      source: row.source,
    });
  }

  return [...suggestions.values()];
}

export async function findSelectableCatalogItem(
  executor: QueryExecutor,
  itemId: string,
): Promise<SelectableCatalogItem | null> {
  const normalizedId = normalizeCatalogItemId(itemId);
  if (!normalizedId) return null;

  const row = await buildFindSelectableCatalogItemQuery(
    executor,
    normalizedId,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    id: row.id,
    canonicalName: row.canonicalName,
    locale: row.locale,
    status: row.status as SelectableCatalogStatus,
    source: row.source,
  };
}

export function buildCatalogTypeaheadQuery(
  executor: QueryExecutor,
  normalizedQuery: string,
  limit = MAX_CATALOG_SUGGESTIONS,
) {
  const pattern = `%${normalizeCatalogQuery(normalizedQuery)}%`;

  return executor
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.locale as locale",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_item_names.display_name as displayName",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(normalizeCatalogLimit(limit));
}

export function buildFindSelectableCatalogItemQuery(
  executor: QueryExecutor,
  itemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "id",
      "canonical_name as canonicalName",
      "locale",
      "status",
      "source",
    ])
    .where("id", "=", itemId)
    .where("status", "in", [...SELECTABLE_CATALOG_STATUSES]);
}

export function normalizeCatalogQuery(query: string) {
  return query
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_CATALOG_QUERY_LENGTH)
    .toLowerCase();
}

export function normalizeCatalogItemId(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

function normalizeCatalogLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CATALOG_SUGGESTIONS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CATALOG_SUGGESTIONS);
}

export function isSelectableCatalogStatus(
  status: CatalogItemStatus | string,
): status is SelectableCatalogStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(
    status as SelectableCatalogStatus,
  );
}
