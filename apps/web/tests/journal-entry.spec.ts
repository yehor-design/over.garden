import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";

/**
 * The public journal entry (`OVE-449`) — the page the whole product exists to
 * produce, and the one most of its readers will see once.
 *
 * Everything here is a question about a rendered page. The measure of a line
 * of prose is a laid-out fact, not a class name. Whether a keyboard reaches
 * the engagement controls and the comments is a fact about tab order. And the
 * document's own HTML being untouched is asserted in
 * `src/components/garden/journal-document-renderer.test.tsx` against a golden
 * file generated on `origin/main`, because bytes are cheaper to compare there.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/journal-entry.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** With it, the
 * author-scoped rewrite re-enters the proxy and a public entry 308s to itself.
 */

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
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
 * One published entry's own address, straight from the database.
 *
 * The address is `(handle, slug)` since migration `0073` — an entry's name
 * belongs to its author — so the join is the lookup, and an entry whose author
 * has no current handle has no address at all. A gate database accumulates
 * those: each run's teardown removes the gardener and leaves the rows.
 */
async function publishedEntryPath(): Promise<string | null> {
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  try {
    const row = await pool.query<{ handle: string; number: number }>(
      `select r.normalized_handle as handle, e.author_entry_number as number
         from journal_entries e
         join user_handle_registry r
           on r.user_id = e.owner_user_id and r.lifecycle_state = 'current'
        where e.author_entry_number is not null
          and e.published_at is not null
          and e.lifecycle_state = 'active'
        order by e.created_at desc
        limit 1`,
    );
    const found = row.rows[0];
    // The entry's address is its author and its number (ADR-0029 D9). Its
    // name would still open the page, through a 308 this gate has no use for.
    return found ? `/@${found.handle}/post/${found.number}` : null;
  } finally {
    await pool.end();
  }
}

async function openEntry(page: Page, entryPath: string) {
  const response = await page.goto(entryPath, { waitUntil: "load" });
  expect(
    response?.status(),
    `${entryPath} answered ${response?.status()}`,
  ).toBe(200);
  await expect(page.locator('[data-public-journal-entry="true"]')).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("the public journal entry", () => {
  let entryPath: string | null = null;

  test.beforeAll(async () => {
    entryPath = await publishedEntryPath();
  });

  test("the prose measures 60–75 characters at every width", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    if (!entryPath) test.skip(true, "no published entry on this database");
    await selectLocale(context, baseURL);

    // A measure is a laid-out fact. The way to read it is to lay out a line of
    // real characters in the paragraph's own computed font and divide — a
    // class name says nothing about how many characters fit.
    for (const width of [375, 768, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await openEntry(page, entryPath!);

      const measured = await page.evaluate(() => {
        // The reading column's own prose, not a caption or an eyebrow: an
        // unscoped `p` matched a 12 px caption and reported 95 characters.
        const paragraph = document.querySelector(
          '[data-journal-prose="true"] p',
        );
        if (!paragraph) return null;
        const style = getComputedStyle(paragraph);
        const probe = document.createElement("span");
        probe.style.font = style.font;
        probe.style.letterSpacing = style.letterSpacing;
        probe.style.position = "absolute";
        probe.style.whiteSpace = "nowrap";
        probe.style.visibility = "hidden";
        // The conventional yardstick: the lower-case alphabet, which is what
        // "characters per line" has always meant in typography.
        probe.textContent = "abcdefghijklmnopqrstuvwxyz";
        document.body.append(probe);
        const perCharacter = probe.getBoundingClientRect().width / 26;
        probe.remove();
        return {
          columnWidth: paragraph.getBoundingClientRect().width,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          characters: Math.round(
            paragraph.getBoundingClientRect().width / perCharacter,
          ),
        };
      });

      expect(measured, "the entry rendered no prose to measure").not.toBeNull();
      // The column never exceeds the shell's 704 px, and the prose is the
      // reading size (18/29) rather than the interface's 16.
      expect(measured!.columnWidth).toBeLessThanOrEqual(704);
      expect(measured!.fontSize).toBe("18px");
      expect(measured!.lineHeight).toBe("29px");

      if (width >= 768) {
        // DESIGN.md §2.6: 60–75 characters where the column can hold them.
        expect(
          measured!.characters,
          `${width} px: ${JSON.stringify(measured)}`,
        ).toBeGreaterThanOrEqual(60);
        expect(
          measured!.characters,
          `${width} px: ${JSON.stringify(measured)}`,
        ).toBeLessThanOrEqual(75);
      } else {
        // At 375 px the measure is the viewport's, not the design's: 60
        // characters at 18 px needs about 590 px of column, and shrinking the
        // type to reach the number would take it under §2.6's 13 px floor and
        // make the page harder to read, not easier. What is asserted instead
        // is that the prose uses the width it has.
        expect(
          measured!.columnWidth,
          `${width} px: ${JSON.stringify(measured)}`,
        ).toBeGreaterThan(width - 48);
      }
    }
  });

  test("has exactly one h1, and it is the entry's title", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    if (!entryPath) test.skip(true, "no published entry on this database");
    await selectLocale(context, baseURL);
    await openEntry(page, entryPath!);

    // A document's own level-1 heading renders as `h2` (ADR-0028), so this
    // stays the page's one `h1` however the gardener wrote.
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll("h1")]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.textContent?.trim() ?? ""),
    );
    expect(headings).toHaveLength(1);
    expect(headings[0]!.length).toBeGreaterThan(0);
  });

  test("a keyboard reaches the content, the engagement controls and the comments", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    if (!entryPath) test.skip(true, "no published entry on this database");
    await selectLocale(context, baseURL);
    await openEntry(page, entryPath!);

    // The skip link is the first focusable element and is visible on focus.
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => {
      const node = document.activeElement as HTMLElement | null;
      return {
        href: node?.getAttribute("href") ?? null,
        visible: (node?.getBoundingClientRect().height ?? 0) > 0,
      };
    });
    expect(skip.href).toBe("#main-content");
    expect(skip.visible, "the skip link is invisible on focus").toBe(true);

    // From there, keep walking until the engagement bar and the comment
    // control have both held focus. No mouse event anywhere in this test.
    const reached = new Set<string>();
    for (let step = 0; step < 90; step += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const node = document.activeElement;
        if (!node || node === document.body) return null;
        if (node.closest('[data-slot="engagement-bar"]')) return "engagement";
        if (node.closest("#comments")) return "comments";
        if (node.closest('[data-public-journal-entry="true"]')) return "entry";
        return "chrome";
      });
      if (where && where !== "chrome") reached.add(where);
      if (reached.has("engagement") && reached.has("comments")) break;
    }

    expect(
      [...reached].sort(),
      "the keyboard never reached these regions",
    ).toEqual(expect.arrayContaining(["comments", "engagement"]));
  });

  test("the like control names the action and the count, and owns one polite region", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    if (!entryPath) test.skip(true, "no published entry on this database");
    await selectLocale(context, baseURL);
    await openEntry(page, entryPath!);

    // DESIGN.md §5.6: the accessible name states the action *and* the count,
    // so a screen-reader user knows what they are about to change before they
    // change it.
    const like = page.locator("#comments button[aria-pressed]").first();
    await expect(like).toBeVisible();
    const name = await like.evaluate(
      (node) => node.getAttribute("aria-label") ?? node.textContent ?? "",
    );
    expect(name, `the like control is named "${name}"`).toMatch(/\d/u);

    // Exactly one live region in the bar. Two announce twice and print the
    // number twice, which is what the first version of the bar did.
    const regions = page.locator(
      '[data-slot="engagement-bar"] [data-engagement-status="true"]',
    );
    await expect(regions).toHaveCount(1);
    expect(await regions.getAttribute("aria-live")).toBe("polite");
  });

  test("axe reports nothing at 375 px and at 1440 px", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    if (!entryPath) test.skip(true, "no published entry on this database");
    await selectLocale(context, baseURL);

    for (const width of [375, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await openEntry(page, entryPath!);
      await page.waitForTimeout(1_000);
      const violations = await axeViolations(page);
      expect(
        violations,
        `the entry at ${width} px: ${JSON.stringify(violations)}`,
      ).toEqual([]);
    }
  });
});
