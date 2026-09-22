import path from "node:path";
import { writeFileSync } from "node:fs";
import { Pool } from "pg";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import { seedCollection, cleanupCollection } from "./helpers/redesign-fixtures";

import { expect, test, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";

/**
 * The shell of DESIGN.md §3.2–§3.3, in a real engine at the widths it is drawn
 * for. Three questions a unit test cannot answer: what the tab order actually
 * is, what is reachable when the context rail is not rendered, and whether the
 * three columns appear at the breakpoints they are declared at.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/site-shell.spec.ts
 *
 * Start the server **without** `--hostname 127.0.0.1`. With it, Next's internal
 * rewrite comes back as `http://localhost:<port>/<locale>/…`, the proxy runs
 * again on the prefixed path, and ADR-0029 D9's "an entry has no locale prefix"
 * rule 308s it back — forever. Nothing to do with the shell; it costs an hour
 * if you meet it without knowing.
 */

const OUTPUT = path.join(process.cwd(), "test-results", "site-shell");
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";

const WIDTHS = [
  { width: 1024, label: "lg", context: false },
  { width: 1280, label: "xl", context: true },
  { width: 1920, label: "wide", context: true },
  { width: 2560, label: "ultrawide", context: true },
] as const;

async function selectLocale(page: Page, baseURL: string) {
  await page.context().addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
}

/**
 * The shell streams in through the document's Suspense boundary, so a `load`
 * event is not the moment it has a size. Measuring before this returns reports
 * every region as 0 × 0 — which reads exactly like a region that is not drawn.
 */
async function settleShell(page: Page) {
  const header = page.locator('[data-site-shell-region="header"]');
  await expect(header).toBeVisible();
  // A static document's chrome is in the first bytes (ADR-0032), so "visible"
  // is true before the bundle has run. What the chrome learns from hydration —
  // the address, the rail a page fills, a gardener's own destinations — has
  // settled only after it.
  await waitForHydration(header);
  // And a width is a width in the face the page is set in. `font-display:
  // swap` draws the fallback first, the fallback is wider, and at 320 px
  // "Дневници" is one line in Google Sans and two in Liberation Sans — which
  // is what a Linux runner measured the first time this file ran in CI.
  await page.evaluate(() => document.fonts.ready);
}

test.describe("the three-column shell", () => {
  for (const { width, label, context } of WIDTHS) {
    test(`draws its columns at ${width} px (${label})`, async ({
      baseURL,
      page,
    }) => {
      if (!baseURL) throw new Error("Playwright baseURL is required");
      await selectLocale(page, baseURL);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/journals", { waitUntil: "load" });
      await settleShell(page);

      const banner = page.locator('[data-site-shell-region="header"]');
      const content = page.locator('[data-site-shell-region="content"]');
      const contextRail = page.locator('[data-site-shell-region="context"]');
      const footer = page.locator('[data-site-shell-region="footer"]');

      await expect(banner).toBeVisible();
      await expect(content).toBeVisible();
      await expect(footer).toBeAttached();

      const rail = (await banner.boundingBox())!;
      expect(Math.round(rail.width)).toBe(208);
      expect(
        Math.round((await content.boundingBox())!.width),
      ).toBeLessThanOrEqual(704);

      const frame = (await page
        .locator("[data-site-shell-grid]")
        .boundingBox())!;
      expect(frame.width).toBe(width >= 1280 ? 1280 : 976);
      expect(Math.abs(frame.x - (width - frame.width) / 2)).toBeLessThan(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);

      // Only meaningful page-owned context creates a rail.
      if (!context) expect(await contextRail.isVisible()).toBe(false);
      if (await contextRail.isVisible()) {
        expect(Math.round((await contextRail.boundingBox())!.width)).toBe(280);
      }

      // Group spacing provides separation, without a viewport-spanning border.
      const railStyle = await banner.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          shadow: computed.boxShadow,
          borderRight: computed.borderRightWidth,
          position: computed.position,
        };
      });
      expect(railStyle.shadow).toBe("none");
      expect(railStyle.borderRight).toBe("0px");
      expect(railStyle.position).toBe("sticky");

      await page.screenshot({
        path: path.join(OUTPUT, `shell-${width}.png`),
        fullPage: false,
      });
    });
  }

  test("exactly one primary action is a reader's, at every width", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(page, baseURL);

    // The rail draws it above `lg` and the tab bar below (`OVE-444`), so the
    // contract is one *visible* action per viewport — never the two the rail
    // and the header used to draw side by side at the same width.
    for (const width of [320, 390, 768, 1024, 1280, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/journals", { waitUntil: "load" });
      await settleShell(page);
      const visible = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-site-shell-action="new-entry"]',
          ),
        ]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => ({
            href: node.getAttribute("href"),
            inBanner: Boolean(
              node.closest('[data-site-shell-region="header"]'),
            ),
            inTabBar: Boolean(
              node.closest('[data-site-shell-region="mobile-navigation"]'),
            ),
          })),
      );
      expect(visible, `at ${width}px`).toHaveLength(1);
      // Signed out, so the one action goes through the sign-in screen and
      // returns to the composer rather than to the workspace around it.
      const href = visible[0]!.href ?? "";
      expect(href).toContain("/auth/sign-in?next=");
      expect(decodeURIComponent(href)).toContain("/garden/new");
      expect(visible[0]!.inBanner || visible[0]!.inTabBar).toBe(true);
      expect(visible[0]!.inBanner && visible[0]!.inTabBar).toBe(false);
      expect(visible[0]!.inBanner).toBe(width >= 1024);
    }
  });

  test("no screen loses an action when the context rail is absent", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(page, baseURL);

    for (const address of ["/", "/journals", "/objects", "/knowledge"]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(address, { waitUntil: "load" });
      await settleShell(page);
      // Page-owned context is optional. A page with none must not invent a
      // generic welcome card simply to fill a column.
      const withRail = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((link) =>
          link.getAttribute("href"),
        ),
      );
      const railOnly = await page.evaluate(() => {
        const rail = document.querySelector(
          '[data-site-shell-region="context"]',
        );
        return rail
          ? [...rail.querySelectorAll("a[href]")].map((link) =>
              link.getAttribute("href"),
            )
          : [];
      });

      await page.setViewportSize({ width: 1100, height: 900 });
      await page.goto(address, { waitUntil: "load" });
      await settleShell(page);
      const without = new Set(
        await page.evaluate(() =>
          [...document.querySelectorAll("a[href]")]
            .filter(
              (link) =>
                !link.closest('[data-site-shell-region="context"]') ||
                getComputedStyle(
                  link.closest('[data-site-shell-region="context"]')!,
                ).display !== "none",
            )
            .map((link) => link.getAttribute("href")),
        ),
      );

      for (const href of railOnly) {
        expect(
          without.has(href),
          `${address} at 1100 px loses ${href} with the context rail`,
        ).toBe(true);
      }
      expect(withRail.length).toBeGreaterThan(0);
    }
  });

  test("the keyboard walks skip link → rail → content → context → footer", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(page, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/journals", { waitUntil: "load" });
    await settleShell(page);

    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => ({
      href: document.activeElement?.getAttribute("href"),
      visible:
        document.activeElement instanceof HTMLElement &&
        document.activeElement.getBoundingClientRect().width > 1,
    }));
    expect(skip.href).toBe("#main-content");
    // A skip link nobody can see is a skip link nobody uses (§3.3).
    expect(skip.visible).toBe(true);

    // Walk forward and record which region each stop belongs to. The order of
    // first appearance is the contract; the number of stops inside a region is
    // the page's business.
    const order: string[] = [];
    for (let step = 0; step < 120; step += 1) {
      await page.keyboard.press("Tab");
      const region = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return null;
        const owner = active.closest<HTMLElement>("[data-site-shell-region]");
        return owner?.dataset.siteShellRegion ?? "page";
      });
      if (!region) break;
      if (order.at(-1) !== region) order.push(region);
      if (region === "footer") break;
    }

    const firstIndex = (region: string) => order.indexOf(region);
    expect(firstIndex("header")).toBeGreaterThanOrEqual(0);
    expect(firstIndex("footer")).toBeGreaterThan(firstIndex("header"));
    expect(firstIndex("content")).toBeGreaterThan(firstIndex("header"));
    expect(firstIndex("content")).toBeLessThan(firstIndex("footer"));
    const contextIndex = firstIndex("context");
    if (contextIndex >= 0) {
      expect(contextIndex).toBeGreaterThan(firstIndex("content"));
      expect(contextIndex).toBeLessThan(firstIndex("footer"));
    }
    // No trap: the walk reached the footer rather than running out of steps.
    expect(order.at(-1)).toBe("footer");
  });

  test("the footer links what nothing linked before", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(page, baseURL);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await settleShell(page);

    const footer = page.locator('[data-site-shell-region="footer"]');
    // The catalogue, not `/objects`: five entrances became one door, `/objects`
    // answers 308 to it, and the footer has linked the door ever since. This
    // file went on asking for the old address because it ran in no CI list —
    // found on 2026-09-20, the day it joined one.
    for (const address of [
      "/privacy",
      "/support",
      "/first-publication-disclosure",
      "/catalog",
    ]) {
      await expect(footer.locator(`a[href="${address}"]`)).toHaveCount(1);
      const response = await page.request.get(address, { maxRedirects: 0 });
      expect(
        response.status(),
        `${address} answered ${response.status()}`,
      ).toBe(200);
    }
    // Exactly one language control in the document, and it is here (§6).
    await expect(page.locator("[data-interface-language-control]")).toHaveCount(
      1,
    );
    await expect(
      footer.locator("[data-interface-language-control]"),
    ).toHaveCount(1);
  });
});

test("guest and member shell stays centered across locales and mobile widths", async ({
  baseURL,
  page,
  context,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  test.setTimeout(90_000);
  await page.addInitScript(() =>
    localStorage.setItem("overgarden:analytics-consent", "declined"),
  );
  const measurements: unknown[] = [];
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  let memberId: string | undefined;
  try {
    for (const role of ["guest", "member"] as const) {
      if (role === "member") {
        const member = await signInSyntheticGardener({
          baseURL,
          context,
          pool,
          prefix: "ove481-shell",
        });
        memberId = member.id;
        await seedCollection(pool, member.id, { spaces: 1, objects: 1 });
      }
      for (const locale of ["uk", "bg", "ru"]) {
        await context.addCookies([
          { name: INTERFACE_LOCALE_COOKIE, value: locale, url: baseURL },
          {
            name: INTERFACE_MARKET_COOKIE,
            value: locale === "bg" ? "bulgaria" : "ukraine",
            url: baseURL,
          },
        ]);
        for (const width of [320, 390, 768, 1280, 1920, 2560]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(role === "member" ? "/garden" : `/${locale}/support`);
          await settleShell(page);
          if (role === "member") {
            await expect(
              page.locator(
                '[data-garden-collection-list="object"] [data-slot="list-row"]',
              ),
            ).toHaveCount(1);
          }
          const frame = (await page
            .locator("[data-site-shell-grid]")
            .boundingBox())!;
          expect(frame.width).toBe(Math.min(width, 1280));
          expect(Math.abs(frame.x - (width - frame.width) / 2)).toBeLessThan(1);
          const overflow = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            nodes: [...document.querySelectorAll("main *")]
              .filter(
                (node) => node.getBoundingClientRect().right > innerWidth + 1,
              )
              .map((node) => ({
                tag: node.tagName,
                class: node.className,
                text: node.textContent?.slice(0, 80),
                right: node.getBoundingClientRect().right,
              }))
              .slice(-15),
          }));
          expect(
            overflow.width,
            JSON.stringify({ role, locale, width, nodes: overflow.nodes }),
          ).toBeLessThanOrEqual(width);
          await expect(page.getByRole("main")).toHaveCount(1);
          await expect(page.getByRole("banner")).toHaveCount(1);
          if (role === "member") {
            await expect(
              page.locator("[data-site-shell-account-menu-trigger]:visible"),
            ).toHaveCount(1);
            await expect(
              page.locator('[data-site-shell-action="new-entry"]:visible'),
            ).toHaveAttribute("href", "/garden/new");
          }
          await page.evaluate(async () => {
            scrollTo(0, 0);
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          measurements.push({
            role,
            locale,
            viewportWidth: width,
            frame,
            scrollWidth: overflow.width,
          });
          await page.screenshot({
            path: path.join(OUTPUT, `${role}-${locale}-${width}.png`),
          });
        }
      }
    }
    writeFileSync(
      path.join(OUTPUT, "geometry.json"),
      JSON.stringify(measurements, null, 2) + "\n",
    );
  } finally {
    if (memberId) await cleanupCollection(pool, memberId);
    await pool.end();
  }
});
