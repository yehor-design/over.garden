import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "playwright/test";

import {
  scanAccessibility,
  tabToControl,
} from "./helpers/redesign-accessibility";

/**
 * `OVE-499`: the notes, the market pages and the EPPO archive read like the
 * rest of the public site, and say what they are.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=reading-pages.spec.ts
 *
 * Every family is read as a reader reads it: the served bytes for what is
 * static, a browser for what is followed, by keyboard and without scripts.
 * The archive in the gate's database holds no records, so its empty, its
 * no-results, its invalid-search and its missing-record states are read on
 * the real routes; the populated record is the component's unit test.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-499",
);
const NOTE = "/blog/ai-garden-advice-vs-real-garden-proof";

type Locale = "uk" | "bg" | "ru";

const contexts: BrowserContext[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

async function readerContext(
  browser: Browser,
  baseURL: string,
  options: {
    locale?: Locale;
    viewport?: { width: number; height: number };
    javaScriptEnabled?: boolean;
  } = {},
) {
  const locale = options.locale ?? "uk";
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  contexts.push(context);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "bg" ? "bulgaria" : "ukraine",
      url: baseURL,
    },
  ]);
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "declined");
    } catch {
      // Storage may be blocked; the notice is then simply drawn.
    }
  }, CONSENT_KEY);
  return context;
}

/** The page's own `<main>` in the served bytes, and its `h2` ids in order. */
function mainOf(html: string, marker: string) {
  const start = html.lastIndexOf("<main", html.indexOf(marker));
  const main = html.slice(start, html.indexOf("</main>", start));
  const headings = [...main.matchAll(/<h2[^>]*\sid="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  const sections = [...main.matchAll(/<section[^>]*\sid="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  return { main, headings, sections };
}

test.describe("the notes, the market pages and the source archive (OVE-499)", () => {
  test("the notes say what a gardener finds there, from the served bytes", async ({
    request,
    baseURL,
  }) => {
    const index = await request.get(`${baseURL}/blog`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(index.status()).toBe(200);
    const { main: list } = mainOf(
      await index.text(),
      'data-public-blog-index="true"',
    );
    // A promise to the reader, not the team's plan for search traffic
    // (OG-UX-034).
    expect(list).toMatch(/<h1[^>]*>Нотатки OverGarden<\/h1>/u);
    expect(list).toContain("навіщо записувати сад");
    expect(list).not.toMatch(
      /Корисні публічні сторінки|тонкими|пошуковим системам|трафік/u,
    );
    // Each note: its title, its lead, its date and who signs it.
    expect(list).toContain(`href="${NOTE}"`);
    expect(list).toContain("Редакція OverGarden");
    expect(list).toMatch(/<time dateTime="2026-07-03">/u);
    expect(list).toContain('href="/garden"');

    const note = await request.get(`${baseURL}${NOTE}`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(note.status()).toBe(200);
    const html = await note.text();
    const { main, headings } = mainOf(html, 'data-public-blog-post="true"');
    expect(main).toContain(">Нотатка</p>");
    expect(main).toMatch(/<h1[^>]*>Порада від AI — не те саме/u);
    expect(main).toContain("Редакція OverGarden");
    expect(main).toContain("Опубліковано");
    expect(main).not.toMatch(/трафік|discovery|тонк/u);
    // Three sections of text, each a heading the contents link to, then
    // the one list of what to read next.
    const text = headings.filter((id) => id.startsWith("blog-"));
    expect(text).toHaveLength(3);
    for (const id of text) expect(main).toContain(`href="#${id}"`);
    expect(headings).toContain("related-paths-heading");
    expect(main).toContain('id="related-paths"');
    expect(main).toContain('href="#related-paths"');
    expect(main).toContain(">Читайте також<");
    expect(main).toContain('href="/guides/start-a-living-plant-record"');
    expect(html).toMatch(
      /<link rel="canonical" href="[^"]*\/blog\/ai-garden-advice-vs-real-garden-proof"/u,
    );

    for (const [locale, words] of [
      [
        "bg",
        {
          note: "Бележка",
          related: "Прочетете също",
          list: "Бележки на OverGarden",
        },
      ],
      [
        "ru",
        {
          note: "Заметка",
          related: "Читайте также",
          list: "Заметки OverGarden",
        },
      ],
    ] as const) {
      const localized = mainOf(
        await (await request.get(`${baseURL}/${locale}${NOTE}`)).text(),
        'data-public-blog-post="true"',
      ).main;
      expect(localized).toContain(`>${words.note}</p>`);
      expect(localized).toContain(`>${words.related}<`);
      expect(localized).toContain(
        `href="/${locale}/guides/start-a-living-plant-record"`,
      );
      const localizedList = mainOf(
        await (await request.get(`${baseURL}/${locale}/blog`)).text(),
        'data-public-blog-index="true"',
      ).main;
      expect(localizedList).toContain(`>${words.list}</h1>`);
    }
  });

  test("a market page says what OverGarden is for there, and every link is a page that exists", async ({
    request,
    baseURL,
  }) => {
    const ukraine = await request.get(`${baseURL}/markets/ukraine`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(ukraine.status()).toBe(200);
    const { main, sections } = mainOf(
      await ukraine.text(),
      'data-public-market-landing="true"',
    );
    expect(main).toContain(">Україна</span>");
    for (const heading of [
      "Для кого це",
      "Що тут можна робити",
      "Що варто знати",
      "З чого почати",
    ]) {
      expect(main).toContain(`>${heading}</h`);
    }
    expect(sections).toContain("market-start");
    expect(main).toContain('href="#market-start"');
    // Where to start: the journals, the catalogue, knowledge and the guide.
    for (const href of [
      "/journals",
      "/catalog",
      "/knowledge",
      "/guides/start-a-living-plant-record",
    ]) {
      expect(main).toContain(`href="${href}"`);
    }
    // In the page's language, and with nothing for sale and nobody located.
    expect(main).not.toMatch(
      /Create a public entry|Read the first-record guide|discovery|hreflang|UGC|Ринкова сторінка/u,
    );
    expect(main).not.toMatch(/ціна|кошик|оплат|доставк|координат/iu);
    expect(main).toContain("Точне місце не збирається й не показується");

    for (const locale of ["bg", "ru"] as const) {
      const response = await request.get(
        `${baseURL}/${locale}/markets/bulgaria`,
      );
      expect(response.status()).toBe(200);
      const localized = mainOf(
        await response.text(),
        'data-public-market-landing="true"',
      ).main;
      expect(localized).toContain(`href="/${locale}/journals"`);
      expect(localized).toContain(`href="/${locale}/catalog"`);
      expect(localized).toContain(`href="/${locale}/knowledge"`);
      expect(localized).toMatch(/Общия каталог на ЕС|Общего каталога ЕС/u);
      expect(localized).not.toMatch(/hreflang|UGC|discovery/u);
    }

    // The grouping stays: Ukraine is written in Ukrainian only, and a
    // prefixed spelling of a translation that does not exist is one 308.
    const missing = await request.get(`${baseURL}/ru/markets/ukraine`, {
      maxRedirects: 0,
      headers: { accept: "text/html" },
    });
    expect(missing.status()).toBe(308);
    expect(missing.headers()["location"]).toMatch(/\/markets\/ukraine$/u);
  });

  test("the archive is a reference, with one skip-link target and states in words", async ({
    request,
    baseURL,
  }) => {
    const archive = await request.get(`${baseURL}/sources/eppo`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(archive.status()).toBe(200);
    const html = await archive.text();
    // One `#main-content` in the document: the shell's.
    expect(html.match(/id="main-content"/gu)?.length).toBe(1);
    const { main } = mainOf(html, 'data-eppo-archive="explorer"');
    expect(main).toContain(">Довідкове джерело</p>");
    expect(main).toMatch(/<h1[^>]*>Архів EPPO<\/h1>/u);
    expect(main).toContain('href="/catalog"');
    expect(main).toContain('data-eppo-archive-empty="archive"');
    expect(main).toContain("В архіві поки немає жодного запису.");
    // No nought, and none of the team's words.
    expect(main).not.toMatch(/Знайдено записів: 0|безпечн|продуктов|схвален/u);

    // A search that found nothing says what was searched and the way back.
    const none = await request.get(
      `${baseURL}/sources/eppo?q=${encodeURIComponent("zzqq")}`,
      { headers: { cookie: `${LOCALE_COOKIE}=uk` } },
    );
    expect(none.status()).toBe(200);
    const noneMain = mainOf(
      await none.text(),
      'data-eppo-archive="explorer"',
    ).main;
    expect(noneMain).toContain("За «zzqq» записів немає.");
    expect(noneMain).toMatch(
      /<a[^>]*href="\/sources\/eppo"[^>]*>Показати всі записи</u,
    );

    // A search the archive cannot run says why.
    const invalid = await request.get(`${baseURL}/sources/eppo?q=a`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    const invalidMain = mainOf(
      await invalid.text(),
      'data-eppo-archive="explorer"',
    ).main;
    expect(invalidMain).toContain('data-eppo-archive-message="invalid_query"');
    expect(invalidMain).toContain("Введіть від 2 до 120 символів");

    for (const [locale, words] of [
      [
        "bg",
        {
          eyebrow: "Справочен източник",
          empty: "В архива все още няма нито един запис.",
        },
      ],
      [
        "ru",
        {
          eyebrow: "Справочный источник",
          empty: "В архиве пока нет ни одной записи.",
        },
      ],
    ] as const) {
      const localized = mainOf(
        await (await request.get(`${baseURL}/${locale}/sources/eppo`)).text(),
        'data-eppo-archive="explorer"',
      ).main;
      expect(localized).toContain(`>${words.eyebrow}</p>`);
      expect(localized).toContain(words.empty);
      expect(localized).toContain(`href="/${locale}/catalog"`);
    }
  });

  test("a note reads by keyboard: the skip link, the contents, and back up", async ({
    browser,
    baseURL,
  }, testInfo) => {
    for (const width of [1280, 390] as const) {
      const context = await readerContext(browser, baseURL!, {
        viewport: { width, height: width < 768 ? 844 : 900 },
      });
      const page = await context.newPage();
      await page.goto(NOTE, { waitUntil: "load" });

      // The first stop is the skip link, and it lands in the page's text.
      await page.keyboard.press("Tab");
      const skip = page.locator('a[href="#main-content"]');
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#main-content$/u);

      // The contents: the rail above `xl`, the article's foot below it.
      const contents =
        width >= 1280
          ? page.locator('aside[data-site-shell-region="context"]')
          : page.locator('main [data-site-shell-context="route-owned"]');
      const related = contents.locator('a[href="#related-paths"]');
      await tabToControl(page, related, 200);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#related-paths$/u);
      await expect(page.locator("#related-paths")).toBeInViewport();
      await page.screenshot({
        path: path.join(SCREENSHOTS, `after-blog-post-${width}.png`),
        fullPage: width < 768,
      });
      await scanAccessibility(page, testInfo, `note-uk-${width}`);

      for (const [name, address] of [
        ["blog", "/blog"],
        ["market-ukraine", "/markets/ukraine"],
        ["sources-eppo", "/sources/eppo"],
      ] as const) {
        await page.goto(address, { waitUntil: "load" });
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${address} scrolls sideways at ${width}`,
        ).toBe(true);
        await page.screenshot({
          path: path.join(SCREENSHOTS, `after-${name}-${width}.png`),
          fullPage: true,
        });
        await scanAccessibility(page, testInfo, `${name}-uk-${width}`);
      }
    }

    // A record that is not there is the archive's own missing page, scoped to
    // the archive and in the reader's language — as a reader sees it.
    {
      const context = await readerContext(browser, baseURL!, {
        locale: "bg",
      });
      const page = await context.newPage();
      await page.goto("/bg/sources/eppo/ZZZZZ", { waitUntil: "load" });
      const missing = page.locator('main[data-eppo-archive-state="not_found"]');
      await expect(missing.locator("h1")).toHaveText(
        "Такъв запис в архива няма.",
      );
      await expect(missing.locator('a[href="/bg/sources/eppo"]')).toBeVisible();
      await expect(missing.locator('a[href="/bg/catalog"]')).toHaveCount(0);
      await page.screenshot({
        path: path.join(SCREENSHOTS, "after-sources-eppo-missing-bg-1280.png"),
      });
      await scanAccessibility(page, testInfo, "sources-eppo-missing-bg-1280");
    }

    for (const [locale, address, name] of [
      ["bg", "/bg/markets/bulgaria", "market-bulgaria-bg"],
      ["ru", "/ru/markets/bulgaria", "market-bulgaria-ru"],
      ["bg", "/bg/sources/eppo", "sources-eppo-bg"],
      ["ru", "/ru/blog", "blog-ru"],
    ] as const) {
      const context = await readerContext(browser, baseURL!, { locale });
      const page = await context.newPage();
      await page.goto(address, { waitUntil: "load" });
      await page.screenshot({
        path: path.join(SCREENSHOTS, `after-${name}-1280.png`),
        fullPage: true,
      });
      await scanAccessibility(page, testInfo, `${name}-1280`);
    }
  });

  test("without JavaScript: the note, a market page, and the archive's own search", async ({
    browser,
    baseURL,
  }) => {
    // Below `xl`, where the contents are the article's own foot: the rail
    // above it is drawn by script, and a reader without one reads the
    // headings in place.
    const context = await readerContext(browser, baseURL!, {
      javaScriptEnabled: false,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(NOTE, { waitUntil: "load" });
    await expect(page.locator("main h1")).toContainText("Порада від AI");
    await page.locator('main a[href="#related-paths"]').first().click();
    await expect(page).toHaveURL(/#related-paths$/u);

    await page.goto("/markets/ukraine", { waitUntil: "load" });
    await expect(page.locator("main h1")).toHaveText(
      "OverGarden для садівників в Україні",
    );
    await expect(page.locator('main a[href="/journals"]')).toBeVisible();

    // The archive's search is a real form into its query view.
    await page.goto("/sources/eppo", { waitUntil: "load" });
    const search = page.locator('form[data-eppo-archive-search="true"]');
    await search.locator('input[name="q"]').fill("zzqq");
    await search.getByRole("button").click();
    await page.waitForURL(/\/sources\/eppo\?q=zzqq/u);
    await expect(
      page.locator('main[data-eppo-archive="explorer"]'),
    ).toContainText("За «zzqq» записів немає.");
    await page.goBack();
    await expect(page).toHaveURL(/\/sources\/eppo$/u);
  });
});
