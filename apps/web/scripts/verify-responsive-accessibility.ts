import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "playwright";

import {
  browserSafeFixturePath,
  CORE_JOURNEY_SCENARIOS,
  CORE_JOURNEY_EVIDENCE_SCENARIO_IDS,
  CORE_JOURNEY_VIEWPORTS,
  type CoreJourneyScenario,
  type CoreJourneyViewportId,
} from "../src/lib/accessibility/core-journey-matrix";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  LOCALIZATION_DOWNSTREAM_UI_GATES,
  LOCALIZATION_OWNER_BROWSER_PROBES,
  resolveLocalizationBrowserMarketCase,
  type LocalizationBrowserControlOwnerId,
  type LocalizationBrowserMarketCase,
  type LocalizationBrowserMarketCasePlan,
  type LocalizationDownstreamUiGate,
  type LocalizationOwnerBrowserProbe,
  type LocalizationRenderedOwnerId,
  type LocalizationRequiredBrowserState,
} from "../src/lib/localization/localization-browser-matrix";
import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  INTERFACE_LOCALE_COOKIE_NAME,
} from "../src/lib/interface-localization";
import {
  INTERFACE_MARKET_COOKIE_NAME,
  type InterfaceMarket,
} from "../src/lib/interface-market";
import {
  getInterfaceRoutePolicy,
  INTERFACE_CONTEXT_ENDPOINT,
  INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
  type InterfaceRouteMode,
} from "../src/lib/interface-route-policy";
import {
  localizedPath,
  stripLocalePrefix,
  type PublicLocale,
} from "../src/lib/public-localization";

const require = createRequire(import.meta.url);
const AXE_SOURCE_PATH = require.resolve("axe-core/axe.min.js");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const AXE_VIEWPORTS = new Set<CoreJourneyViewportId>([
  "mobile-320",
  "desktop-1440",
]);
const LINEAGE_CLAIM_HANDOFF_SCENARIO_ID = "intent:ove174-i004";
const PRIVATE_SIGN_UP_COMPATIBILITY = {
  name: PRIVATE_AUTH_COMPATIBILITY_NAME,
} as const;
const EVIDENCE_SCREENSHOTS = new Map<string, string>([
  ["main:ove187-feed-dense@mobile-320", "ove-185-after-mobile-feed.png"],
  ["creation:ove182-c004@desktop-1440", "ove-185-after-desktop-creation.png"],
  [
    "community:ove184-community-dense@mobile-390",
    "ove-185-after-mobile-community.png",
  ],
  [
    "creation:ove182-c007@zoom-200-reflow",
    "ove-185-after-zoom-200-creation.png",
  ],
  ...Object.entries(CORE_JOURNEY_EVIDENCE_SCENARIO_IDS).flatMap(
    ([archetype, scenarioId]) => [
      [
        `${scenarioId}@mobile-320`,
        `ove-186-after-mobile-${archetype}.png`,
      ] as const,
      [
        `${scenarioId}@desktop-1440`,
        `ove-186-after-desktop-${archetype}.png`,
      ] as const,
    ],
  ),
]);

interface Failure {
  scenarioId: string;
  viewportId: string;
  check: string;
  detail: string;
}

interface PageStructure {
  duplicateIds: string[];
  horizontalOverflow: number;
  h1Count: number;
  mainCount: number;
  offscreenControlCount: number;
}

interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  nodes: unknown[];
}

interface AxeResult {
  violations: AxeViolation[];
}

interface AuditSummary {
  scenarioCount: number;
  viewportCount: number;
  pageChecks: number;
  axeChecks: number;
  screenshots: string[];
  localization: {
    routeContracts: number;
    continuityLocales: PublicLocale[];
    ownerProbeChecks: number;
    ownerProofs: LocalizationRenderedOwnerId[];
    edgeStates: LocalizationRequiredBrowserState[];
    marketCaseChecks: number;
    marketCases: LocalizationBrowserMarketCase[];
    markets: InterfaceMarket[];
    controlContractChecks: number;
    interactionProofs: {
      menuKeyboardEscapeFocus: boolean;
      localizedSafeStateContinuity: boolean;
      unsafeLocalizedStateRejected: boolean;
      samePathPreferencePersistence: boolean;
      rawSamePathPreferencePersistence: boolean;
      rawMenuKeyboardEscapeFocus: boolean;
      rawActionReferrerSuppression: boolean;
      rawAmbiguousCommitRollback: boolean;
      rawRequestTimeoutRecovery: boolean;
      rawFailedRollbackRetry: boolean;
      documentNavigationRefererSuppression: boolean;
      genericNotFound: boolean;
      mixedLocaleTopic: boolean;
      languageControlReflow200: boolean;
      globalError: boolean;
      globalErrorMetadataFallback: boolean;
      safeFlushFailure: boolean;
      dirtyCancel: boolean;
      dirtyDiscard: boolean;
      inFlightBlocked: boolean;
      inFlightSettlement: boolean;
      serverActionPendingFence: boolean;
    };
    downstreamOwnedBrowserProofs: readonly LocalizationDownstreamUiGate[];
  };
  interactions: {
    authIntent: boolean;
    keyboardAndDrawer: boolean;
    largeText: boolean;
    reducedMotion: boolean;
    safetyControls: boolean;
  };
}

export function classifyBrowserRunnerError(error: unknown) {
  if (!(error instanceof Error)) return "unknown-browser-operation-failure";
  if (error.name === "TimeoutError") return "browser-operation-timeout";
  if (error.name === "TargetClosedError") return "browser-target-closed";
  return "browser-operation-failed";
}

export function hasInterfaceContextMetadataHint(
  html: string,
  expectedHint: string,
) {
  const head = html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i)?.[1];
  if (!head) return false;

  const headMarkup = head
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      "",
    );
  const metaTags = headMarkup.match(/<meta(?:\s[^>]*)?>/gi) ?? [];
  return metaTags.some(
    (tag) =>
      readQuotedHtmlAttribute(tag, "name") === INTERFACE_CONTEXT_META_NAME &&
      readQuotedHtmlAttribute(tag, "content") === expectedHint,
  );
}

function readQuotedHtmlAttribute(tag: string, attributeName: string) {
  const match = tag.match(
    new RegExp(`\\s${attributeName}=(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function expectedInterfaceLocale(route: string): PublicLocale {
  const firstSegment = new URL(route, "http://fixture.local").pathname
    .split("/")
    .filter(Boolean)[0];
  return firstSegment === "bg" || firstSegment === "ru" ? firstSegment : "uk";
}

async function assertLocaleResponseContract(
  page: Page,
  response: Response | null,
  expectedLocale: PublicLocale,
): Promise<string[]> {
  const failures: string[] = [];
  const documentLocale = await page.locator("html").getAttribute("lang");
  const contentLanguage = response?.headers()["content-language"] ?? null;

  if (documentLocale !== expectedLocale) {
    failures.push(`html-lang:${documentLocale ?? "missing"}:${expectedLocale}`);
  }
  if (contentLanguage !== expectedLocale) {
    failures.push(
      `content-language:${contentLanguage ?? "missing"}:${expectedLocale}`,
    );
  }

  return failures;
}

function resolveBaseUrl(): URL {
  const baseUrl = new URL(
    process.env.ACCESSIBILITY_BASE_URL ?? "http://localhost:3000",
  );
  const previewAllowed = process.env.ACCESSIBILITY_ALLOW_PREVIEW === "true";

  if (
    baseUrl.hostname === "over.garden" ||
    baseUrl.hostname.endsWith(".over.garden")
  ) {
    throw new Error("OVE-185 browser evidence refuses the production domain.");
  }
  if (!LOOPBACK_HOSTS.has(baseUrl.hostname) && !previewAllowed) {
    throw new Error(
      "OVE-185 browser evidence requires loopback unless preview access is explicit.",
    );
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("OVE-185 browser evidence requires an HTTP origin.");
  }

  return baseUrl;
}

async function waitForStablePage(page: Page): Promise<void> {
  await page
    .waitForLoadState("load", { timeout: 15_000 })
    .catch(() => undefined);
  const globalLoading = page.locator('[data-site-shell-state="loading"]');
  if ((await globalLoading.count()) > 0) {
    await globalLoading.waitFor({ state: "detached", timeout: 15_000 });
  }
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll("main").length === 1 &&
        document.querySelectorAll("h1").length === 1,
      undefined,
      { timeout: 2_000 },
    )
    .catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function readPageStructure(page: Page): Promise<PageStructure> {
  return page.evaluate(() => {
    const idCounts = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
    }

    const renderedElements = new Set(
      [...document.querySelectorAll<HTMLElement>("*")].filter((element) => {
        if (element.closest("[hidden], [inert], [aria-hidden='true']")) {
          return false;
        }

        let hiddenByClosedDetails = false;
        let closedDetails = element.closest<HTMLDetailsElement>(
          "details:not([open])",
        );
        while (closedDetails) {
          const summary =
            closedDetails.querySelector<HTMLElement>(":scope > summary");
          if (!summary?.contains(element)) {
            hiddenByClosedDetails = true;
            break;
          }
          closedDetails =
            closedDetails.parentElement?.closest("details:not([open])") ?? null;
        }
        if (hiddenByClosedDetails) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    );

    const viewportWidth = document.documentElement.clientWidth;
    const controls = [
      ...document.querySelectorAll(
        "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])",
      ),
    ].filter((element) => renderedElements.has(element as HTMLElement));
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

    return {
      duplicateIds: [...idCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
        .slice(0, 10),
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - viewportWidth,
      ),
      h1Count: [...document.querySelectorAll("h1")].filter((element) =>
        renderedElements.has(element),
      ).length,
      mainCount: [...document.querySelectorAll("main")].filter((element) =>
        renderedElements.has(element),
      ).length,
      offscreenControlCount,
    };
  });
}

async function runAxe(page: Page, axeSource: string): Promise<AxeViolation[]> {
  await page.waitForTimeout(100);
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const axeWindow = window as unknown as {
      axe: {
        run: (
          root: Document,
          options: {
            runOnly: { type: "tag"; values: string[] };
          },
        ) => Promise<AxeResult>;
      };
    };
    return axeWindow.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
  });

  return result.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious",
  );
}

function addStructureFailures(
  failures: Failure[],
  scenario: CoreJourneyScenario,
  viewportId: string,
  structure: PageStructure,
): void {
  if (structure.horizontalOverflow > 1) {
    failures.push({
      scenarioId: scenario.id,
      viewportId,
      check: "horizontal-overflow",
      detail: `${structure.horizontalOverflow}px`,
    });
  }
  if (structure.offscreenControlCount > 0) {
    failures.push({
      scenarioId: scenario.id,
      viewportId,
      check: "offscreen-controls",
      detail: String(structure.offscreenControlCount),
    });
  }
  if (structure.mainCount !== 1) {
    failures.push({
      scenarioId: scenario.id,
      viewportId,
      check: "main-landmark",
      detail: String(structure.mainCount),
    });
  }
  if (structure.h1Count !== 1) {
    failures.push({
      scenarioId: scenario.id,
      viewportId,
      check: "page-heading",
      detail: String(structure.h1Count),
    });
  }
  if (structure.duplicateIds.length > 0) {
    failures.push({
      scenarioId: scenario.id,
      viewportId,
      check: "duplicate-id",
      detail: structure.duplicateIds.join(","),
    });
  }
}

function expectedBrowserStatus(scenario: CoreJourneyScenario): number {
  if (scenario.fixture.collection === "intent") return 200;
  if (
    scenario.id === "profile:blocked-unavailable" &&
    scenario.expectedStatus === 404
  ) {
    return 200;
  }
  return scenario.expectedStatus;
}

async function captureEvidence(
  page: Page,
  scenarioId: string,
  viewportId: string,
  evidenceDir: string | undefined,
  screenshots: string[],
): Promise<void> {
  if (!evidenceDir) return;
  const filename = EVIDENCE_SCREENSHOTS.get(`${scenarioId}@${viewportId}`);
  if (!filename) return;

  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDir, filename),
    fullPage: false,
    animations: "disabled",
  });
  screenshots.push(filename);
}

async function runMatrix(
  browser: Browser,
  baseUrl: URL,
  axeSource: string,
  failures: Failure[],
  summary: AuditSummary,
): Promise<void> {
  for (const viewport of CORE_JOURNEY_VIEWPORTS) {
    const context = await browser.newContext({
      colorScheme: "light",
      reducedMotion: "no-preference",
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    for (const scenario of CORE_JOURNEY_SCENARIOS) {
      if (!scenario.viewportIds.includes(viewport.id)) continue;
      await context.clearCookies();
      let page = await context.newPage();
      let uncaughtErrors = 0;
      const listenForPageErrors = () => {
        page.on("pageerror", () => {
          uncaughtErrors += 1;
        });
      };
      listenForPageErrors();
      let stage = "navigation";

      try {
        const route = browserSafeFixturePath(scenario.path);
        let response = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await page.goto(new URL(route, baseUrl).toString(), {
              waitUntil: "domcontentloaded",
              timeout: 45_000,
            });
            break;
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.name !== "TimeoutError" ||
              attempt > 0
            ) {
              throw error;
            }
            await page.close().catch(() => undefined);
            await context.clearCookies();
            page = await context.newPage();
            uncaughtErrors = 0;
            listenForPageErrors();
          }
        }
        stage = "stability";
        await waitForScenarioStable(page, scenario);
        summary.pageChecks += 1;

        const status = response?.status() ?? 0;
        const expectedStatus = expectedBrowserStatus(scenario);
        if (status !== expectedStatus) {
          failures.push({
            scenarioId: scenario.id,
            viewportId: viewport.id,
            check: "http-status",
            detail: `${status} expected ${expectedStatus}`,
          });
        }

        stage = "localization-contract";
        const expectedLocale = expectedInterfaceLocale(route);
        const localeFailures = await assertLocaleResponseContract(
          page,
          response,
          expectedLocale,
        );
        summary.localization.routeContracts += 1;
        for (const detail of localeFailures) {
          failures.push({
            scenarioId: scenario.id,
            viewportId: viewport.id,
            check: "localization-contract",
            detail,
          });
        }

        if (
          scenario.archetype === "profile" &&
          scenario.expectedStatus === 200 &&
          scenario.path !== "/garden/profile" &&
          (await page.locator('[data-public-profile="v2"]').count()) !== 1
        ) {
          failures.push({
            scenarioId: scenario.id,
            viewportId: viewport.id,
            check: "core-content",
            detail: "missing-public-profile-v2",
          });
        }

        stage = "structure";
        const structure = await readPageStructure(page);
        addStructureFailures(failures, scenario, viewport.id, structure);

        if (uncaughtErrors > 0) {
          failures.push({
            scenarioId: scenario.id,
            viewportId: viewport.id,
            check: "page-error",
            detail: String(uncaughtErrors),
          });
        }

        if (scenario.runAxe && AXE_VIEWPORTS.has(viewport.id)) {
          stage = "axe";
          const violations = await runAxe(page, axeSource);
          summary.axeChecks += 1;
          if (violations.length > 0) {
            failures.push({
              scenarioId: scenario.id,
              viewportId: viewport.id,
              check: "axe-critical-serious",
              detail: violations
                .map(
                  ({ id, impact, nodes }) => `${id}:${impact}:${nodes.length}`,
                )
                .join(","),
            });
          }
        }

        stage = "evidence";
        await captureEvidence(
          page,
          scenario.id,
          viewport.id,
          process.env.ACCESSIBILITY_EVIDENCE_DIR,
          summary.screenshots,
        );
      } catch (error) {
        const errorDetail =
          error instanceof Error
            ? `${error.name}:${error.message.split("\n", 1)[0]}`
            : "unknown";
        const failure = {
          scenarioId: scenario.id,
          viewportId: viewport.id,
          check: "browser-run",
          detail: `${stage}:${errorDetail}`,
        };
        failures.push(failure);
        if (process.env.ACCESSIBILITY_FAIL_FAST === "true") {
          throw new Error(failureMessage([failure]));
        }
      } finally {
        await page.close();
      }
    }

    await context.close();
  }
}

async function waitForScenarioStable(
  page: Page,
  scenario: CoreJourneyScenario,
): Promise<void> {
  // This fixture completes a client-side token handoff before its final UI renders.
  if (scenario.id === LINEAGE_CLAIM_HANDOFF_SCENARIO_ID) {
    await page
      .locator('[data-auth-intent-control="claim"]')
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  await waitForStablePage(page);
  if (scenario.fixture.collection !== "intent") return;

  await page.waitForTimeout(250);
  await page
    .waitForLoadState("load", { timeout: 15_000 })
    .catch(() => undefined);
  await waitForStablePage(page);
}

async function openScenario(
  page: Page,
  baseUrl: URL,
  scenarioId: string,
): Promise<void> {
  const scenario = CORE_JOURNEY_SCENARIOS.find(({ id }) => id === scenarioId);
  if (!scenario)
    throw new Error(`Unknown OVE-185 interaction scenario ${scenarioId}`);
  await page.goto(
    new URL(browserSafeFixturePath(scenario.path), baseUrl).toString(),
    { waitUntil: "domcontentloaded", timeout: 45_000 },
  );
  await waitForStablePage(page);
}

async function runKeyboardAndDrawerCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  await openScenario(page, baseUrl, "shell:ove187-feed-typical");

  await page.keyboard.press("Tab");
  const skipTarget = await page.evaluate(() =>
    document.activeElement?.getAttribute("href"),
  );
  if (skipTarget !== "#main-content") {
    throw new Error("Skip link is not the first keyboard target.");
  }
  await page.keyboard.press("Enter");
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== "main-content") {
    throw new Error("Skip link did not focus the content region.");
  }

  const trigger = page
    .locator('[data-site-shell-region="header"] button[aria-label]:visible')
    .first();
  await trigger.click();
  const dialog = page.locator('[data-slot="sheet-content"][role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  if ((await dialog.locator('a[href$="/privacy"]').count()) < 1) {
    throw new Error("Mobile drawer lost its privacy route.");
  }
  const focusables = dialog.locator(
    "a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex='-1']):visible",
  );
  const firstFocusable = focusables.first();
  const lastFocusable = focusables.last();
  await lastFocusable.focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(50);
  if (
    !(await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ))
  ) {
    throw new Error("Mobile drawer lost its forward focus trap.");
  }
  await firstFocusable.focus();
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(50);
  if (
    !(await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ))
  ) {
    throw new Error("Mobile drawer lost its reverse focus trap.");
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (
    !(await trigger.evaluate((element) => element === document.activeElement))
  ) {
    throw new Error("Mobile drawer did not return focus to its trigger.");
  }

  await context.close();
}

async function runReducedMotionCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<void> {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await openScenario(page, baseUrl, "shell:ove187-feed-typical");
  await page
    .locator('[data-site-shell-region="header"] button[aria-label]:visible')
    .first()
    .click();
  const dialog = page.locator('[data-slot="sheet-content"][role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  const longestMotionMs = await dialog.evaluate((element) => {
    return Math.max(
      0,
      ...[element, ...element.querySelectorAll("*")].flatMap((node) => {
        const style = getComputedStyle(node);
        return [style.animationDuration, style.transitionDuration]
          .flatMap((value) => value.split(","))
          .map((value) => {
            const trimmed = value.trim();
            return trimmed.endsWith("ms")
              ? Number.parseFloat(trimmed)
              : Number.parseFloat(trimmed) * 1000;
          })
          .filter(Number.isFinite);
      }),
    );
  });
  if (longestMotionMs > 1) {
    throw new Error(
      `Reduced-motion UI still animates for ${longestMotionMs}ms.`,
    );
  }
  await context.close();
}

async function runLargeTextCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<void> {
  const creationContext = await browser.newContext({
    viewport: { width: 640, height: 900 },
  });
  const page = await creationContext.newPage();
  await openScenario(page, baseUrl, "creation:ove182-c007");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const structure = await readPageStructure(page);
  if (structure.horizontalOverflow > 1 || structure.offscreenControlCount > 0) {
    throw new Error("200% text scaling loses content or controls.");
  }
  const requiredControls = [
    '[data-photo-picker-control="true"]',
    "details summary",
    '[data-auth-intent-control="save"]',
  ];
  for (const selector of requiredControls) {
    const control = page.locator(selector).first();
    if ((await control.count()) === 0 || !(await control.isVisible())) {
      throw new Error(`Large-text creation flow lost ${selector}.`);
    }
  }
  await creationContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  await openScenario(mobilePage, baseUrl, "shell:ove187-feed-typical");
  await mobilePage
    .locator('[data-analytics-consent-banner="true"]')
    .waitFor({ state: "visible", timeout: 5_000 });
  await mobilePage.addStyleTag({
    content: "html { font-size: 200% !important; }",
  });
  await mobilePage.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const consentBanner = mobilePage.locator(
    '[data-analytics-consent-banner="true"]',
  );
  const consentBounds = await consentBanner.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      top: rect.top,
      viewportHeight: window.innerHeight,
    };
  });
  if (
    consentBounds.top < -1 ||
    consentBounds.bottom > consentBounds.viewportHeight + 1
  ) {
    throw new Error("200% analytics consent escapes the mobile viewport.");
  }
  const consentActions = consentBanner.locator("button");
  for (let index = 0; index < (await consentActions.count()); index += 1) {
    const action = consentActions.nth(index);
    await action.scrollIntoViewIfNeeded();
    const actionBounds = await action.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        top: rect.top,
        viewportHeight: window.innerHeight,
      };
    });
    if (
      !(await action.isVisible()) ||
      actionBounds.top < -1 ||
      actionBounds.bottom > actionBounds.viewportHeight + 1
    ) {
      throw new Error("200% analytics consent lost a decision control.");
    }
  }
  const mobileStructure = await readPageStructure(mobilePage);
  if (
    mobileStructure.horizontalOverflow > 1 ||
    mobileStructure.offscreenControlCount > 0
  ) {
    throw new Error(
      `200% mobile text scaling loses content or controls (${mobileStructure.horizontalOverflow}px overflow, ${mobileStructure.offscreenControlCount} offscreen controls).`,
    );
  }
  const mobileHeaderActions = [
    '[data-site-shell-region="header"] button[aria-label]:visible',
    '[data-site-shell-action="sign-in-mobile"]:visible',
    '[data-site-shell-region="mobile-navigation"]:visible',
  ];
  for (const selector of mobileHeaderActions) {
    const control = mobilePage.locator(selector).first();
    if ((await control.count()) === 0 || !(await control.isVisible())) {
      throw new Error(`Large-text mobile shell lost ${selector}.`);
    }
  }
  await mobileContext.close();
}

async function runAuthIntentCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  await openScenario(page, baseUrl, "intent:ove174-i001");
  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== "/auth/intent") {
    throw new Error(
      "Guest mutation did not reach the shared auth-intent boundary.",
    );
  }
  await page.keyboard.press("Tab");
  const hasKeyboardTarget = await page.evaluate(
    () => document.activeElement !== document.body,
  );
  if (!hasKeyboardTarget)
    throw new Error("Auth intent has no keyboard target.");
  await context.close();
}

async function runSafetyControlCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  await openScenario(page, baseUrl, "social:comments-dense");
  const actionMenu = page
    .locator("details")
    .filter({ has: page.locator('form[action$="/report"]') })
    .first();
  await actionMenu.locator("summary").click();
  for (const action of ["report", "block"] as const) {
    const control = page
      .locator(
        `[data-auth-intent-control="${action}"]:visible, form[action$="/${action}"] button[type="submit"]:visible`,
      )
      .first();
    if ((await control.count()) === 0 || !(await control.isVisible())) {
      throw new Error(`Mobile social flow lost the ${action} control.`);
    }
  }
  const structure = await readPageStructure(page);
  if (structure.horizontalOverflow > 1 || structure.offscreenControlCount > 0) {
    throw new Error("Mobile social safety controls overflow their viewport.");
  }
  await context.close();
}

function resolveLocalizationOwnerProbe(probe: LocalizationOwnerBrowserProbe): {
  route: string;
  scenario: CoreJourneyScenario | null;
} {
  const scenario = probe.scenarioId
    ? (CORE_JOURNEY_SCENARIOS.find(({ id }) => id === probe.scenarioId) ?? null)
    : null;
  if (probe.scenarioId && !scenario) {
    throw new Error(
      `Localization owner probe ${probe.id} references a missing scenario.`,
    );
  }

  let route = probe.explicitPath
    ? browserSafeFixturePath(probe.explicitPath)
    : browserSafeFixturePath(scenario!.path);
  if (probe.pathTransform === "community-moderation") {
    const parsed = new URL(route, "http://fixture.local");
    if (!parsed.pathname.startsWith("/communities/")) {
      throw new Error(
        `Localization owner probe ${probe.id} cannot derive an operator route.`,
      );
    }
    parsed.pathname = `/admin${parsed.pathname}`;
    route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  return { route, scenario };
}

type LocalizationRenderedRouteMode = Exclude<InterfaceRouteMode, "non-ui">;

export function resolveLocalizationMarketCaseRoute(input: {
  route: string;
  routeMode: LocalizationRenderedRouteMode;
  plan: LocalizationBrowserMarketCasePlan;
}): string {
  const route = new URL(input.route, "http://fixture.local");
  const basePath = stripLocalePrefix(route.pathname).path;

  route.pathname =
    input.routeMode === "localized-link" && input.plan.routeLocale
      ? localizedPath(input.plan.routeLocale, basePath)
      : basePath;

  return `${route.pathname}${route.search}${route.hash}`;
}

export function localizationControlOwnerSelector(
  controlOwnerId: LocalizationBrowserControlOwnerId,
): string {
  const escapedOwnerId = controlOwnerId.replaceAll('"', '\\"');
  return [
    `[data-interface-language-control="${escapedOwnerId}"]`,
    `[data-interface-language-control-host="${escapedOwnerId}"]`,
  ].join(", ");
}

export function validateLocalizationControlContract(input: {
  expectedControlCount: 0 | 1;
  totalControlCount: number;
  ownerCount: number;
  visibleOwnerCount: number;
}): string[] {
  const errors: string[] = [];
  if (input.totalControlCount !== input.expectedControlCount) {
    errors.push(
      `language-control-count:${input.totalControlCount}:expected:${input.expectedControlCount}`,
    );
  }
  if (input.ownerCount !== input.expectedControlCount) {
    errors.push(
      `language-control-owner-count:${input.ownerCount}:expected:${input.expectedControlCount}`,
    );
  }
  if (input.visibleOwnerCount !== input.expectedControlCount) {
    errors.push(
      `language-control-visible-owner-count:${input.visibleOwnerCount}:expected:${input.expectedControlCount}`,
    );
  }
  return errors;
}

async function installLocalizationMarketCase(
  context: BrowserContext,
  page: Page,
  baseUrl: URL,
  plan: LocalizationBrowserMarketCasePlan,
): Promise<void> {
  await context.clearCookies();
  await context.addCookies([
    {
      name: INTERFACE_MARKET_COOKIE_NAME,
      value: plan.persistedMarket,
      url: baseUrl.origin,
    },
    {
      name: INTERFACE_LOCALE_COOKIE_NAME,
      value: plan.persistedLocale,
      url: baseUrl.origin,
    },
  ]);
  await page.setExtraHTTPHeaders({
    "accept-language": plan.acceptLanguage,
    "x-vercel-ip-country": plan.countryCode,
  });
}

async function localizationMarketCookieFailures(
  context: BrowserContext,
  baseUrl: URL,
  plan: LocalizationBrowserMarketCasePlan,
): Promise<string[]> {
  const cookies = await context.cookies(baseUrl.origin);
  const market = cookies.find(
    ({ name }) => name === INTERFACE_MARKET_COOKIE_NAME,
  )?.value;
  const locale = cookies.find(
    ({ name }) => name === INTERFACE_LOCALE_COOKIE_NAME,
  )?.value;
  const errors: string[] = [];

  if (market !== plan.market) {
    errors.push(`market-cookie:${market ?? "missing"}:expected:${plan.market}`);
  }
  if (locale !== plan.locale) {
    errors.push(`locale-cookie:${locale ?? "missing"}:expected:${plan.locale}`);
  }
  return errors;
}

async function localizationControlFailures(
  page: Page,
  controlOwnerId: LocalizationBrowserControlOwnerId,
  expectedControlCount: 0 | 1,
): Promise<string[]> {
  const allControls = page.locator("[data-interface-language-control]");
  const owners = page.locator(localizationControlOwnerSelector(controlOwnerId));
  const [totalControlCount, ownerCount, visibleOwnerCount] = await Promise.all([
    allControls.count(),
    owners.count(),
    owners.evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        }).length,
    ),
  ]);

  return validateLocalizationControlContract({
    expectedControlCount,
    totalControlCount,
    ownerCount,
    visibleOwnerCount,
  });
}

function addLocalizationProbeStructureFailures(
  failures: Failure[],
  probe: LocalizationOwnerBrowserProbe,
  marketCase: LocalizationBrowserMarketCase,
  viewportId: string,
  structure: PageStructure,
): void {
  const scenarioId = `localization:${probe.id}:${marketCase}`;
  if (structure.horizontalOverflow > 1) {
    failures.push({
      scenarioId,
      viewportId,
      check: "horizontal-overflow",
      detail: `${structure.horizontalOverflow}px`,
    });
  }
  if (structure.offscreenControlCount > 0) {
    failures.push({
      scenarioId,
      viewportId,
      check: "offscreen-controls",
      detail: String(structure.offscreenControlCount),
    });
  }
  if (structure.mainCount !== 1) {
    failures.push({
      scenarioId,
      viewportId,
      check: "main-landmark",
      detail: String(structure.mainCount),
    });
  }
  if (structure.h1Count !== 1) {
    failures.push({
      scenarioId,
      viewportId,
      check: "page-heading",
      detail: String(structure.h1Count),
    });
  }
  if (structure.duplicateIds.length > 0) {
    failures.push({
      scenarioId,
      viewportId,
      check: "duplicate-id",
      detail: structure.duplicateIds.join(","),
    });
  }
}

async function runLocalizationOwnerProbeMatrix(
  browser: Browser,
  baseUrl: URL,
  axeSource: string,
  failures: Failure[],
  summary: AuditSummary,
): Promise<void> {
  const viewports = CORE_JOURNEY_VIEWPORTS.filter(({ id }) =>
    AXE_VIEWPORTS.has(id),
  );

  for (const viewport of viewports) {
    const context = await browser.newContext({
      colorScheme: "light",
      reducedMotion: "no-preference",
      viewport: { width: viewport.width, height: viewport.height },
    });

    try {
      for (const probe of LOCALIZATION_OWNER_BROWSER_PROBES) {
        const { route: baseRoute, scenario } =
          resolveLocalizationOwnerProbe(probe);
        const routeMode = getInterfaceRoutePolicy(
          new URL(baseRoute, "http://fixture.local").pathname,
        ).mode;
        if (routeMode === "non-ui") {
          throw new Error(
            `Localization owner probe ${probe.id} resolves to a non-UI route policy.`,
          );
        }

        for (const marketCase of probe.marketCases) {
          const scenarioId = `localization:${probe.id}:${marketCase}`;
          let page = await context.newPage();
          let uncaughtErrors = 0;
          const listenForOwnerProbePageErrors = () => {
            page.on("pageerror", () => {
              uncaughtErrors += 1;
            });
          };
          listenForOwnerProbePageErrors();

          try {
            const plan = resolveLocalizationBrowserMarketCase(
              marketCase,
              routeMode,
            );
            const expectedControlCount =
              probe.expectedControlCountByMarket[plan.market];
            if (expectedControlCount !== plan.expectedControlCount) {
              throw new Error(
                `Localization owner probe ${probe.id} has a stale ${marketCase} control expectation.`,
              );
            }
            const route = resolveLocalizationMarketCaseRoute({
              route: baseRoute,
              routeMode,
              plan,
            });
            let response: Response | null = null;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                await installLocalizationMarketCase(
                  context,
                  page,
                  baseUrl,
                  plan,
                );
                response = await page.goto(new URL(route, baseUrl).toString(), {
                  waitUntil: "domcontentloaded",
                  timeout: 45_000,
                });
                break;
              } catch (error) {
                if (
                  !(error instanceof Error) ||
                  error.name !== "TimeoutError" ||
                  attempt > 0
                ) {
                  throw error;
                }
                await page.close().catch(() => undefined);
                page = await context.newPage();
                uncaughtErrors = 0;
                listenForOwnerProbePageErrors();
              }
            }
            if (
              scenario &&
              probe.pathTransform === "identity" &&
              !probe.explicitPath
            ) {
              await waitForScenarioStable(page, scenario);
            } else {
              await waitForStablePage(page);
            }

            summary.localization.ownerProbeChecks += 1;
            summary.localization.marketCaseChecks += 1;
            summary.localization.controlContractChecks += 1;
            summary.localization.routeContracts += 1;
            if (!summary.localization.marketCases.includes(marketCase)) {
              summary.localization.marketCases.push(marketCase);
            }
            if (!summary.localization.markets.includes(plan.market)) {
              summary.localization.markets.push(plan.market);
            }

            const expectedStatus =
              probe.expectedStatus ??
              (scenario ? expectedBrowserStatus(scenario) : 200);
            const status = response?.status() ?? 0;
            if (status !== expectedStatus) {
              failures.push({
                scenarioId,
                viewportId: viewport.id,
                check: "http-status",
                detail: `${status} expected ${expectedStatus}`,
              });
            }

            const localeFailures = await assertLocaleResponseContract(
              page,
              response,
              plan.locale,
            );
            for (const detail of [
              ...localeFailures,
              ...(await localizationMarketCookieFailures(
                context,
                baseUrl,
                plan,
              )),
            ]) {
              failures.push({
                scenarioId,
                viewportId: viewport.id,
                check: "localization-contract",
                detail,
              });
            }

            for (const detail of await localizationControlFailures(
              page,
              probe.controlOwnerId,
              expectedControlCount,
            )) {
              failures.push({
                scenarioId,
                viewportId: viewport.id,
                check: "language-control-contract",
                detail,
              });
            }

            addLocalizationProbeStructureFailures(
              failures,
              probe,
              marketCase,
              viewport.id,
              await readPageStructure(page),
            );
            if (uncaughtErrors > 0) {
              failures.push({
                scenarioId,
                viewportId: viewport.id,
                check: "page-error",
                detail: String(uncaughtErrors),
              });
            }

            if (probe.runAxe) {
              const violations = await runAxe(page, axeSource);
              summary.axeChecks += 1;
              if (violations.length > 0) {
                failures.push({
                  scenarioId,
                  viewportId: viewport.id,
                  check: "axe-critical-serious",
                  detail: violations
                    .map(
                      ({ id, impact, nodes }) =>
                        `${id}:${impact}:${nodes.length}`,
                    )
                    .join(","),
                });
              }
            }

            if (!summary.localization.ownerProofs.includes(probe.owner)) {
              summary.localization.ownerProofs.push(probe.owner);
            }
            for (const state of probe.stateClasses) {
              if (!summary.localization.edgeStates.includes(state)) {
                summary.localization.edgeStates.push(state);
              }
            }
          } catch (error) {
            failures.push({
              scenarioId,
              viewportId: viewport.id,
              check: "runner-error",
              detail: classifyBrowserRunnerError(error),
            });
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await context.close();
    }
  }
}

async function runLocaleContinuityCheck(
  browser: Browser,
  baseUrl: URL,
): Promise<PublicLocale[]> {
  const verifiedLocales: PublicLocale[] = [];

  for (const locale of ["uk", "bg", "ru"] as const) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 844 },
    });
    const page = await context.newPage();

    try {
      const publicPath = localizedPath(locale, "/blog");
      const publicResponse = await page.goto(
        new URL(publicPath, baseUrl).toString(),
        { waitUntil: "domcontentloaded", timeout: 45_000 },
      );
      await waitForStablePage(page);
      const publicFailures = await assertLocaleResponseContract(
        page,
        publicResponse,
        locale,
      );
      if (publicFailures.length > 0) {
        throw new Error(
          `Public locale contract failed for ${locale}: ${publicFailures.join(",")}`,
        );
      }

      const canonicalHref = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      if (
        !canonicalHref ||
        new URL(canonicalHref, baseUrl).pathname !== publicPath
      ) {
        throw new Error(`Canonical locale path failed for ${locale}.`);
      }
      const alternateLocales = new Set(
        await page
          .locator('link[rel="alternate"][hreflang]')
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("hreflang")),
          ),
      );
      for (const requiredLocale of ["uk", "bg", "ru", "x-default"]) {
        if (!alternateLocales.has(requiredLocale)) {
          throw new Error(
            `Language alternate ${requiredLocale} is missing for ${locale}.`,
          );
        }
      }

      const intentResponse = await page.goto(
        new URL("/__visual-fixtures/intent/ove174-i001", baseUrl).toString(),
        { waitUntil: "domcontentloaded", timeout: 45_000 },
      );
      await page
        .locator('[data-auth-intent-surface="ready"]')
        .waitFor({ state: "visible", timeout: 15_000 });
      await waitForStablePage(page);
      if (new URL(page.url()).pathname !== "/auth/intent") {
        throw new Error(`Auth intent route continuity failed for ${locale}.`);
      }
      const intentFailures = await assertLocaleResponseContract(
        page,
        intentResponse,
        locale,
      );
      if (intentFailures.length > 0) {
        throw new Error(
          `Auth intent locale continuity failed for ${locale}: ${intentFailures.join(",")}`,
        );
      }
      const localeCookie = (await context.cookies()).find(
        ({ name }) => name === "overgarden_interface_locale",
      );
      if (localeCookie?.value !== locale) {
        throw new Error(
          `Locale preference cookie continuity failed for ${locale}.`,
        );
      }

      verifiedLocales.push(locale);
    } finally {
      await context.close();
    }
  }

  return verifiedLocales;
}

async function openLocalizationInteractionCase(input: {
  context: BrowserContext;
  page: Page;
  baseUrl: URL;
  route: string;
  routeMode: LocalizationRenderedRouteMode;
  marketCase: LocalizationBrowserMarketCase;
  expectedStatus?: number;
}) {
  const plan = resolveLocalizationBrowserMarketCase(
    input.marketCase,
    input.routeMode,
  );
  const route = resolveLocalizationMarketCaseRoute({
    route: input.route,
    routeMode: input.routeMode,
    plan,
  });
  await installLocalizationMarketCase(
    input.context,
    input.page,
    input.baseUrl,
    plan,
  );
  const response = await input.page.goto(
    new URL(route, input.baseUrl).toString(),
    { waitUntil: "domcontentloaded", timeout: 45_000 },
  );
  await waitForStablePage(input.page);

  const status = response?.status() ?? 0;
  if (status !== (input.expectedStatus ?? 200)) {
    throw new Error(
      `Localization interaction ${input.marketCase} returned ${status}, expected ${input.expectedStatus ?? 200}.`,
    );
  }
  const failures = [
    ...(await assertLocaleResponseContract(input.page, response, plan.locale)),
    ...(await localizationMarketCookieFailures(
      input.context,
      input.baseUrl,
      plan,
    )),
    ...(await localizationControlFailures(
      input.page,
      "site-shell-interface-language-control",
      plan.expectedControlCount,
    )),
  ];
  if (failures.length > 0) {
    throw new Error(
      `Localization interaction ${input.marketCase} failed: ${failures.join(",")}`,
    );
  }

  return { plan, response, route };
}

async function openInterfaceLanguageMenu(page: Page): Promise<{
  trigger: Locator;
  popup: Locator;
  items: Locator;
}> {
  const trigger = page
    .locator('[data-interface-language-trigger="true"]:visible')
    .first();
  if ((await trigger.count()) !== 1 || !(await trigger.isVisible())) {
    throw new Error("Bulgaria language menu trigger is missing.");
  }

  await trigger.focus();
  await page.keyboard.press("Enter");
  const popup = page.locator('[data-slot="menu-content"]:visible').first();
  await popup.waitFor({ state: "visible", timeout: 5_000 });
  const items = popup.locator('[data-slot="menu-radio-item"]');
  if ((await items.count()) !== 2) {
    throw new Error("Bulgaria language menu must expose exactly bg and ru.");
  }
  return { trigger, popup, items };
}

function interfaceLanguageMenuItem(page: Page, locale: "bg" | "ru") {
  return page
    .locator(
      `[data-slot="menu-radio-item"][lang="${locale}"], [data-slot="menu-radio-item"] [lang="${locale}"]`,
    )
    .first();
}

export function validateLocaleOnlyPreferenceMutation(input: {
  method: string;
  url: string;
  postData: string | null;
  locale: "bg" | "ru";
}): string[] {
  const errors: string[] = [];
  const url = new URL(input.url, "http://fixture.local");
  if (
    input.method !== "POST" ||
    url.pathname !== INTERFACE_LOCALE_PREFERENCE_ENDPOINT ||
    url.search ||
    url.hash
  ) {
    errors.push("preference-endpoint-shape");
  }

  try {
    const body = JSON.parse(input.postData ?? "null") as unknown;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (body as { locale?: unknown }).locale !== input.locale
    ) {
      errors.push("preference-body-not-locale-only");
    }
  } catch {
    errors.push("preference-body-not-json");
  }
  return errors;
}

export function validateDocumentNavigationReferer(input: {
  isNavigationRequest: boolean;
  resourceType: string;
  referer: string | null;
}): string[] {
  const errors: string[] = [];
  if (!input.isNavigationRequest || input.resourceType !== "document") {
    errors.push("locale-navigation-not-document");
  }
  if (input.referer) {
    errors.push("locale-navigation-referer-present");
  }
  return errors;
}

async function assertDocumentNavigationRefererSuppressed(
  response: Response | null,
  label: string,
): Promise<void> {
  if (!response) {
    throw new Error(`${label} did not return a document response.`);
  }
  const request = response.request();
  const headers = await request.allHeaders();
  const failures = validateDocumentNavigationReferer({
    isNavigationRequest: request.isNavigationRequest(),
    resourceType: request.resourceType(),
    referer: headers.referer ?? null,
  });
  if (failures.length > 0) {
    throw new Error(`${label} leaked its source URL in document navigation.`);
  }
}

async function runInterfaceLanguageMenuKeyboardCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/journals?__visualJournals=corpus",
      routeMode: "localized-link",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    const { trigger, popup } = await openInterfaceLanguageMenu(page);
    const focusInsideMenu = await popup.evaluate((element) =>
      element.contains(document.activeElement),
    );
    if (!focusInsideMenu) {
      throw new Error("Bulgaria language menu did not move keyboard focus.");
    }

    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden", timeout: 5_000 });
    if (
      !(await trigger.evaluate((element) => element === document.activeElement))
    ) {
      throw new Error(
        "Escape did not close the Bulgaria language menu and restore trigger focus.",
      );
    }
  } finally {
    await context.close();
  }
}

async function runLocalizedSafeStateContinuityCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let preferenceRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      preferenceRequests += 1;
    }
  });

  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route:
        "/journals?kind=plant&season=summer&sort=recent&page=2&topic=care-checks&token=private#main-content",
      routeMode: "localized-link",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    await openInterfaceLanguageMenu(page);
    const russian = interfaceLanguageMenuItem(page, "ru");
    const navigation = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await russian.click();
    const response = await navigation;
    await waitForStablePage(page);
    await assertDocumentNavigationRefererSuppressed(
      response,
      "Localized language switch",
    );

    const current = new URL(page.url());
    if (
      current.pathname !== "/ru/journals" ||
      current.searchParams.get("kind") !== "plant" ||
      current.searchParams.get("season") !== "summer" ||
      current.searchParams.get("sort") !== "recent" ||
      current.searchParams.get("page") !== "2" ||
      current.searchParams.has("topic") ||
      current.searchParams.has("token") ||
      [...current.searchParams.keys()].length !== 4 ||
      current.hash !== "#main-content"
    ) {
      throw new Error(
        `Localized language switch did not preserve only safe state: ${current.pathname}${current.search}${current.hash}`,
      );
    }
    if (preferenceRequests !== 0) {
      throw new Error(
        "Localized language switch unexpectedly used preference POST.",
      );
    }
    const russianPlan = resolveLocalizationBrowserMarketCase(
      "bulgaria-ru-exactly-one-control",
      "localized-link",
    );
    const failures = [
      ...(await assertLocaleResponseContract(page, response, "ru")),
      ...(await localizationMarketCookieFailures(
        context,
        baseUrl,
        russianPlan,
      )),
    ];
    if (failures.length > 0) {
      throw new Error(
        `Localized safe-state switch lost locale continuity: ${failures.join(",")}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runNestedJournalReturnLocaleContinuityCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    ({ id }) => id === "journal-entry:recent-mixed-gallery",
  );
  if (!scenario) {
    throw new Error("Journal return-locale continuity scenario is missing.");
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let preferenceRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      preferenceRequests += 1;
    }
  });

  try {
    const source = new URL(
      browserSafeFixturePath(scenario.path),
      "http://fixture.local",
    );
    source.searchParams.set(
      "from",
      "/bg/journals?kind=plant&season=summer&sort=recent&page=2&q=private-note",
    );
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: `${source.pathname}${source.search}`,
      routeMode: "localized-link",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    await openInterfaceLanguageMenu(page);
    const navigation = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await interfaceLanguageMenuItem(page, "ru").click();
    const response = await navigation;
    await waitForStablePage(page);
    await assertDocumentNavigationRefererSuppressed(
      response,
      "Nested journal return-locale switch",
    );

    const current = new URL(page.url());
    const expectedNavigationReturnTo =
      "/ru/journals?kind=plant&season=summer&sort=recent&page=2";
    const expectedBackHref = "/ru/journals?kind=plant&season=summer&page=2";
    const backHref = await page
      .locator('[data-public-journal-entry="true"] nav a')
      .first()
      .getAttribute("href");
    if (
      current.pathname !== `/ru${scenario.path}` ||
      current.searchParams.get("from") !== expectedNavigationReturnTo ||
      [...current.searchParams.keys()].length !== 1 ||
      backHref !== expectedBackHref ||
      preferenceRequests !== 0
    ) {
      throw new Error(
        "Journal locale switch did not retarget its sanitized directory return path.",
      );
    }
    const failures = await assertLocaleResponseContract(page, response, "ru");
    if (failures.length > 0) {
      throw new Error(
        `Nested journal return-locale convergence failed: ${failures.join(",")}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runLocalizedUnsafeStateRejectionCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const cases = [
    {
      id: "arbitrary-private-state",
      route:
        "/journals?kind=plant&catalog=tomato-heirloom&topic=care-checks&sort=recent&page=2&q=private-note-body&region=BG-23&cursor=opaque-private-cursor&identity=private-object-id#main-content",
      expectedEntries: [
        ["kind", "plant"],
        ["sort", "recent"],
        ["page", "2"],
      ],
      expectedHash: "#main-content",
      expectedPathname: "/ru/journals",
      expectedInitialStatus: 200,
    },
    {
      id: "malformed-slugs-and-encoded-fragment",
      route:
        "/journals?catalog=Private_ID&topic=private%2Ftopic&sort=recent&page=2#token%3Dv1.secret",
      expectedEntries: [
        ["sort", "recent"],
        ["page", "2"],
      ],
      expectedHash: "",
      expectedPathname: "/ru/journals",
      expectedInitialStatus: 200,
    },
    {
      id: "internal-id-shaped-slugs",
      route:
        "/journals?catalog=00000000-0000-4000-8000-000000000001&topic=00000000-0000-4000-8000-000000000002&sort=recent&page=2",
      expectedEntries: [
        ["sort", "recent"],
        ["page", "2"],
      ],
      expectedHash: "",
      expectedPathname: "/ru/journals",
      expectedInitialStatus: 200,
    },
    {
      id: "private-id-path-segment",
      route:
        "/reset/00000000-0000-4000-8000-000000000001?token=private#main-content",
      expectedEntries: [],
      expectedHash: "",
      expectedPathname: "/ru",
      expectedInitialStatus: 404,
    },
  ] as const;

  for (const scenario of cases) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    let preferenceRequests = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
      ) {
        preferenceRequests += 1;
      }
    });

    try {
      await openLocalizationInteractionCase({
        context,
        page,
        baseUrl,
        route: scenario.route,
        routeMode: "localized-link",
        marketCase: "bulgaria-bg-exactly-one-control",
        expectedStatus: scenario.expectedInitialStatus,
      });
      await openInterfaceLanguageMenu(page);
      const navigation = page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await interfaceLanguageMenuItem(page, "ru").click();
      const response = await navigation;
      await waitForStablePage(page);
      await assertDocumentNavigationRefererSuppressed(
        response,
        `Unsafe localized state ${scenario.id}`,
      );

      const current = new URL(page.url());
      const actualEntries = [...current.searchParams.entries()];
      if (
        current.pathname !== scenario.expectedPathname ||
        JSON.stringify(actualEntries) !==
          JSON.stringify(scenario.expectedEntries) ||
        current.hash !== scenario.expectedHash ||
        preferenceRequests !== 0
      ) {
        throw new Error(
          `Localized switch retained unsafe state for ${scenario.id}.`,
        );
      }
      const russianPlan = resolveLocalizationBrowserMarketCase(
        "bulgaria-ru-exactly-one-control",
        "localized-link",
      );
      const failures = [
        ...(await assertLocaleResponseContract(page, response, "ru")),
        ...(await localizationMarketCookieFailures(
          context,
          baseUrl,
          russianPlan,
        )),
      ];
      if (failures.length > 0) {
        throw new Error(
          `Unsafe state rejection lost Russian convergence: ${failures.join(",")}`,
        );
      }
    } finally {
      await context.close();
    }
  }
}

async function runSamePathPreferencePersistenceCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route:
        "/garden?visualWorkspace=guest&token=ove205-private-marker#ove205-private-fragment",
      routeMode: "same-path-preference",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    await openInterfaceLanguageMenu(page);
    const russian = interfaceLanguageMenuItem(page, "ru");
    const preferenceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
      { timeout: 45_000 },
    );
    const navigationPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await russian.click();
    const [preferenceResponse, navigationResponse] = await Promise.all([
      preferenceResponsePromise,
      navigationPromise,
    ]);
    await waitForStablePage(page);
    await assertDocumentNavigationRefererSuppressed(
      navigationResponse,
      "Same-path language switch",
    );

    if (preferenceResponse.status() !== 204) {
      throw new Error(
        `Same-path locale preference returned ${preferenceResponse.status()}.`,
      );
    }
    const preferenceRequest = preferenceResponse.request();
    const mutationFailures = validateLocaleOnlyPreferenceMutation({
      method: preferenceRequest.method(),
      url: preferenceRequest.url(),
      postData: preferenceRequest.postData(),
      locale: "ru",
    });
    if (
      mutationFailures.length > 0 ||
      (await preferenceRequest.allHeaders()).referer ||
      preferenceRequest.redirectedFrom()
    ) {
      throw new Error(
        `Same-path locale preference leaked navigation state: ${mutationFailures.join(",") || "referrer-or-redirect"}`,
      );
    }
    const current = new URL(page.url());
    if (
      current.pathname !== "/garden" ||
      current.search !== "?visualWorkspace=guest&token=ove205-private-marker" ||
      current.hash !== "#ove205-private-fragment"
    ) {
      throw new Error("Same-path locale switch changed the canonical URL.");
    }
    const localeFailures = await assertLocaleResponseContract(
      page,
      navigationResponse,
      "ru",
    );
    if (localeFailures.length > 0) {
      throw new Error(
        `Same-path reload lost Russian locale: ${localeFailures.join(",")}`,
      );
    }

    const secondTab = await context.newPage();
    try {
      const secondResponse = await secondTab.goto(
        new URL("/garden?visualWorkspace=guest", baseUrl).toString(),
        { waitUntil: "domcontentloaded", timeout: 45_000 },
      );
      await waitForStablePage(secondTab);
      const secondTabFailures = [
        ...(await assertLocaleResponseContract(
          secondTab,
          secondResponse,
          "ru",
        )),
        ...(await localizationControlFailures(
          secondTab,
          "site-shell-interface-language-control",
          1,
        )),
      ];
      if (secondTabFailures.length > 0) {
        throw new Error(
          `Second tab lost persisted Bulgaria/Russian preference: ${secondTabFailures.join(",")}`,
        );
      }
    } finally {
      await secondTab.close();
    }
  } finally {
    await context.close();
  }
}

async function runRawLifecycleSamePathPreferenceCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    ({ id }) => id === "passport:public-unpublished",
  );
  if (!scenario) {
    throw new Error("Raw lifecycle same-path scenario is missing.");
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const bulgariaPlan = resolveLocalizationBrowserMarketCase(
    "bulgaria-bg-exactly-one-control",
    "same-path-preference",
  );
  try {
    await installLocalizationMarketCase(context, page, baseUrl, bulgariaPlan);
    const route = `${browserSafeFixturePath(scenario.path)}#ove205-raw-private-fragment`;
    const initialResponse = await page.goto(
      new URL(route, baseUrl).toString(),
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      },
    );
    await waitForStablePage(page);
    const initialFailures = [
      ...(await assertLocaleResponseContract(page, initialResponse, "bg")),
      ...(await localizationMarketCookieFailures(
        context,
        baseUrl,
        bulgariaPlan,
      )),
      ...(await localizationControlFailures(
        page,
        "raw-lifecycle-interface-language-control",
        1,
      )),
    ];
    if (initialResponse?.status() !== 404 || initialFailures.length > 0) {
      throw new Error(
        `Raw lifecycle same-path setup failed: ${initialFailures.join(",")}`,
      );
    }

    const details = page.locator('[data-interface-language-control="true"]');
    await details.locator("summary").click();
    const russian = details.locator(
      '[data-interface-language-option][data-interface-locale="ru"]',
    );
    const preferenceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
      { timeout: 45_000 },
    );
    const navigationPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await russian.click();
    const [preferenceResponse, navigationResponse] = await Promise.all([
      preferenceResponsePromise,
      navigationPromise,
    ]);
    await waitForStablePage(page);
    await assertDocumentNavigationRefererSuppressed(
      navigationResponse,
      "Raw lifecycle same-path language switch",
    );

    const preferenceRequest = preferenceResponse.request();
    const mutationFailures = validateLocaleOnlyPreferenceMutation({
      method: preferenceRequest.method(),
      url: preferenceRequest.url(),
      postData: preferenceRequest.postData(),
      locale: "ru",
    });
    if (
      preferenceResponse.status() !== 204 ||
      mutationFailures.length > 0 ||
      preferenceRequest.redirectedFrom() ||
      (await preferenceRequest.allHeaders()).referer
    ) {
      throw new Error("Raw lifecycle preference mutation was not narrow.");
    }

    const current = new URL(page.url());
    const expected = new URL(route, baseUrl);
    const russianPlan = resolveLocalizationBrowserMarketCase(
      "bulgaria-ru-exactly-one-control",
      "same-path-preference",
    );
    const convergenceFailures = [
      ...(await assertLocaleResponseContract(page, navigationResponse, "ru")),
      ...(await localizationMarketCookieFailures(
        context,
        baseUrl,
        russianPlan,
      )),
      ...(await localizationControlFailures(
        page,
        "raw-lifecycle-interface-language-control",
        1,
      )),
    ];
    if (
      navigationResponse?.status() !== 404 ||
      current.pathname !== expected.pathname ||
      current.search !== expected.search ||
      current.hash !== expected.hash ||
      convergenceFailures.length > 0
    ) {
      throw new Error(
        `Raw lifecycle same-path reload did not converge: ${convergenceFailures.join(",")}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runRawLifecycleMenuKeyboardCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    ({ id }) => id === "passport:public-unpublished",
  );
  if (!scenario) {
    throw new Error("Raw lifecycle keyboard scenario is missing.");
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const bulgariaPlan = resolveLocalizationBrowserMarketCase(
    "bulgaria-bg-exactly-one-control",
    "same-path-preference",
  );
  let localeRequestCount = 0;

  try {
    await installLocalizationMarketCase(context, page, baseUrl, bulgariaPlan);
    const route = `${browserSafeFixturePath(scenario.path)}#ove205-raw-keyboard`;
    const initialResponse = await page.goto(
      new URL(route, baseUrl).toString(),
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      },
    );
    await waitForStablePage(page);
    if (initialResponse?.status() !== 404) {
      throw new Error("Raw lifecycle keyboard setup did not render 404.");
    }

    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
      ) {
        localeRequestCount += 1;
      }
    });

    const contractFailures = [
      ...(await assertLocaleResponseContract(page, initialResponse, "bg")),
      ...(await localizationMarketCookieFailures(
        context,
        baseUrl,
        bulgariaPlan,
      )),
      ...(await localizationControlFailures(
        page,
        "raw-lifecycle-interface-language-control",
        1,
      )),
    ];
    const details = page.locator('[data-interface-language-control="true"]');
    const summary = details.locator("summary");
    const bgOption = details.locator(
      '[data-interface-language-option][data-interface-locale="bg"]',
    );
    const ruOption = details.locator(
      '[data-interface-language-option][data-interface-locale="ru"]',
    );

    await summary.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLDetailsElement>(
          '[data-interface-language-control="true"]',
        )?.open === true,
    );
    await page.keyboard.press("ArrowDown");
    const firstDownFocused = await bgOption.evaluate(
      (element) => document.activeElement === element,
    );
    const firstFocusIndicatorVisible = await bgOption.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle === "solid" &&
        Number.parseFloat(style.outlineWidth) >= 3 &&
        style.outlineColor !== "transparent" &&
        style.outlineColor !== "rgba(0, 0, 0, 0)"
      );
    });
    await page.keyboard.press("ArrowDown");
    const secondDownFocused = await ruOption.evaluate(
      (element) => document.activeElement === element,
    );
    await page.keyboard.press("ArrowUp");
    const firstUpFocused = await bgOption.evaluate(
      (element) => document.activeElement === element,
    );
    await page.keyboard.press("Escape");

    const finalState = await page.evaluate(() => {
      const control = document.querySelector<HTMLDetailsElement>(
        '[data-interface-language-control="true"]',
      );
      const trigger = control?.querySelector("summary");
      return {
        detailsOpen: control?.open ?? false,
        summaryFocused: document.activeElement === trigger,
        optionLanguages: [
          ...document.querySelectorAll<HTMLElement>(
            "[data-interface-language-option]",
          ),
        ].map((option) => option.lang),
      };
    });

    if (
      contractFailures.length > 0 ||
      localeRequestCount !== 0 ||
      !firstDownFocused ||
      !firstFocusIndicatorVisible ||
      !secondDownFocused ||
      !firstUpFocused ||
      finalState.detailsOpen ||
      !finalState.summaryFocused ||
      finalState.optionLanguages.join(",") !== "bg,ru"
    ) {
      throw new Error(
        `Raw lifecycle keyboard contract failed: ${JSON.stringify({
          contractFailures,
          localeRequestCount,
          firstDownFocused,
          firstFocusIndicatorVisible,
          secondDownFocused,
          firstUpFocused,
          finalState,
        })}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runRawLifecycleActionReferrerCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    ({ id }) => id === "passport:public-unpublished",
  );
  if (!scenario) {
    throw new Error("Raw lifecycle action-referrer scenario is missing.");
  }

  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  const bulgariaPlan = resolveLocalizationBrowserMarketCase(
    "bulgaria-bg-exactly-one-control",
    "same-path-preference",
  );

  try {
    await installLocalizationMarketCase(context, page, baseUrl, bulgariaPlan);
    const privateMarker = "ove205-private-referrer-marker";
    const initialUrl = new URL(browserSafeFixturePath(scenario.path), baseUrl);
    initialUrl.searchParams.set("token", privateMarker);
    const initialResponse = await page.goto(initialUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (
      initialResponse?.status() !== 404 ||
      (await page.content()).includes(privateMarker)
    ) {
      throw new Error("Raw lifecycle referrer setup was not safely redacted.");
    }

    const navigationPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.locator("main > a").click();
    const navigationResponse = await navigationPromise;
    await assertDocumentNavigationRefererSuppressed(
      navigationResponse,
      "Raw lifecycle primary action",
    );
  } finally {
    await context.close();
  }
}

async function runRawLifecyclePreferenceRecoveryCheck(
  browser: Browser,
  baseUrl: URL,
  mode: "ambiguous-commit" | "request-timeout" | "rollback-failure-retry",
) {
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    ({ id }) => id === "passport:public-unpublished",
  );
  if (!scenario) {
    throw new Error("Raw lifecycle recovery scenario is missing.");
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const bulgariaPlan = resolveLocalizationBrowserMarketCase(
    "bulgaria-bg-exactly-one-control",
    "same-path-preference",
  );
  const mutationFailures: string[] = [];
  let targetRequestCount = 0;
  let rollbackRequestCount = 0;
  let postInteractionDocumentRequestCount = 0;
  const expectedFailureMessage =
    getInterfaceCopy("bg").shell.languageFlushFailure;

  try {
    if (mode === "request-timeout") {
      await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout.bind(window);
        let acceleratedAbortTimer = false;
        window.setTimeout = ((
          ...args: Parameters<typeof window.setTimeout>
        ) => {
          const [handler, timeout = 0, ...handlerArgs] = args;
          const shouldAccelerate = !acceleratedAbortTimer && timeout === 10_000;
          if (shouldAccelerate) acceleratedAbortTimer = true;
          return nativeSetTimeout(
            handler,
            shouldAccelerate ? 40 : timeout,
            ...handlerArgs,
          );
        }) as typeof window.setTimeout;
      });
    }

    await page.route(
      `**${INTERFACE_LOCALE_PREFERENCE_ENDPOINT}`,
      async (route) => {
        const request = route.request();
        const body = request.postData();
        const locale = body
          ? ((JSON.parse(body) as { locale?: unknown }).locale ?? null)
          : null;
        const headers = await request.allHeaders();
        mutationFailures.push(
          ...validateLocaleOnlyPreferenceMutation({
            method: request.method(),
            url: request.url(),
            postData: body,
            locale: locale === "bg" || locale === "ru" ? locale : "ru",
          }),
        );
        if (headers.referer) mutationFailures.push("locale-recovery-referer");

        if (locale === "ru" && targetRequestCount === 0) {
          targetRequestCount += 1;
          if (mode === "ambiguous-commit") {
            await context.addCookies([
              {
                name: INTERFACE_LOCALE_COOKIE_NAME,
                value: "ru",
                url: baseUrl.origin,
                httpOnly: true,
                sameSite: "Lax",
              },
            ]);
          } else if (mode === "request-timeout") {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          await route.abort("timedout").catch(() => undefined);
          return;
        }

        if (locale === "bg") {
          rollbackRequestCount += 1;
          if (mode === "rollback-failure-retry" && rollbackRequestCount === 1) {
            await route.abort("timedout").catch(() => undefined);
            return;
          }
        }
        await route.continue();
      },
    );

    await installLocalizationMarketCase(context, page, baseUrl, bulgariaPlan);
    const route = `${browserSafeFixturePath(scenario.path)}#ove205-raw-recovery`;
    const initialResponse = await page.goto(
      new URL(route, baseUrl).toString(),
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      },
    );
    await waitForStablePage(page);
    if (initialResponse?.status() !== 404) {
      throw new Error(`Raw lifecycle ${mode} setup did not render 404.`);
    }
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        request.resourceType() === "document"
      ) {
        postInteractionDocumentRequestCount += 1;
      }
    });

    const details = page.locator('[data-interface-language-control="true"]');
    await details.locator("summary").click();
    await details
      .locator('[data-interface-language-option][data-interface-locale="ru"]')
      .click();

    let recoveryFocusIndicatorVisible = true;
    let recoverySummaryFencePassed = true;
    if (mode === "rollback-failure-retry") {
      await page.waitForFunction((failureMessage) => {
        const options = [
          ...document.querySelectorAll<HTMLButtonElement>(
            "[data-interface-language-option]",
          ),
        ];
        const status = document.querySelector(
          "[data-interface-language-status]",
        );
        const recovery = document.querySelector<HTMLButtonElement>(
          "[data-interface-language-recovery]",
        );
        const statusStyle = status ? getComputedStyle(status) : null;
        const statusRect = status?.getBoundingClientRect();
        const current = document.querySelector(
          '[data-interface-language-option][data-interface-locale="bg"]',
        );
        return (
          document.documentElement.lang === "bg" &&
          current?.getAttribute("aria-checked") === "true" &&
          options.length === 2 &&
          options.every((option) => option.disabled) &&
          recovery !== null &&
          recovery.hidden === false &&
          recovery.disabled === false &&
          document.activeElement === recovery &&
          status?.textContent === failureMessage &&
          statusStyle?.display !== "none" &&
          statusStyle?.visibility !== "hidden" &&
          Number(statusStyle?.opacity ?? 1) > 0 &&
          (statusRect?.width ?? 0) > 1 &&
          (statusRect?.height ?? 0) > 1
        );
      }, expectedFailureMessage);
      const recovery = page.locator("[data-interface-language-recovery]");
      const summary = details.locator("summary");
      await summary.click();
      const pointerFencePassed = await page.evaluate(() => {
        const details = document.querySelector<HTMLDetailsElement>(
          '[data-interface-language-control="true"]',
        );
        const summary = details?.querySelector("summary");
        const recovery = document.querySelector<HTMLButtonElement>(
          "[data-interface-language-recovery]",
        );
        return (
          details?.open === false &&
          summary?.getAttribute("aria-disabled") === "true" &&
          document.activeElement === recovery
        );
      });
      await summary.focus();
      await page.keyboard.press("Enter");
      const keyboardFencePassed = await page.evaluate(() => {
        const details = document.querySelector<HTMLDetailsElement>(
          '[data-interface-language-control="true"]',
        );
        const recovery = document.querySelector<HTMLButtonElement>(
          "[data-interface-language-recovery]",
        );
        return details?.open === false && document.activeElement === recovery;
      });
      recoverySummaryFencePassed = pointerFencePassed && keyboardFencePassed;
      await summary.focus();
      await page.keyboard.press("Tab");
      recoveryFocusIndicatorVisible = await recovery.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          document.activeElement === element &&
          style.outlineStyle === "solid" &&
          Number.parseFloat(style.outlineWidth) >= 3 &&
          style.outlineColor !== "transparent" &&
          style.outlineColor !== "rgba(0, 0, 0, 0)"
        );
      });
      await recovery.click();
    }

    await page.waitForFunction((failureMessage) => {
      const options = [
        ...document.querySelectorAll<HTMLButtonElement>(
          "[data-interface-language-option]",
        ),
      ];
      const status = document.querySelector("[data-interface-language-status]");
      const recovery = document.querySelector<HTMLButtonElement>(
        "[data-interface-language-recovery]",
      );
      const current = document.querySelector(
        '[data-interface-language-option][data-interface-locale="bg"]',
      );
      const summary = document.querySelector(
        "[data-interface-language-control] summary",
      );
      return (
        document.documentElement.lang === "bg" &&
        current?.getAttribute("aria-checked") === "true" &&
        options.length === 2 &&
        options.every((option) => !option.disabled) &&
        recovery?.hidden === true &&
        document.activeElement === summary &&
        status?.textContent === failureMessage
      );
    }, expectedFailureMessage);

    const cookies = await context.cookies(baseUrl.origin);
    const localeCookies = cookies.filter(
      ({ name }) => name === INTERFACE_LOCALE_COOKIE_NAME,
    );
    const recoveryState = await page.evaluate((failureMessage) => {
      const details = document.querySelector<HTMLDetailsElement>(
        '[data-interface-language-control="true"]',
      );
      const summary = details?.querySelector("summary");
      const recovery = document.querySelector<HTMLButtonElement>(
        "[data-interface-language-recovery]",
      );
      const status = document.querySelector<HTMLElement>(
        "[data-interface-language-status]",
      );
      const statusStyle = status ? getComputedStyle(status) : null;
      const statusRect = status?.getBoundingClientRect();
      return {
        detailsOpen: details?.open ?? false,
        recoveryHidden: recovery?.hidden ?? false,
        summaryFocused: document.activeElement === summary,
        htmlLang: document.documentElement.lang,
        bgChecked:
          document
            .querySelector(
              '[data-interface-language-option][data-interface-locale="bg"]',
            )
            ?.getAttribute("aria-checked") === "true",
        failureMessageMatches: status?.textContent === failureMessage,
        statusVisible:
          statusStyle?.display !== "none" &&
          statusStyle?.visibility !== "hidden" &&
          Number(statusStyle?.opacity ?? 1) > 0 &&
          (statusRect?.width ?? 0) > 1 &&
          (statusRect?.height ?? 0) > 1,
      };
    }, expectedFailureMessage);
    const current = new URL(page.url());
    const expected = new URL(route, baseUrl);
    const expectedRollbackRequestCount =
      mode === "rollback-failure-retry" ? 2 : 1;
    if (
      mutationFailures.length > 0 ||
      targetRequestCount !== 1 ||
      rollbackRequestCount !== expectedRollbackRequestCount ||
      targetRequestCount + rollbackRequestCount !==
        1 + expectedRollbackRequestCount ||
      postInteractionDocumentRequestCount !== 0 ||
      localeCookies.length !== 1 ||
      localeCookies[0]?.value !== "bg" ||
      current.pathname !== expected.pathname ||
      current.search !== expected.search ||
      current.hash !== expected.hash ||
      !recoveryState.detailsOpen ||
      !recoveryState.recoveryHidden ||
      !recoveryState.summaryFocused ||
      recoveryState.htmlLang !== "bg" ||
      !recoveryState.bgChecked ||
      !recoveryState.failureMessageMatches ||
      !recoveryState.statusVisible ||
      !recoverySummaryFencePassed ||
      !recoveryFocusIndicatorVisible
    ) {
      throw new Error(
        `Raw lifecycle ${mode} recovery failed: ${JSON.stringify({
          mutationFailures,
          targetRequestCount,
          rollbackRequestCount,
          expectedRollbackRequestCount,
          recoveryFocusIndicatorVisible,
          recoverySummaryFencePassed,
          postInteractionDocumentRequestCount,
          localeCookieCount: localeCookies.length,
          localeCookieValue: localeCookies[0]?.value ?? null,
          pathnameMatches: current.pathname === expected.pathname,
          searchMatches: current.search === expected.search,
          hashMatches: current.hash === expected.hash,
          recoveryState,
        })}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runGenericNotFoundLocalizationCheck(
  browser: Browser,
  baseUrl: URL,
) {
  for (const viewport of [
    { id: "mobile-320", width: 320, height: 844 },
    { id: "desktop-1440", width: 1440, height: 900 },
  ] as const) {
    for (const marketCase of [
      "ukraine-uk-zero-control",
      "bulgaria-bg-exactly-one-control",
      "bulgaria-ru-exactly-one-control",
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      try {
        await openLocalizationInteractionCase({
          context,
          page,
          baseUrl,
          route: `/ove205-generic-not-found-${viewport.id}/unmatched/deep`,
          routeMode: "localized-link",
          marketCase,
          expectedStatus: 404,
        });
        const structure = await readPageStructure(page);
        if (
          structure.mainCount !== 1 ||
          structure.h1Count !== 1 ||
          structure.horizontalOverflow > 1 ||
          structure.offscreenControlCount > 0
        ) {
          throw new Error(
            `Generic not-found failed for ${marketCase} at ${viewport.id}.`,
          );
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function runGlobalErrorLocalizationCheck(browser: Browser, baseUrl: URL) {
  for (const viewport of [
    { id: "mobile-320", width: 320, height: 844 },
    { id: "desktop-1440", width: 1440, height: 900 },
  ] as const) {
    for (const marketCase of [
      "ukraine-uk-zero-control",
      "bulgaria-bg-exactly-one-control",
      "bulgaria-ru-exactly-one-control",
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const plan = resolveLocalizationBrowserMarketCase(
        marketCase,
        "same-path-preference",
      );
      try {
        await installLocalizationMarketCase(context, page, baseUrl, plan);
        const contextResponsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === INTERFACE_CONTEXT_ENDPOINT,
          { timeout: 45_000 },
        );
        const response = await page.goto(
          new URL("/garden?visualLocaleState=global-error", baseUrl).toString(),
          { waitUntil: "domcontentloaded", timeout: 45_000 },
        );
        const responseHtml = response ? await response.text() : "";
        const globalError = page.locator('[data-global-error="true"]');
        await globalError.waitFor({ state: "visible", timeout: 15_000 });
        const contextResponse = await contextResponsePromise;
        await page.waitForFunction(
          (locale) => document.documentElement.lang === locale,
          plan.locale,
          { timeout: 15_000 },
        );
        await waitForStablePage(page);

        const contextRequest = contextResponse.request();
        const contextUrl = new URL(contextRequest.url());
        const contextPayload = (await contextResponse.json()) as {
          market?: unknown;
          locale?: unknown;
        };
        const failures = [
          ...(await assertLocaleResponseContract(page, response, plan.locale)),
          ...(await localizationMarketCookieFailures(context, baseUrl, plan)),
          ...(await localizationControlFailures(
            page,
            "site-shell-interface-language-control",
            plan.expectedControlCount,
          )),
        ];
        const structure = await readPageStructure(page);
        const metadataHintMatches = hasInterfaceContextMetadataHint(
          responseHtml,
          `${plan.market}:${plan.locale}`,
        );
        if (
          !response ||
          response.status() < 500 ||
          contextResponse.status() !== 200 ||
          contextRequest.method() !== "GET" ||
          contextUrl.search ||
          (await contextRequest.allHeaders()).referer ||
          contextPayload.market !== plan.market ||
          contextPayload.locale !== plan.locale ||
          !metadataHintMatches ||
          (await globalError.count()) !== 1 ||
          structure.mainCount !== 1 ||
          structure.h1Count !== 1 ||
          structure.horizontalOverflow > 1 ||
          structure.offscreenControlCount > 0 ||
          failures.length > 0
        ) {
          throw new Error(
            `Global error ${marketCase}@${viewport.id} failed localization proof: ${failures.join(",")}`,
          );
        }
        if (
          (await page.locator("body").innerText()).includes(
            "Deterministic localization global-error fixture.",
          )
        ) {
          throw new Error("Global error exposed its private fixture cause.");
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function runGlobalErrorMetadataFallbackCheck(
  browser: Browser,
  baseUrl: URL,
) {
  for (const viewport of [
    { id: "mobile-320", width: 320, height: 844 },
    { id: "desktop-1440", width: 1440, height: 900 },
  ] as const) {
    for (const marketCase of [
      "ukraine-uk-zero-control",
      "bulgaria-bg-exactly-one-control",
      "bulgaria-ru-exactly-one-control",
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const plan = resolveLocalizationBrowserMarketCase(
        marketCase,
        "same-path-preference",
      );
      let releaseContextRequest: () => void = () => undefined;
      const contextRequestGate = new Promise<void>((resolve) => {
        releaseContextRequest = resolve;
      });
      let markContextAborted: () => void = () => undefined;
      const contextAborted = new Promise<void>((resolve) => {
        markContextAborted = resolve;
      });

      try {
        await page.route(`**${INTERFACE_CONTEXT_ENDPOINT}`, async (route) => {
          await contextRequestGate;
          await route.abort("failed").catch(() => undefined);
          markContextAborted();
        });
        await installLocalizationMarketCase(context, page, baseUrl, plan);
        const contextRequestPromise = page.waitForRequest(
          (request) =>
            new URL(request.url()).pathname === INTERFACE_CONTEXT_ENDPOINT,
          { timeout: 45_000 },
        );
        const response = await page.goto(
          new URL("/garden?visualLocaleState=global-error", baseUrl).toString(),
          { waitUntil: "domcontentloaded", timeout: 45_000 },
        );
        const responseHtml = response ? await response.text() : "";
        const contextRequest = await contextRequestPromise;
        const globalError = page.locator('[data-global-error="true"]');
        await globalError.waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForFunction(
          (locale) => document.documentElement.lang === locale,
          plan.locale,
          { timeout: 15_000 },
        );

        const assertFallbackState = async (stage: "pending" | "failed") => {
          const failures = [
            ...(await assertLocaleResponseContract(
              page,
              response,
              plan.locale,
            )),
            ...(await localizationControlFailures(
              page,
              "site-shell-interface-language-control",
              plan.expectedControlCount,
            )),
          ];
          const metadataHintMatches = hasInterfaceContextMetadataHint(
            responseHtml,
            `${plan.market}:${plan.locale}`,
          );
          const expectedTitle = getInterfaceCopy(plan.locale).shell.errorTitle;
          const structure = await readPageStructure(page);
          if (
            !response ||
            response.status() < 500 ||
            !metadataHintMatches ||
            (await page
              .getByRole("heading", {
                level: 1,
                name: expectedTitle,
                exact: true,
              })
              .count()) !== 1 ||
            structure.mainCount !== 1 ||
            structure.h1Count !== 1 ||
            structure.horizontalOverflow > 1 ||
            structure.offscreenControlCount > 0 ||
            failures.length > 0
          ) {
            throw new Error(
              `Global error metadata fallback ${marketCase}@${viewport.id}:${stage} failed: ${failures.join(",")}`,
            );
          }
        };

        const contextUrl = new URL(contextRequest.url());
        if (
          contextRequest.method() !== "GET" ||
          contextUrl.search ||
          (await contextRequest.allHeaders()).referer
        ) {
          throw new Error(
            "Global error fallback context request was not narrow.",
          );
        }
        await assertFallbackState("pending");
        releaseContextRequest();
        await contextAborted;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await assertFallbackState("failed");
      } finally {
        releaseContextRequest();
        await context.close();
      }
    }
  }
}

async function runSafeFlushFailureLocalizationCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let monitorRequests = false;
  let preferenceRequests = 0;
  let documentRequests = 0;

  page.on("request", (request) => {
    if (!monitorRequests) return;
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      preferenceRequests += 1;
    }
    if (
      request.isNavigationRequest() &&
      request.resourceType() === "document"
    ) {
      documentRequests += 1;
    }
  });

  try {
    const { plan } = await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/garden?visualLocaleState=safe-flush-failure",
      routeMode: "same-path-preference",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    if (
      (await page
        .locator('[data-interface-safe-flush-failure-fixture="true"]')
        .count()) !== 1
    ) {
      throw new Error("Safe-flush failure fixture was not registered.");
    }

    const initialUrl = page.url();
    monitorRequests = true;
    const { trigger, popup } = await openInterfaceLanguageMenu(page);
    await interfaceLanguageMenuItem(page, "ru").click();

    const failureMessage =
      "Промените не можаха да се запазят преди смяната на езика. Опитайте отново.";
    const status = page
      .locator('[role="status"]')
      .filter({ hasText: failureMessage });
    await status.waitFor({ state: "visible", timeout: 5_000 });
    await trigger.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLButtonElement>(
          '[data-interface-language-trigger="true"]',
        );
        return Boolean(element && !element.disabled);
      },
      undefined,
      { timeout: 5_000 },
    );

    const failures = [
      ...(await localizationMarketCookieFailures(context, baseUrl, plan)),
      ...(await localizationControlFailures(
        page,
        "site-shell-interface-language-control",
        1,
      )),
    ];
    if (
      page.url() !== initialUrl ||
      (await page.locator("html").getAttribute("lang")) !== "bg" ||
      preferenceRequests !== 0 ||
      documentRequests !== 0 ||
      !(await trigger.isEnabled()) ||
      failures.length > 0
    ) {
      throw new Error(
        `Safe-flush failure did not remain recoverable and fail closed: ${failures.join(",")}`,
      );
    }

    if (await popup.isVisible()) {
      await page.keyboard.press("Escape");
    } else {
      await trigger.focus();
      await page.keyboard.press("Enter");
      await popup.waitFor({ state: "visible", timeout: 5_000 });
      await page.keyboard.press("Escape");
    }
    await popup.waitFor({ state: "hidden", timeout: 5_000 });
    if (
      !(await trigger.evaluate((element) => element === document.activeElement))
    ) {
      throw new Error(
        "Safe-flush failure did not restore a keyboard-usable language control.",
      );
    }
  } finally {
    await context.close();
  }
}

async function runMixedLocaleTopicCheck(browser: Browser, baseUrl: URL) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/topics/care-checks?__visualKnowledge=corpus",
      routeMode: "localized-link",
      marketCase: "bulgaria-ru-exactly-one-control",
    });
    const interfaceLabel = page.getByText("Проверенная тема", { exact: true });
    const sourceLabel = page.getByRole("heading", {
      level: 1,
      name: "Регулярні спостереження",
      exact: true,
    });
    if (
      (await interfaceLabel.count()) !== 1 ||
      !(await interfaceLabel.isVisible()) ||
      (await sourceLabel.count()) !== 1 ||
      !(await sourceLabel.isVisible())
    ) {
      throw new Error(
        "Russian topic interface did not preserve the Ukrainian source label.",
      );
    }
    const canonicalHref = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    if (
      !canonicalHref ||
      new URL(canonicalHref, baseUrl).pathname !== "/ru/topics/care-checks"
    ) {
      throw new Error("Mixed-locale topic emitted the wrong canonical URL.");
    }
  } finally {
    await context.close();
  }
}

async function runLanguageControlReflowCheck(browser: Browser, baseUrl: URL) {
  const context = await browser.newContext({
    viewport: { width: 640, height: 900 },
  });
  const page = await context.newPage();
  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/journals?__visualJournals=corpus",
      routeMode: "localized-link",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const { trigger, popup, items } = await openInterfaceLanguageMenu(page);
    const structure = await readPageStructure(page);
    if (
      structure.horizontalOverflow > 1 ||
      structure.offscreenControlCount > 0
    ) {
      throw new Error("200% language control reflow loses visible controls.");
    }
    for (const locator of [
      trigger,
      popup,
      ...Array.from({ length: await items.count() }, (_, index) =>
        items.nth(index),
      ),
    ]) {
      const bounds = await locator.boundingBox();
      if (
        !bounds ||
        bounds.x < -1 ||
        bounds.x + bounds.width > 641 ||
        bounds.y < -1 ||
        bounds.y + bounds.height > 901
      ) {
        throw new Error("200% language menu escapes the reflow viewport.");
      }
    }
    await page.keyboard.press("Escape");
  } finally {
    await context.close();
  }
}

async function runDirtyCancelLocalizationCheck(browser: Browser, baseUrl: URL) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const cancelledEmail = "dirty-cancel@example.invalid";
  const cancelledPassword = "dirty-cancel-password";
  const discardedEmail = "fresh-dirty-epoch@example.invalid";
  const discardedPassword = "fresh-dirty-epoch-password";
  let preferenceRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      preferenceRequests += 1;
    }
  });
  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/garden?visualWorkspace=guest",
      routeMode: "same-path-preference",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    const email = page
      .locator('[data-testid="garden-auth-panel"] input[type="email"]')
      .first();
    const password = page
      .locator('[data-testid="garden-auth-panel"] input[type="password"]')
      .first();
    await email.fill(cancelledEmail);
    await password.fill(cancelledPassword);
    await openInterfaceLanguageMenu(page);
    await interfaceLanguageMenuItem(page, "ru").click();
    const dialog = page.locator('[data-slot="alert-dialog-content"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const dialogText = await dialog.innerText();
    if (
      !dialogText.includes("Отхвърляне на незапазените промени?") ||
      !dialogText.includes("Незапазените промени ще бъдат загубени")
    ) {
      throw new Error("Dirty locale change did not explain cancel semantics.");
    }
    const cancel = dialog.getByRole("button", { name: "Отказ", exact: true });
    if (
      !(await cancel.evaluate((element) => element === document.activeElement))
    ) {
      throw new Error(
        "Dirty locale dialog did not focus the safe cancel action.",
      );
    }
    await cancel.click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });

    if (
      (await email.inputValue()) !== cancelledEmail ||
      (await password.inputValue()) !== cancelledPassword ||
      new URL(page.url()).pathname !== "/garden" ||
      preferenceRequests !== 0
    ) {
      throw new Error("Cancelled locale change lost dirty input or navigated.");
    }
    const trigger = page
      .locator('[data-interface-language-trigger="true"]:visible')
      .first();
    if (!(await trigger.isEnabled())) {
      throw new Error(
        "Cancelled locale change left the shared control frozen.",
      );
    }
    if (
      !(await trigger.evaluate((element) => element === document.activeElement))
    ) {
      throw new Error(
        "Dirty locale cancellation did not restore trigger focus.",
      );
    }

    await email.fill(discardedEmail);
    await password.fill(discardedPassword);
    await openInterfaceLanguageMenu(page);
    await interfaceLanguageMenuItem(page, "ru").click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    const preferenceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
      { timeout: 45_000 },
    );
    const navigationPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await dialog
      .getByRole("button", {
        name: "Отхвърли и смени езика",
        exact: true,
      })
      .click();
    const [preferenceResponse, navigationResponse] = await Promise.all([
      preferenceResponsePromise,
      navigationPromise,
    ]);
    await waitForStablePage(page);
    await assertDocumentNavigationRefererSuppressed(
      navigationResponse,
      "Dirty-discard language switch",
    );

    const preferenceRequest = preferenceResponse.request();
    const mutationFailures = validateLocaleOnlyPreferenceMutation({
      method: preferenceRequest.method(),
      url: preferenceRequest.url(),
      postData: preferenceRequest.postData(),
      locale: "ru",
    });
    if (
      preferenceResponse.status() !== 204 ||
      mutationFailures.length > 0 ||
      preferenceRequest.redirectedFrom() ||
      (await preferenceRequest.allHeaders()).referer ||
      Number(preferenceRequests) !== 1
    ) {
      throw new Error("Dirty-discard locale mutation was not narrow and safe.");
    }

    const documentRequest = navigationResponse?.request();
    const boundedEvidence = JSON.stringify({
      preferenceUrl: preferenceRequest.url(),
      preferenceBody: preferenceRequest.postData(),
      preferenceHeaders: await preferenceRequest.allHeaders(),
      documentUrl: documentRequest?.url(),
      documentHeaders: await documentRequest?.allHeaders(),
    });
    if (
      [
        cancelledEmail,
        cancelledPassword,
        discardedEmail,
        discardedPassword,
      ].some((value) => boundedEvidence.includes(value))
    ) {
      throw new Error("Dirty auth values escaped into locale-switch evidence.");
    }

    const russianPlan = resolveLocalizationBrowserMarketCase(
      "bulgaria-ru-exactly-one-control",
      "same-path-preference",
    );
    const convergenceFailures = [
      ...(await assertLocaleResponseContract(page, navigationResponse, "ru")),
      ...(await localizationMarketCookieFailures(
        context,
        baseUrl,
        russianPlan,
      )),
    ];
    if (
      convergenceFailures.length > 0 ||
      new URL(page.url()).pathname !== "/garden"
    ) {
      throw new Error("Dirty-discard branch did not converge to Russian.");
    }
    const reloadedAuthPanel = page.locator('[data-testid="garden-auth-panel"]');
    if (
      (await reloadedAuthPanel.locator('input[type="email"]').inputValue()) ||
      (await reloadedAuthPanel.locator('input[type="password"]').inputValue())
    ) {
      throw new Error("Dirty-discard branch restored discarded auth values.");
    }
  } finally {
    await context.close();
  }
}

async function runInFlightLocalizationCheck(browser: Browser, baseUrl: URL) {
  for (const action of ["sign-in-submit", "sign-up-button"] as const) {
    await runInFlightAuthActionCheck(browser, baseUrl, action);
  }
}

async function runServerActionPendingLocalizationCheck(
  browser: Browser,
  baseUrl: URL,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let localePreferenceRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      localePreferenceRequests += 1;
    }
  });

  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/garden?visualLocaleState=server-action-pending",
      routeMode: "same-path-preference",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    const fixture = page.locator(
      '[data-interface-server-action-pending-fixture="true"]',
    );
    const form = fixture.locator("form");
    const submit = fixture.locator(
      '[data-interface-server-action-submit="true"]',
    );
    const trigger = page.locator('[data-interface-language-trigger="true"]');
    if (
      (await fixture.getAttribute("data-interface-server-action-delay-ms")) !==
        "2000" ||
      (await form.getAttribute("data-interface-locale-form")) !== "ignore" ||
      (await submit.getAttribute("data-pending")) !== "false"
    ) {
      throw new Error("Held Server Action fixture contract is invalid.");
    }

    const initialUrl = page.url();
    const actionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/garden",
      { timeout: 5_000 },
    );
    const pendingFencePromise = page.waitForFunction(
      () => {
        const fixture = document.querySelector(
          '[data-interface-server-action-pending-fixture="true"]',
        );
        const submit = fixture?.querySelector<HTMLButtonElement>(
          '[data-interface-server-action-submit="true"]',
        );
        const status = fixture?.querySelector(
          '[data-interface-server-action-status="pending"]',
        );
        const trigger = document.querySelector<HTMLButtonElement>(
          '[data-interface-language-trigger="true"]',
        );
        return Boolean(
          status &&
          submit?.dataset.pending === "true" &&
          submit.disabled &&
          trigger?.disabled,
        );
      },
      undefined,
      { timeout: 5_000 },
    );
    await submit.click();
    const [actionRequest] = await Promise.all([
      actionRequestPromise,
      pendingFencePromise,
    ]);
    const actionHeaders = await actionRequest.allHeaders();

    if (
      !actionHeaders["next-action"] ||
      localePreferenceRequests !== 0 ||
      page.url() !== initialUrl
    ) {
      throw new Error(
        "A genuine pending Next Server Action did not fence locale changes.",
      );
    }

    await fixture
      .locator('[data-interface-server-action-status="ready"]')
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLButtonElement>(
          '[data-interface-language-trigger="true"]',
        );
        return Boolean(element && !element.disabled);
      },
      undefined,
      { timeout: 5_000 },
    );
    if (
      (await submit.getAttribute("data-pending")) !== "false" ||
      !(await submit.isEnabled()) ||
      !(await trigger.isEnabled()) ||
      localePreferenceRequests !== 0 ||
      page.url() !== initialUrl ||
      (await page.locator("html").getAttribute("lang")) !== "bg"
    ) {
      throw new Error(
        "Locale-change fence did not settle after the genuine Server Action.",
      );
    }
  } finally {
    await context.close();
  }
}

async function runInFlightAuthActionCheck(
  browser: Browser,
  baseUrl: URL,
  action: "sign-in-submit" | "sign-up-button",
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let releaseRequest: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let localePreferenceRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === INTERFACE_LOCALE_PREFERENCE_ENDPOINT
    ) {
      localePreferenceRequests += 1;
    }
  });
  await page.route("**/api/auth/**", async (route) => {
    await heldRequest;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"message":"deterministic browser rejection"}',
    });
  });

  try {
    await openLocalizationInteractionCase({
      context,
      page,
      baseUrl,
      route: "/garden?visualWorkspace=guest",
      routeMode: "same-path-preference",
      marketCase: "bulgaria-bg-exactly-one-control",
    });
    const authPanel = page.locator('[data-testid="garden-auth-panel"]');
    await authPanel
      .locator('input[type="email"]')
      .fill("pending@example.invalid");
    await authPanel.locator('input[type="password"]').fill("pending-password");
    const expectedAuthPath =
      action === "sign-in-submit"
        ? "/api/auth/sign-in/email"
        : "/api/auth/sign-up/email";
    const authRequestPromise = page.waitForRequest(
      (request) => new URL(request.url()).pathname === expectedAuthPath,
      { timeout: 10_000 },
    );
    if (action === "sign-in-submit") {
      await authPanel.locator('button[type="submit"]').click();
    } else {
      await authPanel
        .getByRole("button", { name: "Създаване на профил", exact: true })
        .click();
    }
    const authRequest = await authRequestPromise;
    if (action === "sign-up-button") {
      const signUpPayload = authRequest.postDataJSON() as {
        name?: unknown;
      };
      if (signUpPayload.name !== PRIVATE_SIGN_UP_COMPATIBILITY.name) {
        throw new Error(
          "Sign-up request omitted the private auth compatibility value.",
        );
      }
    }

    const control = page.locator(
      '[data-interface-language-control="site-shell-interface-language-control"]',
    );
    const status = control.getByRole("status");
    await status.waitFor({ state: "visible", timeout: 5_000 });
    if (
      !(await status.innerText()).includes(
        "Изчакайте текущото действие да завърши",
      )
    ) {
      throw new Error(
        "In-flight mutation did not expose localized blocking state.",
      );
    }
    const trigger = control.locator('[data-interface-language-trigger="true"]');
    if ((await trigger.isEnabled()) || localePreferenceRequests !== 0) {
      throw new Error(`${action} did not disable locale changes in flight.`);
    }

    const authResponsePromise = authRequest.response();
    releaseRequest();
    const authResponse = await authResponsePromise;
    if (!authResponse || authResponse.status() !== 500) {
      throw new Error(`${action} did not reach deterministic settlement.`);
    }
    await status.waitFor({ state: "hidden", timeout: 5_000 });
    await trigger.waitFor({ state: "visible", timeout: 5_000 });
    if (!(await trigger.isEnabled()) || localePreferenceRequests !== 0) {
      throw new Error(
        `${action} left the locale-change fence active after settlement.`,
      );
    }
  } finally {
    releaseRequest();
    await context.close();
  }
}

async function runInteractions(
  browser: Browser,
  baseUrl: URL,
  summary: AuditSummary,
): Promise<void> {
  await runInterfaceLanguageMenuKeyboardCheck(browser, baseUrl);
  summary.localization.interactionProofs.menuKeyboardEscapeFocus = true;
  await runLocalizedSafeStateContinuityCheck(browser, baseUrl);
  await runNestedJournalReturnLocaleContinuityCheck(browser, baseUrl);
  summary.localization.interactionProofs.localizedSafeStateContinuity = true;
  await runLocalizedUnsafeStateRejectionCheck(browser, baseUrl);
  summary.localization.interactionProofs.unsafeLocalizedStateRejected = true;
  await runSamePathPreferencePersistenceCheck(browser, baseUrl);
  summary.localization.interactionProofs.samePathPreferencePersistence = true;
  await runRawLifecycleSamePathPreferenceCheck(browser, baseUrl);
  summary.localization.interactionProofs.rawSamePathPreferencePersistence = true;
  await runRawLifecycleMenuKeyboardCheck(browser, baseUrl);
  summary.localization.interactionProofs.rawMenuKeyboardEscapeFocus = true;
  await runRawLifecycleActionReferrerCheck(browser, baseUrl);
  summary.localization.interactionProofs.rawActionReferrerSuppression = true;
  await runRawLifecyclePreferenceRecoveryCheck(
    browser,
    baseUrl,
    "ambiguous-commit",
  );
  summary.localization.interactionProofs.rawAmbiguousCommitRollback = true;
  await runRawLifecyclePreferenceRecoveryCheck(
    browser,
    baseUrl,
    "request-timeout",
  );
  summary.localization.interactionProofs.rawRequestTimeoutRecovery = true;
  await runRawLifecyclePreferenceRecoveryCheck(
    browser,
    baseUrl,
    "rollback-failure-retry",
  );
  summary.localization.interactionProofs.rawFailedRollbackRetry = true;
  summary.localization.interactionProofs.documentNavigationRefererSuppression = true;
  await runDirtyCancelLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.dirtyCancel = true;
  summary.localization.interactionProofs.dirtyDiscard = true;
  await runInFlightLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.inFlightBlocked = true;
  summary.localization.interactionProofs.inFlightSettlement = true;
  await runServerActionPendingLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.serverActionPendingFence = true;
  await runSafeFlushFailureLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.safeFlushFailure = true;
  await runGlobalErrorLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.globalError = true;
  await runGlobalErrorMetadataFallbackCheck(browser, baseUrl);
  summary.localization.interactionProofs.globalErrorMetadataFallback = true;
  await runGenericNotFoundLocalizationCheck(browser, baseUrl);
  summary.localization.interactionProofs.genericNotFound = true;
  await runMixedLocaleTopicCheck(browser, baseUrl);
  summary.localization.interactionProofs.mixedLocaleTopic = true;
  await runLanguageControlReflowCheck(browser, baseUrl);
  summary.localization.interactionProofs.languageControlReflow200 = true;
  await runKeyboardAndDrawerCheck(browser, baseUrl);
  summary.interactions.keyboardAndDrawer = true;
  await runReducedMotionCheck(browser, baseUrl);
  summary.interactions.reducedMotion = true;
  await runLargeTextCheck(browser, baseUrl);
  summary.interactions.largeText = true;
  await runAuthIntentCheck(browser, baseUrl);
  summary.interactions.authIntent = true;
  await runSafetyControlCheck(browser, baseUrl);
  summary.interactions.safetyControls = true;
  summary.localization.continuityLocales = await runLocaleContinuityCheck(
    browser,
    baseUrl,
  );
}

function failureMessage(failures: Failure[]): string {
  const visible = failures
    .slice(0, 80)
    .map(
      ({ scenarioId, viewportId, check, detail }) =>
        `${scenarioId}@${viewportId} ${check} ${detail}`,
    );
  const remainder = failures.length - visible.length;
  return [
    `OVE-185 failed ${failures.length} checks.`,
    ...visible,
    ...(remainder > 0 ? [`...and ${remainder} more.`] : []),
  ].join("\n");
}

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const fixtureResponse = await fetch(new URL("/__visual-fixtures", baseUrl));
  if (!fixtureResponse.ok) {
    throw new Error(
      "OVE-187 visual fixtures are not reachable on the audit origin.",
    );
  }

  const axeSource = await readFile(AXE_SOURCE_PATH, "utf8");
  const failures: Failure[] = [];
  const summary: AuditSummary = {
    scenarioCount: CORE_JOURNEY_SCENARIOS.length,
    viewportCount: CORE_JOURNEY_VIEWPORTS.length,
    pageChecks: 0,
    axeChecks: 0,
    screenshots: [],
    localization: {
      routeContracts: 0,
      continuityLocales: [],
      ownerProbeChecks: 0,
      ownerProofs: [],
      edgeStates: [],
      marketCaseChecks: 0,
      marketCases: [],
      markets: [],
      controlContractChecks: 0,
      interactionProofs: {
        menuKeyboardEscapeFocus: false,
        localizedSafeStateContinuity: false,
        unsafeLocalizedStateRejected: false,
        samePathPreferencePersistence: false,
        rawSamePathPreferencePersistence: false,
        rawMenuKeyboardEscapeFocus: false,
        rawActionReferrerSuppression: false,
        rawAmbiguousCommitRollback: false,
        rawRequestTimeoutRecovery: false,
        rawFailedRollbackRetry: false,
        documentNavigationRefererSuppression: false,
        genericNotFound: false,
        mixedLocaleTopic: false,
        languageControlReflow200: false,
        globalError: false,
        globalErrorMetadataFallback: false,
        safeFlushFailure: false,
        dirtyCancel: false,
        dirtyDiscard: false,
        inFlightBlocked: false,
        inFlightSettlement: false,
        serverActionPendingFence: false,
      },
      downstreamOwnedBrowserProofs: LOCALIZATION_DOWNSTREAM_UI_GATES,
    },
    interactions: {
      authIntent: false,
      keyboardAndDrawer: false,
      largeText: false,
      reducedMotion: false,
      safetyControls: false,
    },
  };
  const browser = await chromium.launch({ headless: true });

  try {
    await runMatrix(browser, baseUrl, axeSource, failures, summary);
    if (failures.length === 0) {
      await runLocalizationOwnerProbeMatrix(
        browser,
        baseUrl,
        axeSource,
        failures,
        summary,
      );
    }
    if (failures.length === 0) {
      await runInteractions(browser, baseUrl, summary);
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) throw new Error(failureMessage(failures));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void main();
}
