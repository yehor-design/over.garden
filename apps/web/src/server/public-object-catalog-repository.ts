import "server-only";

import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import { db } from "@/db";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
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
} from "@/lib/garden/public-paths";
import type { PublicLocale } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { buildFirstProcessedMediaPerEntryQuery } from "@/server/public-media-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const PUBLIC_OBJECT_CATALOG_PAGE_SIZE = 6;
const MAX_PUBLIC_OBJECT_CATALOG_PAGE = 1_000;
const MAX_PUBLIC_OBJECT_CATALOG_QUERY_LENGTH = 120;
const SELECTABLE_PUBLIC_CATALOG_STATUSES = ["seeded", "confirmed"] as const;

export type PublicObjectCatalogKind = "all" | PlantObjectKind;
export type PublicObjectCatalogIdentityFilter =
  | "all"
  | CatalogKind
  | "provisional"
  | "unknown"
  | "unavailable";
export type PublicObjectCatalogIdentityState =
  | "catalog"
  | "provisional"
  | "unknown"
  | "unavailable";

export interface PublicObjectCatalogRequest {
  kind: PublicObjectCatalogKind;
  identity: PublicObjectCatalogIdentityFilter;
  query: string;
  page: number;
}

export interface PublicObjectCatalogCard {
  key: string;
  objectKind: PlantObjectKind;
  identityState: PublicObjectCatalogIdentityState;
  identityName: string | null;
  catalogKind: CatalogKind | null;
  catalogStatus: Extract<CatalogItemStatus, "seeded" | "confirmed"> | null;
  catalogPath: string | null;
  objectCount: number;
  journalCount: number;
  representativeObject: {
    displayName: string;
    path: string;
  };
  latestJournal: {
    title: string;
    path: string;
    entryDate: Date | string;
  };
  mediaPublicUrl: string | null;
}

export interface PublicObjectCatalogPage {
  request: PublicObjectCatalogRequest;
  cards: PublicObjectCatalogCard[];
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PublicObjectCatalogGroupRow {
  groupKey: string;
  objectKind: string;
  identityState: string;
  catalogItemId: string | null;
  catalogKind: string | null;
  identityName: string | null;
  catalogPublicSlug: string | null;
  catalogStatus: string | null;
  objectCount: number | string | bigint;
  journalCount: number | string | bigint;
  representativeObjectId: string;
  representativeObjectName: string;
  latestEntryTitle: string;
  latestEntryPublicSlug: string;
  latestEntryDate: Date | string;
  mediaDerivativeKey: string | null;
  totalCount: number | string | bigint;
}

const UNSAFE_PUBLIC_IDENTITY_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/|www\.|(?:^|\s)@[A-Za-z0-9_]{2,}|\b(?:latitude|longitude|gps|coordinates?|координат|широта|довгота|invite|token)\b|[-+]?\d{1,3}\.\d{3,}\s*[,;/]\s*[-+]?\d{1,3}\.\d{3,}|\b(?:chip|microchip|ear\s*tag|ring|serial|паспорт|бирк[аи]|номер)\s*[:#]?\s*[A-ZА-ЯІЇЄ0-9-]{5,}\b)/i;

export function normalizePublicObjectCatalogRequest(input: {
  kind?: string | string[];
  identity?: string | string[];
  q?: string | string[];
  page?: string | string[];
}): PublicObjectCatalogRequest {
  const kind = normalizeFilterValue(input.kind);
  const identity = normalizeFilterValue(input.identity);
  const query = normalizePublicObjectCatalogQuery(firstValue(input.q));

  return {
    kind: isPublicObjectCatalogKind(kind) ? kind : "all",
    identity: isPublicObjectCatalogIdentityFilter(identity) ? identity : "all",
    query,
    page: normalizePublicObjectCatalogPage(firstValue(input.page)),
  };
}

export async function listPublicObjectCatalogPage(
  request: PublicObjectCatalogRequest,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicObjectCatalogPage> {
  const rows = await buildPublicObjectCatalogGroupsQuery(
    executor,
    request,
  ).execute();

  return serializePublicObjectCatalogPage(rows, locale, request);
}

export function buildPublicObjectCatalogGroupsQuery(
  executor: QueryExecutor,
  request: PublicObjectCatalogRequest,
) {
  const firstMedia = buildFirstProcessedMediaPerEntryQuery(executor);
  const identityState = publicObjectCatalogIdentityStateExpression();
  const groupKey = publicObjectCatalogGroupKeyExpression();
  const identityName = publicObjectCatalogIdentityNameExpression();
  const catalogKind = publicObjectCatalogKindExpression();
  const catalogPublicSlug = publicObjectCatalogPublicSlugExpression();
  const catalogStatus = publicObjectCatalogStatusExpression();
  const objectCount = sql<number>`count(distinct ${sql.ref("plant_objects.id")})`;
  const journalCount = sql<number>`count(distinct ${sql.ref("journal_entries.id")})`;
  const latestOrder = sql`order by ${sql.ref("journal_entries.published_at")} desc, ${sql.ref("journal_entries.id")} asc`;

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
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin(firstMedia, (join) =>
      join
        .onRef("first_public_media.journalEntryId", "=", "journal_entries.id")
        .onRef(
          "first_public_media.ownerUserId",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      groupKey.as("groupKey"),
      "plant_objects.object_kind as objectKind",
      identityState.as("identityState"),
      sql<
        string | null
      >`case when ${identityState} in ('catalog', 'unavailable') then ${sql.ref("catalog_items.id")} else null end`.as(
        "catalogItemId",
      ),
      catalogKind.as("catalogKind"),
      identityName.as("identityName"),
      catalogPublicSlug.as("catalogPublicSlug"),
      catalogStatus.as("catalogStatus"),
      objectCount.as("objectCount"),
      journalCount.as("journalCount"),
      sql<string>`(array_agg(${sql.ref("plant_objects.id")} ${latestOrder}))[1]`.as(
        "representativeObjectId",
      ),
      sql<string>`(array_agg(${sql.ref("plant_objects.display_name")} ${latestOrder}))[1]`.as(
        "representativeObjectName",
      ),
      sql<string>`(array_agg(${sql.ref("journal_entries.title")} ${latestOrder}))[1]`.as(
        "latestEntryTitle",
      ),
      sql<string>`(array_agg(${sql.ref("journal_entries.public_slug")} ${latestOrder}))[1]`.as(
        "latestEntryPublicSlug",
      ),
      sql<
        Date | string
      >`(array_agg(${sql.ref("journal_entries.entry_date")} ${latestOrder}))[1]`.as(
        "latestEntryDate",
      ),
      sql<
        string | null
      >`(array_remove(array_agg(${sql.ref("first_public_media.derivativeKey")} ${latestOrder}), null))[1]`.as(
        "mediaDerivativeKey",
      ),
      sql<number>`count(*) over()`.as("totalCount"),
    ])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .groupBy([
      groupKey,
      "plant_objects.object_kind",
      identityState,
      "catalog_items.id",
      catalogKind,
      identityName,
      catalogPublicSlug,
      catalogStatus,
    ]);

  if (request.kind !== "all") {
    query = query.where("plant_objects.object_kind", "=", request.kind);
  }

  if (
    request.identity === "plant_variety" ||
    request.identity === "species" ||
    request.identity === "breed"
  ) {
    query = query
      .where(identityState, "=", "catalog")
      .where("catalog_items.catalog_kind", "=", request.identity);
  } else if (request.identity !== "all") {
    query = query.where(identityState, "=", request.identity);
  }

  if (request.query) {
    const pattern = `%${request.query}%`;
    query = query.where(({ eb, exists, or, selectFrom }) =>
      or([
        eb("plant_objects.display_name", "ilike", pattern),
        eb("plant_objects.variety_text", "ilike", pattern),
        eb("catalog_items.canonical_name", "ilike", pattern),
        exists(
          selectFrom("catalog_item_names")
            .select(sql<number>`1`.as("match"))
            .whereRef(
              "catalog_item_names.catalog_item_id",
              "=",
              "catalog_items.id",
            )
            .where("catalog_item_names.display_name", "ilike", pattern),
        ),
      ]),
    );
  }

  return query
    .orderBy(journalCount, "desc")
    .orderBy(sql<string>`lower(coalesce(${identityName}, ''))`, "asc")
    .orderBy(groupKey, "asc")
    .limit(PUBLIC_OBJECT_CATALOG_PAGE_SIZE + 1)
    .offset((request.page - 1) * PUBLIC_OBJECT_CATALOG_PAGE_SIZE)
    .$castTo<PublicObjectCatalogGroupRow>();
}

export function serializePublicObjectCatalogPage(
  rows: PublicObjectCatalogGroupRow[],
  _locale: PublicLocale,
  request: PublicObjectCatalogRequest,
  pageSize = PUBLIC_OBJECT_CATALOG_PAGE_SIZE,
  publicMediaUrl: (derivativeKey: string) => string = getPublicDerivativeUrl,
): PublicObjectCatalogPage {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  const visibleRows = rows.slice(0, normalizedPageSize);
  const totalCount = Number(rows[0]?.totalCount ?? 0);
  const cards = visibleRows.map((row) =>
    serializePublicObjectCatalogCard(row, publicMediaUrl),
  );

  return {
    request,
    cards,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / normalizedPageSize)),
    hasPreviousPage: request.page > 1,
    hasNextPage:
      rows.length > normalizedPageSize ||
      request.page * normalizedPageSize < totalCount,
  };
}

function serializePublicObjectCatalogCard(
  row: PublicObjectCatalogGroupRow,
  publicMediaUrl: (derivativeKey: string) => string,
): PublicObjectCatalogCard {
  const objectKind = normalizePublicObjectKind(row.objectKind);
  const rawIdentityState = normalizePublicIdentityState(row.identityState);
  const provisionalIdentityName =
    rawIdentityState === "provisional"
      ? normalizeSafePublicIdentityName(row.identityName)
      : null;
  const identityState =
    rawIdentityState === "provisional" && !provisionalIdentityName
      ? "unknown"
      : rawIdentityState;
  const catalogKind =
    identityState === "catalog"
      ? normalizePublicCatalogKind(row.catalogKind)
      : null;
  const catalogStatus =
    identityState === "catalog"
      ? normalizeSelectableCatalogStatus(row.catalogStatus)
      : null;
  const identityName =
    identityState === "catalog"
      ? normalizeCatalogIdentityName(row.identityName)
      : identityState === "provisional"
        ? provisionalIdentityName
        : null;
  const catalogPath =
    identityState === "catalog" &&
    catalogKind &&
    catalogStatus &&
    row.catalogPublicSlug
      ? publicCatalogEvidencePath(catalogKind, row.catalogPublicSlug)
      : null;

  return {
    key: row.groupKey,
    objectKind,
    identityState,
    identityName,
    catalogKind,
    catalogStatus,
    catalogPath,
    objectCount: Number(row.objectCount),
    journalCount: Number(row.journalCount),
    representativeObject: {
      displayName: row.representativeObjectName,
      path: publicLineageObjectPath(row.representativeObjectId),
    },
    latestJournal: {
      title: row.latestEntryTitle,
      path: publicJournalEntryPath(row.latestEntryPublicSlug),
      entryDate: row.latestEntryDate,
    },
    mediaPublicUrl: row.mediaDerivativeKey
      ? publicMediaUrl(row.mediaDerivativeKey)
      : null,
  };
}

function publicObjectCatalogIdentityStateExpression(): RawBuilder<PublicObjectCatalogIdentityState> {
  return sql<PublicObjectCatalogIdentityState>`case
    when ${sql.ref("plant_objects.variety_state")} = 'selected'
      and ${sql.ref("catalog_items.id")} is not null
      and ${sql.ref("catalog_items.status")} in ('seeded', 'confirmed')
      then 'catalog'
    when ${sql.ref("plant_objects.variety_state")} = 'selected'
      and ${sql.ref("catalog_items.id")} is not null
      then 'unavailable'
    when ${sql.ref("plant_objects.variety_state")} in ('user_added', 'free_text')
      and nullif(trim(${sql.ref("plant_objects.variety_text")}), '') is not null
      then 'provisional'
    else 'unknown'
  end`;
}

function publicObjectCatalogGroupKeyExpression(): RawBuilder<string> {
  const state = publicObjectCatalogIdentityStateExpression();
  return sql<string>`case
    when ${state} = 'catalog' then 'catalog:' || ${sql.ref("catalog_items.id")}::text
    when ${state} = 'unavailable' then 'unavailable:' || ${sql.ref("catalog_items.id")}::text
    when ${state} = 'provisional' then 'provisional:' || ${sql.ref("plant_objects.object_kind")} || ':' || lower(trim(${sql.ref("plant_objects.variety_text")}))
    else 'unknown:' || ${sql.ref("plant_objects.object_kind")}
  end`;
}

function publicObjectCatalogIdentityNameExpression(): RawBuilder<
  string | null
> {
  const state = publicObjectCatalogIdentityStateExpression();
  return sql<string | null>`case
    when ${state} = 'catalog' then ${sql.ref("catalog_items.canonical_name")}
    when ${state} = 'provisional' then ${sql.ref("plant_objects.variety_text")}
    else null
  end`;
}

function publicObjectCatalogKindExpression(): RawBuilder<string | null> {
  const state = publicObjectCatalogIdentityStateExpression();
  return sql<
    string | null
  >`case when ${state} = 'catalog' then ${sql.ref("catalog_items.catalog_kind")} else null end`;
}

function publicObjectCatalogPublicSlugExpression(): RawBuilder<string | null> {
  const state = publicObjectCatalogIdentityStateExpression();
  return sql<
    string | null
  >`case when ${state} = 'catalog' then ${sql.ref("catalog_items.public_slug")} else null end`;
}

function publicObjectCatalogStatusExpression(): RawBuilder<string | null> {
  const state = publicObjectCatalogIdentityStateExpression();
  return sql<
    string | null
  >`case when ${state} = 'catalog' then ${sql.ref("catalog_items.status")} else null end`;
}

function normalizeFilterValue(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  return value.trim().toLocaleLowerCase("en");
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? undefined : value;
}

function normalizePublicObjectCatalogQuery(value: string | undefined) {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PUBLIC_OBJECT_CATALOG_QUERY_LENGTH);
}

function normalizePublicObjectCatalogPage(value: string | undefined) {
  if (!value || !/^\d{1,12}$/.test(value)) return 1;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PUBLIC_OBJECT_CATALOG_PAGE);
}

function isPublicObjectCatalogKind(
  value: string,
): value is PublicObjectCatalogKind {
  return (
    value === "all" ||
    value === "plant" ||
    value === "animal" ||
    value === "animal"
  );
}

function isPublicObjectCatalogIdentityFilter(
  value: string,
): value is PublicObjectCatalogIdentityFilter {
  return (
    value === "all" ||
    value === "plant_variety" ||
    value === "species" ||
    value === "breed" ||
    value === "provisional" ||
    value === "unknown" ||
    value === "unavailable"
  );
}

function normalizePublicObjectKind(value: string): PlantObjectKind {
  if (value === "plant" || value === "animal") {
    return value;
  }
  throw new Error(`Unsupported public object kind: ${value}`);
}

function normalizePublicIdentityState(
  value: string,
): PublicObjectCatalogIdentityState {
  if (
    value === "catalog" ||
    value === "provisional" ||
    value === "unknown" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unknown";
}

function normalizePublicCatalogKind(value: string | null): CatalogKind | null {
  if (value === "plant_variety" || value === "species" || value === "breed") {
    return value;
  }
  return null;
}

function normalizeSelectableCatalogStatus(
  value: string | null,
): Extract<CatalogItemStatus, "seeded" | "confirmed"> | null {
  return SELECTABLE_PUBLIC_CATALOG_STATUSES.includes(
    value as (typeof SELECTABLE_PUBLIC_CATALOG_STATUSES)[number],
  )
    ? (value as Extract<CatalogItemStatus, "seeded" | "confirmed">)
    : null;
}

function normalizeCatalogIdentityName(value: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized.slice(0, 120) : null;
}

function normalizeSafePublicIdentityName(value: string | null) {
  const normalized = normalizeCatalogIdentityName(value);
  if (!normalized || UNSAFE_PUBLIC_IDENTITY_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}
