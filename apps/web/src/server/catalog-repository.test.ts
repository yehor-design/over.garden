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
import { catalogSuggestionTrustMetadata } from "@/lib/garden/catalog-trust";
import { scopedToUser } from "@/server/request-scope";
import {
  buildCatalogTypeaheadReindexRowsQuery,
  buildEnqueueCatalogMatchSuggestionsRefreshJobQuery,
  buildFindExactSelectableSpeciesByScientificNameQuery,
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  buildFindUserAddedCatalogItemQuery,
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

function catalogSuggestion<
  T extends Parameters<typeof catalogSuggestionTrustMetadata>[0],
>(suggestion: T) {
  return {
    ...suggestion,
    serveClass: "exact" as const,
    ...catalogSuggestionTrustMetadata(suggestion),
  };
}

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
      "generated_alias.source_method = 'generated'",
    );
    expect(compiled.sql).toContain(
      'lower("catalog_item_names"."display_name") like $3',
    );
    expect(compiled.sql).toContain(
      'when "catalog_item_names"."normalized_name" = $4 then 0',
    );
    expect(compiled.sql).toContain(
      'when "catalog_item_names"."normalized_name" like $5 then 1',
    );
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "%чері%",
      "чері",
      "чері%",
      5,
    ]);
  });

  it("maps only exact canonical or accepted scientific species names", () => {
    const compiled = buildFindExactSelectableSpeciesByScientificNameQuery(
      testDb,
      "solanum lycopersicum",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain(
      'left join "catalog_alias_projections" on "catalog_alias_projections"."catalog_item_id" = "catalog_items"."id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" = $1');
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."normalized_name" = $5',
    );
    expect(compiled.sql).toContain('"catalog_alias_projections"."status" = $6');
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."alias_kind" = $7',
    );
    expect(compiled.sql).toContain("select distinct");
    expect(compiled.sql).not.toContain("catalog_item_names");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual([
      "species",
      "seeded",
      "confirmed",
      "solanum lycopersicum",
      "solanum lycopersicum",
      "accepted",
      "accepted_scientific_name",
      2,
    ]);
  });

  it("accepts one evidence-backed Meili typo while filtering unproven fuzzy hits", async () => {
    const calls: Array<{
      indexName: string;
      query: string;
      limit: number;
      matchingStrategy: string;
      showRankingScoreDetails: boolean;
    }> = [];
    const client = {
      index(indexName: string) {
        return {
          async search(
            query: string,
            options: {
              limit: number;
              matchingStrategy: string;
              showRankingScoreDetails: boolean;
            },
          ) {
            calls.push({ indexName, query, ...options });
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
                  _rankingScoreDetails: {
                    exactness: {
                      matchingWords: 0,
                      maxMatchingWords: 1,
                    },
                    typo: { typoCount: 1, maxTypoCount: 1 },
                  },
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
                  catalogItemId: "00000000-0000-4000-8000-000000000301",
                  displayName: "Refresh New 64",
                  canonicalName: "Refresh New 64",
                  catalogKind: "plant_variety",
                  locale: "en",
                  status: "seeded",
                  source: "ua_state_register",
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
        serveClass: "low_confidence",
        trustState: "candidate",
        trustLabel: "Candidate",
        sourceLabel: "OverGarden starter catalog",
        sourceCaveat:
          "Pilot seed row. Use your own name or Unknown if this is not exact.",
        disambiguationLabel: "Plant variety · OverGarden starter catalog · uk",
      },
    ]);
    expect(calls).toEqual([
      {
        indexName: "catalog_typeahead",
        query: "помдор",
        limit: 15,
        matchingStrategy: "all",
        showRankingScoreDetails: true,
      },
    ]);

    await expect(
      searchCatalogSuggestionsWithMeili("  чері  ", 5, client),
    ).resolves.toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор чері",
        canonicalName: "Помідор чері",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "internal_seed",
        serveClass: "exact",
        trustState: "candidate",
        trustLabel: "Candidate",
        sourceLabel: "OverGarden starter catalog",
        sourceCaveat:
          "Pilot seed row. Use your own name or Unknown if this is not exact.",
        disambiguationLabel: "Plant variety · OverGarden starter catalog · uk",
      },
    ]);
  });

  it("serves previously rejected Meili fuzzy evidence as low confidence", async () => {
    const hit = {
      catalogItemId: "00000000-0000-4000-8000-000000000101",
      displayName: "Помідор чері",
      canonicalName: "Помідор чері",
      catalogKind: "plant_variety",
      locale: "uk",
      status: "seeded",
      source: "internal_seed",
    };

    let index = 0;
    for (const _rankingScoreDetails of [
      {
        exactness: { matchingWords: 0, maxMatchingWords: 0 },
        typo: { typoCount: 1, maxTypoCount: 1 },
      },
      {
        exactness: { matchingWords: 0, maxMatchingWords: 1 },
        typo: { typoCount: 2, maxTypoCount: 2 },
      },
    ]) {
      index += 1;
      await expect(
        searchCatalogSuggestionsWithMeili("помдрр", 5, {
          index: () => ({
            search: async () => ({
              hits: [
                {
                  ...hit,
                  catalogItemId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
                  _rankingScoreDetails,
                },
              ],
            }),
          }),
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          serveClass: "low_confidence",
        }),
      ]);
    }
  });

  it("serves accepted generated aliases and homonymous names with explicit classes", async () => {
    const base = {
      displayName: "Роза",
      canonicalName: "Rosa",
      catalogKind: "species",
      locale: "uk",
      status: "confirmed",
      source: "species_backbone",
    } as const;

    const generated = await searchCatalogSuggestionsWithMeili("роза", 5, {
      index: () => ({
        search: async () => ({
          hits: [
            {
              ...base,
              catalogItemId: "00000000-0000-4000-8000-000000000401",
              serveClass: "generated",
            },
          ],
        }),
      }),
    });
    expect(generated).toEqual([
      expect.objectContaining({ serveClass: "generated" }),
    ]);

    const homonymous = await searchCatalogSuggestionsWithMeili("роза", 5, {
      index: () => ({
        search: async () => ({
          hits: [
            {
              ...base,
              catalogItemId: "00000000-0000-4000-8000-000000000402",
            },
            {
              ...base,
              canonicalName: "Rhododendron",
              catalogItemId: "00000000-0000-4000-8000-000000000403",
            },
          ],
        }),
      }),
    });
    expect(homonymous.map(({ serveClass }) => serveClass)).toEqual([
      "homonymous",
      "homonymous",
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
        serveClass: "exact",
        trustState: "source_backed",
        trustLabel: "Source-backed",
        sourceLabel: "Ukraine variety register",
        sourceCaveat:
          "Register-backed variety row. Compare crop and name if aliases collide.",
        disambiguationLabel: "Plant variety · Ukraine variety register · uk",
      },
    ]);
  });

  it("falls back to canonical catalog rows when the derived Meili index is empty", async () => {
    const fallback = [
      catalogSuggestion({
        id: "00000000-0000-4000-8000-000000000301",
        displayName: "помідор",
        canonicalName: "Solanum lycopersicum L.",
        catalogKind: "species" as const,
        locale: "uk",
        status: "seeded" as const,
        source: "species_backbone",
      }),
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
      catalogSuggestion({
        id: "00000000-0000-4000-8000-000000000601",
        displayName: "Карпатська",
        canonicalName: "Карпатська бджола",
        catalogKind: "breed" as const,
        locale: "uk",
        status: "seeded" as const,
        source: "ua_official_bee_breed",
      }),
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
    const meiliSuggestion = catalogSuggestion({
      id: "00000000-0000-4000-8000-000000000621",
      displayName: "Red Cherry",
      canonicalName: "Red Cherry tomato",
      catalogKind: "plant_variety" as const,
      locale: "en",
      status: "seeded" as const,
      source: "grin_genebank_candidate",
    });
    const postgresSuggestion = catalogSuggestion({
      id: "00000000-0000-4000-8000-000000000301",
      displayName: "помідор",
      canonicalName: "Solanum lycopersicum L.",
      catalogKind: "species" as const,
      locale: "uk",
      status: "seeded" as const,
      source: "species_backbone",
    });

    await expect(
      searchCatalogSuggestionsForTypeahead("Red Cherry", 8, {
        searchWithMeili: async () => [meiliSuggestion],
        searchWithPostgres: async () => [postgresSuggestion],
      }),
    ).resolves.toEqual([meiliSuggestion, postgresSuggestion]);
  });

  it("keeps ambiguous alias choices separate when type or source differs", async () => {
    const variety = catalogSuggestion({
      id: "00000000-0000-4000-8000-000000089001",
      displayName: "Albion",
      canonicalName: "Albion strawberry",
      catalogKind: "plant_variety" as const,
      locale: "en",
      status: "seeded" as const,
      source: "eu_oj_eur_lex_common_catalogue",
    });
    const species = catalogSuggestion({
      id: "00000000-0000-4000-8000-000000089002",
      displayName: "Albion",
      canonicalName: "Albion sp.",
      catalogKind: "species" as const,
      locale: "en",
      status: "seeded" as const,
      source: "species_backbone",
    });

    await expect(
      searchCatalogSuggestionsForTypeahead("Albion", 8, {
        searchWithMeili: async () => [variety],
        searchWithPostgres: async () => [species],
      }),
    ).resolves.toEqual([
      { ...variety, serveClass: "homonymous" },
      { ...species, serveClass: "homonymous" },
    ]);
    expect(variety.disambiguationLabel).toBe(
      "Plant variety · EU Official Journal · en",
    );
    expect(species.disambiguationLabel).toBe("Species · Species backbone · en");
  });

  it("dedupes stale Meili hits when canonical Postgres rows are merged", async () => {
    const canonicalSuggestion = catalogSuggestion({
      id: "00000000-0000-4000-8000-000000000301",
      displayName: "помідор",
      canonicalName: "Solanum lycopersicum L.",
      catalogKind: "species" as const,
      locale: "uk",
      status: "seeded" as const,
      source: "species_backbone",
    });

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
    expect(compiled.sql).toContain(
      "generated_alias.source_method = 'generated'",
    );
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual(["seeded", "confirmed"]);
  });

  it("inserts user-added candidates with a schema-compatible conflict fallback", () => {
    const compiled = buildUpsertUserAddedCatalogItemQuery(testDb, scope, {
      displayName: "Бабусин перець",
      normalizedName: "бабусин перець",
      locale: "und",
      catalogKind: "plant_variety",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_items"');
    expect(compiled.sql).toContain("on conflict do nothing");
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
    ]);
  });

  it("reads a conflicting user-added candidate only inside the owner and kind scope", () => {
    const compiled = buildFindUserAddedCatalogItemQuery(testDb, scope, {
      normalizedName: "місцева руда кішка",
      locale: "und",
      catalogKind: "species",
    }).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"created_by_user_id" = $1');
    expect(compiled.sql).toContain('"normalized_name" = $2');
    expect(compiled.sql).toContain('"locale" = $3');
    expect(compiled.sql).toContain('"catalog_kind" = $4');
    expect(compiled.sql).toContain('"status" = $5');
    expect(compiled.sql).toContain('"source" = $6');
    expect(compiled.sql).toContain("for update");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "місцева руда кішка",
      "und",
      "species",
      "provisional",
      "user_added",
    ]);
  });

  it("stores user-added animal and bee identities as provisional species", () => {
    const compiled = buildUpsertUserAddedCatalogItemQuery(testDb, scope, {
      displayName: "Місцева руда кішка",
      normalizedName: "місцева руда кішка",
      locale: "und",
      catalogKind: "species",
    }).compile();

    expect(compiled.parameters).toContain("species");
    expect(compiled.sql).toContain('"catalog_kind"');
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
    const normalizedSql = compiled.sql.replace(/\s+/g, " ");

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update',
    );
    expect(normalizedSql).toContain(
      "case when job_queue.status = 'processing' then job_queue.status else 'pending' end",
    );
    expect(normalizedSql).toContain(
      "\"rerun_requested\" = (job_queue.status = 'processing')",
    );
    expect(normalizedSql).toContain(
      "case when job_queue.status = 'processing' then job_queue.locked_at else null end",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("owner");
    expect(JSON.stringify(compiled.parameters)).not.toContain("journal");
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
      null,
      expect.any(Date),
    ]);
  });

  it("enqueues a privacy-safe deterministic match refresh for a provisional id", () => {
    const compiled = buildEnqueueCatalogMatchSuggestionsRefreshJobQuery(
      testDb,
      "00000000-0000-4000-8000-000000000201",
    ).compile();
    const normalizedSql = compiled.sql.replace(/\s+/g, " ");

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update',
    );
    expect(normalizedSql).toContain(
      "case when job_queue.status = 'processing' then job_queue.status else 'pending' end",
    );
    expect(normalizedSql).toContain(
      "\"rerun_requested\" = (job_queue.status = 'processing')",
    );
    expect(normalizedSql).toContain(
      "case when job_queue.status = 'processing' then job_queue.locked_at else null end",
    );
    expect(compiled.parameters).toEqual([
      "matching",
      {
        kind: "catalog_match_suggestions_refresh",
        sourceCatalogItemId: "00000000-0000-4000-8000-000000000201",
      },
      "catalog-match-suggestions:00000000-0000-4000-8000-000000000201",
      expect.any(Date),
      null,
      expect.any(Date),
    ]);
    const serialized = JSON.stringify(compiled.parameters).toLowerCase();
    for (const forbidden of [
      "owner",
      "journal",
      "email",
      "media",
      "latitude",
      "longitude",
      "raw_payload",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
