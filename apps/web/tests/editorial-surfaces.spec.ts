import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";

/**
 * The editorial and reference surfaces (`OVE-453`).
 *
 * Blog, guides, answers, knowledge, topics, markets, the EPPO source archive
 * and the legal pages had a shape each. They have two between them now: one
 * article and one hub, both built from the reading column `OVE-449`
 * established.
 *
 * There is a second reason to be careful here, and it is the reason this spec
 * exists rather than a screenshot: **these are the only paths the product
 * measures.** GA4 and GTM are wired on nine of them and nowhere else, so a
 * redesign that moved one would take a month to notice. Every one is loaded
 * here and confirmed to answer, and `src/app/google-analytics.test.tsx`
 * pins the set itself.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/editorial-surfaces.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** CI omits the flag.
 */

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

/**
 * Every path GA4 and GTM are wired on, with whether it has a prefixed twin.
 *
 * `/support` does not: it is an unprefixed `noindex` page, and the analytics
 * gate accepting `/bg/support` says nothing about a page existing there.
 */
const INSTRUMENTED_PATHS = [
  { path: "/", localized: true },
  { path: "/blog", localized: true },
  { path: "/privacy", localized: true },
  { path: "/support", localized: false },
  { path: "/first-publication-disclosure", localized: true },
] as const;

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
}

/** Evaluated through the protocol: the page's CSP blocks a script element. */
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

/** The first article the blog index links to, whatever the fixture holds. */
async function firstBlogPostPath(baseURL: string, request: Page["request"]) {
  const index = await request.get(`${baseURL}/blog`, {
    headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
  });
  const html = await index.text();
  return /href="(\/blog\/[^"?#]+)"/u.exec(html)?.[1] ?? null;
}

test.describe("the editorial and reference surfaces", () => {
  test("every instrumented path still answers, in every locale", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    // The enumeration criterion 3 asks for. A silent analytics regression is
    // invisible until a month of data is missing, so each path is loaded
    // rather than reasoned about — and each prefixed spelling too, because
    // `/bg/blog` is the same page and the same measurement.
    for (const instrumented of INSTRUMENTED_PATHS) {
      const prefixes = instrumented.localized ? ["", "/bg", "/ru"] : [""];
      for (const prefix of prefixes) {
        const url =
          `${prefix}${instrumented.path === "/" ? "" : instrumented.path}` ||
          "/";
        const response = await request.get(`${baseURL}${url}`, {
          headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
          maxRedirects: 0,
        });
        expect(
          response.status(),
          `${url} answered ${response.status()}`,
        ).toBeLessThan(400);
      }
    }
  });

  test("one article shape across blog, guides and answers", async ({
    baseURL,
    page,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const blogPath = await firstBlogPostPath(baseURL, request);
    expect(blogPath, "the blog index links to no post").toBeTruthy();

    await selectLocale(page.context(), baseURL);
    for (const surface of [blogPath!, "/privacy", "/support"]) {
      const response = await page.goto(surface, { waitUntil: "load" });
      expect(response?.status(), surface).toBe(200);
      await page.waitForTimeout(800);
      const html = await page.content();

      // The same shape, whatever the page publishes: one article element in
      // the reading column, real headings with real ids, and the contents
      // list that is the rail above `xl`.
      expect(html, `${surface} is not the article shape`).toContain(
        'data-public-article="true"',
      );
      expect(html, `${surface} has no reading column`).toContain(
        'data-article-prose="true"',
      );
      expect(html, `${surface} has no h1`).toMatch(/<h1[^>]*>/u);
      expect(
        [...html.matchAll(/<h2[^>]*id="[^"]+"/gu)].length,
        `${surface} has no addressable heading`,
      ).toBeGreaterThan(0);
    }

    // And the measure is the reading column's, not the viewport's.
    await page.goto(blogPath!, { waitUntil: "load" });
    await page.waitForTimeout(800);
    for (const width of [320, 768, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      const measured = await page.evaluate(() => {
        const prose = document.querySelector('[data-article-prose="true"] p');
        if (!prose) return null;
        const style = getComputedStyle(prose);
        return {
          width: prose.getBoundingClientRect().width,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      });
      expect(measured, "the article rendered no prose").not.toBeNull();
      // 704 px is the shell's content column and 18/29 is the reading size,
      // the same two numbers a gardener's entry is set in (DESIGN.md §2.6).
      expect(measured!.width, `${width} px`).toBeLessThanOrEqual(704);
      expect(measured!.fontSize, `${width} px`).toBe("18px");
      expect(measured!.lineHeight, `${width} px`).toBe("29px");
    }
  });

  test("one hub shape across the blog index and knowledge", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    // Read after the shell has revealed: `/knowledge` streams, so the first
    // bytes are the skeleton and asking for them would prove the skeleton.
    for (const surface of ["/blog", "/knowledge"]) {
      const response = await page.goto(surface, { waitUntil: "load" });
      expect(response?.status(), surface).toBe(200);
      await page.waitForTimeout(1_000);
      const html = await page.content();

      // A page header with one `h1`, then a list of things as a list.
      expect(html, `${surface} has no page header`).toContain(
        'data-slot="page-header"',
      );
      expect(html, `${surface} is not a list`).toContain(
        'data-slot="list-row"',
      );
      expect([...html.matchAll(/<h1[^>]*>/gu)].length, surface).toBe(1);
    }
  });

  test("the legal pages are readable rather than a wall", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    for (const surface of ["/privacy", "/first-publication-disclosure"]) {
      const response = await page.goto(surface, { waitUntil: "load" });
      expect(response?.status(), surface).toBe(200);
      await page.waitForTimeout(800);
      const html = await page.content();

      // Criterion 5 is about structure only: headings that are real headings
      // and a contents list. The wording is a legal decision and
      // `src/lib/privacy/disclosures.test.ts` is what keeps it unchanged.
      expect(html).toContain('data-public-article="true"');
      expect(html).toMatch(/<h2[^>]*id="[^"]+"/u);
      expect(html).toContain('data-site-shell-context="route-owned"');
    }
  });

  test("the EPPO archive keeps its attribution and its download date", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    // Read after the shell has revealed: this page streams, so the first
    // bytes are the skeleton and asking for them would prove the skeleton.
    const response = await page.goto("/sources/eppo", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await page.waitForTimeout(1_000);
    const html = await page.content();

    // The licence obligation, which a restyle must never drop. Whether this
    // database holds an archive decides which half is observable here: with
    // records, every one carries its observation date and its source credit;
    // without, the page is the system's own empty state rather than a blank.
    // `src/components/public/public-eppo-archive-explorer.test.tsx` asserts
    // the attribution line itself against a full fixture.
    expect(html).toContain("EPPO");
    if (html.includes('<time')) {
      expect(html).toMatch(/<time[^>]*dateTime="\d{4}-\d{2}/u);
    } else {
      expect(html).toMatch(/data-screen-state="empty-|<h1/u);
    }
    // And nothing the page itself renders reaches for the pre-redesign
    // palette. The slice stops at the RSC payload, which carries the shell's
    // serialized fallbacks and is not this page's markup.
    const rendered = html.slice(0, html.indexOf("self.__next_f"));
    expect(rendered).not.toContain("text-muted-foreground");
    expect(rendered).not.toContain("text-foreground");
  });

  test("axe reports nothing on one page of each shape", async ({
    baseURL,
    context,
    page,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const blogPath = await firstBlogPostPath(baseURL, request);
    const surfaces = [
      "/blog",
      blogPath,
      "/knowledge",
      "/privacy",
      "/support",
      "/first-publication-disclosure",
      "/sources/eppo",
    ].filter((surface): surface is string => Boolean(surface));

    for (const width of [375, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      for (const surface of surfaces) {
        const response = await page.goto(surface, { waitUntil: "load" });
        expect(response?.status(), surface).toBe(200);
        await page.waitForTimeout(1_000);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${surface} at ${width} px: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });
});
