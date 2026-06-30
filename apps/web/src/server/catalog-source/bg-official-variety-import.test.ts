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
  BG_OFFICIAL_VARIETY_SOURCE_PROOF,
  bgOfficialVarietyAllowedProjection,
  bgOfficialVarietyDefinition,
  bgOfficialVarietyPayloadChecksum,
  bgOfficialVarietySnapshotChecksum,
} from "@/lib/catalog/bg-official-variety";
import {
  buildBgOfficialVarietyBlockedRecordProofQuery,
  buildBgOfficialVarietySourceProvenanceProofQuery,
  buildBgOfficialVarietyTypeaheadProofQuery,
  buildEnqueueBgOfficialVarietyTypeaheadReindexJobQuery,
  buildInsertBgOfficialVarietySourceLinkQuery,
  buildUpsertBgOfficialVarietyCatalogItemQuery,
  buildUpsertBgOfficialVarietyCatalogNameQuery,
  buildUpsertBgOfficialVarietyRecordQuery,
  buildUpsertBgOfficialVarietySnapshotQuery,
} from "./bg-official-variety-import";

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
const definition = bgOfficialVarietyDefinition();
const projectedRecord = definition.records[0];
const blockedRecord = definition.records[1];
const sourceSnapshotId = "00000000-0000-4000-8000-000000061001";
const sourceRecordId = "00000000-0000-4000-8000-000000061002";
const catalogItemId = "00000000-0000-4000-8000-000000061003";

const forbiddenProjectionMarkers = [
  "rawPayload",
  "sourceOnlyFields",
  "liveProof",
  "nationalId",
  "registerSubType",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

describe("BG official variety import", () => {
  it("keeps parser/source-only BG variety fields out of product projection", () => {
    const rawPayload = JSON.stringify(projectedRecord.rawPayload);
    const sourceOnlyFields = JSON.stringify(projectedRecord.sourceOnlyFields);
    const projection = JSON.stringify(bgOfficialVarietyAllowedProjection());

    expect(rawPayload).toContain("liveProof");
    expect(rawPayload).toContain("BG-SADOVO-1-OVE61-PROOF");
    expect(sourceOnlyFields).toContain("nationalId");
    expect(sourceOnlyFields).toContain("parserAndLegalGate");
    expect(projection).toContain("Садово 1");
    expect(projection).toContain("Sadovo 1");
    expect(projection).toContain("parserConfidence");
    expect(projection).toContain("sourceRowReference");

    for (const marker of forbiddenProjectionMarkers) {
      expect(projection).not.toContain(marker);
    }
  });

  it("records stable snapshot and row checksums for idempotent proofs", () => {
    expect(BG_OFFICIAL_VARIETY_SOURCE_PROOF.liveProof.iasasPdfSha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(bgOfficialVarietySnapshotChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(bgOfficialVarietyPayloadChecksum(projectedRecord)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(bgOfficialVarietyPayloadChecksum(blockedRecord)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(bgOfficialVarietyPayloadChecksum(projectedRecord)).not.toBe(
      bgOfficialVarietyPayloadChecksum(blockedRecord),
    );
  });

  it("upserts the EU/BG proof snapshot with attribution and legal caveat", () => {
    const compiled = buildUpsertBgOfficialVarietySnapshotQuery(testDb, {
      payloadSha256: bgOfficialVarietySnapshotChecksum(),
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("eu-common-catalogue");
    expect(compiled.parameters).toContain("official_varieties");
    expect(compiled.parameters).toContain(
      "https://commission.europa.eu/legal-notice_en",
    );
    expect(JSON.stringify(compiled.parameters)).toContain(
      "canonical_product_projection",
    );
    expect(JSON.stringify(compiled.parameters)).toContain("manual_seed");
    expect(JSON.stringify(compiled.parameters)).not.toContain("rawPayload");
  });

  it("stores projected and blocked official rows in source records", () => {
    const projected = buildUpsertBgOfficialVarietyRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: bgOfficialVarietyPayloadChecksum(projectedRecord),
      record: projectedRecord,
    }).compile();
    const blocked = buildUpsertBgOfficialVarietyRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: bgOfficialVarietyPayloadChecksum(blockedRecord),
      record: blockedRecord,
    }).compile();

    expect(projected.sql).toContain('insert into "catalog_source_records"');
    expect(projected.sql).toContain('"raw_payload"');
    expect(projected.sql).toContain('"source_only_fields"');
    expect(projected.parameters).toContain("projected");
    expect(JSON.stringify(projected.parameters)).toContain(
      "BG-SADOVO-1-OVE61-PROOF",
    );
    expect(blocked.parameters).toContain("quarantined");
    expect(JSON.stringify(blocked.parameters)).toContain(
      "iasas_reuse_condition_pending",
    );
  });

  it("projects only the accepted official variety into catalog names", () => {
    const projection = bgOfficialVarietyAllowedProjection();
    const item = buildUpsertBgOfficialVarietyCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertBgOfficialVarietyCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Sadovo 1",
      normalizedName: "sadovo 1",
      locale: "en",
      isPrimary: false,
    }).compile();

    expect(projection.catalogKind).toBe("plant_variety");
    expect(projection.source).toBe("eu_common_catalogue_bg");
    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.parameters).toContain("Садово 1");
    expect(item.parameters).toContain("plant_variety");
    expect(item.parameters).toContain("eu_common_catalogue_bg");
    expect(JSON.stringify(item.parameters)).not.toContain("nationalId");
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Sadovo 1",
      "sadovo 1",
      "en",
      false,
      "Sadovo 1",
      false,
    ]);
  });

  it("links the catalog item to the projected source row only", () => {
    const compiled = buildInsertBgOfficialVarietySourceLinkQuery(testDb, {
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
      "eu-common-catalogue",
      "EU-PVP:BG:SADOVO-1",
      "canonical_item",
    ]);
  });

  it("proves typeahead without touching raw sources or blocked PDF rows", () => {
    const compiled = buildBgOfficialVarietyTypeaheadProofQuery(
      testDb,
      "Садово",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" = $3');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "plant_variety",
      "eu_common_catalogue_bg",
      "%садово%",
      8,
    ]);
  });

  it("reads operator provenance with safe parser/legal metadata only", () => {
    const compiled = buildBgOfficialVarietySourceProvenanceProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("license_url");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "plant_variety",
      "eu_common_catalogue_bg",
      "eu-common-catalogue",
      "canonical_item",
      1,
    ]);
  });

  it("proves low-confidence or legal-conditional rows stay quarantined", () => {
    const compiled = buildBgOfficialVarietyBlockedRecordProofQuery(
      testDb,
      definition.blockedRecordKey,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("projection_status");
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      "eu-common-catalogue",
      "IASAS-OSL-2026:PDF:LOW-CONFIDENCE-ROW",
      1,
    ]);
  });

  it("queues a derived typeahead reindex after import", () => {
    const compiled =
      buildEnqueueBgOfficialVarietyTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
