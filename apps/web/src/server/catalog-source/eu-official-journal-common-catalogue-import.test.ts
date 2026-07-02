import { createHash } from "node:crypto";
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
import { parseEuCommonCatalogueFormex } from "@/lib/catalog/eu-common-catalogue-parser";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
  euOfficialJournalCommonCatalogueDefinitionFromParserResults,
  euOfficialJournalCommonCataloguePayloadChecksum,
  euOfficialJournalCommonCatalogueSnapshotChecksum,
} from "@/lib/catalog/eu-official-journal-common-catalogue";
import {
  buildEnqueueEuOfficialJournalCommonCatalogueTypeaheadReindexJobQuery,
  buildEuOfficialJournalCommonCatalogueBlockedRecordProofQuery,
  buildEuOfficialJournalCommonCatalogueSourceProvenanceProofQuery,
  buildEuOfficialJournalCommonCatalogueTypeaheadProofQuery,
  buildInsertEuOfficialJournalCommonCatalogueSourceLinkQuery,
  buildUpsertEuOfficialJournalCommonCatalogueCatalogItemQuery,
  buildUpsertEuOfficialJournalCommonCatalogueCatalogNameQuery,
  buildUpsertEuOfficialJournalCommonCatalogueRecordQuery,
  buildUpsertEuOfficialJournalCommonCatalogueSnapshotQuery,
} from "./eu-official-journal-common-catalogue-import";

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
const sourceSnapshotId = "00000000-0000-4000-8000-000000103001";
const sourceRecordId = "00000000-0000-4000-8000-000000103002";
const catalogItemId = "00000000-0000-4000-8000-000000103003";
const OJ_SOURCE_URL = "https://eur-lex.europa.eu/eli/C/2026/830/oj";

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildDefinition() {
  const formexXml = `
    <GENERAL>
      <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. - Onion</TXT></NP></TI></TITLE>
      <TBL NO.SEQ="0001" COLS="3"><CORPUS>
        <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
        <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        <ROW><CELL COL="1">Header Inferred</CELL><CELL COL="2">BG 4 b</CELL><CELL COL="3"><IE/></CELL></ROW>
        <ROW><CELL COL="1">Broken</CELL><CELL COL="2"><IE/></CELL><CELL COL="3">(add.)</CELL></ROW>
      </CORPUS></TBL>
    </GENERAL>
  `;
  const parserResult = parseEuCommonCatalogueFormex({
    supplementType: "vegetable_supplement_h",
    supplementLabel: "Supplement H 2026/1",
    formexXmlFiles: [
      {
        fileName: "C_202600830EN.000301.fmx.xml",
        text: formexXml,
        byteLength: Buffer.byteLength(formexXml),
        checksumSha256: checksum(formexXml),
      },
    ],
    sourceUrl: OJ_SOURCE_URL,
    ojCitation: "OJ C, C/2026/830, 12.2.2026",
    publicationDate: "2026-02-12",
    artifactChecksumSha256: "b".repeat(64),
  });

  return euOfficialJournalCommonCatalogueDefinitionFromParserResults({
    parserResults: [parserResult],
    fetchedAt: "2026-07-01T00:00:00.000Z",
    verifiedAt: "2026-07-01T00:00:00.000Z",
  });
}

const definition = buildDefinition();
const snapshot = definition.snapshots[0];
const projectedRecord = snapshot.records[0];
const quarantinedRecord = snapshot.records[1];
const rejectedRecord = snapshot.records[2];
const projection = projectedRecord.projection;

if (!projection) {
  throw new Error("Test fixture expected projected EU OJ row.");
}

describe("EU Official Journal Common Catalogue import", () => {
  it("upserts source snapshots with OJ attribution and legal-value caveat", () => {
    const compiled = buildUpsertEuOfficialJournalCommonCatalogueSnapshotQuery(
      testDb,
      {
        snapshot,
        payloadSha256:
          euOfficialJournalCommonCatalogueSnapshotChecksum(snapshot),
      },
    ).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    );
    expect(compiled.parameters).toContain("official_varieties");
    expect(compiled.parameters).toContain(OJ_SOURCE_URL);
    expect(JSON.stringify(compiled.parameters)).toContain(
      "canonical_product_projection",
    );
    expect(JSON.stringify(compiled.parameters)).toContain("Official Journal");
    expect(JSON.stringify(compiled.parameters)).toContain("no legal value");
    expect(JSON.stringify(compiled.parameters)).not.toContain("rawPayload");
  });

  it("stores accepted, review-needed, and rejected parser rows in source records", () => {
    const projected = buildUpsertEuOfficialJournalCommonCatalogueRecordQuery(
      testDb,
      {
        sourceSnapshotId,
        rawPayloadSha256:
          euOfficialJournalCommonCataloguePayloadChecksum(projectedRecord),
        record: projectedRecord,
      },
    ).compile();
    const quarantined = buildUpsertEuOfficialJournalCommonCatalogueRecordQuery(
      testDb,
      {
        sourceSnapshotId,
        rawPayloadSha256:
          euOfficialJournalCommonCataloguePayloadChecksum(quarantinedRecord),
        record: quarantinedRecord,
      },
    ).compile();
    const rejected = buildUpsertEuOfficialJournalCommonCatalogueRecordQuery(
      testDb,
      {
        sourceSnapshotId,
        rawPayloadSha256:
          euOfficialJournalCommonCataloguePayloadChecksum(rejectedRecord),
        record: rejectedRecord,
      },
    ).compile();

    expect(projected.sql).toContain('insert into "catalog_source_records"');
    expect(projected.parameters).toContain("projected");
    expect(quarantined.parameters).toContain("quarantined");
    expect(rejected.parameters).toContain("rejected");
    expect(JSON.stringify(quarantined.parameters)).toContain(
      "admission action inferred from table header",
    );
    expect(JSON.stringify(rejected.parameters)).toContain(
      "missing notifier or admission field",
    );
  });

  it("projects only the accepted EU OJ row into catalog identity tables", () => {
    const item = buildUpsertEuOfficialJournalCommonCatalogueCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertEuOfficialJournalCommonCatalogueCatalogNameQuery(
      testDb,
      {
        catalogItemId,
        projection,
        displayName: "Cincinnati",
        normalizedName: "cincinnati",
        locale: "en",
        isPrimary: true,
      },
    ).compile();

    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.parameters).toContain("Cincinnati");
    expect(item.parameters).toContain("plant_variety");
    expect(item.parameters).toContain(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    );
    expect(JSON.stringify(item.parameters)).not.toContain("notifierCode");
    expect(JSON.stringify(item.parameters)).not.toContain("artifactChecksum");
    expect(JSON.stringify(item.parameters)).not.toContain("legalValueCaveat");
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Cincinnati",
      "cincinnati",
      "en",
      true,
      "Cincinnati",
      true,
    ]);
  });

  it("links product projection to the accepted source record with guard-backed provenance", () => {
    const compiled = buildInsertEuOfficialJournalCommonCatalogueSourceLinkQuery(
      testDb,
      {
        catalogItemId,
        sourceRecordId,
        projection,
      },
    ).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      sourceRecordId,
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      projection.sourceId,
      "canonical_item",
    ]);
  });

  it("proves typeahead without raw OJ parser or source metadata", () => {
    const compiled = buildEuOfficialJournalCommonCatalogueTypeaheadProofQuery(
      testDb,
      "cincinnati",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "plant_variety",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
      "%cincinnati%",
      8,
    ]);
  });

  it("reads source-backed provenance without selecting raw payloads", () => {
    const compiled =
      buildEuOfficialJournalCommonCatalogueSourceProvenanceProofQuery(
        testDb,
        catalogItemId,
      ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).toContain("source_url");
    expect(compiled.sql).toContain("parser_version");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "plant_variety",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      "canonical_item",
      1,
    ]);
    expect(JSON.stringify(projection.provenance)).toContain(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
    );
    expect(JSON.stringify(projection.provenance)).toContain(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
    );
  });

  it("proves blocked EU OJ records stay out of product projection", () => {
    const compiled =
      buildEuOfficialJournalCommonCatalogueBlockedRecordProofQuery(
        testDb,
        quarantinedRecord.id,
      ).compile();

    expect(compiled.sql).toContain('from "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain('"projection_status" != $3');
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      quarantinedRecord.id,
      "projected",
      1,
    ]);
  });

  it("queues a derived typeahead reindex after product projection", () => {
    const compiled =
      buildEnqueueEuOfficialJournalCommonCatalogueTypeaheadReindexJobQuery(
        testDb,
      ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain('"payload" = $9');
    expect(compiled.sql).toContain('"status" = $10');
    expect(compiled.sql).toContain('"available_at" = $11');
    expect(compiled.sql).toContain('"locked_at" = $12');
    expect(compiled.sql).toContain('"locked_by" = $13');
    expect(compiled.sql).toContain('"last_error" = $14');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "pending",
      expect.any(Date),
      null,
      null,
      null,
      "catalog-typeahead-reindex",
      { kind: "catalog_typeahead_reindex" },
      "pending",
      expect.any(Date),
      null,
      null,
      null,
      expect.any(Date),
    ]);
  });
});
