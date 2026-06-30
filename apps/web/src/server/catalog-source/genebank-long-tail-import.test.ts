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
  GENEBANK_LONG_TAIL_SOURCE_PROOF,
  genebankLongTailDefinition,
  genebankLongTailPayloadChecksum,
  genebankLongTailPromotionProjection,
  genebankLongTailSnapshotChecksum,
} from "@/lib/catalog/genebank-long-tail";
import {
  buildEnqueueGenebankTypeaheadReindexJobQuery,
  buildGenebankCandidateQueueQuery,
  buildGenebankSourceProvenanceProofQuery,
  buildGenebankTypeaheadProofQuery,
  buildInsertGenebankSourceLinkQuery,
  buildMarkGenebankRecordProjectedQuery,
  buildSelectPromotableGenebankCandidateQuery,
  buildUpsertGenebankCatalogItemQuery,
  buildUpsertGenebankCatalogNameQuery,
  buildUpsertGenebankRecordQuery,
  buildUpsertGenebankSnapshotQuery,
} from "./genebank-long-tail-import";

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
const definition = genebankLongTailDefinition();
const promotableRecord = definition.records[0];
const heldRecord = definition.records[1];
const sourceSnapshotId = "00000000-0000-4000-8000-000000062001";
const sourceRecordId = "00000000-0000-4000-8000-000000062002";
const catalogItemId = "00000000-0000-4000-8000-000000062003";

const forbiddenProjectionMarkers = [
  "rawPayload",
  "sourceOnlyFields",
  "accessionIdentifier",
  "accessionRecordUrl",
  "genesysEuriscoBlocker",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
];

describe("genebank long-tail candidate import", () => {
  it("keeps accession source-only fields out of the promotion projection", () => {
    const rawPayload = JSON.stringify(promotableRecord.rawPayload);
    const sourceOnlyFields = JSON.stringify(promotableRecord.sourceOnlyFields);
    const projection = JSON.stringify(genebankLongTailPromotionProjection());

    expect(rawPayload).toContain("accessionIdentifier");
    expect(sourceOnlyFields).toContain("germplasmDistributionPolicy");
    expect(projection).toContain("Red Cherry tomato");
    expect(projection).toContain("candidateKind");
    expect(projection).toContain("germplasmDistributionPolicy");

    for (const marker of forbiddenProjectionMarkers) {
      expect(projection).not.toContain(marker);
    }
  });

  it("records stable snapshot and row checksums", () => {
    expect(GENEBANK_LONG_TAIL_SOURCE_PROOF.liveProof.grinGlobalVersion).toBe(
      "2.3.12",
    );
    expect(genebankLongTailSnapshotChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(genebankLongTailPayloadChecksum(promotableRecord)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(genebankLongTailPayloadChecksum(heldRecord)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(genebankLongTailPayloadChecksum(promotableRecord)).not.toBe(
      genebankLongTailPayloadChecksum(heldRecord),
    );
  });

  it("upserts the GRIN source snapshot with review and promotion usage flags", () => {
    const compiled = buildUpsertGenebankSnapshotQuery(testDb, {
      payloadSha256: genebankLongTailSnapshotChecksum(),
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("grin-global");
    expect(compiled.parameters).toContain("genebank_accessions");
    expect(compiled.parameters).toContain(false);
    expect(JSON.stringify(compiled.parameters)).toContain("review_queue");
    expect(JSON.stringify(compiled.parameters)).toContain("curator_promotion");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "accessionIdentifier",
    );
  });

  it("stores genebank candidate rows as quarantined source records", () => {
    const promotable = buildUpsertGenebankRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: genebankLongTailPayloadChecksum(promotableRecord),
      record: promotableRecord,
    }).compile();
    const held = buildUpsertGenebankRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: genebankLongTailPayloadChecksum(heldRecord),
      record: heldRecord,
    }).compile();

    expect(promotable.sql).toContain('insert into "catalog_source_records"');
    expect(promotable.sql).toContain('"raw_payload"');
    expect(promotable.sql).toContain('"source_only_fields"');
    expect(promotable.sql).toContain('"allowed_projection"');
    expect(promotable.sql).toContain(
      'on conflict ("source_snapshot_id", "source_record_id") do update',
    );
    expect(promotable.sql).not.toContain(
      '"projection_status" = excluded."projection_status"',
    );
    expect(promotable.parameters).toContain("quarantined");
    expect(JSON.stringify(promotable.parameters)).toContain(
      "GRIN curated proof row OVE62-001",
    );
    expect(held.parameters).toContain("quarantined");
    expect(JSON.stringify(held.parameters)).toContain("hold_for_review");
  });

  it("reads review candidates without selecting raw accession payloads", () => {
    const compiled = buildGenebankCandidateQueueQuery(testDb).compile();

    expect(compiled.sql).toContain('from "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).toContain("projection_status");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual(["grin-global", "quarantined"]);
  });

  it("selects only non-rejected candidates for curator promotion", () => {
    const compiled = buildSelectPromotableGenebankCandidateQuery(
      testDb,
      definition.promotableRecordKey,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      "grin-global",
      definition.promotableRecordKey,
      "rejected",
      1,
    ]);
  });

  it("projects the promoted candidate into catalog item and aliases only after promotion", () => {
    const projection = genebankLongTailPromotionProjection();
    const item = buildUpsertGenebankCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertGenebankCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Red Cherry",
      normalizedName: "red cherry",
      locale: "en",
      isPrimary: true,
    }).compile();

    expect(item.sql).toContain('insert into "catalog_items"');
    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.parameters).toContain("Red Cherry tomato");
    expect(item.parameters).toContain("grin_genebank_candidate");
    expect(item.parameters).toContain("plant_variety");
    expect(JSON.stringify(item.parameters)).not.toContain(
      "accessionIdentifier",
    );
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Red Cherry",
      "red cherry",
      "en",
      true,
      "Red Cherry",
      true,
    ]);
  });

  it("links the promoted catalog item to the source record", () => {
    const compiled = buildInsertGenebankSourceLinkQuery(testDb, {
      catalogItemId,
      sourceRecordId,
      sourceRecordKey: definition.promotableRecordKey,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      sourceRecordId,
      "grin-global",
      definition.promotableRecordKey,
      "canonical_item",
    ]);
  });

  it("marks the promoted source record projected without touching held rows", () => {
    const compiled = buildMarkGenebankRecordProjectedQuery(testDb, {
      sourceRecordId,
    }).compile();

    expect(compiled.sql).toContain('update "catalog_source_records"');
    expect(compiled.sql).toContain('"projection_status"');
    expect(compiled.parameters).toEqual([
      "projected",
      expect.any(Date),
      sourceRecordId,
    ]);
  });

  it("proves typeahead from safe catalog tables only", () => {
    const compiled = buildGenebankTypeaheadProofQuery(
      testDb,
      "Red Cherry",
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
      "grin_genebank_candidate",
      "%red cherry%",
      8,
    ]);
  });

  it("reads operator provenance with safe license and review metadata", () => {
    const compiled = buildGenebankSourceProvenanceProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("allowed_projection");
    expect(compiled.sql).toContain("allowed_usage");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "plant_variety",
      "grin_genebank_candidate",
      "grin-global",
      "canonical_item",
      1,
    ]);
  });

  it("queues a derived typeahead reindex after promotion", () => {
    const compiled =
      buildEnqueueGenebankTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update',
    );
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
