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
  buildCatalogTypeaheadStatement,
  buildFindSelectableCatalogItemQuery,
  buildStandardSpeciesTypeaheadStatement,
  buildUpsertCatalogSearchMissQuery,
  CATALOG_TYPEAHEAD_DEADLINE_MS,
  normalizeCatalogLabel,
  normalizeCatalogQuery,
  recordCatalogSearchMiss,
  searchCatalogSuggestionsForTypeaheadResult,
  searchStandardSpeciesForTypeahead,
  STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS,
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

function sqlRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    node_kind: "taxon",
    public_slug: "solanum-lycopersicum",
    species_slug: null,
    display_name: "помідор",
    matched_name: "томат",
    parent_display_name: null,
    match_class: 1,
    base_popularity: 0,
    market: false,
    similarity: 0.63,
    ...overrides,
  };
}

describe("catalog picker query", () => {
  it("normalizes the query with the shared normalizer and caps it at 120 characters", () => {
    expect(normalizeCatalogQuery("  Мар’яна   F1 ")).toBe("мар'яна f1");
    expect(normalizeCatalogQuery("Café  ×  Tomato")).toBe("cafe x tomato");
    expect(normalizeCatalogQuery("я".repeat(200))).toHaveLength(120);
  });

  it("is one statement over names: a prefix half, a fuzzy half, one row per organism, ranked as ADR-0026 D7 says", () => {
    const compiled = buildCatalogTypeaheadStatement({
      normalizedQuery: "помі_дор",
      locale: "bg",
      objectKind: "animal",
    }).compile(testDb);

    expect(compiled.sql.match(/\bselect\b/giu)?.length).toBeGreaterThan(1);
    expect(compiled.sql).toContain("union all");
    expect(compiled.sql).toContain("n.normalized_name like $");
    expect(compiled.sql).toContain("n.normalized_name % $");
    expect(compiled.sql).toContain("similarity(n.normalized_name, $");
    expect(compiled.sql).toContain(">= 0.3");
    expect(compiled.sql).toContain("distinct on (c.catalog_item_id)");
    expect(compiled.sql).toContain("ci.identity_state = 'active'");
    expect(compiled.sql).toContain("ci.created_by_user_id is null");
    expect(compiled.sql).toContain("h.name_type = 'vernacular' and h.locale = $");
    expect(compiled.sql).toContain(
      "h.name_type in ('scientific_accepted', 'scientific_synonym')",
    );
    expect(compiled.sql).toContain(
      'distinct on (ci.node_kind collate "C", ci.normalized_name collate "C")',
    );
    // A form's species comes from its form_of relation, never from the tree.
    expect(compiled.sql).toContain("r.relation_type = 'form_of'");
    expect(compiled.sql).toContain(
      "when s.node_kind = 'taxon' then coalesce(vernacular.display_name, s.canonical_name)",
    );
    expect(compiled.sql).toMatch(
      /order by s\.match_class,\s+s\.base_popularity desc,\s+s\.market desc,\s+s\.search_weight desc,\s+s\.has_registered_forms desc,\s+s\.is_host desc,\s+s\.similarity desc/u,
    );
    expect(compiled.sql).toContain("limit 8");
    // The kind filter lives in SQL: a species only from the standard base,
    // for the kind the base records (ADR-0035 D3), a cultivar for plants, a
    // breed for animals. The rest of the catalogue is not offered.
    expect(compiled.sql).toContain("ci.node_kind = 'breed'");
    expect(compiled.sql).toContain("(ci.node_kind = 'taxon' and base.object_kind = $");
    expect(
      compiled.sql.match(
        /left join catalog_standard_species as base on base\.catalog_item_id = ci\.id/gu,
      )?.length,
    ).toBe(2);
    expect(compiled.sql).not.toContain("ci.kingdom");
    // The base's popularity ranks right after the match class, on both sides.
    expect(compiled.sql).toContain("coalesce(base.popularity, 0) as base_popularity");
    expect(compiled.sql).toMatch(/r\.match_class,\s+coalesce\(base\.popularity, 0\) desc,/u);
    // The prefix pattern escapes LIKE metacharacters; the raw query feeds the
    // trigram side and the class tests.
    expect(compiled.parameters).toContain("помі\\_дор%");
    expect(compiled.parameters).toContain("помі_дор");
    expect(compiled.parameters).toContain("bg");
    expect(compiled.parameters).toContain("animal");
    expect(compiled.sql).not.toMatch(/meili|trust|status in/iu);

    // Similarity on the prefix side is an intersection count over the stored
    // trigram sets of migration 0065, in pg_trgm's own float4 formula —
    // never `similarity()` per row, which re-tokenises every name.
    expect(compiled.sql).toContain("catalog_trigram_ints(show_trgm($");
    expect(compiled.sql).toContain("icount(n.search_trigrams & (select trigrams from q))");
    expect(compiled.sql).toMatch(
      /h\.shared::float4\s+\/ \(\(select trigram_count from q\) \+ h\.trigram_count - h\.shared\)::float4/u,
    );
    // The fuzzy side runs only when the prefix side cannot fill the list, as a
    // one-time filter Postgres evaluates before the trigram scan.
    expect(compiled.sql).toContain(
      "where (select count(*) from prefix_scored) < 8",
    );
    // Short queries take their fuzzy candidates from the intarray index over
    // the stored sets, with the same threshold; longer ones from pg_trgm.
    expect(compiled.sql).toContain("(select trigram_count from q) <= 6");
    // A typo is forgiven in the reader's language and in Latin only.
    expect(compiled.sql.match(/and n\.locale in \(\$\d+, 'la'\)/gu)?.length).toBe(2);
    expect(compiled.sql).toContain("n.search_trigrams @@ (");
    expect(compiled.sql).toContain("catalog_trigram_query(trigrams, (3 * trigram_count + 9) / 10)");
    expect(compiled.sql).toContain("(select trigram_count from q) > 6");
    // A fuzzy organism is merged in only when no prefix name found it and no
    // prefix organism already represents its duplicate cluster.
    expect(compiled.sql).toContain("not exists (select 1 from prefix_scored as p where p.id = f.id)");
    expect(compiled.sql).toContain("where p.node_kind = f.node_kind and p.normalized_name = f.normalized_name");
    // One row per duplicate cluster, the cluster compared by byte equality.
    expect(compiled.sql.match(/distinct on \(ci\.node_kind collate "C", ci\.normalized_name collate "C"\)/gu)?.length).toBe(2);
  });

  it("chooses the eight rows before decorating them, not after", () => {
    // The four lateral joins below cost an index search each, per row. Before
    // the shortlist they ran for every candidate: against production the
    // Ukrainian prefix for sunflower matches 2,395 names, because the state
    // register lists thousands of hybrids, and the statement spent about 410
    // of its 442 ms building display names for rows the limit then discarded —
    // which is the 503 a gardener saw when typing a common crop.
    const compiled = buildCatalogTypeaheadStatement({
      normalizedQuery: "соняшник",
      locale: "uk",
      objectKind: "plant",
    }).compile(testDb);

    const shortlist = compiled.sql.indexOf("shortlist as (");
    const decoration = compiled.sql.indexOf("from shortlist as s");
    expect(shortlist).toBeGreaterThan(-1);
    expect(decoration).toBeGreaterThan(shortlist);
    // The limit belongs to the shortlist, so the decoration below can only
    // ever see the rows that survive.
    expect(compiled.sql.slice(shortlist, decoration)).toContain("from prefix_scored as p");
    expect(compiled.sql.slice(shortlist, decoration)).toContain("limit 8");
    // Nothing the final ordering reads comes from a joined table: that is what
    // makes choosing first and decorating second give the same eight rows.
    const finalOrderBy = compiled.sql.slice(compiled.sql.lastIndexOf("order by"));
    expect(finalOrderBy).toContain("s.match_class");
    expect(finalOrderBy).not.toMatch(/\b(vernacular|parent|parent_vernacular|form)\./u);
  });

  it("asks the trigram index only where it can change the answer", () => {
    // A two-character query has one trigram, so `%` matches tens of thousands
    // of names and the recheck throws nearly all away: measured against
    // production, the prefix "so" read 45,095 index entries and 4,520 heap
    // pages to contribute one row, and across every two-character prefix in
    // the fingerprint fixture it never changed the eight rows returned.
    const short = buildCatalogTypeaheadStatement({
      normalizedQuery: "со",
      locale: "uk",
      objectKind: "plant",
    }).compile(testDb);
    expect(short.sql).not.toContain("union all");
    expect(short.sql).not.toContain("n.normalized_name % $");

    // From three characters it earns its keep — it is what finds томат for a
    // half-typed or misspelt name — so the arm stays.
    const long = buildCatalogTypeaheadStatement({
      normalizedQuery: "сон",
      locale: "uk",
      objectKind: "plant",
    }).compile(testDb);
    expect(long.sql).toContain("union all");
    expect(long.sql).toContain("n.normalized_name % $");
    expect(long.sql).toContain(">= 0.3");
  });

  it("never reads catalog rows for a query shorter than two characters", async () => {
    let executed = 0;
    const result = await searchCatalogSuggestionsForTypeaheadResult(
      " т ",
      { objectKind: "plant", locale: "uk" },
      {
        runStatement: async () => {
          executed += 1;
          return [];
        },
      },
    );

    expect(executed).toBe(0);
    expect(result).toEqual({ suggestions: [], state: "empty", databaseMs: 0 });
  });

  it("maps rows to the bounded picker shape: display name in the locale, the matched name only when it differs, the species of a form, the card path", async () => {
    const result = await searchCatalogSuggestionsForTypeaheadResult(
      "Томат",
      { objectKind: "plant", locale: "uk" },
      {
        runStatement: async () => [
          sqlRow(),
          sqlRow({
            id: "00000000-0000-4000-8000-000000000102",
            node_kind: "cultivar",
            public_slug: "de-barao-0000000102",
            species_slug: "solanum-lycopersicum",
            display_name: "Де Барао",
            matched_name: "де барао",
            parent_display_name: "помідор",
            match_class: 3,
          }),
          sqlRow({
            id: "00000000-0000-4000-8000-000000000103",
            node_kind: "breed",
            public_slug: null,
            display_name: "карпатська",
            matched_name: "Карпатська бджола",
            match_class: 4,
          }),
        ],
      },
    );

    expect(result.state).toBe("ready");
    expect(result.suggestions).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор",
        matchedName: "томат",
        kind: "species",
        parentDisplayName: null,
        publicPath: "/species/solanum-lycopersicum",
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        displayName: "Де Барао",
        matchedName: null,
        kind: "cultivar",
        parentDisplayName: "Помідор",
        publicPath: "/species/solanum-lycopersicum/de-barao-0000000102",
      },
      {
        id: "00000000-0000-4000-8000-000000000103",
        displayName: "Карпатська",
        matchedName: "Карпатська бджола",
        kind: "breed",
        parentDisplayName: null,
        publicPath: null,
      },
    ]);
    expect(JSON.stringify(result.suggestions)).not.toMatch(
      /source|status|trust|caveat|serveClass/u,
    );
  });

  it("reports an empty answer as empty, and lets a failed read reject so the route can degrade", async () => {
    await expect(
      searchCatalogSuggestionsForTypeaheadResult(
        "помідор",
        { objectKind: "plant" },
        { runStatement: async () => [] },
      ),
    ).resolves.toMatchObject({ suggestions: [], state: "empty" });
    await expect(
      searchCatalogSuggestionsForTypeaheadResult(
        "помідор",
        { objectKind: "plant" },
        {
          runStatement: async () => {
            throw new Error("canceling statement due to statement timeout");
          },
        },
      ),
    ).rejects.toThrow(/statement timeout/u);
    expect(CATALOG_TYPEAHEAD_DEADLINE_MS).toBe(400);
  });
});

describe("the species step's query (OVE-524)", () => {
  it("reads the standard base of one kind and the base's own names, and nothing else of the catalogue", () => {
    const compiled = buildStandardSpeciesTypeaheadStatement({
      normalizedQuery: "курка",
      locale: "uk",
      objectKind: "animal",
    }).compile(testDb);
    // The work starts at the base, so it is bounded by the base, not by the
    // query: no prefix or trigram scan over every name in the catalogue.
    expect(compiled.sql).toMatch(
      /base as materialized \(\s+select b\.catalog_item_id, b\.popularity\s+from catalog_standard_species as b/u,
    );
    expect(compiled.sql).toContain(
      "join catalog_item_names as n on n.catalog_item_id = base.catalog_item_id",
    );
    expect(compiled.sql).not.toContain("n.normalized_name like");
    expect(compiled.sql).not.toContain("n.normalized_name %");
    expect(compiled.sql).toContain("ci.node_kind = 'taxon'");
    expect(compiled.parameters).toContain("animal");
    expect(compiled.parameters).toContain("курка%");
  });

  it("forgives a typo from three characters, in the reader's language and Latin only", () => {
    const short = buildStandardSpeciesTypeaheadStatement({
      normalizedQuery: "ку",
      locale: "uk",
      objectKind: "animal",
    }).compile(testDb);
    expect(short.sql).toContain("when false");
    const long = buildStandardSpeciesTypeaheadStatement({
      normalizedQuery: "курк",
      locale: "bg",
      objectKind: "animal",
    }).compile(testDb);
    expect(long.sql).toContain("when true");
    expect(long.sql).toMatch(/s\.locale in \(\$\d+, 'la'\)/u);
  });

  it("has a deadline for the first search after a cold start, longer than the whole picker's", () => {
    // Measured on production on 2026-09-26: the whole-catalogue statement on
    // a fresh backend spent 89.6 ms planning and 277 ms executing; the base
    // alone runs in about 60 ms on a fresh backend and 4 ms warm.
    expect(STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS).toBe(1000);
    expect(STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS).toBeGreaterThan(
      CATALOG_TYPEAHEAD_DEADLINE_MS,
    );
  });

  it("maps base rows to species suggestions with the species page as the path", async () => {
    const result = await searchStandardSpeciesForTypeahead(
      "Курка",
      { objectKind: "animal", locale: "uk" },
      {
        runStatement: async () => [
          sqlRow({
            id: "00000000-0000-4000-8000-000000000201",
            public_slug: "gallus-gallus-domesticus",
            display_name: "курка",
            matched_name: "Курка",
            match_class: 0,
          }),
        ],
      },
    );
    expect(result.suggestions).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000201",
        displayName: "Курка",
        matchedName: null,
        kind: "species",
        parentDisplayName: null,
        publicPath: "/species/gallus-gallus-domesticus",
      },
    ]);
  });

  it("never reads for a query shorter than two characters", async () => {
    let executed = 0;
    const result = await searchStandardSpeciesForTypeahead(
      "к",
      { objectKind: "animal" },
      {
        runStatement: async () => {
          executed += 1;
          return [];
        },
      },
    );
    expect(executed).toBe(0);
    expect(result.state).toBe("empty");
  });
});

describe("catalog search misses", () => {
  it("upserts one row per normalized query, locale and kind, bumping the counter on repeat", () => {
    const compiled = buildUpsertCatalogSearchMissQuery(testDb, {
      queryNormalized: "де барао",
      locale: "uk",
      objectKind: "plant",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_search_misses"');
    expect(compiled.sql).toContain(
      'on conflict ("query_normalized", "locale", "object_kind") do update set "occurrences" = catalog_search_misses.occurrences + 1, "last_seen_at" = now()',
    );
    expect(compiled.parameters).toEqual(["де барао", "uk", "plant", 1]);
  });

  it("records nothing for a query shorter than three characters and never a raw string longer than 120", async () => {
    const calls: Array<{ queryNormalized: string }> = [];
    const executor = {
      insertInto: () => ({
        values: (values: { query_normalized: string }) => {
          calls.push({ queryNormalized: values.query_normalized });
          return {
            onConflict: () => ({
              returning: () => ({
                executeTakeFirst: async () => ({
                  queryNormalized: values.query_normalized,
                  occurrences: 2,
                }),
              }),
            }),
          };
        },
      }),
    } as unknown as Kysely<Database>;

    await expect(
      recordCatalogSearchMiss(
        { query: "  де ", locale: "uk", objectKind: "plant" },
        executor,
      ),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);

    const long = await recordCatalogSearchMiss(
      { query: `${"Де Барао ".repeat(30)}`, locale: "bg", objectKind: "animal" },
      executor,
    );
    expect(long?.occurrences).toBe(2);
    expect(long?.queryNormalized.length).toBeLessThanOrEqual(120);
    expect(calls[0]?.queryNormalized).toBe(long?.queryNormalized);
  });
});

describe("catalog labels and selectable items", () => {
  it("normalizes a gardener's own name as text between 1 and 120 characters", () => {
    expect(normalizeCatalogLabel("  Де   Барао ")).toBe("Де Барао");
    expect(() => normalizeCatalogLabel("   ")).toThrow(/required/u);
    expect(() => normalizeCatalogLabel("x".repeat(121))).toThrow(/120/u);
  });

  it("validates selected catalog IDs against active, selectable, global rows", () => {
    const compiled = buildFindSelectableCatalogItemQuery(
      testDb,
      "00000000-0000-4000-8000-000000000101",
    ).compile();

    expect(compiled.sql).toContain('"identity_state" = ');
    expect(compiled.sql).toContain('"identity_state" = ');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",      "active",
    ]);
  });
});

