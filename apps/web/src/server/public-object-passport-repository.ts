import "server-only";

import { type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LocationVisibility,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  publicJournalEntryPath,
  publicProfilePath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import { buildFirstProcessedMediaPerEntryQuery } from "@/server/public-media-repository";

const PUBLIC_OBJECT_JOURNAL_PREVIEW_PAGE_SIZE = 5;
const MAX_PUBLIC_OBJECT_JOURNAL_PREVIEW = 40;
const MAX_PUBLIC_OBJECT_GALLERY_MEDIA = 6;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicObjectPassportPage {
  object: {
    plantObjectId: string;
    displayName: string;
    objectKind: PlantObjectKind;
    varietyText: string | null;
    varietyState: VarietyState;
    catalogKind: CatalogKind | null;
    catalogCanonicalName: string | null;
    catalogPublicSlug: string | null;
    catalogPath: string | null;
    safeLocationLabel: string | null;
    publicEntryCount: number;
    firstEntryDate: Date | string;
    latestEntryDate: Date | string;
  };
  author: {
    handle: string;
    mention: string;
    displayName: string;
    avatarUrl: string | null;
    profilePath: string;
  } | null;
  journalPreview: PublicObjectPassportJournalEntry[];
  journalContinuation: PublicObjectPassportJournalEntry[];
  coverMediaPublicUrl: string | null;
  galleryMediaPublicUrls: string[];
  timelineHasMore: boolean;
}

export type PublicObjectPassportLookup =
  | { status: "active"; page: PublicObjectPassportPage }
  | { status: "gone"; plantObjectId: string }
  | { status: "not_found" };

export interface PublicObjectPassportJournalEntry {
  id: string;
  title: string;
  bodyPreview: string;
  entryDate: Date | string;
  publicSlug: string;
  publicPath: string;
  mediaPublicUrl: string | null;
}

interface PublicObjectPassportRootRow {
  plantObjectId: string;
  displayName: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogKind: string | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  objectLocationVisibility: string;
  objectCoarseRegionCode: string | null;
  spaceLocationVisibility: string;
  spaceCoarseRegionCode: string | null;
  publicEntryCount: number | string | bigint;
  firstEntryDate: Date | string;
  latestEntryDate: Date | string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

interface PublicObjectPassportTimelineRow {
  entryId: string;
  entryTitle: string;
  entryBody: string;
  entryDate: Date | string;
  entryPublicSlug: string;
  mediaDerivativeKey: string | null;
}

interface PublicObjectPassportGalleryRow {
  mediaId: string;
  mediaDerivativeKey: string;
}

interface PublicObjectPassportLifecycleRow {
  plantObjectId: string;
  publicAnchorCount: number | string | bigint;
  activePublicCount: number | string | bigint;
  gonePublicCount: number | string | bigint;
}

export async function getPublicObjectPassportPage(
  plantObjectId: string,
  executor: QueryExecutor = db,
): Promise<PublicObjectPassportPage | null> {
  const lookup = await getPublicObjectPassportLookup(plantObjectId, executor);
  return lookup.status === "active" ? lookup.page : null;
}

export async function getPublicObjectPassportLookup(
  plantObjectId: string,
  executor: QueryExecutor = db,
): Promise<PublicObjectPassportLookup> {
  const normalizedPlantObjectId =
    normalizePublicObjectPassportId(plantObjectId);
  if (!normalizedPlantObjectId) return { status: "not_found" };

  const root = await buildPublicObjectPassportRootQuery(
    executor,
    normalizedPlantObjectId,
  ).executeTakeFirst();

  if (!root) {
    const lifecycle = await buildPublicObjectPassportLifecycleQuery(
      executor,
      normalizedPlantObjectId,
    ).executeTakeFirst();
    if (
      lifecycle &&
      classifyPublicObjectPassportLifecycle(lifecycle) === "gone"
    ) {
      return { status: "gone", plantObjectId: lifecycle.plantObjectId };
    }

    return { status: "not_found" };
  }

  const [journalRows, galleryRows] = await Promise.all([
    buildPublicObjectPassportTimelineQuery(
      executor,
      normalizedPlantObjectId,
    ).execute(),
    buildPublicObjectPassportGalleryQuery(
      executor,
      normalizedPlantObjectId,
    ).execute(),
  ]);

  return {
    status: "active",
    page: serializePublicObjectPassportPage(root, journalRows, galleryRows),
  };
}

export function classifyPublicObjectPassportLifecycle(
  lifecycle: PublicObjectPassportLifecycleRow,
): "gone" | "not_found" {
  return Number(lifecycle.publicAnchorCount) > 0 &&
    Number(lifecycle.activePublicCount) === 0 &&
    Number(lifecycle.gonePublicCount) > 0
    ? "gone"
    : "not_found";
}

export function buildPublicObjectPassportLifecycleQuery(
  executor: QueryExecutor,
  plantObjectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        ),
    )
    .select([
      "plant_objects.id as plantObjectId",
      (eb) =>
        eb.fn
          .count<number>("journal_entries.id")
          .filterWhere("journal_entries.public_slug", "is not", null)
          .as("publicAnchorCount"),
      (eb) =>
        eb.fn
          .count<number>("journal_entries.id")
          .filterWhere("journal_entries.public_slug", "is not", null)
          .filterWhere("journal_entries.visibility", "=", "public")
          .filterWhere("journal_entries.lifecycle_state", "=", "active")
          .filterWhere("journal_entries.public_gone_at", "is", null)
          .as("activePublicCount"),
      (eb) =>
        eb.fn
          .count<number>("journal_entries.id")
          .filterWhere("journal_entries.public_slug", "is not", null)
          .filterWhere((gone) =>
            gone.or([
              gone("journal_entries.public_gone_at", "is not", null),
              gone("journal_entries.lifecycle_state", "=", "archived"),
              gone("journal_entries.visibility", "!=", "public"),
            ]),
          )
          .as("gonePublicCount"),
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .groupBy("plant_objects.id");
}

export function buildPublicObjectPassportRootQuery(
  executor: QueryExecutor,
  plantObjectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries as public_entries", (join) =>
      join
        .onRef("public_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "public_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("public_entries.visibility", "=", "public")
        .on("public_entries.lifecycle_state", "=", "active")
        .on("public_entries.public_gone_at", "is", null)
        .on("public_entries.public_slug", "is not", null),
    )
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "plant_objects.space_id")
        .onRef("spaces.owner_user_id", "=", "plant_objects.owner_user_id"),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "plant_objects.owner_user_id",
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
    .select(({ fn }) => [
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      "user_public_profiles.avatar_url as authorAvatarUrl",
      fn.count<number>("public_entries.id").as("publicEntryCount"),
      fn.min<Date | string>("public_entries.entry_date").as("firstEntryDate"),
      fn.max<Date | string>("public_entries.entry_date").as("latestEntryDate"),
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .groupBy([
      "plant_objects.id",
      "plant_objects.display_name",
      "plant_objects.object_kind",
      "plant_objects.variety_text",
      "plant_objects.variety_state",
      "plant_objects.location_visibility",
      "plant_objects.coarse_region_code",
      "spaces.location_visibility",
      "spaces.coarse_region_code",
      "catalog_items.catalog_kind",
      "catalog_items.canonical_name",
      "catalog_items.public_slug",
      "user_public_profiles.handle",
      "user_public_profiles.display_name",
      "user_public_profiles.avatar_url",
    ]);
}

export function buildPublicObjectPassportTimelineQuery(
  executor: QueryExecutor,
  plantObjectId: string,
  limit = MAX_PUBLIC_OBJECT_JOURNAL_PREVIEW,
) {
  const firstMedia = buildFirstProcessedMediaPerEntryQuery(executor);

  return executor
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
      "first_public_media.derivativeKey as mediaDerivativeKey",
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizePublicObjectPassportLimit(limit))
    .$narrowType<{ entryPublicSlug: string }>();
}

export function buildPublicObjectPassportGalleryQuery(
  executor: QueryExecutor,
  plantObjectId: string,
  limit = MAX_PUBLIC_OBJECT_GALLERY_MEDIA,
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.id", "=", "media_assets.journal_entry_id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "media_assets.owner_user_id",
        ),
    )
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      "media_assets.id as mediaId",
      "media_assets.derivative_key as mediaDerivativeKey",
    ])
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .where("plant_objects.id", "=", plantObjectId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("media_assets.created_at", "asc")
    .orderBy("media_assets.id", "asc")
    .limit(normalizePublicObjectGalleryLimit(limit))
    .$narrowType<{ mediaDerivativeKey: string }>();
}

export function serializePublicObjectPassportPage(
  root: PublicObjectPassportRootRow,
  journalRows: PublicObjectPassportTimelineRow[],
  galleryRows: PublicObjectPassportGalleryRow[] = [],
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicObjectPassportPage {
  const serializedJournal = journalRows.map((entry) => ({
    id: entry.entryId,
    title: entry.entryTitle,
    bodyPreview: publicJournalBodyPreview(entry.entryBody),
    entryDate: entry.entryDate,
    publicSlug: entry.entryPublicSlug,
    publicPath: publicJournalEntryPath(entry.entryPublicSlug),
    mediaPublicUrl: entry.mediaDerivativeKey
      ? getPublicDerivativeUrl(entry.mediaDerivativeKey)
      : null,
  }));
  const journalPreview = serializedJournal.slice(
    0,
    PUBLIC_OBJECT_JOURNAL_PREVIEW_PAGE_SIZE,
  );
  const journalContinuation = serializedJournal.slice(
    PUBLIC_OBJECT_JOURNAL_PREVIEW_PAGE_SIZE,
    MAX_PUBLIC_OBJECT_JOURNAL_PREVIEW,
  );
  const catalogPath = root.catalogPublicSlug
    ? publicVarietyPath(root.catalogPublicSlug)
    : null;
  const author = root.authorHandle
    ? {
        handle: root.authorHandle,
        mention: `@${root.authorHandle}`,
        displayName: root.authorDisplayName ?? `@${root.authorHandle}`,
        avatarUrl: root.authorAvatarUrl,
        profilePath: publicProfilePath(locale, root.authorHandle),
      }
    : null;
  const galleryMediaPublicUrls = galleryRows.map((media) =>
    getPublicDerivativeUrl(media.mediaDerivativeKey),
  );

  return {
    object: {
      plantObjectId: root.plantObjectId,
      displayName: root.displayName,
      objectKind: root.objectKind as PlantObjectKind,
      varietyText: root.varietyText,
      varietyState: root.varietyState as VarietyState,
      catalogKind: root.catalogKind as CatalogKind | null,
      catalogCanonicalName: root.catalogCanonicalName,
      catalogPublicSlug: root.catalogPublicSlug,
      catalogPath,
      safeLocationLabel: publicObjectPassportLocationLabel({
        objectLocationVisibility: root.objectLocationVisibility,
        objectCoarseRegionCode: root.objectCoarseRegionCode,
        spaceLocationVisibility: root.spaceLocationVisibility,
        spaceCoarseRegionCode: root.spaceCoarseRegionCode,
      }),
      publicEntryCount: Number(root.publicEntryCount),
      firstEntryDate: root.firstEntryDate,
      latestEntryDate: root.latestEntryDate,
    },
    author,
    journalPreview,
    journalContinuation,
    coverMediaPublicUrl:
      galleryMediaPublicUrls[0] ??
      serializedJournal.find((entry) => entry.mediaPublicUrl)?.mediaPublicUrl ??
      null,
    galleryMediaPublicUrls,
    timelineHasMore: Number(root.publicEntryCount) > serializedJournal.length,
  };
}

export function publicObjectPassportLocationLabel(input: {
  objectLocationVisibility: LocationVisibility | string;
  objectCoarseRegionCode: string | null;
  spaceLocationVisibility: LocationVisibility | string;
  spaceCoarseRegionCode: string | null;
}) {
  if (input.objectLocationVisibility !== "region") return null;

  const code =
    input.objectCoarseRegionCode ??
    (input.spaceLocationVisibility === "region"
      ? input.spaceCoarseRegionCode
      : null);
  const label = getCoarseRegionLabel(code);

  return label ? `Region: ${label}` : null;
}

function publicJournalBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;

  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function normalizePublicObjectPassportLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_OBJECT_JOURNAL_PREVIEW;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_PUBLIC_OBJECT_JOURNAL_PREVIEW,
  );
}

function normalizePublicObjectGalleryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_OBJECT_GALLERY_MEDIA;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_PUBLIC_OBJECT_GALLERY_MEDIA,
  );
}

function normalizePublicObjectPassportId(value: string) {
  const normalized = value.trim();
  if (normalized.length > 80) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : null;
}
