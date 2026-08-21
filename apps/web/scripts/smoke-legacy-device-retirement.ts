import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const FIXTURE_PATH =
  "/__visual-fixtures/legacy-device-retirement?locale=uk&scenario=happy";

interface LegacyDeviceRetirementSmokeReport {
  issue: "OVE-322";
  evidenceClass:
    | "local-browser-matrix"
    | "immutable-preview-browser-contract"
    | "production-fixture-denial";
  absenceReadsRequired: 2;
  exactKnownStorageOnly: true;
  locales: readonly ["uk", "bg", "ru"];
  nonblocking: true;
  syntheticFixtureOnly: true;
}

export async function runLegacyDeviceRetirementSmoke(
  baseUrl = process.env.BASE_URL,
): Promise<LegacyDeviceRetirementSmokeReport> {
  if (!baseUrl?.trim()) {
    await runLocalBrowserMatrix();
    return report("local-browser-matrix");
  }

  const origin = normalizeOrigin(baseUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(`${origin}${FIXTURE_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    if (response?.status() === 404) {
      if (
        (await page
          .locator('[data-legacy-retirement-fixture="true"]')
          .count()) !== 0
      ) {
        throw new Error("Production exposed the synthetic retirement fixture.");
      }
      const garden = await page.goto(`${origin}/garden`, {
        waitUntil: "domcontentloaded",
      });
      if (garden?.status() !== 200) {
        throw new Error("The public garden surface is unavailable.");
      }
      return report("production-fixture-denial");
    }
    if (response?.status() !== 200) {
      throw new Error("The immutable retirement fixture was unavailable.");
    }
    await page.waitForFunction(() =>
      Boolean(window.__ove322LegacyRetirementFixture),
    );
    await page.locator("[data-retirement-transfer]").click();
    await page.locator('[data-legacy-device-retirement="completed"]').waitFor();
    const receipt = await page.evaluate(() =>
      window.__ove322LegacyRetirementFixture?.snapshot(),
    );
    if (
      receipt?.absenceReads !== 2 ||
      receipt.deleteSuccesses !== 1 ||
      receipt.sourcePresent
    ) {
      throw new Error("The immutable retirement receipt was incomplete.");
    }
    return report("immutable-preview-browser-contract");
  } finally {
    await browser.close();
  }
}

async function runLocalBrowserMatrix() {
  const child = spawn(
    "pnpm",
    ["exec", "playwright", "test", "tests/legacy-device-retirement.spec.ts"],
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
  if (exitCode !== 0)
    throw new Error("Legacy retirement browser matrix failed.");
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
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
  evidenceClass: LegacyDeviceRetirementSmokeReport["evidenceClass"],
): LegacyDeviceRetirementSmokeReport {
  return {
    issue: "OVE-322",
    evidenceClass,
    absenceReadsRequired: 2,
    exactKnownStorageOnly: true,
    locales: ["uk", "bg", "ru"],
    nonblocking: true,
    syntheticFixtureOnly: true,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void runLegacyDeviceRetirementSmoke().then(
    (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    () => {
      process.stderr.write("Legacy device retirement smoke failed.\n");
      process.exitCode = 1;
    },
  );
}
