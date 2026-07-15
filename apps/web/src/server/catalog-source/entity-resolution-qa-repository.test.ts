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
  assertCatalogEntityResolutionEvidenceSafe,
  buildCatalogEntityResolutionAliasCollisionRowsQuery,
  buildCatalogEntityResolutionCatalogRowsQuery,
  buildCatalogEntityResolutionFuzzyDuplicateRowsQuery,
  buildCatalogEntityResolutionQaReport,
  buildEnqueueCatalogFuzzyDuplicateQaRefreshJobQuery,
  buildCatalogEntityResolutionSourceCandidateSummaryQuery,
  type CatalogEntityResolutionAliasCollisionRow,
  type CatalogEntityResolutionCatalogRow,
  type CatalogEntityResolutionFuzzyDuplicateRow,
  type CatalogEntityResolutionSourceCandidateSummaryRow,
} from "./entity-resolution-qa-repository";

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

const catalogRows: CatalogEntityResolutionCatalogRow[] = [
  {
    catalogItemId: "00000000-0000-4000-8000-000000081001",
    canonicalName: "Bergeron 1",
    normalizedName: "bergeron 1",
    catalogKind: "plant_variety",
    status: "seeded",
    source: "ua_state_register",
    publicSlug: "bergeron-1-ua-state-register",
    typeaheadNameCount: 4,
    sourceLinkCount: 1,
    sourceNames: "UA State Register",
    sourceSlugs: "ua-state-register",
  },
  {
    catalogItemId: "00000000-0000-4000-8000-000000081002",
    canonicalName: "Bergeron 1",
    normalizedName: "bergeron 1",
    catalogKind: "plant_variety",
    status: "seeded",
    source: "eu_oj_eur_lex_common_catalogue",
    publicSlug: "bergeron-1-eu-oj",
    typeaheadNameCount: 2,
    sourceLinkCount: 2,
    sourceNames: "EU Official Journal / EUR-Lex Common Catalogue",
    sourceSlugs: "eu-oj-eur-lex-common-catalogue",
  },
  {
    catalogItemId: "00000000-0000-4000-8000-000000081003",
    canonicalName: "Bergeron 1",
    normalizedName: "bergeron 1",
    catalogKind: "species",
    status: "seeded",
    source: "species_backbone",
    publicSlug: "bergeron-1-species-backbone",
    typeaheadNameCount: 1,
    sourceLinkCount: 1,
    sourceNames: "Species backbone",
    sourceSlugs: "species-backbone",
  },
];

const aliasRows: CatalogEntityResolutionAliasCollisionRow[] = [
  {
    normalizedAlias: "red cherry",
    sampleDisplayName: "Red Cherry",
    catalogItemCount: 2,
    sourceCount: 2,
    canonicalNames: "Red Cherry tomato | Red Cherry duplicate proof row",
    catalogKinds: "plant_variety",
    sources: "grin_genebank_candidate, ua_state_register",
  },
];

const sourceCandidateRows: CatalogEntityResolutionSourceCandidateSummaryRow[] =
  [
    {
      sourceSlug: "grin-global",
      sourceName: "USDA GRIN/NPGS long-tail accession proof subset",
      sourceVersion: "2026-07-02-ove88-bulk-proof-subset",
      projectionStatus: "quarantined",
      reviewStatus: "review_needed",
      curatorDecision: "needs_taxonomy_review",
      candidateKind: "accession",
      sampleDisplayName: "Kyiv Long cucumber proof row",
      rowCount: 2,
    },
    {
      sourceSlug: "grin-global",
      sourceName: "USDA GRIN/NPGS long-tail accession proof subset",
      sourceVersion: "2026-07-02-ove88-bulk-proof-subset",
      projectionStatus: "rejected",
      reviewStatus: "candidate_review",
      curatorDecision: "reject_duplicate",
      candidateKind: "accession",
      sampleDisplayName: "Red Cherry duplicate proof row",
      rowCount: 1,
    },
  ];

const fuzzyDuplicateRows: CatalogEntityResolutionFuzzyDuplicateRow[] = [
  {
    pairKey: "ove162-red-cherry-pair",
    leftCatalogItemId: "00000000-0000-4000-8000-000000162001",
    leftCanonicalName: "Red Cherry",
    leftNormalizedName: "red cherry",
    leftCatalogKind: "plant_variety",
    leftStatus: "seeded",
    leftSource: "ua_state_register",
    leftPublicSlug: "red-cherry-ua",
    leftLocale: "uk",
    rightCatalogItemId: "00000000-0000-4000-8000-000000162002",
    rightCanonicalName: "Red Chery",
    rightNormalizedName: "red chery",
    rightCatalogKind: "plant_variety",
    rightStatus: "seeded",
    rightSource: "eu_oj_eur_lex_common_catalogue",
    rightPublicSlug: "red-chery-eu",
    rightLocale: "uk",
    score: 95,
    scoreBucket: "high",
    reasonCodes: [
      "rapidfuzz_name_similarity",
      "same_catalog_kind",
      "same_locale",
    ],
    localeRelation: "same_locale",
    recommendedAction: "merge_review",
    matcherVersion: "ove162-v1",
    generatedAt: new Date("2026-07-15T12:00:00.000Z"),
    evidenceStatus: "current",
    totalCount: 1,
  },
];

describe("catalog entity-resolution QA repository", () => {
  it("builds report queries from safe catalog/source projection fields only", () => {
    const catalog =
      buildCatalogEntityResolutionCatalogRowsQuery(testDb).compile();
    const alias =
      buildCatalogEntityResolutionAliasCollisionRowsQuery(testDb).compile();
    const source =
      buildCatalogEntityResolutionSourceCandidateSummaryQuery(testDb).compile();
    const fuzzy =
      buildCatalogEntityResolutionFuzzyDuplicateRowsQuery(testDb).compile();
    const combinedSql = [catalog.sql, alias.sql, source.sql, fuzzy.sql].join(
      "\n",
    );

    expect(combinedSql).toContain('from "catalog_items"');
    expect(combinedSql).toContain('from "catalog_item_names"');
    expect(combinedSql).toContain('from "catalog_source_records"');
    expect(combinedSql).toContain("#>> '{reviewQueue,reviewStatus}'");
    expect(combinedSql).not.toContain("raw_payload");
    expect(combinedSql).not.toContain("source_only_fields");
    expect(combinedSql).not.toContain("journal_entries");
    expect(combinedSql).not.toContain("media_assets");
    expect(combinedSql).not.toContain("owner_user_id");
    expect(combinedSql).not.toContain("raw_payload");
    expect(fuzzy.sql).not.toContain("source_record_id");
    expect(fuzzy.sql).toContain('from "catalog_fuzzy_duplicate_suggestions"');
    expect(catalog.parameters).toContain("eu_oj_eur_lex_common_catalogue");
    expect(catalog.parameters).toContain("vertebrate_breed_ontology");
  });

  it("groups duplicate, conflict, alias, review, and blocked clusters safely", () => {
    const report = buildCatalogEntityResolutionQaReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      catalogRows,
      aliasCollisionRows: aliasRows,
      sourceCandidateRows,
      fuzzyDuplicateRows,
    });

    expect(report.schemaVersion).toBe("ove162.catalogEntityResolutionQa.v2");
    expect(report.leakCheck).toBe("passed");
    expect(report.summary.fuzzyDuplicatePairCount).toBe(1);
    expect(report.summary.fuzzyDuplicateRowsReviewed).toBe(1);
    expect(
      report.summary.groups.find((group) => group.kind === "likely_duplicate")
        ?.count,
    ).toBe(1);
    expect(
      report.summary.groups.find(
        (group) => group.kind === "source_disagreement",
      )?.count,
    ).toBe(1);
    expect(
      report.summary.groups.find((group) => group.kind === "fuzzy_duplicate")
        ?.count,
    ).toBe(1);
    expect(
      report.summary.groups.find((group) => group.kind === "alias_collision")
        ?.count,
    ).toBe(1);
    expect(
      report.summary.groups.find(
        (group) => group.kind === "manual_review_required",
      )?.count,
    ).toBe(1);
    expect(
      report.summary.groups.find((group) => group.kind === "blocked_projection")
        ?.count,
    ).toBe(1);
    expect(
      report.clusters.some((cluster) => cluster.kind === "canonical_concept"),
    ).toBe(true);
    expect(
      report.clusters.find((cluster) => cluster.kind === "fuzzy_duplicate"),
    ).toMatchObject({
      fuzzyScore: 95,
      fuzzyScoreBucket: "high",
      localeRelation: "same_locale",
      evidenceStatus: "current",
      recommendedAction: "merge_review",
      reasonCodes: expect.arrayContaining(["rapidfuzz_name_similarity"]),
      members: [
        expect.objectContaining({ label: "Red Cherry", locale: "uk" }),
        expect.objectContaining({ label: "Red Chery", locale: "uk" }),
      ],
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("raw_payload");
    expect(serialized).not.toContain("source_only_fields");
    expect(serialized).not.toContain("sourceRecordKey");
    expect(serialized).not.toContain("journalBody");
    expect(serialized).not.toContain("ownerUserId");
  });

  it("keeps manual and blocked groups visible when alias collisions are large", () => {
    const manyAliasRows = Array.from({ length: 180 }, (_, index) => ({
      normalizedAlias: `collision-${index}`,
      sampleDisplayName: `Collision ${index}`,
      catalogItemCount: 2,
      sourceCount: 1,
      canonicalNames: `Collision ${index} A | Collision ${index} B`,
      catalogKinds: "plant_variety",
      sources: "ua_state_register",
    }));

    const report = buildCatalogEntityResolutionQaReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      catalogRows,
      aliasCollisionRows: manyAliasRows,
      sourceCandidateRows,
      fuzzyDuplicateRows,
    });

    expect(report.clusters.length).toBeLessThanOrEqual(120);
    expect(
      report.clusters.some(
        (cluster) => cluster.kind === "manual_review_required",
      ),
    ).toBe(true);
    expect(
      report.clusters.some((cluster) => cluster.kind === "blocked_projection"),
    ).toBe(true);
    expect(
      report.summary.groups.find((group) => group.kind === "alias_collision")
        ?.count,
    ).toBe(48);
  });

  it("queues one idempotent closed-payload fuzzy refresh job", () => {
    const compiled =
      buildEnqueueCatalogFuzzyDuplicateQaRefreshJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain("on conflict");
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_fuzzy_duplicate_qa_refresh" },
      "catalog-fuzzy-duplicate-qa-refresh",
      expect.any(Date),
      null,
      expect.any(Date),
    ]);
  });

  it("fails the leak check when an unsafe field is added to report evidence", () => {
    expect(() =>
      assertCatalogEntityResolutionEvidenceSafe({
        schemaVersion: "ove162.catalogEntityResolutionQa.v2",
        clusters: [{ ownerUserId: "do-not-leak" }],
      }),
    ).toThrow("ownerUserId");
  });
});
