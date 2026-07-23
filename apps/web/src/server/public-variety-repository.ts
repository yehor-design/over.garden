import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  CatalogItemStatus,
  Database,
  LocationVisibility,
  VarietyState,
} from "@/db/schema";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import {
  evaluatePublicVarietyIndexState,
  PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
  type PublicVarietyIndexState,
} from "@/server/public-variety-indexing";
import { buildFirstProcessedMediaPerEntryQuery } from "@/server/public-media-repository";
import {
  buildPublishedVarietySeedProofByCatalogItemIdQuery,
  type PublicVarietySeedProof,
} from "@/server/variety-seed-proof-repository";

const MAX_CATALOG_PUBLIC_SLUG_LENGTH = 96;
const MAX_PUBLIC_VARIETY_ENTRIES = 20;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicVarietyPage {
  catalog: {
    catalogKind: CatalogKind;
    canonicalName: string;
    publicSlug: string;
    status: Extract<CatalogItemStatus, "seeded" | "confirmed">;
    source: string;
    locale: string;
  };
  entryCount: number;
  photoCount: number;
  aggregateBodyLength: number;
  indexState: PublicVarietyIndexState;
  seedProof: PublicVarietySeedProof | null;
  sourceCredits: PublicCatalogSourceCredit[];
  entries: PublicVarietyEntry[];
}

export interface PublicVarietySitemapEntry {
  catalogKind: CatalogKind;
  publicSlug: string;
  lastModified: Date | string;
  entryCount: number;
  aggregateBodyLength: number;
}

export interface PublicCatalogSourceCredit {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
}

export interface PublicVarietyEntry {
  id: string;
  title: string;
  body: string;
  entryDate: Date | string;
  publicPath: string;
  plantObjectDisplayName: string;
  varietyText: string | null;
  safeLocationLabel: string | null;
  media: {
    id: string;
    derivativeKey: string;
    publicUrl: string;
  } | null;
}

export async function getPublicVarietyPage(
  publicSlug: string,
  expectedCatalogKind?: CatalogKind,
  executor: QueryExecutor = db,
): Promise<PublicVarietyPage | null> {
  const slug = normalizeCatalogPublicSlug(publicSlug);
  if (!slug) return null;

  const summary = await buildPublicVarietySummaryQuery(
    executor,
    slug,
    expectedCatalogKind,
  ).executeTakeFirst();

  if (!summary?.catalogPublicSlug) return null;

  const [entries, seedProof, sourceCredits] = await Promise.all([
    buildPublicVarietyEntriesQuery(
      executor,
      slug,
      MAX_PUBLIC_VARIETY_ENTRIES,
      expectedCatalogKind,
    ).execute(),
    buildPublishedVarietySeedProofByCatalogItemIdQuery(
      executor,
      summary.catalogItemId,
    ).executeTakeFirst(),
    buildPublicVarietySourceCreditsQuery(
      executor,
      summary.catalogItemId,
    ).execute(),
  ]);
  const entryCount = Number(summary.entryCount);
  const aggregateBodyLength = Number(summary.aggregateBodyLength);

  return {
    catalog: {
      catalogKind: summary.catalogKind,
      canonicalName: summary.catalogCanonicalName,
      publicSlug: summary.catalogPublicSlug,
      status: summary.catalogStatus as Extract<
        CatalogItemStatus,
        "seeded" | "confirmed"
      >,
      source: summary.catalogSource,
      locale: summary.catalogLocale,
    },
    entryCount,
    photoCount: Number(summary.photoCount),
    aggregateBodyLength,
    indexState: evaluatePublicVarietyIndexState({
      entryCount,
      aggregateBodyLength,
      catalogStatus: summary.catalogStatus,
      catalogSource: summary.catalogSource,
    }),
    seedProof: seedProof ?? null,
    sourceCredits: sourceCredits.map((credit) => ({
      sourceSlug: credit.sourceSlug,
      sourceName: credit.sourceName,
      sourceVersion: credit.sourceVersion,
      sourceUrl: credit.sourceUrl,
      license: credit.license,
      licenseUrl: credit.licenseUrl,
      attributionRequired: Boolean(credit.attributionRequired),
      attributionText: credit.attributionText,
    })),
    entries: entries.map((entry) => ({
      id: entry.entryId,
      title: entry.entryTitle,
      body: entry.entryBody,
      entryDate: entry.entryDate,
      publicPath: publicJournalEntryPath(entry.entryPublicSlug),
      plantObjectDisplayName: entry.objectDisplayName,
      varietyText: entry.varietyText,
      safeLocationLabel: getPublicLocationLabel(entry),
      media:
        entry.mediaDerivativeKey && entry.mediaId
          ? {
              id: entry.mediaId,
              derivativeKey: entry.mediaDerivativeKey,
              publicUrl: getPublicDerivativeUrl(entry.mediaDerivativeKey),
            }
          : null,
    })),
  };
}

export function buildPublicVarietySourceCreditsQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_source_links")
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
      "catalog_source_links.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.license as license",
      "catalog_source_snapshots.license_url as licenseUrl",
      "catalog_source_snapshots.attribution_required as attributionRequired",
      "catalog_source_snapshots.attribution_text as attributionText",
    ])
    .where("catalog_source_links.catalog_item_id", "=", catalogItemId)
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .where("catalog_source_records.projection_status", "=", "projected")
    .where("catalog_source_snapshots.attribution_required", "=", true)
    .groupBy([
      "catalog_source_links.source_slug",
      "catalog_source_snapshots.source_name",
      "catalog_source_snapshots.source_version",
      "catalog_source_snapshots.source_url",
      "catalog_source_snapshots.license",
      "catalog_source_snapshots.license_url",
      "catalog_source_snapshots.attribution_required",
      "catalog_source_snapshots.attribution_text",
    ])
    .orderBy("catalog_source_snapshots.source_name", "asc")
    .orderBy("catalog_source_snapshots.source_version", "asc");
}

export async function listIndexablePublicVarietySitemapEntries(
  executor: QueryExecutor = db,
): Promise<PublicVarietySitemapEntry[]> {
  const rows =
    await buildIndexablePublicVarietySitemapRowsQuery(executor).execute();

  return rows.map((row) => ({
    catalogKind: row.catalogKind,
    publicSlug: row.publicSlug,
    lastModified: row.lastModified,
    entryCount: Number(row.entryCount),
    aggregateBodyLength: Number(row.aggregateBodyLength),
  }));
}

export function buildPublicVarietySummaryQuery(
  executor: QueryExecutor,
  publicSlug: string,
  expectedCatalogKind?: CatalogKind,
) {
  let query = executor
    .selectFrom("catalog_items")
    .innerJoin(
      "plant_objects",
      "plant_objects.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.plant_object_id",
      "plant_objects.id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .select(({ fn }) => [
      "catalog_items.id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
      "catalog_items.locale as catalogLocale",
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`coalesce(sum((
        select count(*)
        from media_assets as public_media
        where public_media.journal_entry_id = ${sql.ref("journal_entries.id")}
          and public_media.owner_user_id = ${sql.ref("journal_entries.owner_user_id")}
          and public_media.status = 'processed'
          and public_media.derivative_key is not null
          and public_media.revoked_at is null
      )), 0)`.as("photoCount"),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
    ])
    .where("catalog_items.public_slug", "=", publicSlug)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .groupBy([
      "catalog_items.canonical_name",
      "catalog_items.id",
      "catalog_items.public_slug",
      "catalog_items.status",
      "catalog_items.source",
      "catalog_items.locale",
      "catalog_items.catalog_kind",
    ]);

  if (expectedCatalogKind) {
    query = query.where("catalog_items.catalog_kind", "=", expectedCatalogKind);
  }

  return query.$narrowType<{ catalogKind: CatalogKind }>();
}

export function buildIndexablePublicVarietySitemapRowsQuery(
  executor: QueryExecutor,
) {
  return executor
    .selectFrom("catalog_items")
    .innerJoin(
      "plant_objects",
      "plant_objects.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.plant_object_id",
      "plant_objects.id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .select(({ fn }) => [
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.public_slug as publicSlug",
      fn.max<Date | string>("journal_entries.updated_at").as("lastModified"),
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
    ])
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where(({ eb, or }) =>
      or([
        eb("catalog_items.status", "=", "confirmed"),
        eb.and([
          eb("catalog_items.status", "=", "seeded"),
          eb("catalog_items.source", "in", [
            ...PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.trustedSeededCatalogSources,
          ]),
        ]),
      ]),
    )
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .groupBy(["catalog_items.catalog_kind", "catalog_items.public_slug"])
    .having(
      sql<boolean>`count(${sql.ref("journal_entries.id")}) >= ${PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minPublicEntryCount}`,
    )
    .having(
      sql<boolean>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0) >= ${PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minAggregateBodyLength}`,
    )
    .orderBy("catalog_items.public_slug", "asc")
    .$narrowType<{ catalogKind: CatalogKind; publicSlug: string }>();
}

export function buildPublicVarietyEntriesQuery(
  executor: QueryExecutor,
  publicSlug: string,
  limit = MAX_PUBLIC_VARIETY_ENTRIES,
  expectedCatalogKind?: CatalogKind,
) {
  const firstMedia = buildFirstProcessedMediaPerEntryQuery(executor);

  let query = executor
    .selectFrom("journal_entries")
    .innerJoin(
      "plant_objects",
      "plant_objects.id",
      "journal_entries.plant_object_id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "plant_objects.catalog_item_id",
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
      "journal_entries.id as entryId",
      "journal_entries.title as entryTitle",
      "journal_entries.body as entryBody",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as entryPublicSlug",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
      "first_public_media.mediaId as mediaId",
      "first_public_media.derivativeKey as mediaDerivativeKey",
    ])
    .where("catalog_items.public_slug", "=", publicSlug)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null);

  if (expectedCatalogKind) {
    query = query.where("catalog_items.catalog_kind", "=", expectedCatalogKind);
  }

  return query
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizePublicVarietyLimit(limit))
    .$narrowType<{ entryPublicSlug: string }>();
}

function getPublicLocationLabel(row: {
  varietyState: VarietyState | string;
  objectLocationVisibility: LocationVisibility | string;
  objectCoarseRegionCode: string | null;
  spaceLocationVisibility: LocationVisibility | string;
  spaceCoarseRegionCode: string | null;
}) {
  if (row.varietyState !== "selected") return null;
  if (row.objectLocationVisibility !== "region") return null;

  const code =
    row.objectCoarseRegionCode ??
    (row.spaceLocationVisibility === "region"
      ? row.spaceCoarseRegionCode
      : null);
  const label = getCoarseRegionLabel(code);

  return label ? `Region: ${label}` : null;
}

function normalizeCatalogPublicSlug(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_CATALOG_PUBLIC_SLUG_LENGTH) {
    return null;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function normalizePublicVarietyLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_VARIETY_ENTRIES;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PUBLIC_VARIETY_ENTRIES);
}
