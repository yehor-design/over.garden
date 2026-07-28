import { describe, expect, it } from "vitest";

import {
  assertLaunchCorpusInventorySqlIsSelectOnly,
  buildLaunchCorpusCheckReport,
  buildLaunchCorpusPlanReport,
  detectTechnicalLabelText,
  listLaunchCorpusInventoryStatements,
  validateFounderPublicRow,
  type LaunchCorpusInventoryRows,
} from "@/server/launch-corpus/inventory";
import { LAUNCH_CORPUS_SHOT_LIST } from "@/lib/launch-corpus/shot-list";
import { listLocalCoverMatrixBranchIds } from "@/lib/launch-corpus/cover-matrix";

const emptyInventory: LaunchCorpusInventoryRows = {
  contentClassCounts: [{ contentClass: "real_ugc", count: 0 }],
  publicActiveByClass: [],
  technicalLabelHits: 0,
  tinyPlaceholderMediaHits: 0,
  visualFixtureMutationHits: 0,
  missingSourceLanguageOnFounderPublic: 0,
  archivedWithPublicSlug: 0,
  privateActive: 0,
  publicActiveCount: 0,
};

describe("launch corpus inventory", () => {
  it("exposes only SELECT statements", () => {
    expect(listLaunchCorpusInventoryStatements().length).toBeGreaterThan(5);
    expect(() => assertLaunchCorpusInventorySqlIsSelectOnly()).not.toThrow();
    expect(
      listLaunchCorpusInventoryStatements().find((statement) =>
        statement.includes('"derivativeKey"'),
      ),
    ).toMatch(/media_readiness_state = 'public_ready'/);
  });

  it("plans founder seed slots and cover matrix without private content", () => {
    const report = buildLaunchCorpusPlanReport({
      environment: "production",
      inventory: {
        ...emptyInventory,
        technicalLabelHits: 4,
        tinyPlaceholderMediaHits: 2,
        archivedWithPublicSlug: 10,
        publicActiveCount: 4,
        publicActiveByClass: [{ contentClass: "real_ugc", count: 4 }],
      },
    });

    expect(report.redacted).toBe(true);
    expect(report.founderSeedSlots).toEqual(
      LAUNCH_CORPUS_SHOT_LIST.map((shot) => shot.id),
    );
    expect(report.localCoverMatrixBranchIds).toEqual(
      listLocalCoverMatrixBranchIds(),
    );
    expect(report.launchReady).toBe(false);
    expect(report.blockingReasons).toContain("technical_label_hits");
    expect(
      report.dispositionTargets.some(
        (target) => target.disposition === "archive",
      ),
    ).toBe(true);
    expect(
      report.dispositionTargets.some(
        (target) => target.disposition === "seed_after_signoff",
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(
      /@|password|media\.|quarantine/i,
    );
  });

  it("blocks production launch readiness without founder_first_hand public rows", () => {
    const report = buildLaunchCorpusPlanReport({
      environment: "production",
      inventory: {
        ...emptyInventory,
        publicActiveCount: 4,
        publicActiveByClass: [{ contentClass: "real_ugc", count: 4 }],
      },
    });
    expect(report.launchReady).toBe(false);
    expect(report.blockingReasons).toContain(
      "insufficient_founder_first_hand_public",
    );
    expect(
      report.dispositionTargets.some(
        (target) => target.disposition === "reclassify_production_smoke",
      ),
    ).toBe(true);
  });

  it("fails check while smoke/placeholder remain", () => {
    const plan = buildLaunchCorpusPlanReport({
      environment: "production",
      inventory: {
        ...emptyInventory,
        technicalLabelHits: 1,
        tinyPlaceholderMediaHits: 1,
        publicActiveByClass: [{ contentClass: "production_smoke", count: 1 }],
      },
    });
    const check = buildLaunchCorpusCheckReport({
      environment: "production",
      plan,
      requireLaunchReady: true,
    });
    expect(check.ok).toBe(false);
    expect(check.findings.some((f) => f.code === "technical_labels")).toBe(
      true,
    );
  });

  it("detects technical labels and validates founder rows", () => {
    expect(detectTechnicalLabelText("OVE-51 smoke path")).toBe(true);
    expect(detectTechnicalLabelText("Перший урожай томатів")).toBe(false);
    expect(
      validateFounderPublicRow({
        contentClass: "founder_first_hand",
        sourceLanguage: null,
        title: "Томат",
        body: "Урожай",
      }),
    ).toContain("missing_source_language");
    expect(
      validateFounderPublicRow({
        contentClass: "founder_first_hand",
        sourceLanguage: "uk",
        title: "Томат",
        body: "Урожай 2026-07",
      }),
    ).toEqual([]);
  });
});
