import { describe, expect, it, vi } from "vitest";

import {
  evaluateOnlineOnlyRetirement,
  runRetirementScanWithDeadline,
  validateOnlineOnlyMigrationSql,
  validateRetirementPackageSurface,
  type RetirementScanFile,
} from "./verify-online-only-retirement";

const classifications = {
  historical: {
    "docs/history.md": "immutable retired analytics receipt",
  },
  guardrail: {
    "apps/web/scripts/guardrail.ts": "negative retirement guardrail",
  },
  nameOnlyCleanup: {
    "apps/web/src/lib/retirement/known-client-storage.ts":
      "exact-name returning-device cleanup",
  },
  productResearch: {},
  activeUnrelated: {},
} as const;

function file(
  relativePath: string,
  content: string,
  surface: RetirementScanFile["surface"] = "source",
): RetirementScanFile {
  return { relativePath, content, surface };
}

describe("OVE-326 online-only retirement verifier", () => {
  it("classifies exact guardrail, immutable history, and name-only cleanup paths", () => {
    const receipt = evaluateOnlineOnlyRetirement(
      [
        file("apps/web/src/current.ts", "export const mode = 'online';"),
        file(
          "apps/web/scripts/guardrail.ts",
          "// Guardrail rejects Dexie and offline_entry_queued.",
        ),
        file(
          "docs/history.md",
          [
            "Status: immutable historical provenance",
            "Retired event: offline_entry_synced.",
            "This record is non-operative and must not be used as current guidance.",
          ].join("\n"),
          "history",
        ),
        file(
          "apps/web/src/lib/retirement/known-client-storage.ts",
          [
            "// Exact-name cleanup only; never reads a record or payload.",
            'indexedDB.deleteDatabase("overgarden-offline");',
          ].join("\n"),
          "cleanup",
        ),
        file(
          ".next/static/chunks/known-client-cleanup.js",
          [
            "navigator.serviceWorker.getRegistrations();",
            "registration.unregister();",
            'const legacyPath = "/sw.js";',
          ].join("\n"),
          "build",
        ),
      ],
      { classifications },
    );

    expect(receipt.resultClass).toBe("aligned");
    expect(receipt.activeViolationCount).toBe(0);
    expect(receipt.counts).toMatchObject({
      guardrail: 1,
      historical_provenance: 1,
      name_only_cleanup: 2,
    });
  });

  it("fails on retired runtime, import, current copy, package, and build markers", () => {
    const receipt = evaluateOnlineOnlyRetirement(
      [
        file(
          "apps/web/src/runtime.ts",
          [
            'import Dexie from "dexie";',
            'navigator.serviceWorker.register("/sw.js");',
          ].join("\n"),
        ),
        file(
          "apps/web/src/copy.ts",
          'export const success = "Saved offline and queued for sync";',
          "document",
        ),
        file(
          ".next/static/chunks/app.js",
          "fake-indexeddb offline_entry_synced",
          "build",
        ),
      ],
      { classifications },
    );

    expect(receipt.resultClass).toBe("violations_found");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "active_retired_runtime" }),
        expect.objectContaining({ code: "active_retired_copy" }),
        expect.objectContaining({ code: "retired_build_output" }),
      ]),
    );

    expect(
      validateRetirementPackageSurface(
        JSON.stringify({ dependencies: { dexie: "4.0.0" } }),
        "  fake-indexeddb@6.0.0:",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "retired_direct_dependency" }),
        expect.objectContaining({ code: "retired_lock_dependency" }),
      ]),
    );
  });

  it("rejects unclassified history, wildcard rules, and semantic-free allowlists", () => {
    const receipt = evaluateOnlineOnlyRetirement(
      [
        file(
          "docs/unclassified.md",
          "Historical offline_entry_queued implementation notes.",
          "history",
        ),
        file("docs/history.md", "offline_entry_synced", "history"),
      ],
      {
        classifications: {
          ...classifications,
          guardrail: {
            ...classifications.guardrail,
            "apps/web/tests/*": "wildcards are forbidden",
          },
        },
      },
    );

    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unclassified_retired_history" }),
        expect.objectContaining({
          code: "historical_semantic_fixture_missing",
        }),
        expect.objectContaining({ code: "classification_wildcard_forbidden" }),
      ]),
    );
  });

  it("rejects any payload read inside the exact-name cleanup boundary", () => {
    const receipt = evaluateOnlineOnlyRetirement(
      [
        file(
          "apps/web/src/lib/retirement/known-client-storage.ts",
          [
            "// Exact-name cleanup only; non-operative retirement bridge.",
            'const database = indexedDB.open("overgarden-offline");',
            'database.transaction("entries").objectStore("entries").getAll();',
          ].join("\n"),
          "cleanup",
        ),
      ],
      { classifications },
    );

    expect(receipt.violations).toContainEqual(
      expect.objectContaining({ code: "cleanup_payload_access_forbidden" }),
    );
  });

  it("keeps the evidence digest deterministic and outside wall-clock duration", () => {
    const files = [
      file("apps/web/src/current.ts", "export const mode = 'online';"),
    ];
    const first = evaluateOnlineOnlyRetirement(files, {
      classifications,
      now: sequenceNow([10, 11]),
    });
    const second = evaluateOnlineOnlyRetirement(files, {
      classifications,
      now: sequenceNow([100, 150]),
    });

    expect(first.durationMs).not.toBe(second.durationMs);
    expect(first.digest).toBe(second.digest);
  });

  it("returns one bounded degraded receipt and ignores late evidence after timeout", async () => {
    let resolveScan: ((files: RetirementScanFile[]) => void) | undefined;
    const deferred = new Promise<RetirementScanFile[]>((resolve) => {
      resolveScan = resolve;
    });
    const onEvidence = vi.fn();
    const evaluate = vi.fn((files: RetirementScanFile[]) =>
      evaluateOnlineOnlyRetirement(files, { classifications }),
    );

    const receipt = await runRetirementScanWithDeadline({
      deadlineMs: 10,
      scan: async () => deferred,
      evaluate,
      onEvidence,
    });

    expect(receipt.resultClass).toBe("degraded_timeout");
    expect(receipt.durationMs).toBeLessThan(5_000);
    expect(onEvidence).toHaveBeenCalledTimes(1);

    resolveScan?.([file("apps/web/src/late.ts", "offline_entry_queued")]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onEvidence).toHaveBeenCalledTimes(1);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("requires a history-preserving NOT VALID migration and reduced bootstrap", () => {
    expect(
      validateOnlineOnlyMigrationSql({
        bootstrapSql: `
          create table analytics_events (event_name text not null check (
            event_name in ('entry_logged', 'progress_screen_shown')
          ));
        `,
        migrationSql: `
          alter table analytics_events drop constraint analytics_events_event_name_check;
          alter table analytics_events add constraint analytics_events_event_name_check
            check (event_name in ('entry_logged', 'progress_screen_shown')) not valid;
        `,
        immutableHistoricalSql: `
          -- immutable historical migration
          select 'offline_entry_queued', 'offline_entry_synced';
        `,
      }),
    ).toEqual([]);

    expect(
      validateOnlineOnlyMigrationSql({
        bootstrapSql: "select 'offline_entry_queued';",
        migrationSql:
          "delete from analytics_events; alter table analytics_events add constraint analytics_events_event_name_check check (true);",
        immutableHistoricalSql: "",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "bootstrap_retired_event_name" }),
        expect.objectContaining({ code: "migration_row_mutation_forbidden" }),
        expect.objectContaining({ code: "migration_not_valid_missing" }),
        expect.objectContaining({
          code: "immutable_history_retired_event_missing",
        }),
      ]),
    );
  });
});

function sequenceNow(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}
