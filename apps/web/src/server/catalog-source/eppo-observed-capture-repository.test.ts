import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
  buildClaimNextEppoCaptureUnitQuery,
  buildCompleteEppoCaptureUnitQuery,
  buildCreateEppoCaptureQuery,
  buildEppoCaptureSafeStatusQuery,
  buildEppoZeroProductFingerprintQuery,
  buildFailEppoCaptureUnitQuery,
  buildInsertEppoInventoryPageQuery,
  buildInsertEppoObservedSnapshotQuery,
  buildClaimEppoSourceRecordBatchQuery,
  buildDeduplicateEppoSourceRecordPayloadsQuery,
  buildListEppoCapturedSnapshotsQuery,
  buildMaterializeEppoSourceRecordsQuery,
  buildQueueEppoEndpointUnitsQuery,
  buildReconstructEppoSourceRecordPayloadQuery,
  buildRestoreEppoSourceRecordPayloadsQuery,
  buildRecoverStaleEppoClaimsQuery,
  buildReleaseCancelledEppoClaimQuery,
  buildTransitionEppoCaptureQuery,
  classifyEppoResponseFields,
  digestCanonicalJson,
  parseEppoInventoryPage,
  splitEppoResponseByRights,
} from "./eppo-observed-capture-repository";

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
const captureId = "00000000-0000-4000-8000-000000254001";
const claimToken = "00000000-0000-4000-8000-000000254002";

const migrationPath = path.resolve(
  process.cwd(),
  "sql/0023_ove254_eppo_observed_capture.sql",
);

describe("EPPO observed capture repository", () => {
  it("reserves migration 0023 for an immutable source-only capture", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain(
      "create table if not exists catalog_source_capture_runs",
    );
    expect(sql).toContain(
      "create table if not exists catalog_source_capture_units",
    );
    expect(sql).toContain("field_rights jsonb");
    expect(sql).toContain("raw_payload jsonb");
    expect(sql).toContain("unique (capture_id, eppo_code, endpoint_class)");
    expect(sql).toContain("superseded_by_capture_id");
    expect(sql).toContain("catalog_source_capture_units_immutable_terminal");
    expect(sql).toContain("invalid observed capture state transition");
    expect(sql).toContain(
      "eppo_code ~ '^[0-9A-Z.!:/]{1,10}$'",
    );
    expect(sql).toContain(
      "eppo_code !~ '^[0-9A-Z]{5,6}$'",
    );
    expect(sql).toContain("'inactive_eppo_identifier'");
    expect(sql).not.toMatch(
      /insert\s+into\s+(?:catalog_items|catalog_item_names|catalog_source_links|job_queue)/iu,
    );
  });

  it("rejects duplicate inventory drift while parsing one ordered page", () => {
    expect(
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 2, count: 2, total: 2 },
          data: [
            { eppocode: "ABCD01", is_active: true, datatype: "plant" },
            { eppocode: "ZZZZ99", is_active: true, datatype: "animal" },
          ],
        },
        { offset: 0, limit: 2 },
      ),
    ).toEqual({
      total: 2,
      codes: ["ABCD01", "ZZZZ99"],
      identifiers: [
        { eppoCode: "ABCD01", isActive: true },
        { eppoCode: "ZZZZ99", isActive: true },
      ],
    });

    expect(() =>
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 2, count: 2, total: 2 },
          data: [
            { eppocode: "ABCD01", is_active: true },
            { eppocode: "ABCD01", is_active: true },
          ],
        },
        { offset: 0, limit: 2 },
      ),
    ).toThrow("duplicate_eppo_code");
  });

  it("retains an observed legacy identifier as source-only without requesting an undocumented detail URL", () => {
    expect(
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 1, count: 1, total: 1 },
          data: [
            {
              eppocode: "ABC",
              is_active: false,
              datatype: "SPB",
            },
          ],
        },
        { offset: 0, limit: 1 },
      ),
    ).toEqual({
      total: 1,
      codes: ["ABC"],
      identifiers: [{ eppoCode: "ABC", isActive: false }],
    });

    const queued = buildQueueEppoEndpointUnitsQuery(testDb, {
      captureId,
      inventoryOrdinalStart: 0,
      identifiers: [{ eppoCode: "ABC", isActive: false }],
    }).compile();
    expect(queued.parameters).toContain("legacy_schema_exception");
    expect(queued.parameters).toContain("not_applicable");
    expect(queued.parameters).toContain("not_requested");
    expect(queued.parameters).not.toContain("pending");
  });

  it("accepts only bounded inactive legacy identifier shapes from the observed list", () => {
    for (const eppocode of ["A", "AA", "A/A:A/A", "AAAAAAAA"]) {
      expect(
        parseEppoInventoryPage(
          {
            pagination: { offset: 0, limit: 1, count: 1, total: 1 },
            data: [{ eppocode, is_active: false }],
          },
          { offset: 0, limit: 1 },
        ),
      ).toEqual({
        total: 1,
        codes: [eppocode],
        identifiers: [{ eppoCode: eppocode, isActive: false }],
      });
    }

    expect(() =>
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 1, count: 1, total: 1 },
          data: [{ eppocode: "AA", is_active: true }],
        },
        { offset: 0, limit: 1 },
      ),
    ).toThrow("active_legacy_eppo_code_refused");
    expect(() =>
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 1, count: 1, total: 1 },
          data: [{ eppocode: "AA" }],
        },
        { offset: 0, limit: 1 },
      ),
    ).toThrow("inventory_active_state_mismatch");

    for (const eppocode of ["aa", "A-A", "A A", "A".repeat(11)]) {
      expect(() =>
        parseEppoInventoryPage(
          {
            pagination: { offset: 0, limit: 1, count: 1, total: 1 },
            data: [{ eppocode, is_active: false }],
          },
          { offset: 0, limit: 1 },
        ),
      ).toThrow("invalid_eppo_code");
    }

    const queued = buildQueueEppoEndpointUnitsQuery(testDb, {
      captureId,
      inventoryOrdinalStart: 0,
      identifiers: [{ eppoCode: "A/A:A/A", isActive: false }],
    }).compile();
    expect(queued.parameters).toContain("legacy_schema_exception");
    expect(queued.parameters).toContain("not_requested");
    expect(queued.parameters).not.toContain("pending");
  });

  it("preserves the provider-declared order when legacy collation differs locally", () => {
    expect(
      parseEppoInventoryPage(
        {
          pagination: { offset: 0, limit: 2, count: 2, total: 2 },
          data: [
            { eppocode: "AAAA00", is_active: true },
            { eppocode: "AAAA.A", is_active: false },
          ],
        },
        { offset: 0, limit: 2 },
      ),
    ).toEqual({
      total: 2,
      codes: ["AAAA00", "AAAA.A"],
      identifiers: [
        { eppoCode: "AAAA00", isActive: true },
        { eppoCode: "AAAA.A", isActive: false },
      ],
    });
  });

  it("retains a documented-shape inactive identifier without requesting details", () => {
    const parsed = parseEppoInventoryPage(
      {
        pagination: { offset: 0, limit: 1, count: 1, total: 1 },
        data: [{ eppocode: "ABCD01", is_active: false }],
      },
      { offset: 0, limit: 1 },
    );
    expect(parsed.identifiers).toEqual([
      { eppoCode: "ABCD01", isActive: false },
    ]);

    const queued = buildQueueEppoEndpointUnitsQuery(testDb, {
      captureId,
      inventoryOrdinalStart: 0,
      identifiers: parsed.identifiers,
    }).compile();
    expect(queued.parameters).toContain("inactive_eppo_identifier");
    expect(queued.parameters).toContain("not_applicable");
    expect(queued.parameters).toContain("not_requested");
    expect(queued.parameters).not.toContain("pending");
  });

  it("applies rights classification to public, source-only, location, restricted, and unknown fields", () => {
    const classification = classifyEppoResponseFields({
      eppocode: "ABCD01",
      fullname: "Fixture taxon",
      dateupdate: "2026-08-25",
      latitude: "redacted-fixture",
      image_url: "https://example.invalid/restricted.jpg",
      unexpected_provider_field: "fixture",
    });

    expect(classification.fieldRights).toEqual({
      dateupdate: "source_only",
      eppocode: "source_public",
      fullname: "source_public",
      image_url: "forbidden",
      latitude: "forbidden",
      unexpected_provider_field: "unknown",
    });
    expect(classification.rightsCounts).toEqual({
      source_public: 2,
      source_only: 1,
      forbidden: 2,
      unknown: 1,
    });
    expect(classification.unitState).toBe("forbidden");
  });

  it("classifies array endpoint fields by stable paths rather than row values", () => {
    const classification = classifyEppoResponseFields([
      { name: "Fixture A", language: "en" },
      { language: "uk", name: "Fixture B" },
    ]);

    expect(classification.fieldRights).toEqual({
      "[].language": "source_public",
      "[].name": "source_public",
    });
    expect(classification.rightsCounts).toEqual({
      source_public: 2,
      source_only: 0,
      forbidden: 0,
      unknown: 0,
    });
    expect(classification.unitState).toBe("captured");
  });

  it("splits mixed endpoint payloads into public and source-only projections", () => {
    const payload = [
      {
        name_id: 1,
        lang_iso: "en",
        country_iso: null,
        fullname: "Fixture A",
        preferred: true,
        author: "Fixture author",
      },
    ];
    const classification = classifyEppoResponseFields(payload);

    expect(
      splitEppoResponseByRights(payload, classification.fieldRights),
    ).toEqual({
      allowedProjection: [
        {
          author: "Fixture author",
          country_iso: null,
          fullname: "Fixture A",
          lang_iso: "en",
          preferred: true,
        },
      ],
      sourceOnlyFields: [{ name_id: 1 }],
    });
  });

  it("digests semantically identical JSON deterministically", () => {
    expect(digestCanonicalJson({ b: [2, 1], a: "fixture" })).toBe(
      digestCanonicalJson({ a: "fixture", b: [2, 1] }),
    );
    expect(digestCanonicalJson({ b: [1, 2], a: "fixture" })).not.toBe(
      digestCanonicalJson({ a: "fixture", b: [2, 1] }),
    );
  });

  it("builds one source-only capture without product or search writes", () => {
    const created = buildCreateEppoCaptureQuery(testDb, {
      id: captureId,
      captureToolRevision: "a".repeat(40),
      openApiSha256: "b".repeat(64),
      licenseSha256: "c".repeat(64),
      observedStartedAt: new Date("2026-08-25T00:00:00.000Z"),
      preflightReceipt: { environment: "local", headroom: "verified" },
      zeroProductBaseline: { catalogItems: { count: 0, digest: "fixture" } },
    }).compile();

    expect(created.sql).toContain('insert into "catalog_source_capture_runs"');
    expect(created.sql).toContain('returning "id", "state"');
    expect(created.parameters).toContain("observed_capture");
    expect(created.parameters).not.toContain("production");
    expect(created.sql).not.toMatch(
      /insert into "(?:catalog_items|catalog_item_names|catalog_source_links|job_queue)"/u,
    );
  });

  it("persists immutable inventory evidence and queues three documented detail classes", () => {
    const payload = {
      pagination: { offset: 0, limit: 2, count: 2, total: 2 },
      data: [
        { eppocode: "ABCD01", is_active: true },
        { eppocode: "ZZZZ99", is_active: true },
      ],
    };
    const inventory = buildInsertEppoInventoryPageQuery(testDb, {
      captureId,
      offset: 0,
      limit: 2,
      payload,
      observedAt: new Date("2026-08-25T00:00:01.000Z"),
    }).compile();
    const queued = buildQueueEppoEndpointUnitsQuery(testDb, {
      captureId,
      inventoryOrdinalStart: 0,
      identifiers: [
        { eppoCode: "ABCD01", isActive: true },
        { eppoCode: "ZZZZ99", isActive: true },
      ],
    }).compile();

    expect(inventory.sql).toContain(
      'insert into "catalog_source_capture_units"',
    );
    expect(inventory.sql).toContain(
      'on conflict ("capture_id", "endpoint_class", "unit_key") do nothing',
    );
    expect(inventory.parameters).toContain(digestCanonicalJson(payload));
    expect(queued.sql).toContain('insert into "catalog_source_capture_units"');
    // Each row binds the code as both unit_key and eppo_code.
    expect(
      queued.parameters.filter((value) => value === "ABCD01"),
    ).toHaveLength(6);
    expect(queued.parameters).toEqual(
      expect.arrayContaining([
        "taxon_overview",
        "taxon_names",
        "taxon_taxonomy",
      ]),
    );
  });

  it("claims serial work with skip-locked fencing and recovers only stale claims", () => {
    const claim = buildClaimNextEppoCaptureUnitQuery(testDb, {
      captureId,
      claimToken,
      claimedAt: new Date("2026-08-25T00:05:00.000Z"),
      maxAttempts: 2,
    }).compile();
    const recover = buildRecoverStaleEppoClaimsQuery(testDb, {
      captureId,
      staleBefore: new Date("2026-08-25T00:00:00.000Z"),
      maxAttempts: 2,
    }).compile();

    expect(claim.sql).toContain("for update skip locked");
    expect(claim.sql).toContain('"claim_token" =');
    expect(claim.sql).toContain('"attempt_count" =');
    expect(claim.sql).toContain("exists (select 1");
    expect(claim.parameters).toContain("hydrating");
    expect(recover.parameters).toContain("in_progress");
    expect(recover.sql).toContain('"claimed_at" <');
    expect(recover.parameters).toContain("pending");

    const released = buildReleaseCancelledEppoClaimQuery(testDb, {
      captureId,
      unitId: "00000000-0000-4000-8000-000000254003",
      claimToken,
      releasedAt: new Date("2026-08-25T00:05:01.000Z"),
    }).compile();
    expect(released.parameters).toContain(claimToken);
    expect(released.parameters).toContain("pending");
    expect(released.sql).toContain('"attempt_count" -');
  });

  it("exposes aggregate status and fingerprints every zero product owner", () => {
    const status = buildEppoCaptureSafeStatusQuery(testDb, captureId).compile();
    const zeroProduct = buildEppoZeroProductFingerprintQuery(testDb).compile();

    expect(status.sql).toContain('from "catalog_source_capture_runs"');
    expect(status.sql).toContain('left join "catalog_source_capture_units"');
    expect(status.sql).not.toContain("raw_payload");
    expect(status.sql).not.toContain("field_rights");
    for (const table of [
      "catalog_items",
      "catalog_item_names",
      "catalog_source_links",
      "job_queue",
      "plant_objects",
      "journal_entries",
    ]) {
      expect(zeroProduct.sql).toContain(table);
    }
  });

  it("fences terminal writes by claim token and active capture state", () => {
    const completed = buildCompleteEppoCaptureUnitQuery(testDb, {
      captureId,
      unitId: "00000000-0000-4000-8000-000000254003",
      claimToken,
      observedAt: new Date("2026-08-25T00:05:01.000Z"),
      httpStatusClass: "2xx",
      payload: { eppocode: "ABCD01", fullname: "Fixture" },
    }).compile();
    const failed = buildFailEppoCaptureUnitQuery(testDb, {
      captureId,
      unitId: "00000000-0000-4000-8000-000000254003",
      claimToken,
      errorClass: "request_timeout",
      failedAt: new Date("2026-08-25T00:05:16.000Z"),
    }).compile();

    for (const compiled of [completed, failed]) {
      expect(compiled.sql).toContain('"claim_token" =');
      expect(compiled.parameters).toContain(claimToken);
      expect(compiled.sql).toContain("exists (select 1");
      expect(compiled.parameters).toContain("hydrating");
    }
    expect(completed.parameters).toContain(
      digestCanonicalJson({ eppocode: "ABCD01", fullname: "Fixture" }),
    );
    expect(failed.parameters).toContain("request_timeout");
  });

  it("materializes quarantined source records without product projection", () => {
    const transition = buildTransitionEppoCaptureQuery(testDb, {
      captureId,
      fromStates: ["inventorying"],
      toState: "hydrating",
      updates: {
        inventoryStartTotal: 2,
        inventoryUniqueCodes: 2,
        inventoryPageCount: 1,
        inventoryStartSha256: "d".repeat(64),
      },
    }).compile();
    const snapshot = buildInsertEppoObservedSnapshotQuery(testDb, {
      captureId,
      manifestSha256: "e".repeat(64),
      fetchedAt: new Date("2026-08-25T00:00:00.000Z"),
      verifiedAt: new Date("2026-08-25T01:00:00.000Z"),
    }).compile();
    const records = buildMaterializeEppoSourceRecordsQuery(testDb, {
      captureId,
      sourceSnapshotId: "00000000-0000-4000-8000-000000254004",
    }).compile();

    expect(transition.sql).toContain('update "catalog_source_capture_runs"');
    expect(transition.parameters).toEqual(
      expect.arrayContaining(["inventorying", "hydrating"]),
    );
    expect(snapshot.sql).toContain('insert into "catalog_source_snapshots"');
    expect(snapshot.parameters).toContain("rejected");
    expect(records.sql).toContain('insert into "catalog_source_records"');
    expect(records.sql).toContain("jsonb_object_agg");
    expect(records.parameters).toContain("quarantined");
    expect(records.sql).not.toMatch(
      /(?:insert into|update) "(?:catalog_items|catalog_item_names|catalog_source_links|job_queue)"/u,
    );
  });
});

describe("source payload single home", () => {
  const SNAPSHOT_ID = "00000000-0000-4000-8000-000000354001";
  const RECORD_IDS = [
    "00000000-0000-4000-8000-000000354002",
    "00000000-0000-4000-8000-000000354003",
  ];

  it("materializes the payload home instead of a second copy of the bytes", () => {
    const compiled = buildMaterializeEppoSourceRecordsQuery(testDb, {
      captureId: "00000000-0000-4000-8000-000000354000",
      sourceSnapshotId: SNAPSHOT_ID,
    }).compile();

    expect(compiled.sql).toContain('"raw_payload_home"');
    expect(compiled.parameters).toContain("capture_units");
    // The record no longer receives the aggregated body; only its digest.
    expect(compiled.sql).not.toMatch(/insert into "catalog_source_records" \([^)]*"raw_payload"[^_]/u);
    expect(compiled.sql).toContain("sha256");
  });

  it("reconstructs a payload and its digest from the units that produced it", () => {
    const compiled = buildReconstructEppoSourceRecordPayloadQuery(testDb, {
      sourceSnapshotId: SNAPSHOT_ID,
      sourceRecordId: "LYPES",
    }).compile();

    expect(compiled.sql).toContain('"catalog_source_capture_units"');
    expect(compiled.sql).toContain('"catalog_source_capture_runs"');
    expect(compiled.sql).toContain("jsonb_object_agg");
    expect(compiled.sql).toContain("sha256");
    expect(compiled.parameters).toContain("taxon_endpoint");
    expect(compiled.parameters).toContain(SNAPSHOT_ID);
  });

  it("claims a bounded batch at one home without waiting on another run", () => {
    const compiled = buildClaimEppoSourceRecordBatchQuery(testDb, {
      sourceSnapshotId: SNAPSHOT_ID,
      payloadHome: "inline",
      batchSize: 500,
    }).compile();

    expect(compiled.sql).toContain("for update");
    expect(compiled.sql).toContain("skip locked");
    expect(compiled.sql).toContain('"raw_payload_home"');
    expect(compiled.parameters).toContain("inline");
    expect(compiled.parameters).toContain(500);
  });

  it("drops a copy only where the units reproduce the stored digest", () => {
    const compiled = buildDeduplicateEppoSourceRecordPayloadsQuery(testDb, {
      recordIds: RECORD_IDS,
    }).compile();

    // The comparison and the write are one statement: a record cannot be
    // emptied on the strength of a digest that was true a moment earlier.
    expect(compiled.sql).toContain('"unit_digest" = ');
    expect(compiled.sql).toContain('"stored_digest"');
    expect(compiled.sql).toContain("update");
    expect(compiled.parameters).toContain("capture_units");
    expect(compiled.parameters).toContain("inline");
    for (const id of RECORD_IDS) expect(compiled.parameters).toContain(id);
  });

  it("restores a payload from the same aggregate that produced its digest", () => {
    const compiled = buildRestoreEppoSourceRecordPayloadsQuery(testDb, {
      recordIds: RECORD_IDS,
    }).compile();

    expect(compiled.sql).toContain("jsonb_object_agg");
    expect(compiled.sql).toContain('"rebuilt"."payload"');
    expect(compiled.parameters).toContain("inline");
    expect(compiled.parameters).toContain("capture_units");
  });

  it("lists only snapshots an observed capture actually produced", () => {
    const compiled = buildListEppoCapturedSnapshotsQuery(testDb).compile();

    expect(compiled.sql).toContain('"catalog_source_capture_runs"');
    expect(compiled.sql).toContain("is not null");
    expect(compiled.parameters).toContain("completed");
  });
});
