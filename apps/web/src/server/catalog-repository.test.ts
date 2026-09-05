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
  buildCatalogTypeaheadReindexRowsQuery,
  buildCatalogTypeaheadStatement,
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  buildFindSelectableCatalogItemByPublicSlugQuery,
  buildFindSelectableCatalogItemQuery,
  buildUpsertCatalogSearchMissQuery,
  CATALOG_TYPEAHEAD_DEADLINE_MS,
  normalizeCatalogLabel,
  normalizeCatalogPublicSlug,
  normalizeCatalogQuery,
  recordCatalogSearchMiss,
  searchCatalogSuggestionsForTypeaheadResult,
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
    display_name: "помідор",
    matched_name: "томат",
    parent_display_name: null,
    match_class: 1,
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
      "partition by ci.node_kind, ci.normalized_name",
    );
    // A form's species comes from its form_of relation, never from the tree.
    expect(compiled.sql).toContain("r.relation_type = 'form_of'");
    expect(compiled.sql).toContain(
      "when s.node_kind = 'taxon' then coalesce(vernacular.display_name, s.canonical_name)",
    );
    expect(compiled.sql).toMatch(
      /order by s\.match_class,\s+s\.market desc,\s+s\.search_weight desc,\s+s\.has_registered_forms desc,\s+s\.is_host desc,\s+s\.similarity desc/u,
    );
    expect(compiled.sql).toContain("limit 8");
    // The kind filter lives in SQL: a taxon by kingdom, a cultivar for plants,
    // a breed for animals.
    expect(compiled.sql).toContain("ci.node_kind = 'breed'");
    expect(compiled.sql).toContain("ci.kingdom = 'Animalia'");
    expect(compiled.sql).toContain(
      "ci.kingdom not in ('Animalia', 'Bacteria', 'Viruses', 'Archaea')",
    );
    // The prefix pattern escapes LIKE metacharacters; the raw query feeds the
    // trigram side and the class tests.
    expect(compiled.parameters).toContain("помі\\_дор%");
    expect(compiled.parameters).toContain("помі_дор");
    expect(compiled.parameters).toContain("bg");
    expect(compiled.parameters).toContain("animal");
    expect(compiled.sql).not.toMatch(/meili|trust|status in/iu);
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
        publicPath: "/variety/de-barao-0000000102",
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
    expect(CATALOG_TYPEAHEAD_DEADLINE_MS).toBe(150);
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

    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).toContain('"identity_state" = $4');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "seeded",
      "confirmed",
      "active",
    ]);
  });

  it("normalizes bounded public slugs for activation preselection", () => {
    expect(normalizeCatalogPublicSlug("  pomidor-cheri-0000000101 ")).toBe(
      "pomidor-cheri-0000000101",
    );
    expect(normalizeCatalogPublicSlug("Pomidor Cheri")).toBeNull();
    expect(normalizeCatalogPublicSlug("a".repeat(97))).toBeNull();
  });

  it("validates public slug preselection against active global selectable rows", () => {
    const compiled = buildFindSelectableCatalogItemByPublicSlugQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile();

    expect(compiled.sql).toContain('"public_slug" = $1');
    expect(compiled.sql).toContain('"public_slug" is not null');
    expect(compiled.sql).toContain('"identity_state" = $4');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.parameters).toEqual([
      "pomidor-cheri-0000000101",
      "seeded",
      "confirmed",
      "active",
    ]);
  });
});

describe("Meilisearch reindex rows (kept until the closeout retires the job kind)", () => {
  it("builds a reindex row query that excludes owner-scoped and retired items", () => {
    const compiled = buildCatalogTypeaheadReindexRowsQuery(testDb).compile();

    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain('"catalog_items"."identity_state" = $3');
    expect(compiled.sql).toContain('"catalog_items"."created_by_user_id" is null');
    expect(compiled.sql).toContain("generated_alias.source_method = 'generated'");
    expect(compiled.parameters).toEqual(["seeded", "confirmed", "active"]);
  });

  it("enqueues catalog typeahead reindex work on the matching worker queue", () => {
    const compiled = buildEnqueueCatalogTypeaheadReindexJobQuery(
      testDb,
    ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update set',
    );
    expect(compiled.parameters).toContain("matching");
    expect(compiled.parameters).toContain("catalog-typeahead-reindex");
  });
});
