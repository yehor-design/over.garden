import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";
import {
  cleanupOrganismFixture,
  cleanupStaleOrganismRuns,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";

/**
 * The shell below `lg` (DESIGN.md §3.2, §4.3, §2.6; ADR-0031 D4, D9).
 *
 * Emulating a narrow viewport is not the same as a phone: load-time device
 * gates re-run only after a reload, so every case here resizes **and then**
 * navigates. And a label that fits in Ukrainian can overflow in Bulgarian —
 * "Дневници" is a third longer than "Журнали" — so the width cases run in all
 * three interface languages rather than in the one the author happens to read.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/mobile-shell.spec.ts
 *
 * Start it **without** `--hostname 127.0.0.1`: with it, Next's internal locale
 * rewrite returns as `http://localhost:<port>/<locale>/…`, the proxy runs again
 * on the prefixed path, and a public entry 308s to itself forever.
 */

const OUTPUT = path.join(process.cwd(), "test-results", "mobile-shell");
const PREFIX = "ove444";
const TEST_PASSWORD = "OVE444-local-password-1!";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const LOCALES = ["uk", "bg", "ru"] as const;
const WIDTHS = [320, 375, 768] as const;

/** The four WCAG 1.4.12 overrides, applied exactly as the criterion states. */
const TEXT_SPACING = `* { line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }`;

async function selectLocale(
  context: BrowserContext,
  baseURL: string,
  locale: string,
) {
  await context.clearCookies();
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    {
      name: "overgarden_interface_market",
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: baseURL,
    },
  ]);
}

async function axeViolations(page: Page) {
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
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

/**
 * The hit target, not the class name: the element's own box unioned with its
 * `::before`, which is how `Button` and `IconButton` reach 44 × 44 from a 32 or
 * 40 px visual without growing the visual (DESIGN.md §4.3, WCAG 2.2 2.5.8).
 */
async function targetSizes(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const box = node.getBoundingClientRect();
        const before = getComputedStyle(node, "::before");
        const pseudoWidth =
          before.content === "none" ? 0 : parseFloat(before.width) || 0;
        const pseudoHeight =
          before.content === "none" ? 0 : parseFloat(before.height) || 0;
        return {
          name:
            node.getAttribute("aria-label") ??
            node.textContent?.trim().slice(0, 24) ??
            node.tagName,
          width: Math.max(box.width, pseudoWidth),
          height: Math.max(box.height, pseudoHeight),
        };
      });
  }, selector);
}

/**
 * The shell streams in through the document's Suspense boundary, so a `load`
 * event is not the moment it has a size. Measuring before this returns reports
 * every region as 0 × 0 — which reads exactly like a region that is not drawn.
 */
async function settleShell(page: Page) {
  await expect(page.locator('[data-site-shell-region="header"]')).toBeVisible();
}

test.describe("the mobile shell", () => {
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      test(`fits ${width} px in ${locale} without a sideways scroll`, async ({
        baseURL,
        context,
        page,
      }) => {
        if (!baseURL) throw new Error("Playwright baseURL is required");
        await selectLocale(context, baseURL, locale);
        await page.setViewportSize({ width, height: 780 });
        // Resize, then load: a device gate that runs at load will not re-run
        // for a viewport that changed after it.
        await page.goto("/journals", { waitUntil: "load" });
        await settleShell(page);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.scrollingElement!.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(
          overflow.scrollWidth,
          `${locale} at ${width}px scrolls sideways`,
        ).toBeLessThanOrEqual(overflow.innerWidth);

        // The brand is one piece: drawn, inside the viewport, not clipped.
        const brand = page.locator('[data-site-shell-brand="true"]');
        // Hydration replaces the header's subtree, so measuring straight after
        // `load` reads a node that is on its way out.
        await expect(brand).toBeVisible();
        const brandBox = (await brand.boundingBox())!;
        expect(brandBox.x).toBeGreaterThanOrEqual(0);
        expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(width);
        expect(
          await brand.evaluate((node) => {
            const svg = node.querySelector("svg")!;
            const svgBox = svg.getBoundingClientRect();
            const ownBox = node.getBoundingClientRect();
            return (
              svgBox.width > 0 &&
              svgBox.right <= ownBox.right + 1 &&
              svgBox.left >= ownBox.left - 1
            );
          }),
          "the brand lockup is clipped by its own link",
        ).toBe(true);

        if (width < 1024) {
          await expect(
            page.locator('[data-site-shell-region="mobile-navigation"]'),
          ).toBeVisible();

          // Every tab label is one line at its own size. It is two in
          // Bulgarian the moment the slot loses four pixels to padding, and
          // "Дневници" is the label that finds out — so the slot has none, and
          // this assertion is what keeps it that way. Under the 1.4.12
          // overrides two lines are expected and allowed (§2.6: never three).
          const lines = await page.evaluate(() => {
            const bar = document.querySelector(
              '[data-site-shell-region="mobile-navigation"]',
            )!;
            return [
              ...bar.querySelectorAll<HTMLElement>("[data-site-shell-tab]"),
            ].flatMap((tab) =>
              [...tab.querySelectorAll<HTMLElement>("span")]
                .filter((span) => span.textContent?.trim())
                .map((span) => ({
                  text: span.textContent!.trim(),
                  lines: Math.round(
                    span.getBoundingClientRect().height /
                      (parseFloat(getComputedStyle(span).lineHeight) || 16),
                  ),
                })),
            );
          });
          expect(lines.length).toBe(4);
          expect(lines.filter((label) => label.lines > 1)).toEqual([]);
        }

        await page.screenshot({
          path: path.join(OUTPUT, `${locale}-${width}.png`),
        });
      });

      test(`keeps every label whole under the 1.4.12 overrides at ${width} px in ${locale}`, async ({
        baseURL,
        context,
        page,
      }) => {
        if (!baseURL) throw new Error("Playwright baseURL is required");
        await selectLocale(context, baseURL, locale);
        await page.setViewportSize({ width, height: 780 });
        await page.goto("/journals", { waitUntil: "load" });
        await settleShell(page);
        await page.addStyleTag({ content: TEXT_SPACING });

        const clipped = await page.evaluate(() => {
          const bar = document.querySelector(
            '[data-site-shell-region="mobile-navigation"]',
          );
          if (!bar) return [];
          const barBox = bar.getBoundingClientRect();
          const offenders: string[] = [];
          for (const tab of bar.querySelectorAll<HTMLElement>(
            "[data-site-shell-tab]",
          )) {
            // The slot itself must fit inside the bar. A label that wraps to a
            // second line and spills past the bar's edge is clipped even
            // though its own box reports no overflow — which is how the first
            // draft of this file called a visibly cut label clean.
            const tabBox = tab.getBoundingClientRect();
            if (
              tabBox.bottom > barBox.bottom + 1 ||
              tabBox.top < barBox.top - 1
            ) {
              offenders.push(`${tab.dataset.siteShellTab} spills the bar`);
            }
            for (const label of tab.querySelectorAll<HTMLElement>("span")) {
              if (!label.textContent?.trim()) continue;
              if (
                label.scrollWidth > label.clientWidth + 1 ||
                label.scrollHeight > label.clientHeight + 1 ||
                getComputedStyle(label).textOverflow === "ellipsis"
              ) {
                offenders.push(label.textContent.trim());
              }
            }
          }
          return offenders;
        });
        expect(
          clipped,
          `${locale} at ${width}px clips ${JSON.stringify(clipped)}`,
        ).toEqual([]);
      });
    }
  }

  test("every header and tab control clears 44 × 44", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL, "bg");
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/journals", { waitUntil: "load" });
    await settleShell(page);

    const controls = [
      ...(await targetSizes(
        page,
        '[data-site-shell-region="header"] a, [data-site-shell-region="header"] button',
      )),
      ...(await targetSizes(
        page,
        '[data-site-shell-region="mobile-navigation"] a',
      )),
      // The language control lives in the footer since `OVE-443`; the rule is
      // about the control, not about where it sits.
      ...(await targetSizes(page, "[data-interface-language-control] summary")),
    ];

    expect(controls.length).toBeGreaterThan(5);
    const small = controls.filter(
      (control) => control.width < 44 || control.height < 44,
    );
    expect(small, JSON.stringify(small)).toEqual([]);
  });

  test("400 % zoom at 1280 needs no second scrollbar", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL, "uk");
    // 1280 × 1024 at 400 % is 320 × 256 CSS pixels. WCAG 1.4.10 asks for one
    // direction of scrolling at that size, and vertical is the one we keep.
    await page.setViewportSize({ width: 320, height: 256 });
    for (const address of ["/", "/journals", "/objects", "/knowledge"]) {
      await page.goto(address, { waitUntil: "load" });
      await settleShell(page);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.scrollingElement!.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${address} scrolls in two directions at 400 % zoom`,
      ).toBeLessThanOrEqual(overflow.innerWidth);
    }
  });

  test("nothing hides behind the bar", async ({ baseURL, context, page }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL, "uk");
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto("/journals", { waitUntil: "load" });
    await settleShell(page);
    // Scroll, then wait for it to settle: reading straight after `scrollTo`
    // measures wherever the page happened to be mid-frame.
    await page.evaluate(async () => {
      window.scrollTo(0, document.scrollingElement!.scrollHeight);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const clearance = await page.evaluate(() => {
      const bar = document.querySelector(
        '[data-site-shell-region="mobile-navigation"]',
      )!;
      // The whole column, not just the content region: the footer is the last
      // thing on a short page, and padding the content alone left it under the
      // bar.
      const column = document.querySelector('[data-site-shell-column="true"]')!;
      const footer = document.querySelector(
        '[data-site-shell-region="footer"]',
      )!;
      const style = getComputedStyle(column);
      return {
        barHeight: bar.getBoundingClientRect().height,
        contentPadding: parseFloat(style.paddingBottom),
        footerBottom: footer.getBoundingClientRect().bottom,
        barTop: bar.getBoundingClientRect().top,
      };
    });
    expect(clearance.contentPadding).toBeGreaterThanOrEqual(
      clearance.barHeight,
    );
    // The last thing on the page ends above the bar rather than under it. A
    // page shorter than the viewport already clears it, which is why the
    // padding assertion above is the one that has to hold on every page.
    expect(clearance.footerBottom).toBeLessThanOrEqual(clearance.barTop + 1);
  });
});

test.describe("axe at 375 px", () => {
  let pool: Pool;
  let fixture: OrganismFixture;
  let gardenerId: string | null = null;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    await cleanupStaleOrganismRuns(pool, PREFIX);
    fixture = await seedOrganismFixture(pool, PREFIX);
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await cleanupOrganismFixture(pool, fixture);
    await pool.end();
  });

  test("the four screens report zero violations", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL, "uk");
    await page.setViewportSize({ width: 375, height: 780 });

    for (const address of [
      "/",
      "/journals",
      `/species/${fixture.speciesSlug}`,
    ]) {
      const response = await page.goto(address, { waitUntil: "load" });
      await settleShell(page);
      expect(response?.status(), `${address}`).toBe(200);
      await page.waitForTimeout(1_200);
      const violations = await axeViolations(page);
      expect(violations, `${address}: ${JSON.stringify(violations)}`).toEqual(
        [],
      );
    }

    // The workspace, which only exists for somebody signed in.
    gardenerId = (
      await signInSyntheticGardener({
        baseURL,
        context,
        pool,
        prefix: PREFIX,
        password: TEST_PASSWORD,
      })
    ).id;

    const workspace = await page.goto("/garden", { waitUntil: "load" });

    await settleShell(page);
    expect(workspace?.status()).toBe(200);
    await page.waitForTimeout(1_500);
    const violations = await axeViolations(page);
    expect(violations, `/garden: ${JSON.stringify(violations)}`).toEqual([]);
  });

  test("a deliberate violation is seen, so a clean run means something", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto("/journals", { waitUntil: "load" });
    await settleShell(page);
    await page.evaluate(() => {
      const broken = document.createElement("img");
      broken.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      document.body.append(broken);
    });
    const violations = await axeViolations(page);
    expect(violations.map((violation) => violation.id)).toContain("image-alt");
  });
});
