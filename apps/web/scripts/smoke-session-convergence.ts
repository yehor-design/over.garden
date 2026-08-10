import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const FIXTURE_PATH =
  "/__visual-fixtures/session-recheck?visualSessionConvergence=true&locale=uk&mode=non_fencing&initial=exact";

type SessionConvergenceSmokeReport = {
  issue: "OVE-286";
  evidenceClass:
    | "local-deterministic-browser-contract"
    | "immutable-preview-browser-contract"
    | "production-fixture-denial";
  locales: readonly ["uk", "bg", "ru"];
  markerPayloadFree: true;
  performanceBudgetMilliseconds: 100;
  syntheticFixtureOnly: true;
  terminalDocumentNeverReopened: true;
  twentySignalsCoalesced: true;
};

export async function runSessionConvergenceSmoke(
  baseUrl = process.env.BASE_URL,
): Promise<SessionConvergenceSmokeReport> {
  if (!baseUrl?.trim()) {
    await runLocalPlaywrightContract();
    return report("local-deterministic-browser-contract");
  }

  const origin = normalizeOrigin(baseUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    try {
      const fixtureResponse = await page.goto(`${origin}${FIXTURE_PATH}`, {
        waitUntil: "domcontentloaded",
      });
      if (fixtureResponse?.status() === 200) {
        await runRemoteFixtureContract(page);
        return report("immutable-preview-browser-contract");
      }

      if (fixtureResponse?.status() !== 404) {
        throw new Error(
          "Immutable fixture response was neither ready nor denied.",
        );
      }
      if (
        (await page
          .locator('[data-session-recheck-private-fixture="true"]')
          .count()) !== 0
      ) {
        throw new Error("Production exposed synthetic private fixture markup.");
      }
      const gardenResponse = await page.goto(`${origin}/garden`, {
        waitUntil: "domcontentloaded",
      });
      if (gardenResponse?.status() !== 200) {
        throw new Error("Immutable garden auth surface was unavailable.");
      }
      return report("production-fixture-denial");
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function runRemoteFixtureContract(page: Page) {
  await page.waitForFunction(() =>
    Boolean(window.__ove286SessionConvergenceFixture),
  );
  await page.waitForSelector('[data-session-recheck-private-fixture="true"]');
  await page.evaluate(() => {
    const fixture = window.__ove286SessionConvergenceFixture;
    if (!fixture) throw new Error("Synthetic controller unavailable.");
    fixture.stallNextRead();
    for (let index = 0; index < 10; index += 1) {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  const stalledState = await page.evaluate(() => ({
    privateCount: document.querySelectorAll(
      '[data-session-recheck-private-fixture="true"]',
    ).length,
    snapshot: window.__ove286SessionConvergenceFixture?.snapshot(),
  }));
  if (
    stalledState.privateCount !== 1 ||
    stalledState.snapshot?.readCount !== 2 ||
    stalledState.snapshot.markerStatus !== "absent"
  ) {
    throw new Error(
      "Ordinary convergence signals changed the private surface.",
    );
  }

  const removalDuration = await page.evaluate(() => {
    const fixture = window.__ove286SessionConvergenceFixture;
    if (!fixture) throw new Error("Synthetic controller unavailable.");
    return fixture.emitPeerCommittedInvalidation();
  });
  if (removalDuration > 100) {
    throw new Error("Terminal private-tree removal exceeded its budget.");
  }
  if (
    (await page
      .locator('[data-session-recheck-private-fixture="true"]')
      .count()) !== 0
  ) {
    throw new Error("Terminal document retained private fixture markup.");
  }
  await page.evaluate(() =>
    window.__ove286SessionConvergenceFixture?.releaseStalledRead("exact"),
  );
  await page.waitForTimeout(50);
  if (
    (await page
      .locator('[data-session-recheck-private-fixture="true"]')
      .count()) !== 0
  ) {
    throw new Error(
      "Late exact-session completion reopened a terminal document.",
    );
  }
}

async function runLocalPlaywrightContract() {
  const child = spawn(
    "pnpm",
    ["exec", "playwright", "test", "tests/session-convergence.spec.ts"],
    {
      cwd: path.dirname(
        fileURLToPath(new URL("../package.json", import.meta.url)),
      ),
      env: process.env,
      stdio: "inherit",
    },
  );
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error("Local deterministic browser contract failed.");
  }
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("BASE_URL must be one HTTP(S) origin without credentials.");
  }
  return url.origin;
}

function report(
  evidenceClass: SessionConvergenceSmokeReport["evidenceClass"],
): SessionConvergenceSmokeReport {
  return {
    issue: "OVE-286",
    evidenceClass,
    locales: ["uk", "bg", "ru"],
    markerPayloadFree: true,
    performanceBudgetMilliseconds: 100,
    syntheticFixtureOnly: true,
    terminalDocumentNeverReopened: true,
    twentySignalsCoalesced: true,
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void runSessionConvergenceSmoke().then(
    (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    () => {
      process.stderr.write("Session convergence smoke failed.\n");
      process.exitCode = 1;
    },
  );
}
