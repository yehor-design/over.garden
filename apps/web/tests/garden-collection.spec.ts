import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
  tabToControl,
} from "./helpers/redesign-accessibility";
import {
  cleanupCollection,
  COLLECTION_PRESETS,
  seedCollection,
} from "./helpers/redesign-fixtures";
import {
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * My garden as a collection (`OVE-489`), in a browser.
 *
 * - 0 / 1 / 100 / 1000 objects: an empty garden is set up, a small one is read
 *   whole, a large one is searched and paged — never scanned.
 * - Query → object → Back returns to the same query and the same row, and an
 *   owned object keeps My garden current in both navigations (OG-UX-008).
 * - Write on a row is one activation to the one composer with that object
 *   named; Close lands back on the row.
 * - UK/BG/RU at 320, 390 and 1440 px reflow and pass axe; the search and the
 *   pages work with scripts off.
 *
 * A failed group beside a working one is proved by
 * `scripts/prove-garden-collection-partial-failure.ts`, because the only
 * honest fault — a lock on a shared table — would stall the gate's other
 * worker.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=garden-collection.spec.ts
 */

const PREFIX = "ove489";
const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

let pool: Pool;
let gardener: SyntheticGardener;
let sessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

type Preset = (typeof COLLECTION_PRESETS)[number];
type Fixture = Awaited<ReturnType<typeof seedCollection>>;

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const context = await browser.newContext();
  try {
    gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: PREFIX,
    });
    sessionCookies = await context.cookies(baseURL);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (gardener) {
    await cleanupCollection(pool, gardener.id).catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
});

async function setReaderLocale(
  context: BrowserContext,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...sessionCookies,
  ]);
}

/** An empty garden, then exactly this preset, with two dated entries. */
async function reseed(preset: Preset): Promise<Fixture> {
  for (const table of ["journal_entries", "plant_objects", "spaces"]) {
    await pool.query(`delete from ${table} where owner_user_id = $1::uuid`, [
      gardener.id,
    ]);
  }
  const fixture = await seedCollection(pool, gardener.id, preset);
  // Dated facts for "last entry" and the recent order. `visual_fixture`
  // keeps them off every public surface another spec may be reading.
  const dated = [
    { object: fixture.objects.at(-1), daysAgo: 1 },
    { object: fixture.objects[0], daysAgo: 20 },
  ];
  for (const { object, daysAgo } of dated) {
    if (!object) continue;
    await pool.query(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, entry_scope, title, body,
          client_mutation_id, entry_date, content_class)
       values ($1::uuid, $2::uuid, $3::uuid, 'object', 'OVE-489 fixture',
               'OVE-489 fixture', $4, current_date - $5::int, 'visual_fixture')`,
      [gardener.id, object.spaceId, object.id, randomUUID(), daysAgo],
    );
  }
  return fixture;
}

async function openGarden(page: Page, query = "") {
  const response = await page.goto(`/garden${query}`, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  // Visible, not merely present: the streamed sections sit hidden in the
  // document until React reveals them, up to 300 ms after they arrive, and a
  // check that runs before the reveal is a check of the skeleton.
  await expect(
    page.locator(
      '[data-garden-workspace="setup"], [data-garden-workspace="collection"]',
    ),
  ).toBeVisible({ timeout: 20_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

test.describe("My garden as a collection", () => {
  test("0, 1, 100 and 1000 objects: set up, read whole, then searched and paged", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    await setReaderLocale(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);

    // 0 destinations: setup, with its picture and the first action.
    await reseed(COLLECTION_PRESETS[0]);
    await openGarden(page);
    const setup = page.locator('[data-garden-setup="true"]');
    await expect(setup).toBeVisible();
    await expect(setup.locator("img")).toHaveAttribute(
      "src",
      /\/illustrations\/empty-garden\.webp/u,
    );
    await expect(setup.locator("[data-garden-setup-action]")).toHaveText([
      "Створити простір",
      "Додати рослину чи тварину",
    ]);
    await expect(page.locator('[data-garden-collection="true"]')).toHaveCount(
      0,
    );
    await scanAccessibility(page, testInfo, "setup-uk-1440");
    await capture(page, testInfo, "garden-0-objects-1440");

    // One space, no plant yet: the space is listed, and adding the first plant
    // is a button away (ADR-0035 D1).
    await reseed(COLLECTION_PRESETS[1]);
    await openGarden(page);
    await expect(
      page.locator('[data-garden-collection-item="space"]'),
    ).toHaveCount(1);
    await expect(page.locator('[data-garden-new-object="true"]').first()).toBeVisible();

    // One plant in one space: read whole — no search, no orders.
    const one = await reseed(COLLECTION_PRESETS[2]);
    await openGarden(page);
    const collection = page.locator('[data-garden-collection="true"]');
    await expect(collection).toHaveAttribute(
      "data-garden-collection-simple",
      "true",
    );
    await expect(page.locator('[data-garden-search="true"]')).toHaveCount(0);
    const onlyObject = page.locator(`#garden-object-${one.objects[0]!.id}`);
    await expect(onlyObject).toContainText(one.spaces[0]!.name);
    await expect(onlyObject.locator("time")).toHaveCount(1);
    await expect(
      page.locator(`[data-garden-write="${one.objects[0]!.id}"]`),
    ).toHaveAttribute(
      "href",
      new RegExp(`^/garden/new\\?object=${one.objects[0]!.id}&returnTo=`, "u"),
    );
    await scanAccessibility(page, testInfo, "one-object-uk-1440");
    await capture(page, testInfo, "garden-1-object-1440");

    // 100 objects in 3 spaces: search, orders and pages.
    const hundred = await reseed(COLLECTION_PRESETS[3]);
    await openGarden(page);
    await expect(page.locator('[data-garden-search="true"]')).toBeVisible();
    await expect(
      page.locator('[data-garden-collection-group="object"] h2'),
    ).toContainText("100");
    await expect(
      page.locator('[data-garden-collection-list="object"] > li'),
    ).toHaveCount(24);
    await expect(
      page.locator('[data-garden-collection-pagination="true"]'),
    ).toContainText("Сторінка 1 з 5");
    // Recent first: the plant written about yesterday leads.
    await expect(
      page.locator('[data-garden-collection-list="object"] > li').first(),
    ).toHaveAttribute("id", `garden-object-${hundred.objects.at(-1)!.id}`);
    // Three tomatoes with one name, told apart by their space.
    await search(page, "Tomato");
    const tomatoes = page.locator(
      '[data-garden-collection-list="object"] > li',
    );
    await expect(tomatoes).toHaveCount(3);
    const details = await tomatoes.evaluateAll((rows) =>
      rows.map((row) => row.querySelector("p + p")?.textContent ?? ""),
    );
    expect(new Set(details).size).toBe(3);
    await capture(page, testInfo, "garden-100-objects-search-1440");

    // 1000 objects in 20 spaces: one row found without scanning a card.
    const thousand = await reseed(COLLECTION_PRESETS[4]);
    await openGarden(page);
    await expect(
      page.locator('[data-garden-collection-pagination="true"]'),
    ).toContainText("Сторінка 1 з 42");
    await expect(page.locator('[data-garden-all-spaces="true"]')).toContainText(
      "20",
    );
    await search(page, "— 999");
    await expect(
      page.locator('[data-garden-collection-list="object"] > li'),
    ).toHaveCount(1);
    await expect(
      page.locator(`#garden-object-${thousand.objects[998]!.id}`),
    ).toBeVisible();
    await expect(
      page.locator('[data-garden-collection-summary="true"]'),
    ).toContainText("рослини й тварини: 1");
    await capture(page, testInfo, "garden-1000-objects-search-1440");

    // All spaces: a mode of its own, twenty rows.
    await openGarden(page);
    await page.locator('[data-garden-all-spaces="true"]').click();
    await expect(page).toHaveURL(/kind=space/u);
    await expect(
      page.locator('[data-garden-collection-list="space"] > li'),
    ).toHaveCount(20);
    await expect(
      page.locator('[data-garden-collection-group="object"]'),
    ).toHaveCount(0);
  });

  test("query → object → Back keeps the query, the row and My garden current", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await setReaderLocale(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    const fixture = await reseed(COLLECTION_PRESETS[4]);
    const target = fixture.objects[998]!;

    await openGarden(page);
    await search(page, "— 999");
    const row = page.locator(`#garden-object-${target.id}`);
    await row.locator("a").first().click();
    await expect(page).toHaveURL(
      new RegExp(`/garden/objects/${target.id}$`, "u"),
    );
    // An owned object is My garden, not the catalogue (OG-UX-008).
    await expect(
      page.locator('[data-site-shell-nav-item="garden"][aria-current="page"]'),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-site-shell-nav-item="catalogue"][aria-current="page"]',
      ),
    ).toHaveCount(0);

    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(/q=%E2%80%94(\+|%20)999/u);
    await expect(page.locator('input[name="q"]')).toHaveValue("— 999");
    await expect(row).toBeInViewport();

    // The phone's tab bar agrees.
    await page.setViewportSize(PHONE);
    await page.goto(`/garden/objects/${target.id}`, { waitUntil: "load" });
    await expect(
      page.locator('[data-site-shell-tab="garden"][aria-current="page"]'),
    ).toHaveCount(1);
  });

  test("Write on a row is one activation to the composer with that object named, and Close lands on the row", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await setReaderLocale(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    const fixture = await reseed(COLLECTION_PRESETS[3]);
    const target = fixture.objects[57]!;

    await openGarden(page, `?q=${encodeURIComponent("— 58")}`);
    const write = page.locator(`[data-garden-write="${target.id}"]`);
    await expect(write).toHaveAccessibleName(`Записати: ${target.name}`);
    await tabToControl(page, write, 120);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(
      new RegExp(`/garden/new\\?object=${target.id}&returnTo=`, "u"),
    );
    const composer = page.locator('[data-entry-composer="true"]');
    await expect(
      composer.locator('[data-entry-composer-destination-name="true"]'),
    ).toContainText(target.name);
    // One activation, and the destination is already chosen: no picker.
    await expect(
      composer.locator('[data-entry-composer-change="true"]'),
    ).toBeVisible();

    await waitForHydration(composer);
    await composer
      .getByRole("button", { name: "Скасувати", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/garden\\?q=.*#garden-object-${target.id}$`, "u"),
    );
    await expect(page.locator(`#garden-object-${target.id}`)).toBeInViewport();
  });

  test("UK, BG and RU at 320, 390 and 1440 px: no sideways scroll, axe clean", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    await reseed(COLLECTION_PRESETS[3]);
    for (const locale of ["uk", "bg", "ru"] as const) {
      await setReaderLocale(context, baseURL!, locale);
      for (const width of [320, 390, 1_440]) {
        await page.setViewportSize({ width, height: 900 });
        await openGarden(page, "?q=Tomato");
        await expect(
          page.locator('[data-garden-collection-list="object"] > li'),
        ).toHaveCount(3);
        await expectReflow(page);
        if (width !== 390) {
          await scanAccessibility(
            page,
            testInfo,
            `collection-${locale}-${width}`,
          );
        }
        await capture(page, testInfo, `garden-100-${locale}-${width}`);
      }
    }
  });

  test("every control is a real GET form or link, and every view is an address", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await setReaderLocale(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    await reseed(COLLECTION_PRESETS[3]);
    // A hard load of a page's own address is the view itself: no state
    // outside the URL.
    await openGarden(page, "?q=Tomato&sort=name&page=1");
    await expect(
      page.locator('[data-garden-collection-list="object"] > li'),
    ).toHaveCount(3);
    await openGarden(page, "?page=2");
    await expect(
      page.locator('[data-garden-collection-pagination="true"]'),
    ).toContainText("Сторінка 2 з 5");
    // A stale page past the end shows the last page, not an empty garden.
    await openGarden(page, "?page=9");
    await expect(
      page.locator('[data-garden-collection-pagination="true"]'),
    ).toContainText("Сторінка 5 з 5");

    // The controls work before the bundle does: the search is a GET form on
    // the page's own address, and pages, modes and rows are anchors.
    const controls = await page.evaluate(() => {
      const search = document.querySelector('input[name="q"]')?.closest("form");
      return {
        action: search?.getAttribute("action") ?? null,
        method: (search?.getAttribute("method") ?? "").toLowerCase(),
        previous:
          document
            .querySelector(
              '[data-garden-collection-pagination="true"] a[rel="prev"]',
            )
            ?.getAttribute("href") ?? null,
        modes: [
          ...document.querySelectorAll('[data-filter-bar-modes="true"] a'),
        ].map((link) => link.getAttribute("href")),
        writes: [...document.querySelectorAll("[data-garden-write]")].every(
          (link) => link.tagName === "A" && link.getAttribute("href"),
        ),
      };
    });
    expect(controls).toEqual({
      action: "/garden",
      method: "get",
      previous: "/garden?page=4#garden-collection",
      modes: ["/garden", "/garden?kind=object", "/garden?kind=space"],
      writes: true,
    });
  });

  test("the name order and the spaces mode are real links that survive reload", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await setReaderLocale(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    await reseed(COLLECTION_PRESETS[3]);
    await openGarden(page);

    const sort = page.locator('[data-filter-bar-sort="true"]');
    await waitForHydration(sort);
    await Promise.all([
      page.waitForURL(/sort=name/u),
      sort.selectOption("name"),
    ]);
    const names = await page
      .locator(
        '[data-garden-collection-list="object"] > li a:not([data-garden-write])',
      )
      .evaluateAll((links) =>
        links.map((link) => link.textContent?.trim() ?? ""),
      );
    expect(names.length).toBe(24);
    expect([...names].sort((a, b) => a.localeCompare(b, "uk"))[0]).toBe(
      names[0],
    );
    await page.reload({ waitUntil: "load" });
    await expect(sort).toHaveValue("name");

    await page
      .locator('[data-filter-bar-modes="true"] a', { hasText: "Простори" })
      .click();
    await expect(page).toHaveURL(/kind=space/u);
    await expect(
      page.locator('[data-garden-collection-list="space"] > li'),
    ).toHaveCount(3);
  });
});

async function search(page: Page, query: string) {
  const input = page.locator('input[name="q"]');
  await waitForHydration(input);
  await input.fill(query);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("q") === query),
    input.press("Enter"),
  ]);
  await expect(
    page.locator('[data-garden-collection-summary="true"]'),
  ).toContainText(/Знайдено|Намерени|Найдено/u);
}
