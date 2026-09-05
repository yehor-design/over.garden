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
import {
  catalogMeiliServeClass,
  classifyHomonymousCatalogSuggestions,
} from "@/lib/garden/catalog-availability";
import {
  isOve330ServeClass,
  type Ove330ServeClass,
} from "@/lib/media/presentation-contract";
import type { RequestScope } from "@/server/request-scope";
import { meiliSearchClient } from "@/server/search/client";
import { booleanServerEnv } from "@/lib/env";
import {
  catalogTypeaheadObjectKindScopeMatches,
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

/**
 * The trigram similarity floor, pinned in the predicate rather than inherited
 * from a session setting, so a misspelled search cannot be quietly widened.
 */
const CATALOG_TYPEAHEAD_TRIGRAM_THRESHOLD = 0.3;
/** Every catalog read settles inside this bound or reports a timeout class. */
const CATALOG_TYPEAHEAD_QUERY_DEADLINE_MS = 500;
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
      options: {
        limit: number;
        matchingStrategy: "all";
        showRankingScoreDetails: true;
      },
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
  serveClass: Ove330ServeClass;
  objectKindScope?: "plant" | "animal" | "either";
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
  searchWithTrigram?: (
    query: string,
    limit?: number,
  ) => Promise<CatalogSuggestion[]>;
  recordDivergence?: (sample: CatalogTypeaheadDivergenceSample) => void;
}

/**
 * How far the canonical source still depends on the derived index, in counts.
 *
 * The number that decides whether Meilisearch is still load-bearing for
 * correctness is `unrecoveredDerivedOnlyCount`: identities the derived index
 * found that neither canonical source did. It is a count, never a query, a
 * name, or an identifier — a divergence receipt that carried the query text
 * would be a search log of what gardeners typed.
 */
export interface CatalogTypeaheadDivergenceSample {
  sourceClass: "two_source" | "three_source";
  canonicalCount: number;
  derivedCount: number;
  trigramCount: number;
  mergedCount: number;
  canonicalOnlyCount: number;
  derivedOnlyCount: number;
  trigramOnlyCount: number;
  trigramRecoveredDerivedOnlyCount: number;
  unrecoveredDerivedOnlyCount: number;
}

export function measureCatalogTypeaheadDivergence(input: {
  canonical: readonly CatalogSuggestion[];
  derived: readonly CatalogSuggestion[];
  approximate: readonly CatalogSuggestion[];
  merged: readonly CatalogSuggestion[];
}): CatalogTypeaheadDivergenceSample {
  const canonicalIds = new Set(input.canonical.map((row) => row.id));
  const derivedIds = new Set(input.derived.map((row) => row.id));
  const trigramIds = new Set(input.approximate.map((row) => row.id));

  const derivedOnly = [...derivedIds].filter((id) => !canonicalIds.has(id));

  return {
    sourceClass: input.approximate.length > 0 ? "three_source" : "two_source",
    canonicalCount: canonicalIds.size,
    derivedCount: derivedIds.size,
    trigramCount: trigramIds.size,
    mergedCount: input.merged.length,
    canonicalOnlyCount: [...canonicalIds].filter((id) => !derivedIds.has(id))
      .length,
    derivedOnlyCount: derivedOnly.length,
    trigramOnlyCount: [...trigramIds].filter(
      (id) => !canonicalIds.has(id) && !derivedIds.has(id),
    ).length,
    trigramRecoveredDerivedOnlyCount: derivedOnly.filter((id) =>
      trigramIds.has(id),
    ).length,
    unrecoveredDerivedOnlyCount: derivedOnly.filter((id) => !trigramIds.has(id))
      .length,
  };
}

export const CATALOG_TRIGRAM_TYPEAHEAD_FLAG = "CATALOG_TRIGRAM_TYPEAHEAD_ENABLED";

function catalogTrigramTypeaheadEnabled(): boolean {
  return booleanServerEnv(CATALOG_TRIGRAM_TYPEAHEAD_FLAG, false);
}

/**
 * Trigram counterpart of `searchCatalogSuggestionsWithCanonicalFallback`: the
 * approximate source reads the same table the exact source read, with every
 * guard the exact search already passes.
 */
async function searchCatalogSuggestionsWithTrigram(
  query: string,
  limit: number,
  options: CatalogTypeaheadSearchOptions,
): Promise<CatalogSuggestion[]> {
  return searchCatalogSuggestions(query, limit, db, options.objectKind, "trigram");
}

export type CatalogTypeaheadState = "ready" | "empty" | "degraded";

export interface CatalogTypeaheadSearchOptions {
  limit?: number;
  objectKind?: PlantObjectKind;
}

export interface CatalogTypeaheadSearchResult {
  suggestions: CatalogSuggestion[];
  state: CatalogTypeaheadState;
}

export interface FindSelectableCatalogItemOptions {
  expectedObjectKind?: PlantObjectKind;
}

export async function searchCatalogSuggestionsForTypeahead(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  deps: CatalogTypeaheadSearchDeps = {},
): Promise<CatalogSuggestion[]> {
  return (
    await searchCatalogSuggestionsForTypeaheadResult(query, { limit }, deps)
  ).suggestions;
}

/**
 * Bounded typeahead owner used by the authenticated API. The canonical query
 * and Meilisearch query begin together so a derived-index timeout cannot add a
 * second wait after Postgres. A stale Meilisearch document can at most be
 * offered as a suggestion: the save path re-reads every selection through the
 * canonical selectable predicate before an identity is attached.
 */
export async function searchCatalogSuggestionsForTypeaheadResult(
  query: string,
  options: CatalogTypeaheadSearchOptions = {},
  deps: CatalogTypeaheadSearchDeps = {},
): Promise<CatalogTypeaheadSearchResult> {
  const normalizedQuery = normalizeCatalogQuery(query);
  const normalizedLimit = normalizeCatalogLimit(
    options.limit ?? MAX_CATALOG_SUGGESTIONS,
  );
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) {
    return { suggestions: [], state: "empty" };
  }

  const effectiveOptions = { ...options, limit: normalizedLimit };
  const postgresSearch = deps.searchWithPostgres
    ? deps.searchWithPostgres(normalizedQuery, normalizedLimit)
    : searchCatalogSuggestionsWithCanonicalFallback(
        normalizedQuery,
        normalizedLimit,
        effectiveOptions,
      );
  const meiliSearch = deps.searchWithMeili
    ? deps.searchWithMeili(normalizedQuery, normalizedLimit)
    : searchCatalogSuggestionsWithSafeMeili(
        normalizedQuery,
        normalizedLimit,
        effectiveOptions,
      );
  // Ships disabled. The flag is turned on only after a divergence receipt is
  // recorded, so the source is measured before it is trusted.
  const trigramSearch = deps.searchWithTrigram
    ? deps.searchWithTrigram(normalizedQuery, normalizedLimit)
    : catalogTrigramTypeaheadEnabled()
      ? searchCatalogSuggestionsWithTrigram(
          normalizedQuery,
          normalizedLimit,
          effectiveOptions,
        )
      : Promise.resolve<CatalogSuggestion[]>([]);

  // All three start together, so a slow source can never add a second wait
  // after the ones that already answered.
  const [meili, postgres, trigram] = await Promise.all([
    settleWithinCatalogDeadline(meiliSearch),
    settleWithinCatalogDeadline(postgresSearch),
    settleWithinCatalogDeadline(trigramSearch),
  ]);

  if (postgres.status !== "fulfilled") {
    return { suggestions: [], state: "degraded" };
  }

  const canonical = postgres.value;
  const derived = meili.status === "fulfilled" ? meili.value : [];
  // Approximate hits go last: dedupe keeps the first occurrence, so an exact or
  // substring match always outranks a fuzzy one for the same identity.
  const approximate = trigram.status === "fulfilled" ? trigram.value : [];
  const suggestions = classifyHomonymousCatalogSuggestions(
    dedupeCatalogTypeaheadSuggestions(
      [...derived, ...canonical, ...approximate].map(
        ensureCatalogSuggestionServeClass,
      ),
    ),
  ).slice(0, normalizedLimit);

  deps.recordDivergence?.(
    measureCatalogTypeaheadDivergence({
      canonical,
      derived,
      approximate,
      merged: suggestions,
    }),
  );

  return {
    suggestions,
    state:
      meili.status === "fulfilled"
        ? suggestions.length > 0
          ? "ready"
          : "empty"
        : "degraded",
  };
}

async function searchCatalogSuggestionsWithCanonicalFallback(
  query: string,
  limit: number,
  options: CatalogTypeaheadSearchOptions,
): Promise<CatalogSuggestion[]> {
  return searchCatalogSuggestions(query, limit, db, options.objectKind);
}

async function searchCatalogSuggestionsWithSafeMeili(
  query: string,
  limit: number,
  options: CatalogTypeaheadSearchOptions,
): Promise<CatalogSuggestion[]> {
  return searchCatalogSuggestionsWithMeili(
    query,
    limit,
    undefined,
    options.objectKind,
  );
}

export async function searchCatalogSuggestionsWithMeili(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  client: CatalogSearchClient = meiliSearchClient(),
  objectKind?: PlantObjectKind,
): Promise<CatalogSuggestion[]> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) return [];

  const normalizedLimit = normalizeCatalogLimit(limit);
  const result = await client
    .index(CATALOG_TYPEAHEAD_INDEX)
    .search(normalizedQuery, {
      limit: normalizedLimit * 3,
      matchingStrategy: "all",
      showRankingScoreDetails: true,
    });

  const hits = Array.isArray(result.hits) ? result.hits : [];
  return classifyHomonymousCatalogSuggestions(
    dedupeCatalogTypeaheadSuggestions(
      hits
        .map((hit) => ({
          hit,
          suggestion: catalogTypeaheadHitToSuggestion(hit),
        }))
        .filter(
          (
            result,
          ): result is {
            hit: unknown;
            suggestion: CatalogTypeaheadSuggestion;
          } => result.suggestion !== null,
        )
        .map(({ hit, suggestion }) => ({
          suggestion,
          serveClass: catalogMeiliServeClass(hit, suggestion, normalizedQuery),
        }))
        .filter(
          (
            result,
          ): result is {
            suggestion: CatalogTypeaheadSuggestion;
            serveClass: Ove330ServeClass;
          } => result.serveClass !== null,
        )
        .map(({ suggestion, serveClass }) =>
          toCatalogSuggestion({ ...suggestion, serveClass }),
        ),
    ),
  )
    .filter((suggestion) =>
      matchesCatalogSuggestionObjectKind(suggestion, objectKind),
    )
    .slice(0, normalizedLimit);
}

export async function searchCatalogSuggestions(
  query: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  executor: QueryExecutor = db,
  objectKind?: PlantObjectKind,
  matchMode: CatalogTypeaheadMatchMode = "substring",
): Promise<CatalogSuggestion[]> {
  const normalizedQuery = normalizeCatalogQuery(query);
  if (normalizedQuery.length < MIN_CATALOG_QUERY_LENGTH) return [];

  const normalizedLimit = normalizeCatalogLimit(limit);
  const rows = await buildCatalogTypeaheadQuery(
    executor,
    normalizedQuery,
    normalizedLimit * 3,
    objectKind,
    matchMode,
  ).execute();

  return classifyHomonymousCatalogSuggestions(
    dedupeCatalogTypeaheadSuggestions(
      rows.map((row) =>
        toCatalogSuggestion({
          id: row.id,
          displayName: row.displayName,
          canonicalName: row.canonicalName,
          catalogKind: row.catalogKind as CatalogKind,
          locale: row.locale,
          status: row.status as SelectableCatalogStatus,
          source: row.source,
          serveClass: row.isGeneratedAlias ? "generated" : "exact",
        }),
      ),
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
  options: FindSelectableCatalogItemOptions = {},
): Promise<SelectableCatalogItem | null> {
  const normalizedId = normalizeCatalogItemId(itemId);
  if (!normalizedId) return null;

  const row = await buildFindSelectableCatalogItemQuery(
    executor,
    normalizedId,
  ).executeTakeFirst();

  if (!row) return null;

  if (
    options.expectedObjectKind &&
    !matchesCatalogKindObjectKind(row.catalogKind, options.expectedObjectKind)
  ) {
    return null;
  }

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
  options: FindSelectableCatalogItemOptions = {},
): Promise<SelectableCatalogItem | null> {
  const normalizedSlug = normalizeCatalogPublicSlug(publicSlug);
  if (!normalizedSlug) return null;

  const row = await buildFindSelectableCatalogItemByPublicSlugQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();

  if (!row) return null;

  if (
    options.expectedObjectKind &&
    !matchesCatalogKindObjectKind(row.catalogKind, options.expectedObjectKind)
  ) {
    return null;
  }

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

/**
 * How a name is compared with the typed query.
 *
 * `trigram` is a mode on the one query rather than a second query, so a
 * misspelled search inherits every guard an exact search already passes —
 * selectable status, no user-added row, and the object-kind exclusions — and
 * cannot reach a gardener through a weaker predicate.
 */
export type CatalogTypeaheadMatchMode = "substring" | "trigram";

export function buildCatalogTypeaheadQuery(
  executor: QueryExecutor,
  normalizedQuery: string,
  limit = MAX_CATALOG_SUGGESTIONS,
  objectKind?: PlantObjectKind,
  matchMode: CatalogTypeaheadMatchMode = "substring",
) {
  const normalizedSearch = normalizeCatalogQuery(normalizedQuery);
  const pattern = `%${normalizedSearch}%`;
  const prefixPattern = `${normalizedSearch}%`;
  // The legacy path searches `display_name`, not `normalized_name`, so this is
  // the expression the trigram index is built on.
  const similarity = sql<number>`similarity(lower(${sql.ref("catalog_item_names.display_name")}), ${normalizedSearch})`;

  let builder = executor
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
      sql<boolean>`exists (
        select 1
        from catalog_alias_projections as generated_alias
        where generated_alias.catalog_item_name_id = catalog_item_names.id
          and generated_alias.status = 'accepted'
          and generated_alias.source_method = 'generated'
      )`.as("isGeneratedAlias"),
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null);

  builder =
    matchMode === "trigram"
      ? builder
          // `%` reaches the GIN trigram index; the comparison beside it pins
          // the floor so a session GUC cannot quietly widen the result.
          .where(
            sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) % ${normalizedSearch}`,
          )
          .where(
            sql<boolean>`${similarity} >= ${CATALOG_TYPEAHEAD_TRIGRAM_THRESHOLD}`,
          )
      : builder.where(
          sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
        );

  // Compatibility rows predate the explicit product object-kind projection.
  // Keep generic species visible while still excluding impossible variety/breed
  // combinations when a typed picker is already asking for a kind.
  if (objectKind === "plant") {
    builder = builder.where("catalog_items.catalog_kind", "!=", "breed");
  }
  if (objectKind === "animal") {
    builder = builder.where(
      "catalog_items.catalog_kind",
      "!=",
      "plant_variety",
    );
  }

  if (matchMode === "trigram") {
    return builder
      .orderBy(similarity, "desc")
      .orderBy("catalog_item_names.is_primary", "desc")
      .orderBy("catalog_items.updated_at", "desc")
      .orderBy("catalog_item_names.display_name", "asc")
      .limit(normalizeCatalogTypeaheadRowLimit(limit));
  }

  return builder
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
      sql<boolean>`exists (
        select 1
        from catalog_alias_projections as generated_alias
        where generated_alias.catalog_item_name_id = catalog_item_names.id
          and generated_alias.status = 'accepted'
          and generated_alias.source_method = 'generated'
      )`.as("isGeneratedAlias"),
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
    .where("source", "=", "user_added")
    .forUpdate();
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
  const now = new Date();

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

function toCatalogSuggestion(input: {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: SelectableCatalogStatus;
  source: string;
  serveClass?: Ove330ServeClass;
  objectKindScope?: "plant" | "animal" | "either";
}): CatalogSuggestion {
  return {
    ...input,
    serveClass: isOve330ServeClass(input.serveClass)
      ? input.serveClass
      : "exact",
    ...catalogSuggestionTrustMetadata(input),
  };
}

function ensureCatalogSuggestionServeClass(
  suggestion: CatalogSuggestion,
): CatalogSuggestion {
  return isOve330ServeClass(suggestion.serveClass)
    ? suggestion
    : { ...suggestion, serveClass: "exact" };
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

function matchesCatalogSuggestionObjectKind(
  suggestion: CatalogSuggestion,
  objectKind: PlantObjectKind | undefined,
) {
  if (!objectKind) return true;
  if (suggestion.objectKindScope) {
    return catalogTypeaheadObjectKindScopeMatches(
      suggestion.objectKindScope,
      objectKind,
    );
  }
  return matchesCatalogKindObjectKind(suggestion.catalogKind, objectKind);
}

function matchesCatalogKindObjectKind(
  catalogKind: CatalogKind | string,
  objectKind: PlantObjectKind,
) {
  if (catalogKind === "breed") return objectKind === "animal";
  if (catalogKind === "plant_variety") return objectKind === "plant";
  // A species record has no independent object-kind field: it is selectable
  // by a plant and by an animal alike.
  return catalogKind === "species";
}

type CatalogDeadlineResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected" }
  | { status: "timed_out" };

function settleWithinCatalogDeadline<T>(
  promise: Promise<T>,
  deadlineMs = CATALOG_TYPEAHEAD_QUERY_DEADLINE_MS,
): Promise<CatalogDeadlineResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CatalogDeadlineResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(
      () => finish({ status: "timed_out" }),
      deadlineMs,
    );
    promise.then(
      (value) => finish({ status: "fulfilled", value }),
      () => finish({ status: "rejected" }),
    );
  });
}

export function isSelectableCatalogStatus(
  status: CatalogItemStatus | string,
): status is SelectableCatalogStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(
    status as SelectableCatalogStatus,
  );
}
