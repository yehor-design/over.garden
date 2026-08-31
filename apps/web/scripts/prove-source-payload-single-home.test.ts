import { describe, expect, it } from "vitest";

import {
  abortBackfill,
  assertNoForbiddenSourcePayloadMarkers,
  assertSafeSourcePayloadReceipt,
  dedupStatus,
  parseSourcePayloadProofArgs,
  relationSizeClass,
  runCaptureUnitTimeoutFixture,
  SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
  SOURCE_PAYLOAD_MODES,
  type SourcePayloadProofReceipt,
} from "./prove-source-payload-single-home";

const SAFE_RECEIPT: SourcePayloadProofReceipt = {
  schemaVersion: "ove354.sourcePayloadSingleHome.v1",
  mode: "verify",
  runClass: "database",
  status: "pass",
  terminalClass: "verified",
  batchSize: 500,
  batchCount: 1,
  candidateCount: 123,
  deduplicatedCount: 120,
  heldCount: 3,
  failedCount: 0,
  digestsUnchanged: true,
  relationSizeBeforeClass: "1MB_to_10MB",
  relationSizeAfterClass: "under_1MB",
  relationSizeReduced: true,
  maxBatchDurationMs: 12,
  batchBudgetMs: SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
  abortReasonClass: null,
  forbiddenMarkersAbsent: true,
  controls: { abortBackfillEnabled: true, dedupStatusEnabled: true },
};

describe("source payload proof arguments", () => {
  it("refuses a mode outside the closed set", () => {
    expect(() =>
      parseSourcePayloadProofArgs(["--mode", "delete"]),
    ).toThrowError(/--mode must be one of/u);
    expect(() => parseSourcePayloadProofArgs([])).toThrowError(
      /--mode must be one of/u,
    );
  });

  it("accepts every declared mode", () => {
    for (const mode of SOURCE_PAYLOAD_MODES) {
      expect(parseSourcePayloadProofArgs(["--mode", mode]).mode).toBe(mode);
    }
  });

  it("refuses a batch size outside the closed range", () => {
    for (const batchSize of ["0", "1001", "12.5", "many", "-1"]) {
      expect(() =>
        parseSourcePayloadProofArgs([
          "--mode",
          "apply",
          "--batch-size",
          batchSize,
        ]),
      ).toThrowError(/--batch-size must be an integer between 1 and 1000/u);
    }
  });

  it("accepts both ends of the closed range", () => {
    for (const batchSize of ["1", "1000"]) {
      expect(
        parseSourcePayloadProofArgs([
          "--mode",
          "apply",
          "--batch-size",
          batchSize,
        ]).batchSize,
      ).toBe(Number(batchSize));
    }
  });
});

describe("capture unit read timeout", () => {
  it("holds every record and keeps both controls responsive", async () => {
    const receipt = await runCaptureUnitTimeoutFixture({
      mode: "verify",
      batchSize: 500,
    });

    expect(receipt.terminalClass).toBe("inconclusive");
    expect(receipt.deduplicatedCount).toBe(0);
    expect(receipt.heldCount).toBe(500);
    expect(receipt.abortReasonClass).toBe("capture_unit_read_timeout");
    expect(receipt.maxBatchDurationMs).toBeLessThanOrEqual(
      SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS,
    );
    expect(receipt.controls).toEqual({
      abortBackfillEnabled: true,
      dedupStatusEnabled: true,
    });
  });

  it("answers abort and status without waiting on the stalled read", () => {
    expect(abortBackfill()).toBe(true);
    expect(dedupStatus({ batchIndex: 3, candidateCount: 500 })).toEqual({
      batchIndex: 3,
      candidateCount: 500,
      terminalClass: "inconclusive",
    });
  });
});

describe("receipt safety", () => {
  it("rejects a receipt carrying a coordinate", () => {
    expect(() =>
      assertNoForbiddenSourcePayloadMarkers({
        ...SAFE_RECEIPT,
        note: "48.379433, 31.165580",
      }),
    ).toThrowError(/forbidden_marker/u);
  });

  it("rejects a receipt carrying a payload body, an eppo code, or an identifier", () => {
    const leaks = [
      { raw_payload: { taxon_overview: "…" } },
      { eppoCode: "LYPES" },
      { sourceRecordId: "LYPES" },
      { snapshotId: "3f1c2a44-0000-4000-8000-0000000354aa" },
      { id: "3f1c2a44-0000-4000-8000-0000000354aa" },
      { connection: "postgres://user:secret@host/db" },
      { latitude: 48.37 },
    ];
    for (const leak of leaks) {
      expect(() =>
        assertNoForbiddenSourcePayloadMarkers({ ...SAFE_RECEIPT, ...leak }),
      ).toThrowError(/forbidden_marker/u);
    }
  });

  it("accepts a receipt of classes, counts, and durations", () => {
    expect(() =>
      assertNoForbiddenSourcePayloadMarkers(SAFE_RECEIPT),
    ).not.toThrow();
    expect(assertSafeSourcePayloadReceipt(SAFE_RECEIPT)).toBe(SAFE_RECEIPT);
  });

  it("refuses a receipt whose digests changed", () => {
    expect(() =>
      assertSafeSourcePayloadReceipt({
        ...SAFE_RECEIPT,
        digestsUnchanged: false,
      }),
    ).toThrowError(/source_payload_digest_changed/u);
  });

  it("refuses a receipt whose batch accounting does not add up", () => {
    expect(() =>
      assertSafeSourcePayloadReceipt({ ...SAFE_RECEIPT, heldCount: 2 }),
    ).toThrowError(/source_payload_batch_accounting_mismatch/u);
  });

  it("refuses a receipt over the batch budget", () => {
    expect(() =>
      assertSafeSourcePayloadReceipt({
        ...SAFE_RECEIPT,
        maxBatchDurationMs: SOURCE_PAYLOAD_DEDUP_BATCH_BUDGET_MS + 1,
      }),
    ).toThrowError(/source_payload_dedup_batch_budget_exceeded/u);
  });
});

describe("relation size classes", () => {
  it("buckets a size instead of publishing it", () => {
    expect(relationSizeClass(512)).toBe("under_1MB");
    expect(relationSizeClass(2_000_000)).toBe("1MB_to_10MB");
    expect(relationSizeClass(279_511_040)).toBe("256MB_to_512MB");
    expect(relationSizeClass(6_000_000_000)).toBe("over_5GB");
  });
});
