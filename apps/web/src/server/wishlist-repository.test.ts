import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  buildDeleteWishlistCatalogItemQuery,
  buildListWishlistShelfItemsQuery,
  buildUpsertWishlistItemQuery,
  serializeWishlistShelfItem,
} from "./wishlist-repository";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const scope = scopedToUser("00000000-0000-4000-8000-000000000001");
const catalogItemId = "00000000-0000-4000-8000-000000000101";
const forbiddenWishlistPattern =
  /journal_entries|plant_objects|spaces|media_assets|body|title|quarantine|derivative|email|phone|ip_address|user_agent|invite|token|coordinates|coarse_region|location_visibility|client_mutation_id/i;

describe("wishlist repository contracts", () => {
  it("upserts wishlist items without creating journal or object content", () => {
    const now = new Date("2026-07-04T08:00:00.000Z");
    const compiled = buildUpsertWishlistItemQuery(testDb, scope, {
      catalogItemId,
      sourceSurface: "public_variety",
      now,
    }).compile();

    expect(compiled.sql).toContain('insert into "wishlist_items"');
    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "catalog_item_id") do update',
    );
    expect(compiled.sql).toContain('"updated_at"');
    expect(compiled.sql).not.toMatch(forbiddenWishlistPattern);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain(catalogItemId);
    expect(compiled.parameters).toContain("public_variety");
  });

  it("deletes wishlist items only inside the signed-in owner scope", () => {
    const compiled = buildDeleteWishlistCatalogItemQuery(
      testDb,
      scope,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('delete from "wishlist_items"');
    expect(compiled.sql).toContain('"owner_user_id" =');
    expect(compiled.sql).toContain('"catalog_item_id" =');
    expect(compiled.sql).not.toMatch(forbiddenWishlistPattern);
    expect(compiled.parameters).toEqual([scope.userId, catalogItemId]);
  });

  it("lists only the signed-in gardener's reusable catalog shelf items", () => {
    const compiled = buildListWishlistShelfItemsQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "wishlist_items"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" on "catalog_items"."id" = "wishlist_items"."catalog_item_id"',
    );
    expect(compiled.sql).toContain('"wishlist_items"."owner_user_id" =');
    expect(compiled.sql).toContain('"catalog_items"."status" in');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toMatch(forbiddenWishlistPattern);
    expect(compiled.parameters).toContain(scope.userId);
  });

  it("serializes shelf readback without raw row ids and preserves activation prefill", () => {
    const wishlistId = "00000000-0000-4000-8000-000000000201";
    const item = serializeWishlistShelfItem({
      wishlistId,
      sourceSurface: "public_variety",
      addedAt: "2026-07-04T08:00:00.000Z",
      updatedAt: "2026-07-04T09:00:00.000Z",
      catalogItemId,
      catalogCanonicalName: "Pomidor Cheri",
      catalogPublicSlug: "pomidor-cheri-0000000101",
      catalogKind: "plant_variety",
      catalogLocale: "uk",
      catalogStatus: "seeded",
      catalogSource: "seed",
    });

    expect(item).toMatchObject({
      catalog: {
        canonicalName: "Pomidor Cheri",
        publicSlug: "pomidor-cheri-0000000101",
      },
      publicPath: "/variety/pomidor-cheri-0000000101",
      activationPath:
        "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
    });
    expect(JSON.stringify(item)).not.toContain(wishlistId);
    expect(JSON.stringify(item)).not.toContain(catalogItemId);
  });

  it("models wishlist as a separate shelf table, not journal/object content", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableMatch = schemaSql.match(
      /create table if not exists wishlist_items \(([\s\S]*?)\);/,
    );

    expect(tableMatch).not.toBeNull();
    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("owner_user_id uuid not null");
    expect(tableBody).toContain("catalog_item_id uuid not null");
    expect(tableBody).not.toMatch(
      /journal|plant_object|space_id|body|title|media|quarantine|derivative|email|phone|ip|user_agent|invite|token|coordinate|location|client_mutation/,
    );
    expect(schemaSql).toContain("wishlist_items_owner_catalog_uidx");
    expect(schemaSql).toContain("wishlist_items_owner_created_idx");
  });
});
