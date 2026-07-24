import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogItemStatus,
  CatalogKind,
  Database,
  PlantObjectKind,
} from "@/db/schema";
import {
  publicCatalogEvidencePath,
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import type { PublicLocale } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import {
  buildPublicFeedMediaQuery,
  buildPublicFeedTopicsForEntriesQuery,
  type PublicFeedMediaRow,
  type PublicFeedTopicRow,
} from "@/server/public-feed-repository";
import {
  buildPublicJournalDirectoryEntriesQuery,
  normalizePublicJournalDirectoryEntryIds,
  publicJournalSafeRegionExpression,
  PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
  PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES,
  type PublicJournalDirectoryEntryRow,
  type PublicJournalDirectoryRequest,
  type PublicJournalDirectorySeason,
} from "@/server/public-journal-directory-query";
import { searchPublicJournalDirectoryCandidates } from "@/server/search/public-journal-directory-search";

export {
  buildPublicJournalDirectoryEntriesQuery,
  normalizePublicJournalDirectoryRequest,
  PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
} from "@/server/public-journal-directory-query";
export type {
  PublicJournalDirectoryEntryRow,
  PublicJournalDirectoryKind,
  PublicJournalDirectoryRequest,
  PublicJournalDirectorySeason,
  PublicJournalDirectorySort,
} from "@/server/public-journal-directory-query";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type SearchCandidates = (query: string) => Promise<string[] | null>;

const MAX_PUBLIC_JOURNAL_DIRECTORY_EXCERPT_LENGTH = 320;
const MAX_PUBLIC_JOURNAL_DIRECTORY_FACETS = 24;
const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,127}$/;
const UNSAFE_PUBLIC_RESULT_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/|www\.|\b(?:latitude|longitude|gps|coordinates?|координат|широта|довгота)\b|[-+]?\d{1,3}\.\d{3,}\s*[,;/]\s*[-+]?\d{1,3}\.\d{3,})/i;
const UNSAFE_PUBLIC_RESULT_REPLACEMENT_PATTERN = new RegExp(
  UNSAFE_PUBLIC_RESULT_PATTERN.source,
  "gi",
);

export interface PublicJournalDirectoryCard {
  title: string;
  excerpt: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicPath: string;
  season: Exclude<PublicJournalDirectorySeason, "all">;
  safeRegionCode: CoarseRegionCode | null;
  object: {
    displayName: string;
    kind: PlantObjectKind;
    identityLabel: string | null;
    catalogKind: CatalogKind | null;
    catalogSlug: string | null;
    catalogPath: string | null;
    publicPath: string;
  };
  author: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    profilePath: string;
  } | null;
  media: Array<{
    publicUrl: string;
    focalX: number;
    focalY: number;
    intrinsicWidth: number | null;
    intrinsicHeight: number | null;
  }>;
  topics: Array<{ slug: string; label: string }>;
}

export interface PublicJournalDirectoryPage {
  request: PublicJournalDirectoryRequest;
  cards: PublicJournalDirectoryCard[];
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  searchSource: "hybrid" | "database";
}

export interface PublicJournalDirectoryFacets {
  kinds: Array<{ kind: PlantObjectKind; count: number }>;
  catalogs: Array<{
    slug: string;
    label: string;
    kind: CatalogKind;
    count: number;
  }>;
  topics: Array<{ slug: string; label: string; count: number }>;
  regions: Array<{ code: CoarseRegionCode; count: number }>;
}

export interface PublicJournalDirectoryListOptions {
  executor?: QueryExecutor;
  findSearchCandidates?: SearchCandidates;
  restrictToEntryIds?: readonly string[] | null;
}

export async function listPublicJournalDirectoryPage(
  request: PublicJournalDirectoryRequest,
  locale: PublicLocale,
  options: PublicJournalDirectoryListOptions = {},
): Promise<PublicJournalDirectoryPage> {
  const executor = options.executor ?? db;
  const findSearchCandidates =
    options.findSearchCandidates ?? searchPublicJournalDirectoryCandidates;
  const relevanceIds = request.query
    ? await findSearchCandidates(request.query)
    : null;
  const rows = await buildPublicJournalDirectoryEntriesQuery(
    executor,
    request,
    relevanceIds ?? [],
    options.restrictToEntryIds,
  ).execute();
  const visibleRows = rows.slice(0, PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE);
  const entryIds = visibleRows.map((row) => row.entryId);
  const [mediaRows, topicRows] =
    entryIds.length === 0
      ? [[], []]
      : await Promise.all([
          buildPublicFeedMediaQuery(executor, entryIds).execute(),
          buildPublicFeedTopicsForEntriesQuery(executor, entryIds).execute(),
        ]);

  return {
    ...serializePublicJournalDirectoryPage(
      rows,
      mediaRows,
      topicRows,
      locale,
      request,
    ),
    searchSource:
      request.query && relevanceIds !== null ? "hybrid" : "database",
  };
}

export async function listPublicJournalDirectoryFacets(
  options: Pick<
    PublicJournalDirectoryListOptions,
    "executor" | "restrictToEntryIds"
  > = {},
): Promise<PublicJournalDirectoryFacets> {
  const executor = options.executor ?? db;
  const restrictedEntryIds = options.restrictToEntryIds;
  const safeRegion = publicJournalSafeRegionExpression();
  const [kindRows, catalogRows, topicRows, regionRows] = await Promise.all([
    publicJournalFacetBase(executor, restrictedEntryIds)
      .select([
        "plant_objects.object_kind as value",
        sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
          "count",
        ),
      ])
      .groupBy("plant_objects.object_kind")
      .orderBy("count", "desc")
      .execute(),
    publicJournalFacetBase(executor, restrictedEntryIds)
      .innerJoin("catalog_items", (join) =>
        join
          .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
          .on("catalog_items.status", "in", [
            ...PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES,
          ])
          .on("catalog_items.created_by_user_id", "is", null),
      )
      .select([
        "catalog_items.public_slug as slug",
        "catalog_items.canonical_name as label",
        "catalog_items.catalog_kind as kind",
        sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
          "count",
        ),
      ])
      .where("catalog_items.public_slug", "is not", null)
      .groupBy([
        "catalog_items.id",
        "catalog_items.public_slug",
        "catalog_items.canonical_name",
        "catalog_items.catalog_kind",
      ])
      .orderBy("count", "desc")
      .orderBy("catalog_items.canonical_name", "asc")
      .limit(MAX_PUBLIC_JOURNAL_DIRECTORY_FACETS)
      .$narrowType<{ slug: string }>()
      .execute(),
    publicJournalFacetBase(executor, restrictedEntryIds)
      .innerJoin(
        "journal_entry_topic_signals",
        "journal_entry_topic_signals.journal_entry_id",
        "journal_entries.id",
      )
      .innerJoin(
        "journal_topics",
        "journal_topics.id",
        "journal_entry_topic_signals.topic_id",
      )
      .select([
        "journal_topics.slug as slug",
        "journal_topics.label as label",
        sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
          "count",
        ),
      ])
      .where("journal_topics.trust_state", "=", "curated")
      .where("journal_entry_topic_signals.review_state", "=", "accepted")
      .where(
        "journal_entry_topic_signals.public_membership_state",
        "=",
        "eligible",
      )
      .groupBy([
        "journal_topics.id",
        "journal_topics.slug",
        "journal_topics.label",
      ])
      .orderBy("count", "desc")
      .orderBy("journal_topics.label", "asc")
      .limit(MAX_PUBLIC_JOURNAL_DIRECTORY_FACETS)
      .execute(),
    publicJournalFacetBase(executor, restrictedEntryIds)
      .select([
        safeRegion.as("code"),
        sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
          "count",
        ),
      ])
      .where("plant_objects.location_visibility", "=", "region")
      .where(safeRegion, "is not", null)
      .groupBy(safeRegion)
      .orderBy("count", "desc")
      .limit(MAX_PUBLIC_JOURNAL_DIRECTORY_FACETS)
      .execute(),
  ]);

  return {
    kinds: kindRows.flatMap((row) => {
      const kind = normalizeObjectKind(row.value);
      return kind ? [{ kind, count: Number(row.count) }] : [];
    }),
    catalogs: catalogRows.flatMap((row) => {
      const kind = normalizeCatalogKind(row.kind);
      return kind
        ? [{ slug: row.slug, label: row.label, kind, count: Number(row.count) }]
        : [];
    }),
    topics: topicRows.map((row) => ({
      slug: row.slug,
      label: row.label,
      count: Number(row.count),
    })),
    regions: regionRows.flatMap((row) => {
      const code = normalizeCoarseRegionCode(row.code);
      return code ? [{ code, count: Number(row.count) }] : [];
    }),
  };
}

export function serializePublicJournalDirectoryPage(
  rows: PublicJournalDirectoryEntryRow[],
  mediaRows: PublicFeedMediaRow[],
  topicRows: PublicFeedTopicRow[],
  locale: PublicLocale,
  request: PublicJournalDirectoryRequest,
  pageSize = PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
  publicMediaUrl: (derivativeKey: string) => string = getPublicDerivativeUrl,
): Omit<PublicJournalDirectoryPage, "searchSource"> {
  const visibleRows = rows.slice(0, pageSize);
  const mediaByEntry = Object.groupBy(mediaRows, (row) => row.entryId);
  const topicsByEntry = Object.groupBy(topicRows, (row) => row.entryId);
  const cards = visibleRows.map((row): PublicJournalDirectoryCard => {
    const objectKind = normalizeObjectKind(row.objectKind) ?? "plant";
    const catalogKind = normalizeCatalogKind(row.catalogKind);
    const catalogStatus = normalizeCatalogStatus(row.catalogStatus);
    const catalogPath =
      catalogKind &&
      catalogStatus &&
      row.catalogPublicSlug &&
      normalizeSlug(row.catalogPublicSlug)
        ? publicCatalogEvidencePath(catalogKind, row.catalogPublicSlug)
        : null;
    const authorHandle = normalizePublicHandle(row.authorHandle);

    return {
      title: sanitizePublicResultTitle(row.title, locale),
      excerpt: buildPublicJournalDirectoryExcerpt(row.body),
      entryDate: row.entryDate,
      publishedAt: row.publishedAt,
      publicPath: publicJournalEntryPath(row.publicSlug),
      season: seasonForDate(row.entryDate),
      safeRegionCode: normalizeCoarseRegionCode(row.safeRegionCode),
      object: {
        displayName: sanitizePublicObjectName(
          row.objectDisplayName,
          objectKind,
          locale,
        ),
        kind: objectKind,
        identityLabel: sanitizePublicIdentity(
          row.catalogCanonicalName ?? row.varietyText,
        ),
        catalogKind: catalogPath ? catalogKind : null,
        catalogSlug: catalogPath ? row.catalogPublicSlug : null,
        catalogPath,
        publicPath: publicLineageObjectPath(row.objectId),
      },
      author: authorHandle
        ? {
            handle: authorHandle,
            displayName:
              sanitizePublicIdentity(row.authorDisplayName) ??
              `@${authorHandle}`,
            avatarUrl: row.authorAvatarUrl,
            profilePath: publicProfilePath(locale, authorHandle),
          }
        : null,
      media: (mediaByEntry[row.entryId] ?? []).slice(0, 3).map((media) => ({
        publicUrl: publicMediaUrl(media.derivativeKey),
        focalX: Number(media.focalX ?? 0.5),
        focalY: Number(media.focalY ?? 0.5),
        intrinsicWidth: media.intrinsicWidth ?? null,
        intrinsicHeight: media.intrinsicHeight ?? null,
      })),
      topics: (topicsByEntry[row.entryId] ?? []).map((topic) => ({
        slug: topic.slug,
        label: topic.label,
      })),
    };
  });
  const totalCount = Number(rows[0]?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    request,
    cards,
    totalCount,
    totalPages,
    hasPreviousPage: request.page > 1,
    hasNextPage: rows.length > pageSize && request.page < totalPages,
  };
}

function publicJournalFacetBase(
  executor: QueryExecutor,
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
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates());

  const restrictedEntryIds =
    normalizePublicJournalDirectoryEntryIds(restrictToEntryIds);
  if (restrictedEntryIds) {
    query =
      restrictedEntryIds.length > 0
        ? query.where("journal_entries.id", "in", restrictedEntryIds)
        : query.where(sql<boolean>`false`);
  }

  return query;
}

function normalizeSlug(value: string | undefined | null) {
  const normalized = value?.trim().toLocaleLowerCase("en") ?? "";
  return SAFE_SLUG_PATTERN.test(normalized) ? normalized : null;
}

function seasonForDate(
  value: Date | string,
): Exclude<PublicJournalDirectorySeason, "all"> {
  const month = new Date(value).getUTCMonth() + 1;
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function normalizeObjectKind(value: string | null | undefined) {
  return value === "plant" || value === "animal"
    ? value
    : null;
}

function normalizeCatalogKind(value: string | null | undefined) {
  return value === "plant_variety" || value === "species" || value === "breed"
    ? value
    : null;
}

function normalizeCatalogStatus(value: string | null | undefined) {
  return value === "seeded" || value === "confirmed"
    ? (value as Extract<CatalogItemStatus, "seeded" | "confirmed">)
    : null;
}

function normalizePublicHandle(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("en") ?? "";
  return /^[a-z0-9_]{2,32}$/.test(normalized) ? normalized : null;
}

function sanitizePublicIdentity(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized && !UNSAFE_PUBLIC_RESULT_PATTERN.test(normalized)
    ? normalized.slice(0, 160)
    : null;
}

function sanitizePublicResultTitle(value: string, locale: PublicLocale) {
  return (
    sanitizePublicIdentity(value) ??
    { uk: "Публічний запис", bg: "Публичен запис", ru: "Публичная запись" }[
      locale
    ]
  );
}

function sanitizePublicObjectName(
  value: string,
  kind: PlantObjectKind,
  locale: PublicLocale,
) {
  const safe = sanitizePublicIdentity(value);
  if (safe) return safe;

  return {
    uk: { plant: "Рослина", animal: "Тварина" },
    bg: {
      plant: "Растение",
      animal: "Животно",
    },
    ru: {
      plant: "Растение",
      animal: "Животное",
    },
  }[locale][kind];
}

function buildPublicJournalDirectoryExcerpt(body: string) {
  const safe = body
    .replace(UNSAFE_PUBLIC_RESULT_REPLACEMENT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (safe.length <= MAX_PUBLIC_JOURNAL_DIRECTORY_EXCERPT_LENGTH) return safe;
  return `${safe.slice(0, MAX_PUBLIC_JOURNAL_DIRECTORY_EXCERPT_LENGTH - 3).trimEnd()}...`;
}
