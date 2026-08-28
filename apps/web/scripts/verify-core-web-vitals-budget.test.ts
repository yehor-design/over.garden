import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_SURFACE_BUDGET,
  PUBLIC_SURFACE_CWV_PROFILE,
  PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS,
  PUBLIC_SURFACE_PERFORMANCE_CLASSES,
  PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS,
  PUBLIC_SURFACE_PERFORMANCE_TARGETS,
} from "../src/lib/performance/public-surface-budget";
import { PUBLIC_SURFACE_DISCOVERY_INVENTORY } from "../src/server/public-surface-discovery";
import {
  buildCoreWebVitalsAggregateReceipt,
  evaluateCoreWebVitalsClass,
  isSafeProductionStaticControlPath,
  measureCoreWebVitalsClassWithDeadline,
  percentile,
  type CoreWebVitalsClassReceipt,
  type CoreWebVitalsRun,
} from "./verify-core-web-vitals-budget-runner";

const SHA = "934a93b755e05fbdc7095d769ed8bf1d0963d643";

function passingRun(overrides: Partial<CoreWebVitalsRun> = {}) {
  return {
    run: 1,
    lcpMs: 1_800,
    inpMs: 120,
    cls: 0.04,
    interactionClass: "observed" as const,
    ...overrides,
  };
}

function fiveRuns(overrides: Partial<CoreWebVitalsRun> = {}) {
  return Array.from(
    { length: PUBLIC_SURFACE_CWV_PROFILE.runsPerClass },
    (_, index) => passingRun({ run: index + 1, ...overrides }),
  );
}

function passingReceipt(
  surfaceClass: (typeof PUBLIC_SURFACE_PERFORMANCE_CLASSES)[number],
): CoreWebVitalsClassReceipt {
  return evaluateCoreWebVitalsClass({
    surfaceClass,
    runs: fiveRuns(),
  });
}

describe("OVE-337 public-surface Core Web Vitals contract", () => {
  it("mapping covers every OVE-335 candidate once and preserves both non-candidates", () => {
    const candidates = PUBLIC_SURFACE_DISCOVERY_INVENTORY.filter(
      ({ candidateClass }) => candidateClass === "candidate",
    ).map(({ consumerId }) => consumerId);
    const nonCandidates = PUBLIC_SURFACE_DISCOVERY_INVENTORY.filter(
      ({ candidateClass }) => candidateClass === "non_candidate",
    ).map(({ consumerId }) => consumerId);

    expect(
      Object.keys(PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS).sort(),
    ).toEqual([...candidates].sort());
    expect(PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS).toEqual(nonCandidates);
    expect(
      new Set(Object.keys(PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS)).size,
    ).toBe(25);
    expect(
      PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS.some(
        (consumerId) => consumerId in PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS,
      ),
    ).toBe(false);
  });

  it("locale-neutral budgets and fixture targets cover all eight classes", () => {
    expect(Object.keys(PUBLIC_SURFACE_BUDGET).sort()).toEqual(
      [...PUBLIC_SURFACE_PERFORMANCE_CLASSES].sort(),
    );
    expect(
      PUBLIC_SURFACE_PERFORMANCE_TARGETS.map(
        ({ surfaceClass }) => surfaceClass,
      ).sort(),
    ).toEqual([...PUBLIC_SURFACE_PERFORMANCE_CLASSES].sort());
    expect(PUBLIC_SURFACE_CWV_PROFILE).toMatchObject({
      browser: "chromium",
      viewport: { width: 390, height: 844 },
      cpuSlowdownMultiplier: 4,
      latencyMs: 40,
      downloadBytesPerSecond: (10 * 1024 * 1024) / 8,
      uploadBytesPerSecond: (2 * 1024 * 1024) / 8,
      runsPerClass: 5,
      percentile: 0.75,
    });
    for (const budget of Object.values(PUBLIC_SURFACE_BUDGET)) {
      expect(budget).toMatchObject({ lcpMs: 2_500, inpMs: 200, cls: 0.1 });
      expect(budget.reason.length).toBeGreaterThan(20);
      expect("locale" in budget).toBe(false);
    }
  });

  it("evaluates exact boundaries as pass and any exceeded metric as over_budget", () => {
    const exact = evaluateCoreWebVitalsClass({
      surfaceClass: "feed",
      runs: fiveRuns({ lcpMs: 2_500, inpMs: 200, cls: 0.1 }),
    });
    expect(exact).toMatchObject({
      status: "pass",
      reasonClasses: [],
      p75: { lcpMs: 2_500, inpMs: 200, cls: 0.1 },
    });

    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "feed",
        runs: fiveRuns({ lcpMs: 2_501 }),
      }),
    ).toMatchObject({
      status: "over_budget",
      reasonClasses: ["lcp_over_budget"],
    });
    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "feed",
        runs: fiveRuns({ inpMs: 201 }),
      }),
    ).toMatchObject({
      status: "over_budget",
      reasonClasses: ["inp_over_budget"],
    });
    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "feed",
        runs: fiveRuns({ cls: 0.101 }),
      }),
    ).toMatchObject({
      status: "over_budget",
      reasonClasses: ["cls_over_budget"],
    });
  });

  it("interaction and LCP absence fail as not_measured instead of becoming zero", () => {
    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "journal_entry",
        runs: fiveRuns({ lcpMs: null }),
      }),
    ).toMatchObject({ status: "not_measured", reasonClasses: ["lcp_missing"] });
    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "journal_entry",
        runs: fiveRuns({ inpMs: null, interactionClass: "missing" }),
      }),
    ).toMatchObject({
      status: "not_measured",
      reasonClasses: ["interaction_missing"],
    });
    expect(
      evaluateCoreWebVitalsClass({
        surfaceClass: "journal_entry",
        runs: fiveRuns().slice(0, 4),
      }),
    ).toMatchObject({
      status: "not_measured",
      reasonClasses: ["run_count_mismatch"],
    });
  });

  it("uses deterministic nearest-rank p75 rather than a best run", () => {
    expect(percentile([100, 200, 300, 400, 500], 0.75)).toBe(400);
    expect(percentile([500, 100, 300, 200, 400], 0.75)).toBe(400);
    expect(() => percentile([], 0.75)).toThrow("percentile_input_empty");
  });

  it("replay and concurrent pure evaluation produce one semantic digest", async () => {
    const input = { surfaceClass: "profile" as const, runs: fiveRuns() };
    const first = evaluateCoreWebVitalsClass(input);
    const replay = evaluateCoreWebVitalsClass(input);
    const concurrent = await Promise.all([
      Promise.resolve().then(() => evaluateCoreWebVitalsClass(input)),
      Promise.resolve().then(() => evaluateCoreWebVitalsClass(input)),
    ]);

    expect(replay).toEqual(first);
    expect(concurrent).toEqual([first, first]);
    expect(first.semanticDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("aggregate refuses a missing class and emits only bounded location-safe evidence", () => {
    const complete = buildCoreWebVitalsAggregateReceipt({
      buildSha: SHA,
      environment: "local",
      classReceipts: PUBLIC_SURFACE_PERFORMANCE_CLASSES.map(passingReceipt),
    });
    expect(complete).toMatchObject({
      status: "pass",
      classCount: 8,
      candidateConsumerCount: 25,
      nonCandidateConsumerCount: 2,
      preciseLocationAbsent: true,
      controls: {
        retryMeasurementCommand: "usable",
        budgetReportCommand: "usable",
      },
    });
    expect(JSON.stringify(complete)).not.toMatch(
      /latitude|longitude|coordinates|userId|mediaKey/i,
    );

    const partial = buildCoreWebVitalsAggregateReceipt({
      buildSha: SHA,
      environment: "local",
      classReceipts: PUBLIC_SURFACE_PERFORMANCE_CLASSES.slice(0, -1).map(
        passingReceipt,
      ),
    });
    expect(partial).toMatchObject({ status: "not_measured", classCount: 7 });
  });

  it("production static controls forbid dynamic user-derived paths", () => {
    expect(isSafeProductionStaticControlPath("/bg")).toBe(true);
    expect(isSafeProductionStaticControlPath("/bg/objects")).toBe(true);
    expect(isSafeProductionStaticControlPath("/bg/journals")).toBe(true);
    expect(isSafeProductionStaticControlPath("/bg/knowledge")).toBe(true);
    expect(isSafeProductionStaticControlPath("/bg/journal/private-slug")).toBe(
      false,
    );
    expect(
      isSafeProductionStaticControlPath(
        "/lineage/objects/18700003-0000-4000-8000-000000000001",
      ),
    ).toBe(false);
    expect(isSafeProductionStaticControlPath("/bg/@someone")).toBe(false);
    expect(
      isSafeProductionStaticControlPath("/bg/communities/member-derived"),
    ).toBe(false);
  });

  it("timeout is bounded, controls stay usable, and late completion is ignored", async () => {
    vi.useFakeTimers();
    let resolveLate: ((runs: CoreWebVitalsRun[]) => void) | undefined;
    const pending = measureCoreWebVitalsClassWithDeadline({
      surfaceClass: "knowledge",
      deadlineMs: 50,
      measure: () =>
        new Promise<CoreWebVitalsRun[]>((resolve) => {
          resolveLate = resolve;
        }),
    });
    await vi.advanceTimersByTimeAsync(50);
    const receipt = await pending;
    expect(receipt).toMatchObject({
      status: "not_measured",
      reasonClasses: ["measurement_timeout"],
      controls: {
        retryMeasurementCommand: "usable",
        budgetReportCommand: "usable",
      },
    });
    resolveLate?.(fiveRuns());
    await vi.runAllTimersAsync();
    expect(receipt.reasonClasses).toEqual(["measurement_timeout"]);
    vi.useRealTimers();
  });

  it("cancellation fences a late browser result and a fresh retry can recover", async () => {
    const controller = new AbortController();
    let resolveLate: ((runs: CoreWebVitalsRun[]) => void) | undefined;
    const pending = measureCoreWebVitalsClassWithDeadline({
      surfaceClass: "community",
      deadlineMs: 1_000,
      signal: controller.signal,
      measure: () =>
        new Promise<CoreWebVitalsRun[]>((resolve) => {
          resolveLate = resolve;
        }),
    });
    controller.abort();
    const cancelled = await pending;
    resolveLate?.(fiveRuns());
    expect(cancelled).toMatchObject({
      status: "not_measured",
      reasonClasses: ["measurement_cancelled"],
    });

    const recovered = await measureCoreWebVitalsClassWithDeadline({
      surfaceClass: "community",
      deadlineMs: 1_000,
      measure: async () => fiveRuns(),
    });
    expect(recovered).toMatchObject({ status: "pass", reasonClasses: [] });
  });
});
