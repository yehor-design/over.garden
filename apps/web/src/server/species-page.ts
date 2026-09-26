import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogKind, Database } from "@/db/schema";
import { publicCatalogPermalinkPath } from "@/lib/catalog/addresses";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  catalogSpeciesNameSql,
  catalogSpeciesSlugSql,
  catalogVernacularNameSql,
} from "@/server/catalog-address-sql";
import { catalogKindSql } from "@/server/catalog-kind-sql";
import {
  isCatalogItemPublished,
  publishedCatalogItemsQuery,
} from "@/server/catalog-publication";
import { publicMediaEligibilityPredicate } from "@/server/media/public-media-eligibility";
import { readMediaVariantExtras } from "@/server/media/media-variant-schema";
import {
  buildPublicFeedEntriesQuery,
  buildPublicFeedMediaQuery,
  decodePublicFeedCursor,
  listPublicFeedPage,
  serializePublicFeedMedia,
  type PublicFeedEntry,
  type PublicFeedMedia,
} from "@/server/public-feed-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * A species page (`OVE-519`): one plant or animal, and what gardeners wrote
 * about it. The name, the Latin name, the text, «Записи» — nothing else is
 * read, because nothing else is shown. Source data (Catalogue of Life,
 * Wikidata, the registers, EPPO) stays in the database.
 *
 * A cultivar or a breed under its species (`/species/{species}/{form}`) is the
 * same page with its own entries; a species' list takes its forms' too.
 */
export interface SpeciesPage {
  catalog: {
    catalogItemId: string;
    catalogKind: CatalogKind;
    nodeKind: string;
    rank: string | null;
    kingdom: string | null;
    /** The accepted name the catalogue holds, as the heading falls back to it. */
    canonicalName: string;
    /** A species' own name in the page's language, when the catalogue holds one. */
    vernacularName: string | null;
    /** The accepted scientific name without authorship, when a name row says so. */
    scientificName: string;
    publicSlug: string;
    /** For a form: its species, which the page links to. */
    species: {
      /** Its accepted Latin name without authorship. */
      scientificName: string;
      /** In the page's language when the catalogue holds it. */
      displayName: string;
      publicSlug: string;
    } | null;
    canonicalPath: string;
    permalinkPath: string;
  };
  /** The publication rule (`catalog-publication.ts`), read for this page. */
  published: boolean;
  /** «Записи»: the first portion of twenty, newest first. */
  entries: PublicFeedEntry[];
  nextCursor: string | null;
  /**
   * The newest photograph of those entries: the page's `og:image` until the
   * owner picks one for it.
   */
  shareImage: PublicFeedMedia | null;
}

/** The node itself: active, from the catalogue (never typed in), addressed. */
function buildSpeciesItemQuery(
  executor: QueryExecutor,
  catalogItemId: string,
  locale: PublicLocale,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      catalogKindSql("catalog_items").as("catalogKind"),
      "catalog_items.node_kind as nodeKind",
      "catalog_items.rank as rank",
      "catalog_items.kingdom as kingdom",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.public_slug as publicSlug",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      catalogVernacularNameSql("catalog_items", locale).as("vernacularName"),
      catalogSpeciesNameSql("catalog_items", locale).as("speciesDisplayName"),
      // The species' Latin name as its own page shows it: the accepted
      // scientific name without authorship, the catalogue's name otherwise.
      sql<string | null>`(
        select coalesce(
          (
            select parent_name.display_name
            from catalog_item_names as parent_name
            where parent_name.catalog_item_id = parent.id
              and parent_name.name_type = 'scientific_accepted'
            order by parent_name.is_primary desc, parent_name.created_at, parent_name.id
            limit 1
          ),
          parent.canonical_name
        )
        from catalog_item_relations as form_relation
        join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
        where form_relation.from_catalog_item_id = ${sql.ref("catalog_items.id")}
          and form_relation.relation_type = 'form_of'
          and parent.node_kind = 'taxon'
          and parent.identity_state = 'active'
          and parent.public_slug is not null
        order by form_relation.created_at, form_relation.id
        limit 1
      )`.as("speciesScientificName"),
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
    .where("catalog_items.identity_state", "=", "active")
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.public_slug", "is not", null)
    .$narrowType<{ publicSlug: string; catalogKind: CatalogKind }>();
}

export async function getSpeciesPage(
  catalogItemId: string,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
  executor: QueryExecutor = db,
): Promise<SpeciesPage | null> {
  const item = await buildSpeciesItemQuery(
    executor,
    catalogItemId,
    locale,
  ).executeTakeFirst();
  if (!item) return null;

  const [published, portion] = await Promise.all([
    isCatalogItemPublished(item.id, executor),
    listSpeciesEntries(item.id, null, locale, executor),
  ]);
  const shareImage =
    portion.entries.find((entry) => entry.media.length > 0)?.media[0] ??
    // Only when none of the first twenty has one: an older entry may.
    (portion.nextCursor
      ? await readNewestSpeciesPhoto(item.id, executor)
      : null);

  return {
    catalog: {
      catalogItemId: item.id,
      catalogKind: item.catalogKind,
      nodeKind: item.nodeKind,
      rank: item.rank,
      kingdom: item.kingdom ?? null,
      canonicalName: item.canonicalName,
      vernacularName: item.vernacularName ?? null,
      scientificName: item.scientificName ?? item.canonicalName,
      publicSlug: item.publicSlug,
      species:
        item.speciesSlug && item.speciesScientificName
          ? {
              scientificName: item.speciesScientificName,
              displayName:
                item.speciesDisplayName ?? item.speciesScientificName,
              publicSlug: item.speciesSlug,
            }
          : null,
      canonicalPath: publicCatalogEvidencePath({
        catalogKind: item.catalogKind,
        publicSlug: item.publicSlug,
        speciesSlug: item.speciesSlug,
      }),
      permalinkPath: publicCatalogPermalinkPath(item.id),
    },
    published,
    entries: portion.entries,
    nextCursor: portion.nextCursor,
    shareImage,
  };
}

/**
 * One portion of a species page's «Записи»: the feed's own read and cards,
 * narrowed to the item and its forms. `cursor` is the portion's address, as
 * the feed writes it; an unreadable one reads as the first portion here, and
 * the page's own bound (`isSpeciesCursorBeyondTheEnd`) answers 404 for it.
 */
export function listSpeciesEntries(
  catalogItemId: string,
  cursor: string | null,
  locale: PublicLocale,
  executor: QueryExecutor = db,
) {
  return listPublicFeedPage(
    {
      cursor: cursor ? decodePublicFeedCursor(cursor) : null,
      kind: "all",
      topic: null,
      catalog: { catalogItemId },
    },
    locale,
    executor,
  );
}

/**
 * A cursor that is not one, or one with nothing after it, names no portion:
 * the proxy answers 404 for it before anything streams, as it does for the
 * home feed's.
 */
export async function isSpeciesCursorBeyondTheEnd(
  catalogItemId: string,
  rawCursor: string,
  executor: QueryExecutor = db,
): Promise<boolean> {
  const cursor = decodePublicFeedCursor(rawCursor);
  if (!cursor) return true;
  const rows = await buildPublicFeedEntriesQuery(executor, {
    cursor,
    kind: "all",
    topic: null,
    catalog: { catalogItemId },
    pageSize: 1,
  }).execute();
  return rows.length === 0;
}

/** The newest entry with a public photograph, and that photograph. */
async function readNewestSpeciesPhoto(
  catalogItemId: string,
  executor: QueryExecutor,
): Promise<PublicFeedMedia | null> {
  const row = await buildPublicFeedEntriesQuery(executor, {
    cursor: null,
    kind: "all",
    topic: null,
    catalog: { catalogItemId },
    pageSize: 1,
  })
    .where(
      sql<boolean>`exists (
        select 1
        from media_assets as share_media
        where share_media.journal_entry_id = journal_entries.id
          and share_media.owner_user_id = journal_entries.owner_user_id
          and ${publicMediaEligibilityPredicate("share_media")}
          and (
            share_media.id = journal_entries.cover_media_asset_id
            or share_media.usage_role = 'inline'
          )
      )`,
    )
    .executeTakeFirst();
  if (!row) return null;
  const mediaRows = await buildPublicFeedMediaQuery(executor, [
    row.entryId,
  ]).execute();
  const mediaExtras = await readMediaVariantExtras(
    executor,
    mediaRows.map((media) => media.id),
  );
  return serializePublicFeedMedia(mediaRows, { mediaExtras })[0] ?? null;
}

export interface PublishedSpeciesSitemapEntry {
  catalogItemId: string;
  catalogKind: CatalogKind;
  publicSlug: string;
  speciesSlug: string | null;
  /** The newest public entry about it or its forms: the sitemap's `lastmod`. */
  lastModified: Date | string;
}

/**
 * Every published species page, for the sitemap: the publication rule's own
 * list (`publishedCatalogItemsQuery`), so the sitemap lists a page exactly
 * while the page says `index`.
 */
export function listPublishedSpeciesSitemapEntries(
  executor: QueryExecutor = db,
): Promise<PublishedSpeciesSitemapEntry[]> {
  return executor
    .with("published_items", (qc) => publishedCatalogItemsQuery(qc))
    .selectFrom("published_items")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "published_items.catalogItemId",
    )
    .select([
      "catalog_items.id as catalogItemId",
      catalogKindSql("catalog_items").as("catalogKind"),
      "catalog_items.public_slug as publicSlug",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
      "published_items.latestPublishedAt as lastModified",
    ])
    .where("catalog_items.identity_state", "=", "active")
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.public_slug", "is not", null)
    .orderBy("catalog_items.public_slug", "asc")
    .$narrowType<{ catalogKind: CatalogKind; publicSlug: string }>()
    .execute();
}
