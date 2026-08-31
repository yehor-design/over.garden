import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogKind, Database, PlantObjectKind } from "@/db/schema";
import {
  catalogSuggestionTrustMetadata,
  type CatalogTrustMetadata,
} from "@/lib/garden/catalog-trust";
import type { Ove330ServeClass } from "@/lib/media/presentation-contract";
import type { CatalogTypeaheadRow } from "@/server/search/catalog-documents";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const STABLE_REGISTRY_PRODUCT_QUERY_DEADLINE_MS = 500;

/**
 * The trigram similarity floor, pinned in the predicate rather than inherited
 * from `pg_trgm.similarity_threshold`.
 *
 * `%` is what reaches the GIN index; the explicit comparison beside it is what
 * makes the result independent of a session GUC nobody in this path sets. At
 * this floor `помідор` still matches `помдор` and `lycopersicum` still matches
 * `lycopersicm`, which are the misspellings this source exists for.
 */
export const STABLE_REGISTRY_PRODUCT_TRIGRAM_THRESHOLD = 0.3;
export const STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS = 8;
export const STABLE_REGISTRY_PRODUCT_MIN_QUERY_LENGTH = 2;
export const STABLE_REGISTRY_PRODUCT_MAX_QUERY_LENGTH = 120;

export const STABLE_REGISTRY_PRODUCT_NAME_CLASSES = [
  "canonical",
  "scientific",
  "localized",
  "accepted_alias",
] as const;

export type StableRegistryProductNameClass =
  (typeof STABLE_REGISTRY_PRODUCT_NAME_CLASSES)[number];

export const STABLE_REGISTRY_OBJECT_KIND_SCOPES = [
  "plant",
  "animal",
  "either",
] as const;

/**
 * `either` is not an unknown kind. A variety is always a plant and a breed is
 * always an animal, but a species is genuinely selectable by both a plant and
 * an animal object, so the projection records that fact instead of guessing.
 */
export type StableRegistryObjectKindScope =
  (typeof STABLE_REGISTRY_OBJECT_KIND_SCOPES)[number];

export function objectKindScopeMatches(
  scope: StableRegistryObjectKindScope,
  objectKind: PlantObjectKind,
): boolean {
  return scope === "either" || scope === objectKind;
}

export function isStableRegistryObjectKindScope(
  value: unknown,
): value is StableRegistryObjectKindScope {
  return value === "plant" || value === "animal" || value === "either";
}

export interface ActiveStableRegistryProductSuggestion extends CatalogTrustMetadata {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  /** Active immutable release membership is always curated at this boundary. */
  status: "confirmed";
  source: "stable_registry";
  serveClass: Ove330ServeClass;
  objectKind: PlantObjectKind;
  publicSlug: string;
  registryReleaseId: string;
  revisionId: string;
  nameClass: StableRegistryProductNameClass;
}

export interface ActiveStableRegistryProductCatalogItem {
  id: string;
  canonicalName: string;
  publicSlug: string;
  catalogKind: CatalogKind;
  locale: string;
  status: "confirmed";
  source: "stable_registry";
  objectKindScope: StableRegistryObjectKindScope;
  registryReleaseId: string;
  revisionId: string;
}

interface ActiveProductNameRow {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  objectKindScope: string;
  publicSlug: string;
  registryReleaseId: string;
  revisionId: string;
  nameClass: string;
  isPrimary: boolean;
}

interface ActiveProductItemRow {
  id: string;
  canonicalName: string;
  publicSlug: string;
  catalogKind: string;
  locale: string;
  objectKindScope: string;
  registryReleaseId: string;
  revisionId: string;
}

/**
 * The shared active predicate. Every query joins the live Foundation pointer,
 * the frozen product projection, and the active release state in one read.
 * Captured source rows and mutable catalog status never satisfy this boundary.
 */
function activeProductProjectionFrom(executor: QueryExecutor) {
  return executor
    .selectFrom("stable_registry_product_catalog_records as records")
    .innerJoin(
      "catalog_registry_active_pointers as pointers",
      "pointers.active_release_id",
      "records.registry_release_id",
    )
    .innerJoin(
      "catalog_registry_releases as releases",
      "releases.id",
      "records.registry_release_id",
    )
    .where("pointers.release_family", "=", "foundation")
    .where("releases.release_kind", "=", "foundation")
    .where("releases.state", "=", "active");
}

export async function searchActiveStableRegistryProductSuggestions(
  query: string,
  objectKind: PlantObjectKind,
  limit = STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<ActiveStableRegistryProductSuggestion[]> {
  const normalizedQuery = normalizeStableRegistryProductQuery(query);
  if (normalizedQuery.length < STABLE_REGISTRY_PRODUCT_MIN_QUERY_LENGTH) {
    return [];
  }

  const rows = await buildActiveStableRegistryProductTypeaheadQuery(
    executor,
    normalizedQuery,
    objectKind,
    normalizeStableRegistryProductRowLimit(limit),
  ).execute();

  const deduped = new Map<string, ActiveStableRegistryProductSuggestion>();
  for (const row of rows) {
    const suggestion = serializeActiveProductSuggestion(row, objectKind);
    if (suggestion && !deduped.has(suggestion.id)) {
      deduped.set(suggestion.id, suggestion);
    }
  }
  return [...deduped.values()].slice(
    0,
    normalizeStableRegistryProductLimit(limit),
  );
}

export function buildActiveStableRegistryProductTypeaheadQuery(
  executor: QueryExecutor,
  normalizedQuery: string,
  objectKind: PlantObjectKind,
  limit = STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
) {
  const query = normalizeStableRegistryProductQuery(normalizedQuery);
  const pattern = `%${query}%`;
  const prefixPattern = `${query}%`;

  return activeProductProjectionFrom(executor)
    .innerJoin("stable_registry_product_catalog_names as names", (join) =>
      join
        .onRef("names.registry_release_id", "=", "records.registry_release_id")
        .onRef("names.catalog_item_id", "=", "records.catalog_item_id"),
    )
    .select([
      "records.catalog_item_id as id",
      "names.display_name as displayName",
      "records.canonical_name as canonicalName",
      "records.catalog_kind as catalogKind",
      "names.locale as locale",
      "records.object_kind_scope as objectKindScope",
      "records.public_slug as publicSlug",
      "records.registry_release_id as registryReleaseId",
      "records.catalog_item_revision_id as revisionId",
      "names.name_class as nameClass",
      "names.is_primary as isPrimary",
    ])
    .where((eb) =>
      eb.or([
        eb("records.object_kind_scope", "=", objectKind),
        eb("records.object_kind_scope", "=", "either"),
      ]),
    )
    .where(
      sql<boolean>`lower(${sql.ref("names.normalized_name")}) like ${pattern}`,
    )
    .orderBy(
      sql<number>`case
        when ${sql.ref("names.normalized_name")} = ${query} then 0
        when ${sql.ref("names.normalized_name")} like ${prefixPattern} then 1
        when ${sql.ref("names.name_class")} = 'canonical' then 2
        when ${sql.ref("names.name_class")} = 'scientific' then 3
        when ${sql.ref("names.name_class")} = 'localized' then 4
        else 5
      end`,
      "asc",
    )
    .orderBy("names.is_primary", "desc")
    .orderBy("names.display_name", "asc")
    .limit(normalizeStableRegistryProductRowLimit(limit))
    .$castTo<ActiveProductNameRow>();
}

/**
 * The same release-scoped picker, ranked by trigram similarity instead of
 * substring containment.
 *
 * It is a second query rather than a widened predicate on purpose: the existing
 * substring source keeps its exact ranking, and a gardener who spells the name
 * correctly sees the same list they saw before. This one only ever adds the
 * rows a typo would otherwise have hidden, and the caller's dedupe owner
 * decides what survives the merge.
 *
 * Every guard the substring query applies applies here too — the active-release
 * projection, the object-kind scope, and the row limit — so a trigram hit can
 * never reach a gardener through a weaker predicate than an exact hit.
 */
export function buildActiveStableRegistryProductTrigramTypeaheadQuery(
  executor: QueryExecutor,
  normalizedQuery: string,
  objectKind: PlantObjectKind,
  limit = STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
) {
  const query = normalizeStableRegistryProductQuery(normalizedQuery);
  const similarity = sql<number>`similarity(lower(${sql.ref("names.normalized_name")}), ${query})`;

  return activeProductProjectionFrom(executor)
    .innerJoin("stable_registry_product_catalog_names as names", (join) =>
      join
        .onRef("names.registry_release_id", "=", "records.registry_release_id")
        .onRef("names.catalog_item_id", "=", "records.catalog_item_id"),
    )
    .select([
      "records.catalog_item_id as id",
      "names.display_name as displayName",
      "records.canonical_name as canonicalName",
      "records.catalog_kind as catalogKind",
      "names.locale as locale",
      "records.object_kind_scope as objectKindScope",
      "records.public_slug as publicSlug",
      "records.registry_release_id as registryReleaseId",
      "records.catalog_item_revision_id as revisionId",
      "names.name_class as nameClass",
      "names.is_primary as isPrimary",
    ])
    .where((eb) =>
      eb.or([
        eb("records.object_kind_scope", "=", objectKind),
        eb("records.object_kind_scope", "=", "either"),
      ]),
    )
    // `%` reaches the GIN trigram index; the comparison beside it pins the
    // floor so a session GUC cannot quietly widen or narrow the result.
    .where(sql<boolean>`lower(${sql.ref("names.normalized_name")}) % ${query}`)
    .where(
      sql<boolean>`${similarity} >= ${STABLE_REGISTRY_PRODUCT_TRIGRAM_THRESHOLD}`,
    )
    .orderBy(similarity, "desc")
    .orderBy("names.is_primary", "desc")
    .orderBy("names.display_name", "asc")
    .limit(normalizeStableRegistryProductRowLimit(limit))
    .$castTo<ActiveProductNameRow>();
}

/** Trigram counterpart of `searchActiveStableRegistryProductSuggestions`. */
export async function searchActiveStableRegistryProductTrigramSuggestions(
  query: string,
  objectKind: PlantObjectKind,
  limit = STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
  executor: QueryExecutor = db,
): Promise<ActiveStableRegistryProductSuggestion[]> {
  const normalizedQuery = normalizeStableRegistryProductQuery(query);
  if (normalizedQuery.length < STABLE_REGISTRY_PRODUCT_MIN_QUERY_LENGTH) {
    return [];
  }

  const rows = await buildActiveStableRegistryProductTrigramTypeaheadQuery(
    executor,
    normalizedQuery,
    objectKind,
    normalizeStableRegistryProductRowLimit(limit),
  ).execute();

  const deduped = new Map<string, ActiveStableRegistryProductSuggestion>();
  for (const row of rows) {
    const suggestion = serializeActiveProductSuggestion(row, objectKind);
    if (suggestion && !deduped.has(suggestion.id)) {
      deduped.set(suggestion.id, suggestion);
    }
  }
  return [...deduped.values()].slice(
    0,
    normalizeStableRegistryProductLimit(limit),
  );
}

/**
 * Canonical worker input for the derived Meilisearch rebuild. It is a separate
 * query instead of reusing mutable `catalog_items`, so a reindex cannot
 * accidentally revive an inactive, source-only, or superseded identity.
 */
export function buildActiveStableRegistryProductTypeaheadReindexRowsQuery(
  executor: QueryExecutor,
) {
  return activeProductProjectionFrom(executor)
    .innerJoin("stable_registry_product_catalog_names as names", (join) =>
      join
        .onRef("names.registry_release_id", "=", "records.registry_release_id")
        .onRef("names.catalog_item_id", "=", "records.catalog_item_id"),
    )
    .select([
      "records.catalog_item_id as id",
      "records.canonical_name as canonicalName",
      sql<string>`lower(${sql.ref("records.canonical_name")})`.as(
        "normalizedName",
      ),
      "records.catalog_kind as catalogKind",
      sql<string>`'confirmed'`.as("status"),
      sql<string>`'stable_registry'`.as("source"),
      sql<string | null>`null`.as("createdByUserId"),
      "records.item_locale as itemLocale",
      "names.display_name as displayName",
      "names.normalized_name as aliasNormalizedName",
      "names.locale as aliasLocale",
      "names.is_primary as isPrimary",
      sql<boolean>`false`.as("isGeneratedAlias"),
      sql<string>`'stable_registry'`.as("eligibilityScope"),
      "records.object_kind_scope as objectKindScope",
      "records.public_slug as publicSlug",
      "records.registry_release_id as registryReleaseId",
      "records.catalog_item_revision_id as revisionId",
      "names.name_class as nameClass",
    ])
    .orderBy("names.is_primary", "desc")
    .orderBy("names.display_name", "asc")
    .$castTo<CatalogTypeaheadRow>();
}

export async function findActiveStableRegistryProductCatalogItem(
  executor: QueryExecutor,
  itemId: string,
  expectedObjectKind?: PlantObjectKind,
): Promise<ActiveStableRegistryProductCatalogItem | null> {
  const normalizedId = normalizeStableRegistryProductId(itemId);
  if (!normalizedId) return null;

  let query = activeProductProjectionFrom(executor)
    .select([
      "records.catalog_item_id as id",
      "records.canonical_name as canonicalName",
      "records.public_slug as publicSlug",
      "records.catalog_kind as catalogKind",
      "records.item_locale as locale",
      "records.object_kind_scope as objectKindScope",
      "records.registry_release_id as registryReleaseId",
      "records.catalog_item_revision_id as revisionId",
    ])
    .where("records.catalog_item_id", "=", normalizedId);

  if (expectedObjectKind) {
    query = query.where((eb) =>
      eb.or([
        eb("records.object_kind_scope", "=", expectedObjectKind),
        eb("records.object_kind_scope", "=", "either"),
      ]),
    );
  }

  const row = await query.$castTo<ActiveProductItemRow>().executeTakeFirst();
  return row
    ? serializeActiveProductCatalogItem(row, expectedObjectKind)
    : null;
}

export async function findActiveStableRegistryProductCatalogItemByPublicSlug(
  publicSlug: string,
  expectedObjectKind?: PlantObjectKind,
  executor: QueryExecutor = db,
): Promise<ActiveStableRegistryProductCatalogItem | null> {
  const normalizedSlug = normalizeStableRegistryProductPublicSlug(publicSlug);
  if (!normalizedSlug) return null;

  let query = activeProductProjectionFrom(executor)
    .select([
      "records.catalog_item_id as id",
      "records.canonical_name as canonicalName",
      "records.public_slug as publicSlug",
      "records.catalog_kind as catalogKind",
      "records.item_locale as locale",
      "records.object_kind_scope as objectKindScope",
      "records.registry_release_id as registryReleaseId",
      "records.catalog_item_revision_id as revisionId",
    ])
    .where("records.public_slug", "=", normalizedSlug);

  if (expectedObjectKind) {
    query = query.where((eb) =>
      eb.or([
        eb("records.object_kind_scope", "=", expectedObjectKind),
        eb("records.object_kind_scope", "=", "either"),
      ]),
    );
  }

  const row = await query.$castTo<ActiveProductItemRow>().executeTakeFirst();
  return row
    ? serializeActiveProductCatalogItem(row, expectedObjectKind)
    : null;
}

/** A bounded canonical validator for a Meilisearch hit or any stale selection. */
export async function filterActiveStableRegistryProductIds(
  executor: QueryExecutor,
  ids: readonly string[],
  objectKind: PlantObjectKind,
): Promise<Set<string>> {
  const normalizedIds = [...new Set(ids.map(normalizeStableRegistryProductId))]
    .filter((value): value is string => value !== null)
    .slice(0, STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS * 3);
  if (normalizedIds.length === 0) return new Set();

  const rows = await activeProductProjectionFrom(executor)
    .select("records.catalog_item_id as id")
    .where((eb) =>
      eb.or([
        eb("records.object_kind_scope", "=", objectKind),
        eb("records.object_kind_scope", "=", "either"),
      ]),
    )
    .where("records.catalog_item_id", "in", normalizedIds)
    .execute();
  return new Set(rows.map((row) => row.id));
}

export function normalizeStableRegistryProductQuery(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, STABLE_REGISTRY_PRODUCT_MAX_QUERY_LENGTH)
    .toLocaleLowerCase("en");
}

export function isStableRegistryProductObjectKind(
  value: unknown,
): value is PlantObjectKind {
  return value === "plant" || value === "animal";
}

function serializeActiveProductSuggestion(
  row: ActiveProductNameRow,
  requestedObjectKind: PlantObjectKind,
): ActiveStableRegistryProductSuggestion | null {
  if (
    !isStableRegistryObjectKindScope(row.objectKindScope) ||
    !objectKindScopeMatches(row.objectKindScope, requestedObjectKind) ||
    !isCatalogKind(row.catalogKind) ||
    !isStableRegistryProductNameClass(row.nameClass) ||
    !isStableRegistryProductPublicSlug(row.publicSlug)
  ) {
    return null;
  }

  const base = {
    id: row.id,
    displayName: row.displayName,
    canonicalName: row.canonicalName,
    catalogKind: row.catalogKind,
    locale: row.locale,
    status: "confirmed" as const,
    source: "stable_registry" as const,
    serveClass: "exact" as const,
    // A scope of `either` resolves to the kind the caller is picking for; a
    // concrete scope is already the answer.
    objectKind: requestedObjectKind,
    publicSlug: row.publicSlug,
    registryReleaseId: row.registryReleaseId,
    revisionId: row.revisionId,
    nameClass: row.nameClass,
  };
  return { ...base, ...catalogSuggestionTrustMetadata(base) };
}

function serializeActiveProductCatalogItem(
  row: ActiveProductItemRow,
  requestedObjectKind: PlantObjectKind | undefined,
): ActiveStableRegistryProductCatalogItem | null {
  if (
    !isStableRegistryObjectKindScope(row.objectKindScope) ||
    !isCatalogKind(row.catalogKind) ||
    !isStableRegistryProductPublicSlug(row.publicSlug)
  ) {
    return null;
  }
  if (
    requestedObjectKind &&
    !objectKindScopeMatches(row.objectKindScope, requestedObjectKind)
  ) {
    return null;
  }
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    publicSlug: row.publicSlug,
    catalogKind: row.catalogKind,
    locale: row.locale,
    status: "confirmed",
    source: "stable_registry",
    objectKindScope: row.objectKindScope,
    registryReleaseId: row.registryReleaseId,
    revisionId: row.revisionId,
  };
}

function normalizeStableRegistryProductId(value: string) {
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    normalized,
  )
    ? normalized.toLowerCase()
    : null;
}

function normalizeStableRegistryProductPublicSlug(value: string) {
  const normalized = value.trim();
  return isStableRegistryProductPublicSlug(normalized) ? normalized : null;
}

function isStableRegistryProductPublicSlug(value: string) {
  return value.length <= 96 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function isCatalogKind(value: string): value is CatalogKind {
  return value === "plant_variety" || value === "species" || value === "breed";
}

function isStableRegistryProductNameClass(
  value: string,
): value is StableRegistryProductNameClass {
  return STABLE_REGISTRY_PRODUCT_NAME_CLASSES.includes(
    value as StableRegistryProductNameClass,
  );
}

function normalizeStableRegistryProductLimit(value: number) {
  if (!Number.isFinite(value)) return STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS;
  return Math.min(
    Math.max(Math.trunc(value), 1),
    STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
  );
}

function normalizeStableRegistryProductRowLimit(value: number) {
  return normalizeStableRegistryProductLimit(value) * 3;
}
