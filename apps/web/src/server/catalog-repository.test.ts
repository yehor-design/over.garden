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
import {
  buildCatalogTypeaheadQuery,
  buildFindSelectableCatalogItemQuery,
  normalizeCatalogQuery,
} from "./catalog-repository";

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

describe("catalog repository query contracts", () => {
  it("normalizes bounded typeahead queries without preserving raw spacing", () => {
    expect(normalizeCatalogQuery("  Помідор   чері  ")).toBe("помідор чері");
  });

  it("searches only safe catalog tables for seeded or confirmed suggestions", () => {
    const compiled = buildCatalogTypeaheadQuery(testDb, "чері", 5).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" on "catalog_items"."id" = "catalog_item_names"."catalog_item_id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain(
      'lower("catalog_item_names"."display_name") like $3',
    );
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.parameters).toEqual(["seeded", "confirmed", "%чері%", 5]);
  });

  it("validates selected catalog IDs against selectable statuses", () => {
    const compiled = buildFindSelectableCatalogItemQuery(
      testDb,
      "00000000-0000-4000-8000-000000000101",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "seeded",
      "confirmed",
    ]);
  });
});
