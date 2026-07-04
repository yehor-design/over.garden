import "server-only";

import { createHash } from "node:crypto";

import { type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  CatalogItemStatus,
  Database,
  WishlistItem,
  WishlistSourceSurface,
} from "@/db/schema";
import {
  gardenFirstEntryPreselectionPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  findSelectableCatalogItem,
  findSelectableCatalogItemByPublicSlug,
  SELECTABLE_CATALOG_STATUSES,
  type SelectableCatalogItem,
} from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

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
  catalog: {
    canonicalName: string;
    publicSlug: string | null;
    catalogKind: CatalogKind;
    locale: string;
    status: Extract<CatalogItemStatus, "seeded" | "confirmed">;
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
  catalogKind: string;
  catalogLocale: string;
  catalogStatus: string;
  catalogSource: string;
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

export async function removeCatalogPublicSlugFromWishlist(
  scope: RequestScope,
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<RemoveWishlistResult> {
  const item = await findSelectableCatalogItemByPublicSlug(
    publicSlug,
    executor,
  );
  if (!item) return { removed: false };

  const deleted = await buildDeleteWishlistCatalogItemQuery(
    executor,
    scope,
    item.id,
  ).executeTakeFirst();

  return { removed: Boolean(deleted) };
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
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.locale as catalogLocale",
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
    ])
    .where("wishlist_items.owner_user_id", "=", scope.userId)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .orderBy("wishlist_items.created_at", "desc")
    .orderBy("wishlist_items.id", "asc");
}

export function serializeWishlistShelfItem(
  row: WishlistShelfRow,
): WishlistShelfItem {
  const publicSlug = row.catalogPublicSlug;

  return {
    key: stableWishlistKey(row.wishlistId),
    catalog: {
      canonicalName: row.catalogCanonicalName,
      publicSlug,
      catalogKind: row.catalogKind as CatalogKind,
      locale: row.catalogLocale,
      status: row.catalogStatus as Extract<
        CatalogItemStatus,
        "seeded" | "confirmed"
      >,
      source: row.catalogSource,
    },
    sourceSurface: normalizeWishlistSourceSurface(row.sourceSurface),
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    publicPath: publicSlug ? publicVarietyPath(publicSlug) : null,
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
    catalogKind: catalogItem.catalogKind,
    catalogLocale: catalogItem.locale,
    catalogStatus: catalogItem.status,
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
