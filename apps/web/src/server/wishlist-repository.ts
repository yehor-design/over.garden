import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  WishlistItem,
  WishlistSourceSurface,
} from "@/db/schema";
import {
  gardenFirstEntryPreselectionPath,
  publicCatalogEvidencePath,
} from "@/lib/garden/public-paths";
import {
  findSelectableCatalogItem,
  findSelectableCatalogItemByPublicSlug,
  type SelectableCatalogItem,
} from "@/server/catalog-repository";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import type { RequestScope } from "@/server/request-scope";
import { catalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface AddCatalogItemToWishlistInput {
  catalogItemId: string;
  sourceSurface?: WishlistSourceSurface;
}

export interface AddCatalogPublicSlugToWishlistInput {
  publicSlug: string;
  sourceSurface?: WishlistSourceSurface;
}

export interface WishlistShelfItem {
  key: string;
  /** What the row takes off the list: the catalogue item, whatever its state. */
  catalogItemId: string;
  /**
   * False once the catalogue no longer offers it — merged, retired, or never
   * public. The shelf says so and still lets it be removed (`OVE-502`); it
   * used to be dropped from the list, and removing needed an offered item.
   */
  available: boolean;
  catalog: {
    canonicalName: string;
    publicSlug: string | null;
    catalogKind: CatalogKind;
    locale: string;
    source: string;
  };
  sourceSurface: WishlistSourceSurface;
  addedAt: Date | string;
  updatedAt: Date | string;
  publicPath: string | null;
  activationPath: string | null;
}

export interface AddWishlistResult {
  item: WishlistShelfItem;
  created: boolean;
}

export interface RemoveWishlistResult {
  removed: boolean;
}

export interface WishlistShelfRow {
  wishlistId: string;
  sourceSurface: string;
  addedAt: Date | string;
  updatedAt: Date | string;
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogPublicSlug: string | null;
  catalogSpeciesSlug: string | null;
  catalogKind: string;
  catalogLocale: string;
  catalogSource: string;
  catalogIdentityState?: string | null;
  catalogIsPublic?: boolean | null;
}

export async function addCatalogItemToWishlist(
  scope: RequestScope,
  input: AddCatalogItemToWishlistInput,
  executor: QueryExecutor = db,
): Promise<AddWishlistResult> {
  const item = await findSelectableCatalogItem(executor, input.catalogItemId);
  if (!item) {
    throw new Error("Wishlist catalog item is not available.");
  }

  return upsertWishlistCatalogItem(scope, item, input.sourceSurface, executor);
}

export async function addCatalogPublicSlugToWishlist(
  scope: RequestScope,
  input: AddCatalogPublicSlugToWishlistInput,
  executor: QueryExecutor = db,
): Promise<AddWishlistResult> {
  const item = await findSelectableCatalogItemByPublicSlug(
    input.publicSlug,
    executor,
  );
  if (!item) {
    throw new Error("Wishlist catalog item is not available.");
  }

  return upsertWishlistCatalogItem(scope, item, input.sourceSurface, executor);
}

/**
 * Takes one catalogue item off the reader's list, whatever the catalogue now
 * says about it (`OVE-502`). It went through the item's public slug and
 * refused an item the catalogue no longer offers — exactly the row a reader
 * most wants to remove.
 */
export async function removeWishlistCatalogItem(
  scope: RequestScope,
  catalogItemId: string,
  executor: QueryExecutor = db,
): Promise<RemoveWishlistResult> {
  if (!UUID.test(catalogItemId)) return { removed: false };
  const deleted = await buildDeleteWishlistCatalogItemQuery(
    executor,
    scope,
    catalogItemId,
  ).executeTakeFirst();

  return { removed: Boolean(deleted) };
}

/**
 * A catalogue item's name, for the shelf's "…removed" notice, and whether the
 * catalogue still offers it — the only case in which an Undo can put it back.
 */
export async function findWishlistCatalogName(
  catalogItemId: string,
  executor: QueryExecutor = db,
): Promise<{ name: string; available: boolean } | null> {
  if (!UUID.test(catalogItemId)) return null;
  const row = await executor
    .selectFrom("catalog_items")
    .select([
      "canonical_name as name",
      "identity_state as identityState",
      "created_by_user_id as createdByUserId",
    ])
    .where("id", "=", catalogItemId)
    .executeTakeFirst();
  return row
    ? {
        name: row.name,
        available:
          row.identityState === "active" && row.createdByUserId === null,
      }
    : null;
}

export async function listWishlistShelfItems(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<WishlistShelfItem[]> {
  const rows = await buildListWishlistShelfItemsQuery(
    executor,
    scope,
  ).execute();
  return rows.map(serializeWishlistShelfItem);
}

export function buildUpsertWishlistItemQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    catalogItemId: string;
    sourceSurface: WishlistSourceSurface;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return executor
    .insertInto("wishlist_items")
    .values({
      owner_user_id: scope.userId,
      catalog_item_id: input.catalogItemId,
      source_surface: input.sourceSurface,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "catalog_item_id"]).doUpdateSet({
        source_surface: input.sourceSurface,
        updated_at: now,
      }),
    )
    .returningAll();
}

export function buildDeleteWishlistCatalogItemQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  catalogItemId: string,
) {
  return executor
    .deleteFrom("wishlist_items")
    .where("owner_user_id", "=", scope.userId)
    .where("catalog_item_id", "=", catalogItemId)
    .returningAll();
}

export function buildListWishlistShelfItemsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("wishlist_items")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "wishlist_items.catalog_item_id",
    )
    .select([
      "wishlist_items.id as wishlistId",
      "wishlist_items.source_surface as sourceSurface",
      "wishlist_items.created_at as addedAt",
      "wishlist_items.updated_at as updatedAt",
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      catalogSpeciesSlugSql("catalog_items").as("catalogSpeciesSlug"),
      catalogKindSql("catalog_items").as("catalogKind"),
      "catalog_items.locale as catalogLocale",
      "catalog_items.source as catalogSource",
      "catalog_items.identity_state as catalogIdentityState",
      sql<boolean>`${sql.ref("catalog_items.created_by_user_id")} is null`.as(
        "catalogIsPublic",
      ),
    ])
    .where("wishlist_items.owner_user_id", "=", scope.userId)
    .orderBy("wishlist_items.created_at", "desc")
    .orderBy("wishlist_items.id", "asc");
}

export function serializeWishlistShelfItem(
  row: WishlistShelfRow,
): WishlistShelfItem {
  // A row without the two columns is from before they were read: offered.
  const available =
    (row.catalogIdentityState ?? "active") === "active" &&
    row.catalogIsPublic !== false;
  const publicSlug = available ? row.catalogPublicSlug : null;

  return {
    key: stableWishlistKey(row.wishlistId),
    catalogItemId: row.catalogItemId,
    available,
    catalog: {
      canonicalName: row.catalogCanonicalName,
      publicSlug,
      catalogKind: row.catalogKind as CatalogKind,
      locale: row.catalogLocale,
      source: row.catalogSource,
    },
    sourceSurface: normalizeWishlistSourceSurface(row.sourceSurface),
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    publicPath: publicSlug
      ? publicCatalogEvidencePath({
          catalogKind: row.catalogKind as CatalogKind,
          publicSlug,
          speciesSlug: row.catalogSpeciesSlug,
        })
      : null,
    activationPath: publicSlug
      ? gardenFirstEntryPreselectionPath(publicSlug)
      : null,
  };
}

async function upsertWishlistCatalogItem(
  scope: RequestScope,
  catalogItem: SelectableCatalogItem,
  sourceSurface: WishlistSourceSurface | undefined,
  executor: QueryExecutor,
): Promise<AddWishlistResult> {
  const existing = await executor
    .selectFrom("wishlist_items")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("catalog_item_id", "=", catalogItem.id)
    .executeTakeFirst();

  const row = await buildUpsertWishlistItemQuery(executor, scope, {
    catalogItemId: catalogItem.id,
    sourceSurface: sourceSurface ?? "catalog_item",
  }).executeTakeFirstOrThrow();

  return {
    item: serializeWishlistShelfItem(toWishlistShelfRow(row, catalogItem)),
    created: !existing,
  };
}

function toWishlistShelfRow(
  wishlistItem: WishlistItem,
  catalogItem: SelectableCatalogItem,
): WishlistShelfRow {
  return {
    wishlistId: wishlistItem.id,
    sourceSurface: wishlistItem.source_surface,
    addedAt: wishlistItem.created_at,
    updatedAt: wishlistItem.updated_at,
    catalogItemId: catalogItem.id,
    catalogCanonicalName: catalogItem.canonicalName,
    catalogPublicSlug: catalogItem.publicSlug,
    catalogSpeciesSlug: catalogItem.speciesSlug,
    catalogKind: catalogItem.catalogKind,
    catalogLocale: catalogItem.locale,
    catalogSource: catalogItem.source,
  };
}

function normalizeWishlistSourceSurface(value: string): WishlistSourceSurface {
  return value === "public_variety" ? "public_variety" : "catalog_item";
}

function stableWishlistKey(rawId: string) {
  const digest = createHash("sha256").update(rawId).digest("hex");
  return `wishlist:${digest.slice(0, 16)}`;
}
