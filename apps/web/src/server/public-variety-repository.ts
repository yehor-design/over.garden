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
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import {
  localizedPublicJournalEvidencePath,
  publicCatalogEvidencePath,
} from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { publicCatalogPermalinkPath } from "@/lib/catalog/addresses";
import { localizedPath, PUBLIC_LOCALES } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { readMediaVariantExtras } from "@/server/media/media-variant-schema";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import {
  buildCatalogSlugHistoryLookupQuery,
  readPublicCatalogCanonicalAddress,
} from "@/server/public-catalog-address-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import { publicMediaEligibilityPredicate } from "@/server/media/public-media-eligibility";
import type { PublicSurfaceIndexState } from "@/server/public-surface-indexing-policy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoveryConsumerId,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildFirstProcessedMediaPerEntryQuery } from "@/server/public-media-repository";
import {
  buildPublishedVarietySeedProofByCatalogItemIdQuery,
  type PublicVarietySeedProof,
} from "@/server/variety-seed-proof-repository";

const MAX_CATALOG_PUBLIC_SLUG_LENGTH = 96;
const MAX_PUBLIC_VARIETY_ENTRIES = 20;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicVarietyPageIdentifier {
  scheme: string;
  value: string;
}

export interface PublicVarietyPage {
  catalog: {
    catalogItemId: string;
    catalogKind: CatalogKind;
    nodeKind: string;
    rank: string | null;
    canonicalName: string;
    /** The accepted scientific name without authorship when a name row says so. */
    scientificName: string;
    publicSlug: string;
    /** The current slug of the species a form belongs to, for its address. */
    speciesSlug: string | null;
    species: { canonicalName: string; publicSlug: string } | null;
    /** The hierarchical address (ADR-0026 D8) and the permalink `/id/{uuid}`. */
    canonicalPath: string;
    permalinkPath: string;
    contentUpdatedAt: Date | string;
    identifiers: PublicVarietyPageIdentifier[];
    status: Extract<CatalogItemStatus, "seeded" | "confirmed">;
    source: string;
    locale: string;
  };
  entryCount: number;
  photoCount: number;
  aggregateBodyLength: number;
  qualityClass?: PublicProjectionQualityClass;
  latestMeaningfulAt?: Date | string | null;
  indexState: PublicSurfaceIndexState;
  seedProof: PublicVarietySeedProof | null;
  sourceCredits: PublicCatalogSourceCredit[];
  entries: PublicVarietyEntry[];
}

export interface PublicVarietySitemapEntry {
  catalogItemId: string;
  catalogKind: CatalogKind;
  publicSlug: string;
  speciesSlug: string | null;
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
    intrinsicWidth: number | null;
    intrinsicHeight: number | null;
    placeholderDataUri: string | null;
    variantLongEdges: number[];
  } | null;
}

/**
 * The organism page behind a slug (ADR-0026 D8). Any slug the history holds
 * resolves, so a client-side navigation to a retired address still renders
 * the organism; the proxy already answered 308 on the hard load. A node
 * without first-hand content still renders: it is reachable, and `noindex`
 * until a gardener publishes on it (D9).
 */
export async function getPublicVarietyPage(
  publicSlug: string,
  expectedCatalogKind?: CatalogKind,
  executor: QueryExecutor = db,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): Promise<PublicVarietyPage | null> {
  const slug = normalizeCatalogPublicSlug(publicSlug);
  if (!slug) return null;

  const history = await buildCatalogSlugHistoryLookupQuery(executor, slug, [
    "species",
    "form",
  ]).executeTakeFirst();
  if (!history) return null;
  const address = await readPublicCatalogCanonicalAddress(
    executor,
    history.catalogItemId,
  );
  if (!address) return null;
  if (expectedCatalogKind && address.catalogKind !== expectedCatalogKind) {
    return null;
  }
  return getPublicVarietyPageByCatalogItemId(
    address.catalogItemId,
    executor,
    locale,
  );
}

export async function getPublicVarietyPageByCatalogItemId(
  catalogItemId: string,
  executor: QueryExecutor = db,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): Promise<PublicVarietyPage | null> {
  const item = await buildPublicVarietyItemQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();
  if (!item?.publicSlug) return null;

  const [summary, entries, seedProof, sourceCredits, identifiers] =
    await Promise.all([
      buildPublicVarietySummaryQuery(executor, {
        catalogItemId: item.id,
      }).executeTakeFirst(),
      buildPublicVarietyEntriesQuery(
        executor,
        { catalogItemId: item.id },
        MAX_PUBLIC_VARIETY_ENTRIES,
      ).execute(),
      buildPublishedVarietySeedProofByCatalogItemIdQuery(
        executor,
        item.id,
      ).executeTakeFirst(),
      buildPublicVarietySourceCreditsQuery(executor, item.id).execute(),
      buildPublicVarietyIdentifiersQuery(executor, item.id).execute(),
    ]);
  const mediaExtras = await readMediaVariantExtras(
    executor,
    entries.flatMap((entry) => (entry.mediaId ? [entry.mediaId] : [])),
  );
  const entryCount = Number(summary?.entryCount ?? 0);
  const aggregateBodyLength = Number(summary?.aggregateBodyLength ?? 0);
  const catalogKind = item.catalogKind as CatalogKind;
  const page = {
    catalog: {
      catalogItemId: item.id,
      catalogKind,
      nodeKind: item.nodeKind,
      rank: item.rank,
      canonicalName: item.canonicalName,
      scientificName: item.scientificName ?? item.canonicalName,
      publicSlug: item.publicSlug,
      speciesSlug: item.speciesSlug,
      species:
        item.speciesSlug && item.speciesCanonicalName
          ? {
              canonicalName: item.speciesCanonicalName,
              publicSlug: item.speciesSlug,
            }
          : null,
      canonicalPath: publicCatalogEvidencePath({
        catalogKind,
        publicSlug: item.publicSlug,
        speciesSlug: item.speciesSlug,
      }),
      permalinkPath: publicCatalogPermalinkPath(item.id),
      contentUpdatedAt: item.contentUpdatedAt,
      identifiers: identifiers.map((row) => ({
        scheme: row.scheme,
        value: row.value,
      })),
      status: item.status as Extract<CatalogItemStatus, "seeded" | "confirmed">,
      source: item.source,
      locale: item.locale,
    },
    entryCount,
    photoCount: Number(summary?.photoCount ?? 0),
    aggregateBodyLength,
    qualityClass: "verified" as const,
    latestMeaningfulAt: summary?.latestMeaningfulAt ?? null,
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
      publicPath: localizedPublicJournalEvidencePath(
        locale,
        entry.entryPublicSlug,
      ),
      plantObjectDisplayName: entry.objectDisplayName,
      varietyText: entry.varietyText,
      safeLocationLabel: getPublicLocationLabel(entry),
      media:
        entry.mediaDerivativeKey && entry.mediaId
          ? {
              id: entry.mediaId,
              derivativeKey: entry.mediaDerivativeKey,
              publicUrl: getPublicDerivativeUrl(entry.mediaDerivativeKey),
              intrinsicWidth: entry.mediaIntrinsicWidth ?? null,
              intrinsicHeight: entry.mediaIntrinsicHeight ?? null,
              placeholderDataUri:
                mediaExtras.get(entry.mediaId)?.placeholderDataUri ?? null,
              variantLongEdges:
                mediaExtras.get(entry.mediaId)?.variantLongEdges ?? [],
            }
          : null,
    })),
  } satisfies Omit<PublicVarietyPage, "indexState">;
  return {
    ...page,
    indexState: resolvePublicSurfaceDiscoveryForRequest(
      buildPublicVarietyDiscoverySource(page, "public_variety_repository"),
    ).decision,
  };
}

/** The node itself: active, selectable, global, addressed. */
export function buildPublicVarietyItemQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.node_kind as nodeKind",
      "catalog_items.rank as rank",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.public_slug as publicSlug",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_items.locale as locale",
      "catalog_items.content_updated_at as contentUpdatedAt",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      sql<string | null>`(
        select parent.canonical_name
        from catalog_item_relations as form_relation
        join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
        where form_relation.from_catalog_item_id = ${sql.ref("catalog_items.id")}
          and form_relation.relation_type = 'form_of'
          and parent.node_kind = 'taxon'
          and parent.identity_state = 'active'
          and parent.public_slug is not null
        order by form_relation.created_at, form_relation.id
        limit 1
      )`.as("speciesCanonicalName"),
      sql<string | null>`(
        select accepted.display_name
        from catalog_item_names as accepted
        where accepted.catalog_item_id = ${sql.ref("catalog_items.id")}
          and accepted.name_type = 'scientific_accepted'
        order by accepted.is_primary desc, accepted.created_at, accepted.id
        limit 1
      )`.as("scientificName"),
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.identity_state", "=", "active")
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.public_slug", "is not", null);
}

/** External identifiers, for `sameAs` and the alias resolvers' inverse. */
export function buildPublicVarietyIdentifiersQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_item_identifiers")
    .select([
      "catalog_item_identifiers.scheme as scheme",
      "catalog_item_identifiers.value as value",
    ])
    .where("catalog_item_identifiers.catalog_item_id", "=", catalogItemId)
    .orderBy("catalog_item_identifiers.scheme", "asc")
    .orderBy("catalog_item_identifiers.value", "asc");
}

export function buildPublicVarietyDiscoverySource(
  page: Omit<PublicVarietyPage, "indexState">,
  consumerId: Extract<
    PublicSurfaceDiscoveryConsumerId,
    "catalog_evidence" | "variety_sitemap" | "public_variety_repository"
  >,
  routeLocale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicSurfaceDiscoverySource {
  return {
    consumerId,
    candidateState: "candidate",
    visibleText: [
      page.catalog.canonicalName,
      page.seedProof?.title ?? "",
      page.seedProof?.summary ?? "",
      page.seedProof?.body ?? "",
      ...page.sourceCredits.flatMap((credit) => [
        credit.sourceName,
        credit.sourceVersion,
        credit.license,
        credit.attributionText ?? "",
      ]),
      ...page.entries.flatMap((entry) => [
        entry.title,
        entry.body,
        entry.plantObjectDisplayName,
        entry.varietyText ?? "",
        entry.safeLocationLabel ?? "",
      ]),
    ],
    distinctPublicEntityIds: [
      `catalog:${page.catalog.catalogItemId}`,
      ...page.entries.map((entry) => entry.id),
    ],
    // The canonical follows the route family the page was served from (a
    // prefixed locale route or the unprefixed one), never the cookie locale.
    canonicalPath: localizedPath(routeLocale, page.catalog.canonicalPath),
    equivalentLocales: [...PUBLIC_LOCALES],
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

  const resolved = await Promise.all(
    rows.map(async (row) => ({
      row,
      page: await getPublicVarietyPageByCatalogItemId(
        row.catalogItemId,
        executor,
      ),
    })),
  );
  return resolved.flatMap(({ row, page }) => {
    if (!page) return [];
    const decision = resolvePublicSurfaceDiscoveryForRequest(
      buildPublicVarietyDiscoverySource(page, "variety_sitemap"),
    ).decision;
    if (!decision.sitemapEligible) return [];
    return [
      {
        catalogItemId: row.catalogItemId,
        catalogKind: row.catalogKind,
        publicSlug: row.publicSlug,
        speciesSlug: row.speciesSlug,
        lastModified: row.lastModified,
        entryCount: page.entryCount,
        aggregateBodyLength: page.aggregateBodyLength,
      },
    ];
  });
}

export type PublicVarietySelector = string | { catalogItemId: string };

export function buildPublicVarietySummaryQuery(
  executor: QueryExecutor,
  selector: PublicVarietySelector,
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
      catalogSpeciesSlugSql("catalog_items").as("catalogSpeciesSlug"),
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
      "catalog_items.locale as catalogLocale",
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`coalesce(sum((
        select count(*)
        from media_assets as public_media
        where public_media.journal_entry_id = ${sql.ref("journal_entries.id")}
          and public_media.owner_user_id = ${sql.ref("journal_entries.owner_user_id")}
          and ${publicMediaEligibilityPredicate("public_media")}
      )), 0)`.as("photoCount"),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
      fn
        .max<Date | string>("journal_entries.updated_at")
        .as("latestMeaningfulAt"),
    ])
    .where(({ eb }) =>
      typeof selector === "string"
        ? eb("catalog_items.public_slug", "=", selector)
        : eb("catalog_items.id", "=", selector.catalogItemId),
    )
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
    .where(publicLaunchSurfacePredicates())
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
      "catalog_items.id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.public_slug as publicSlug",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      // The card changed when its names, links or facts did, or when a
      // gardener published on it: whichever is later is the sitemap lastmod.
      sql<Date | string>`greatest(${fn.max("journal_entries.updated_at")}, ${sql.ref("catalog_items.content_updated_at")})`.as(
        "lastModified",
      ),
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
    ])
    .where("catalog_items.public_slug", "is not", null)
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
    .where(publicLaunchSurfacePredicates())
    .groupBy([
      "catalog_items.id",
      "catalog_items.catalog_kind",
      "catalog_items.public_slug",
    ])
    .orderBy("catalog_items.public_slug", "asc")
    .$narrowType<{ catalogKind: CatalogKind; publicSlug: string }>();
}

export function buildPublicVarietyEntriesQuery(
  executor: QueryExecutor,
  selector: PublicVarietySelector,
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
      "first_public_media.intrinsicWidth as mediaIntrinsicWidth",
      "first_public_media.intrinsicHeight as mediaIntrinsicHeight",
    ])
    .where(({ eb }) =>
      typeof selector === "string"
        ? eb("catalog_items.public_slug", "=", selector)
        : eb("catalog_items.id", "=", selector.catalogItemId),
    )
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
    .where(publicLaunchSurfacePredicates());

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
