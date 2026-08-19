import { describe, expect, it } from "vitest";

import {
  assertNoTypographyBrowserContractOverrides,
  computedFontFamilies,
  evaluateTypographyBrowserObservation,
  evaluateTypographyFallbackObservation,
  evaluateTypographyGlobalErrorObservation,
  FALLBACK_CASE_MAX_ATTEMPTS,
  firstComputedFontFamily,
  inspectTypographyBrowserFontUrls,
  isExpectedGoogleSansFamily,
  isTypographyBrowserFontPathAllowed,
  isTypographyBrowserFontUrlAllowed,
  parseTypographyBrowserRouteManifest,
  shouldAttemptFallbackCaseAgain,
  shouldRetryFallbackCase,
  SCHEDULER_SENSITIVE_FALLBACK_FAILURE_CODES,
  parseUnicodeRange,
  textRequiresCyrillicExtended,
  textRequiresLatinExtended,
  TYPOGRAPHY_BROWSER_VIEWPORTS,
  TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS,
  TYPOGRAPHY_GLYPH_CORPUS,
  unicodeRangeCoversText,
  type TypographyBrowserObservation,
  type TypographyFallbackObservation,
  type TypographyGlobalErrorObservation,
} from "./typography-browser-contract";

function observation(
  overrides: Partial<TypographyBrowserObservation> = {},
): TypographyBrowserObservation {
  return {
    routeId: "bg-home",
    surface: "product",
    locale: "bg",
    expectedStatus: 200,
    actualStatus: 200,
    documentLang: "bg",
    fontsReady: true,
    loadedFaceCount: 2,
    computedFontFamily: '"Google Sans", sans-serif',
    horizontalOverflowPx: 0,
    offscreenControlCount: 0,
    clippedTextCount: 0,
    proportionalFontMismatchCount: 0,
    pageErrorCount: 0,
    consoleErrorCount: 0,
    fontRequestCount: 2,
    crossOriginFontRequestCount: 0,
    googleRuntimeRequestCount: 0,
    unclassifiedFontRequestCount: 0,
    fontRequestFailureCount: 0,
    initialItalicDemand: false,
    initialItalicFontRequestCount: 0,
    initialLatinExtDemand: false,
    initialLatinExtFontRequestCount: 0,
    initialCyrillicExtDemand: false,
    initialCyrillicExtFontRequestCount: 0,
    probeRequired: true,
    probe: {
      corpusLoaded: true,
      italicLoaded: true,
      italicNewRequestCount: 1,
      latinExtLoaded: true,
      latinExtNewRequestCount: 1,
      cyrillicExtLoaded: true,
      cyrillicExtNewRequestCount: 1,
      monoTextPresent: true,
      monoClassApplied: true,
      monoLoaded: true,
      monoComputedFontFamily: '"Geist Mono", ui-monospace',
      monoTokenValue: "var(--font-overgarden-mono)",
      monoSemanticStack: '"Geist Mono", ui-monospace',
      monoPlatformFontProof: "passed",
      semanticCategoryCount: 12,
      semanticFontMismatchCount: 0,
    },
    platformFontProof: "passed",
    ...overrides,
  };
}

function fallbackObservation(
  overrides: Partial<TypographyFallbackObservation> = {},
): TypographyFallbackObservation {
  return {
    visibleMeaningfulText: true,
    firstContentfulPaintMs: 120,
    visibleAfterDomContentLoadedMs: 80,
    targetFontUnavailableBeforeRelease: true,
    fallbackFontAvailableBeforeRelease: true,
    computedFallbackFamily: '"Google Sans Fallback", Arial, sans-serif',
    blockedFontRequestCount: 2,
    blockedFontResourceTimingCount: 2,
    configuredDelayMs: 600,
    blockedDurationMs: 610,
    fallbackDurationMs: 710,
    targetFontAvailableAfterRelease: true,
    convergedFontFamily: '"Google Sans", "Google Sans Fallback", Arial',
    fontsReady: true,
    fontWindowCls: 0.005,
    pageErrorCount: 0,
    consoleErrorCount: 0,
    ...overrides,
  };
}

function globalErrorObservation(
  overrides: Partial<TypographyGlobalErrorObservation> = {},
): TypographyGlobalErrorObservation {
  return {
    fixtureVisible: true,
    actualStatus: 500,
    documentLang: "uk",
    fontsReady: true,
    loadedFaceCount: 2,
    computedFontFamily: '"Google Sans", "Google Sans Fallback", Arial',
    horizontalOverflowPx: 0,
    offscreenControlCount: 0,
    clippedTextCount: 0,
    proportionalFontMismatchCount: 0,
    fontRequestCount: 2,
    crossOriginFontRequestCount: 0,
    googleRuntimeRequestCount: 0,
    unclassifiedFontRequestCount: 0,
    fontRequestFailureCount: 0,
    fontWarningCount: 0,
    pageErrorCount: 0,
    consoleErrorCount: 0,
    platformFontProof: "passed",
    ...overrides,
  };
}

describe("OVE-208 typography browser contract", () => {
  it("pins the required responsive matrix and representative corpus", () => {
    expect(TYPOGRAPHY_BROWSER_VIEWPORTS.map(({ width }) => width)).toEqual([
      320, 390, 768, 1440, 640,
    ]);
    expect(TYPOGRAPHY_BROWSER_VIEWPORTS.at(-1)).toMatchObject({
      id: "zoom-200-reflow",
      rootFontPercent: 200,
    });
    expect(TYPOGRAPHY_GLYPH_CORPUS.map(({ id }) => id)).toEqual([
      "uk",
      "bg",
      "ru",
      "latin",
    ]);
    expect(
      TYPOGRAPHY_GLYPH_CORPUS.find(({ id }) => id === "uk")?.text,
    ).toContain("Ґанок");
    expect(
      TYPOGRAPHY_GLYPH_CORPUS.find(({ id }) => id === "bg")?.text,
    ).toContain("Ѝѝ");
  });

  it("accepts only the exact Google Sans family or pinned optical family names", () => {
    expect(isExpectedGoogleSansFamily('"Google Sans", Arial')).toBe(true);
    expect(isExpectedGoogleSansFamily("Google Sans 17pt")).toBe(true);
    expect(isExpectedGoogleSansFamily("Google Sans 18pt")).toBe(true);
    expect(isExpectedGoogleSansFamily("Google Sans Fallback")).toBe(false);
    expect(isExpectedGoogleSansFamily("Google Sans Display")).toBe(false);
  });

  it("parses bounded route manifests and rejects duplicate or secret-bearing routes", () => {
    expect(
      parseTypographyBrowserRouteManifest({
        contractVersion: 1,
        routes: [
          {
            id: "raw-journal-gone",
            surface: "raw-lifecycle",
            locale: "ru",
            target: "/ru/journal/gone",
            expectedStatus: 410,
          },
        ],
      }).routes[0],
    ).toMatchObject({ id: "raw-journal-gone", expectedStatus: 410 });

    expect(() =>
      parseTypographyBrowserRouteManifest({
        contractVersion: 1,
        routes: [
          {
            id: "uk-home",
            surface: "product",
            locale: "uk",
            target: "/",
            expectedStatus: 200,
          },
          {
            id: "uk-home",
            surface: "product",
            locale: "uk",
            target: "/",
            expectedStatus: 200,
          },
        ],
      }),
    ).toThrow("duplicate");
    expect(() =>
      parseTypographyBrowserRouteManifest({
        contractVersion: 1,
        routes: [
          {
            id: "raw-journal-not-found",
            surface: "raw-lifecycle",
            locale: "uk",
            target: "/journal/missing?token=private",
            expectedStatus: 404,
          },
        ],
      }),
    ).toThrow("unsafe");
  });

  it("pins the family and complete font-path allowlist without CLI overrides", () => {
    expect(TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS).toHaveLength(14);
    expect(
      isTypographyBrowserFontPathAllowed(
        TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS[0],
      ),
    ).toBe(true);
    expect(
      isTypographyBrowserFontPathAllowed(
        "/fonts/google-sans/v69/rogue-same-origin.woff2",
      ),
    ).toBe(false);
    expect(() =>
      assertNoTypographyBrowserContractOverrides(["--family", "Inter"]),
    ).toThrow("cannot override");
    expect(() =>
      assertNoTypographyBrowserContractOverrides([
        "--asset-manifest=rogue.json",
      ]),
    ).toThrow("cannot override");
  });

  it("requires the exact same-origin clean URL for every allowlisted font", () => {
    const allowedPath = TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS[0];
    const origin = "https://over.garden";

    expect(
      isTypographyBrowserFontUrlAllowed(`${origin}${allowedPath}`, origin),
    ).toBe(true);
    expect(
      isTypographyBrowserFontUrlAllowed(
        `https://font-probe.invalid${allowedPath}`,
        origin,
      ),
    ).toBe(false);
    expect(
      isTypographyBrowserFontUrlAllowed(
        `${origin}${allowedPath}?cache-bust=1`,
        origin,
      ),
    ).toBe(false);
    expect(
      isTypographyBrowserFontUrlAllowed(
        `${origin}${allowedPath}#font-fragment`,
        origin,
      ),
    ).toBe(false);
    expect(
      isTypographyBrowserFontUrlAllowed(`${origin}${allowedPath}?`, origin),
    ).toBe(false);
    expect(
      isTypographyBrowserFontUrlAllowed(`${origin}${allowedPath}#`, origin),
    ).toBe(false);
  });

  it("counts an exact-path external request introduced by a lazy probe", () => {
    const allowedPath = TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS[0];
    const origin = "https://over.garden";
    const initialRequests = [`${origin}${allowedPath}`];
    const lazyExternalRequest = `https://lazy-font.invalid${allowedPath}`;

    expect(
      inspectTypographyBrowserFontUrls(
        [...initialRequests, lazyExternalRequest],
        origin,
      ),
    ).toEqual({
      crossOriginFontRequestCount: 1,
      unclassifiedFontRequestCount: 1,
    });
  });

  it("recognizes quoted families and bounded Google Sans platform variants", () => {
    expect(
      computedFontFamilies(
        '"Google Sans", "Google Sans Fallback", Arial, sans-serif',
      ),
    ).toEqual(["Google Sans", "Google Sans Fallback", "Arial", "sans-serif"]);
    expect(firstComputedFontFamily('"Google Sans", system-ui')).toBe(
      "Google Sans",
    );
    expect(isExpectedGoogleSansFamily("Google Sans")).toBe(true);
    expect(isExpectedGoogleSansFamily("Google Sans 18pt")).toBe(true);
    expect(isExpectedGoogleSansFamily("Arial, sans-serif")).toBe(false);
  });

  it("parses CSS unicode ranges and detects only demanded extended subsets", () => {
    expect(parseUnicodeRange("U+0100-024F, U+1E??")).toEqual([
      { start: 0x0100, end: 0x024f },
      { start: 0x1e00, end: 0x1eff },
    ]);
    expect(unicodeRangeCoversText("U+0100-024F", "Červená")).toBe(true);
    expect(unicodeRangeCoversText("U+0100-024F", "OverGarden")).toBe(false);
    expect(textRequiresLatinExtended("Červená Žluté")).toBe(true);
    expect(textRequiresLatinExtended("OverGarden")).toBe(false);
    expect(textRequiresCyrillicExtended("₴ Ѣѣ")).toBe(true);
    expect(textRequiresCyrillicExtended("Ґанок ґрунт")).toBe(false);
    expect(textRequiresCyrillicExtended("Българска градина")).toBe(false);
  });

  it("passes complete evidence and reports stable bounded failure codes", () => {
    expect(evaluateTypographyBrowserObservation(observation())).toEqual([]);
    expect(
      evaluateTypographyBrowserObservation(
        observation({
          actualStatus: 404,
          computedFontFamily: "Arial",
          crossOriginFontRequestCount: 1,
          unclassifiedFontRequestCount: 1,
          initialItalicFontRequestCount: 1,
          probe: null,
          platformFontProof: "failed",
        }),
      ),
    ).toEqual([
      "http-status",
      "computed-family",
      "cross-origin-font",
      "unclassified-font-request",
      "eager-italic",
      "probe-missing",
      "platform-font",
    ]);
  });

  it("allows the bounded CDP proof to be unavailable outside Chromium", () => {
    const baseline = observation();
    expect(
      evaluateTypographyBrowserObservation(
        observation({
          platformFontProof: "not-applicable",
          probe: baseline.probe
            ? {
                ...baseline.probe,
                monoPlatformFontProof: "not-applicable",
              }
            : null,
        }),
      ),
    ).toEqual([]);
  });

  it("requires semantic mono token wiring, text, loading, and platform proof", () => {
    const baseline = observation();
    expect(
      evaluateTypographyBrowserObservation(
        observation({
          probe: baseline.probe
            ? {
                ...baseline.probe,
                monoTextPresent: false,
                monoClassApplied: false,
                monoLoaded: false,
                monoComputedFontFamily: "ui-monospace",
                monoTokenValue: "ui-monospace",
                monoSemanticStack: "ui-monospace",
                monoPlatformFontProof: "failed",
              }
            : null,
        }),
      ),
    ).toEqual([
      "mono-text-missing",
      "mono-class-missing",
      "mono-not-loaded",
      "mono-token",
      "mono-semantic-variable",
      "mono-computed-family",
      "mono-platform-font",
    ]);
  });

  it("gates fallback paint, bounded delay, convergence, and font-window CLS", () => {
    expect(
      evaluateTypographyFallbackObservation(fallbackObservation()),
    ).toEqual([]);
    expect(
      evaluateTypographyFallbackObservation(
        fallbackObservation({
          visibleMeaningfulText: true,
          firstContentfulPaintMs: 474,
          visibleAfterDomContentLoadedMs: 1_499,
          // A completed headless WebKit browser-timeline poll can be
          // deferred after the deliberate hold. It is still bounded and all
          // user-visible fallback evidence above remains required.
          blockedDurationMs: 1_849,
          fallbackDurationMs: 3_347,
        }),
      ),
    ).toEqual([]);
    expect(
      evaluateTypographyFallbackObservation(
        fallbackObservation({
          visibleMeaningfulText: false,
          firstContentfulPaintMs: 1_001,
          visibleAfterDomContentLoadedMs: 1_501,
          targetFontUnavailableBeforeRelease: false,
          fallbackFontAvailableBeforeRelease: false,
          computedFallbackFamily: "Arial",
          fallbackDurationMs: 4_500,
          fontWindowCls: 0.021,
        }),
      ),
    ).toEqual([
      "fallback-text-hidden",
      "fallback-fcp-after-1s",
      "fallback-not-visible-within-1s",
      "target-font-not-blocked",
      "fallback-font-unavailable",
      "fallback-family",
      "fallback-duration",
      "fallback-cls",
    ]);
  });

  it("fails closed on missing or out-of-window browser timeline evidence", () => {
    expect(
      evaluateTypographyFallbackObservation(
        fallbackObservation({
          visibleAfterDomContentLoadedMs: -1,
          blockedFontResourceTimingCount: 0,
          blockedDurationMs: 0,
        }),
      ),
    ).toEqual([
      "fallback-not-visible-within-1s",
      "fallback-no-font-resource-timing",
      "fallback-delay-window",
    ]);

    expect(
      evaluateTypographyFallbackObservation(
        fallbackObservation({
          visibleAfterDomContentLoadedMs: 1_501,
          blockedDurationMs: 1_851,
        }),
      ),
    ).toEqual([
      "fallback-not-visible-within-1s",
      "fallback-delay-window",
    ]);
  });

  it("gates the guarded local global-error typography surface", () => {
    expect(
      evaluateTypographyGlobalErrorObservation(globalErrorObservation()),
    ).toEqual([]);
    expect(
      evaluateTypographyGlobalErrorObservation(
        globalErrorObservation({
          fixtureVisible: false,
          actualStatus: 200,
          loadedFaceCount: 0,
          computedFontFamily: "Arial",
          horizontalOverflowPx: 2,
          fontRequestCount: 0,
          crossOriginFontRequestCount: 1,
          unclassifiedFontRequestCount: 1,
          fontRequestFailureCount: 1,
          fontWarningCount: 1,
          pageErrorCount: 1,
          consoleErrorCount: 1,
          platformFontProof: "failed",
        }),
      ),
    ).toEqual([
      "global-error-fixture",
      "global-error-status",
      "global-error-font-face-not-loaded",
      "global-error-computed-family",
      "global-error-horizontal-overflow",
      "global-error-font-request-count",
      "global-error-cross-origin-font",
      "global-error-unclassified-font-request",
      "global-error-font-request-failed",
      "global-error-font-warning",
      "global-error-page-error",
      "global-error-console-error",
      "global-error-platform-font",
    ]);
  });
});

describe("shouldRetryFallbackCase", () => {
  it("never repeats a case that produced no failures", () => {
    expect(shouldRetryFallbackCase([])).toBe(false);
  });

  it("repeats a case whose only failure is a scheduler measurement", () => {
    for (const code of SCHEDULER_SENSITIVE_FALLBACK_FAILURE_CODES) {
      expect(shouldRetryFallbackCase([code])).toBe(true);
    }
  });

  it("repeats a case when every failure is scheduler-sensitive", () => {
    expect(
      shouldRetryFallbackCase([
        "fallback-fcp-after-1s",
        "fallback-not-visible-within-1s",
        "fallback-duration",
      ]),
    ).toBe(true);
  });

  it("decides a structural failure on its first attempt", () => {
    const structural = [
      "fallback-text-hidden",
      "fallback-no-fcp",
      "target-font-not-blocked",
      "fallback-font-unavailable",
      "fallback-family",
      "fallback-no-blocked-font-request",
      "fallback-no-font-resource-timing",
      "target-font-not-loaded",
      "fallback-no-convergence",
      "fallback-fonts-not-ready",
      "fallback-cls",
      "fallback-page-error",
      "fallback-console-error",
    ];
    for (const code of structural) {
      expect(shouldRetryFallbackCase([code])).toBe(false);
    }
  });

  it("does not repeat a mixed case, so one structural failure stays final", () => {
    expect(
      shouldRetryFallbackCase(["fallback-fcp-after-1s", "fallback-family"]),
    ).toBe(false);
  });

  it("treats an unrecognised code as structural", () => {
    expect(shouldRetryFallbackCase(["fallback-some-future-code"])).toBe(false);
  });

  it("names only codes the evaluator can emit from a timing measurement", () => {
    const emitted = new Set<string>([
      ...evaluateTypographyFallbackObservation(
        fallbackObservation({ firstContentfulPaintMs: 1_400 }),
      ),
      ...evaluateTypographyFallbackObservation(
        fallbackObservation({ visibleAfterDomContentLoadedMs: 1_800 }),
      ),
      ...evaluateTypographyFallbackObservation(
        fallbackObservation({ blockedDurationMs: 2_400 }),
      ),
      ...evaluateTypographyFallbackObservation(
        fallbackObservation({ fallbackDurationMs: 4_200 }),
      ),
    ]);
    for (const code of SCHEDULER_SENSITIVE_FALLBACK_FAILURE_CODES) {
      expect(emitted).toContain(code);
    }
  });

  it("leaves a structural regression failing even under a slow runner", () => {
    const failures = evaluateTypographyFallbackObservation(
      fallbackObservation({
        firstContentfulPaintMs: 1_400,
        computedFallbackFamily: "Arial, sans-serif",
      }),
    );
    expect(failures).toContain("fallback-fcp-after-1s");
    expect(failures).toContain("fallback-family");
    expect(shouldRetryFallbackCase(failures)).toBe(false);
  });

  it("allows at least one repeat and stays bounded", () => {
    expect(FALLBACK_CASE_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(FALLBACK_CASE_MAX_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});

describe("shouldAttemptFallbackCaseAgain", () => {
  const clock = ["fallback-fcp-after-1s"];
  const structural = ["fallback-family"];

  it("takes a first attempt before anything has been measured", () => {
    expect(shouldAttemptFallbackCaseAgain([])).toBe(true);
  });

  it("stops as soon as an attempt passes", () => {
    expect(shouldAttemptFallbackCaseAgain([[]])).toBe(false);
  });

  it("stops at the declared bound even while failures stay scheduler-sensitive", () => {
    const attempts: string[][] = [];
    let taken = 0;
    while (shouldAttemptFallbackCaseAgain(attempts)) {
      taken += 1;
      attempts.push([...clock]);
      expect(taken).toBeLessThanOrEqual(FALLBACK_CASE_MAX_ATTEMPTS);
    }
    expect(taken).toBe(FALLBACK_CASE_MAX_ATTEMPTS);
    expect(attempts).toHaveLength(FALLBACK_CASE_MAX_ATTEMPTS);
  });

  it("stops after one attempt when that attempt failed structurally", () => {
    const attempts: string[][] = [];
    let taken = 0;
    while (shouldAttemptFallbackCaseAgain(attempts)) {
      taken += 1;
      attempts.push([...structural]);
    }
    expect(taken).toBe(1);
  });

  it("stops once a repeat of a scheduler-sensitive failure comes back clean", () => {
    const attempts: string[][] = [];
    const scripted = [clock, []];
    let taken = 0;
    while (shouldAttemptFallbackCaseAgain(attempts)) {
      attempts.push([...(scripted[taken] ?? [])]);
      taken += 1;
    }
    expect(taken).toBe(2);
    expect(attempts.at(-1)).toEqual([]);
  });

  it("decides from the latest attempt, not from an earlier one", () => {
    expect(shouldAttemptFallbackCaseAgain([clock, structural])).toBe(false);
    expect(shouldAttemptFallbackCaseAgain([structural, clock])).toBe(true);
  });
});
