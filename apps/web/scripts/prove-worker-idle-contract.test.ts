import { describe, expect, it } from "vitest";

import {
  MATCHING_RUNTIME_REQUIRED_HANDLERS,
  WORKER_DRAIN_CLASSES,
} from "@/lib/matching-runtime-proof";

import {
  assertNoForbiddenWorkerMarkers,
  assertSafeWorkerIdleReceipt,
  parseWorkerIdleProofArgs,
  runNotificationTimeoutFixture,
  stopWorker,
  WORKER_IDLE_MODES,
  WORKER_WAKE_BUDGET_MS,
  workerStatus,
  type WorkerIdleProofReceipt,
} from "./prove-worker-idle-contract";

const SAFE_RECEIPT: WorkerIdleProofReceipt = {
  schemaVersion: "ove356.workerIdleContract.v1",
  mode: "verify",
  runClass: "database",
  status: "pass",
  terminalClass: "verified",
  wakeSourceClass: "notification",
  availableJobWokeWorker: true,
  futureJobStayedSilent: true,
  newIntentWokeWorker: true,
  drainWriteStayedSilent: true,
  drainClassRecorded: true,
  rawDrainMessageRefused: true,
  idleNotificationCount: 0,
  maxWakeLatencyMs: 14,
  wakeBudgetMs: WORKER_WAKE_BUDGET_MS,
  fallbackBoundSeconds: 30,
  degradedReasonClass: null,
  forbiddenMarkersAbsent: true,
  controls: { workerStatusEnabled: true, stopWorkerEnabled: true },
};

describe("worker idle proof arguments", () => {
  it("refuses a mode outside the closed set", () => {
    expect(() => parseWorkerIdleProofArgs(["--mode", "apply"])).toThrowError(
      /--mode must be one of/u,
    );
    expect(() => parseWorkerIdleProofArgs([])).toThrowError(
      /--mode must be one of/u,
    );
  });

  it("accepts every declared mode", () => {
    for (const mode of WORKER_IDLE_MODES) {
      expect(parseWorkerIdleProofArgs(["--mode", mode]).mode).toBe(mode);
    }
  });
});

describe("notification timeout", () => {
  it("falls back to the bound instead of waiting forever or spinning", async () => {
    const receipt = await runNotificationTimeoutFixture({
      mode: "verify",
      fallbackBoundSeconds: 30,
    });

    expect(receipt.terminalClass).toBe("fallback_polling");
    expect(receipt.wakeSourceClass).toBe("bounded_fallback");
    expect(receipt.degradedReasonClass).toBe("notification_not_delivered");
    expect(receipt.idleNotificationCount).toBe(0);
  });

  it("keeps both wait-safe controls usable during the wait", () => {
    expect(workerStatus()).toBe(true);
    expect(stopWorker()).toBe(true);
  });
});

describe("receipt safety", () => {
  it("rejects a receipt carrying an owner, an entity, or a journal reference", () => {
    const leaks = [
      { ownerUserId: "3f1c2a44-0000-4000-8000-0000000356aa" },
      { entityId: "3f1c2a44-0000-4000-8000-0000000356aa" },
      { woke: "journal_entry /journal/tomato-2026" },
      { slug: "tomato-2026" },
      { mediaUrl: "https://media.example/x.webp" },
      { payload: { kind: "journal_entry_index" } },
      { dsn: "postgres://user:secret@host/db" },
      { note: "48.379433, 31.165580" },
    ];
    for (const leak of leaks) {
      expect(() =>
        assertNoForbiddenWorkerMarkers({ ...SAFE_RECEIPT, ...leak }),
      ).toThrowError(/forbidden_marker/u);
    }
  });

  it("accepts a receipt of classes, counts, and booleans", () => {
    expect(() => assertNoForbiddenWorkerMarkers(SAFE_RECEIPT)).not.toThrow();
    expect(assertSafeWorkerIdleReceipt(SAFE_RECEIPT)).toBe(SAFE_RECEIPT);
  });

  it("refuses a receipt over the wake budget", () => {
    expect(() =>
      assertSafeWorkerIdleReceipt({
        ...SAFE_RECEIPT,
        maxWakeLatencyMs: WORKER_WAKE_BUDGET_MS + 1,
      }),
    ).toThrowError(/wake_budget_exceeded/u);
  });

  it("refuses a fallback bound as short as the poll it replaces", () => {
    // A one-second fallback would keep every one of the ~173,000 idle queries
    // a day, which is the cost this whole change exists to remove.
    expect(() =>
      assertSafeWorkerIdleReceipt({ ...SAFE_RECEIPT, fallbackBoundSeconds: 1 }),
    ).toThrowError(/fallback_bound_is_too_short/u);
  });
});

describe("worker drain class", () => {
  it("is a closed set in which unknown is not a synonym for healthy", () => {
    expect([...WORKER_DRAIN_CLASSES]).toEqual([
      "converging",
      "failing",
      "unknown",
    ]);
    expect(WORKER_DRAIN_CLASSES).not.toContain("available");
  });

  it("leaves the handler capability set untouched", () => {
    // The wake mechanism changes when work is discovered, never what the work
    // does. A changed handler set here would mean the contract moved.
    expect([...MATCHING_RUNTIME_REQUIRED_HANDLERS]).toEqual([
      "catalog_alias_suggestions_refresh",
      "catalog_fuzzy_duplicate_qa_refresh",
      "catalog_match_suggestions_refresh",
      "catalog_typeahead_reindex",
      "journal_entry_index",
      "journal_entry_unindex",
    ]);
  });
});
