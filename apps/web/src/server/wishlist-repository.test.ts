import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  buildDeleteWishlistCatalogItemQuery,
  buildListWishlistShelfItemsQuery,
  buildUpsertWishlistItemQuery,
  findWishlistCatalogName,
  listWishlistShelfItems,
  removeWishlistCatalogItem,
  serializeWishlistShelfItem,
  type WishlistShelfRow,
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

/** One shelf row as the list statement returns it: an offered variety. */
const offeredRow: WishlistShelfRow = {
  wishlistId: "00000000-0000-4000-8000-000000000201",
  sourceSurface: "public_variety",
  addedAt: "2026-07-04T08:00:00.000Z",
  updatedAt: "2026-07-04T09:00:00.000Z",
  catalogItemId,
  catalogCanonicalName: "Pomidor Cheri",
  catalogPublicSlug: "pomidor-cheri-0000000101",
  catalogSpeciesSlug: null,
  catalogKind: "plant_variety",
  catalogLocale: "uk",
  catalogSource: "seed",
  catalogIdentityState: "active",
  catalogIsPublic: true,
};

/**
 * A database that answers every statement from `answer` and records what
 * reached it, so a test can say which statements a read made — and that a
 * refused input made none.
 */
function scriptedDb(answer: (sql: string) => readonly unknown[] = () => []) {
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      statements.push({ sql: compiled.sql, parameters: compiled.parameters });
      return { rows: [...answer(compiled.sql)] as R[] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not scripted");
    }
  }
  class ScriptedDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new ScriptedConnection();
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
  }
  const database = new Kysely<Database>({
    dialect: {
      createDriver: () => new ScriptedDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  return { database, statements };
}

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

  it("lists every item on the signed-in gardener's list, with what the catalogue now says about it", () => {
    const compiled = buildListWishlistShelfItemsQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "wishlist_items"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" on "catalog_items"."id" = "wishlist_items"."catalog_item_id"',
    );
    expect(compiled.sql).toContain('"wishlist_items"."owner_user_id" =');
    // `OVE-502`: an item the catalogue no longer offers is read, not
    // filtered out — the shelf says so and can still remove it.
    expect(compiled.sql).toContain(
      '"catalog_items"."identity_state" as "catalogIdentityState"',
    );
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null as "catalogIsPublic"',
    );
    expect(compiled.sql).not.toContain('"catalog_items"."identity_state" =');
    expect(compiled.sql).not.toMatch(forbiddenWishlistPattern);
    // The owner is the only thing the statement is bound to.
    expect(compiled.parameters).toEqual([scope.userId]);
  });

  it("serializes shelf readback without the raw row id and preserves activation prefill", () => {
    const item = serializeWishlistShelfItem({
      ...offeredRow,
      // A row from before the two catalogue columns were read is offered.
      catalogIdentityState: undefined,
      catalogIsPublic: undefined,
    });

    expect(item).toMatchObject({
      available: true,
      catalog: {
        canonicalName: "Pomidor Cheri",
        publicSlug: "pomidor-cheri-0000000101",
      },
      publicPath: "/variety/pomidor-cheri-0000000101",
      activationPath:
        "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
    });
    // The catalogue item's id is what the row's removal names; the list
    // row's own id never leaves the server.
    expect(item.catalogItemId).toBe(catalogItemId);
    expect(JSON.stringify(item)).not.toContain(offeredRow.wishlistId);
  });

  it.each([
    ["merged", true],
    ["retired", true],
    // A gardener's own catalogue entry was never offered to anyone else.
    ["active", false],
  ])(
    "keeps an item whose catalogue state is %s (public: %s), marked unavailable and without an address",
    (catalogIdentityState, catalogIsPublic) => {
      const item = serializeWishlistShelfItem({
        ...offeredRow,
        catalogIdentityState,
        catalogIsPublic,
      });

      expect(item).toMatchObject({
        catalogItemId,
        available: false,
        catalog: { canonicalName: "Pomidor Cheri", publicSlug: null },
        publicPath: null,
        activationPath: null,
      });
      expect(JSON.stringify(item)).not.toContain("pomidor-cheri-0000000101");
    },
  );

  it("reads the unavailable items back with the offered ones, in the list's order", async () => {
    const retiredItemId = "00000000-0000-4000-8000-000000000102";
    const { database, statements } = scriptedDb(() => [
      offeredRow,
      {
        ...offeredRow,
        wishlistId: "00000000-0000-4000-8000-000000000202",
        catalogItemId: retiredItemId,
        catalogCanonicalName: "Old Heirloom",
        catalogPublicSlug: "old-heirloom-0000000102",
        catalogIdentityState: "retired",
      },
    ]);

    const items = await listWishlistShelfItems(scope, database);

    expect(statements).toHaveLength(1);
    expect(items.map((item) => [item.catalogItemId, item.available])).toEqual([
      [catalogItemId, true],
      [retiredItemId, false],
    ]);
    expect(items[1]).toMatchObject({
      catalog: { canonicalName: "Old Heirloom", publicSlug: null },
      publicPath: null,
      activationPath: null,
    });
  });

  it("takes an item off by its catalogue id alone, whatever the catalogue says about it", async () => {
    const { database, statements } = scriptedDb(() => [
      { id: "00000000-0000-4000-8000-000000000201" },
    ]);

    await expect(
      removeWishlistCatalogItem(scope, catalogItemId, database),
    ).resolves.toEqual({ removed: true });

    // One statement: no lookup through the catalogue's offered items first,
    // which is what used to make a retired item impossible to remove.
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toMatch(/^delete from "wishlist_items"/u);
    expect(statements[0]?.sql).not.toContain("catalog_items");
    expect(statements[0]?.parameters).toEqual([scope.userId, catalogItemId]);
  });

  it("says nothing was removed when the list did not have it", async () => {
    const { database } = scriptedDb(() => []);

    await expect(
      removeWishlistCatalogItem(scope, catalogItemId, database),
    ).resolves.toEqual({ removed: false });
  });

  it.each(["pomidor-cheri-0000000101", "", "../../etc", `${catalogItemId}0`])(
    "answers a removal by %j, which is not a catalogue id, without a statement",
    async (value) => {
      const { database, statements } = scriptedDb();

      await expect(
        removeWishlistCatalogItem(scope, value, database),
      ).resolves.toEqual({ removed: false });
      expect(statements).toEqual([]);
    },
  );

  it.each([
    [{ identityState: "active", createdByUserId: null }, true],
    [{ identityState: "retired", createdByUserId: null }, false],
    [{ identityState: "merged", createdByUserId: null }, false],
    [
      {
        identityState: "active",
        createdByUserId: "00000000-0000-4000-8000-000000000002",
      },
      false,
    ],
  ])(
    "names a removed item for the notice, and says whether Undo can put it back (%j)",
    async (row, available) => {
      const { database, statements } = scriptedDb(() => [
        { name: "Pomidor Cheri", ...row },
      ]);

      await expect(
        findWishlistCatalogName(catalogItemId, database),
      ).resolves.toEqual({ name: "Pomidor Cheri", available });
      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toContain('from "catalog_items"');
      expect(statements[0]?.sql).not.toMatch(forbiddenWishlistPattern);
      expect(statements[0]?.parameters).toEqual([catalogItemId]);
    },
  );

  it("names nothing for an item the catalogue does not have", async () => {
    const { database } = scriptedDb(() => []);

    await expect(
      findWishlistCatalogName(catalogItemId, database),
    ).resolves.toBeNull();
  });

  it("names nothing, and reads nothing, for a value that is not a catalogue id", async () => {
    const { database, statements } = scriptedDb();

    await expect(
      findWishlistCatalogName("variety:pomidor-cheri-0000000101", database),
    ).resolves.toBeNull();
    expect(statements).toEqual([]);
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
