import { describe, expect, it } from "vitest";

import {
  evaluateTypographyPerformanceGate,
  isCleanTypographyPerformanceFontPath,
  isTypographyPerformanceFontRequest,
  median,
  parseTypographyPerformanceArtifact,
  summarizeTypographyPerformance,
  TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
  TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS,
  TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS,
  TYPOGRAPHY_PERFORMANCE_PROFILE,
  type TypographyPerformanceArtifact,
  type TypographyPerformanceRun,
} from "./typography-performance";

function run(overrides: Partial<TypographyPerformanceRun> = {}) {
  return {
    run: 1,
    lcpMs: 1_000,
    totalCls: 0,
    fontWindowCls: 0,
    firstContentfulPaintMs: 500,
    fontReadyMs: 600,
    fontRequests: [],
    cssRequests: [],
    fontPreloads: [],
    computedBodyFontFamily: "Google Sans",
    externalFontRequests: [],
    pageErrors: [],
    ...overrides,
  } satisfies TypographyPerformanceRun;
}

function artifact(): TypographyPerformanceArtifact {
  const runs = Array.from({ length: 5 }, (_, index) =>
    run({
      run: index + 1,
      fontRequests: [
        {
          path: "/fonts/google-sans/v69/core.woff2",
          transferBytes: 1_024,
          encodedBodyBytes: 1_000,
        },
      ],
      cssRequests: [
        {
          path: "/_next/static/css/app.css",
          transferBytes: 2_048,
          encodedBodyBytes: 2_000,
        },
      ],
      fontPreloads: ["/fonts/google-sans/v69/core.woff2"],
    }),
  );
  return {
    contractVersion: TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
    capturedAt: "2026-07-22T12:00:00.000Z",
    environment: "local",
    label: "before-local",
    baseUrl: "http://127.0.0.1:3000",
    route: "/bg",
    sha: "52172a927f48e7839b102347f3b0caa972343c78",
    profile: TYPOGRAPHY_PERFORMANCE_PROFILE,
    runs,
    summary: summarizeTypographyPerformance(runs),
  };
}

describe("typography performance evidence", () => {
  it("uses a stable median for odd and even run counts", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 2, 1, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("summarizes request bytes and the cold-cache medians", () => {
    const summary = summarizeTypographyPerformance([
      run({
        run: 1,
        lcpMs: 900,
        fontRequests: [
          { path: "/font-a.woff2", transferBytes: 100, encodedBodyBytes: 80 },
        ],
      }),
      run({
        run: 2,
        lcpMs: 1_000,
        fontRequests: [
          { path: "/font-a.woff2", transferBytes: 120, encodedBodyBytes: 80 },
          { path: "/font-b.woff2", transferBytes: 90, encodedBodyBytes: 70 },
        ],
      }),
      run({ run: 3, lcpMs: 1_100 }),
    ]);

    expect(summary).toMatchObject({
      runCount: 3,
      medianLcpMs: 1_000,
      medianFontTransferBytes: 100,
      medianFontEncodedBodyBytes: 80,
      maxFontRequestCount: 2,
    });
  });

  it("uses the stricter of the 100ms and 5% LCP limits", () => {
    const before = summarizeTypographyPerformance([run({ lcpMs: 1_000 })]);
    const passingAfter = summarizeTypographyPerformance([
      run({ lcpMs: 1_050 }),
    ]);
    const failingAfter = summarizeTypographyPerformance([
      run({ lcpMs: 1_051 }),
    ]);

    expect(
      evaluateTypographyPerformanceGate({
        before,
        after: passingAfter,
        afterRuns: [
          run({
            lcpMs: 1_050,
            fontRequests: [
              {
                path: TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0],
                transferBytes: 52_000,
                encodedBodyBytes: 51_956,
              },
              {
                path: TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[1],
                transferBytes: 24_500,
                encodedBodyBytes: 24_248,
              },
            ],
            fontPreloads: [...TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS],
          }),
        ],
      }),
    ).toMatchObject({
      lcpRegressionLimitMs: 50,
      lcpPassed: true,
      computedFamilyPassed: true,
      fontUrlPolicyPassed: true,
      coreRequestShapePassed: true,
      coreTransferBudgetPassed: true,
      lazyVariantsPassed: true,
      preloadPolicyPassed: true,
    });
    expect(
      evaluateTypographyPerformanceGate({
        before,
        after: failingAfter,
        afterRuns: [run({ lcpMs: 1_051 })],
      }).lcpPassed,
    ).toBe(false);

    const wrongPreload = run({
      fontPreloads: [TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0]],
    });
    expect(
      evaluateTypographyPerformanceGate({
        before,
        after: summarizeTypographyPerformance([wrongPreload]),
        afterRuns: [wrongPreload],
      }).preloadPolicyPassed,
    ).toBe(false);

    const eagerMono = run({
      fontRequests: [
        {
          path: "/fonts/google-sans/v69/google-sans-v69-normal-latin-hash.woff2",
          transferBytes: 52_000,
          encodedBodyBytes: 51_956,
        },
        {
          path: "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-hash.woff2",
          transferBytes: 24_500,
          encodedBodyBytes: 24_248,
        },
        {
          path: "/fonts/geist-mono/v6/geist-mono-v6-normal-latin-hash.woff2",
          transferBytes: 12_000,
          encodedBodyBytes: 11_900,
        },
      ],
    });
    expect(
      evaluateTypographyPerformanceGate({
        before,
        after: summarizeTypographyPerformance([eagerMono]),
        afterRuns: [eagerMono],
      }).coreRequestShapePassed,
    ).toBe(false);
  });

  it("counts and rejects rogue OTF and extensionless font requests", () => {
    expect(
      isTypographyPerformanceFontRequest(
        "image",
        "https://over.garden/fonts/rogue.otf",
      ),
    ).toBe(true);
    expect(
      isTypographyPerformanceFontRequest(
        "font",
        "https://over.garden/api/extensionless-font",
      ),
    ).toBe(true);

    const before = summarizeTypographyPerformance([run()]);
    const coreRequests = TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS.map(
      (path, index) => ({
        path,
        transferBytes: index === 0 ? 52_000 : 24_500,
        encodedBodyBytes: index === 0 ? 51_956 : 24_248,
      }),
    );
    for (const roguePath of ["/fonts/rogue.otf", "/api/extensionless-font"]) {
      const afterRun = run({
        fontRequests: [
          ...coreRequests,
          { path: roguePath, transferBytes: 1_000, encodedBodyBytes: 900 },
        ],
        fontPreloads: [...TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS],
      });
      expect(
        evaluateTypographyPerformanceGate({
          before,
          after: summarizeTypographyPerformance([afterRun]),
          afterRuns: [afterRun],
        }).coreRequestShapePassed,
      ).toBe(false);
    }
  });

  it("rejects query or fragment suffixes on every font request and preload", () => {
    expect(
      isCleanTypographyPerformanceFontPath(
        TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0],
      ),
    ).toBe(true);
    expect(
      isCleanTypographyPerformanceFontPath(
        `${TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0]}?cache-bust=1`,
      ),
    ).toBe(false);
    expect(
      isCleanTypographyPerformanceFontPath(
        `${TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0]}#font-fragment`,
      ),
    ).toBe(false);
    expect(
      isCleanTypographyPerformanceFontPath(
        `${TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0]}?`,
      ),
    ).toBe(false);
    expect(
      isCleanTypographyPerformanceFontPath(
        `${TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS[0]}#`,
      ),
    ).toBe(false);

    const before = summarizeTypographyPerformance([run()]);
    const coreRequests = TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS.map(
      (path, index) => ({
        path,
        transferBytes: index === 0 ? 52_000 : 24_500,
        encodedBodyBytes: index === 0 ? 51_956 : 24_248,
      }),
    );
    for (const suffix of ["?cache-bust=1", "#font-fragment"]) {
      const requestWithSuffix = run({
        fontRequests: coreRequests.map((request, index) =>
          index === 0
            ? { ...request, path: `${request.path}${suffix}` }
            : request,
        ),
        fontPreloads: [...TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS],
      });
      const preloadWithSuffix = run({
        fontRequests: coreRequests,
        fontPreloads: TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS.map(
          (path, index) => (index === 0 ? `${path}${suffix}` : path),
        ),
      });

      expect(
        evaluateTypographyPerformanceGate({
          before,
          after: summarizeTypographyPerformance([requestWithSuffix]),
          afterRuns: [requestWithSuffix],
        }),
      ).toMatchObject({
        fontUrlPolicyPassed: false,
        coreRequestShapePassed: false,
      });
      expect(
        evaluateTypographyPerformanceGate({
          before,
          after: summarizeTypographyPerformance([preloadWithSuffix]),
          afterRuns: [preloadWithSuffix],
        }),
      ).toMatchObject({
        fontUrlPolicyPassed: false,
        preloadPolicyPassed: false,
      });
    }
  });

  it("fails eager variants, external requests, page errors, and an oversized core", () => {
    const before = summarizeTypographyPerformance([run()]);
    const afterRun = run({
      computedBodyFontFamily: "Arial, sans-serif",
      externalFontRequests: ["fonts.gstatic.com"],
      pageErrors: ["Error"],
      fontPreloads: [
        "/fonts/google-sans/v69/google-sans-v69-normal-latin-hash.woff2",
        "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-hash.woff2",
        "/fonts/google-sans/v69/google-sans-v69-italic-latin-hash.woff2",
      ],
      fontRequests: [
        {
          path: "/fonts/google-sans/v69/google-sans-v69-normal-latin-hash.woff2",
          transferBytes: 70_000,
          encodedBodyBytes: 51_956,
        },
        {
          path: "/fonts/google-sans/v69/google-sans-v69-normal-cyrillic-hash.woff2",
          transferBytes: 20_000,
          encodedBodyBytes: 24_248,
        },
        {
          path: "/fonts/google-sans/v69/google-sans-v69-italic-latin-hash.woff2",
          transferBytes: 57_000,
          encodedBodyBytes: 56_980,
        },
      ],
    });
    const after = summarizeTypographyPerformance([afterRun]);

    expect(
      evaluateTypographyPerformanceGate({
        before,
        after,
        afterRuns: [afterRun],
      }),
    ).toMatchObject({
      externalFontRequestsPassed: false,
      pageErrorsPassed: false,
      computedFamilyPassed: false,
      fontUrlPolicyPassed: true,
      coreRequestShapePassed: false,
      coreTransferBudgetPassed: false,
      lazyVariantsPassed: false,
      preloadPolicyPassed: false,
    });
  });

  it("parses only compatible exact-SHA artifacts and recomputes the summary", () => {
    expect(
      parseTypographyPerformanceArtifact(artifact(), {
        baseUrl: "http://127.0.0.1:3000",
        environment: "local",
        route: "/bg",
        sha: "52172a927f48e7839b102347f3b0caa972343c78",
      }).summary.runCount,
    ).toBe(5);

    const incompatibleCases = [
      { contractVersion: 1 },
      { route: "/" },
      { sha: "52172a9" },
      { environment: "production" },
      { profile: { ...TYPOGRAPHY_PERFORMANCE_PROFILE, latencyMs: 41 } },
      { runs: artifact().runs.slice(0, 4) },
      {
        runs: artifact().runs.map((item, index) =>
          index === 0 ? { ...item, lcpMs: 0 } : item,
        ),
      },
      {
        runs: artifact().runs.map((item, index) =>
          index === 0 ? { ...item, totalCls: -0.1 } : item,
        ),
      },
      { summary: { ...artifact().summary, medianLcpMs: 1 } },
    ];
    for (const override of incompatibleCases) {
      expect(() =>
        parseTypographyPerformanceArtifact(
          { ...artifact(), ...override },
          {
            baseUrl: "http://127.0.0.1:3000",
            environment: "local",
            route: "/bg",
            sha: "52172a927f48e7839b102347f3b0caa972343c78",
          },
        ),
      ).toThrow();
    }
  });

  it("requires a hashed baseline identity and recomputes every comparison field", () => {
    const baseline = artifact();
    const afterRuns = baseline.runs.map((item) => ({ ...item }));
    const afterSummary = summarizeTypographyPerformance(afterRuns);
    const comparisonBaseline = {
      contractVersion: TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
      artifactSha256: "a".repeat(64),
      label: baseline.label,
      sha: baseline.sha,
      summary: baseline.summary,
    };
    const comparison = evaluateTypographyPerformanceGate({
      before: baseline.summary,
      after: afterSummary,
      afterRuns,
    });
    const compared = {
      ...baseline,
      label: "after-local",
      sha: "1111111111111111111111111111111111111111",
      runs: afterRuns,
      summary: afterSummary,
      comparisonBaseline,
      comparison,
    };

    expect(
      parseTypographyPerformanceArtifact(compared).comparisonBaseline,
    ).toEqual(comparisonBaseline);
    expect(() =>
      parseTypographyPerformanceArtifact({
        ...compared,
        comparison: { ...comparison, lcpPassed: !comparison.lcpPassed },
      }),
    ).toThrow("comparison is not reproducible");
    expect(() =>
      parseTypographyPerformanceArtifact({
        ...compared,
        comparisonBaseline: undefined,
      }),
    ).toThrow("paired baseline identity");
  });
});
