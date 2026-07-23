import {
  GOOGLE_SANS_PRELOAD_ASSETS,
  GOOGLE_SANS_RUNTIME_ASSETS,
} from "./google-sans-runtime";

export interface TypographyPerformanceRun {
  run: number;
  lcpMs: number;
  totalCls: number;
  fontWindowCls: number;
  firstContentfulPaintMs: number;
  fontReadyMs: number;
  fontRequests: Array<{
    path: string;
    transferBytes: number;
    encodedBodyBytes: number;
  }>;
  cssRequests: Array<{
    path: string;
    transferBytes: number;
    encodedBodyBytes: number;
  }>;
  fontPreloads: string[];
  computedBodyFontFamily: string;
  externalFontRequests: string[];
  pageErrors: string[];
}

export interface TypographyPerformanceSummary {
  runCount: number;
  medianLcpMs: number;
  medianTotalCls: number;
  medianFontWindowCls: number;
  medianFontReadyMs: number;
  medianFontTransferBytes: number;
  medianFontEncodedBodyBytes: number;
  medianCssTransferBytes: number;
  maxFontRequestCount: number;
  maxFontPreloadCount: number;
}

export interface TypographyPerformanceGate {
  lcpRegressionMs: number;
  lcpRegressionLimitMs: number;
  lcpPassed: boolean;
  fontWindowClsPassed: boolean;
  totalClsPassed: boolean;
  externalFontRequestsPassed: boolean;
  pageErrorsPassed: boolean;
  computedFamilyPassed: boolean;
  fontUrlPolicyPassed: boolean;
  coreRequestShapePassed: boolean;
  coreTransferBudgetPassed: boolean;
  lazyVariantsPassed: boolean;
  preloadPolicyPassed: boolean;
}

export interface TypographyPerformanceComparisonBaseline {
  contractVersion: typeof TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION;
  artifactSha256: string;
  label: string;
  sha: string;
  summary: TypographyPerformanceSummary;
}

export const TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION =
  "ove208.typographyPerformance.v2" as const;

export const TYPOGRAPHY_PERFORMANCE_PROFILE = {
  browser: "chromium",
  viewport: { width: 390, height: 844 },
  cpuSlowdownMultiplier: 4,
  latencyMs: 40,
  downloadBytesPerSecond: (10 * 1024 * 1024) / 8,
  uploadBytesPerSecond: (2 * 1024 * 1024) / 8,
  serviceWorkers: "block",
  cache: "disabled",
} as const;

export type TypographyPerformanceEnvironment = "local" | "production";

export interface TypographyPerformanceArtifact {
  contractVersion: typeof TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION;
  capturedAt: string;
  environment: TypographyPerformanceEnvironment;
  label: string;
  baseUrl: string;
  route: "/bg";
  sha: string;
  profile: typeof TYPOGRAPHY_PERFORMANCE_PROFILE;
  runs: TypographyPerformanceRun[];
  summary: TypographyPerformanceSummary;
  comparisonBaseline?: TypographyPerformanceComparisonBaseline;
  comparison?: TypographyPerformanceGate;
}

const GOOGLE_SANS_PATH_PREFIX = "/fonts/google-sans/";
const GOOGLE_SANS_CORE_TRANSFER_BUDGET_BYTES = 80 * 1_024;
const FONT_URL_PATTERN = /\.(?:woff2?|ttf|otf)(?:$|[?#])/iu;

export const TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS = Object.freeze(
  ["normal-latin", "normal-cyrillic"].map((id) => {
    const asset = GOOGLE_SANS_RUNTIME_ASSETS.find(
      (candidate) => candidate.id === id,
    );
    if (!asset) throw new Error(`Missing core Google Sans asset: ${id}.`);
    return asset.publicPath;
  }),
);

export const TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS = Object.freeze(
  GOOGLE_SANS_PRELOAD_ASSETS.map(({ publicPath }) => publicPath),
);

export function isTypographyPerformanceFontRequest(
  resourceType: string,
  url: string,
) {
  return resourceType === "font" || FONT_URL_PATTERN.test(url);
}

export function isCleanTypographyPerformanceFontPath(value: string) {
  if (!value.startsWith("/")) return false;
  try {
    const base = new URL("https://typography-evidence.invalid");
    const parsed = new URL(value, base);
    return (
      parsed.origin === base.origin &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.pathname === value
    );
  } catch {
    return false;
  }
}

function googleSansRequests(run: TypographyPerformanceRun) {
  return run.fontRequests.filter(({ path }) =>
    path.startsWith(GOOGLE_SANS_PATH_PREFIX),
  );
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

export function summarizeTypographyPerformance(
  runs: TypographyPerformanceRun[],
): TypographyPerformanceSummary {
  const fontTransferBytes = runs.map((run) =>
    run.fontRequests.reduce(
      (total, request) => total + request.transferBytes,
      0,
    ),
  );
  const fontEncodedBodyBytes = runs.map((run) =>
    run.fontRequests.reduce(
      (total, request) => total + request.encodedBodyBytes,
      0,
    ),
  );
  const cssTransferBytes = runs.map((run) =>
    run.cssRequests.reduce(
      (total, request) => total + request.transferBytes,
      0,
    ),
  );

  return {
    runCount: runs.length,
    medianLcpMs: median(runs.map((run) => run.lcpMs)),
    medianTotalCls: median(runs.map((run) => run.totalCls)),
    medianFontWindowCls: median(runs.map((run) => run.fontWindowCls)),
    medianFontReadyMs: median(runs.map((run) => run.fontReadyMs)),
    medianFontTransferBytes: median(fontTransferBytes),
    medianFontEncodedBodyBytes: median(fontEncodedBodyBytes),
    medianCssTransferBytes: median(cssTransferBytes),
    maxFontRequestCount: Math.max(
      0,
      ...runs.map((run) => run.fontRequests.length),
    ),
    maxFontPreloadCount: Math.max(
      0,
      ...runs.map((run) => run.fontPreloads.length),
    ),
  };
}

export function evaluateTypographyPerformanceGate(input: {
  before: TypographyPerformanceSummary;
  after: TypographyPerformanceSummary;
  afterRuns: TypographyPerformanceRun[];
}): TypographyPerformanceGate {
  const lcpRegressionMs = input.after.medianLcpMs - input.before.medianLcpMs;
  const lcpRegressionLimitMs = Math.min(100, input.before.medianLcpMs * 0.05);

  return {
    lcpRegressionMs,
    lcpRegressionLimitMs,
    lcpPassed: lcpRegressionMs <= lcpRegressionLimitMs,
    fontWindowClsPassed: input.after.medianFontWindowCls <= 0.02,
    totalClsPassed: input.after.medianTotalCls <= 0.1,
    externalFontRequestsPassed: input.afterRuns.every(
      (run) => run.externalFontRequests.length === 0,
    ),
    pageErrorsPassed: input.afterRuns.every(
      (run) => run.pageErrors.length === 0,
    ),
    computedFamilyPassed: input.afterRuns.every((run) =>
      /^['"]?Google Sans['"]?(?:,|$)/u.test(run.computedBodyFontFamily),
    ),
    fontUrlPolicyPassed: input.afterRuns.every(
      (run) =>
        run.fontRequests.every(({ path }) =>
          isCleanTypographyPerformanceFontPath(path),
        ) && run.fontPreloads.every(isCleanTypographyPerformanceFontPath),
    ),
    coreRequestShapePassed: input.afterRuns.every((run) => {
      const paths = run.fontRequests.map(({ path }) => path);
      return (
        paths.length === TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS.length &&
        TYPOGRAPHY_PERFORMANCE_CORE_FONT_PATHS.every(
          (expectedPath) =>
            paths.filter((path) => path === expectedPath).length === 1,
        )
      );
    }),
    coreTransferBudgetPassed: input.afterRuns.every(
      (run) =>
        googleSansRequests(run).reduce(
          (total, request) => total + request.transferBytes,
          0,
        ) <= GOOGLE_SANS_CORE_TRANSFER_BUDGET_BYTES,
    ),
    lazyVariantsPassed: input.afterRuns.every((run) =>
      googleSansRequests(run).every(
        ({ path }) =>
          !path.includes("-italic-") &&
          !path.includes("-latin-ext-") &&
          !path.includes("-cyrillic-ext-"),
      ),
    ),
    preloadPolicyPassed: input.afterRuns.every((run) => {
      return (
        run.fontPreloads.length ===
          TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS.length &&
        run.fontPreloads.every(
          (path, index) =>
            path === TYPOGRAPHY_PERFORMANCE_PRELOAD_FONT_PATHS[index],
        )
      );
    }),
  };
}

export function parseTypographyPerformanceArtifact(
  value: unknown,
  expected: {
    baseUrl?: string;
    environment?: TypographyPerformanceEnvironment;
    route?: "/bg";
    sha?: string;
  } = {},
): TypographyPerformanceArtifact {
  if (!isRecord(value)) {
    throw new Error("Typography performance artifact must be an object.");
  }
  if (value.contractVersion !== TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION) {
    throw new Error("Typography performance artifact version is invalid.");
  }
  if (value.environment !== "local" && value.environment !== "production") {
    throw new Error("Typography performance environment is invalid.");
  }
  if (
    typeof value.label !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value.label)
  ) {
    throw new Error("Typography performance label is invalid.");
  }
  if (
    typeof value.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    throw new Error("Typography performance capture time is invalid.");
  }
  if (typeof value.baseUrl !== "string") {
    throw new Error("Typography performance base URL is invalid.");
  }
  const baseUrl = parseCleanOrigin(value.baseUrl);
  if (value.baseUrl !== baseUrl.origin) {
    throw new Error("Typography performance base URL must be an origin.");
  }
  if (value.route !== "/bg") {
    throw new Error("Typography performance route must be /bg.");
  }
  if (typeof value.sha !== "string" || !/^[a-f0-9]{40}$/u.test(value.sha)) {
    throw new Error("Typography performance SHA must be exact.");
  }
  if (
    JSON.stringify(value.profile) !==
    JSON.stringify(TYPOGRAPHY_PERFORMANCE_PROFILE)
  ) {
    throw new Error("Typography performance profile is incompatible.");
  }
  if (
    !Array.isArray(value.runs) ||
    value.runs.length < 5 ||
    value.runs.length > 20
  ) {
    throw new Error("Typography performance artifact requires 5..20 runs.");
  }
  const runs = value.runs.map((run, index) =>
    parseTypographyPerformanceRun(run, index + 1),
  );
  const summary = summarizeTypographyPerformance(runs);
  if (!isRecord(value.summary)) {
    throw new Error("Typography performance summary is invalid.");
  }
  for (const [key, expectedValue] of Object.entries(summary)) {
    if (value.summary[key] !== expectedValue) {
      throw new Error(
        `Typography performance summary does not match runs: ${key}.`,
      );
    }
  }
  if (
    expected.baseUrl &&
    baseUrl.origin !== parseCleanOrigin(expected.baseUrl).origin
  ) {
    throw new Error("Typography performance origins are incompatible.");
  }
  if (expected.environment && value.environment !== expected.environment) {
    throw new Error("Typography performance environments are incompatible.");
  }
  if (expected.route && value.route !== expected.route) {
    throw new Error("Typography performance routes are incompatible.");
  }
  if (expected.sha && value.sha !== expected.sha) {
    throw new Error("Typography performance baseline SHA is incompatible.");
  }

  const hasComparison = value.comparison !== undefined;
  const hasComparisonBaseline = value.comparisonBaseline !== undefined;
  if (hasComparison !== hasComparisonBaseline) {
    throw new Error(
      "Typography performance comparison requires paired baseline identity.",
    );
  }
  let comparisonBaseline: TypographyPerformanceComparisonBaseline | undefined;
  let comparison: TypographyPerformanceGate | undefined;
  if (hasComparison && hasComparisonBaseline) {
    if (!isRecord(value.comparisonBaseline)) {
      throw new Error("Typography performance baseline identity is invalid.");
    }
    if (
      value.comparisonBaseline.contractVersion !==
        TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION ||
      typeof value.comparisonBaseline.artifactSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(value.comparisonBaseline.artifactSha256) ||
      typeof value.comparisonBaseline.label !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value.comparisonBaseline.label) ||
      typeof value.comparisonBaseline.sha !== "string" ||
      !/^[a-f0-9]{40}$/u.test(value.comparisonBaseline.sha)
    ) {
      throw new Error("Typography performance baseline identity is invalid.");
    }
    const baselineSummary = parseTypographyPerformanceSummary(
      value.comparisonBaseline.summary,
    );
    comparisonBaseline = {
      contractVersion: TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
      artifactSha256: value.comparisonBaseline.artifactSha256,
      label: value.comparisonBaseline.label,
      sha: value.comparisonBaseline.sha,
      summary: baselineSummary,
    };
    const recomputedComparison = evaluateTypographyPerformanceGate({
      before: baselineSummary,
      after: summary,
      afterRuns: runs,
    });
    if (
      JSON.stringify(value.comparison) !== JSON.stringify(recomputedComparison)
    ) {
      throw new Error("Typography performance comparison is not reproducible.");
    }
    comparison = recomputedComparison;
  }

  return {
    ...(value as unknown as TypographyPerformanceArtifact),
    baseUrl: baseUrl.origin,
    runs,
    summary,
    ...(comparisonBaseline && comparison
      ? { comparisonBaseline, comparison }
      : {}),
  };
}

function parseTypographyPerformanceSummary(
  value: unknown,
): TypographyPerformanceSummary {
  if (!isRecord(value)) {
    throw new Error("Typography performance baseline summary is invalid.");
  }
  const numericKeys = [
    "runCount",
    "medianLcpMs",
    "medianTotalCls",
    "medianFontWindowCls",
    "medianFontReadyMs",
    "medianFontTransferBytes",
    "medianFontEncodedBodyBytes",
    "medianCssTransferBytes",
    "maxFontRequestCount",
    "maxFontPreloadCount",
  ] as const;
  for (const key of numericKeys) {
    if (
      typeof value[key] !== "number" ||
      !Number.isFinite(value[key]) ||
      value[key] < 0
    ) {
      throw new Error("Typography performance baseline summary is invalid.");
    }
  }
  const runCount = value.runCount as number;
  const maxFontRequestCount = value.maxFontRequestCount as number;
  const maxFontPreloadCount = value.maxFontPreloadCount as number;
  if (
    !Number.isInteger(runCount) ||
    runCount < 5 ||
    runCount > 20 ||
    !Number.isInteger(maxFontRequestCount) ||
    !Number.isInteger(maxFontPreloadCount)
  ) {
    throw new Error("Typography performance baseline summary is invalid.");
  }
  return value as unknown as TypographyPerformanceSummary;
}

function parseTypographyPerformanceRun(
  value: unknown,
  expectedRun: number,
): TypographyPerformanceRun {
  if (!isRecord(value) || value.run !== expectedRun) {
    throw new Error("Typography performance run order is invalid.");
  }
  for (const key of [
    "lcpMs",
    "firstContentfulPaintMs",
    "fontReadyMs",
  ] as const) {
    if (!isPositiveFinite(value[key])) {
      throw new Error(`Typography performance ${key} must be positive.`);
    }
  }
  for (const key of ["totalCls", "fontWindowCls"] as const) {
    if (!isNonNegativeFinite(value[key])) {
      throw new Error(`Typography performance ${key} must be non-negative.`);
    }
  }
  const fontRequests = parseResourceRequests(value.fontRequests, "font");
  const cssRequests = parseResourceRequests(value.cssRequests, "css");
  if (
    !Array.isArray(value.fontPreloads) ||
    value.fontPreloads.length === 0 ||
    value.fontPreloads.some((item) => typeof item !== "string" || !item)
  ) {
    throw new Error("Typography performance font preloads are invalid.");
  }
  if (
    typeof value.computedBodyFontFamily !== "string" ||
    value.computedBodyFontFamily.length === 0
  ) {
    throw new Error("Typography performance computed family is invalid.");
  }
  if (
    !isStringArray(value.externalFontRequests) ||
    !isStringArray(value.pageErrors)
  ) {
    throw new Error("Typography performance runtime evidence is invalid.");
  }
  return {
    run: expectedRun,
    lcpMs: value.lcpMs as number,
    totalCls: value.totalCls as number,
    fontWindowCls: value.fontWindowCls as number,
    firstContentfulPaintMs: value.firstContentfulPaintMs as number,
    fontReadyMs: value.fontReadyMs as number,
    fontRequests,
    cssRequests,
    fontPreloads: [...value.fontPreloads] as string[],
    computedBodyFontFamily: value.computedBodyFontFamily,
    externalFontRequests: [...value.externalFontRequests] as string[],
    pageErrors: [...value.pageErrors] as string[],
  };
}

function parseResourceRequests(
  value: unknown,
  kind: "font" | "css",
): TypographyPerformanceRun["fontRequests"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Typography performance ${kind} requests are missing.`);
  }
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.path !== "string" ||
      !item.path.startsWith("/") ||
      !isPositiveFinite(item.transferBytes) ||
      !isPositiveFinite(item.encodedBodyBytes)
    ) {
      throw new Error(`Typography performance ${kind} request is invalid.`);
    }
    return {
      path: item.path,
      transferBytes: item.transferBytes,
      encodedBodyBytes: item.encodedBodyBytes,
    };
  });
}

function parseCleanOrigin(value: string): URL {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(
      "Typography performance URL must be a clean HTTP(S) origin.",
    );
  }
  return parsed;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
