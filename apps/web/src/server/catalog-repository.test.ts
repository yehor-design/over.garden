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
  buildCatalogTypeaheadReindexRowsQuery,
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  buildCatalogTypeaheadQuery,
  buildFindSelectableCatalogItemByPublicSlugQuery,
  buildFindSelectableCatalogItemQuery,
  buildInsertCatalogItemNameQuery,
  buildUpsertUserAddedCatalogItemQuery,
  normalizeCatalogPublicSlug,
  normalizeCatalogQuery,
  searchCatalogSuggestionsForTypeahead,
  searchCatalogSuggestionsWithMeili,
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
const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

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
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain(
      'lower("catalog_item_names"."display_name") like $3',
    );
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual(["seeded", "confirmed", "%чері%", 5]);
  });

  it("queries the dedicated Meili index and filters unsafe hits", async () => {
    const calls: Array<{ indexName: string; query: string; limit: number }> =
      [];
    const client = {
      index(indexName: string) {
        return {
          async search(query: string, options: { limit: number }) {
            calls.push({ indexName, query, limit: options.limit });
            return {
              hits: [
                {
                  catalogItemId: "00000000-0000-4000-8000-000000000101",
                  displayName: "Помідор чері",
                  canonicalName: "Помідор чері",
                  catalogKind: "plant_variety",
                  locale: "uk",
                  status: "seeded",
                  source: "internal_seed",
                },
                {
                  catalogItemId: "00000000-0000-4000-8000-000000000101",
                  displayName: "Томат чері",
                  canonicalName: "Помідор чері",
                  catalogKind: "plant_variety",
                  locale: "uk",
                  status: "seeded",
                  source: "internal_seed",
                },
                {
                  catalogItemId: "00000000-0000-4000-8000-000000000201",
                  displayName: "Бабусин перець",
                  canonicalName: "Бабусин перець",
                  catalogKind: "plant_variety",
                  locale: "und",
                  status: "provisional",
                  source: "user_added",
                  createdByUserId: "00000000-0000-0000-0000-000000000001",
                },
              ],
            };
          },
        };
      },
    };

    await expect(
      searchCatalogSuggestionsWithMeili("  ПОМДОР  ", 5, client),
    ).resolves.toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор чері",
        canonicalName: "Помідор чері",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
      },
    ]);
    expect(calls).toEqual([
      {
        indexName: "catalog_typeahead",
        query: "помдор",
        limit: 15,
      },
    ]);
  });

  it("dedupes source-backed Meili hits that represent the same catalog concept", async () => {
    const client = {
      index() {
        return {
          async search() {
            return {
              hits: [
                {
                  catalogItemId: "00000000-0000-4000-8000-000000056002",
                  displayName: "Bergeron 1",
                  canonicalName: "Bergeron 1",
                  catalogKind: "plant_variety",
                  locale: "uk",
                  status: "seeded",
                  source: "ua_state_register",
                },
                {
                  catalogItemId: "00000000-0000-4000-8000-000000064002",
                  displayName: "Bergeron 1",
                  canonicalName: "Bergeron 1",
                  catalogKind: "plant_variety",
                  locale: "uk",
                  status: "seeded",
                  source: "ua_state_register",
                },
                {
                  catalogItemId: "00000000-0000-4000-8000-000000064013",
                  displayName: "Refresh New 64",
                  canonicalName: "Refresh New 64",
                  catalogKind: "plant_variety",
                  locale: "uk",
                  status: "seeded",
                  source: "ua_state_register",
                },
              ],
            };
          },
        };
      },
    };

    await expect(
      searchCatalogSuggestionsWithMeili("bergeron", 8, client),
    ).resolves.toEqual([
      {
        id: "00000000-0000-4000-8000-000000056002",
        displayName: "Bergeron 1",
        canonicalName: "Bergeron 1",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
      },
      {
        id: "00000000-0000-4000-8000-000000064013",
        displayName: "Refresh New 64",
        canonicalName: "Refresh New 64",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "ua_state_register",
      },
    ]);
  });

  it("falls back to canonical catalog rows when the derived Meili index is empty", async () => {
    const fallback = [
      {
        id: "00000000-0000-4000-8000-000000000301",
        displayName: "помідор",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species" as const,
        locale: "uk",
        status: "seeded" as const,
        source: "species_backbone",
      },
    ];
    const calls: string[] = [];

    await expect(
      searchCatalogSuggestionsForTypeahead("помідор", 8, {
        searchWithMeili: async () => {
          calls.push("meili");
          return [];
        },
        searchWithPostgres: async () => {
          calls.push("postgres");
          return fallback;
        },
      }),
    ).resolves.toEqual(fallback);
    expect(calls).toEqual(["meili", "postgres"]);
  });

  it("falls back to canonical catalog rows when the derived Meili index is unavailable", async () => {
    const fallback = [
      {
        id: "00000000-0000-4000-8000-000000000601",
        displayName: "Карпатська",
        canonicalName: "Карпатська бджола",
        catalogKind: "breed" as const,
        locale: "uk",
        status: "seeded" as const,
        source: "ua_official_bee_breed",
      },
    ];

    await expect(
      searchCatalogSuggestionsForTypeahead("Карпатська", 8, {
        searchWithMeili: async () => {
          throw new Error("index not found");
        },
        searchWithPostgres: async () => fallback,
      }),
    ).resolves.toEqual(fallback);
  });

  it("keeps non-empty derived Meili suggestions first while adding canonical Postgres rows", async () => {
    const meiliSuggestion = {
      id: "00000000-0000-4000-8000-000000000621",
      displayName: "Red Cherry",
      canonicalName: "Red Cherry tomato",
      catalogKind: "plant_variety" as const,
      locale: "en",
      status: "seeded" as const,
      source: "grin_genebank_candidate",
    };
    const postgresSuggestion = {
      id: "00000000-0000-4000-8000-000000000301",
      displayName: "помідор",
      canonicalName: "Solanum lycopersicum L.",
      catalogKind: "species" as const,
      locale: "uk",
      status: "seeded" as const,
      source: "species_backbone",
    };

    await expect(
      searchCatalogSuggestionsForTypeahead("Red Cherry", 8, {
        searchWithMeili: async () => [meiliSuggestion],
        searchWithPostgres: async () => [postgresSuggestion],
      }),
    ).resolves.toEqual([meiliSuggestion, postgresSuggestion]);
  });

  it("dedupes stale Meili hits when canonical Postgres rows are merged", async () => {
    const canonicalSuggestion = {
      id: "00000000-0000-4000-8000-000000000301",
      displayName: "помідор",
      canonicalName: "Solanum lycopersicum L.",
      catalogKind: "species" as const,
      locale: "uk",
      status: "seeded" as const,
      source: "species_backbone",
    };

    await expect(
      searchCatalogSuggestionsForTypeahead("помідор", 8, {
        searchWithMeili: async () => [
          {
            ...canonicalSuggestion,
            displayName: "Tomato",
          },
        ],
        searchWithPostgres: async () => [canonicalSuggestion],
      }),
    ).resolves.toEqual([
      {
        ...canonicalSuggestion,
        displayName: "Tomato",
      },
    ]);
  });

  it("validates selected catalog IDs against selectable statuses", () => {
    const compiled = buildFindSelectableCatalogItemQuery(
      testDb,
      "00000000-0000-4000-8000-000000000101",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "seeded",
      "confirmed",
    ]);
  });

  it("normalizes bounded public slugs for activation preselection", () => {
    expect(normalizeCatalogPublicSlug(" pomidor-cheri-0000000101 ")).toBe(
      "pomidor-cheri-0000000101",
    );
    expect(normalizeCatalogPublicSlug("../private")).toBeNull();
    expect(normalizeCatalogPublicSlug("Помідор-чері")).toBeNull();
    expect(normalizeCatalogPublicSlug("a".repeat(97))).toBeNull();
  });

  it("validates public slug preselection against global selectable catalog rows", () => {
    const compiled = buildFindSelectableCatalogItemByPublicSlugQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"public_slug" = $1');
    expect(compiled.sql).toContain('"public_slug" is not null');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.parameters).toEqual([
      "pomidor-cheri-0000000101",
      "seeded",
      "confirmed",
    ]);
  });

  it("builds a reindex row query that excludes owner-scoped catalog items", () => {
    const compiled = buildCatalogTypeaheadReindexRowsQuery(testDb).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" on "catalog_items"."id" = "catalog_item_names"."catalog_item_id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual(["seeded", "confirmed"]);
  });

  it("upserts user-added candidates by owner, normalized name, and locale", () => {
    const compiled = buildUpsertUserAddedCatalogItemQuery(testDb, scope, {
      displayName: "Бабусин перець",
      normalizedName: "бабусин перець",
      locale: "und",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_items"');
    expect(compiled.sql).toContain(
      'on conflict ("created_by_user_id", "normalized_name", "locale") do update',
    );
    expect(compiled.sql).toContain("returning");
    expect(compiled.parameters).toEqual([
      "Бабусин перець",
      "бабусин перець",
      "plant_variety",
      "provisional",
      "user_added",
      null,
      "00000000-0000-0000-0000-000000000001",
      "und",
      expect.any(Date),
    ]);
  });

  it("stores the user-added display name as a primary alias without global identity", () => {
    const compiled = buildInsertCatalogItemNameQuery(testDb, {
      catalogItemId: "00000000-0000-4000-8000-000000000201",
      displayName: "Бабусин перець",
      normalizedName: "бабусин перець",
      locale: "und",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_item_names"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "normalized_name", "locale") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000201",
      "Бабусин перець",
      "бабусин перець",
      "und",
      true,
    ]);
  });

  it("enqueues catalog typeahead reindex work on the matching worker queue", () => {
    const compiled =
      buildEnqueueCatalogTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update',
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("owner");
    expect(JSON.stringify(compiled.parameters)).not.toContain("journal");
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
