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
  CATALOG_SOURCE_REFRESH_DIFF_STATUSES,
  catalogSourceRefreshBaselineSnapshotDefinition,
  catalogSourceRefreshIncomingSnapshotDefinition,
  catalogSourceRefreshPayloadChecksum,
  catalogSourceRefreshSnapshotChecksum,
  planCatalogSourceRefreshDiff,
  summarizeCatalogSourceRefreshPlan,
} from "@/lib/catalog/source-refresh-sample";
import {
  buildCatalogSourceRefreshReadbackQuery,
  buildCatalogSourceRefreshTypeaheadProofQuery,
  buildEnqueueCatalogSourceRefreshTypeaheadReindexJobQuery,
  buildInsertCatalogSourceRefreshLinkQuery,
  buildUpsertCatalogSourceRefreshCatalogItemQuery,
  buildUpsertCatalogSourceRefreshCatalogNameQuery,
  buildUpsertCatalogSourceRefreshEventQuery,
  buildUpsertCatalogSourceRefreshRecordDiffQuery,
  buildUpsertCatalogSourceRefreshRecordQuery,
  buildUpsertCatalogSourceRefreshSnapshotQuery,
} from "./sample-refresh";

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
const baseline = catalogSourceRefreshBaselineSnapshotDefinition();
const incoming = catalogSourceRefreshIncomingSnapshotDefinition();
const planRows = planCatalogSourceRefreshDiff(
  baseline.records,
  incoming.records,
);
const statusCounts = summarizeCatalogSourceRefreshPlan(planRows);
const sourceSnapshotId = "00000000-0000-4000-8000-000000064001";
const previousSourceRecordId = "00000000-0000-4000-8000-000000064002";
const refreshedSourceRecordId = "00000000-0000-4000-8000-000000064003";
const catalogItemId = "00000000-0000-4000-8000-000000064004";
const refreshEventId = "00000000-0000-4000-8000-000000064005";
const refreshedSnapshotId = "00000000-0000-4000-8000-000000064006";

const forbiddenReadbackMarkers = [
  "raw_payload",
  "rawPayload",
  "source_only_fields",
  "sourceOnlyFields",
  "allowed_projection",
  "allowedProjection",
  "occurrenceCoordinates",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

describe("catalog source sample refresh", () => {
  it("plans a deterministic source refresh diff across every OVE-64 status", () => {
    expect(CATALOG_SOURCE_REFRESH_DIFF_STATUSES).toEqual([
      "new",
      "unchanged",
      "changed",
      "removed_upstream",
      "parser_reject",
      "review_needed",
      "projection_blocked",
    ]);
    expect(statusCounts).toEqual({
      new: 1,
      unchanged: 1,
      changed: 1,
      removed_upstream: 1,
      parser_reject: 1,
      review_needed: 1,
      projection_blocked: 1,
    });

    expect(planRows.find((row) => row.diffStatus === "changed")).toMatchObject({
      sourceRecordKey: "RegisterVarietis:24256010",
      projectionAction: "project_safe_aliases",
      reindexRequired: true,
      reviewReason: null,
    });
    expect(
      planRows.find((row) => row.diffStatus === "review_needed"),
    ).toMatchObject({
      sourceRecordKey: "RegisterVarietis:24256011",
      projectionAction: "queue_curator_review",
      reindexRequired: false,
    });
    expect(
      planRows.find((row) => row.diffStatus === "removed_upstream"),
    ).toMatchObject({
      sourceRecordKey: "RegisterVarietis:24256012",
      projectionAction: "retain_without_upstream",
      reindexRequired: false,
    });
  });

  it("keeps refresh catalog source identity stable across snapshot versions", () => {
    const acceptedProjections = incoming.records
      .map((record) => record.projection)
      .filter((projection) => projection !== null);

    for (const projection of acceptedProjections) {
      expect(projection.sourceId).toMatch(
        /^ua-state-register:RegisterVarietis:/,
      );
      expect(projection.sourceId).not.toContain(incoming.source.version);
      expect(projection.sourceId).not.toContain(baseline.source.version);
    }
  });

  it("builds safe diff output without raw or source-only fields", () => {
    const serializedPlan = JSON.stringify(planRows);

    expect(serializedPlan).toContain("Refresh Renamed 64");
    expect(serializedPlan).toContain("Apricot Refresh Pearl 64");
    for (const marker of forbiddenReadbackMarkers) {
      expect(serializedPlan).not.toContain(marker);
    }
  });

  it("derives stable checksums for refresh snapshots and records", () => {
    expect(catalogSourceRefreshSnapshotChecksum(baseline)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(catalogSourceRefreshSnapshotChecksum(incoming)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(catalogSourceRefreshSnapshotChecksum(baseline)).not.toBe(
      catalogSourceRefreshSnapshotChecksum(incoming),
    );
    expect(catalogSourceRefreshPayloadChecksum(incoming.records[0])).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("upserts the refreshed source snapshot by source version and checksum", () => {
    const compiled = buildUpsertCatalogSourceRefreshSnapshotQuery(
      testDb,
      incoming,
    ).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("ua-state-register");
    expect(compiled.parameters).toContain("2025-08-01-refresh-fixture");
    expect(JSON.stringify(compiled.parameters)).not.toContain("raw_payload");
  });

  it("stores refreshed raw rows only in catalog_source_records", () => {
    const compiled = buildUpsertCatalogSourceRefreshRecordQuery(testDb, {
      sourceSnapshotId,
      record: incoming.records[0],
      projectionStatus: "projected",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_records"');
    expect(compiled.sql).toContain('"raw_payload"');
    expect(compiled.sql).toContain('"source_only_fields"');
    expect(compiled.parameters).toContain(sourceSnapshotId);
    expect(JSON.stringify(compiled.parameters)).toContain("Bergeron 1");
  });

  it("projects accepted refresh records through stable catalog source idempotency", () => {
    const newProjection = incoming.records.find(
      (record) => record.id === "RegisterVarietis:24256013",
    )?.projection;

    if (!newProjection) throw new Error("Missing new refresh projection.");

    const compiled = buildUpsertCatalogSourceRefreshCatalogItemQuery(
      testDb,
      newProjection,
    ).compile();

    expect(compiled.sql).toContain('insert into "catalog_items"');
    expect(compiled.sql).toContain(
      'on conflict ("source", "source_id") do update',
    );
    expect(compiled.parameters).toContain("Refresh New 64");
    expect(compiled.parameters).toContain(
      "ua-state-register:RegisterVarietis:24256013",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      incoming.source.version,
    );
  });

  it("adds changed safe aliases to typeahead without source metadata", () => {
    const compiled = buildUpsertCatalogSourceRefreshCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Apricot Refresh Pearl 64",
      normalizedName: "apricot refresh pearl 64",
      locale: "uk",
      isPrimary: false,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_item_names"');
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "Apricot Refresh Pearl 64",
      "apricot refresh pearl 64",
      "uk",
      false,
      "Apricot Refresh Pearl 64",
      false,
    ]);
  });

  it("links refreshed source records back to stable catalog items", () => {
    const compiled = buildInsertCatalogSourceRefreshLinkQuery(testDb, {
      catalogItemId,
      sourceRecordId: refreshedSourceRecordId,
      sourceSlug: incoming.source.slug,
      sourceRecordKey: "RegisterVarietis:24256010",
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      refreshedSourceRecordId,
      "ua-state-register",
      "RegisterVarietis:24256010",
      "canonical_item",
    ]);
  });

  it("upserts refresh audit events and rows idempotently", () => {
    const event = buildUpsertCatalogSourceRefreshEventQuery(testDb, {
      sourceSlug: incoming.source.slug,
      previousSnapshotId: sourceSnapshotId,
      refreshedSnapshotId,
      refreshLabel: "2025-07-15-refresh-baseline -> 2025-08-01-refresh-fixture",
      refreshedSnapshotSha256: catalogSourceRefreshSnapshotChecksum(incoming),
      summary: statusCounts,
    }).compile();
    const diffRow = buildUpsertCatalogSourceRefreshRecordDiffQuery(testDb, {
      refreshEventId,
      planRow: planRows.find((row) => row.diffStatus === "changed")!,
      previousSourceRecordId,
      refreshedSourceRecordId,
      catalogItemId,
    }).compile();

    expect(event.sql).toContain('insert into "catalog_source_refresh_events"');
    expect(event.sql).toContain(
      'on conflict ("source_slug", "refreshed_snapshot_id") do update',
    );
    expect(diffRow.sql).toContain(
      'insert into "catalog_source_refresh_records"',
    );
    expect(diffRow.sql).toContain(
      'on conflict ("refresh_event_id", "source_record_key") do update',
    );
    expect(diffRow.parameters).toContain("changed");
    expect(JSON.stringify(diffRow.parameters)).toContain(
      "Apricot Refresh Pearl 64",
    );
  });

  it("reads operator refresh diff without selecting raw source payload tables", () => {
    const compiled = buildCatalogSourceRefreshReadbackQuery(
      testDb,
      refreshEventId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_refresh_records"');
    expect(compiled.sql).toContain(
      'inner join "catalog_source_refresh_events"',
    );
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([refreshEventId]);
  });

  it("proves typeahead from safe catalog tables after accepted refresh changes", () => {
    const compiled = buildCatalogSourceRefreshTypeaheadProofQuery(
      testDb,
      "Refresh New 64",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("catalog_source_refresh_records");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "ua_state_register",
      "%refresh new 64%",
      8,
    ]);
  });

  it("queues a derived typeahead reindex only through the matching queue", () => {
    const compiled =
      buildEnqueueCatalogSourceRefreshTypeaheadReindexJobQuery(
        testDb,
      ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
