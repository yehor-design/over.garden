import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import type { Database, PlantObjectKind } from "@/db/schema";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import { normalizePublicObjectKindFilter } from "@/lib/garden/catalog-object-kind";
import { sanitizePreciseLocationSearchQuery } from "@/lib/privacy/precise-location-text";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

export type PublicJournalDirectoryQueryExecutor =
  | Kysely<Database>
  | Transaction<Database>;

export const PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE = 8;
export const PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT = 256;
export const PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES = [
  "seeded",
  "confirmed",
] as const;
const MAX_PUBLIC_JOURNAL_DIRECTORY_PAGE = 1_000;
const MAX_PUBLIC_JOURNAL_DIRECTORY_QUERY_LENGTH = 120;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,127}$/;
const UNSAFE_QUERY_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/|www\.|\b(?:latitude|longitude|gps|coordinates?|координат|широта|довгота)\b|[-+]?\d{1,3}\.\d{3,}\s*[,;/]\s*[-+]?\d{1,3}\.\d{3,})/i;

export type PublicJournalDirectoryKind = "all" | PlantObjectKind;
export type PublicJournalDirectorySeason =
  | "all"
  | "winter"
  | "spring"
  | "summer"
  | "autumn";
export type PublicJournalDirectorySort = "relevance" | "recent" | "oldest";

export interface PublicJournalDirectoryRequest {
  query: string;
  kind: PublicJournalDirectoryKind;
  catalog: string | null;
  topic: string | null;
  season: PublicJournalDirectorySeason;
  region: CoarseRegionCode | null;
  sort: PublicJournalDirectorySort;
  page: number;
}

export interface PublicJournalDirectoryEntryRow {
  entryId: string;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicSlug: string;
  objectId: string;
  objectDisplayName: string;
  objectKind: string;
  varietyText: string | null;
  catalogKind: string | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  catalogStatus: string | null;
  safeRegionCode: string | null;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  totalCount: number | string | bigint;
}

export function normalizePublicJournalDirectoryRequest(input: {
  q?: string | string[];
  kind?: string | string[];
  catalog?: string | string[];
  topic?: string | string[];
  season?: string | string[];
  region?: string | string[];
  sort?: string | string[];
  page?: string | string[];
}): PublicJournalDirectoryRequest {
  const query = normalizePublicJournalDirectoryQuery(firstValue(input.q));
  const kind = normalizeLower(firstValue(input.kind));
  const catalog = normalizeSlug(firstValue(input.catalog));
  const topic = normalizeSlug(firstValue(input.topic));
  const season = normalizeLower(firstValue(input.season));
  const requestedSort = normalizeLower(firstValue(input.sort));

  return {
    query,
    kind:
      kind === "all" ? "all" : (normalizePublicObjectKindFilter(kind) ?? "all"),
    catalog,
    topic,
    season: isDirectorySeason(season) ? season : "all",
    region: normalizeCoarseRegionCode(firstValue(input.region)),
    sort: isDirectorySort(requestedSort)
      ? requestedSort
      : query
        ? "relevance"
        : "recent",
    page: normalizePage(firstValue(input.page)),
  };
}

export function buildPublicJournalDirectoryEntriesQuery(
  executor: PublicJournalDirectoryQueryExecutor,
  request: PublicJournalDirectoryRequest,
  relevanceIds: readonly string[] = [],
  restrictToEntryIds?: readonly string[] | null,
  textSearchMode: "apply" | "skip" = "apply",
) {
  const safeRegion = publicJournalSafeRegionExpression();
  let query = executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [
          ...PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES,
        ])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "user_handle_registry.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "user_handle_registry.normalized_handle",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_slug as publicSlug",
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.variety_text as varietyText",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.status as catalogStatus",
      safeRegion.as("safeRegionCode"),
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      "user_public_profiles.avatar_url as authorAvatarUrl",
      sql<number>`count(*) over()`.as("totalCount"),
    ])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .$narrowType<{
      publishedAt: Date;
      publicSlug: string;
      entryId: string;
    }>();

  query = query.where(publicLaunchSurfacePredicates());

  const restrictedEntryIds =
    normalizePublicJournalDirectoryEntryIds(restrictToEntryIds);
  if (restrictedEntryIds) {
    query =
      restrictedEntryIds.length > 0
        ? query.where("journal_entries.id", "in", restrictedEntryIds)
        : query.where(sql<boolean>`false`);
  }

  if (request.kind !== "all") {
    query = query.where("plant_objects.object_kind", "=", request.kind);
  }
  if (request.catalog) {
    query = query.where("catalog_items.public_slug", "=", request.catalog);
  }
  if (request.topic) {
    const topic = request.topic;
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("journal_entry_topic_signals")
          .innerJoin(
            "journal_topics",
            "journal_topics.id",
            "journal_entry_topic_signals.topic_id",
          )
          .select(sql<number>`1`.as("membership"))
          .whereRef(
            "journal_entry_topic_signals.journal_entry_id",
            "=",
            "journal_entries.id",
          )
          .where("journal_topics.slug", "=", topic)
          .where("journal_topics.trust_state", "=", "curated")
          .where("journal_entry_topic_signals.review_state", "=", "accepted")
          .where(
            "journal_entry_topic_signals.public_membership_state",
            "=",
            "eligible",
          ),
      ),
    );
  }
  if (request.season !== "all") {
    query = query.where(
      sql<number>`extract(month from ${sql.ref("journal_entries.entry_date")})::int`,
      "in",
      monthsForSeason(request.season),
    );
  }
  if (request.region) {
    query = query
      .where("plant_objects.location_visibility", "=", "region")
      .where(safeRegion, "=", request.region);
  }
  if (request.query && textSearchMode === "apply") {
    const pattern = `%${escapeLikePattern(request.query)}%`;
    query = query.where(({ eb, exists, or, selectFrom }) =>
      or([
        eb("journal_entries.title", "ilike", pattern),
        eb("journal_entries.body", "ilike", pattern),
        eb("plant_objects.display_name", "ilike", pattern),
        eb("plant_objects.variety_text", "ilike", pattern),
        eb("catalog_items.canonical_name", "ilike", pattern),
        exists(
          selectFrom("catalog_item_names")
            .select(sql<number>`1`.as("catalog_match"))
            .whereRef(
              "catalog_item_names.catalog_item_id",
              "=",
              "catalog_items.id",
            )
            .where("catalog_item_names.display_name", "ilike", pattern),
        ),
        exists(
          selectFrom("journal_entry_topic_signals")
            .innerJoin(
              "journal_topics",
              "journal_topics.id",
              "journal_entry_topic_signals.topic_id",
            )
            .select(sql<number>`1`.as("topic_match"))
            .whereRef(
              "journal_entry_topic_signals.journal_entry_id",
              "=",
              "journal_entries.id",
            )
            .where("journal_topics.trust_state", "=", "curated")
            .where("journal_entry_topic_signals.review_state", "=", "accepted")
            .where(
              "journal_entry_topic_signals.public_membership_state",
              "=",
              "eligible",
            )
            .where("journal_topics.label", "ilike", pattern),
        ),
      ]),
    );
  }

  if (request.sort === "oldest") {
    query = query
      .orderBy("journal_entries.entry_date", "asc")
      .orderBy("journal_entries.published_at", "asc");
  } else {
    const validRelevanceIds = relevanceIds.filter((id) =>
      UUID_PATTERN.test(id),
    );
    if (request.sort === "relevance" && validRelevanceIds.length > 0) {
      const values = sql.join(validRelevanceIds.map((id) => sql`${id}::uuid`));
      query = query.orderBy(
        sql<number>`coalesce(array_position(array[${values}]::uuid[], ${sql.ref("journal_entries.id")}), ${validRelevanceIds.length + 1})`,
        "asc",
      );
    }
    query = query
      .orderBy("journal_entries.published_at", "desc")
      .orderBy("journal_entries.entry_date", "desc");
  }

  return query
    .orderBy("journal_entries.id", "asc")
    .limit(PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE + 1)
    .offset((request.page - 1) * PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE)
    .$castTo<PublicJournalDirectoryEntryRow>();
}

export function buildPublicJournalDirectoryFallbackCandidateQuery(
  executor: PublicJournalDirectoryQueryExecutor,
  restrictToEntryIds?: readonly string[] | null,
) {
  let query = executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .select("journal_entries.id as entryId")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null);

  query = query.where(publicLaunchSurfacePredicates());

  const restricted =
    normalizePublicJournalDirectoryEntryIds(restrictToEntryIds);
  if (restricted) {
    query = restricted.length
      ? query.where("journal_entries.id", "in", restricted)
      : query.where(sql<boolean>`false`);
  }

  return query
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT);
}

export function normalizePublicJournalDirectoryEntryIds(
  entryIds: readonly string[] | null | undefined,
) {
  if (entryIds == null) return null;
  return [...new Set(entryIds.filter((id) => UUID_PATTERN.test(id)))].slice(
    0,
    1_000,
  );
}

export function publicJournalSafeRegionExpression(): RawBuilder<string | null> {
  return sql<string | null>`case
    when ${sql.ref("plant_objects.location_visibility")} = 'region' then
      coalesce(
        ${sql.ref("plant_objects.coarse_region_code")},
        case
          when ${sql.ref("spaces.location_visibility")} = 'region'
            then ${sql.ref("spaces.coarse_region_code")}
          else null
        end
      )
    else null
  end`;
}

function normalizePublicJournalDirectoryQuery(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized || UNSAFE_QUERY_PATTERN.test(normalized)) return "";
  // OVE-234: a coordinate-bearing term is dropped before it reaches the SQL
  // predicate, Meilisearch, the reflected input, or a query log.
  return sanitizePreciseLocationSearchQuery(
    normalized.slice(0, MAX_PUBLIC_JOURNAL_DIRECTORY_QUERY_LENGTH).trimEnd(),
  ).query;
}

function normalizeSlug(value: string | undefined | null) {
  const normalized = value?.trim().toLocaleLowerCase("en") ?? "";
  return SAFE_SLUG_PATTERN.test(normalized) ? normalized : null;
}

function normalizeLower(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? undefined : value;
}

function normalizePage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PUBLIC_JOURNAL_DIRECTORY_PAGE);
}
function isDirectorySeason(
  value: string,
): value is PublicJournalDirectorySeason {
  return (
    value === "all" ||
    value === "winter" ||
    value === "spring" ||
    value === "summer" ||
    value === "autumn"
  );
}

function isDirectorySort(value: string): value is PublicJournalDirectorySort {
  return value === "relevance" || value === "recent" || value === "oldest";
}

function monthsForSeason(season: Exclude<PublicJournalDirectorySeason, "all">) {
  return {
    winter: [12, 1, 2],
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11],
  }[season];
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
