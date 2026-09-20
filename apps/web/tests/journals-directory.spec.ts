import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";

/**
 * The journals directory stopped being a form (`OVE-448`).
 *
 * Every question here is one a unit render cannot answer. Whether a filter
 * applies without a submit press, whether the view survives a reload and the
 * Back button, whether the count's live region announces **once**, whether the
 * page still filters with the bundle switched off — all of them are about what
 * a browser does, and three of them are about what it does *between* two
 * documents.
 *
 * It runs against a **production build**: `next dev` does not exercise the
 * postpone/resume path, so the streamed shell behaves differently and a
 * dev-server run would report a false pass.
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/journals-directory.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** With it, Next's
 * author-scoped rewrite re-enters the proxy and a public entry 308s to itself
 * forever. CI omits the flag.
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

/**
 * The one filter bar a reader can see.
 *
 * `:visible` rather than the bare attribute, and that is not a convenience.
 * A streamed response carries several copies of every region — the
 * prerendered shell's skeleton and the real content inside `<div hidden>` —
 * and React's `$RC` script swaps them. Measured on 2026-09-18: `/journals`
 * serves **two** `[data-filter-bar-form]` and **four** `<main>` in its bytes,
 * and exactly one of each survives the swap. So the question worth asking is
 * "how many can a reader see", which is also the question that catches a
 * control genuinely duplicated per breakpoint.
 */
/**
 * **And settled, not merely visible.** The directory's loading shape is the
 * directory itself with nothing in it — filter bar included, every select on
 * its default. Since ADR-0032 that shape is in the static document's first
 * bytes, so it *is* visible, before the real page has been revealed over it:
 * a read of "the visible bar" straight after a reload could be a read of the
 * skeleton's, where `kind` is "all" whatever the address says.
 */
const settledDirectory =
  '[data-public-journal-directory="true"]:not([data-public-journal-directory-state="loading"])';
const visibleBar = `${settledDirectory} [data-filter-bar-form="true"]:visible`;
const visibleCount = `${settledDirectory} [data-journal-result-count="true"]:visible`;

/** The directory, settled: the shell, then the page's own controls. */
async function openDirectory(page: Page, query = "") {
  await page.goto(`/journals${query}`, { waitUntil: "load" });
  await expect(page.locator('[data-site-shell-region="header"]')).toBeVisible();
  await expect(page.locator(visibleBar)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(visibleBar)).toHaveCount(1);
  // Apply-on-change is a hydrated behaviour: before React adopts the form the
  // selects are real and inert, and a `selectOption` that lands early changes
  // nothing and navigates nowhere.
  await waitForHydration(page.locator(visibleBar));
}

test.describe("the journals directory applies its filters on change", () => {
  test("three filters by keyboard, in the URL, surviving reload and Back", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await openDirectory(page);

    // Criterion 1: no submit press. Each change is a navigation of its own, so
    // each one is waited for before the next — which is also how a reader
    // uses it.
    const facet = async (key: string, value: string) => {
      // Scoped to the bar a reader can see. The streamed shell leaves the
      // loading skeleton's copy of the form in the document until the reveal,
      // so a document-wide locator matches two selects and fails in strict
      // mode — intermittently, because whether it has revealed yet depends on
      // how busy the server is. Observed on 2026-09-18 in a full gate run.
      const control = page
        .locator(visibleBar)
        .locator(`[data-filter-bar-facet="${key}"]`);
      await control.focus();
      await expect(control).toBeFocused();
      await control.selectOption(value);
      await page.waitForURL((url) => url.searchParams.get(key) === value, {
        timeout: 20_000,
      });
    };

    await facet("kind", "plant");
    await facet("season", "summer");
    const sort = page
      .locator(visibleBar)
      .locator('[data-filter-bar-sort="true"]');
    await sort.focus();
    await sort.selectOption("oldest");
    await page.waitForURL((url) => url.searchParams.get("sort") === "oldest", {
      timeout: 20_000,
    });

    // Criterion 5: one parameter per facet, named for the facet, and the view
    // is the URL — nothing is held in memory.
    const filtered = new URL(page.url());
    expect(filtered.pathname).toBe("/journals");
    expect(filtered.searchParams.get("kind")).toBe("plant");
    expect(filtered.searchParams.get("season")).toBe("summer");
    expect(filtered.searchParams.get("sort")).toBe("oldest");
    expect(filtered.searchParams.has("page")).toBe(false);

    // It survives a reload, which is the same as surviving a shared link.
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(visibleBar)).toBeVisible({ timeout: 20_000 });
    expect(
      await page
        .locator(visibleBar)
        .locator('[data-filter-bar-facet="kind"]')
        .evaluate((node: HTMLSelectElement) => node.value),
    ).toBe("plant");
    expect(
      await page
        .locator(visibleBar)
        .locator('[data-filter-bar-sort="true"]')
        .evaluate((node: HTMLSelectElement) => node.value),
    ).toBe("oldest");

    // And Back walks the filters off one at a time, because each was a real
    // navigation rather than a state update.
    await page.goBack({ waitUntil: "load" });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        timeout: 20_000,
      })
      .toBeNull();
    expect(new URL(page.url()).searchParams.get("season")).toBe("summer");
  });

  test("a chip removes one filter, and the count is announced once", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await openDirectory(page, "?kind=plant&season=summer");

    const count = page.locator(visibleCount);
    await expect(count).toBeVisible();
    // Criterion 3: the region is polite, and it is the *settled* number that
    // goes into it — announcing on a keystroke or a hover makes it unusable.
    expect(await count.getAttribute("aria-live")).toBe("polite");
    const before = (await count.textContent())?.trim();
    expect(before, "the count is always visible").toBeTruthy();

    // The region's node has to survive the change, or there is nothing for a
    // screen reader to announce *into*: a live region that arrives with a
    // fresh document announces nothing at all. This is why a hydrated filter
    // change is a router navigation rather than a form submit.
    await count.evaluate((node) => node.setAttribute("data-probe", "marked"));

    // Criterion 2: the chip is a real link, so it works unhydrated too.
    const chip = page
      .locator('[data-slot="filter-bar"] a[aria-label^="Прибрати фільтр"]')
      .first();
    await expect(chip).toBeVisible();
    await chip.click();
    await page.waitForURL((url) => !url.searchParams.has("kind"), {
      timeout: 20_000,
    });
    await expect(page.locator(visibleBar)).toBeVisible({ timeout: 20_000 });

    const settled = page.locator(visibleCount);
    expect(
      await settled.getAttribute("data-probe"),
      "the live region was replaced, so nothing would be announced",
    ).toBe("marked");
    // One region a reader can see, not one per state: two would announce twice.
    await expect(page.locator(visibleCount)).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("season")).toBe("summer");
  });

  test("below lg the filters are one button that opens a sheet with Apply", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.setViewportSize({ width: 375, height: 812 });
    await openDirectory(page, "?kind=plant");

    // Criterion 6: one button, labelled with how many filters are on.
    const open = page.locator('[data-filter-bar-open="true"]');
    await expect(open).toBeVisible();
    await expect(open).toHaveText(/Фільтри \(\d+\)/u);
    // The inline facets are the desktop shape and must not be reachable here.
    await expect(
      page.locator('[data-filter-bar-facet="kind"]').first(),
    ).toBeHidden();

    await open.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // A sheet hides the results it is filtering, which is the one place Apply
    // earns its keep (DESIGN.md §5.1).
    await expect(
      sheet.getByRole("button", { name: "Застосувати" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();
    await expect(open).toBeFocused();
  });

  test("the filter form is a real GET form, and the server filters on it", async ({
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    // Criterion 7, and ADR-0022 D3: this is one of the product's main index
    // surfaces, so the filters must be a mechanism the server honours rather
    // than a client behaviour.
    //
    // Asked over HTTP rather than in a scripts-disabled browser, for the same
    // reason `tests/public-hydration.spec.ts` asks the like endpoint that way:
    // with scripts off, React's `$RC` swap never runs, so the page's content
    // stays inside `<div hidden>` and **nothing is visible at all**. That is
    // one Suspense boundary in `app/root-document.tsx` and is `OVE-461`'s to
    // fix; it is not a property of this form. What *is* this form's property —
    // a real `method="get"` action that the server answers — is exactly what
    // these bytes prove.
    const document = await request.get(
      new URL("/journals", baseURL).toString(),
    );
    expect(document.status()).toBe(200);
    const html = await document.text();

    // A real GET form, with its action, its facets and a real submit.
    const form = /<form[^>]*data-filter-bar-form="true"[^>]*>/u.exec(html)?.[0];
    expect(form, "the directory renders no filter form").toBeTruthy();
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/journals"');
    for (const facet of ["kind", "catalog", "topic", "season", "region"]) {
      expect(html, `the ${facet} facet is in the form`).toContain(
        `data-filter-bar-facet="${facet}"`,
      );
      expect(html, `the ${facet} facet is a named control`).toContain(
        `name="${facet}"`,
      );
    }
    expect(html).toContain('data-filter-bar-sort="true"');
    expect(html).toMatch(/<button[^>]*type="submit"/u);
    // And the results are in the bytes, not behind a fetch: this page is an
    // index surface before it is an interface.
    expect(html).toContain('data-public-journal-directory="true"');

    // The server honours what that form would submit. `kind=plant` is the
    // browser's own encoding of choosing "Рослини" and pressing the submit.
    const filtered = await request.get(
      new URL("/journals?kind=plant", baseURL).toString(),
    );
    expect(filtered.status()).toBe(200);
    const filteredHtml = await filtered.text();
    // The chosen option comes back selected, so a reader without the bundle
    // sees the state they asked for rather than a reset form.
    expect(filteredHtml).toMatch(
      /<option[^>]*value="plant"[^>]*selected|selected[^>]*value="plant"/u,
    );
    // And the filter is named in the page as a removable chip.
    expect(filteredHtml).toContain('data-slot="chip"');
    expect(filteredHtml).toContain("Прибрати фільтр");
  });

  test("axe reports nothing at 375 px and at 1440 px, filtered and unfiltered", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    for (const width of [375, 1_440]) {
      for (const query of ["", "?kind=plant&season=summer"]) {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await openDirectory(page, query);
        await page.waitForTimeout(1_000);
        const violations = await axeViolations(page);
        expect(
          violations,
          `/journals${query} at ${width} px: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });
});
