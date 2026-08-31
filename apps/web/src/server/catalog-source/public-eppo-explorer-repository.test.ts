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
  buildPublicEppoSourceQuery,
  buildPublicStableCatalogQuery,
  decodePublicStableRegistryCursor,
  encodePublicStableRegistryCursor,
  parsePublicStableRegistryRequest,
  PUBLIC_STABLE_REGISTRY_PAGE_SIZE,
  serializePublicEppoSourceRecord,
  serializePublicStableCatalogRecord,
} from "./public-eppo-explorer-repository";

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

describe("Stable Registry public explorer request contract", () => {
  it("accepts only the bounded query, kind, and opaque keyset cursor", () => {
    const cursor = encodePublicStableRegistryCursor({
      name: "tomato",
      key: "tomato-0000000001",
    });

    expect(
      parsePublicStableRegistryRequest({
        q: "  tomato  ",
        kind: "plant",
        cursor,
      }),
    ).toEqual({
      request: { query: "tomato", kind: "plant", cursor },
      error: null,
    });
    expect(decodePublicStableRegistryCursor(cursor)).toEqual({
      name: "tomato",
      key: "tomato-0000000001",
    });
  });

  it("fails closed without preserving an invalid query or cursor", () => {
    expect(
      parsePublicStableRegistryRequest({ q: "x", kind: "insects" }),
    ).toMatchObject({
      request: { query: "x", kind: "all", cursor: null },
      error: "invalid_query",
    });
    expect(
      parsePublicStableRegistryRequest({
        q: "tomato%",
        cursor: "not-a-cursor",
      }),
    ).toMatchObject({
      request: { query: "tomato%", cursor: null },
      error: "invalid_query",
    });
  });
});

describe("Stable Registry public explorer queries", () => {
  it("reads the active approved catalog projection without source evidence joins", () => {
    const compiled = buildPublicStableCatalogQuery(testDb, {
      kind: "plant",
      query: "tomato",
      cursor: null,
    }).compile();

    expect(compiled.sql).toContain(
      'from "stable_registry_public_catalog_records"',
    );
    expect(compiled.sql).toContain(
      "from stable_registry_public_catalog_search_terms as search_terms",
    );
    expect(compiled.sql).toContain('join "catalog_registry_active_pointers"');
    expect(compiled.sql).toContain('"pointers"."release_family" =');
    expect(compiled.sql).toContain("lower");
    expect(compiled.parameters).toContain("foundation");
    expect(compiled.parameters).toContain("plant");
    expect(compiled.parameters).toContain("tomato%");
    expect(compiled.parameters).toContain(PUBLIC_STABLE_REGISTRY_PAGE_SIZE + 1);
    expect(compiled.sql).not.toMatch(
      /catalog_source_records|catalog_source_capture_units|raw_payload|source_only_fields|latitude|longitude|coordinates/i,
    );
  });

  it("admits a record of unresolved kingdom under both kind filters", () => {
    for (const kind of ["plant", "animal"] as const) {
      const compiled = buildPublicStableCatalogQuery(testDb, {
        kind,
        query: "",
        cursor: null,
      }).compile();

      // A `species` identity is legitimately a plant or an animal, and nothing
      // in the catalog layer establishes which. Filtering it out of one
      // kingdom would hide an approved identity from the guest who asked for
      // exactly the kingdom it may belong to.
      expect(compiled.sql).toContain('"records"."object_kind" =');
      expect(compiled.parameters).toContain(kind);
      expect(compiled.parameters).toContain("either");
    }
  });

  it("keeps the source archive two-valued, because its kind is real evidence", () => {
    const compiled = buildPublicEppoSourceQuery(testDb, {
      kind: "animal",
      query: "",
      cursor: null,
    }).compile();

    expect(compiled.parameters).toContain("animal");
    expect(compiled.parameters).not.toContain("either");
  });

  it("reads only a completed derived EPPO projection and never selects raw source fields", () => {
    const compiled = buildPublicEppoSourceQuery(testDb, {
      kind: "all",
      query: "abcde",
      cursor: null,
    }).compile();

    expect(compiled.sql).toContain(
      'from "stable_registry_public_eppo_records"',
    );
    expect(compiled.sql).toContain(
      "from stable_registry_public_eppo_search_terms as search_terms",
    );
    expect(compiled.sql).toContain('join "catalog_source_capture_runs"');
    expect(compiled.sql).toContain('"captures"."state" in');
    expect(compiled.parameters).toContain("completed");
    expect(compiled.parameters).toContain("superseded_by_new_capture");
    expect(compiled.parameters).toContain("abcde%");
    expect(compiled.sql).not.toMatch(
      /catalog_source_records|catalog_source_capture_units|raw_payload|source_only_fields|field_rights|checksum|latitude|longitude|coordinates/i,
    );
  });
});

describe("Stable Registry public explorer serialization", () => {
  it("exposes only approved catalog display fields", () => {
    const record = serializePublicStableCatalogRecord(
      {
        stableTaxon: "tomato-0000000001",
        objectKind: "plant",
        canonicalName: "Tomato",
        scientificName: "Solanum lycopersicum",
        taxonomicRank: "variety",
        parentDisplayName: null,
        safeAliases: ["Solanum lycopersicum"],
        activatedAt: "2026-08-28T10:00:00.000Z",
      },
      "bg",
    );

    expect(record).toEqual({
      stableTaxon: "tomato-0000000001",
      objectKind: "plant",
      displayName: "Tomato",
      scientificName: "Solanum lycopersicum",
      taxonomicRank: "variety",
      parentDisplayName: null,
      aliases: ["Solanum lycopersicum"],
      evidenceState: "approved_stable_registry",
      href: "/bg/catalog/tomato-0000000001",
      qualityClass: "verified",
      observedAt: "2026-08-28T10:00:00.000Z",
    });
  });

  it("keeps source evidence distinct and drops any unsafe public label", () => {
    const record = serializePublicEppoSourceRecord(
      {
        eppoCode: "SOLLC",
        objectKind: "plant",
        displayName: "Tomato",
        scientificName: "Solanum lycopersicum",
        taxonomicRank: "Species",
        parentDisplayName: "Solanum",
        safeAliases: ["Solanum lycopersicum"],
        evidenceState: "source_record_not_approved",
        observedAt: "2026-08-28T10:00:00.000Z",
        sourceName: "EPPO Codes observed API capture",
        sourceUrl: "https://data.eppo.int/",
        license: "EPPO Codes Open Data Licence",
        licenseUrl: "https://data.eppo.int/data/Open_Licence.pdf",
        attributionText: "EPPO Codes, EPPO Codes Open Data Licence.",
      },
      "uk",
    );

    expect(record).toMatchObject({
      eppoCode: "SOLLC",
      evidenceState: "source_record_not_approved",
      href: "/sources/eppo/SOLLC",
      source: { name: "EPPO Codes observed API capture" },
    });
    expect(JSON.stringify(record)).not.toMatch(
      /raw|source_only|field_rights|checksum|latitude|longitude|coordinates|captureId|snapshotId/i,
    );
    expect(
      serializePublicEppoSourceRecord(
        {
          eppoCode: "SOLLC",
          objectKind: "plant",
          displayName: "Tomato 50.45010, 30.52340",
          scientificName: null,
          taxonomicRank: null,
          parentDisplayName: null,
          safeAliases: [],
          evidenceState: "source_record_not_approved",
          observedAt: "2026-08-28T10:00:00.000Z",
          sourceName: "EPPO Codes",
          sourceUrl: "https://data.eppo.int/",
          license: "EPPO Codes Open Data Licence",
          licenseUrl: null,
          attributionText: null,
        },
        "uk",
      ),
    ).toBeNull();
  });

  it("drops optional labels that could carry a location or source-only marker", () => {
    const record = serializePublicStableCatalogRecord(
      {
        stableTaxon: "tomato-0000000001",
        objectKind: "plant",
        canonicalName: "Tomato",
        scientificName: "Tomato 50.45010, 30.52340",
        taxonomicRank: "source_only",
        parentDisplayName: "Solanum",
        safeAliases: ["Tomato", "unsafe https://example.test/secret"],
        activatedAt: "2026-08-28T10:00:00.000Z",
      },
      "uk",
    );

    expect(record).toMatchObject({
      displayName: "Tomato",
      scientificName: null,
      taxonomicRank: null,
      parentDisplayName: "Solanum",
      aliases: ["Tomato"],
    });
  });

  it("rejects source credits with query or fragment data before public serialization", () => {
    const record = serializePublicEppoSourceRecord(
      {
        eppoCode: "SOLLC",
        objectKind: "plant",
        displayName: "Tomato",
        scientificName: null,
        taxonomicRank: null,
        parentDisplayName: null,
        safeAliases: [],
        evidenceState: "source_record_not_approved",
        observedAt: "2026-08-28T10:00:00.000Z",
        sourceName: "EPPO Codes",
        sourceUrl: "https://data.eppo.int/?access_token=not-public",
        license: "EPPO Codes Open Data Licence",
        licenseUrl: null,
        attributionText: null,
      },
      "uk",
    );

    expect(record).toBeNull();
  });
});
