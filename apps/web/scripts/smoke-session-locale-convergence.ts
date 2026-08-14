import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { PUBLIC_LOCALE_CONFIG } from "@/lib/public-localization";

const CANONICAL_ORIGIN = "https://over.garden";
const PUBLIC_BG_ROUTE = "/bg/journals";
const PUBLIC_RU_ROUTE = "/ru/journals";

export interface SessionLocaleConvergenceSmokeOptions {
  environment: string;
  confirmedEnvironment: string;
  baseUrl: string;
  expectedCommitSha: string;
}

export interface SessionLocaleConvergenceSmokeReport {
  issue: "OVE-214";
  evidenceClass: "production-public-locale-handoff";
  expectedCommitSha: string;
  publicLocaleHandoff: {
    oneBulgarianControl: true;
    documentNavigation: true;
    noPreferenceMutation: true;
    destinationLocale: "ru";
  };
}

/**
 * Read-only production proof. It intentionally uses the public localized-link
 * path: no login, draft, locale preference mutation, cookie value, or user
 * content is read or retained. Exact deployment identity is established by the
 * authenticated Vercel read-back that invokes this smoke with its SHA.
 */
export async function runSessionLocaleConvergenceSmoke(
  options: SessionLocaleConvergenceSmokeOptions,
): Promise<SessionLocaleConvergenceSmokeReport> {
  if (
    options.environment !== "production" ||
    options.confirmedEnvironment !== "production"
  ) {
    throw new Error(
      "Requires --environment production --confirm-environment production.",
    );
  }
  const baseUrl = normalizeCanonicalBase(options.baseUrl);
  assertCommit(options.expectedCommitSha);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    let preferenceRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/interface/locale") {
        preferenceRequests += 1;
      }
    });
    try {
      const response = await page.goto(`${baseUrl}${PUBLIC_BG_ROUTE}`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      if (response?.status() !== 200) {
        throw new Error("Canonical Bulgaria locale route is not available.");
      }
      const control = page.locator(
        '[data-interface-language-control="site-shell-interface-language-control"]',
      );
      if ((await control.count()) !== 1) {
        throw new Error("Expected exactly one public Bulgaria language control.");
      }
      const trigger = control.locator('[data-interface-language-trigger="true"]');
      await trigger.click();
      const russianOption = page.getByRole("menuitemradio", {
        name: PUBLIC_LOCALE_CONFIG.ru.label,
      });
      await russianOption.waitFor({ state: "visible", timeout: 15_000 });
      if ((await russianOption.count()) !== 1) {
        throw new Error("Expected exactly one public Russian language option.");
      }
      await russianOption.click();
      await page.waitForURL(
        (url) =>
          url.origin === baseUrl &&
          url.pathname === PUBLIC_RU_ROUTE &&
          url.search === "" &&
          url.hash === "",
        { timeout: 15_000 },
      );
      if (
        (await page.locator("html").getAttribute("lang")) !== "ru" ||
        preferenceRequests !== 0
      ) {
        throw new Error("Public locale handoff did not remain document-only.");
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return {
    issue: "OVE-214",
    evidenceClass: "production-public-locale-handoff",
    expectedCommitSha: options.expectedCommitSha,
    publicLocaleHandoff: {
      oneBulgarianControl: true,
      documentNavigation: true,
      noPreferenceMutation: true,
      destinationLocale: "ru",
    },
  };
}

function normalizeCanonicalBase(value: string) {
  const url = new URL(value);
  if (url.origin !== CANONICAL_ORIGIN || url.pathname !== "/") {
    throw new Error("Base URL must be the canonical https://over.garden origin.");
  }
  return url.origin;
}

function assertCommit(value: string) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("--expected-commit must be a lowercase 40-character Git SHA.");
  }
}

function parseCliOptions(argv: string[]): SessionLocaleConvergenceSmokeOptions {
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
  const required = (flag: string) => {
    const value = values.get(flag);
    if (!value) throw new Error(`${flag} is required.`);
    return value;
  };
  return {
    environment: required("--environment"),
    confirmedEnvironment: required("--confirm-environment"),
    baseUrl: required("--base-url"),
    expectedCommitSha: required("--expected-commit"),
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void runSessionLocaleConvergenceSmoke(parseCliOptions(process.argv.slice(2)))
    .then((report) => process.stdout.write(`${JSON.stringify(report)}\n`));
}
