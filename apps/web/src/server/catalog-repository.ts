import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogItemStatus, Database, JsonValue } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";
import { meiliSearchClient } from "@/server/search/client";
import {
  CATALOG_TYPEAHEAD_INDEX,
  catalogTypeaheadHitToSuggestion,
  dedupeCatalogTypeaheadSuggestions,
  toCatalogTypeaheadDocument,
  type CatalogTypeaheadRow,
} from "@/server/search/catalog-documents";

const MAX_CATALOG_QUERY_LENGTH = 120;
const MAX_CATALOG_SUGGESTIONS = 8;
const MIN_CATALOG_QUERY_LENGTH = 2;
const DEFAULT_USER_ADDED_LOCALE = "und";
const CATALOG_CURATION_QUEUE = "catalog_curation";
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type SelectableCatalogStatus = (typeof SELECTABLE_CATALOG_STATUSES)[number];

interface CatalogSearchClient {
  index(indexName: string): {
    search(
      query: string,
      options: { limit: number },
    ): Promise<{ hits?: unknown[] }>;
  };
}

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

export interface UserAddedCatalogCandidate {
  id: string;
  displayName: string;
  normalizedName: string;
  locale: string;
  status: "provisional";
  source: "user_added";
}

interface CreateUserAddedCatalogCandidateInput {
  displayName: string;
}

export async function searchCatalogSuggestionsWithMeili(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  client: CatalogSearchClient = meiliSearchClient(),
): Promise<CatalogSuggestion[]> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) return [];

  const normalizedLimit = normalizeCatalogLimit(limit);
  const result = await client
    .index(CATALOG_TYPEAHEAD_INDEX)
    .search(normalizedQuery, {
      limit: normalizedLimit * 3,
    });

  const hits = Array.isArray(result.hits) ? result.hits : [];
  return dedupeCatalogTypeaheadSuggestions(
    hits
      .map(catalogTypeaheadHitToSuggestion)
      .filter((suggestion) => suggestion !== null),
  ).slice(0, normalizedLimit);
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

export async function buildCatalogTypeaheadDocuments(
  executor: QueryExecutor = db,
) {
  const rows = await buildCatalogTypeaheadReindexRowsQuery(executor).execute();

  return rows
    .map((row) => toCatalogTypeaheadDocument(row))
    .filter((document) => document !== null);
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

export async function createUserAddedCatalogCandidate(
  executor: QueryExecutor,
  scope: RequestScope,
  input: CreateUserAddedCatalogCandidateInput,
): Promise<UserAddedCatalogCandidate> {
  const displayName = normalizeUserAddedCatalogName(input.displayName);
  const normalizedName = normalizeCatalogQuery(displayName);
  const locale = DEFAULT_USER_ADDED_LOCALE;
  const idempotencyKey = catalogCurationIdempotencyKey(
    scope.userId,
    normalizedName,
    locale,
  );

  const item = await buildUpsertUserAddedCatalogItemQuery(executor, scope, {
    displayName,
    normalizedName,
    locale,
  }).executeTakeFirstOrThrow();

  await buildInsertCatalogItemNameQuery(executor, {
    catalogItemId: item.id,
    displayName,
    normalizedName,
    locale,
  }).execute();

  await buildEnqueueCatalogCurationJobQuery(executor, {
    catalogItemId: item.id,
    displayName,
    normalizedName,
    locale,
    idempotencyKey,
  }).executeTakeFirstOrThrow();

  return {
    id: item.id,
    displayName: item.canonicalName,
    normalizedName,
    locale: item.locale,
    status: "provisional",
    source: "user_added",
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

export function buildCatalogTypeaheadReindexRowsQuery(executor: QueryExecutor) {
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
      "catalog_items.normalized_name as normalizedName",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_items.created_by_user_id as createdByUserId",
      "catalog_items.locale as itemLocale",
      "catalog_item_names.display_name as displayName",
      "catalog_item_names.normalized_name as aliasNormalizedName",
      "catalog_item_names.locale as aliasLocale",
      "catalog_item_names.is_primary as isPrimary",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .$castTo<CatalogTypeaheadRow>();
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

export function buildUpsertUserAddedCatalogItemQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    displayName: string;
    normalizedName: string;
    locale: string;
  },
) {
  return executor
    .insertInto("catalog_items")
    .values({
      canonical_name: input.displayName,
      normalized_name: input.normalizedName,
      status: "provisional",
      source: "user_added",
      source_id: null,
      created_by_user_id: scope.userId,
      locale: input.locale,
    })
    .onConflict((oc) =>
      oc
        .columns(["created_by_user_id", "normalized_name", "locale"])
        .doUpdateSet({
          updated_at: new Date(),
        }),
    )
    .returning([
      "id",
      "canonical_name as canonicalName",
      "normalized_name as normalizedName",
      "locale",
      "status",
      "source",
    ]);
}

export function buildInsertCatalogItemNameQuery(
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
      is_primary: true,
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "normalized_name", "locale"]).doNothing(),
    );
}

export function buildEnqueueCatalogCurationJobQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    idempotencyKey: string;
  },
) {
  const payload = {
    kind: "provisional_catalog_item",
    catalogItemId: input.catalogItemId,
    displayName: input.displayName,
    normalizedName: input.normalizedName,
    locale: input.locale,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: CATALOG_CURATION_QUEUE,
      payload,
      idempotency_key: input.idempotencyKey,
    })
    .onConflict((oc) =>
      oc.column("idempotency_key").doUpdateSet({
        updated_at: new Date(),
      }),
    )
    .returningAll();
}

export function buildEnqueueCatalogTypeaheadReindexJobQuery(
  executor: QueryExecutor,
) {
  const payload = {
    kind: CATALOG_TYPEAHEAD_REINDEX_KIND,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY,
    })
    .onConflict((oc) =>
      oc.column("idempotency_key").doUpdateSet({
        updated_at: new Date(),
      }),
    )
    .returningAll();
}

export function normalizeCatalogQuery(query: string) {
  return query
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_CATALOG_QUERY_LENGTH)
    .toLowerCase();
}

export function normalizeUserAddedCatalogName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 1) {
    throw new Error("Missing catalog name is required.");
  }
  if (normalized.length > MAX_CATALOG_QUERY_LENGTH) {
    throw new Error("Missing catalog name must be 120 characters or fewer.");
  }
  return normalized;
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

function catalogCurationIdempotencyKey(
  userId: string,
  normalizedName: string,
  locale: string,
) {
  return `catalog-curation:${userId}:${locale}:${normalizedName}`;
}

export function isSelectableCatalogStatus(
  status: CatalogItemStatus | string,
): status is SelectableCatalogStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(
    status as SelectableCatalogStatus,
  );
}
