import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const FIXTURE_PATH =
  "/__visual-fixtures/session-recheck?visualSessionRecheck=true";
const SAFARI_TECHNOLOGY_PREVIEW_DRIVER =
  "/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver";
const SAFARI_DRIVER_PORT = 48123;

export type SessionRecheckBrowser = "chromium" | "safari-technology-preview";

export interface SessionRecheckFenceSmokeOptions {
  browser: SessionRecheckBrowser;
  baseUrl: string;
}

export interface SessionRecheckFenceSmokeReport {
  issue: "OVE-236";
  evidenceClass: "local-synthetic-focus-recheck-race";
  browser: SessionRecheckBrowser;
  syntheticFixtureOnly: true;
  privateTreeRemovedBeforeReadResolution: true;
  safeExitsUsable: true;
  exactSessionRecoveryOnly: true;
}

type SessionRecheckDomState = {
  controllerReady: boolean;
  privateFixtureCount: number;
  privateActionCount: number;
  gate: string | null;
  publicHomeHref: string | null;
  reloadDisabled: boolean | null;
};

export async function runSessionRecheckFenceSmoke(
  options: SessionRecheckFenceSmokeOptions,
): Promise<SessionRecheckFenceSmokeReport> {
  const baseUrl = normalizeLoopbackBaseUrl(options.baseUrl);
  if (options.browser === "chromium") {
    await runChromiumFocusRace(baseUrl);
  } else {
    await runSafariTechnologyPreviewFocusRace(baseUrl);
  }

  return {
    issue: "OVE-236",
    evidenceClass: "local-synthetic-focus-recheck-race",
    browser: options.browser,
    syntheticFixtureOnly: true,
    privateTreeRemovedBeforeReadResolution: true,
    safeExitsUsable: true,
    exactSessionRecoveryOnly: true,
  };
}

async function runChromiumFocusRace(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto(fixtureUrl(baseUrl), { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() =>
        Boolean(window.__ove236SessionRecheckFixture),
      );
      await page.waitForSelector(
        '[data-session-recheck-private-fixture="true"]',
      );
      await page.evaluate(() => {
        window.__ove236SessionRecheckFixture?.stallNextRead();
        window.dispatchEvent(new Event("focus"));
      });
      await page.waitForSelector('[data-session-convergence-gate="checking"]');
      assertSafeStalledState(await readChromiumDomState(page));
      await page.evaluate(() =>
        window.__ove236SessionRecheckFixture?.releaseStalledRead(),
      );
      await page.waitForSelector(
        '[data-session-recheck-private-fixture="true"]',
      );
      assertExactRecoveryState(await readChromiumDomState(page));
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function readChromiumDomState(
  page: Page,
): Promise<SessionRecheckDomState> {
  return page.evaluate(readDomState);
}

async function runSafariTechnologyPreviewFocusRace(baseUrl: string) {
  const driver = await startSafariTechnologyPreviewDriver();
  let sessionId: string | null = null;
  try {
    sessionId = await createSafariSession();
    await safariWebDriverRequest("POST", `/session/${sessionId}/url`, {
      url: fixtureUrl(baseUrl),
    });
    await waitForSafariState(sessionId, (state) => state.controllerReady);
    await waitForSafariState(
      sessionId,
      (state) => state.privateFixtureCount === 1,
    );
    await executeSafariScript(
      sessionId,
      `
      window.__ove236SessionRecheckFixture?.stallNextRead();
      window.dispatchEvent(new Event("focus"));
      return true;
    `,
    );
    const stalled = await waitForSafariState(
      sessionId,
      (state) => state.gate === "checking",
    );
    assertSafeStalledState(stalled);
    await executeSafariScript(
      sessionId,
      "window.__ove236SessionRecheckFixture?.releaseStalledRead(); return true;",
    );
    const recovered = await waitForSafariState(
      sessionId,
      (state) => state.privateFixtureCount === 1,
    );
    assertExactRecoveryState(recovered);
  } finally {
    if (sessionId) {
      await safariWebDriverRequest("DELETE", `/session/${sessionId}`).catch(
        () => undefined,
      );
    }
    await stopDriver(driver);
  }
}

function assertSafeStalledState(state: SessionRecheckDomState) {
  if (
    state.privateFixtureCount !== 0 ||
    state.privateActionCount !== 0 ||
    state.gate !== "checking" ||
    state.publicHomeHref !== "/" ||
    state.reloadDisabled !== false
  ) {
    throw new Error("Focus recheck did not synchronously retain a safe gate.");
  }
}

function assertExactRecoveryState(state: SessionRecheckDomState) {
  if (
    state.privateFixtureCount !== 1 ||
    state.privateActionCount !== 1 ||
    state.gate !== null
  ) {
    throw new Error(
      "Exact synthetic session confirmation did not restore once.",
    );
  }
}

function readDomState(): SessionRecheckDomState {
  const reload = document.querySelector<HTMLButtonElement>(
    '[data-session-convergence-reload="true"]',
  );
  const publicHome = document.querySelector<HTMLAnchorElement>(
    '[data-session-convergence-public-home="true"]',
  );
  return {
    controllerReady: Boolean(window.__ove236SessionRecheckFixture),
    privateFixtureCount: document.querySelectorAll(
      '[data-session-recheck-private-fixture="true"]',
    ).length,
    privateActionCount: document.querySelectorAll(
      '[data-session-recheck-private-action="true"]',
    ).length,
    gate:
      document
        .querySelector("[data-session-convergence-gate]")
        ?.getAttribute("data-session-convergence-gate") ?? null,
    publicHomeHref: publicHome?.getAttribute("href") ?? null,
    reloadDisabled: reload?.disabled ?? null,
  };
}

async function startSafariTechnologyPreviewDriver() {
  const driver = spawn(
    SAFARI_TECHNOLOGY_PREVIEW_DRIVER,
    ["-p", String(SAFARI_DRIVER_PORT)],
    { stdio: "ignore" },
  );
  await waitForDriverReady(driver);
  return driver;
}

async function waitForDriverReady(driver: ChildProcess) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (driver.exitCode !== null) {
      throw new Error("Safari Technology Preview WebDriver did not start.");
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${SAFARI_DRIVER_PORT}/status`,
      );
      if (response.ok) return;
    } catch {
      // The driver is still opening its local loopback port.
    }
    await wait(100);
  }
  throw new Error("Safari Technology Preview WebDriver was not ready.");
}

async function createSafariSession() {
  const value = await safariWebDriverRequest<{
    sessionId?: string;
    capabilities?: Record<string, unknown>;
  }>("POST", "/session", {
    capabilities: {
      alwaysMatch: { browserName: "Safari Technology Preview" },
    },
  });
  if (!value.sessionId) {
    throw new Error(
      "Safari Technology Preview WebDriver did not return a session.",
    );
  }
  return value.sessionId;
}

async function waitForSafariState(
  sessionId: string,
  predicate: (state: SessionRecheckDomState) => boolean,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await executeSafariScript<SessionRecheckDomState>(
      sessionId,
      `
        const reload = document.querySelector('[data-session-convergence-reload="true"]');
        const publicHome = document.querySelector('[data-session-convergence-public-home="true"]');
        return {
          controllerReady: Boolean(window.__ove236SessionRecheckFixture),
          privateFixtureCount: document.querySelectorAll('[data-session-recheck-private-fixture="true"]').length,
          privateActionCount: document.querySelectorAll('[data-session-recheck-private-action="true"]').length,
          gate: document.querySelector('[data-session-convergence-gate]')?.getAttribute('data-session-convergence-gate') ?? null,
          publicHomeHref: publicHome?.getAttribute('href') ?? null,
          reloadDisabled: reload ? reload.disabled : null,
        };
      `,
    );
    if (predicate(state)) return state;
    await wait(100);
  }
  throw new Error(
    "Safari Technology Preview did not reach the expected fixture state.",
  );
}

async function executeSafariScript<T>(sessionId: string, script: string) {
  return safariWebDriverRequest<T>(
    "POST",
    `/session/${sessionId}/execute/sync`,
    {
      script,
      args: [],
    },
  );
}

async function safariWebDriverRequest<T>(
  method: "POST" | "DELETE",
  pathname: string,
  body?: unknown,
) {
  const response = await fetch(
    `http://127.0.0.1:${SAFARI_DRIVER_PORT}${pathname}`,
    {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    value?: T & { error?: string; message?: string };
  } | null;
  if (!response.ok || payload?.value?.error) {
    throw new Error("Safari Technology Preview WebDriver command failed.");
  }
  return payload?.value as T;
}

async function stopDriver(driver: ChildProcess) {
  if (driver.exitCode === null) driver.kill();
  await new Promise<void>((resolve) => {
    driver.once("exit", () => resolve());
    setTimeout(resolve, 1_000);
  });
}

function fixtureUrl(baseUrl: string) {
  return `${baseUrl}${FIXTURE_PATH}`;
}

function normalizeLoopbackBaseUrl(value: string) {
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("--base-url must be a loopback origin without a path.");
  }
  return url.origin;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function parseSessionRecheckFenceSmokeOptions(
  argv: string[],
): SessionRecheckFenceSmokeOptions {
  const values = new Map<string, string>();
  const filtered = argv.filter((value) => value !== "--");
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Smoke options must use --name value pairs.");
    }
    values.set(key, value);
  }
  const browser = values.get("--browser");
  if (browser !== "chromium" && browser !== "safari-technology-preview") {
    throw new Error("--browser must be chromium or safari-technology-preview.");
  }
  const baseUrl = values.get("--base-url");
  if (!baseUrl) throw new Error("--base-url is required.");
  return { browser, baseUrl };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void runSessionRecheckFenceSmoke(
    parseSessionRecheckFenceSmokeOptions(process.argv.slice(2)),
  ).then((report) => process.stdout.write(`${JSON.stringify(report)}\n`));
}
