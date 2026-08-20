import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ONLINE_ONLY_CANON_DEADLINE_MS,
  ONLINE_ONLY_CANON_VERSION,
  evaluateOnlineOnlyCanon,
  formatOnlineOnlyCanonReceipt,
  parseOnlineOnlyCanonArguments,
  runOnlineOnlyCanonCheck,
  type OnlineOnlyClassificationManifest,
} from "./check-online-only-canon";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function fixtureManifest(): OnlineOnlyClassificationManifest {
  return {
    version: ONLINE_ONLY_CANON_VERSION,
    evidenceBaselineSha: "7".repeat(40),
    evidenceV1: {
      command:
        "git grep -lEi 'offline|PWA|Dexie|IndexedDB|service.?worker|local.?draft|queued|synced|no.?internet|офлайн|оффлайн|офлайн-захоплення|локальна черга|блекаут|блэкаут|без інтернет|без интернет' -- .",
      matchingTrackedFiles: 248,
      offlineMatchingTrackedFiles: 164,
    },
    scope: {
      phaseA: ["AGENTS.md", "docs/**/*.md"],
      phaseB: ["apps/web/src/**", "apps/web/public/**"],
    },
    activeAuthorityPaths: ["AGENTS.md"],
    historicalPaths: ["docs/adr/ADR-0014.md"],
    historicalPrefixes: ["docs/audit-inbox/"],
    productResearchPrefix: "docs/product-research/",
    runtimeRules: [
      {
        pathPrefix: "apps/web/src/lib/offline/",
        owner: "OVE-323",
        reason: "Runtime retirement is owned by OVE-323.",
      },
    ],
    activeUnrelatedRules: [
      {
        path: "docs/QUEUE_RECOVERY.md",
        reason: "Queued describes the Postgres job queue.",
      },
    ],
    ownerStates: {
      "OVE-321": "Backlog",
      "OVE-322": "Backlog",
      "OVE-323": "Backlog",
    },
  };
}

function alignedFixture(): Record<string, string> {
  return {
    "AGENTS.md": [
      "# Current online-only authority",
      "",
      "ADR-0017 is current. PWA and offline journal writes are forbidden; navigator.onLine is never an availability oracle.",
    ].join("\n"),
    "docs/adr/ADR-0014.md": [
      "# Historical decision",
      "",
      "Implementation status (2026-07-01): PWA offline capture used IndexedDB.",
    ].join("\n"),
    "docs/product-research/STATE_OF_UA.md": [
      "# Recorded research",
      "",
      "Блекаут і відсутність інтернету були структурним ризиком.",
    ].join("\n"),
    "docs/QUEUE_RECOVERY.md": [
      "# Postgres worker queue",
      "",
      "Queued jobs are leased by the server worker.",
    ].join("\n"),
    "apps/web/src/lib/offline/queue.ts":
      "export const legacyOfflineQueue = 'runtime pending child';",
  };
}

describe("check-online-only-canon", () => {
  it("classifies every matched span and returns a deterministic redacted receipt", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    const first = evaluateOnlineOnlyCanon(files, { manifest });
    const second = evaluateOnlineOnlyCanon(files, { manifest });

    expect(first).toMatchObject({
      status: "aligned",
      version: ONLINE_ONLY_CANON_VERSION,
      baselineSha: manifest.evidenceBaselineSha,
      counts: {
        active_forbidden: 0,
        active_required_guardrail: 1,
        historical_provenance: 1,
        product_research: 1,
        active_unrelated: 1,
        runtime_pending_child: 1,
      },
      violations: [],
    });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/product-research/STATE_OF_UA.md",
          anchor: "Recorded research",
          class: "product_research",
        }),
        expect.objectContaining({
          path: "apps/web/src/lib/offline/queue.ts",
          anchor: "lines 1-1",
          class: "runtime_pending_child",
          owner: "OVE-323",
        }),
      ]),
    );
    expect(JSON.stringify(first)).not.toContain("legacyOfflineQueue");
    expect(JSON.stringify(first)).not.toContain("Блекаут");
  });

  it("fails closed on Latin and Cyrillic active promises", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    files["AGENTS.md"] = [
      "# Current online-only authority",
      "",
      "Keep a PWA shell and local draft queue.",
      "",
      "Зберігайте запис офлайн без інтернету.",
    ].join("\n");

    const receipt = evaluateOnlineOnlyCanon(files, { manifest });

    expect(receipt.status).toBe("canon_drift");
    expect(receipt.counts.active_forbidden).toBe(2);
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "active_offline_instruction" }),
      ]),
    );
  });

  it("keeps dated implementation receipts historical but lets an active gate override a research path", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    files["docs/product-research/STATE_OF_UA.md"] = [
      "# Active gate",
      "",
      "Зберігайте чернетку офлайн.",
      "",
      "# Status",
      "",
      "Implementation status (2026-07-01): offline capture was enabled.",
    ].join("\n");

    const receipt = evaluateOnlineOnlyCanon(files, { manifest });

    expect(receipt.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchor: "Active gate",
          class: "active_forbidden",
        }),
        expect.objectContaining({
          anchor: "Status",
          class: "historical_provenance",
        }),
      ]),
    );
  });

  it("rejects duplicate classification rules and an expired runtime owner", () => {
    const manifest = fixtureManifest();
    manifest.runtimeRules.push({ ...manifest.runtimeRules[0] });
    manifest.ownerStates["OVE-323"] = "Done";

    const receipt = evaluateOnlineOnlyCanon(alignedFixture(), { manifest });

    expect(receipt.status).toBe("canon_drift");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_manifest_rule" }),
        expect.objectContaining({ code: "terminal_runtime_owner" }),
      ]),
    );
  });

  it("rejects a changing proof baseline, a timed-out scan, and late evidence after cancellation", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    const dirty = evaluateOnlineOnlyCanon(files, {
      manifest,
      stableTree: false,
    });
    const timedOut = evaluateOnlineOnlyCanon(files, {
      manifest,
      deadlineMs: 1,
      now: (() => {
        let call = 0;
        return () => (call++ === 0 ? 0 : 2);
      })(),
    });
    const controller = new AbortController();
    controller.abort();
    const cancelled = evaluateOnlineOnlyCanon(files, {
      manifest,
      signal: controller.signal,
    });

    expect(dirty.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "changing_proof_baseline" }),
      ]),
    );
    expect(timedOut).toMatchObject({
      status: "timed_out",
      violations: [{ code: "tracked_file_read_timeout" }],
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      violations: [{ code: "scan_cancelled" }],
    });
  });

  it("parses the scoped CLI contract and rejects unknown arguments", () => {
    expect(
      parseOnlineOnlyCanonArguments([
        "--",
        "--baseline",
        "a".repeat(40),
        "--scope",
        "phase-a",
        "--prove-determinism",
        "--inject-read-timeout",
      ]),
    ).toEqual({
      baselineSha: "a".repeat(40),
      scope: "phase-a",
      proveDeterminism: true,
      injectReadTimeout: true,
    });
    expect(() => parseOnlineOnlyCanonArguments(["--unknown"])).toThrow(
      "unknown_argument",
    );
  });

  it("checks the clean checked-in repository within the five-second contract", () => {
    const receipt = runOnlineOnlyCanonCheck({
      repositoryRoot: REPOSITORY_ROOT,
      allowDirty: true,
    });
    const formatted = JSON.parse(formatOnlineOnlyCanonReceipt(receipt));

    expect(receipt.status).toBe("aligned");
    expect(receipt.durationMs).toBeLessThanOrEqual(
      ONLINE_ONLY_CANON_DEADLINE_MS,
    );
    expect(receipt.baselineSha).toMatch(/^[a-f0-9]{40}$/);
    expect(formatted).toMatchObject({
      status: "aligned",
      version: ONLINE_ONLY_CANON_VERSION,
      baselineSha: receipt.baselineSha,
      counts: receipt.counts,
      digest: receipt.digest,
    });
    expect(formatted).not.toHaveProperty("entries");
  });
});
