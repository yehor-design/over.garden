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
  decodeEppoArchiveCursor,
  encodeEppoArchiveCursor,
  EPPO_ARCHIVE_PAGE_SIZE,
  parseEppoArchiveRequest,
  serializePublicEppoSourceRecord,
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

describe("EPPO archive request contract", () => {
  it("accepts only the bounded query, kind, and opaque keyset cursor", () => {
    const cursor = encodeEppoArchiveCursor({ name: "tomato", key: "SOLLC" });

    expect(
      parseEppoArchiveRequest({ q: "  tomato  ", kind: "plant", cursor }),
    ).toEqual({
      request: { query: "tomato", kind: "plant", cursor },
      error: null,
    });
    expect(decodeEppoArchiveCursor(cursor)).toEqual({
      name: "tomato",
      key: "SOLLC",
    });
  });

  it("fails closed without preserving an invalid query or cursor", () => {
    expect(parseEppoArchiveRequest({ q: "x", kind: "insects" })).toMatchObject({
      request: { query: "x", kind: "all", cursor: null },
      error: "invalid_query",
    });
    expect(
      parseEppoArchiveRequest({ q: "tomato%", cursor: "not-a-cursor" }),
    ).toMatchObject({
      request: { query: "tomato%", cursor: null },
      error: "invalid_query",
    });
  });
});

describe("EPPO archive queries", () => {
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
    expect(compiled.parameters).toContain(EPPO_ARCHIVE_PAGE_SIZE + 1);
    expect(compiled.sql).not.toMatch(
      /catalog_source_records|catalog_source_capture_units|raw_payload|source_only_fields|field_rights|checksum|latitude|longitude|coordinates/i,
    );
  });

  it("touches none of the retired release tables", () => {
    // ADR-0025 retired the Stable Registry release model. The archive is the
    // retained reader of the capture and must not depend on a release pointer
    // that no longer exists once the drop migration lands.
    const compiled = buildPublicEppoSourceQuery(testDb, {
      kind: "plant",
      query: "tomato",
      cursor: null,
    }).compile();

    expect(compiled.sql).not.toMatch(
      /catalog_registry_|stable_registry_product_|stable_registry_public_catalog_/,
    );
  });
});

describe("EPPO archive serialization", () => {
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
      qualityClass: "partial",
      source: { name: "EPPO Codes observed API capture" },
    });
    expect(JSON.stringify(record)).not.toMatch(
      /raw|source_only|field_rights|checksum|latitude|longitude|coordinates|captureId|snapshotId|approved_stable_registry/i,
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
    const record = serializePublicEppoSourceRecord(
      {
        eppoCode: "SOLLC",
        objectKind: "plant",
        displayName: "Tomato",
        scientificName: "Tomato 50.45010, 30.52340",
        taxonomicRank: "source_only",
        parentDisplayName: "Solanum",
        safeAliases: ["Tomato", "unsafe https://example.test/secret"],
        evidenceState: "superseded_source_evidence",
        observedAt: "2026-08-28T10:00:00.000Z",
        sourceName: "EPPO Codes",
        sourceUrl: "https://data.eppo.int/",
        license: "EPPO Codes Open Data Licence",
        licenseUrl: null,
        attributionText: null,
      },
      "bg",
    );

    expect(record).toMatchObject({
      displayName: "Tomato",
      scientificName: null,
      taxonomicRank: null,
      parentDisplayName: "Solanum",
      aliases: ["Tomato"],
      evidenceState: "superseded_source_evidence",
      href: "/bg/sources/eppo/SOLLC",
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
