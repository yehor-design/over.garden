import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "playwright/test";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The garden workspace, proved in a browser (`OVE-457`).
 *
 * Three of these have no headless expression:
 *
 * - **Axe on every workspace page, at both widths.** Below `lg` the shell swaps
 *   its rail for a top bar and a tab bar, so one scan proves one of two
 *   documents, and a colour contrast cannot be computed in jsdom at all.
 * - **The chrome and the page agreeing.** The disagreement is between two
 *   components that never meet in a unit test: the shell's account region and
 *   the page's own panel, rendered from one request.
 * - **A form that submits before the bundle runs.** Outside Next's pipeline
 *   every form renders React's placeholder endpoint, so the correct and the
 *   broken shape look identical; only a context with `javaScriptEnabled: false`
 *   can tell them apart.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=garden-workspace.spec.ts
 */

const PREFIX = "ove457";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1_440, height: 900 } as const;

/** Every page ADR-0023 covers that a gardener can reach without a fixture. */
const WORKSPACE_PAGES = [
  "/garden",
  "/garden/profile",
  "/garden/lineage/claims",
  "/garden/lineage/questions",
  "/garden/lineage/invitations/claim",
] as const;

let pool: Pool;
let gardener: SyntheticGardener;
let sessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const authContext = await browser.newContext();
  try {
    // One sign-up and one sign-in for the whole file: Better Auth answers 429
    // to the fourth call in a window, and a spec that spends its budget on
    // authentication fails on something that is not its subject.
    gardener = await signInSyntheticGardener({
      baseURL,
      context: authContext,
      pool,
      prefix: PREFIX,
    });
    sessionCookies = await authContext.cookies(baseURL);
  } finally {
    await authContext.close();
  }
});

test.afterAll(async () => {
  await removeSyntheticGardener(pool, gardener?.id ?? null).catch(
    () => undefined,
  );
  await pool.end().catch(() => undefined);
});

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...sessionCookies,
  ]);
});

test.describe("the workspace a gardener works in", () => {
  test("the home leads with what needs attention, then what was written last", async ({
    page,
  }) => {
    const response = await page.goto("/garden", { waitUntil: "load" });
    expect(response?.status()).toBe(200);

    const order = await page.evaluate(() =>
      [...document.querySelectorAll("[id]")]
        .map((node) => node.id)
        .filter((id) =>
          ["attention", "recent", "inventory", "spaces"].includes(id),
        ),
    );
    expect(order).toEqual(["attention", "recent", "inventory", "spaces"]);

    // The one primary action of the screen sits beside the objects it is
    // about, not three sections above them.
    await expect(page.locator('[data-garden-next-action="true"]')).toBeVisible();
  });

  test("adding an object shows its path before its form", async ({ page }) => {
    await page.goto("/garden", { waitUntil: "load" });
    const steps = page.locator('[data-garden-creation-steps="true"]');
    await expect(steps).toBeVisible();
    // An ordered list, so a screen reader announces "1 of 3" rather than
    // reading three sentences with no relationship between them.
    expect(await steps.evaluate((node) => node.tagName)).toBe("OL");
    await expect(steps.locator("li")).toHaveCount(3);
  });

  test("the lineage surfaces say what they are before asking for anything", async ({
    page,
  }) => {
    for (const address of [
      "/garden/lineage/claims",
      "/garden/lineage/questions",
      "/garden/lineage/invitations/claim",
    ]) {
      const response = await page.goto(address, { waitUntil: "load" });
      expect(response?.status(), address).toBe(200);
      // The sentence sits under the heading, above everything the page asks
      // for: a gardener meeting the word "claim" for the first time is told
      // what one is before they are shown a Confirm button.
      const description = page
        .locator("main header p")
        .filter({ hasText: /./u })
        .first();
      await expect(description, address).toBeVisible();
      expect(
        (await description.textContent())?.length ?? 0,
        address,
      ).toBeGreaterThan(40);
    }
  });

  test("axe reports nothing on every workspace page, at 375 px and 1440 px", async ({
    page,
  }) => {
    for (const address of WORKSPACE_PAGES) {
      await scanBothWidths(page, address, address);
    }
  });
});

test.describe("the chrome and the page agree about the session", () => {
  test("both say the session store is unreachable, and neither offers sign-in", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // The fault is a real SQLSTATE from a view standing in for the session
    // table: the read fails the way it fails in an outage, and Better Auth
    // swallows it and answers `null` exactly as it does there.
    await pool.query(
      `create or replace function ove457_session_fault() returns boolean
       language plpgsql as $$
       begin raise exception 'ove457 injected' using errcode = '08006'; end $$`,
    );
    await pool.query(`alter table session rename to session_ove457_real`);
    await pool.query(
      `create view session as
       select * from session_ove457_real where ove457_session_fault()`,
    );

    const context = await browser.newContext();
    try {
      await context.addCookies([
        { name: "overgarden_interface_locale", value: "uk", url: baseURL },
        { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
        // The run's session token **without** its cookie cache. Better Auth
        // caches the session in `overgarden.session_data` for five minutes and
        // answers from the signed cookie without reading the store at all, so
        // a broken `session` table disturbs nothing while that cookie lives —
        // correct behaviour, and not the case under test. What this is is the
        // reader whose cache has expired, arriving during the outage.
        //
        // A *fabricated* token would not do either: a cookie the server cannot
        // resolve at all is served the prerendered guest shell, which is a
        // third thing again.
        ...sessionCookies.filter(
          (cookie) => cookie.name !== "overgarden.session_data",
        ),
      ]);
      const page = await context.newPage();
      const response = await page.goto("/garden", { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await page.waitForTimeout(1_500);

      // The page says so — it has since ADR-0023.
      await expect(
        page.locator('[data-workspace-surface="garden-home"]'),
      ).toBeVisible();
      await expect(page.locator("[data-section-failure]")).toHaveCount(1);

      // And now the chrome says the same thing instead of "Sign in".
      const notice = page.locator('[data-site-shell-session="unreachable"]');
      await expect(notice).toHaveCount(1);
      await expect(
        page.locator('[data-site-shell-action="sign-in"]'),
      ).toHaveCount(0);
    } finally {
      await context.close();
      await pool.query(`drop view if exists session`);
      await pool.query(
        `do $$ begin
           if to_regclass('public.session_ove457_real') is not null then
             execute 'alter table session_ove457_real rename to session';
           end if;
         end $$`,
      );
      await pool.query(`drop function if exists ove457_session_fault()`);
    }
  });
});

test.describe("before the bundle runs", () => {
  test("every converted workspace form posts to a real endpoint", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await context.addCookies([
        { name: "overgarden_interface_locale", value: "uk", url: baseURL },
        { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
        ...sessionCookies,
      ]);
      const page = await context.newPage();

      for (const address of [
        "/garden",
        "/garden/profile",
        "/garden/lineage/claims",
      ]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        const forms = await page.evaluate(() =>
          [...document.querySelectorAll("form")].map((form) => ({
            action: form.getAttribute("action"),
            method: (form.getAttribute("method") ?? "get").toLowerCase(),
          })),
        );
        expect(forms.length, `${address} has no form`).toBeGreaterThan(0);
        for (const form of forms) {
          // React answers a Server Action wrapped in a client closure with
          // `action="javascript:throw …"`, a placeholder it replaces on
          // hydration and never before.
          expect(
            form.action ?? "",
            `${address} has a placeholder action: ${JSON.stringify(form)}`,
          ).not.toContain("javascript:");
        }
        expect(
          forms.some((form) => form.method === "post"),
          `${address} has no POST form: ${JSON.stringify(forms)}`,
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});

interface Violation {
  id: string;
  impact: string | null;
  targets: string[];
}

async function axeViolations(page: Page): Promise<Violation[]> {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

async function scan(page: Page, url: string, label: string) {
  const response = await page.goto(url, { waitUntil: "load" });
  expect(response?.status(), `${label} answered ${response?.status()}`).toBe(
    200,
  );
  // Streamed sections finish after `load`; scanning too early measures the
  // skeleton rather than the screen.
  await page.waitForTimeout(1_500);
  const violations = await axeViolations(page);
  expect(violations, `${label}: ${JSON.stringify(violations)}`).toEqual([]);
}

async function scanBothWidths(page: Page, url: string, label: string) {
  await page.setViewportSize(PHONE);
  await scan(page, url, `${label} at 375 px`);
  await page.setViewportSize(DESKTOP);
  await scan(page, url, `${label} at 1440 px`);
}
