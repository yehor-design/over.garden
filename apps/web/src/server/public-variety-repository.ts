import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogItemStatus,
  Database,
  LocationVisibility,
  VarietyState,
} from "@/db/schema";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";

const MAX_CATALOG_PUBLIC_SLUG_LENGTH = 96;
const MAX_PUBLIC_VARIETY_ENTRIES = 20;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicVarietyPage {
  catalog: {
    canonicalName: string;
    publicSlug: string;
    status: Extract<CatalogItemStatus, "seeded" | "confirmed">;
    source: string;
    locale: string;
  };
  entryCount: number;
  photoCount: number;
  entries: PublicVarietyEntry[];
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
  executor: QueryExecutor = db,
): Promise<PublicVarietyPage | null> {
  const slug = normalizeCatalogPublicSlug(publicSlug);
  if (!slug) return null;

  const summary = await buildPublicVarietySummaryQuery(
    executor,
    slug,
  ).executeTakeFirst();

  if (!summary?.catalogPublicSlug) return null;

  const entries = await buildPublicVarietyEntriesQuery(
    executor,
    slug,
  ).execute();

  return {
    catalog: {
      canonicalName: summary.catalogCanonicalName,
      publicSlug: summary.catalogPublicSlug,
      status: summary.catalogStatus as Extract<
        CatalogItemStatus,
        "seeded" | "confirmed"
      >,
      source: summary.catalogSource,
      locale: summary.catalogLocale,
    },
    entryCount: Number(summary.entryCount),
    photoCount: Number(summary.photoCount),
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

export function buildPublicVarietySummaryQuery(
  executor: QueryExecutor,
  publicSlug: string,
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
    .leftJoin("media_assets", (join) =>
      join
        .onRef("media_assets.journal_entry_id", "=", "journal_entries.id")
        .on("media_assets.status", "=", "processed")
        .on("media_assets.derivative_key", "is not", null),
    )
    .select(({ fn }) => [
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
      "catalog_items.locale as catalogLocale",
      fn.count<number>("journal_entries.id").as("entryCount"),
      fn.count<number>("media_assets.id").as("photoCount"),
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
      "catalog_items.public_slug",
      "catalog_items.status",
      "catalog_items.source",
      "catalog_items.locale",
    ]);
}

export function buildPublicVarietyEntriesQuery(
  executor: QueryExecutor,
  publicSlug: string,
  limit = MAX_PUBLIC_VARIETY_ENTRIES,
) {
  return executor
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
    .leftJoin("media_assets", (join) =>
      join
        .onRef("media_assets.journal_entry_id", "=", "journal_entries.id")
        .on("media_assets.status", "=", "processed")
        .on("media_assets.derivative_key", "is not", null),
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
      "media_assets.id as mediaId",
      "media_assets.derivative_key as mediaDerivativeKey",
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
