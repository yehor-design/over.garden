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
  buildCatalogSourceProjectedAliasesForCurationQuery,
  buildCatalogSourceProvenanceForCurationQuery,
  toCurrentCatalogSourceProvenanceRows,
  type CatalogSourceProvenanceHistoryRow,
} from "./provenance-repository";

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

function provenanceRow(
  overrides: Partial<CatalogSourceProvenanceHistoryRow> = {},
): CatalogSourceProvenanceHistoryRow {
  return {
    catalogItemId: "00000000-0000-4000-8000-000000058003",
    catalogCanonicalName: "Solanum lycopersicum L.",
    catalogPublicSlug: "solanum-lycopersicum",
    catalogKind: "species",
    catalogStatus: "seeded",
    catalogSource: "species_backbone",
    sourceSlug: "gbif-backbone",
    sourceName: "GBIF Backbone Taxonomy",
    sourceVersion: "Backbone pubDate 2023-08-28",
    sourceUrl: "https://api.gbif.org/v1/species/match",
    license: "Creative Commons Attribution 4.0 International",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attributionRequired: true,
    attributionText:
      "GBIF Backbone Taxonomy, Creative Commons Attribution 4.0 International.",
    allowedUsage: ["raw_snapshot", "canonical_product_projection"],
    sourceRecordKey: "GBIF:species:2930137",
    parserVersion: "ove-58.species-backbone.v1",
    fetchedAt: "2026-06-29T00:00:00.000Z",
    verifiedAt: "2026-06-29T00:00:00.000Z",
    projectionStatus: "projected",
    ...overrides,
  };
}

describe("catalog source provenance repository", () => {
  it("lists imported source provenance without raw payload or user data", () => {
    const compiled = buildCatalogSourceProvenanceForCurationQuery(
      testDb,
      10,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("source_version");
    expect(compiled.sql).toContain("source_url");
    expect(compiled.sql).toContain("license");
    expect(compiled.sql).toContain("license_url");
    expect(compiled.sql).toContain("attribution_required");
    expect(compiled.sql).toContain("attribution_text");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "canonical_item",
      10,
    ]);
  });

  it("reads alias curation states without raw source records", () => {
    const compiled = buildCatalogSourceProjectedAliasesForCurationQuery(
      testDb,
      ["00000000-0000-4000-8000-000000058003"],
    ).compile();

    expect(compiled.sql).toContain('from "catalog_alias_projections"');
    expect(compiled.sql).toContain('left join "catalog_item_names"');
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."catalog_item_id" in',
    );
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."display_name"',
    );
    expect(compiled.sql).toContain('"catalog_alias_projections"."status"');
    expect(compiled.sql).toContain('"catalog_alias_projections"."source_slug"');
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."source_method"',
    );
    expect(compiled.sql).toContain('"catalog_alias_projections"."confidence"');
    expect(compiled.sql).toContain('"catalog_alias_projections"."license"');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000058003",
    ]);
  });

  it("keeps only the current provenance row per source-backed concept record", () => {
    const rows = toCurrentCatalogSourceProvenanceRows([
      provenanceRow({
        catalogItemId: "00000000-0000-4000-8000-000000056002",
        catalogCanonicalName: "Bergeron 1",
        catalogKind: "plant_variety",
        catalogSource: "ua_state_register",
        sourceSlug: "ua-state-register",
        sourceName: "Ukraine State Register of Plant Varieties",
        sourceVersion: "2025-07-15",
        sourceRecordKey: "RegisterVarietis:24256002",
        parserVersion: "ove-56.ua-state-register.sample.v1",
        fetchedAt: "2026-06-29T00:00:00.000Z",
        verifiedAt: "2026-06-29T00:00:00.000Z",
      }),
      provenanceRow({
        catalogItemId: "00000000-0000-4000-8000-000000064002",
        catalogCanonicalName: "Bergeron 1",
        catalogKind: "plant_variety",
        catalogSource: "ua_state_register",
        sourceSlug: "ua-state-register",
        sourceName: "Ukraine State Register of Plant Varieties",
        sourceVersion: "2025-08-01-refresh-fixture",
        sourceRecordKey: "RegisterVarietis:24256002",
        parserVersion: "ove-64.ua-state-register.refresh.v1",
        fetchedAt: "2026-06-30T01:00:00.000Z",
        verifiedAt: "2026-06-30T01:00:00.000Z",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      catalogItemId: "00000000-0000-4000-8000-000000064002",
      sourceVersion: "2025-08-01-refresh-fixture",
      parserVersion: "ove-64.ua-state-register.refresh.v1",
      auditLinkCount: 2,
    });
  });

  it("keeps distinct source record concepts separate in current provenance", () => {
    const rows = toCurrentCatalogSourceProvenanceRows([
      provenanceRow(),
      provenanceRow({
        sourceSlug: "wfo",
        sourceName: "World Flora Online",
        sourceVersion: "June 2026",
        sourceRecordKey: "WFO:wfo-0001057067",
        license: "CC0 1.0 Universal",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        attributionRequired: false,
        attributionText: null,
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceRecordKey).sort()).toEqual([
      "GBIF:species:2930137",
      "WFO:wfo-0001057067",
    ]);
    expect(rows.every((row) => row.auditLinkCount === 1)).toBe(true);
  });
});
