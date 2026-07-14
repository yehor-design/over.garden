import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  browserSafeFixturePath,
  CORE_JOURNEY_SCENARIOS,
  CORE_JOURNEY_VIEWPORTS,
  type CoreJourneyScenario,
  type CoreJourneyViewportId,
} from "../src/lib/accessibility/core-journey-matrix";

const require = createRequire(import.meta.url);
const AXE_SOURCE_PATH = require.resolve("axe-core/axe.min.js");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const AXE_VIEWPORTS = new Set<CoreJourneyViewportId>([
  "mobile-320",
  "desktop-1440",
]);
const EVIDENCE_SCREENSHOTS = new Map([
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
  interactions: {
    authIntent: boolean;
    keyboardAndDrawer: boolean;
    largeText: boolean;
    reducedMotion: boolean;
    safetyControls: boolean;
  };
}

function resolveBaseUrl(): URL {
  const baseUrl = new URL(
    process.env.ACCESSIBILITY_BASE_URL ?? "http://127.0.0.1:3000",
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
    scenario.fixture.collection === "profile" &&
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
      const page = await context.newPage();
      let uncaughtErrors = 0;
      page.on("pageerror", () => {
        uncaughtErrors += 1;
      });
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
          }
        }
        stage = "stability";
        await waitForStablePage(page);
        if (scenario.fixture.collection === "intent") {
          await page.waitForTimeout(250);
          await page
            .waitForLoadState("load", { timeout: 15_000 })
            .catch(() => undefined);
          await waitForStablePage(page);
        }
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
        const failure = {
          scenarioId: scenario.id,
          viewportId: viewport.id,
          check: "browser-run",
          detail: `${stage}:${error instanceof Error ? error.name : "unknown"}`,
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
  const context = await browser.newContext({
    viewport: { width: 640, height: 900 },
  });
  const page = await context.newPage();
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
    'input[type="file"]',
    "details summary",
    '[data-auth-intent-control="save"]',
  ];
  for (const selector of requiredControls) {
    const control = page.locator(selector).first();
    if ((await control.count()) === 0 || !(await control.isVisible())) {
      throw new Error(`Large-text creation flow lost ${selector}.`);
    }
  }
  await context.close();
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

async function runInteractions(
  browser: Browser,
  baseUrl: URL,
  summary: AuditSummary,
): Promise<void> {
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
      await runInteractions(browser, baseUrl, summary);
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) throw new Error(failureMessage(failures));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

void main();
