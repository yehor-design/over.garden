import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type ConsoleMessage,
  type Page,
} from "playwright";

import {
  CORE_JOURNEY_SCENARIOS,
  browserSafeFixturePath,
} from "../src/lib/accessibility/core-journey-matrix";
import { VISUAL_FIXTURE_MANIFEST } from "../src/lib/visual-fixtures/manifest";
import { INTERFACE_LOCALE_COOKIE_NAME } from "../src/lib/interface-localization";
import { INTERFACE_MARKET_COOKIE_NAME } from "../src/lib/interface-market";
import {
  GOOGLE_SANS_ASSET_MANIFEST,
  GOOGLE_SANS_FALLBACK_FAMILY,
  GOOGLE_SANS_FAMILY,
} from "../src/lib/typography/google-sans-contract";
import { GEIST_MONO_FAMILY } from "../src/lib/typography/geist-mono-contract";
import {
  assertNoTypographyBrowserContractOverrides,
  computedFontFamilies,
  evaluateTypographyBrowserObservation,
  evaluateTypographyFallbackObservation,
  evaluateTypographyGlobalErrorObservation,
  inspectTypographyBrowserFontUrls,
  isExpectedGoogleSansFamily,
  isTypographyBrowserFontUrlAllowed,
  parseTypographyBrowserRouteManifest,
  shouldAttemptFallbackCaseAgain,
  textRequiresCyrillicExtended,
  textRequiresLatinExtended,
  TYPOGRAPHY_BROWSER_NAMES,
  TYPOGRAPHY_BROWSER_VIEWPORTS,
  TYPOGRAPHY_EXTENDED_SUBSET_MARKERS,
  TYPOGRAPHY_GLYPH_CORPUS,
  TYPOGRAPHY_LAZY_PROBES,
  TYPOGRAPHY_PROBE_WEIGHTS,
  TYPOGRAPHY_SEMANTIC_PROBE_CATEGORIES,
  unicodeRangeCoversText,
  type TypographyBrowserFontAsset,
  type TypographyBrowserName,
  type TypographyBrowserObservation,
  type TypographyBrowserRoute,
  type TypographyBrowserViewport,
  type TypographyFallbackObservation,
  type TypographyGlobalErrorObservation,
} from "../src/lib/typography/typography-browser-contract";
import {
  localizedPath,
  stripLocalePrefix,
} from "../src/lib/public-localization";

const DEFAULT_FAMILY = GOOGLE_SANS_FAMILY;
const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "0.0.0.0",
  "[::1]",
  "::1",
]);
const GOOGLE_FONT_HOSTS = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "fonts.google.com",
]);
const FONT_URL_PATTERN = /\.(?:woff2?|ttf|otf)(?:$|[?#])/i;
const FALLBACK_DELAY_MS = 600;
const FALLBACK_ROUTE_ID = "bg-home";

const GLOBAL_ERROR_ROUTE_ID = "local-global-error";
const GLOBAL_ERROR_VIEWPORTS = [
  { id: "mobile-390", width: 390, height: 844 },
  { id: "desktop-1440", width: 1440, height: 1000 },
] as const;
const MONO_PROBE_TEXT = "OVE-208 semantic mono 0123456789";
const FONT_CONSOLE_WARNING_PATTERN = /(?:font|preload)/iu;
const INTENTIONAL_GLOBAL_ERROR_PATTERN =
  /(?:Deterministic localization global-error fixture|Server Components render)/iu;
const OWNER_SURFACE_ROUTE_IDS = [
  "surface-catalog-dense",
  "surface-knowledge-editorial",
  "surface-auth-help",
  "surface-journal-prose",
  "surface-profile-dense",
  "surface-workspace-dense",
  "surface-creation-form",
  "surface-social-comments",
  "surface-community-moderation",
  "surface-operator-moderation",
  "surface-operator-unauthorized",
  "surface-app-not-found",
  "surface-workspace-loading",
  "surface-workspace-error",
  "surface-workspace-offline",
] as const;
const RAW_LIFECYCLE_ROUTE_IDS = [
  "raw-community-not-found",
  "raw-profile-not-found",
  "raw-profile-gone",
  "raw-object-not-found",
  "raw-object-gone",
  "raw-journal-not-found",
  "raw-journal-gone",
] as const;
const OWNER_SURFACE_VIEWPORT_IDS = new Set(["mobile-390", "desktop-1440"]);

interface CliOptions {
  baseUrl: URL;
  browsers: TypographyBrowserName[];
  expectedFamily: string;
  outputPath: string | null;
  routeManifestPath: string | null;
  rawRouteValues: string[];
  screenshotDir: string | null;
  sha: string | null;
}

interface CssFontFaceDescriptor {
  family: string;
  sourceUrl: string;
  style: string;
  unicodeRange: string;
  weight: string;
}

interface FontRequestRecord {
  href: string;
  origin: string;
  path: string;
}

interface ClassifiedFontRequest extends FontRequestRecord {
  allowlisted: boolean;
  style: string | null;
  subset: TypographyBrowserFontAsset["subset"] | null;
  unicodeRange: string | null;
}

interface BrowserCaseResult {
  browser: TypographyBrowserName;
  routeId: string;
  surface: TypographyBrowserRoute["surface"];
  locale: TypographyBrowserRoute["locale"];
  viewportId: TypographyBrowserViewport["id"];
  expectedStatus: TypographyBrowserRoute["expectedStatus"];
  actualStatus: number | null;
  documentLang: string | null;
  computedFontFamily: string | null;
  fontsReady: boolean;
  loadedFaceCount: number;
  layout: {
    horizontalOverflowPx: number;
    offscreenControlCount: number;
    clippedTextCount: number;
    proportionalFontMismatchCount: number;
    clippingDetectorRegression: null | {
      closedDetailsIgnored: boolean;
      visibleClippedDetected: boolean;
      visuallyHiddenIgnored: boolean;
    };
  };
  runtime: {
    pageErrorCount: number;
    consoleErrorCount: number;
    fontRequestCount: number;
    crossOriginFontRequestCount: number;
    googleRuntimeRequestCount: number;
    unclassifiedFontRequestCount: number;
    fontRequestFailureCount: number;
  };
  lazyLoading: {
    initialItalicDemand: boolean;
    initialItalicFontRequestCount: number;
    initialLatinExtDemand: boolean;
    initialLatinExtFontRequestCount: number;
    initialCyrillicExtDemand: boolean;
    initialCyrillicExtFontRequestCount: number;
    probeRun: boolean;
    italicNewRequestCount: number | null;
    latinExtNewRequestCount: number | null;
    cyrillicExtNewRequestCount: number | null;
  };
  corpus: {
    loaded: boolean | null;
    platformFontProof: "passed" | "failed" | "not-applicable";
    semanticMono: null | {
      textPresent: boolean;
      classApplied: boolean;
      loaded: boolean;
      computedFontFamily: string;
      tokenValue: string;
      semanticStack: string;
      platformFontProof: "passed" | "failed" | "not-applicable";
    };
    semanticInheritance: null | {
      categoryCount: number;
      fontMismatchCount: number;
    };
  };
  sameOriginFontPaths: string[];
  screenshotFilename: string | null;
  failures: string[];
}

interface FallbackCaseResult {
  browser: TypographyBrowserName;
  routeId: typeof FALLBACK_ROUTE_ID;
  viewportId: "mobile-390";
  actualStatus: number | null;
  visibleMeaningfulText: boolean;
  firstContentfulPaintMs: number | null;
  visibleAfterDomContentLoadedMs: number | null;
  targetFontUnavailableBeforeRelease: boolean;
  fallbackFontAvailableBeforeRelease: boolean;
  computedFallbackFamily: string | null;
  blockedFontRequestCount: number;
  blockedFontResourceTimingCount: number | null;
  configuredDelayMs: typeof FALLBACK_DELAY_MS;
  blockedDurationMs: number | null;
  fallbackDurationMs: number | null;
  targetFontAvailableAfterRelease: boolean;
  convergedFontFamily: string | null;
  fontsReady: boolean;
  fontWindowCls: number | null;
  fallbackFaceResolved?: boolean;
  fallbackSampleWidthPx?: {
    fallback: number;
    missingControl: number;
    arial: number;
    liberationSans: number;
    arimo: number;
    dejaVuSans: number;
  };
  clsSources?: ReadonlyArray<{
    selector: string;
    value: number;
    text: string;
  }>;
  runtime: {
    pageErrorCount: number;
    consoleErrorCount: number;
  };
  /**
   * Failures recorded by every attempt, oldest first. A single entry means the
   * case was decided on its first run. See shouldRetryFallbackCase.
   */
  attemptFailures?: ReadonlyArray<readonly string[]>;
  failures: string[];
}

interface GlobalErrorCaseResult {
  browser: TypographyBrowserName;
  routeId: typeof GLOBAL_ERROR_ROUTE_ID;
  viewportId: "mobile-390" | "desktop-1440";
  actualStatus: number | null;
  documentLang: string | null;
  computedFontFamily: string | null;
  fontsReady: boolean;
  loadedFaceCount: number;
  fixtureVisible: boolean;
  layout: {
    horizontalOverflowPx: number;
    offscreenControlCount: number;
    clippedTextCount: number;
    proportionalFontMismatchCount: number;
  };
  runtime: {
    fontRequestCount: number;
    crossOriginFontRequestCount: number;
    googleRuntimeRequestCount: number;
    unclassifiedFontRequestCount: number;
    fontRequestFailureCount: number;
    fontWarningCount: number;
    pageErrorCount: number;
    consoleErrorCount: number;
  };
  platformFontProof: "passed" | "failed" | "not-applicable";
  sameOriginFontPaths: string[];
  screenshotFilename: string | null;
  failures: string[];
}

interface TypographyBrowserArtifact {
  contractVersion: "ove208.typographyBrowser.v2";
  capturedAt: string;
  baseOrigin: string;
  expectedFamily: string;
  sha: string | null;
  browsers: TypographyBrowserName[];
  viewportIds: TypographyBrowserViewport["id"][];
  routeIds: string[];
  cases: BrowserCaseResult[];
  fallbackCases: FallbackCaseResult[];
  globalErrorFixture: {
    applicable: boolean;
    omissionReason: "non-loopback-origin" | null;
    cases: GlobalErrorCaseResult[];
  };
  screenshots: Array<{
    filename: string;
    bytes: number;
    sha256: string;
  }>;
  summary: {
    matrixCaseCount: number;
    fallbackCaseCount: number;
    passedFallbackCaseCount: number;
    failedFallbackCaseCount: number;
    globalErrorCaseCount: number;
    passedGlobalErrorCaseCount: number;
    failedGlobalErrorCaseCount: number;
    caseCount: number;
    passedCaseCount: number;
    failedCaseCount: number;
    chromiumPlatformProofCount: number;
    chromiumMonoPlatformProofCount: number;
    boundedNonChromiumSkipCount: number;
    boundedNonChromiumMonoSkipCount: number;
    failureCodes: string[];
  };
}

const USAGE = `Usage: tsx scripts/verify-typography-browser.ts --base-url <origin> [options]

Options:
  --browsers chromium,firefox,webkit
  --sha <git-sha>
  --output <artifact.json>
  --route-manifest <routes.json>
  --screenshot-dir <evidence-directory>
  --raw-route raw-community-not-found:uk:404:/communities/missing

TYPOGRAPHY_BASE_URL may supply --base-url in CI. Loopback runs derive the exact
representative owner-surface matrix plus seven seeded raw lifecycle routes
(community 404; profile/object/journal 404+410). Remote runs must provide the
same seven redacted raw routes and may supply equivalent owner routes.`;

function readCliOptions(argv: string[]): CliOptions {
  assertNoTypographyBrowserContractOverrides(argv);
  const valuesFor = (name: string): string[] => {
    const values: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
      if (argv[index] === name && argv[index + 1]) values.push(argv[index + 1]);
    }
    return values;
  };
  const valueFor = (name: string) => valuesFor(name).at(-1) ?? null;
  const baseUrlValue =
    valueFor("--base-url") ?? process.env.TYPOGRAPHY_BASE_URL ?? null;
  if (!baseUrlValue) {
    throw new Error("Typography browser smoke requires --base-url.");
  }
  const baseUrl = new URL(baseUrlValue);
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error("Typography browser smoke requires a clean HTTP(S) URL.");
  }
  baseUrl.pathname = "/";

  const browserValues = valuesFor("--browsers").flatMap((value) =>
    value.split(",").map((item) => item.trim()),
  );
  const requestedBrowsers =
    browserValues.length > 0 ? browserValues : [...TYPOGRAPHY_BROWSER_NAMES];
  if (
    requestedBrowsers.some(
      (value) =>
        !TYPOGRAPHY_BROWSER_NAMES.includes(value as TypographyBrowserName),
    )
  ) {
    throw new Error(
      "Typography browser smoke received an unsupported browser.",
    );
  }
  const browsers = [...new Set(requestedBrowsers as TypographyBrowserName[])];

  const expectedFamily = DEFAULT_FAMILY;
  const sha = valueFor("--sha");
  if (sha && !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("Typography browser smoke SHA must be exact.");
  }
  const githubSha = process.env.GITHUB_SHA?.toLowerCase();
  if (githubSha && sha?.toLowerCase() !== githubSha) {
    throw new Error(
      "Typography browser smoke SHA must match the GitHub Actions checkout.",
    );
  }

  const screenshotDir = resolveOptionalPath(valueFor("--screenshot-dir"));
  if (screenshotDir && !LOOPBACK_HOSTS.has(baseUrl.hostname)) {
    throw new Error(
      "Typography browser screenshots are fixture-only and require a loopback origin.",
    );
  }

  return {
    baseUrl,
    browsers,
    expectedFamily,
    outputPath: resolveOptionalPath(valueFor("--output")),
    routeManifestPath: resolveOptionalPath(valueFor("--route-manifest")),
    rawRouteValues: valuesFor("--raw-route"),
    screenshotDir,
    sha: sha?.toLowerCase() ?? null,
  };
}

function resolveOptionalPath(value: string | null): string | null {
  return value ? path.resolve(value) : null;
}

async function resolveRoutes(
  options: CliOptions,
): Promise<TypographyBrowserRoute[]> {
  const productRoutes: TypographyBrowserRoute[] = [
    {
      id: "uk-home",
      surface: "product",
      locale: "uk",
      target: "/",
      expectedStatus: 200,
    },
    {
      id: "bg-home",
      surface: "product",
      locale: "bg",
      target: "/bg",
      expectedStatus: 200,
    },
    {
      id: "ru-home",
      surface: "product",
      locale: "ru",
      target: "/ru",
      expectedStatus: 200,
    },
  ];
  const manifestRoutes = options.routeManifestPath
    ? parseTypographyBrowserRouteManifest(
        JSON.parse(await readFile(options.routeManifestPath, "utf8")),
      ).routes
    : [];
  const cliRawRoutes = options.rawRouteValues.map(parseRawRouteValue);
  const manifestProductRoutes = manifestRoutes.filter(
    ({ surface }) => surface === "product",
  );
  const selectedProducts =
    manifestProductRoutes.length > 0 ? manifestProductRoutes : productRoutes;
  const manifestOwnerRoutes = manifestRoutes.filter(
    ({ surface }) => surface === "owner-surface",
  );
  const selectedOwners =
    manifestOwnerRoutes.length > 0
      ? manifestOwnerRoutes
      : LOOPBACK_HOSTS.has(options.baseUrl.hostname)
        ? localOwnerSurfaceRoutes()
        : [];
  const suppliedRawRoutes = [
    ...manifestRoutes.filter(({ surface }) => surface === "raw-lifecycle"),
    ...cliRawRoutes,
  ];
  const rawRoutes =
    suppliedRawRoutes.length > 0
      ? suppliedRawRoutes
      : LOOPBACK_HOSTS.has(options.baseUrl.hostname)
        ? localFixtureRawRoutes()
        : [];
  const combined = [...selectedProducts, ...selectedOwners, ...rawRoutes];
  const validated = parseTypographyBrowserRouteManifest({
    contractVersion: 1,
    routes: combined,
  }).routes;

  const routeIds = new Set(validated.map(({ id }) => id));
  if (["uk-home", "bg-home", "ru-home"].some((id) => !routeIds.has(id))) {
    throw new Error(
      "Typography browser smoke requires exact uk/bg/ru home routes.",
    );
  }
  if (
    LOOPBACK_HOSTS.has(options.baseUrl.hostname) &&
    OWNER_SURFACE_ROUTE_IDS.some((id) => !routeIds.has(id))
  ) {
    throw new Error(
      "Loopback typography smoke requires the exact representative owner-surface matrix.",
    );
  }
  const lifecycleRoutes = validated.filter(
    ({ surface }) => surface === "raw-lifecycle",
  );
  if (
    lifecycleRoutes.length !== RAW_LIFECYCLE_ROUTE_IDS.length ||
    RAW_LIFECYCLE_ROUTE_IDS.some((id) => !routeIds.has(id))
  ) {
    throw new Error(
      "Typography browser smoke requires the exact seven-route raw lifecycle matrix: community 404 plus profile/object/journal 404 and 410.",
    );
  }

  for (const route of validated) resolveRouteUrl(options.baseUrl, route.target);
  return validated;
}

function parseRawRouteValue(value: string): TypographyBrowserRoute {
  const match = /^([a-z0-9][a-z0-9-]{1,63}):(uk|bg|ru):(404|410):(.+)$/i.exec(
    value,
  );
  if (!match) {
    throw new Error(
      "Typography --raw-route must be id:locale:status:path-or-url.",
    );
  }
  return parseTypographyBrowserRouteManifest({
    contractVersion: 1,
    routes: [
      {
        id: match[1].toLowerCase(),
        surface: "raw-lifecycle",
        locale: match[2].toLowerCase(),
        expectedStatus: Number(match[3]),
        target: match[4],
      },
    ],
  }).routes[0];
}

function fixtureRoute(
  scenarioId: string,
  input: Omit<TypographyBrowserRoute, "target"> & {
    localize?: boolean;
    pathTransform?: "identity" | "community-moderation";
  },
): TypographyBrowserRoute {
  const scenario = CORE_JOURNEY_SCENARIOS.find(({ id }) => id === scenarioId);
  if (!scenario) throw new Error("Typography fixture scenario is missing.");
  const safePath = browserSafeFixturePath(scenario.path);
  const parsed = new URL(safePath, "https://fixture.invalid");
  if (input.pathTransform === "community-moderation") {
    if (!parsed.pathname.startsWith("/communities/")) {
      throw new Error("Typography operator fixture cannot derive admin path.");
    }
    parsed.pathname = `/admin${parsed.pathname}`;
  }
  if (input.localize) {
    parsed.pathname = localizedPath(
      input.locale,
      stripLocalePrefix(parsed.pathname).path,
    );
  }
  return {
    id: input.id,
    surface: input.surface,
    locale: input.locale,
    expectedStatus: input.expectedStatus,
    target: `${parsed.pathname}${parsed.search}`,
  };
}

function explicitOwnerRoute(
  id: (typeof OWNER_SURFACE_ROUTE_IDS)[number],
  target: string,
  expectedStatus: 200 | 404 = 200,
  locale: TypographyBrowserRoute["locale"] = "uk",
): TypographyBrowserRoute {
  return {
    id,
    surface: "owner-surface",
    locale,
    target,
    expectedStatus,
  };
}

function localOwnerSurfaceRoutes(): TypographyBrowserRoute[] {
  const routeFor = (
    id: (typeof OWNER_SURFACE_ROUTE_IDS)[number],
    scenarioId: string,
    options: {
      locale?: TypographyBrowserRoute["locale"];
      localize?: boolean;
      pathTransform?: "identity" | "community-moderation";
    } = {},
  ) =>
    fixtureRoute(scenarioId, {
      id,
      surface: "owner-surface",
      locale: options.locale ?? "uk",
      expectedStatus: 200,
      localize: options.localize,
      pathTransform: options.pathTransform,
    });

  return [
    routeFor(
      "surface-catalog-dense",
      "main:ove187-catalog-page-size-plus-one",
      { locale: "bg", localize: true },
    ),
    routeFor(
      "surface-knowledge-editorial",
      "main:ove187-knowledge-answer-long",
      { locale: "ru", localize: true },
    ),
    explicitOwnerRoute("surface-auth-help", "/auth/help", 200, "bg"),
    routeFor("surface-journal-prose", "journal-entry:backdated-long"),
    routeFor("surface-profile-dense", "profile:gardener-dense", {
      locale: "bg",
      localize: true,
    }),
    routeFor("surface-workspace-dense", "workspace:workspace-dense", {
      locale: "ru",
    }),
    routeFor("surface-creation-form", "creation:ove182-c004", {
      locale: "bg",
    }),
    routeFor("surface-social-comments", "social:comments-dense", {
      locale: "ru",
      localize: true,
    }),
    routeFor(
      "surface-community-moderation",
      "community:ove184-community-moderator",
      { locale: "bg", localize: true },
    ),
    routeFor(
      "surface-operator-moderation",
      "community:ove184-community-moderator",
      { locale: "ru", pathTransform: "community-moderation" },
    ),
    explicitOwnerRoute(
      "surface-operator-unauthorized",
      "/garden/catalog/curation",
      200,
      "bg",
    ),
    explicitOwnerRoute(
      "surface-app-not-found",
      "/ru/ove208-standard-not-found/deep",
      404,
      "ru",
    ),
    routeFor("surface-workspace-loading", "workspace:workspace-loading"),
    routeFor("surface-workspace-error", "workspace:workspace-error", {
      locale: "bg",
    }),
    routeFor("surface-workspace-offline", "workspace:workspace-offline", {
      locale: "ru",
    }),
  ];
}

function localFixtureRawRoutes(): TypographyBrowserRoute[] {
  const firstFixtureActor = VISUAL_FIXTURE_MANIFEST.actors[0];
  if (!firstFixtureActor) {
    throw new Error("Typography profile-gone fixture actor is missing.");
  }
  const generatedRetiredHandle = `gardener_${createHash("sha256")
    .update(firstFixtureActor.id)
    .digest("hex")
    .slice(0, 16)}`;

  return [
    fixtureRoute("community:ove184-community-unavailable", {
      id: "raw-community-not-found",
      surface: "raw-lifecycle",
      locale: "uk",
      expectedStatus: 404,
    }),
    fixtureRoute("profile:removed-unavailable", {
      id: "raw-profile-not-found",
      surface: "raw-lifecycle",
      locale: "bg",
      expectedStatus: 404,
      localize: true,
    }),
    {
      id: "raw-profile-gone",
      surface: "raw-lifecycle",
      locale: "bg",
      expectedStatus: 410,
      target: `/bg/%40${generatedRetiredHandle}`,
    },
    fixtureRoute("passport:public-unpublished", {
      id: "raw-object-not-found",
      surface: "raw-lifecycle",
      locale: "ru",
      expectedStatus: 404,
      localize: true,
    }),
    fixtureRoute("passport:public-gone", {
      id: "raw-object-gone",
      surface: "raw-lifecycle",
      locale: "uk",
      expectedStatus: 410,
    }),
    fixtureRoute("journal-entry:missing-404", {
      id: "raw-journal-not-found",
      surface: "raw-lifecycle",
      locale: "ru",
      expectedStatus: 404,
      localize: true,
    }),
    fixtureRoute("journal-entry:gone-410", {
      id: "raw-journal-gone",
      surface: "raw-lifecycle",
      locale: "ru",
      expectedStatus: 410,
      localize: true,
    }),
  ];
}

function resolveRouteUrl(baseUrl: URL, target: string): URL {
  const url = new URL(target, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error("Typography routes must remain on the selected origin.");
  }
  url.hash = "";
  return url;
}

function viewportsForRoute(
  route: TypographyBrowserRoute,
): readonly TypographyBrowserViewport[] {
  return route.surface === "owner-surface"
    ? TYPOGRAPHY_BROWSER_VIEWPORTS.filter(({ id }) =>
        OWNER_SURFACE_VIEWPORT_IDS.has(id),
      )
    : TYPOGRAPHY_BROWSER_VIEWPORTS;
}

function shouldCaptureBrowserCaseScreenshot(input: {
  browserName: TypographyBrowserName;
  route: TypographyBrowserRoute;
  viewport: TypographyBrowserViewport;
}): boolean {
  return (
    input.browserName === "chromium" &&
    (input.viewport.id === "mobile-390" ||
      (input.route.surface === "product" &&
        input.viewport.id === "desktop-1440"))
  );
}

async function captureScreenshot(input: {
  directory: string;
  filename: string;
  page: Page;
}): Promise<string> {
  await mkdir(input.directory, { recursive: true });
  await input.page.screenshot({
    path: path.join(input.directory, input.filename),
    fullPage: false,
    animations: "disabled",
  });
  return input.filename;
}

function loadAssetManifest(): TypographyBrowserFontAsset[] {
  return GOOGLE_SANS_ASSET_MANIFEST.assets.map(
    ({ publicPath: assetPath, style, subset }) => ({
      path: assetPath,
      style,
      subset,
    }),
  );
}

function browserLauncher(browserName: TypographyBrowserName) {
  if (browserName === "chromium") return chromium;
  if (browserName === "firefox") return firefox;
  return webkit;
}

function isExpectedMainDocumentStatusConsole(input: {
  browserName: TypographyBrowserName;
  expectedStatus: number;
  message: ConsoleMessage;
  url: URL;
}): boolean {
  if (input.message.type() !== "error") {
    return false;
  }
  const match =
    /^Failed to load resource: the server responded with a status of (\d{3}) \([^)]+\)$/u.exec(
      input.message.text(),
    );
  if (!match || Number(match[1]) !== input.expectedStatus) return false;
  try {
    return new URL(input.message.location().url).href === input.url.href;
  } catch {
    return false;
  }
}

function isExpectedGlobalErrorConsole(input: {
  baseUrl: URL;
  browserName: TypographyBrowserName;
  globalErrorUrl: URL;
  message: ConsoleMessage;
}): boolean {
  if (
    isExpectedMainDocumentStatusConsole({
      browserName: input.browserName,
      expectedStatus: 500,
      message: input.message,
      url: input.globalErrorUrl,
    })
  ) {
    return true;
  }
  if (
    input.browserName !== "firefox" ||
    input.message.type() !== "error" ||
    input.message.text() !== "Error"
  ) {
    return false;
  }
  try {
    const location = new URL(input.message.location().url);
    return (
      location.origin === input.baseUrl.origin &&
      location.pathname.startsWith("/_next/static/chunks/") &&
      input.message.location().lineNumber > 0
    );
  } catch {
    return false;
  }
}

async function installLocaleContext(
  context: BrowserContext,
  baseUrl: URL,
  locale: TypographyBrowserRoute["locale"],
) {
  const market = locale === "uk" ? "ukraine" : "bulgaria";
  const countryCode = locale === "uk" ? "UA" : "BG";
  await context.addCookies([
    {
      name: INTERFACE_MARKET_COOKIE_NAME,
      value: market,
      url: baseUrl.origin,
    },
    {
      name: INTERFACE_LOCALE_COOKIE_NAME,
      value: locale,
      url: baseUrl.origin,
    },
  ]);
  await context.setExtraHTTPHeaders({
    "accept-language": locale,
    "x-vercel-ip-country": countryCode,
  });
}

async function installEvaluationRuntime(context: BrowserContext) {
  // tsx/esbuild preserves local callback names with a tiny `__name` helper.
  // Playwright serializes page callbacks without that module-scoped helper, so
  // provide its exact behavior inside the isolated browser realm.
  await context.addInitScript({
    content:
      "Object.defineProperty(globalThis, '__name', { configurable: true, value: (target, value) => Object.defineProperty(target, 'name', { configurable: true, value }) });",
  });
}

async function waitForFonts(page: Page): Promise<boolean> {
  await page.waitForLoadState("load", { timeout: 20_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.waitForFunction(
    () => document.fonts.status === "loaded",
    undefined,
    {
      timeout: 15_000,
    },
  );
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return document.fonts.status === "loaded";
  });
}

async function cleanupTypographyProbes(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const popover of Array.from(
      document.querySelectorAll<HTMLElement>("[popover]"),
    )) {
      try {
        if (popover.matches(":popover-open")) popover.hidePopover?.();
      } catch {
        // Unsupported popover selectors do not prevent deterministic cleanup.
      }
    }
    for (const probe of Array.from(
      document.querySelectorAll(
        "[data-ove208-font-probes], [data-ove208-font-probe-id], [data-ove208-semantic-inheritance]",
      ),
    )) {
      probe.remove();
    }
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function settleScreenshotLayout(
  page: Page,
  expectedFamily: string,
): Promise<void> {
  await page.evaluate(async (family) => {
    const sample = document.body.innerText.slice(0, 8_000) || "OverGarden";
    await Promise.all(
      [400, 500, 600, 700].map((weight) =>
        document.fonts.load(`normal ${weight} 17px "${family}"`, sample),
      ),
    );
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (element) =>
        element.complete ? element.decode().catch(() => undefined) : undefined,
      ),
    );
  }, expectedFamily);

  let previous = "";
  let stableSampleCount = 0;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const snapshot = await page.evaluate(() => {
      const rectFor = (selector: string) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect
          ? [rect.x, rect.y, rect.width, rect.height].map(
              (value) => Math.round(value * 100) / 100,
            )
          : null;
      };
      return JSON.stringify({
        bodyHeight: document.body.scrollHeight,
        documentHeight: document.documentElement.scrollHeight,
        innerTextLength: document.body.innerText.length,
        main: rectFor("main"),
        consent: rectFor("[data-analytics-consent-banner='true']"),
        incompleteImageCount: Array.from(document.images).filter(
          (image) => !image.complete,
        ).length,
      });
    });
    stableSampleCount = snapshot === previous ? stableSampleCount + 1 : 0;
    previous = snapshot;
    if (stableSampleCount >= 3) return;
    await page.waitForTimeout(150);
  }
  throw new Error("Typography screenshot layout did not stabilize.");
}

async function readCssFontFaces(page: Page): Promise<CssFontFaceDescriptor[]> {
  return page.evaluate(() => {
    const faces: CssFontFaceDescriptor[] = [];
    const readRules = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const style = (rule as CSSFontFaceRule).style;
          const source = style.getPropertyValue("src");
          const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
          for (const match of source.matchAll(urlPattern)) {
            try {
              faces.push({
                family: style.getPropertyValue("font-family").trim(),
                sourceUrl: new URL(match[2], document.baseURI).href,
                style: style.getPropertyValue("font-style").trim() || "normal",
                unicodeRange: style.getPropertyValue("unicode-range").trim(),
                weight:
                  style.getPropertyValue("font-weight").trim() || "normal",
              });
            } catch {
              // An invalid source URL cannot classify a successful font request.
            }
          }
        }
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) readRules(nested);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        readRules(sheet.cssRules);
      } catch {
        // Cross-origin stylesheets remain visible to the request-origin gate.
      }
    }
    return faces;
  });
}

async function readPageStructure(
  page: Page,
  expectedFamily: string,
  runClippingDetectorRegression: boolean,
) {
  return page.evaluate(
    ({ family, verifyClippingDetector }) => {
      const rendered = (element: Element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.closest("[hidden], [inert], [aria-hidden='true']"))
          return false;
        const closedDetails = element.closest("details:not([open])");
        if (closedDetails) {
          const summary = closedDetails.querySelector(":scope > summary");
          if (!summary?.contains(element)) return false;
        }
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden")
          return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const knownVisuallyHidden = (element: Element) =>
        element.closest(".sr-only") !== null;
      const unexpectedlyClipped = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        if (
          style.textOverflow === "ellipsis" ||
          style.getPropertyValue("-webkit-line-clamp") !== "none"
        ) {
          return false;
        }
        const clipsX = ["clip", "hidden"].includes(style.overflowX);
        const clipsY = ["clip", "hidden"].includes(style.overflowY);
        return (
          (clipsX && element.scrollWidth > element.clientWidth + 1) ||
          (clipsY && element.scrollHeight > element.clientHeight + 1)
        );
      };
      const viewportWidth = document.documentElement.clientWidth;
      const controls = Array.from(
        document.querySelectorAll(
          "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter(rendered);
      const offscreenControlCount = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.left >= -1 && rect.right <= viewportWidth + 1) return false;
        let ancestor = element.parentElement;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (
            [style.overflow, style.overflowX].some((overflow) =>
              ["auto", "clip", "hidden", "scroll"].includes(overflow),
            )
          ) {
            return false;
          }
          ancestor = ancestor.parentElement;
        }
        return true;
      }).length;
      const textCandidates = Array.from(document.querySelectorAll("body *"))
        .filter(rendered)
        .filter(
          (element) =>
            element.isContentEditable ||
            Array.from(element.childNodes).some(
              (node) =>
                node.nodeType === Node.TEXT_NODE &&
                (node.textContent?.trim().length ?? 0) > 0,
            ),
        );
      const clippedTextCount = textCandidates.filter(
        (element) =>
          !knownVisuallyHidden(element) && unexpectedlyClipped(element),
      ).length;
      let clippingDetectorRegression: null | {
        closedDetailsIgnored: boolean;
        visibleClippedDetected: boolean;
        visuallyHiddenIgnored: boolean;
      } = null;
      if (verifyClippingDetector) {
        const fixture = document.createElement("section");
        fixture.dataset.ove208ClippingDetector = "true";
        const visibleClipped = document.createElement("p");
        visibleClipped.textContent = "Visible clipping must remain a failure";
        Object.assign(visibleClipped.style, {
          height: "20px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          width: "20px",
        });
        const visuallyHidden = document.createElement("p");
        visuallyHidden.className = "sr-only";
        visuallyHidden.textContent = "Accessible skip-link text";
        Object.assign(visuallyHidden.style, {
          height: "1px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          width: "1px",
        });
        const closedDetails = document.createElement("details");
        const closedSummary = document.createElement("summary");
        closedSummary.textContent = "Closed disclosure";
        const closedControl = document.createElement("button");
        closedControl.textContent = "Hidden control";
        closedDetails.append(closedSummary, closedControl);
        fixture.append(visibleClipped, visuallyHidden, closedDetails);
        document.body.append(fixture);
        clippingDetectorRegression = {
          closedDetailsIgnored: !rendered(closedControl),
          visibleClippedDetected:
            rendered(visibleClipped) &&
            !knownVisuallyHidden(visibleClipped) &&
            unexpectedlyClipped(visibleClipped),
          visuallyHiddenIgnored:
            rendered(visuallyHidden) &&
            knownVisuallyHidden(visuallyHidden) &&
            unexpectedlyClipped(visuallyHidden),
        };
        fixture.remove();
      }
      const proportionalCandidates = Array.from(
        document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, p, a[href], button, input, select, textarea, [contenteditable='true'], [role='dialog'], [role='menu'], [role='alert'], [role='status']",
        ),
      )
        .filter(rendered)
        .filter(
          (element) =>
            !element.closest(
              "code, pre, kbd, samp, .font-mono, [data-ove208-font-probes]",
            ),
        );
      const expectedFamilies = new Set([
        family.toLocaleLowerCase("en"),
        `${family} 17pt`.toLocaleLowerCase("en"),
        `${family} 18pt`.toLocaleLowerCase("en"),
      ]);
      const proportionalFontMismatchCount = proportionalCandidates.filter(
        (element) => {
          const firstFamily = getComputedStyle(element)
            .fontFamily.split(",")[0]
            ?.trim()
            .replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2")
            .toLocaleLowerCase("en");
          return !firstFamily || !expectedFamilies.has(firstFamily);
        },
      ).length;
      const italicDemand = Array.from(document.querySelectorAll("body *"))
        .filter(rendered)
        .some((element) => {
          const style = getComputedStyle(element);
          return style.fontStyle === "italic" || style.fontStyle === "oblique";
        });

      return {
        clippedTextCount,
        clippingDetectorRegression,
        computedFontFamily: getComputedStyle(document.body).fontFamily,
        documentLang: document.documentElement.lang || null,
        horizontalOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth - viewportWidth,
        ),
        initialText: document.body.innerText,
        italicDemand,
        offscreenControlCount,
        proportionalFontMismatchCount,
      };
    },
    {
      family: expectedFamily,
      verifyClippingDetector: runClippingDetectorRegression,
    },
  );
}

function toFontRequestRecord(href: string): FontRequestRecord | null {
  try {
    const url = new URL(href);
    return { href: url.href, origin: url.origin, path: url.pathname };
  } catch {
    return null;
  }
}

function classifyFontRequests(input: {
  assetManifest: TypographyBrowserFontAsset[];
  baseOrigin: string;
  cssFaces: CssFontFaceDescriptor[];
  hrefs: Iterable<string>;
}): ClassifiedFontRequest[] {
  const assetsByPath = new Map(
    input.assetManifest.map((asset) => [asset.path, asset] as const),
  );
  return [...new Set(input.hrefs)].flatMap((href) => {
    const request = toFontRequestRecord(href);
    if (!request) return [];
    const asset = assetsByPath.get(request.path);
    const face = input.cssFaces.find((candidate) => {
      const parsed = toFontRequestRecord(candidate.sourceUrl);
      return parsed?.origin === request.origin && parsed.path === request.path;
    });
    return [
      {
        ...request,
        allowlisted: isTypographyBrowserFontUrlAllowed(
          request.href,
          input.baseOrigin,
        ),
        style: asset?.style ?? face?.style ?? null,
        subset: asset?.subset ?? inferSubset(face?.unicodeRange ?? ""),
        unicodeRange: face?.unicodeRange ?? null,
      },
    ];
  });
}

async function readFontPreloadHrefs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="font"]',
      ),
      (link) => link.href,
    ),
  );
}

function inferSubset(
  unicodeRange: string,
): TypographyBrowserFontAsset["subset"] | null {
  if (!unicodeRange) return null;
  if (
    unicodeRangeCoversText(
      unicodeRange,
      TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.latinExtended,
    )
  ) {
    return "latin-ext";
  }
  if (
    unicodeRangeCoversText(
      unicodeRange,
      TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.cyrillicExtended,
    )
  ) {
    return "cyrillic-ext";
  }
  if (unicodeRangeCoversText(unicodeRange, "Българска")) return "cyrillic";
  if (unicodeRangeCoversText(unicodeRange, "OverGarden")) return "latin";
  return null;
}

async function loadProbeFont(input: {
  family: string;
  page: Page;
  probeId: string;
  style: "normal" | "italic";
  text: string;
}): Promise<boolean> {
  return input.page.evaluate(
    async (probe) => {
      const container =
        document.querySelector<HTMLElement>("[data-ove208-font-probes]") ??
        (() => {
          const value = document.createElement("section");
          value.dataset.ove208FontProbes = "true";
          value.setAttribute("aria-hidden", "true");
          Object.assign(value.style, {
            contain: "layout paint style",
            height: "1px",
            left: "0",
            opacity: "0.01",
            overflow: "hidden",
            pointerEvents: "none",
            position: "fixed",
            top: "0",
            width: "300px",
            zIndex: "-1",
          });
          document.body.append(value);
          return value;
        })();
      const element = document.createElement("span");
      element.dataset.ove208FontProbeId = probe.probeId;
      element.lang = probe.probeId === "latin-ext" ? "en" : "uk";
      Object.assign(element.style, {
        display: "block",
        fontFamily: `"${probe.family}", sans-serif`,
        fontSize: "17px",
        fontStyle: probe.style,
        fontWeight: "400",
        lineHeight: "1.4",
        overflow: "visible",
        whiteSpace: "nowrap",
      });
      element.textContent = probe.text;
      container.append(element);
      const loaded = await document.fonts.load(
        `${probe.style} 400 17px "${probe.family}"`,
        probe.text,
      );
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const range = document.createRange();
      range.selectNodeContents(element);
      const elementRect = element.getBoundingClientRect();
      const textRect = range.getBoundingClientRect();
      const metricsFit =
        textRect.top >= elementRect.top - 2 &&
        textRect.bottom <= elementRect.bottom + 2;
      return loaded.length > 0 && metricsFit;
    },
    {
      family: input.family,
      probeId: input.probeId,
      style: input.style,
      text: input.text,
    },
  );
}

async function loadCorpus(page: Page, family: string): Promise<boolean> {
  return page.evaluate(
    async ({ corpus, familyName, weights }) => {
      const container =
        document.querySelector<HTMLElement>("[data-ove208-font-probes]") ??
        (() => {
          const value = document.createElement("section");
          value.dataset.ove208FontProbes = "true";
          value.setAttribute("aria-hidden", "true");
          Object.assign(value.style, {
            contain: "layout paint style",
            height: "1px",
            left: "0",
            opacity: "0.01",
            overflow: "hidden",
            pointerEvents: "none",
            position: "fixed",
            top: "0",
            width: "300px",
            zIndex: "-1",
          });
          document.body.append(value);
          return value;
        })();
      const loads: Promise<FontFace[]>[] = [];
      for (const sample of corpus) {
        for (const weight of weights) {
          const element = document.createElement("span");
          element.dataset.ove208FontProbeId = `${sample.id}-${weight}`;
          element.lang = sample.lang;
          Object.assign(element.style, {
            display: "block",
            fontFamily: `"${familyName}", sans-serif`,
            fontSize: "17px",
            fontStyle: "normal",
            fontWeight: String(weight),
            lineHeight: "1.4",
            overflow: "visible",
            whiteSpace: "nowrap",
          });
          element.textContent = sample.text;
          container.append(element);
          loads.push(
            document.fonts.load(
              `normal ${weight} 17px "${familyName}"`,
              sample.text,
            ),
          );
        }
      }
      const loaded = await Promise.all(loads);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return loaded.every((faces) => faces.length > 0);
    },
    {
      corpus: TYPOGRAPHY_GLYPH_CORPUS,
      familyName: family,
      weights: TYPOGRAPHY_PROBE_WEIGHTS,
    },
  );
}

async function loadSemanticMonoProbe(
  page: Page,
): Promise<
  Omit<
    NonNullable<BrowserCaseResult["corpus"]["semanticMono"]>,
    "platformFontProof"
  >
> {
  return page.evaluate(
    async ({ family, text }) => {
      const container =
        document.querySelector<HTMLElement>("[data-ove208-font-probes]") ??
        (() => {
          const value = document.createElement("section");
          value.dataset.ove208FontProbes = "true";
          value.setAttribute("aria-hidden", "true");
          Object.assign(value.style, {
            contain: "layout paint style",
            height: "1px",
            left: "0",
            opacity: "0.01",
            overflow: "hidden",
            pointerEvents: "none",
            position: "fixed",
            top: "0",
            width: "300px",
            zIndex: "-1",
          });
          document.body.append(value);
          return value;
        })();
      const element = document.createElement("code");
      element.className = "font-mono";
      element.dataset.ove208FontProbeId = "semantic-mono";
      Object.assign(element.style, {
        display: "block",
        fontSize: "17px",
        fontStyle: "normal",
        fontWeight: "400",
        lineHeight: "1.4",
        overflow: "visible",
        whiteSpace: "nowrap",
      });
      element.textContent = text;
      container.append(element);

      const loaded = await document.fonts.load(
        `normal 400 17px "${family}"`,
        text,
      );
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const range = document.createRange();
      range.selectNodeContents(element);
      const rootStyle = getComputedStyle(document.documentElement);
      let tokenDeclaration = "";
      const readTokenDeclaration = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          const style = (rule as CSSStyleRule).style;
          const candidate = style?.getPropertyValue("--font-mono").trim();
          if (candidate) tokenDeclaration = candidate;
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested) readTokenDeclaration(nested);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          readTokenDeclaration(sheet.cssRules);
        } catch {
          // The semantic token must be declared by an inspectable same-origin sheet.
        }
      }
      return {
        textPresent:
          element.textContent === text &&
          range.getBoundingClientRect().width > 0,
        classApplied: element.classList.contains("font-mono"),
        loaded: loaded.length > 0,
        computedFontFamily: getComputedStyle(element).fontFamily,
        tokenValue: tokenDeclaration,
        semanticStack: rootStyle
          .getPropertyValue("--font-overgarden-mono")
          .trim(),
      };
    },
    { family: GEIST_MONO_FAMILY, text: MONO_PROBE_TEXT },
  );
}

async function loadSemanticInheritanceProbe(page: Page, family: string) {
  return page.evaluate(
    ({ categories, expectedFamily }) => {
      const container = document.createElement("section");
      container.dataset.ove208SemanticInheritance = "true";
      container.setAttribute("aria-hidden", "true");
      Object.assign(container.style, {
        contain: "layout paint style",
        height: "1px",
        left: "0",
        opacity: "0.01",
        overflow: "hidden",
        pointerEvents: "none",
        position: "fixed",
        top: "0",
        width: "320px",
        zIndex: "-1",
      });

      const append = <Tag extends keyof HTMLElementTagNameMap>(
        tag: Tag,
        category: (typeof categories)[number],
        text: string,
      ) => {
        const element = document.createElement(tag);
        element.dataset.ove208SemanticCategory = category;
        element.textContent = text;
        container.append(element);
        return element;
      };
      append("h2", "heading", "OverGarden Україна");
      append("p", "journal-prose", "Българска градина");
      append("button", "button", "Зберегти");
      const input = append("input", "input", "");
      input.value = "OverGarden";
      const placeholder = append("input", "placeholder", "");
      placeholder.placeholder = "Назва рослини";
      const select = append("select", "select", "");
      const option = document.createElement("option");
      option.textContent = "Україна";
      select.append(option);
      const textarea = append("textarea", "textarea", "Нотатка");
      textarea.value = "Нотатка";
      const editable = append("div", "contenteditable", "Редактор");
      editable.contentEditable = "true";
      const dialog = append("dialog", "dialog", "Діалог");
      dialog.setAttribute("open", "");
      const popover = append("div", "popover", "Підказка");
      popover.setAttribute("popover", "manual");
      const toast = append("div", "toast", "Збережено");
      toast.setAttribute("role", "status");
      const portal = append("div", "portal", "Портал");
      portal.dataset.portal = "true";
      document.body.append(container);
      const showPopover = (
        popover as HTMLElement & {
          showPopover?: () => void;
        }
      ).showPopover;
      if (showPopover) showPopover.call(popover);

      const expected = new Set([
        expectedFamily.toLocaleLowerCase("en"),
        `${expectedFamily} 17pt`.toLocaleLowerCase("en"),
        `${expectedFamily} 18pt`.toLocaleLowerCase("en"),
      ]);
      const firstFamily = (value: string) =>
        value
          .split(",")[0]
          ?.trim()
          .replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2")
          .toLocaleLowerCase("en") ?? "";
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-ove208-semantic-category]",
        ),
      );
      const categorySet = new Set(
        elements.map((element) => element.dataset.ove208SemanticCategory),
      );
      const fontMismatchCount = elements.filter((element) => {
        const category = element.dataset.ove208SemanticCategory;
        const style =
          category === "placeholder"
            ? getComputedStyle(element, "::placeholder")
            : getComputedStyle(element);
        return !expected.has(firstFamily(style.fontFamily));
      }).length;

      return {
        categoryCount: categories.filter((category) =>
          categorySet.has(category),
        ).length,
        fontMismatchCount,
      };
    },
    {
      categories: TYPOGRAPHY_SEMANTIC_PROBE_CATEGORIES,
      expectedFamily: family,
    },
  );
}

async function chromiumPlatformFontProof(input: {
  client: CDPSession;
  expectedFamily: string;
  page: Page;
  selectors: string[];
}): Promise<boolean> {
  await input.page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);
  const selectorsReady = await input.page
    .waitForFunction(
      (selectors) =>
        selectors.every((selector) => document.querySelector(selector)),
      input.selectors,
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!selectorsReady) return false;
  await input.page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await input.client.send("DOM.enable");
  await input.client.send("CSS.enable");
  const documentResult = (await input.client.send("DOM.getDocument", {
    depth: 0,
  })) as { root: { nodeId: number } };
  for (const selector of input.selectors) {
    const selected = (await input.client.send("DOM.querySelector", {
      nodeId: documentResult.root.nodeId,
      selector,
    })) as { nodeId: number };
    if (!selected.nodeId) return false;
    const result = (await input.client.send("CSS.getPlatformFontsForNode", {
      nodeId: selected.nodeId,
    })) as {
      fonts: Array<{
        familyName: string;
        glyphCount: number;
        isCustomFont: boolean;
      }>;
    };
    if (
      result.fonts.length === 0 ||
      result.fonts.some(
        (font) =>
          !font.isCustomFont ||
          font.glyphCount < 1 ||
          !isExpectedGoogleSansFamily(font.familyName, input.expectedFamily),
      )
    ) {
      return false;
    }
  }
  return true;
}

async function runBrowserCase(input: {
  assetManifest: TypographyBrowserFontAsset[];
  baseUrl: URL;
  browser: Browser;
  browserName: TypographyBrowserName;
  expectedFamily: string;
  route: TypographyBrowserRoute;
  screenshotDir: string | null;
  viewport: TypographyBrowserViewport;
}): Promise<BrowserCaseResult> {
  const context = await input.browser.newContext({
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    viewport: { width: input.viewport.width, height: input.viewport.height },
  });
  await installEvaluationRuntime(context);
  await installLocaleContext(context, input.baseUrl, input.route.locale);
  const page = await context.newPage();
  const routeUrl = resolveRouteUrl(input.baseUrl, input.route.target);
  const fontRequestHrefs = new Set<string>();
  let googleRuntimeRequestCount = 0;
  let fontRequestFailureCount = 0;
  let pageErrorCount = 0;
  let consoleErrorCount = 0;
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });
  page.on("console", (message) => {
    const expectedNavigationDiagnostic = isExpectedMainDocumentStatusConsole({
      browserName: input.browserName,
      expectedStatus: input.route.expectedStatus,
      message,
      url: routeUrl,
    });
    if (
      (message.type() === "error" && !expectedNavigationDiagnostic) ||
      (message.type() === "warning" &&
        FONT_CONSOLE_WARNING_PATTERN.test(message.text()))
    ) {
      consoleErrorCount += 1;
      debugBrowserConsole(
        `${input.browserName}:${input.route.id}:${input.viewport.id}`,
        message,
      );
    }
  });
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (GOOGLE_FONT_HOSTS.has(url.hostname)) googleRuntimeRequestCount += 1;
      if (
        request.resourceType() === "font" ||
        FONT_URL_PATTERN.test(url.href)
      ) {
        fontRequestHrefs.add(url.href);
      }
    } catch {
      // An invalid request URL cannot satisfy a same-origin font contract.
    }
  });
  page.on("requestfailed", (request) => {
    try {
      if (
        request.resourceType() === "font" ||
        FONT_URL_PATTERN.test(new URL(request.url()).href)
      ) {
        fontRequestFailureCount += 1;
      }
    } catch {
      fontRequestFailureCount += 1;
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    try {
      if (
        !response.ok() &&
        (request.resourceType() === "font" ||
          FONT_URL_PATTERN.test(new URL(request.url()).href))
      ) {
        fontRequestFailureCount += 1;
      }
    } catch {
      fontRequestFailureCount += 1;
    }
  });
  let client: CDPSession | null = null;
  if (input.browserName === "chromium") {
    client = await context.newCDPSession(page);
  }

  try {
    const response = await page.goto(routeUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (input.viewport.rootFontPercent === 200) {
      await page.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
    }
    const fontsReady = await waitForFonts(page);
    const loadedFaceCount = await page.evaluate(
      async ({ family, text }) => {
        const faces = await document.fonts.load(
          `normal 400 17px "${family}"`,
          text,
        );
        await document.fonts.ready;
        return faces.length;
      },
      { family: input.expectedFamily, text: "OverGarden Україна" },
    );
    const probeRequired =
      input.route.id === "bg-home" && input.viewport.id === "mobile-390";
    const structure = await readPageStructure(
      page,
      input.expectedFamily,
      probeRequired,
    );
    const cssFaces = await readCssFontFaces(page);
    const initialFontHrefs = new Set(fontRequestHrefs);
    const initialRequests = classifyFontRequests({
      assetManifest: input.assetManifest,
      baseOrigin: input.baseUrl.origin,
      cssFaces,
      hrefs: initialFontHrefs,
    });
    const initialItalicFontRequestCount = initialRequests.filter(
      ({ style }) => style === "italic" || style?.startsWith("oblique"),
    ).length;
    const initialLatinExtFontRequestCount = initialRequests.filter(
      ({ subset, unicodeRange }) =>
        subset === "latin-ext" ||
        (unicodeRange !== null &&
          unicodeRangeCoversText(
            unicodeRange,
            TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.latinExtended,
          )),
    ).length;
    const initialCyrillicExtFontRequestCount = initialRequests.filter(
      ({ subset, unicodeRange }) =>
        subset === "cyrillic-ext" ||
        (unicodeRange !== null &&
          unicodeRangeCoversText(
            unicodeRange,
            TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.cyrillicExtended,
          )),
    ).length;

    let probe: TypographyBrowserObservation["probe"] = null;
    let semanticMono: BrowserCaseResult["corpus"]["semanticMono"] = null;
    let semanticInheritance: BrowserCaseResult["corpus"]["semanticInheritance"] =
      null;
    if (probeRequired) {
      const beforeLatinExt = new Set(fontRequestHrefs);
      const latinExtLoaded = await loadProbeFont({
        family: input.expectedFamily,
        page,
        probeId: "latin-ext",
        style: "normal",
        text: TYPOGRAPHY_LAZY_PROBES.latinExtended,
      });
      const afterLatinExt = classifyFontRequests({
        assetManifest: input.assetManifest,
        baseOrigin: input.baseUrl.origin,
        cssFaces,
        hrefs: difference(fontRequestHrefs, beforeLatinExt),
      });

      const beforeCyrillicExt = new Set(fontRequestHrefs);
      const cyrillicExtLoaded = await loadProbeFont({
        family: input.expectedFamily,
        page,
        probeId: "cyrillic-ext",
        style: "normal",
        text: TYPOGRAPHY_LAZY_PROBES.cyrillicExtended,
      });
      const afterCyrillicExt = classifyFontRequests({
        assetManifest: input.assetManifest,
        baseOrigin: input.baseUrl.origin,
        cssFaces,
        hrefs: difference(fontRequestHrefs, beforeCyrillicExt),
      });

      const beforeItalic = new Set(fontRequestHrefs);
      const italicLoaded = await loadProbeFont({
        family: input.expectedFamily,
        page,
        probeId: "italic",
        style: "italic",
        text: TYPOGRAPHY_LAZY_PROBES.italic,
      });
      const afterItalic = classifyFontRequests({
        assetManifest: input.assetManifest,
        baseOrigin: input.baseUrl.origin,
        cssFaces,
        hrefs: difference(fontRequestHrefs, beforeItalic),
      });
      const corpusLoaded = await loadCorpus(page, input.expectedFamily);
      const monoProbe = await loadSemanticMonoProbe(page);
      const semanticProbe = await loadSemanticInheritanceProbe(
        page,
        input.expectedFamily,
      );
      semanticMono = {
        ...monoProbe,
        platformFontProof: "not-applicable",
      };
      semanticInheritance = semanticProbe;

      probe = {
        corpusLoaded,
        italicLoaded,
        italicNewRequestCount: afterItalic.filter(
          ({ style }) => style === "italic" || style?.startsWith("oblique"),
        ).length,
        latinExtLoaded,
        latinExtNewRequestCount: afterLatinExt.filter(
          ({ subset, unicodeRange }) =>
            subset === "latin-ext" ||
            (unicodeRange !== null &&
              unicodeRangeCoversText(
                unicodeRange,
                TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.latinExtended,
              )),
        ).length,
        cyrillicExtLoaded,
        cyrillicExtNewRequestCount: afterCyrillicExt.filter(
          ({ subset, unicodeRange }) =>
            subset === "cyrillic-ext" ||
            (unicodeRange !== null &&
              unicodeRangeCoversText(
                unicodeRange,
                TYPOGRAPHY_EXTENDED_SUBSET_MARKERS.cyrillicExtended,
              )),
        ).length,
        monoTextPresent: monoProbe.textPresent,
        monoClassApplied: monoProbe.classApplied,
        monoLoaded: monoProbe.loaded,
        monoComputedFontFamily: monoProbe.computedFontFamily,
        monoTokenValue: monoProbe.tokenValue,
        monoSemanticStack: monoProbe.semanticStack,
        monoPlatformFontProof: "not-applicable",
        semanticCategoryCount: semanticProbe.categoryCount,
        semanticFontMismatchCount: semanticProbe.fontMismatchCount,
      };
    }

    let platformFontProof: TypographyBrowserObservation["platformFontProof"] =
      "not-applicable";
    if (client && input.viewport.id === "mobile-390") {
      const selectors = probeRequired
        ? [
            ...TYPOGRAPHY_GLYPH_CORPUS.flatMap(({ id }) =>
              TYPOGRAPHY_PROBE_WEIGHTS.map(
                (weight) => `[data-ove208-font-probe-id="${id}-${weight}"]`,
              ),
            ),
            '[data-ove208-font-probe-id="italic"]',
            ...[
              "heading",
              "journal-prose",
              "button",
              "contenteditable",
              "dialog",
              "popover",
              "toast",
              "portal",
            ].map(
              (category) => `[data-ove208-semantic-category="${category}"]`,
            ),
          ]
        : ["h1"];
      platformFontProof = (await chromiumPlatformFontProof({
        client,
        expectedFamily: input.expectedFamily,
        page,
        selectors,
      }))
        ? "passed"
        : "failed";
    }
    if (client && semanticMono && probe) {
      const monoPlatformFontProof = (await chromiumPlatformFontProof({
        client,
        expectedFamily: GEIST_MONO_FAMILY,
        page,
        selectors: ['[data-ove208-font-probe-id="semantic-mono"]'],
      }))
        ? "passed"
        : "failed";
      semanticMono.platformFontProof = monoPlatformFontProof;
      probe.monoPlatformFontProof = monoPlatformFontProof;
    }

    const allRequests = classifyFontRequests({
      assetManifest: input.assetManifest,
      baseOrigin: input.baseUrl.origin,
      cssFaces,
      hrefs: fontRequestHrefs,
    });
    const fontPreloadHrefs = await readFontPreloadHrefs(page);
    const requestUrlInspection = inspectTypographyBrowserFontUrls(
      allRequests.map(({ href }) => href),
      input.baseUrl.origin,
    );
    const invalidFontUrls = new Set([
      ...allRequests
        .filter(({ allowlisted }) => !allowlisted)
        .map(({ href }) => href),
      ...cssFaces
        .map(({ sourceUrl }) => sourceUrl)
        .filter(
          (href) =>
            !isTypographyBrowserFontUrlAllowed(href, input.baseUrl.origin),
        ),
      ...fontPreloadHrefs.filter(
        (href) =>
          !isTypographyBrowserFontUrlAllowed(href, input.baseUrl.origin),
      ),
    ]);
    const observation: TypographyBrowserObservation = {
      routeId: input.route.id,
      surface: input.route.surface,
      locale: input.route.locale,
      expectedStatus: input.route.expectedStatus,
      actualStatus: response?.status() ?? 0,
      documentLang: structure.documentLang,
      fontsReady,
      loadedFaceCount,
      computedFontFamily: structure.computedFontFamily,
      horizontalOverflowPx: structure.horizontalOverflowPx,
      offscreenControlCount: structure.offscreenControlCount,
      clippedTextCount: structure.clippedTextCount,
      proportionalFontMismatchCount: structure.proportionalFontMismatchCount,
      pageErrorCount,
      consoleErrorCount,
      fontRequestCount: initialRequests.length,
      crossOriginFontRequestCount:
        requestUrlInspection.crossOriginFontRequestCount,
      googleRuntimeRequestCount,
      unclassifiedFontRequestCount: invalidFontUrls.size,
      fontRequestFailureCount,
      initialItalicDemand: structure.italicDemand,
      initialItalicFontRequestCount,
      initialLatinExtDemand: textRequiresLatinExtended(structure.initialText),
      initialLatinExtFontRequestCount,
      initialCyrillicExtDemand: textRequiresCyrillicExtended(
        structure.initialText,
      ),
      initialCyrillicExtFontRequestCount,
      probeRequired,
      probe,
      platformFontProof,
    };
    const failures = evaluateTypographyBrowserObservation(
      observation,
      input.expectedFamily,
    );
    if (
      probeRequired &&
      (!structure.clippingDetectorRegression?.closedDetailsIgnored ||
        !structure.clippingDetectorRegression.visibleClippedDetected ||
        !structure.clippingDetectorRegression.visuallyHiddenIgnored)
    ) {
      failures.push("clipping-detector-regression");
    }
    const shouldCaptureScreenshot =
      input.screenshotDir !== null && shouldCaptureBrowserCaseScreenshot(input);
    if (shouldCaptureScreenshot) {
      await cleanupTypographyProbes(page);
      await settleScreenshotLayout(page, input.expectedFamily);
    }
    const screenshotFilename =
      input.screenshotDir && shouldCaptureScreenshot
        ? await captureScreenshot({
            directory: input.screenshotDir,
            filename: `ove208-${input.route.id}-${input.route.locale}-${input.viewport.id}.png`,
            page,
          })
        : null;
    return {
      browser: input.browserName,
      routeId: input.route.id,
      surface: input.route.surface,
      locale: input.route.locale,
      viewportId: input.viewport.id,
      expectedStatus: input.route.expectedStatus,
      actualStatus: observation.actualStatus,
      documentLang: observation.documentLang,
      computedFontFamily: observation.computedFontFamily,
      fontsReady,
      loadedFaceCount,
      layout: {
        horizontalOverflowPx: observation.horizontalOverflowPx,
        offscreenControlCount: observation.offscreenControlCount,
        clippedTextCount: observation.clippedTextCount,
        proportionalFontMismatchCount:
          observation.proportionalFontMismatchCount,
        clippingDetectorRegression: structure.clippingDetectorRegression,
      },
      runtime: {
        pageErrorCount,
        consoleErrorCount,
        fontRequestCount: observation.fontRequestCount,
        crossOriginFontRequestCount: observation.crossOriginFontRequestCount,
        googleRuntimeRequestCount,
        unclassifiedFontRequestCount: observation.unclassifiedFontRequestCount,
        fontRequestFailureCount,
      },
      lazyLoading: {
        initialItalicDemand: observation.initialItalicDemand,
        initialItalicFontRequestCount,
        initialLatinExtDemand: observation.initialLatinExtDemand,
        initialLatinExtFontRequestCount,
        initialCyrillicExtDemand: observation.initialCyrillicExtDemand,
        initialCyrillicExtFontRequestCount,
        probeRun: probeRequired,
        italicNewRequestCount: probe?.italicNewRequestCount ?? null,
        latinExtNewRequestCount: probe?.latinExtNewRequestCount ?? null,
        cyrillicExtNewRequestCount: probe?.cyrillicExtNewRequestCount ?? null,
      },
      corpus: {
        loaded: probe?.corpusLoaded ?? null,
        platformFontProof,
        semanticMono,
        semanticInheritance,
      },
      sameOriginFontPaths: [
        ...new Set(
          allRequests
            .filter(({ origin }) => origin === input.baseUrl.origin)
            .map(({ path: requestPath }) => requestPath),
        ),
      ].sort(),
      screenshotFilename,
      failures,
    };
  } finally {
    await context.close();
  }
}

async function installFallbackPerformanceObservers(context: BrowserContext) {
  await context.addInitScript(() => {
    type FallbackPerformanceState = {
      cls: number;
      clsSources: Array<{ selector: string; value: number; text: string }>;
      domContentLoadedMs: number;
      fcpMs: number;
      layoutShiftObserver: PerformanceObserver | null;
      paintObserver: PerformanceObserver | null;
      visibleMeaningfulTextMs: number;
    };
    const target = window as typeof window & {
      __ove208TypographyFallback?: FallbackPerformanceState;
    };
    const state: FallbackPerformanceState = {
      cls: 0,
      clsSources: [],
      domContentLoadedMs: 0,
      fcpMs: 0,
      layoutShiftObserver: null,
      paintObserver: null,
      visibleMeaningfulTextMs: 0,
    };
    target.__ove208TypographyFallback = state;

    const recordVisibleMeaningfulText = () => {
      if (state.visibleMeaningfulTextMs > 0) return true;
      const visibleText = Array.from(
        document.querySelectorAll<HTMLElement>(
          "main h1, main h2, main p, main a, main button, h1, h2, p",
        ),
      ).some((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          element.innerText.replaceAll(/\s+/gu, " ").trim().length >= 4 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      if (visibleText) state.visibleMeaningfulTextMs = performance.now();
      return visibleText;
    };

    document.addEventListener(
      "DOMContentLoaded",
      () => {
        state.domContentLoadedMs = performance.now();
        const deadlineMs = state.domContentLoadedMs + 1_500;
        const observeVisibility = () => {
          if (
            recordVisibleMeaningfulText() ||
            performance.now() >= deadlineMs
          ) {
            return;
          }
          // A paused font request can throttle the first animation frame in
          // headless WebKit even when server-rendered fallback text is already
          // painted. Keep the proof on the browser timeline, but sample it
          // immediately at DCL and then with a bounded timer instead of losing
          // the visibility timestamp to engine-specific RAF scheduling.
          setTimeout(observeVisibility, 20);
        };
        observeVisibility();
      },
      { once: true },
    );

    try {
      state.paintObserver = new PerformanceObserver((list) => {
        const fcp = list
          .getEntries()
          .find((entry) => entry.name === "first-contentful-paint");
        if (fcp && state.fcpMs === 0) state.fcpMs = fcp.startTime;
      });
      state.paintObserver.observe({ type: "paint", buffered: true });
    } catch {
      // The pure contract will report a bounded FCP failure if unsupported.
    }

    try {
      state.layoutShiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
            sources?: Array<{ node?: Node | null }>;
          };
          if (!shift.hadRecentInput && typeof shift.value === "number") {
            state.cls += shift.value;
            // Attribute the shift so a failing gate names the moving element
            // instead of reporting only a number.
            for (const source of shift.sources ?? []) {
              const node = source.node as Element | null | undefined;
              if (!node || typeof node.tagName !== "string") continue;
              const id = node.id ? `#${node.id}` : "";
              const cls =
                typeof node.className === "string" && node.className
                  ? `.${node.className.trim().split(/\s+/u).slice(0, 3).join(".")}`
                  : "";
              state.clsSources.push({
                selector: `${node.tagName.toLowerCase()}${id}${cls}`,
                value: shift.value,
                text: (node.textContent ?? "").trim().slice(0, 60),
              });
            }
          }
        }
      });
      state.layoutShiftObserver.observe({
        type: "layout-shift",
        buffered: true,
      });
    } catch {
      // Unsupported Layout Instability APIs leave the deterministic value at 0.
    }
  });
}

/**
 * Runs one fallback case and repeats it only while every failure it produced is
 * scheduler-sensitive, up to FALLBACK_CASE_MAX_ATTEMPTS. The declared budgets
 * are untouched: this proves a budget is missed consistently rather than once,
 * and every attempt is kept in the receipt so no measurement disappears.
 */
async function runFallbackCaseWithSchedulerRetry(input: {
  baseUrl: URL;
  browser: Browser;
  browserName: TypographyBrowserName;
  expectedFamily: string;
  route: TypographyBrowserRoute;
}): Promise<FallbackCaseResult> {
  const attemptFailures: string[][] = [];
  let result: FallbackCaseResult | undefined;
  while (shouldAttemptFallbackCaseAgain(attemptFailures)) {
    result = await runFallbackCase(input);
    attemptFailures.push([...result.failures]);
  }
  // shouldAttemptFallbackCaseAgain returns true on an empty list, so the loop
  // always runs at least once and result is assigned before this point.
  return { ...(result as FallbackCaseResult), attemptFailures };
}

async function runFallbackCase(input: {
  baseUrl: URL;
  browser: Browser;
  browserName: TypographyBrowserName;
  expectedFamily: string;
  route: TypographyBrowserRoute;
}): Promise<FallbackCaseResult> {
  const context = await input.browser.newContext({
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  await installEvaluationRuntime(context);
  await installLocaleContext(context, input.baseUrl, "bg");
  await installFallbackPerformanceObservers(context);
  const page = await context.newPage();
  let pageErrorCount = 0;
  let consoleErrorCount = 0;
  let blockedFontRequestCount = 0;
  let firstBlockedBrowserTimelineMs: number | null = null;
  let releaseBrowserTimelineMs: number | null = null;
  let released = false;
  let signalFirstBlocked: () => void = () => undefined;
  const firstBlocked = new Promise<void>((resolve) => {
    signalFirstBlocked = resolve;
  });
  let releaseBlockedRequests: () => void = () => undefined;
  const releaseGate = new Promise<void>((resolve) => {
    releaseBlockedRequests = () => {
      if (released) return;
      released = true;
      resolve();
    };
  });
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      (message.type() === "warning" &&
        FONT_CONSOLE_WARNING_PATTERN.test(message.text()))
    ) {
      consoleErrorCount += 1;
      debugBrowserConsole(`${input.browserName}:fallback`, message);
    }
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    let isFontRequest = request.resourceType() === "font";
    if (!isFontRequest) {
      try {
        isFontRequest = FONT_URL_PATTERN.test(new URL(request.url()).href);
      } catch {
        isFontRequest = false;
      }
    }
    if (!isFontRequest) {
      await route.continue();
      return;
    }
    blockedFontRequestCount += 1;
    if (firstBlockedBrowserTimelineMs === null) {
      firstBlockedBrowserTimelineMs = await page
        .evaluate(() => performance.now())
        .catch(() => null);
      signalFirstBlocked();
    }
    await releaseGate;
    await route.continue().catch(() => undefined);
  });

  const sample =
    TYPOGRAPHY_GLYPH_CORPUS.find(({ id }) => id === "bg")?.text ??
    "Българска градина";

  try {
    const response = await page.goto(
      resolveRouteUrl(input.baseUrl, input.route.target).href,
      { waitUntil: "domcontentloaded", timeout: 45_000 },
    );
    await page
      .waitForFunction(
        () => {
          type FallbackPerformanceState = {
            fcpMs: number;
            visibleMeaningfulTextMs: number;
          };
          const state = (
            window as typeof window & {
              __ove208TypographyFallback?: FallbackPerformanceState;
            }
          ).__ove208TypographyFallback;
          const fcpMs =
            state?.fcpMs ??
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ??
            0;
          return (state?.visibleMeaningfulTextMs ?? 0) > 0 && fcpMs > 0;
        },
        undefined,
        {
          polling: 20,
          timeout: 1_500,
        },
      )
      .catch(() => undefined);
    await page.evaluate(
      ({ sampleText, targetFamily }) => {
        type TargetFontProbe = {
          facesLength: number;
          settled: boolean;
        };
        const target = window as typeof window & {
          __ove208TargetFontProbe?: TargetFontProbe;
        };
        // Start the target-face probe without awaiting it. Its settlement is
        // observed below before release, so a paused resource proves the
        // target is unavailable without a WebKit-throttled diagnostic timer.
        target.__ove208TargetFontProbe = { facesLength: 0, settled: false };
        void document.fonts
          .load(`normal 400 17px "${targetFamily}"`, sampleText)
          .then((faces) => {
            target.__ove208TargetFontProbe = {
              facesLength: faces.length,
              settled: true,
            };
          })
          .catch(() => {
            target.__ove208TargetFontProbe = { facesLength: 0, settled: true };
          });
      },
      { sampleText: sample, targetFamily: input.expectedFamily },
    );
    const beforeRelease = await page.evaluate(
      async ({ fallbackFamily, sampleText }) => {
        type FallbackPerformanceState = {
          cls: number;
          domContentLoadedMs: number;
          fcpMs: number;
          visibleMeaningfulTextMs: number;
        };
        type TargetFontProbe = {
          facesLength: number;
          settled: boolean;
        };
        const state = (
          window as typeof window & {
            __ove208TypographyFallback?: FallbackPerformanceState;
          }
        ).__ove208TypographyFallback;
        const targetProbe = (
          window as typeof window & {
            __ove208TargetFontProbe?: TargetFontProbe;
          }
        ).__ove208TargetFontProbe;
        const visibleMeaningfulText = Array.from(
          document.querySelectorAll<HTMLElement>(
            "main h1, main h2, main p, main a, main button, h1, h2, p",
          ),
        ).some((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            element.innerText.replaceAll(/\s+/gu, " ").trim().length >= 4 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
        const observedFcp =
          state?.fcpMs ??
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ??
          0;
        const targetFontAvailableBeforeRelease =
          targetProbe?.settled === true && targetProbe.facesLength > 0;
        const computedFontStack = getComputedStyle(document.body).fontFamily;
        const orderedFallbackFamily =
          computedFontStack.split(",")[1]?.replaceAll(/["']/gu, "").trim() ??
          "";
        return {
          visibleMeaningfulText,
          firstContentfulPaintMs: observedFcp,
          visibleAfterDomContentLoadedMs:
            (state?.domContentLoadedMs ?? 0) > 0 &&
            (state?.visibleMeaningfulTextMs ?? 0) > 0
              ? (state?.visibleMeaningfulTextMs ?? 0) -
                (state?.domContentLoadedMs ?? 0)
              : -1,
          targetFontUnavailableBeforeRelease: !targetFontAvailableBeforeRelease,
          fallbackFontAvailableBeforeRelease:
            document.fonts.check(
              `normal 400 17px "${fallbackFamily}"`,
              sampleText,
            ) ||
            (visibleMeaningfulText &&
              !targetFontAvailableBeforeRelease &&
              orderedFallbackFamily === fallbackFamily),
          // Raw resolution signal. The combined flag above is OR'd with a
          // weaker heuristic, so it cannot prove the local() face resolved.
          fallbackFaceResolved: document.fonts.check(
            `normal 400 17px "${fallbackFamily}"`,
            sampleText,
          ),
          fallbackSampleWidthPx: (() => {
            const measure = (family: string) => {
              const probe = document.createElement("span");
              probe.style.cssText =
                "position:absolute;visibility:hidden;white-space:pre;font:normal 400 17px " +
                family;
              probe.textContent = sampleText;
              document.body.append(probe);
              const width = probe.getBoundingClientRect().width;
              probe.remove();
              return width;
            };
            return {
              fallback: measure(`"${fallbackFamily}"`),
              missingControl: measure('"OveMissingFontControl"'),
              // Which local font the face actually resolved to. Engines pick
              // differently, and a mismatch here explains a shift that no
              // metric change can move.
              arial: measure('"Arial"'),
              liberationSans: measure('"Liberation Sans"'),
              arimo: measure('"Arimo"'),
              dejaVuSans: measure('"DejaVu Sans"'),
            };
          })(),
          computedFontStack,
          clsBeforeRelease: state?.cls ?? 0,
        };
      },
      {
        fallbackFamily: GOOGLE_SANS_FALLBACK_FAMILY,
        sampleText: sample,
      },
    );

    if (firstBlockedBrowserTimelineMs === null) {
      await Promise.race([
        firstBlocked,
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
      ]);
    }
    if (firstBlockedBrowserTimelineMs !== null) {
      // Wait on the page's own clock: the proof and release boundary must use
      // one timeline. Controller wall-clock time can run ahead or behind in
      // Firefox/WebKit under CI load and falsely shorten the blocked window.
      await page
        .waitForFunction(
          ({ blockedAtMs, delayMs }) =>
            performance.now() >= blockedAtMs + delayMs,
          {
            blockedAtMs: firstBlockedBrowserTimelineMs,
            delayMs: FALLBACK_DELAY_MS,
          },
          {
            // Headless WebKit may throttle requestAnimationFrame while a font
            // request is paused. A bounded timer poll keeps release aligned to
            // the browser timeline instead of adding an engine-dependent RAF
            // delay to the deliberately fixed 600 ms test window.
            polling: 20,
            timeout: FALLBACK_DELAY_MS + 2_000,
          },
        )
        .catch(() => undefined);
    }
    releaseBrowserTimelineMs = await page
      .evaluate(() => performance.now())
      .catch(() => null);
    releaseBlockedRequests();
    const fontsReady = await waitForFonts(page);
    const afterRelease = await page.evaluate(
      async ({ sampleText, targetFamily }) => {
        type FallbackPerformanceState = {
          cls: number;
          clsSources: Array<{ selector: string; value: number; text: string }>;
          domContentLoadedMs: number;
          fcpMs: number;
          layoutShiftObserver: PerformanceObserver | null;
          paintObserver: PerformanceObserver | null;
          visibleMeaningfulTextMs: number;
        };
        await document.fonts.load(
          `normal 400 17px "${targetFamily}"`,
          sampleText,
        );
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const state = (
          window as typeof window & {
            __ove208TypographyFallback?: FallbackPerformanceState;
          }
        ).__ove208TypographyFallback;
        const firstContentfulPaintMs =
          state?.fcpMs ??
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ??
          0;
        const fontResourceDurationsMs = performance
          .getEntriesByType("resource")
          .filter((entry) =>
            /\.(?:woff2?|ttf|otf)(?:$|[?#])/iu.test(entry.name),
          )
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return resource.responseEnd - resource.startTime;
          });
        const result = {
          targetFontAvailableAfterRelease: document.fonts.check(
            `normal 400 17px "${targetFamily}"`,
            sampleText,
          ),
          convergedFontFamily: getComputedStyle(document.body).fontFamily,
          fontWindowCls: state?.cls ?? 0,
          clsSources: state?.clsSources ?? [],
          fallbackDurationMs:
            firstContentfulPaintMs > 0
              ? performance.now() - firstContentfulPaintMs
              : 0,
          blockedFontResourceTimingCount: fontResourceDurationsMs.length,
        };
        state?.paintObserver?.disconnect();
        state?.layoutShiftObserver?.disconnect();
        return result;
      },
      { sampleText: sample, targetFamily: input.expectedFamily },
    );
    const observation: TypographyFallbackObservation = {
      visibleMeaningfulText: beforeRelease.visibleMeaningfulText,
      firstContentfulPaintMs: beforeRelease.firstContentfulPaintMs,
      visibleAfterDomContentLoadedMs:
        beforeRelease.visibleAfterDomContentLoadedMs,
      targetFontUnavailableBeforeRelease:
        beforeRelease.targetFontUnavailableBeforeRelease,
      fallbackFontAvailableBeforeRelease:
        beforeRelease.fallbackFontAvailableBeforeRelease,
      computedFallbackFamily:
        computedFontFamilies(beforeRelease.computedFontStack)[1] ?? "",
      blockedFontRequestCount,
      blockedFontResourceTimingCount:
        afterRelease.blockedFontResourceTimingCount,
      configuredDelayMs: FALLBACK_DELAY_MS,
      blockedDurationMs:
        firstBlockedBrowserTimelineMs !== null &&
        releaseBrowserTimelineMs !== null
          ? releaseBrowserTimelineMs - firstBlockedBrowserTimelineMs
          : 0,
      fallbackDurationMs: afterRelease.fallbackDurationMs,
      targetFontAvailableAfterRelease:
        afterRelease.targetFontAvailableAfterRelease,
      convergedFontFamily: afterRelease.convergedFontFamily,
      fontsReady,
      fontWindowCls: Math.max(
        0,
        afterRelease.fontWindowCls - beforeRelease.clsBeforeRelease,
      ),
      pageErrorCount,
      consoleErrorCount,
    };
    const evaluated = evaluateTypographyFallbackObservation(observation, {
      expectedFamily: input.expectedFamily,
      expectedFallbackFamily: GOOGLE_SANS_FALLBACK_FAMILY,
    });
    const failures = [...evaluated];
    if (response?.status() !== 200) failures.unshift("fallback-http-status");
    return {
      browser: input.browserName,
      routeId: FALLBACK_ROUTE_ID,
      viewportId: "mobile-390",
      actualStatus: response?.status() ?? null,
      visibleMeaningfulText: observation.visibleMeaningfulText,
      firstContentfulPaintMs: observation.firstContentfulPaintMs,
      visibleAfterDomContentLoadedMs:
        observation.visibleAfterDomContentLoadedMs,
      targetFontUnavailableBeforeRelease:
        observation.targetFontUnavailableBeforeRelease,
      fallbackFontAvailableBeforeRelease:
        observation.fallbackFontAvailableBeforeRelease,
      computedFallbackFamily: observation.computedFallbackFamily,
      blockedFontRequestCount,
      blockedFontResourceTimingCount:
        observation.blockedFontResourceTimingCount,
      configuredDelayMs: FALLBACK_DELAY_MS,
      blockedDurationMs: observation.blockedDurationMs,
      fallbackDurationMs: observation.fallbackDurationMs,
      targetFontAvailableAfterRelease:
        observation.targetFontAvailableAfterRelease,
      convergedFontFamily: observation.convergedFontFamily,
      fontsReady,
      fontWindowCls: observation.fontWindowCls,
      fallbackFaceResolved: beforeRelease.fallbackFaceResolved,
      fallbackSampleWidthPx: beforeRelease.fallbackSampleWidthPx,
      // Largest contributors first, so a failing gate names what moved.
      clsSources: [...afterRelease.clsSources]
        .sort((left, right) => right.value - left.value)
        .slice(0, 5),
      runtime: { pageErrorCount, consoleErrorCount },
      failures,
    };
  } finally {
    releaseBlockedRequests();
    await context.close();
  }
}

async function runGlobalErrorCase(input: {
  assetManifest: TypographyBrowserFontAsset[];
  baseUrl: URL;
  browser: Browser;
  browserName: TypographyBrowserName;
  expectedFamily: string;
  screenshotDir: string | null;
  viewport: {
    id: "mobile-390" | "desktop-1440";
    width: number;
    height: number;
  };
}): Promise<GlobalErrorCaseResult> {
  const context = await input.browser.newContext({
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    viewport: { width: input.viewport.width, height: input.viewport.height },
  });
  await installEvaluationRuntime(context);
  await installLocaleContext(context, input.baseUrl, "uk");
  const page = await context.newPage();
  const globalErrorUrl = new URL(
    "/garden?visualLocaleState=global-error",
    input.baseUrl,
  );
  const client =
    input.browserName === "chromium" ? await context.newCDPSession(page) : null;
  const fontRequestHrefs = new Set<string>();
  let googleRuntimeRequestCount = 0;
  let fontRequestFailureCount = 0;
  let fontWarningCount = 0;
  let pageErrorCount = 0;
  let consoleErrorCount = 0;
  page.on("pageerror", (error) => {
    if (!INTENTIONAL_GLOBAL_ERROR_PATTERN.test(error.message)) {
      pageErrorCount += 1;
    }
  });
  page.on("console", (message) => {
    const expectedGlobalErrorDiagnostic = isExpectedGlobalErrorConsole({
      baseUrl: input.baseUrl,
      browserName: input.browserName,
      globalErrorUrl,
      message,
    });
    if (
      message.type() === "error" &&
      !INTENTIONAL_GLOBAL_ERROR_PATTERN.test(message.text()) &&
      !expectedGlobalErrorDiagnostic
    ) {
      consoleErrorCount += 1;
      debugBrowserConsole(
        `${input.browserName}:global-error:${input.viewport.id}`,
        message,
      );
    }
    if (
      message.type() === "warning" &&
      FONT_CONSOLE_WARNING_PATTERN.test(message.text())
    ) {
      fontWarningCount += 1;
    }
  });
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (GOOGLE_FONT_HOSTS.has(url.hostname)) googleRuntimeRequestCount += 1;
      if (
        request.resourceType() === "font" ||
        FONT_URL_PATTERN.test(url.href)
      ) {
        fontRequestHrefs.add(url.href);
      }
    } catch {
      // An invalid request URL cannot satisfy a same-origin font contract.
    }
  });
  page.on("requestfailed", (request) => {
    try {
      if (
        request.resourceType() === "font" ||
        FONT_URL_PATTERN.test(new URL(request.url()).href)
      ) {
        fontRequestFailureCount += 1;
      }
    } catch {
      fontRequestFailureCount += 1;
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    try {
      if (
        !response.ok() &&
        (request.resourceType() === "font" ||
          FONT_URL_PATTERN.test(new URL(request.url()).href))
      ) {
        fontRequestFailureCount += 1;
      }
    } catch {
      fontRequestFailureCount += 1;
    }
  });
  try {
    const response = await page.goto(globalErrorUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const fixture = page.locator('[data-global-error="true"]');
    await fixture.waitFor({ state: "visible", timeout: 15_000 });
    const fontsReady = await waitForFonts(page);
    const loadedFaceCount = await page.evaluate(
      async ({ family, text }) => {
        const probe = document.createElement("span");
        probe.dataset.ove208FontProbeId = "global-error-core";
        probe.lang = "uk";
        Object.assign(probe.style, {
          fontFamily: `"${family}", sans-serif`,
          fontSize: "17px",
          fontStyle: "normal",
          fontWeight: "400",
          position: "fixed",
          visibility: "hidden",
        });
        probe.textContent = text;
        document.body.append(probe);
        const faces = await document.fonts.load(
          `normal 400 17px "${family}"`,
          text,
        );
        await document.fonts.ready;
        return faces.length;
      },
      { family: input.expectedFamily, text: "OverGarden Україна" },
    );
    const structure = await readPageStructure(
      page,
      input.expectedFamily,
      false,
    );
    const fixtureVisible =
      (await fixture.count()) === 1 && (await fixture.isVisible());
    const cssFaces = await readCssFontFaces(page);
    const requests = classifyFontRequests({
      assetManifest: input.assetManifest,
      baseOrigin: input.baseUrl.origin,
      cssFaces,
      hrefs: fontRequestHrefs,
    });
    const fontPreloadHrefs = await readFontPreloadHrefs(page);
    const requestUrlInspection = inspectTypographyBrowserFontUrls(
      requests.map(({ href }) => href),
      input.baseUrl.origin,
    );
    const invalidFontUrls = new Set([
      ...requests
        .filter(({ allowlisted }) => !allowlisted)
        .map(({ href }) => href),
      ...cssFaces
        .map(({ sourceUrl }) => sourceUrl)
        .filter(
          (href) =>
            !isTypographyBrowserFontUrlAllowed(href, input.baseUrl.origin),
        ),
      ...fontPreloadHrefs.filter(
        (href) =>
          !isTypographyBrowserFontUrlAllowed(href, input.baseUrl.origin),
      ),
    ]);
    const unclassifiedFontRequestCount = invalidFontUrls.size;
    const platformFontProof = client
      ? (await chromiumPlatformFontProof({
          client,
          expectedFamily: input.expectedFamily,
          page,
          selectors: ['[data-ove208-font-probe-id="global-error-core"]'],
        }))
        ? "passed"
        : "failed"
      : "not-applicable";
    const observation: TypographyGlobalErrorObservation = {
      fixtureVisible,
      actualStatus: response?.status() ?? 0,
      documentLang: structure.documentLang,
      fontsReady,
      loadedFaceCount,
      computedFontFamily: structure.computedFontFamily,
      horizontalOverflowPx: structure.horizontalOverflowPx,
      offscreenControlCount: structure.offscreenControlCount,
      clippedTextCount: structure.clippedTextCount,
      proportionalFontMismatchCount: structure.proportionalFontMismatchCount,
      fontRequestCount: requests.length,
      crossOriginFontRequestCount:
        requestUrlInspection.crossOriginFontRequestCount,
      googleRuntimeRequestCount,
      unclassifiedFontRequestCount,
      fontRequestFailureCount,
      fontWarningCount,
      pageErrorCount,
      consoleErrorCount,
      platformFontProof,
    };
    const shouldCaptureScreenshot =
      input.browserName === "chromium" && input.screenshotDir !== null;
    if (shouldCaptureScreenshot) {
      await cleanupTypographyProbes(page);
      await settleScreenshotLayout(page, input.expectedFamily);
    }
    const screenshotFilename =
      input.screenshotDir && shouldCaptureScreenshot
        ? await captureScreenshot({
            directory: input.screenshotDir,
            filename: `ove208-global-error-uk-${input.viewport.id}.png`,
            page,
          })
        : null;
    return {
      browser: input.browserName,
      routeId: GLOBAL_ERROR_ROUTE_ID,
      viewportId: input.viewport.id,
      actualStatus: response?.status() ?? null,
      documentLang: structure.documentLang,
      computedFontFamily: structure.computedFontFamily,
      fontsReady,
      loadedFaceCount,
      fixtureVisible,
      layout: {
        horizontalOverflowPx: structure.horizontalOverflowPx,
        offscreenControlCount: structure.offscreenControlCount,
        clippedTextCount: structure.clippedTextCount,
        proportionalFontMismatchCount: structure.proportionalFontMismatchCount,
      },
      runtime: {
        fontRequestCount: requests.length,
        crossOriginFontRequestCount: observation.crossOriginFontRequestCount,
        googleRuntimeRequestCount,
        unclassifiedFontRequestCount,
        fontRequestFailureCount,
        fontWarningCount,
        pageErrorCount,
        consoleErrorCount,
      },
      platformFontProof,
      sameOriginFontPaths: [
        ...new Set(
          requests
            .filter(({ origin }) => origin === input.baseUrl.origin)
            .map(({ path: requestPath }) => requestPath),
        ),
      ].sort(),
      screenshotFilename,
      failures: evaluateTypographyGlobalErrorObservation(
        observation,
        input.expectedFamily,
      ),
    };
  } finally {
    await context.close();
  }
}

function difference(values: Set<string>, baseline: Set<string>): string[] {
  return [...values].filter((value) => !baseline.has(value));
}

async function buildScreenshotManifest(
  directory: string | null,
  filenames: Array<string | null>,
): Promise<TypographyBrowserArtifact["screenshots"]> {
  if (!directory) return [];
  const uniqueFilenames = [...new Set(filenames.filter(Boolean) as string[])];
  return Promise.all(
    uniqueFilenames.sort().map(async (filename) => {
      const buffer = await readFile(path.join(directory, filename));
      return {
        filename,
        bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    }),
  );
}

function classifyRunnerFailure(error: unknown): string {
  if (!(error instanceof Error)) return "runner-error:unknown";
  if (error.name === "TimeoutError") return "runner-error:timeout";
  if (error.name === "TargetClosedError") return "runner-error:target-closed";
  return "runner-error:operation";
}

function debugRunnerFailure(scope: string, error: unknown): void {
  if (process.env.TYPOGRAPHY_BROWSER_DEBUG !== "1") return;
  process.stderr.write(
    `${JSON.stringify({
      scope,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
}

function debugBrowserConsole(scope: string, message: ConsoleMessage): void {
  if (process.env.TYPOGRAPHY_BROWSER_DEBUG !== "1") return;
  process.stderr.write(
    `${JSON.stringify({
      scope,
      consoleType: message.type(),
      text: message.text(),
      location: message.location(),
    })}\n`,
  );
}

function failedCase(input: {
  browser: TypographyBrowserName;
  error: unknown;
  route: TypographyBrowserRoute;
  viewport: TypographyBrowserViewport;
}): BrowserCaseResult {
  return {
    browser: input.browser,
    routeId: input.route.id,
    surface: input.route.surface,
    locale: input.route.locale,
    viewportId: input.viewport.id,
    expectedStatus: input.route.expectedStatus,
    actualStatus: null,
    documentLang: null,
    computedFontFamily: null,
    fontsReady: false,
    loadedFaceCount: 0,
    layout: {
      horizontalOverflowPx: 0,
      offscreenControlCount: 0,
      clippedTextCount: 0,
      proportionalFontMismatchCount: 0,
      clippingDetectorRegression: null,
    },
    runtime: {
      pageErrorCount: 0,
      consoleErrorCount: 0,
      fontRequestCount: 0,
      crossOriginFontRequestCount: 0,
      googleRuntimeRequestCount: 0,
      unclassifiedFontRequestCount: 0,
      fontRequestFailureCount: 0,
    },
    lazyLoading: {
      initialItalicDemand: false,
      initialItalicFontRequestCount: 0,
      initialLatinExtDemand: false,
      initialLatinExtFontRequestCount: 0,
      initialCyrillicExtDemand: false,
      initialCyrillicExtFontRequestCount: 0,
      probeRun: false,
      italicNewRequestCount: null,
      latinExtNewRequestCount: null,
      cyrillicExtNewRequestCount: null,
    },
    corpus: {
      loaded: null,
      platformFontProof: "not-applicable",
      semanticMono: null,
      semanticInheritance: null,
    },
    sameOriginFontPaths: [],
    screenshotFilename: null,
    failures: [classifyRunnerFailure(input.error)],
  };
}

function failedFallbackCase(input: {
  browser: TypographyBrowserName;
  error: unknown;
}): FallbackCaseResult {
  return {
    browser: input.browser,
    routeId: FALLBACK_ROUTE_ID,
    viewportId: "mobile-390",
    actualStatus: null,
    visibleMeaningfulText: false,
    firstContentfulPaintMs: null,
    visibleAfterDomContentLoadedMs: null,
    targetFontUnavailableBeforeRelease: false,
    fallbackFontAvailableBeforeRelease: false,
    computedFallbackFamily: null,
    blockedFontRequestCount: 0,
    blockedFontResourceTimingCount: null,
    configuredDelayMs: FALLBACK_DELAY_MS,
    blockedDurationMs: null,
    fallbackDurationMs: null,
    targetFontAvailableAfterRelease: false,
    convergedFontFamily: null,
    fontsReady: false,
    fontWindowCls: null,
    runtime: { pageErrorCount: 0, consoleErrorCount: 0 },
    failures: [classifyRunnerFailure(input.error)],
  };
}

function failedGlobalErrorCase(input: {
  browser: TypographyBrowserName;
  error: unknown;
  viewport: (typeof GLOBAL_ERROR_VIEWPORTS)[number];
}): GlobalErrorCaseResult {
  return {
    browser: input.browser,
    routeId: GLOBAL_ERROR_ROUTE_ID,
    viewportId: input.viewport.id,
    actualStatus: null,
    documentLang: null,
    computedFontFamily: null,
    fontsReady: false,
    loadedFaceCount: 0,
    fixtureVisible: false,
    layout: {
      horizontalOverflowPx: 0,
      offscreenControlCount: 0,
      clippedTextCount: 0,
      proportionalFontMismatchCount: 0,
    },
    runtime: {
      fontRequestCount: 0,
      crossOriginFontRequestCount: 0,
      googleRuntimeRequestCount: 0,
      unclassifiedFontRequestCount: 0,
      fontRequestFailureCount: 0,
      fontWarningCount: 0,
      pageErrorCount: 0,
      consoleErrorCount: 0,
    },
    platformFontProof: "not-applicable",
    sameOriginFontPaths: [],
    screenshotFilename: null,
    failures: [classifyRunnerFailure(input.error)],
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const options = readCliOptions(argv);
  const routes = await resolveRoutes(options);
  const assetManifest = loadAssetManifest();
  const cases: BrowserCaseResult[] = [];
  const fallbackCases: FallbackCaseResult[] = [];
  const globalErrorCases: GlobalErrorCaseResult[] = [];
  const globalErrorApplicable = LOOPBACK_HOSTS.has(options.baseUrl.hostname);
  const fallbackRoute = routes.find(({ id }) => id === FALLBACK_ROUTE_ID);
  if (!fallbackRoute) {
    throw new Error("Typography fallback route is missing.");
  }

  for (const browserName of options.browsers) {
    let browser: Browser;
    try {
      browser = await browserLauncher(browserName).launch({ headless: true });
    } catch (error) {
      for (const route of routes) {
        for (const viewport of viewportsForRoute(route)) {
          cases.push(
            failedCase({ browser: browserName, error, route, viewport }),
          );
        }
      }
      fallbackCases.push(failedFallbackCase({ browser: browserName, error }));
      if (globalErrorApplicable) {
        for (const viewport of GLOBAL_ERROR_VIEWPORTS) {
          globalErrorCases.push(
            failedGlobalErrorCase({ browser: browserName, error, viewport }),
          );
        }
      }
      continue;
    }
    try {
      try {
        fallbackCases.push(
          await runFallbackCaseWithSchedulerRetry({
            baseUrl: options.baseUrl,
            browser,
            browserName,
            expectedFamily: options.expectedFamily,
            route: fallbackRoute,
          }),
        );
      } catch (error) {
        debugRunnerFailure(`fallback:${browserName}`, error);
        fallbackCases.push(failedFallbackCase({ browser: browserName, error }));
      }
      for (const route of routes) {
        for (const viewport of viewportsForRoute(route)) {
          try {
            cases.push(
              await runBrowserCase({
                assetManifest,
                baseUrl: options.baseUrl,
                browser,
                browserName,
                expectedFamily: options.expectedFamily,
                route,
                screenshotDir: options.screenshotDir,
                viewport,
              }),
            );
          } catch (error) {
            debugRunnerFailure(
              `${browserName}:${route.id}:${viewport.id}`,
              error,
            );
            cases.push(
              failedCase({ browser: browserName, error, route, viewport }),
            );
          }
        }
      }
      if (globalErrorApplicable) {
        for (const viewport of GLOBAL_ERROR_VIEWPORTS) {
          try {
            globalErrorCases.push(
              await runGlobalErrorCase({
                assetManifest,
                baseUrl: options.baseUrl,
                browser,
                browserName,
                expectedFamily: options.expectedFamily,
                screenshotDir: options.screenshotDir,
                viewport,
              }),
            );
          } catch (error) {
            debugRunnerFailure(
              `${browserName}:${GLOBAL_ERROR_ROUTE_ID}:${viewport.id}`,
              error,
            );
            globalErrorCases.push(
              failedGlobalErrorCase({ browser: browserName, error, viewport }),
            );
          }
        }
      }
    } finally {
      await browser.close();
    }
  }

  const failureCodes = [
    ...new Set(
      [...cases, ...fallbackCases, ...globalErrorCases].flatMap(
        ({ failures }) => failures,
      ),
    ),
  ].sort();
  const allCaseResults = [...cases, ...fallbackCases, ...globalErrorCases];
  const screenshots = await buildScreenshotManifest(options.screenshotDir, [
    ...cases.map(({ screenshotFilename }) => screenshotFilename),
    ...globalErrorCases.map(({ screenshotFilename }) => screenshotFilename),
  ]);
  const artifact: TypographyBrowserArtifact = {
    contractVersion: "ove208.typographyBrowser.v2",
    capturedAt: new Date().toISOString(),
    baseOrigin: options.baseUrl.origin,
    expectedFamily: options.expectedFamily,
    sha: options.sha,
    browsers: options.browsers,
    viewportIds: TYPOGRAPHY_BROWSER_VIEWPORTS.map(({ id }) => id),
    routeIds: routes.map(({ id }) => id),
    cases,
    fallbackCases,
    globalErrorFixture: {
      applicable: globalErrorApplicable,
      omissionReason: globalErrorApplicable ? null : "non-loopback-origin",
      cases: globalErrorCases,
    },
    screenshots,
    summary: {
      matrixCaseCount: cases.length,
      fallbackCaseCount: fallbackCases.length,
      passedFallbackCaseCount: fallbackCases.filter(
        ({ failures }) => failures.length === 0,
      ).length,
      failedFallbackCaseCount: fallbackCases.filter(
        ({ failures }) => failures.length > 0,
      ).length,
      globalErrorCaseCount: globalErrorCases.length,
      passedGlobalErrorCaseCount: globalErrorCases.filter(
        ({ failures }) => failures.length === 0,
      ).length,
      failedGlobalErrorCaseCount: globalErrorCases.filter(
        ({ failures }) => failures.length > 0,
      ).length,
      caseCount: allCaseResults.length,
      passedCaseCount: allCaseResults.filter(
        ({ failures }) => failures.length === 0,
      ).length,
      failedCaseCount: allCaseResults.filter(
        ({ failures }) => failures.length > 0,
      ).length,
      chromiumPlatformProofCount: cases.filter(
        ({ browser, corpus }) =>
          browser === "chromium" && corpus.platformFontProof === "passed",
      ).length,
      chromiumMonoPlatformProofCount: cases.filter(
        ({ browser, corpus }) =>
          browser === "chromium" &&
          corpus.semanticMono?.platformFontProof === "passed",
      ).length,
      boundedNonChromiumSkipCount: cases.filter(
        ({ browser, corpus }) =>
          browser !== "chromium" &&
          corpus.platformFontProof === "not-applicable",
      ).length,
      boundedNonChromiumMonoSkipCount: cases.filter(
        ({ browser, corpus }) =>
          browser !== "chromium" &&
          corpus.semanticMono?.platformFontProof === "not-applicable",
      ).length,
      failureCodes,
    },
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (options.outputPath) await writeFile(options.outputPath, serialized);
  process.stdout.write(serialized);
  if (artifact.summary.failedCaseCount > 0) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      contractVersion: "ove208.typographyBrowser.error.v2",
      failure: classifyRunnerFailure(error),
    })}\n`,
  );
  process.exitCode = 1;
});
