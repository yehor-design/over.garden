import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";
import { waitForHydration } from "./helpers/hydration";

import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
} from "./helpers/organism-fixture";
import { WCAG_AA_TAGS } from "./helpers/redesign-accessibility";

/**
 * The catalogue's one door (`OVE-451`).
 *
 * Five entrances became one listing, and every question that merge raises is
 * a question about a served response: does an address a reader bookmarked
 * still answer, does a filtered view name the right canonical, does the thing
 * filter at all with the bundle absent, and does the one page 114 669
 * organisms hang from pass axe at both widths.
 *
 * Against a **production build**, on a database holding a real Catalogue of
 * Life release:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/catalog.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** With it, the
 * author-scoped rewrite re-enters the proxy and a public address 308s to
 * itself. CI omits the flag.
 */

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
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
  }, WCAG_AA_TAGS);
}

test.describe("the catalogue's one door", () => {
  test("every old entrance still answers, and lands on the view it meant", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    // ADR-0029 D8: an address a product has published never stops answering.
    // `/objects` showed the organisms gardeners here keep, so it lands on the
    // catalogue narrowed to exactly that rather than on the whole of it.
    for (const [from, to] of [
      ["/species", "/catalog"],
      ["/objects", "/catalog?grown=1"],
      ["/bg/species", "/bg/catalog"],
      ["/ru/objects", "/ru/catalog?grown=1"],
    ] as const) {
      const response = await page.goto(from, { waitUntil: "load" });
      expect(response?.status(), `${from} answered ${response?.status()}`).toBe(
        200,
      );
      expect(page.url(), `${from} landed on ${page.url()}`).toContain(to);
      expect(
        response?.request().redirectedFrom(),
        `${from} answered without a redirect at all`,
      ).not.toBeNull();
    }
  });

  test("an organism's own address is untouched by the merge", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    // Merging entrances changes navigation, never addresses. What this proves
    // is that the merge left the three route families alone: an organism's
    // address is answered where it is asked for, with no redirect anywhere.
    // What the page under it *renders* is `tests/catalog-addresses.spec.ts`'s
    // subject, which is why this asks for the status and the absence of a
    // `Location` rather than for the body.
    // The register, not the door: the door (`OVE-496`) links only what
    // gardeners here wrote about, which a database may hold none of when it
    // is prerendered; every plant is in the register.
    const listing = await request.get(`${baseURL}/catalog?kingdom=plantae`, {
      headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
    });
    const html = await listing.text();
    const hrefs = [
      ...html.matchAll(/href="(\/(?:species|variety|breed)\/[^"?#]+)"/gu),
    ].map((match) => match[1]!);
    expect(
      hrefs.length,
      "the catalogue listed no organism to follow",
    ).toBeGreaterThan(0);

    // The listing says what an organism's address *looks like*; which ones it
    // lists is a cached answer, and on a database other specs seed and clean
    // it goes on naming an organism for a while after that organism is gone.
    // Following those hrefs answered 404 for `ove461card-…` on 2026-09-20 — a
    // fixture another file had already removed — which is a finding about the
    // cache and the fixture, not about the merge. So the addresses asked for
    // are this test's own: a species and the form under it, seeded here.
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const organism = await seedOrganismFixture(pool, "ove451door");
    try {
      for (const href of [
        `/species/${organism.speciesSlug}`,
        `/species/${organism.speciesSlug}/${organism.formSlug}`,
      ]) {
        const response = await request.get(`${baseURL}${href}`, {
          headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
          maxRedirects: 0,
        });
        expect(
          response.status(),
          `${href} answered ${response.status()}`,
        ).toBeLessThan(300);
        expect(response.headers()["location"], href).toBeUndefined();
      }
    } finally {
      await cleanupOrganismFixture(pool, organism);
      await pool.end();
    }
  });

  test("every filtered view names the door as its canonical, and is noindex", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    for (const search of [
      "",
      "?kingdom=plantae",
      "?kingdom=plantae&letter=s",
      "?rank=cultivar",
      "?register=ua",
      "?grown=1",
      "?q=solanum",
      "?sort=written",
      "?page=2",
    ]) {
      const response = await request.get(`${baseURL}/catalog${search}`, {
        headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
      });
      expect(response.status(), `/catalog${search}`).toBe(200);
      const html = await response.text();
      const canonical = /<link rel="canonical" href="([^"]+)"/u.exec(html)?.[1];
      // A kingdom, a letter and a search are filters over one listing, not
      // addresses of their own (ADR-0029 D10) — so there is one canonical.
      expect(canonical, `/catalog${search} canonical`).toMatch(
        /\/catalog$|\/catalog"$/u,
      );

      // And a filtered view is crawled for its links, never indexed against
      // the root it duplicates.
      const robots = response.headers()["x-robots-tag"] ?? null;
      if (search === "") {
        expect(robots, "the door itself is indexable").not.toBe(
          "noindex, follow",
        );
      } else {
        expect(robots, `/catalog${search} robots`).toBe("noindex, follow");
      }
    }
  });

  test("serves a GET filter form and honors its submitted query", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    // Inspect the actual form action and its server response. The plain
    // listing's visible no-JavaScript document is held separately by
    // static-documents.spec.ts; the query twin is request-time content.
    // The door (`OVE-496`) asks with its own GET form — a scope and a name —
    // before it shows any register.
    const door = await request.get(new URL("/catalog", baseURL).toString(), {
      headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
    });
    expect(door.status()).toBe(200);
    const doorHtml = await door.text();
    const search = /<form[^>]*data-catalog-search-form="true"[^>]*>/u.exec(
      doorHtml,
    )?.[0];
    expect(search, "the door renders no search form").toBeTruthy();
    expect(search).toContain('method="get"');
    expect(search).toContain('action="/catalog"');
    expect(doorHtml).toMatch(/<input type="radio"[^>]*name="kingdom"/u);
    expect(doorHtml).toContain('name="q"');

    // The register behind it keeps every facet the door used to open on.
    const document = await request.get(
      new URL("/catalog?kingdom=plantae", baseURL).toString(),
      {
        headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
      },
    );
    expect(document.status()).toBe(200);
    const html = await document.text();

    const form = /<form[^>]*data-filter-bar-form="true"[^>]*>/u.exec(html)?.[0];
    expect(form, "the catalogue renders no filter form").toBeTruthy();
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/catalog"');
    // The kingdom is the listing's one mode, a plain link (OVE-482).
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toMatch(/href="\/catalog\?kingdom=[a-z]+"/u);
    for (const facet of ["rank", "register", "grown"]) {
      expect(html, `the ${facet} facet is in the form`).toContain(
        `data-filter-bar-facet="${facet}"`,
      );
      expect(html, `the ${facet} facet is a named control`).toContain(
        `name="${facet}"`,
      );
    }
    expect(html).toContain('data-filter-bar-sort="true"');
    expect(html).toContain('name="q"');
    expect(html).toMatch(/<button[^>]*type="submit"/u);
    // And the organisms are in the bytes, not behind a fetch: this page is
    // the crawl path into 114 669 of them before it is an interface.
    expect(html).toContain('data-public-catalog-browse="true"');
    expect(html).toMatch(/href="\/(?:species|variety|breed)\//u);

    // The server honours what that form would submit. `kingdom=fungi&q=…` is
    // the browser's own encoding of choosing "Гриби" and pressing Шукати.
    const filtered = await request.get(
      new URL("/catalog?kingdom=fungi&q=amanita", baseURL).toString(),
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    expect(filtered.status()).toBe(200);
    const filteredHtml = await filtered.text();
    // What came back is the narrower set. Asserted as a count rather than as
    // a word: `amanita` appears in the search field whatever the listing
    // holds, so matching on it would pass for the wrong reason on a database
    // that has no Amanita in it.
    const unfilteredRows = [...html.matchAll(/data-slot="list-row"/gu)].length;
    const filteredRows = [...filteredHtml.matchAll(/data-slot="list-row"/gu)]
      .length;
    expect(filteredRows).toBeLessThan(unfilteredRows);
    // The chosen kingdom comes back as the current mode, so a reader without
    // the bundle sees the state they asked for rather than a reset form.
    expect(filteredHtml).toMatch(
      /href="[^"]*kingdom=fungi[^"]*"[^>]*aria-current="page"|aria-current="page"[^>]*href="[^"]*kingdom=fungi/u,
    );
    expect(filteredHtml).toMatch(/value="amanita"/u);
    // And both filters are named in the page as removable chips.
    expect(filteredHtml).toContain('data-slot="chip"');
    expect(filteredHtml).toContain("Прибрати фільтр");
  });

  test("the alphabet is a list of links a keyboard walks", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto("/catalog", { waitUntil: "load" });

    // The static document has one visible alphabet; exercise the hydrated link
    // so a cached default tree cannot pass merely by changing the URL. On the
    // door (`OVE-496`) each letter is a document navigation into the register:
    // a client one could change the URL over the door itself
    // (`public-query-twin.ts`; the slow-connection case is in
    // catalog-door.spec.ts).
    const index = page.locator('nav[aria-label="За літерою"]');
    const letters = index.locator("a");
    await expect(letters.first()).toBeVisible();

    // The whole alphabet is always rendered — 26 letters and the digit bucket
    // — because an index that appears and disappears with the data is an
    // index a reader cannot learn. On the door there is no "all letters": the
    // door is all of them (`OVE-496`); the register adds it back. A letter
    // nothing is filed under is a disabled span rather than a link to an
    // empty page, so how many are *links* depends on what the database holds;
    // what must not depend on that is the shape.
    await expect(index.locator("li")).toHaveCount(27);
    const linkCount = await letters.count();
    expect(linkCount, "no letter is reachable at all").toBeGreaterThan(0);

    // Every one is a real anchor with a real href — this is the crawl path —
    // and focus moves through them by Tab without a roving tabindex to learn.
    const first = letters.first();
    await waitForHydration(first);
    await first.focus();
    await expect(first).toBeFocused();
    const href = await first.getAttribute("href");
    expect(href).toContain("/catalog?letter=");

    await page.keyboard.press("Enter");
    await page.waitForURL(/letter=/u);
    expect(page.url()).toContain("letter=");
    const chosen = new URL(href!, baseURL).searchParams.get("letter")!;
    await expect(
      page.locator(
        'nav[aria-label="За літерою"]:visible a[aria-current="true"]',
      ),
    ).toHaveText(chosen);
    await expect(
      page
        .locator('[data-filter-bar-form]:visible input[name="letter"]')
        .first(),
    ).toHaveValue(chosen);
    // The register's own alphabet has "all letters" back.
    await expect(
      page.locator('nav[aria-label="За літерою"]:visible li'),
    ).toHaveCount(28);
  });

  test("axe reports nothing on the door, a listing and an empty view", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    for (const width of [375, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      for (const surface of [
        "/catalog",
        "/catalog?kingdom=fungi&letter=a",
        // Nothing is filed under this, which is the empty state: filters
        // excluded everything, so the page shows them rather than a picture.
        "/catalog?q=zzzzznothingmatchesthis",
      ]) {
        const response = await page.goto(surface, { waitUntil: "load" });
        expect(response?.status(), surface).toBe(200);
        await page.waitForTimeout(1_200);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${surface} at ${width} px: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });

  test("the typeahead reads no cookie and answers no personal data", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // ADR-0026 D7: one Postgres statement behind the route, reading no
    // cookies and no personal data. A session cookie sent with the request
    // must change nothing about the answer.
    // `kind` is part of the route's own contract: the suggestions are scoped
    // to plants or to animals, and a request without it is refused rather
    // than answered with everything.
    const endpoint = `${baseURL}/api/public/catalog/typeahead?q=sol&kind=plant`;
    const plain = await request.get(endpoint);
    const withCookie = await request.get(endpoint, {
      headers: { cookie: "overgarden_session=not-a-real-session" },
    });

    expect(plain.status()).toBe(200);
    expect(withCookie.status()).toBe(200);
    expect(await withCookie.text()).toBe(await plain.text());
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(await plain.text()).not.toMatch(
      /email|userId|owner_user_id|session|handle/i,
    );
  });

  test("the door's own read is bounded, on fresh URLs", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // Repeating one URL measures the cache, not the query — which has misled
    // this project before, and the catalogue caches for **days**. So each
    // sample is a combination picked at random from 416 of them, which makes
    // a rerun measure the read again rather than the read's answer.
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const kingdoms = [
      "plantae",
      "animalia",
      "fungi",
      "bacteria",
      "chromista",
      "viruses",
      "protozoa",
      "archaea",
    ];
    const sorts = ["name", "written"];
    const seen = new Set<string>();
    const samples: number[] = [];
    while (samples.length < 10) {
      const search =
        `?letter=${letters[Math.floor(Math.random() * letters.length)]}` +
        `&kingdom=${kingdoms[Math.floor(Math.random() * kingdoms.length)]}` +
        `&sort=${sorts[Math.floor(Math.random() * sorts.length)]}`;
      if (seen.has(search)) continue;
      seen.add(search);
      const started = Date.now();
      const response = await request.get(`${baseURL}/catalog${search}`, {
        headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
      });
      samples.push(Date.now() - started);
      expect(response.status(), search).toBe(200);
    }

    samples.sort((left, right) => left - right);
    const p95 =
      samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]!;
    console.log(
      JSON.stringify({
        catalogBrowseLatencyMs: {
          samples,
          p95,
          median: samples[Math.floor(samples.length / 2)],
        },
      }),
    );
    // A first-load budget for a page nothing has cached: the listing is one
    // indexed range scan plus a facet count, and 2 s is the point at which a
    // reader on a slow connection has already left.
    expect(p95, `samples: ${samples.join(", ")}`).toBeLessThan(2_000);
  });
});
