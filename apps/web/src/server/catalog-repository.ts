import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogItemStatus,
  CatalogKind,
  Database,
  JsonValue,
  PlantObjectKind,
} from "@/db/schema";
import {
  catalogSuggestionTrustMetadata,
  type CatalogTrustMetadata,
} from "@/lib/garden/catalog-trust";
import type { RequestScope } from "@/server/request-scope";
import { meiliSearchClient } from "@/server/search/client";
import {
  CATALOG_TYPEAHEAD_INDEX,
  catalogTypeaheadHitToSuggestion,
  dedupeCatalogTypeaheadSuggestions,
  toCatalogTypeaheadDocument,
  type CatalogTypeaheadRow,
  type CatalogTypeaheadSuggestion,
} from "@/server/search/catalog-documents";

const MAX_CATALOG_QUERY_LENGTH = 120;
const MAX_CATALOG_PUBLIC_SLUG_LENGTH = 96;
const MAX_CATALOG_SUGGESTIONS = 8;
const MAX_CATALOG_TYPEAHEAD_ROWS = MAX_CATALOG_SUGGESTIONS * 3;
const MIN_CATALOG_QUERY_LENGTH = 2;
const DEFAULT_USER_ADDED_LOCALE = "und";
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
export const CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND =
  "catalog_match_suggestions_refresh";
const CATALOG_MATCH_SUGGESTIONS_IDEMPOTENCY_PREFIX =
  "catalog-match-suggestions:";

export const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;

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

export interface CatalogSuggestion extends CatalogTrustMetadata {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: SelectableCatalogStatus;
  source: string;
}

export interface SelectableCatalogItem {
  id: string;
  canonicalName: string;
  publicSlug: string | null;
  catalogKind: CatalogKind;
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
  objectKind: PlantObjectKind;
}

interface CatalogTypeaheadSearchDeps {
  searchWithMeili?: (
    query: string,
    limit?: number,
  ) => Promise<CatalogSuggestion[]>;
  searchWithPostgres?: (
    query: string,
    limit?: number,
  ) => Promise<CatalogSuggestion[]>;
}

export async function searchCatalogSuggestionsForTypeahead(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  deps: CatalogTypeaheadSearchDeps = {},
): Promise<CatalogSuggestion[]> {
  const searchWithMeili =
    deps.searchWithMeili ?? searchCatalogSuggestionsWithMeili;
  const searchWithPostgres =
    deps.searchWithPostgres ?? searchCatalogSuggestions;

  const normalizedLimit = normalizeCatalogLimit(limit);
  let meiliSuggestions: CatalogSuggestion[] = [];
  try {
    meiliSuggestions = await searchWithMeili(query, normalizedLimit);
  } catch {
    // Meilisearch is derived state; Postgres remains the canonical fallback.
  }

  const postgresSuggestions = await searchWithPostgres(query, normalizedLimit);

  return dedupeCatalogTypeaheadSuggestions([
    ...meiliSuggestions,
    ...postgresSuggestions,
  ]).slice(0, normalizedLimit);
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
      .map((hit) => ({
        hit,
        suggestion: catalogTypeaheadHitToSuggestion(hit),
      }))
      .filter(
        (
          result,
        ): result is { hit: unknown; suggestion: CatalogTypeaheadSuggestion } =>
          result.suggestion !== null &&
          meiliHitMatchesCatalogQuery(
            result.hit,
            result.suggestion,
            normalizedQuery,
          ),
      )
      .map((result) => toCatalogSuggestion(result.suggestion)),
  ).slice(0, normalizedLimit);
}

export async function searchCatalogSuggestions(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<CatalogSuggestion[]> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) return [];

  const normalizedLimit = normalizeCatalogLimit(limit);
  const rows = await buildCatalogTypeaheadQuery(
    executor,
    normalizedQuery,
    normalizedLimit * 3,
  ).execute();

  return dedupeCatalogTypeaheadSuggestions(
    rows.map((row) =>
      toCatalogSuggestion({
        id: row.id,
        displayName: row.displayName,
        canonicalName: row.canonicalName,
        catalogKind: row.catalogKind as CatalogKind,
        locale: row.locale,
        status: row.status as SelectableCatalogStatus,
        source: row.source,
      }),
    ),
  ).slice(0, normalizedLimit);
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
    publicSlug: row.publicSlug,
    catalogKind: row.catalogKind as CatalogKind,
    locale: row.locale,
    status: row.status as SelectableCatalogStatus,
    source: row.source,
  };
}

export async function findSelectableCatalogItemByPublicSlug(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<SelectableCatalogItem | null> {
  const normalizedSlug = normalizeCatalogPublicSlug(publicSlug);
  if (!normalizedSlug) return null;

  const row = await buildFindSelectableCatalogItemByPublicSlugQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    id: row.id,
    canonicalName: row.canonicalName,
    publicSlug: row.publicSlug,
    catalogKind: row.catalogKind as CatalogKind,
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
  const catalogKind: CatalogKind =
    input.objectKind === "plant" ? "plant_variety" : "species";

  const catalogIdentity = {
    displayName,
    normalizedName,
    locale,
    catalogKind,
  };
  const insertedItem = await buildUpsertUserAddedCatalogItemQuery(
    executor,
    scope,
    catalogIdentity,
  ).executeTakeFirst();
  const item =
    insertedItem ??
    (await buildFindUserAddedCatalogItemQuery(
      executor,
      scope,
      catalogIdentity,
    ).executeTakeFirstOrThrow());

  await buildInsertCatalogItemNameQuery(executor, {
    catalogItemId: item.id,
    displayName,
    normalizedName,
    locale,
  }).execute();
  await buildEnqueueCatalogMatchSuggestionsRefreshJobQuery(
    executor,
    item.id,
  ).executeTakeFirst();

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
  const normalizedSearch = normalizeCatalogQuery(normalizedQuery);
  const pattern = `%${normalizedSearch}%`;
  const prefixPattern = `${normalizedSearch}%`;

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
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.locale as locale",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_item_names.display_name as displayName",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy(
      sql<number>`case
        when ${sql.ref("catalog_item_names.normalized_name")} = ${normalizedSearch} then 0
        when ${sql.ref("catalog_item_names.normalized_name")} like ${prefixPattern} then 1
        when ${sql.ref("catalog_item_names.is_primary")} then 2
        else 3
      end`,
      "asc",
    )
    .orderBy("catalog_items.updated_at", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(normalizeCatalogTypeaheadRowLimit(limit));
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
      "catalog_items.catalog_kind as catalogKind",
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
      "public_slug as publicSlug",
      "catalog_kind as catalogKind",
      "locale",
      "status",
      "source",
    ])
    .where("id", "=", itemId)
    .where("status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("created_by_user_id", "is", null);
}

export function buildFindSelectableCatalogItemByPublicSlugQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "id",
      "canonical_name as canonicalName",
      "public_slug as publicSlug",
      "catalog_kind as catalogKind",
      "locale",
      "status",
      "source",
    ])
    .where("public_slug", "=", publicSlug)
    .where("public_slug", "is not", null)
    .where("status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("created_by_user_id", "is", null)
    .$narrowType<{ publicSlug: string }>();
}

export function buildUpsertUserAddedCatalogItemQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    displayName: string;
    normalizedName: string;
    locale: string;
    catalogKind: CatalogKind;
  },
) {
  return (
    executor
      .insertInto("catalog_items")
      .values({
        canonical_name: input.displayName,
        normalized_name: input.normalizedName,
        catalog_kind: input.catalogKind,
        status: "provisional",
        source: "user_added",
        source_id: null,
        created_by_user_id: scope.userId,
        locale: input.locale,
      })
      // A targetless conflict keeps deployments compatible with both the legacy
      // owner/name/locale index and its owner/name/locale/kind replacement.
      .onConflict((oc) => oc.doNothing())
      .returning([
        "id",
        "canonical_name as canonicalName",
        "normalized_name as normalizedName",
        "locale",
        "status",
        "source",
      ])
  );
}

export function buildFindUserAddedCatalogItemQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    normalizedName: string;
    locale: string;
    catalogKind: CatalogKind;
  },
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "id",
      "canonical_name as canonicalName",
      "normalized_name as normalizedName",
      "locale",
      "status",
      "source",
    ])
    .where("created_by_user_id", "=", scope.userId)
    .where("normalized_name", "=", input.normalizedName)
    .where("locale", "=", input.locale)
    .where("catalog_kind", "=", input.catalogKind)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added");
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
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          updated_at: new Date(),
        }),
    )
    .returningAll();
}

export function buildEnqueueCatalogMatchSuggestionsRefreshJobQuery(
  executor: QueryExecutor,
  sourceCatalogItemId: string,
) {
  const payload = {
    kind: CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
    sourceCatalogItemId,
  } satisfies JsonValue;
  const now = new Date();

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `${CATALOG_MATCH_SUGGESTIONS_IDEMPOTENCY_PREFIX}${sourceCatalogItemId}`,
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

export function normalizeCatalogQuery(query: string) {
  return query
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_CATALOG_QUERY_LENGTH)
    .toLowerCase();
}

function meiliHitMatchesCatalogQuery(
  hit: unknown,
  suggestion: CatalogTypeaheadSuggestion,
  normalizedQuery: string,
) {
  if (!isCatalogSearchHitRecord(hit)) {
    return (
      textMatchesCatalogQuery(suggestion.displayName, normalizedQuery) ||
      textMatchesCatalogQuery(suggestion.canonicalName, normalizedQuery)
    );
  }

  return [hit.normalizedName, hit.displayName, hit.canonicalName].some(
    (value) => textMatchesCatalogQuery(value, normalizedQuery),
  );
}

function toCatalogSuggestion(input: {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: SelectableCatalogStatus;
  source: string;
}): CatalogSuggestion {
  return {
    ...input,
    ...catalogSuggestionTrustMetadata(input),
  };
}

function textMatchesCatalogQuery(value: unknown, normalizedQuery: string) {
  if (typeof value !== "string") return false;
  const normalizedValue = normalizeCatalogQuery(value);
  return normalizedValue.includes(normalizedQuery);
}

function isCatalogSearchHitRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function normalizeCatalogPublicSlug(value: string | null | undefined) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_CATALOG_PUBLIC_SLUG_LENGTH) {
    return null;
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function normalizeCatalogLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CATALOG_SUGGESTIONS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CATALOG_SUGGESTIONS);
}

function normalizeCatalogTypeaheadRowLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CATALOG_SUGGESTIONS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CATALOG_TYPEAHEAD_ROWS);
}

export function isSelectableCatalogStatus(
  status: CatalogItemStatus | string,
): status is SelectableCatalogStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(
    status as SelectableCatalogStatus,
  );
}
