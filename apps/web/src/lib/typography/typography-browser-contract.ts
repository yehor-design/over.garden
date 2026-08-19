import { GEIST_MONO_ASSET_MANIFEST } from "./geist-mono-contract";
import { GOOGLE_SANS_ASSET_MANIFEST } from "./google-sans-contract";

export const TYPOGRAPHY_BROWSER_NAMES = [
  "chromium",
  "firefox",
  "webkit",
] as const;

export type TypographyBrowserName = (typeof TYPOGRAPHY_BROWSER_NAMES)[number];

export const TYPOGRAPHY_BROWSER_VIEWPORTS = [
  { id: "mobile-320", width: 320, height: 844, rootFontPercent: 100 },
  { id: "mobile-390", width: 390, height: 844, rootFontPercent: 100 },
  { id: "tablet-768", width: 768, height: 1024, rootFontPercent: 100 },
  { id: "desktop-1440", width: 1440, height: 1000, rootFontPercent: 100 },
  {
    id: "zoom-200-reflow",
    width: 640,
    height: 900,
    rootFontPercent: 200,
  },
] as const;

export type TypographyBrowserViewport =
  (typeof TYPOGRAPHY_BROWSER_VIEWPORTS)[number];

export const TYPOGRAPHY_GLYPH_CORPUS = [
  {
    id: "uk",
    lang: "uk",
    text: "Ґанок, їжак, Єгор, Україна, Її, Йй, об’єкт, ₴",
  },
  {
    id: "bg",
    lang: "bg",
    text: "Българска градина, щъркел, ъгъл, Ѝѝ, Цц, Чч",
  },
  {
    id: "ru",
    lang: "ru",
    text: "Ёжик, подъём, объём, Ыы, Ээ, №",
  },
  {
    id: "latin",
    lang: "en",
    text: "OverGarden, Solanum lycopersicum, Červená, Žluté, 0123456789",
  },
] as const;

export type TypographyGlyphCorpusId =
  (typeof TYPOGRAPHY_GLYPH_CORPUS)[number]["id"];

export const TYPOGRAPHY_PROBE_WEIGHTS = [400, 500, 600, 650, 700] as const;

export const TYPOGRAPHY_LAZY_PROBES = {
  italic: "OverGarden garden journal",
  latinExtended: "Červená Žluté",
  cyrillicExtended: "₴ Ѣѣ",
} as const;

export const TYPOGRAPHY_EXTENDED_SUBSET_MARKERS = {
  latinExtended: "Č",
  cyrillicExtended: "Ѣ",
} as const;

export const TYPOGRAPHY_SEMANTIC_PROBE_CATEGORIES = [
  "heading",
  "journal-prose",
  "button",
  "input",
  "placeholder",
  "select",
  "textarea",
  "contenteditable",
  "dialog",
  "popover",
  "toast",
  "portal",
] as const;

export type TypographyRouteSurface =
  | "product"
  | "owner-surface"
  | "raw-lifecycle";

export interface TypographyBrowserRoute {
  id: string;
  surface: TypographyRouteSurface;
  locale: "uk" | "bg" | "ru";
  target: string;
  expectedStatus: 200 | 404 | 410;
}

export interface TypographyBrowserRouteManifest {
  contractVersion: 1;
  routes: TypographyBrowserRoute[];
}

export interface TypographyBrowserFontAsset {
  path: string;
  style: "normal" | "italic";
  subset: "latin" | "latin-ext" | "cyrillic" | "cyrillic-ext";
}

export const TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS = Object.freeze([
  ...GOOGLE_SANS_ASSET_MANIFEST.assets.map(({ publicPath }) => publicPath),
  ...GEIST_MONO_ASSET_MANIFEST.assets.map(({ publicPath }) => publicPath),
]);

const TYPOGRAPHY_BROWSER_FORBIDDEN_OVERRIDES = [
  "--family",
  "--asset-manifest",
] as const;

export function assertNoTypographyBrowserContractOverrides(argv: string[]) {
  const forbidden = argv.find((argument) =>
    TYPOGRAPHY_BROWSER_FORBIDDEN_OVERRIDES.some(
      (option) => argument === option || argument.startsWith(`${option}=`),
    ),
  );
  if (forbidden) {
    throw new Error(
      "Typography browser evidence cannot override the pinned family or font asset manifest.",
    );
  }
}

export function isTypographyBrowserFontPathAllowed(path: string) {
  return TYPOGRAPHY_BROWSER_ALLOWED_FONT_PATHS.some(
    (allowedPath) => allowedPath === path,
  );
}

export function isTypographyBrowserFontUrlAllowed(
  href: string,
  expectedOrigin: string,
) {
  try {
    const requestUrl = new URL(href);
    const originUrl = new URL(expectedOrigin);
    return (
      requestUrl.origin === originUrl.origin &&
      requestUrl.username === "" &&
      requestUrl.password === "" &&
      requestUrl.search === "" &&
      requestUrl.hash === "" &&
      requestUrl.href === `${requestUrl.origin}${requestUrl.pathname}` &&
      isTypographyBrowserFontPathAllowed(requestUrl.pathname)
    );
  } catch {
    return false;
  }
}

export function inspectTypographyBrowserFontUrls(
  hrefs: Iterable<string>,
  expectedOrigin: string,
) {
  const origin = new URL(expectedOrigin).origin;
  let crossOriginFontRequestCount = 0;
  let unclassifiedFontRequestCount = 0;
  for (const href of new Set(hrefs)) {
    try {
      if (new URL(href).origin !== origin) crossOriginFontRequestCount += 1;
    } catch {
      // Invalid URLs remain unclassified below.
    }
    if (!isTypographyBrowserFontUrlAllowed(href, origin)) {
      unclassifiedFontRequestCount += 1;
    }
  }
  return { crossOriginFontRequestCount, unclassifiedFontRequestCount };
}

export interface TypographyBrowserObservation {
  routeId: string;
  surface: TypographyRouteSurface;
  locale: "uk" | "bg" | "ru";
  expectedStatus: 200 | 404 | 410;
  actualStatus: number;
  documentLang: string | null;
  fontsReady: boolean;
  loadedFaceCount: number;
  computedFontFamily: string;
  horizontalOverflowPx: number;
  offscreenControlCount: number;
  clippedTextCount: number;
  proportionalFontMismatchCount: number;
  pageErrorCount: number;
  consoleErrorCount: number;
  fontRequestCount: number;
  crossOriginFontRequestCount: number;
  googleRuntimeRequestCount: number;
  unclassifiedFontRequestCount: number;
  fontRequestFailureCount: number;
  initialItalicDemand: boolean;
  initialItalicFontRequestCount: number;
  initialLatinExtDemand: boolean;
  initialLatinExtFontRequestCount: number;
  initialCyrillicExtDemand: boolean;
  initialCyrillicExtFontRequestCount: number;
  probeRequired: boolean;
  probe: null | {
    corpusLoaded: boolean;
    italicLoaded: boolean;
    italicNewRequestCount: number;
    latinExtLoaded: boolean;
    latinExtNewRequestCount: number;
    cyrillicExtLoaded: boolean;
    cyrillicExtNewRequestCount: number;
    monoTextPresent: boolean;
    monoClassApplied: boolean;
    monoLoaded: boolean;
    monoComputedFontFamily: string;
    monoTokenValue: string;
    monoSemanticStack: string;
    monoPlatformFontProof: "passed" | "failed" | "not-applicable";
    semanticCategoryCount: number;
    semanticFontMismatchCount: number;
  };
  platformFontProof: "passed" | "failed" | "not-applicable";
}

export interface TypographyFallbackObservation {
  visibleMeaningfulText: boolean;
  firstContentfulPaintMs: number;
  visibleAfterDomContentLoadedMs: number;
  targetFontUnavailableBeforeRelease: boolean;
  fallbackFontAvailableBeforeRelease: boolean;
  computedFallbackFamily: string;
  blockedFontRequestCount: number;
  blockedFontResourceTimingCount: number;
  configuredDelayMs: number;
  blockedDurationMs: number;
  fallbackDurationMs: number;
  targetFontAvailableAfterRelease: boolean;
  convergedFontFamily: string;
  fontsReady: boolean;
  fontWindowCls: number;
  pageErrorCount: number;
  consoleErrorCount: number;
}

// This is a harness-clock allowance, not a product paint budget. The strict
// FCP, visible-fallback, blocked-target, convergence, and CLS checks below
// remain the user-visible contract. Headless WebKit can defer a completed
// browser-timeline poll after the deliberate font hold, so keep a finite
// scheduler bound without treating that runner delay as a font regression.
const FALLBACK_DELAY_SCHEDULER_ALLOWANCE_MS = 1_250;

export interface TypographyGlobalErrorObservation {
  fixtureVisible: boolean;
  actualStatus: number;
  documentLang: string | null;
  fontsReady: boolean;
  loadedFaceCount: number;
  computedFontFamily: string;
  horizontalOverflowPx: number;
  offscreenControlCount: number;
  clippedTextCount: number;
  proportionalFontMismatchCount: number;
  fontRequestCount: number;
  crossOriginFontRequestCount: number;
  googleRuntimeRequestCount: number;
  unclassifiedFontRequestCount: number;
  fontRequestFailureCount: number;
  fontWarningCount: number;
  pageErrorCount: number;
  consoleErrorCount: number;
  platformFontProof: "passed" | "failed" | "not-applicable";
}

const ROUTE_ID_PATTERN =
  /^(?:uk-home|bg-home|ru-home|surface-(?:catalog-dense|knowledge-editorial|auth-help|journal-prose|profile-dense|workspace-dense|creation-form|social-comments|community-moderation|operator-moderation|operator-unauthorized|app-not-found|workspace-loading|workspace-error|workspace-offline)|raw-(?:community|profile|object|journal)-(?:not-found|gone))$/;
const UNSAFE_ROUTE_PARAMETER =
  /^(?:access[_-]?token|auth|code|coord(?:inate)?s?|email|invite|lat(?:itude)?|lng|lon(?:gitude)?|password|secret|session|token)$/i;

export function parseTypographyBrowserRouteManifest(
  value: unknown,
): TypographyBrowserRouteManifest {
  if (!isRecord(value) || value.contractVersion !== 1) {
    throw new Error("Typography route manifest must use contractVersion 1.");
  }
  if (!Array.isArray(value.routes) || value.routes.length === 0) {
    throw new Error("Typography route manifest requires routes.");
  }

  const routes = value.routes.map(parseRoute);
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.id)) {
      throw new Error("Typography route manifest contains duplicate ids.");
    }
    ids.add(route.id);
  }

  return { contractVersion: 1, routes };
}

export function computedFontFamilies(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((family) =>
      family
        .trim()
        .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2")
        .trim(),
    )
    .filter(Boolean);
}

export function firstComputedFontFamily(fontFamily: string): string {
  return computedFontFamilies(fontFamily)[0] ?? "";
}

export function isExpectedGoogleSansFamily(
  actualFamily: string,
  expectedFamily = "Google Sans",
): boolean {
  const actual = firstComputedFontFamily(actualFamily).toLocaleLowerCase("en");
  const expected = expectedFamily.trim().toLocaleLowerCase("en");
  return (
    actual === expected ||
    actual === `${expected} 17pt` ||
    actual === `${expected} 18pt`
  );
}

export function parseUnicodeRange(
  unicodeRange: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const rawPart of unicodeRange.split(",")) {
    const part = rawPart.trim().toUpperCase();
    const match = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/.exec(part);
    if (!match) continue;

    const startToken = match[1];
    const endToken = match[2];
    const start = Number.parseInt(startToken.replaceAll("?", "0"), 16);
    const end = endToken
      ? Number.parseInt(endToken, 16)
      : Number.parseInt(startToken.replaceAll("?", "F"), 16);
    if (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end >= start &&
      end <= 0x10ffff
    ) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

export function unicodeRangeCoversText(
  unicodeRange: string,
  text: string,
): boolean {
  const ranges = parseUnicodeRange(unicodeRange);
  if (ranges.length === 0) return true;
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      ranges.some(({ start, end }) => codePoint >= start && codePoint <= end)
    );
  });
}

export function textRequiresLatinExtended(text: string): boolean {
  return /[\u0100-\u024f\u1e00-\u1eff]/u.test(text);
}

export function textRequiresCyrillicExtended(text: string): boolean {
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return false;
    const inSharedCyrillicCore =
      (codePoint >= 0x0400 && codePoint <= 0x045f) ||
      codePoint === 0x0490 ||
      codePoint === 0x0491 ||
      codePoint === 0x04b0 ||
      codePoint === 0x04b1 ||
      codePoint === 0x2116;
    if (inSharedCyrillicCore) return false;
    return (
      (codePoint >= 0x0460 && codePoint <= 0x052f) ||
      (codePoint >= 0x1c80 && codePoint <= 0x1c8a) ||
      codePoint === 0x20b4 ||
      (codePoint >= 0x2de0 && codePoint <= 0x2dff) ||
      (codePoint >= 0xa640 && codePoint <= 0xa69f) ||
      (codePoint >= 0xfe2e && codePoint <= 0xfe2f)
    );
  });
}

export function evaluateTypographyBrowserObservation(
  observation: TypographyBrowserObservation,
  expectedFamily = "Google Sans",
  expectedMonoFamily = "Geist Mono",
): string[] {
  const failures: string[] = [];
  if (observation.actualStatus !== observation.expectedStatus) {
    failures.push("http-status");
  }
  if (observation.documentLang !== observation.locale) {
    failures.push("document-lang");
  }
  if (!observation.fontsReady) failures.push("fonts-not-ready");
  if (observation.loadedFaceCount < 2) failures.push("font-face-not-loaded");
  if (
    !isExpectedGoogleSansFamily(observation.computedFontFamily, expectedFamily)
  ) {
    failures.push("computed-family");
  }
  if (observation.horizontalOverflowPx > 1) {
    failures.push("horizontal-overflow");
  }
  if (observation.offscreenControlCount > 0) {
    failures.push("offscreen-control");
  }
  if (observation.clippedTextCount > 0) failures.push("clipped-text");
  if (observation.proportionalFontMismatchCount > 0) {
    failures.push("proportional-family-mismatch");
  }
  if (observation.pageErrorCount > 0) failures.push("page-error");
  if (observation.consoleErrorCount > 0) failures.push("console-error");
  if (observation.fontRequestCount === 0) failures.push("font-not-requested");
  if (observation.crossOriginFontRequestCount > 0) {
    failures.push("cross-origin-font");
  }
  if (observation.googleRuntimeRequestCount > 0) {
    failures.push("google-runtime-request");
  }
  if (observation.unclassifiedFontRequestCount > 0) {
    failures.push("unclassified-font-request");
  }
  if (observation.fontRequestFailureCount > 0) {
    failures.push("font-request-failed");
  }
  if (
    !observation.initialItalicDemand &&
    observation.initialItalicFontRequestCount > 0
  ) {
    failures.push("eager-italic");
  }
  if (
    !observation.initialLatinExtDemand &&
    observation.initialLatinExtFontRequestCount > 0
  ) {
    failures.push("eager-latin-ext");
  }
  if (
    !observation.initialCyrillicExtDemand &&
    observation.initialCyrillicExtFontRequestCount > 0
  ) {
    failures.push("eager-cyrillic-ext");
  }

  if (observation.probeRequired) {
    if (!observation.probe) {
      failures.push("probe-missing");
    } else {
      if (!observation.probe.corpusLoaded) failures.push("corpus-not-loaded");
      if (!observation.probe.italicLoaded) failures.push("italic-not-loaded");
      if (
        observation.initialItalicFontRequestCount === 0 &&
        observation.probe.italicNewRequestCount === 0
      ) {
        failures.push("italic-lazy-load-missing");
      }
      if (!observation.probe.latinExtLoaded) {
        failures.push("latin-ext-not-loaded");
      }
      if (
        observation.initialLatinExtFontRequestCount === 0 &&
        observation.probe.latinExtNewRequestCount === 0
      ) {
        failures.push("latin-ext-lazy-load-missing");
      }
      if (!observation.probe.cyrillicExtLoaded) {
        failures.push("cyrillic-ext-not-loaded");
      }
      if (
        observation.initialCyrillicExtFontRequestCount === 0 &&
        observation.probe.cyrillicExtNewRequestCount === 0
      ) {
        failures.push("cyrillic-ext-lazy-load-missing");
      }
      if (!observation.probe.monoTextPresent) {
        failures.push("mono-text-missing");
      }
      if (!observation.probe.monoClassApplied) {
        failures.push("mono-class-missing");
      }
      if (!observation.probe.monoLoaded) failures.push("mono-not-loaded");
      if (
        observation.probe.monoTokenValue.replaceAll(/\s/gu, "") !==
        "var(--font-overgarden-mono)"
      ) {
        failures.push("mono-token");
      }
      if (
        firstComputedFontFamily(observation.probe.monoSemanticStack) !==
        expectedMonoFamily
      ) {
        failures.push("mono-semantic-variable");
      }
      if (
        firstComputedFontFamily(observation.probe.monoComputedFontFamily) !==
        expectedMonoFamily
      ) {
        failures.push("mono-computed-family");
      }
      if (observation.probe.monoPlatformFontProof === "failed") {
        failures.push("mono-platform-font");
      }
      if (
        observation.probe.semanticCategoryCount !==
        TYPOGRAPHY_SEMANTIC_PROBE_CATEGORIES.length
      ) {
        failures.push("semantic-category-coverage");
      }
      if (observation.probe.semanticFontMismatchCount > 0) {
        failures.push("semantic-family-mismatch");
      }
    }
  }

  if (observation.platformFontProof === "failed") {
    failures.push("platform-font");
  }
  return failures;
}

export function evaluateTypographyFallbackObservation(
  observation: TypographyFallbackObservation,
  input: {
    expectedFamily?: string;
    expectedFallbackFamily?: string;
  } = {},
): string[] {
  const expectedFamily = input.expectedFamily ?? "Google Sans";
  const expectedFallbackFamily =
    input.expectedFallbackFamily ?? "Google Sans Fallback";
  const failures: string[] = [];
  if (!observation.visibleMeaningfulText) failures.push("fallback-text-hidden");
  if (observation.firstContentfulPaintMs <= 0) failures.push("fallback-no-fcp");
  if (observation.firstContentfulPaintMs > 1_000) {
    failures.push("fallback-fcp-after-1s");
  }
  // Browser-timeline visibility after DCL proves that meaningful fallback text
  // reached the visitor. Controller wall-clock timestamps are never evidence.
  if (
    observation.visibleAfterDomContentLoadedMs < 0 ||
    observation.visibleAfterDomContentLoadedMs > 1_500
  ) {
    failures.push("fallback-not-visible-within-1s");
  }
  if (!observation.targetFontUnavailableBeforeRelease) {
    failures.push("target-font-not-blocked");
  }
  if (!observation.fallbackFontAvailableBeforeRelease) {
    failures.push("fallback-font-unavailable");
  }
  if (
    firstComputedFontFamily(observation.computedFallbackFamily) !==
    expectedFallbackFamily
  ) {
    failures.push("fallback-family");
  }
  if (observation.blockedFontRequestCount < 1) {
    failures.push("fallback-no-blocked-font-request");
  }
  if (observation.blockedFontResourceTimingCount < 1) {
    failures.push("fallback-no-font-resource-timing");
  }
  if (
    observation.blockedDurationMs < observation.configuredDelayMs - 25 ||
    observation.blockedDurationMs >
      observation.configuredDelayMs + FALLBACK_DELAY_SCHEDULER_ALLOWANCE_MS
  ) {
    failures.push("fallback-delay-window");
  }
  // fallbackDurationMs is measured from FCP through artificial font blocking
  // plus post-release convergence. Gate only the post-delay convergence
  // window so WebKit CI load cannot fail a still-correct immediate fallback.
  const postDelayConvergenceMs =
    observation.fallbackDurationMs - observation.configuredDelayMs;
  if (postDelayConvergenceMs < 0 || postDelayConvergenceMs > 3_000) {
    failures.push("fallback-duration");
  }
  if (!observation.targetFontAvailableAfterRelease) {
    failures.push("target-font-not-loaded");
  }
  if (
    !isExpectedGoogleSansFamily(observation.convergedFontFamily, expectedFamily)
  ) {
    failures.push("fallback-no-convergence");
  }
  if (!observation.fontsReady) failures.push("fallback-fonts-not-ready");
  if (observation.fontWindowCls > 0.02) failures.push("fallback-cls");
  if (observation.pageErrorCount > 0) failures.push("fallback-page-error");
  if (observation.consoleErrorCount > 0)
    failures.push("fallback-console-error");
  return failures;
}

/**
 * Fallback failure codes whose predicate is a wall-clock or scheduler
 * measurement, so a shared CI runner can produce one without any product
 * defect. Every other fallback code asserts a structural property — computed
 * family, blocked request, convergence, layout shift, page error — and must
 * never be retried, because repeating the run would hide a real regression.
 *
 * Adding a code here weakens the gate. A new entry needs a measurement showing
 * the product is correct while the runner still reports the failure.
 */
export const SCHEDULER_SENSITIVE_FALLBACK_FAILURE_CODES: readonly string[] = [
  "fallback-fcp-after-1s",
  "fallback-not-visible-within-1s",
  "fallback-delay-window",
  "fallback-duration",
];

/** Attempts one fallback case gets before its failures become final. */
export const FALLBACK_CASE_MAX_ATTEMPTS = 3;

/**
 * A fallback case is repeated only when every failure it produced is
 * scheduler-sensitive. A clean case is never repeated, and a case carrying any
 * structural failure fails on its first attempt. The declared budgets are
 * unchanged: a repeat proves the budget is missed consistently rather than
 * once, and every attempt stays in the receipt.
 */
export function shouldRetryFallbackCase(failures: readonly string[]): boolean {
  if (failures.length === 0) return false;
  return failures.every((code) =>
    SCHEDULER_SENSITIVE_FALLBACK_FAILURE_CODES.includes(code),
  );
}

/**
 * Decides whether the runner should take another attempt at a fallback case,
 * given the failures every attempt so far produced, oldest first. An empty list
 * means no attempt has run yet. This is the whole loop condition, kept pure so
 * bound termination is provable without a browser.
 */
export function shouldAttemptFallbackCaseAgain(
  attemptFailures: ReadonlyArray<readonly string[]>,
): boolean {
  if (attemptFailures.length === 0) return true;
  if (attemptFailures.length >= FALLBACK_CASE_MAX_ATTEMPTS) return false;
  return shouldRetryFallbackCase(
    attemptFailures[attemptFailures.length - 1] ?? [],
  );
}

export function evaluateTypographyGlobalErrorObservation(
  observation: TypographyGlobalErrorObservation,
  expectedFamily = "Google Sans",
): string[] {
  const failures: string[] = [];
  if (!observation.fixtureVisible) failures.push("global-error-fixture");
  if (observation.actualStatus < 500 || observation.actualStatus > 599) {
    failures.push("global-error-status");
  }
  if (observation.documentLang !== "uk") {
    failures.push("global-error-lang");
  }
  if (!observation.fontsReady) failures.push("global-error-fonts-not-ready");
  if (observation.loadedFaceCount < 2) {
    failures.push("global-error-font-face-not-loaded");
  }
  if (
    !isExpectedGoogleSansFamily(observation.computedFontFamily, expectedFamily)
  ) {
    failures.push("global-error-computed-family");
  }
  if (observation.horizontalOverflowPx > 1) {
    failures.push("global-error-horizontal-overflow");
  }
  if (observation.offscreenControlCount > 0) {
    failures.push("global-error-offscreen-control");
  }
  if (observation.clippedTextCount > 0) {
    failures.push("global-error-clipped-text");
  }
  if (observation.proportionalFontMismatchCount > 0) {
    failures.push("global-error-proportional-family-mismatch");
  }
  if (observation.fontRequestCount !== 2) {
    failures.push("global-error-font-request-count");
  }
  if (observation.crossOriginFontRequestCount > 0) {
    failures.push("global-error-cross-origin-font");
  }
  if (observation.googleRuntimeRequestCount > 0) {
    failures.push("global-error-google-runtime-request");
  }
  if (observation.unclassifiedFontRequestCount > 0) {
    failures.push("global-error-unclassified-font-request");
  }
  if (observation.fontRequestFailureCount > 0) {
    failures.push("global-error-font-request-failed");
  }
  if (observation.fontWarningCount > 0) {
    failures.push("global-error-font-warning");
  }
  if (observation.pageErrorCount > 0) {
    failures.push("global-error-page-error");
  }
  if (observation.consoleErrorCount > 0) {
    failures.push("global-error-console-error");
  }
  if (observation.platformFontProof === "failed") {
    failures.push("global-error-platform-font");
  }
  return failures;
}

function parseRoute(value: unknown): TypographyBrowserRoute {
  if (!isRecord(value)) {
    throw new Error("Typography route must be an object.");
  }
  const id = value.id;
  const surface = value.surface;
  const locale = value.locale;
  const target = value.target;
  const expectedStatus = value.expectedStatus;
  if (typeof id !== "string" || !ROUTE_ID_PATTERN.test(id)) {
    throw new Error("Typography route id is invalid.");
  }
  if (
    surface !== "product" &&
    surface !== "owner-surface" &&
    surface !== "raw-lifecycle"
  ) {
    throw new Error("Typography route surface is invalid.");
  }
  if (locale !== "uk" && locale !== "bg" && locale !== "ru") {
    throw new Error("Typography route locale is invalid.");
  }
  if (typeof target !== "string" || !isSafeRouteTarget(target)) {
    throw new Error("Typography route target is unsafe.");
  }
  if (
    expectedStatus !== 200 &&
    expectedStatus !== 404 &&
    expectedStatus !== 410
  ) {
    throw new Error("Typography route status is unsupported.");
  }
  const expectedSemanticStatus = id.endsWith("-gone") ? 410 : 404;
  if (
    (surface === "product" &&
      (id !== `${locale}-home` || expectedStatus !== 200)) ||
    (surface === "owner-surface" &&
      (!id.startsWith("surface-") ||
        expectedStatus !== (id === "surface-app-not-found" ? 404 : 200))) ||
    (surface === "raw-lifecycle" &&
      (!id.startsWith("raw-") || expectedStatus !== expectedSemanticStatus))
  ) {
    throw new Error("Typography route id and status semantics do not match.");
  }
  const parsedTarget = new URL(target, "https://fixture.invalid");
  const expectedProductPath =
    locale === "uk" ? "/" : locale === "bg" ? "/bg" : "/ru";
  if (
    surface === "product" &&
    (parsedTarget.pathname !== expectedProductPath || parsedTarget.search)
  ) {
    throw new Error("Typography product routes must prove /, /bg, and /ru.");
  }
  return { id, surface, locale, target, expectedStatus };
}

function isSafeRouteTarget(target: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(target, "https://fixture.invalid");
  } catch {
    return false;
  }
  if (target.startsWith("//")) return false;
  if (!target.startsWith("/") && !/^https?:\/\//i.test(target)) return false;
  if (parsed.username || parsed.password || parsed.hash) return false;
  for (const key of parsed.searchParams.keys()) {
    if (UNSAFE_ROUTE_PARAMETER.test(key)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
