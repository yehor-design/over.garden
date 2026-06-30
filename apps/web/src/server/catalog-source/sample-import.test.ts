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
  CATALOG_SOURCE_SAMPLE,
  catalogSourceSampleAllowedProjection,
  catalogSourceSamplePayloadChecksum,
  catalogSourceSampleSnapshotChecksum,
} from "@/lib/catalog/source-sample";
import {
  buildCatalogSourceSampleTypeaheadProofQuery,
  buildEnqueueCatalogSourceTypeaheadReindexJobQuery,
  buildInsertCatalogSourceLinkQuery,
  buildUpsertCatalogSourceCatalogItemQuery,
  buildUpsertCatalogSourceCatalogNameQuery,
  buildUpsertCatalogSourceRecordQuery,
  buildUpsertCatalogSourceSnapshotQuery,
} from "./sample-import";

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
const snapshotSha256 = "a".repeat(64);
const rawPayloadSha256 = "b".repeat(64);

const forbiddenProjectionMarkers = [
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

describe("catalog source sample import", () => {
  it("keeps source-only poison fields out of the allowed product projection", () => {
    const rawPayload = JSON.stringify(CATALOG_SOURCE_SAMPLE.record.rawPayload);
    const projection = JSON.stringify(catalogSourceSampleAllowedProjection());

    for (const marker of forbiddenProjectionMarkers) {
      expect(rawPayload).toContain(marker);
      expect(projection).not.toContain(marker);
    }
  });

  it("derives stable checksums for the raw payload and source snapshot", () => {
    expect(catalogSourceSamplePayloadChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(catalogSourceSampleSnapshotChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(catalogSourceSampleSnapshotChecksum()).not.toBe(
      catalogSourceSamplePayloadChecksum(),
    );
  });

  it("upserts the legal source snapshot by source version and checksum", () => {
    const compiled = buildUpsertCatalogSourceSnapshotQuery(testDb, {
      payloadSha256: snapshotSha256,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.sql).toContain("returning");
    expect(compiled.parameters).toContain("ua-state-register");
    expect(compiled.parameters).toContain(snapshotSha256);
    expect(compiled.parameters).toContain(
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(compiled.parameters).toContain(
      "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "occurrenceCoordinates",
    );
  });

  it("stores raw source payload only in source records", () => {
    const compiled = buildUpsertCatalogSourceRecordQuery(testDb, {
      sourceSnapshotId: "00000000-0000-4000-8000-000000056001",
      rawPayloadSha256,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_records"');
    expect(compiled.sql).toContain('"raw_payload"');
    expect(compiled.sql).toContain('"source_only_fields"');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(compiled.sql).toContain(
      'on conflict ("source_snapshot_id", "source_record_id") do update',
    );
    expect(JSON.stringify(compiled.parameters)).toContain(
      "occurrenceCoordinates",
    );
    expect(JSON.stringify(compiled.parameters)).toContain("Bergeron 1");
  });

  it("projects only safe catalog item fields with source idempotency", () => {
    const compiled = buildUpsertCatalogSourceCatalogItemQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "catalog_items"');
    expect(compiled.sql).toContain(
      'on conflict ("source", "source_id") do update',
    );
    expect(compiled.parameters).toContain("Bergeron 1");
    expect(compiled.parameters).toContain("ua_state_register");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "occurrenceCoordinates",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("journalBody");
  });

  it("projects source aliases without exposing raw source fields", () => {
    const compiled = buildUpsertCatalogSourceCatalogNameQuery(testDb, {
      catalogItemId: "00000000-0000-4000-8000-000000056002",
      displayName: "Абрикос Bergeron 1",
      normalizedName: "абрикос bergeron 1",
      locale: "uk",
      isPrimary: false,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_item_names"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "normalized_name", "locale") do update',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000056002",
      "Абрикос Bergeron 1",
      "абрикос bergeron 1",
      "uk",
      false,
      "Абрикос Bergeron 1",
      false,
    ]);
  });

  it("links the projected catalog item back to the quarantined source record", () => {
    const compiled = buildInsertCatalogSourceLinkQuery(testDb, {
      catalogItemId: "00000000-0000-4000-8000-000000056002",
      sourceRecordId: "00000000-0000-4000-8000-000000056003",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000056002",
      "00000000-0000-4000-8000-000000056003",
      "ua-state-register",
      "RegisterVarietis:24256002",
      "canonical_item",
    ]);
  });

  it("proves typeahead from safe catalog tables without joining raw sources", () => {
    const compiled = buildCatalogSourceSampleTypeaheadProofQuery(
      testDb,
      "Bergeron",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" on "catalog_items"."id" = "catalog_item_names"."catalog_item_id"',
    );
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("catalog_source_snapshots");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "ua_state_register",
      "%bergeron%",
      8,
    ]);
  });

  it("queues a derived typeahead reindex after import", () => {
    const compiled =
      buildEnqueueCatalogSourceTypeaheadReindexJobQuery(testDb).compile();

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
