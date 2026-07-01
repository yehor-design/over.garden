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
  UA_STATE_REGISTER_FILE_PROOF,
  UA_STATE_REGISTER_FULL_IMPORT_PROOF,
  UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
  buildUaStateRegisterFullImportDefinitions,
  decodeUaStateRegisterCsv,
  parseUaStateRegisterCsv,
  uaStateRegisterAllowedProjection,
  uaStateRegisterFixtureDefinition,
  uaStateRegisterPayloadChecksum,
  uaStateRegisterSnapshotChecksum,
} from "@/lib/catalog/ua-state-register-variety";
import {
  buildEnqueueUaStateRegisterTypeaheadReindexJobQuery,
  buildInsertUaStateRegisterSourceLinkQuery,
  buildUaStateRegisterSourceProvenanceProofQuery,
  buildUaStateRegisterTypeaheadProofQuery,
  buildUpsertUaStateRegisterCatalogItemQuery,
  buildUpsertUaStateRegisterCatalogNameQuery,
  buildUpsertUaStateRegisterRecordQuery,
  buildUpsertUaStateRegisterSnapshotQuery,
} from "./ua-state-register-import";

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
const definition = uaStateRegisterFixtureDefinition();
const sourceSnapshotId = "00000000-0000-4000-8000-000000057001";
const sourceRecordId = "00000000-0000-4000-8000-000000057002";
const catalogItemId = "00000000-0000-4000-8000-000000057003";

const forbiddenProjectionMarkers = [
  "sourceFileRowCount",
  "sourceFileByteLength",
  "varietyDescription",
  "varietyDescriptionExternal",
  "sourceOnlyFields",
  "rawPayload",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

describe("UA State Register official variety import", () => {
  it("parses UTF-16LE register CSV rows with quoted fields", () => {
    const csv = [
      "taxonName,applicationNumber,varietyName,varietyNameLan,varietyNameTRL,varietyDescription",
      'Абрикос звичайний,83070006,Ботсадівський,Ботсадівський,Botsadivs`kyi,"Опис, з комою"',
    ].join("\r\n");
    const bytes = Buffer.from(`\uFEFF${csv}`, "utf16le");
    const decoded = decodeUaStateRegisterCsv(bytes);
    const rows = parseUaStateRegisterCsv(decoded.text);

    expect(decoded.encoding).toBe("UTF-16LE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taxonName: "Абрикос звичайний",
      applicationNumber: "83070006",
      varietyName: "Ботсадівський",
      varietyNameTRL: "Botsadivs`kyi",
      varietyDescription: "Опис, з комою",
    });
  });

  it("keeps raw register fields out of the product projection", () => {
    const rawPayload = JSON.stringify(definition.record.rawPayload);
    const projection = JSON.stringify(uaStateRegisterAllowedProjection());

    expect(rawPayload).toContain("sourceFileRowCount");
    expect(rawPayload).toContain("varietyDescription");
    expect(projection).toContain("Ботсадівський");
    expect(projection).toContain("Botsadivs`kyi");

    for (const marker of forbiddenProjectionMarkers) {
      expect(projection).not.toContain(marker);
    }
  });

  it("records the full register file proof separately from the row payload checksum", () => {
    expect(UA_STATE_REGISTER_FILE_PROOF.rowCount).toBe(15177);
    expect(UA_STATE_REGISTER_FULL_IMPORT_PROOF).toMatchObject({
      sourceRowsRead: 15177,
      rawRowsCaptured: 15177,
      productConceptsProjected: 15177,
      aliasesProjected: 61105,
      reviewNeededRows: 0,
      rejectedRows: 0,
      duplicateCanonicalNameClusters: 759,
    });
    expect(UA_STATE_REGISTER_FILE_PROOF.payloadSha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(uaStateRegisterSnapshotChecksum()).toBe(
      UA_STATE_REGISTER_FILE_PROOF.payloadSha256,
    );
    expect(uaStateRegisterPayloadChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(uaStateRegisterPayloadChecksum()).not.toBe(
      uaStateRegisterSnapshotChecksum(),
    );
  });

  it("builds full-import definitions with per-row source identity and audit counts", () => {
    const kaiserRow = {
      ...UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
      taxonName: "Підщепи помідора",
      taxonNameLat:
        "Solanum lycopersicum L. x Solanum habrochaites S.Knapp & D.M.Spooner; Solanum lycopersicum L.xSolanum peruvianum(L.) Mill.;Solanum lycopersicum L.xSolanum cheesmaniae (L.Ridley) Fosberg;Solanum pimpinellifolium L.xSolanum habrochaites S.Knapp & D.M.Spooner;Solanum habrochaites S.Knapp & D.M.Spooner",
      applicationNumber: "15989001",
      varietyName: "Кайзер",
      varietyNameLan: "Кайзер",
      varietyNameTRL: "Kaiser",
    };
    const built = buildUaStateRegisterFullImportDefinitions(
      [UA_STATE_REGISTER_VARIETY_SOURCE_ROW, kaiserRow],
      UA_STATE_REGISTER_FILE_PROOF,
    );

    expect(built.audit).toMatchObject({
      sourceRowsRead: 2,
      rawRowsCaptured: 2,
      productConceptsProjected: 2,
      reviewNeededRows: 0,
      rejectedRows: 0,
      duplicateCanonicalNameClusters: 0,
    });
    expect(built.definitions.map((row) => row.projection.publicSlug)).toEqual([
      "botsadivskyi-ua-register-83070006",
      "kaiser-ua-register-15989001",
    ]);
    expect(built.definitions.map((row) => row.projection.sourceId)).toEqual([
      "ua-state-register:2025-07-15:RegisterVarietis:83070006",
      "ua-state-register:2025-07-15:RegisterVarietis:15989001",
    ]);
    expect(
      built.definitions[1].projection.aliases.every(
        (alias) =>
          alias.displayName.length <= 120 && alias.normalizedName.length <= 120,
      ),
    ).toBe(true);
    expect(
      built.definitions[1].projection.aliases.map((row) => row.displayName),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Solanum lycopersicum L. x Solanum"),
      ]),
    );
  });

  it("counts repeated official denominations as duplicate clusters for OVE-89", () => {
    const first = {
      ...UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
      applicationNumber: "15005001",
      taxonName: "Гірчиця сарептська (озима)",
      taxonNameLat: "Brassica juncea (L.) Czern.",
      varietyName: "Серпанок",
      varietyNameLan: "Серпанок",
      varietyNameTRL: "Serpanok",
    };
    const second = {
      ...UA_STATE_REGISTER_VARIETY_SOURCE_ROW,
      applicationNumber: "18015001",
      taxonName: "Жито посівне (озиме)",
      taxonNameLat: "Secale cereale L.",
      varietyName: "Серпанок",
      varietyNameLan: "Серпанок",
      varietyNameTRL: "Serpanok",
    };
    const built = buildUaStateRegisterFullImportDefinitions(
      [UA_STATE_REGISTER_VARIETY_SOURCE_ROW, first, second],
      UA_STATE_REGISTER_FILE_PROOF,
    );

    expect(built.audit.duplicateCanonicalNameClusters).toBe(1);
    expect(built.definitions.map((row) => row.projection.sourceId)).toEqual(
      expect.arrayContaining([
        "ua-state-register:2025-07-15:RegisterVarietis:15005001",
        "ua-state-register:2025-07-15:RegisterVarietis:18015001",
      ]),
    );
  });

  it("upserts the source snapshot by source version and full-file checksum", () => {
    const compiled = buildUpsertUaStateRegisterSnapshotQuery(testDb, {
      payloadSha256: UA_STATE_REGISTER_FILE_PROOF.payloadSha256,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("ua-state-register");
    expect(compiled.parameters).toContain(
      UA_STATE_REGISTER_FILE_PROOF.payloadSha256,
    );
    expect(compiled.parameters).toContain(
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(compiled.parameters).toContain(
      "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("raw_payload");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "varietyDescription",
    );
  });

  it("stores the raw official row only in source records", () => {
    const compiled = buildUpsertUaStateRegisterRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: uaStateRegisterPayloadChecksum(),
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_records"');
    expect(compiled.sql).toContain('"raw_payload"');
    expect(compiled.sql).toContain('"source_only_fields"');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(JSON.stringify(compiled.parameters)).toContain("sourceFileRowCount");
    expect(JSON.stringify(compiled.parameters)).toContain(
      UA_STATE_REGISTER_VARIETY_SOURCE_ROW.applicationNumber,
    );
    expect(JSON.stringify(compiled.parameters)).toContain("varietyDescription");
  });

  it("projects the official Ukrainian name and official transliteration as aliases", () => {
    const projection = uaStateRegisterAllowedProjection();
    const item = buildUpsertUaStateRegisterCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertUaStateRegisterCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Botsadivs`kyi",
      normalizedName: "botsadivs`kyi",
      locale: "uk",
      isPrimary: false,
    }).compile();

    expect(projection.canonicalName).toBe("Ботсадівський");
    expect(projection.aliases.map((row) => row.displayName)).toEqual([
      "Ботсадівський",
      "Botsadivs`kyi",
      "Абрикос звичайний Ботсадівський",
      "Prunus armeniaca L. Botsadivs`kyi",
    ]);
    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.sql).toContain('"catalog_kind"');
    expect(item.parameters).toContain("Ботсадівський");
    expect(item.parameters).toContain("ua_state_register");
    expect(item.parameters).toContain("plant_variety");
    expect(JSON.stringify(item.parameters)).not.toContain("varietyDescription");
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Botsadivs`kyi",
      "botsadivs`kyi",
      "uk",
      false,
      "Botsadivs`kyi",
      false,
    ]);
  });

  it("links the catalog item to the quarantined source row", () => {
    const compiled = buildInsertUaStateRegisterSourceLinkQuery(testDb, {
      catalogItemId,
      sourceRecordId,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      sourceRecordId,
      "ua-state-register",
      "RegisterVarietis:83070006",
      "canonical_item",
    ]);
  });

  it("proves typeahead by official Ukrainian name without touching raw sources", () => {
    const compiled = buildUaStateRegisterTypeaheadProofQuery(
      testDb,
      "Ботсадівський",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "ua_state_register",
      "%ботсадівський%",
      8,
    ]);
  });

  it("proves typeahead by official transliteration without touching raw sources", () => {
    const compiled = buildUaStateRegisterTypeaheadProofQuery(
      testDb,
      "Botsadivs`kyi",
    ).compile();

    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "ua_state_register",
      "%botsadivs`kyi%",
      8,
    ]);
  });

  it("reads operator provenance without selecting raw payload fields", () => {
    const compiled = buildUaStateRegisterSourceProvenanceProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("license");
    expect(compiled.sql).toContain("license_url");
    expect(compiled.sql).toContain("attribution_text");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "ua_state_register",
      "ua-state-register",
      "canonical_item",
      1,
    ]);
  });

  it("queues a derived typeahead reindex after import", () => {
    const compiled =
      buildEnqueueUaStateRegisterTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
