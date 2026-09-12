import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  CATALOG_BROWSE_KINGDOMS,
  CATALOG_BROWSE_PAGE_SIZE,
  initialOfCatalogName,
  type CatalogBrowseInitial,
  type CatalogBrowseKingdom,
} from "@/lib/public-catalog-browse";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import { catalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CatalogBrowseKingdomSummary {
  readonly kingdom: CatalogBrowseKingdom;
  readonly total: number;
  readonly initials: readonly { initial: CatalogBrowseInitial; total: number }[];
}

export interface CatalogBrowseCard {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly rank: string | null;
  readonly hasFirstHandContent: boolean;
}

export interface CatalogBrowsePage {
  readonly cards: readonly CatalogBrowseCard[];
  readonly total: number;
  readonly pageCount: number;
}

/**
 * The kingdoms and their initials, in one grouped statement.
 *
 * One statement rather than one per kingdom because the browse root shows all
 * eight at once, and 8 × 27 round trips to render a page of links is how a
 * front door becomes slower than the sitemap it replaces. The grouping is on
 * the same expression the page query filters by, so the counts and the pages
 * can never disagree.
 */
export async function listCatalogBrowseKingdoms(
  executor: QueryExecutor = db,
): Promise<CatalogBrowseKingdomSummary[]> {
  const rows = await executor
    .selectFrom("catalog_items")
    .select(({ fn }) => [
      "catalog_items.kingdom as kingdom",
      sql<string>`lower(left(catalog_items.canonical_name, 1))`.as("initial"),
      fn.count<string>("catalog_items.id").as("total"),
    ])
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .where("catalog_items.kingdom", "in", [...CATALOG_BROWSE_KINGDOMS])
    .groupBy(["catalog_items.kingdom", sql`lower(left(catalog_items.canonical_name, 1))`])
    .execute();

  const byKingdom = new Map<
    CatalogBrowseKingdom,
    Map<CatalogBrowseInitial, number>
  >();
  for (const row of rows) {
    const kingdom = row.kingdom as CatalogBrowseKingdom;
    const initial = initialOfCatalogName(row.initial ?? "");
    const initials = byKingdom.get(kingdom) ?? new Map();
    initials.set(initial, (initials.get(initial) ?? 0) + Number(row.total));
    byKingdom.set(kingdom, initials);
  }

  return CATALOG_BROWSE_KINGDOMS.flatMap((kingdom) => {
    const initials = byKingdom.get(kingdom);
    if (!initials) return [];
    const counted = [...initials.entries()]
      .map(([initial, total]) => ({ initial, total }))
      .sort((left, right) => left.initial.localeCompare(right.initial));
    return [
      {
        kingdom,
        total: counted.reduce((sum, entry) => sum + entry.total, 0),
        initials: counted,
      },
    ];
  });
}

/**
 * One page of a kingdom's organisms, ordered by name.
 *
 * `offset` is bounded by the count the same statement returns, so a request
 * past the end gets an empty page and the route answers a real 404 rather than
 * an empty listing that a crawler would read as a page (ADR-0022 D3).
 */
export async function listCatalogBrowsePage(
  request: {
    kingdom: CatalogBrowseKingdom;
    initial: CatalogBrowseInitial | null;
    page: number;
  },
  executor: QueryExecutor = db,
): Promise<CatalogBrowsePage> {
  const initialFilter = request.initial;

  const base = executor
    .selectFrom("catalog_items")
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .where("catalog_items.kingdom", "=", request.kingdom)
    .$if(initialFilter === "#", (query) =>
      query.where(
        sql<boolean>`lower(left(catalog_items.canonical_name, 1)) !~ '^[a-z]$'`,
      ),
    )
    .$if(Boolean(initialFilter) && initialFilter !== "#", (query) =>
      query.where(
        sql<boolean>`lower(left(catalog_items.canonical_name, 1)) = ${initialFilter}`,
      ),
    );

  const counted = await base
    .select(({ fn }) => fn.count<string>("catalog_items.id").as("total"))
    .executeTakeFirst();
  const total = Number(counted?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_BROWSE_PAGE_SIZE));

  if (request.page > pageCount) return { cards: [], total, pageCount };

  const rows = await base
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as name",
      "catalog_items.public_slug as publicSlug",
      "catalog_items.rank as rank",
      "catalog_items.first_hand_content_at as firstHandContentAt",
      "catalog_items.indexable_override as indexableOverride",
      catalogKindSql("catalog_items").as("catalogKind"),
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
    ])
    .orderBy("catalog_items.canonical_name", "asc")
    .orderBy("catalog_items.id", "asc")
    .limit(CATALOG_BROWSE_PAGE_SIZE)
    .offset((request.page - 1) * CATALOG_BROWSE_PAGE_SIZE)
    .execute();

  return {
    total,
    pageCount,
    cards: rows.map((row) => ({
      id: row.id,
      name: row.name,
      rank: row.rank,
      hasFirstHandContent:
        row.firstHandContentAt !== null || row.indexableOverride === true,
      path: publicCatalogEvidencePath({
        catalogKind: row.catalogKind ?? "plant_variety",
        publicSlug: row.publicSlug!,
        speciesSlug: row.speciesSlug,
      }),
    })),
  };
}

/**
 * The organisms a gardener has actually written about.
 *
 * These are the indexable cards (ADR-0026 D9), and the acceptance criterion
 * that matters is about them: four clicks from `/` at most. Listing them on
 * the browse root puts every one of them at three.
 */
export async function listCatalogBrowseFirstHandOrganisms(
  limit = 24,
  executor: QueryExecutor = db,
): Promise<CatalogBrowseCard[]> {
  const rows = await executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.canonical_name as name",
      "catalog_items.public_slug as publicSlug",
      "catalog_items.rank as rank",
      catalogKindSql("catalog_items").as("catalogKind"),
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
    ])
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.merged_into_catalog_item_id", "is", null)
    .where((eb) =>
      eb.or([
        eb("catalog_items.first_hand_content_at", "is not", null),
        eb("catalog_items.indexable_override", "=", true),
      ]),
    )
    .orderBy("catalog_items.first_hand_content_at", "desc")
    .orderBy("catalog_items.canonical_name", "asc")
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    rank: row.rank,
    hasFirstHandContent: true,
    path: publicCatalogEvidencePath({
      catalogKind: row.catalogKind ?? "plant_variety",
      publicSlug: row.publicSlug!,
      speciesSlug: row.speciesSlug,
    }),
  }));
}
