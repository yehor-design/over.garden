import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "playwright/test";
import { Pool } from "pg";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * Every control whose code arrives on its first press (`OVE-468`), pressed
 * before that code has arrived.
 *
 * A control that loads its code on the first press and drops that press looks
 * fine on a fast laptop and is broken on a phone. So each test waits for the
 * page to load and for React to adopt the chrome, then holds back every script
 * the page asks for from that moment on, presses, and checks that nothing has
 * opened — the code is still held — before it lets the scripts through. What
 * opens after that is the press, kept.
 *
 *   pnpm build && pnpm exec next start -p 3181
 *   PLAYWRIGHT_BASE_URL=http://localhost:3181 pnpm exec playwright test \
 *     tests/on-demand-controls.spec.ts
 */

const PREFIX = "ove468";
const OUTPUT = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-468",
);
/** Long enough that an overlay whose code was not held would have opened. */
const HELD_MS = 750;
/** Long enough for the page's own after-load requests to have been made. */
const QUIET_MS = 1_000;

const PALETTE = '[data-command-palette="true"]';
const PALETTE_FIELD = '[data-command-palette-input="true"]';
const RAIL_SEARCH = '[data-command-palette-trigger="field"]';
const MENU_BUTTON = '[data-cwv-interaction-target="site-menu"]';
const SHEET = '[data-slot="sheet-content"]';
const ACCOUNT_BUTTON = "[data-site-shell-account-menu-trigger]:visible";
const ACCOUNT_MENU = '[data-site-shell-account-menu="true"]';
const SIGN_OUT = '[data-sign-out-control="menu"]';
const CONFIRMATION = '[data-sign-out-confirmation="true"]';
const CONFIRM = '[data-sign-out-confirm-action="true"]';

interface Receipt {
  control: string;
  path: string;
  viewport: string;
  /** Scripts the press itself asked for, all held until after the check. */
  heldScripts: string[];
  /** Scripts the page asked for by itself after load (prefetch), also held. */
  heldBeforePress?: string[];
  openWhileHeld: boolean;
  openedAfterRelease: boolean;
  detail?: Record<string, unknown>;
}

const receipts: Receipt[] = [];

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
  ]);
}

/** Holds every script the page asks for from now on, until `release`. */
async function holdScripts(page: Page) {
  const held: Route[] = [];
  const requested: string[] = [];
  let holding = true;
  const handler = async (route: Route) => {
    requested.push(new URL(route.request().url()).pathname);
    if (holding) held.push(route);
    else await route.continue();
  };
  await page.route("**/_next/static/chunks/**", handler);
  return {
    requested,
    async release() {
      holding = false;
      await Promise.all(held.splice(0).map((route) => route.continue()));
    },
  };
}

/** Loaded, adopted by React, and the effects that attach listeners have run. */
async function settle(page: Page, control: string) {
  await waitForHydration(page.locator(control));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/**
 * Presses while the scripts are held, and proves the press was early: the
 * press asked for code of its own, and nothing opened while that was held.
 *
 * The page asks for scripts by itself after load — the router prefetching the
 * routes its links lead to — and those are held too. They are let settle
 * first and counted apart, so "the press asked for code" is about the press.
 */
async function pressBeforeTheCode(
  page: Page,
  overlay: string,
  press: () => Promise<void>,
) {
  const scripts = await holdScripts(page);
  await page.waitForTimeout(QUIET_MS);
  const heldBeforePress = [...scripts.requested];
  await press();
  await expect
    .poll(() => scripts.requested.length, { timeout: 5_000 })
    .toBeGreaterThan(heldBeforePress.length);
  await page.waitForTimeout(HELD_MS);
  const openWhileHeld = (await page.locator(overlay).count()) > 0;
  expect(openWhileHeld, "opened while its code was held").toBe(false);
  const heldScripts = scripts.requested.slice(heldBeforePress.length);
  await scripts.release();
  await expect(page.locator(overlay)).toBeVisible({ timeout: 15_000 });
  return { heldScripts, heldBeforePress, openWhileHeld };
}

test.describe("controls whose code arrives on the first press", () => {
  test.describe.configure({ mode: "serial" });

  let pool: Pool;
  const gardeners: string[] = [];

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });

  test.afterAll(async () => {
    for (const id of gardeners) await removeSyntheticGardener(pool, id);
    await pool.end();
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(
      path.join(OUTPUT, "on-demand-controls-receipt.json"),
      JSON.stringify(
        {
          issue: "OVE-468",
          proof:
            "Each control pressed after load and hydration, with every script requested after that held until the press had been made.",
          heldMs: HELD_MS,
          receipts,
        },
        null,
        2,
      ) + "\n",
    );
  });

  test("⌘K opens the palette, and what was typed before it arrived is its query", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await settle(page, RAIL_SEARCH);

    // Latin letters: Playwright types a character outside the US layout as an
    // input event with no keydown, which no real keyboard does.
    const pressed = await pressBeforeTheCode(page, PALETTE, async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await page.keyboard.type("tom");
    });
    const field = page.locator(PALETTE_FIELD);
    await expect(field).toHaveValue("tom");
    await expect(field).toBeFocused();
    await page.keyboard.type("ato");
    await expect(field).toHaveValue("tomato");

    receipts.push({
      control: "⌘K",
      path: "/",
      viewport: "1440x900",
      ...pressed,
      openedAfterRelease: true,
      detail: { typedWhileHeld: "tom", valueAfter: "tomato" },
    });
  });

  test("/ opens the palette, and pressing it again while it waits is not a letter", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/journals", { waitUntil: "load" });
    await settle(page, RAIL_SEARCH);

    const pressed = await pressBeforeTheCode(page, PALETTE, async () => {
      await page.keyboard.press("/");
      await page.keyboard.press("/");
    });
    await expect(page.locator(PALETTE_FIELD)).toHaveValue("");
    await expect(page.locator(PALETTE_FIELD)).toBeFocused();

    // Escape closes it and gives focus back, the same as the eager palette.
    await page.keyboard.press("Escape");
    await expect(page.locator(PALETTE)).toHaveCount(0);

    receipts.push({
      control: "/",
      path: "/journals",
      viewport: "1440x900",
      ...pressed,
      openedAfterRelease: true,
    });
  });

  test("the rail's search field opens the palette on its first press", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await settle(page, RAIL_SEARCH);

    const pressed = await pressBeforeTheCode(page, PALETTE, async () => {
      await page.locator(RAIL_SEARCH).click();
    });
    await expect(page.locator(PALETTE_FIELD)).toBeFocused();

    receipts.push({
      control: "rail search field",
      path: "/",
      viewport: "1440x900",
      ...pressed,
      openedAfterRelease: true,
    });
  });

  test("the narrow bar's menu opens its sheet on the first press", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "load" });
    await settle(page, MENU_BUTTON);

    const pressed = await pressBeforeTheCode(page, SHEET, async () => {
      await page.locator(MENU_BUTTON).click();
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    // The sheet's own navigation, not only its frame.
    await expect(page.locator(`${SHEET} a[href]`).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(SHEET)).toHaveCount(0);
    // Closed, focus is on the control that opened it.
    await expect(page.locator(MENU_BUTTON)).toBeFocused();

    receipts.push({
      control: "narrow bar menu",
      path: "/",
      viewport: "375x812",
      ...pressed,
      openedAfterRelease: true,
    });
  });

  test("the account menu opens on the first press, and sign-out signs out", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: PREFIX,
    });
    gardeners.push(gardener.id);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await settle(page, ACCOUNT_BUTTON);

    const menu = await pressBeforeTheCode(page, ACCOUNT_MENU, async () => {
      await page.locator(ACCOUNT_BUTTON).click();
    });
    await expect(page.locator(`${ACCOUNT_MENU} ${SIGN_OUT}`)).toBeVisible();
    receipts.push({
      control: "account menu",
      path: "/",
      viewport: "1440x900",
      ...menu,
      openedAfterRelease: true,
    });

    // The question and Better Auth's client both arrive on this press.
    const question = await pressBeforeTheCode(page, CONFIRMATION, async () => {
      await page.locator(`${ACCOUNT_MENU} ${SIGN_OUT}`).click();
    });
    await page.locator(CONFIRM).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await expect(
      page.locator('[data-site-shell-action="sign-in"]:visible').first(),
    ).toBeVisible({ timeout: 15_000 });
    const session = await page.evaluate(async () => {
      const response = await fetch("/api/auth/get-session", {
        credentials: "include",
      });
      return response.ok ? await response.json() : { status: response.status };
    });
    expect(session).toBeNull();

    receipts.push({
      control: "sign-out",
      path: "/",
      viewport: "1440x900",
      ...question,
      openedAfterRelease: true,
      detail: { sessionAfterConfirm: session },
    });
  });

  test("without JavaScript the same controls are in the served bytes, and the search link works", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await selectLocale(context, baseURL);
      const page = await context.newPage();
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/", { waitUntil: "load" });

      // The narrow bar: the menu's button, named, and the search as a link.
      await expect(page.locator(MENU_BUTTON)).toHaveAttribute(
        "aria-label",
        /.+/u,
      );
      const search = page.locator(
        '[data-command-palette-trigger="icon"][href]',
      );
      await expect(search).toHaveCount(1);
      const href = await search.getAttribute("href");
      expect(href).toBeTruthy();

      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.locator(`${RAIL_SEARCH}[href]`)).toHaveAttribute(
        "href",
        href!,
      );
      await expect(
        page.locator('[data-site-shell-action="sign-in"]').first(),
      ).toHaveAttribute("href", /.+/u);

      // The palette is an enhancement; its link is the way in without it.
      const response = await page.goto(href!, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();

      receipts.push({
        control: "no JavaScript",
        path: "/",
        viewport: "375x812, 1440x900",
        heldScripts: [],
        openWhileHeld: false,
        openedAfterRelease: false,
        detail: { searchHref: href, searchStatus: response?.status() },
      });
    } finally {
      await context.close();
    }
  });
});
