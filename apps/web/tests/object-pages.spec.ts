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
} from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import {
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * An owned object's three pages (`OVE-491`), in a browser, against
 * `next start` and the local database:
 *
 * - the history is the page — one `h1`, the object's name under it, writing
 *   before a long timeline — and settings and provenance are pages of their
 *   own, each with one `h1`, reached from the object's sections and left with
 *   Back;
 * - a source of the same kind is recorded by name; a crafted request naming
 *   an object of the other kind is refused with a reason and writes nothing;
 * - an animal's pages speak of animals, on a phone;
 * - old fragment links land on the page that now holds their block, another
 *   gardener learns nothing, and cancelling a deletion deletes nothing.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=object-pages.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

let pool: Pool;
let gardener: SyntheticGardener;
let stranger: SyntheticGardener;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let strangerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  for (const who of ["gardener", "stranger"] as const) {
    const context = await browser.newContext();
    try {
      const signedIn = await signInSyntheticGardener({
        baseURL: baseURL!,
        context,
        pool,
        prefix: `ove491-${who}`,
      });
      const jar = await context.cookies(baseURL!);
      if (who === "gardener") {
        gardener = signedIn;
        cookies = jar;
      } else {
        stranger = signedIn;
        strangerCookies = jar;
      }
    } finally {
      await context.close();
    }
  }
});

test.afterAll(async () => {
  for (const who of [gardener, stranger]) {
    if (!who) continue;
    await resetGarden(who.id).catch(() => undefined);
    await cleanupCollection(pool, who.id).catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
});

async function withCookies(
  context: BrowserContext,
  baseURL: string,
  jar: typeof cookies,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...jar,
  ]);
}

/** Provenance edges first: they hold their objects (`on delete restrict`). */
async function resetGarden(userId: string) {
  for (const table of [
    "lineage_provenance_edges",
    "journal_entry_object_mentions",
    "journal_entries",
    "plant_objects",
    "spaces",
  ]) {
    await pool.query(`delete from ${table} where owner_user_id = $1::uuid`, [
      userId,
    ]);
  }
}

interface Garden {
  spaceId: string;
  tomato: string;
  seedling: string;
  bees: string;
}

async function seedGarden(): Promise<Garden> {
  const garden: Garden = {
    spaceId: randomUUID(),
    tomato: randomUUID(),
    seedling: randomUUID(),
    bees: randomUUID(),
  };
  await pool.query(
    "insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон')",
    [garden.spaceId, gardener.id],
  );
  await pool.query(
    `insert into plant_objects
       (id, owner_user_id, space_id, display_name, object_kind, variety_state, variety_text)
     values
       ($1, $4, $5, 'Томат черрі', 'plant', 'free_text', 'Черрі з ринку'),
       ($2, $4, $5, 'Розсада томата', 'plant', 'unknown', null),
       ($3, $4, $5, 'Бджолосім''я 1', 'animal', 'unknown', null)`,
    [garden.tomato, garden.seedling, garden.bees, gardener.id, garden.spaceId],
  );
  return garden;
}

/** Dated public entries; `visual_fixture` keeps them off public surfaces. */
async function seedHistory(garden: Garden, objectId: string, count: number) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = randomUUID();
    ids.push(id);
    await pool.query(
      `insert into journal_entries
         (id, owner_user_id, space_id, plant_object_id, entry_scope, title, body,
          client_mutation_id, entry_date, content_class, visibility,
          lifecycle_state, published_at, public_slug)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'object', $5,
               'OVE-491 fixture', $6, current_date - $7::int, 'visual_fixture',
               'public', 'active', now(), $8)`,
      [
        id,
        gardener.id,
        garden.spaceId,
        objectId,
        `Спостереження ${index + 1}`,
        randomUUID(),
        index,
        `ove491-${id.slice(0, 8)}`,
      ],
    );
  }
  return ids;
}

async function open(page: Page, path: string, ready: string) {
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  // Visible, not merely present: a section is hidden until React reveals it.
  await expect(page.locator(ready).first()).toBeVisible({ timeout: 20_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

async function edgeRows(userId: string) {
  const result = await pool.query<{
    subject_plant_object_id: string;
    source_plant_object_id: string | null;
  }>(
    `select subject_plant_object_id::text, source_plant_object_id::text
       from lineage_provenance_edges where owner_user_id = $1`,
    [userId],
  );
  return result.rows;
}

test.describe("an owned object's pages", () => {
  test("the history is the page; settings and provenance are their own, one heading each", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(150_000);
    await resetGarden(gardener.id);
    await withCookies(context, baseURL!, cookies, "uk");
    await page.setViewportSize(DESKTOP);
    const garden = await seedGarden();
    await seedHistory(garden, garden.tomato, 30);

    // History: one h1, the name under it, writing before the long timeline.
    await open(
      page,
      `/garden/objects/${garden.tomato}`,
      '[data-living-object-passport="overview"]',
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Живий об'єкт");
    await expect(
      page.locator('[data-living-object-passport="overview"] h2').first(),
    ).toHaveText("Томат черрі");
    await expect(
      page.locator('[data-object-sections] a[aria-current="page"]'),
    ).toHaveAttribute("data-object-section", "history");
    const composer = page.locator("#follow-up-composer");
    const timeline = page.locator("#passport-timeline");
    await expect(composer).toBeVisible();
    await expect(timeline).toBeVisible();
    expect((await composer.boundingBox())!.y).toBeLessThan(
      (await timeline.boundingBox())!.y,
    );
    // Twenty entries, then «Показати ще» (`OVE-518`): a real link to the
    // timeline's next portion, which arrives in place as it scrolls near.
    await expect(timeline.locator("article").nth(19)).toBeVisible();
    await timeline
      .locator("[data-show-more-link]")
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
    await expect(timeline.locator("article")).toHaveCount(30, {
      timeout: 15_000,
    });
    const entryIds = await timeline
      .locator("article")
      .evaluateAll((articles) => articles.map((article) => article.id));
    expect(new Set(entryIds).size).toBe(30);
    await expect(timeline.locator("[data-show-more-link]")).toHaveCount(0);
    // The progress summary is a span and two photographs below Write, never
    // a second copy of the timeline above it.
    const progress = page.locator(
      'section[aria-labelledby="object-progress-heading"]',
    );
    await expect(progress).toBeVisible();
    await expect(progress.locator("li")).toHaveCount(0);
    expect((await composer.boundingBox())!.y).toBeLessThan(
      (await progress.boundingBox())!.y,
    );
    // Settings and provenance are not on this page.
    await expect(page.locator("#passport-management")).toHaveCount(0);
    await expect(page.locator("#passport-provenance")).toHaveCount(0);
    await expect(page.locator("#passport-overview")).not.toContainText(
      "Доглядальник",
    );
    await scanAccessibility(page, testInfo, "object-history-uk-1440");
    await capture(page, testInfo, "object-history-uk-1440-long");

    // Settings: its own heading, the object named under it.
    await page.locator('[data-object-section="settings"]:visible').click();
    await expect(page).toHaveURL(
      new RegExp(`/garden/objects/${garden.tomato}/settings$`, "u"),
    );
    await expect(page.locator("#passport-privacy")).toBeVisible({
      timeout: 20_000,
    });
    // Next keeps the page it left mounted and hidden (React `<Activity>`,
    // `display: none`), so one heading is one *visible* heading — the one in
    // the accessibility tree.
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.locator("h1:visible")).toHaveText("Налаштування об'єкта");
    await expect(
      page.locator(`[data-object-subpage-header="${garden.tomato}"] h2`),
    ).toHaveText("Томат черрі");
    await expect(
      page.locator(`[data-object-subpage-header="${garden.tomato}"]`),
    ).toContainText("Рослина · Балкон · Черрі з ринку");
    await expect(page.locator("#passport-catalog")).toBeVisible();
    await expect(page.locator("#passport-timeline:visible")).toHaveCount(0);
    await expect(page.locator("#follow-up-composer:visible")).toHaveCount(0);
    await scanAccessibility(page, testInfo, "object-settings-uk-1440");
    await capture(page, testInfo, "object-settings-uk-1440");

    // Provenance: only plants are offered, and none is chosen.
    await page.locator('[data-object-section="provenance"]:visible').click();
    await expect(page).toHaveURL(
      new RegExp(`/garden/objects/${garden.tomato}/provenance$`, "u"),
    );
    const select = page.locator('[data-provenance-source-select="true"]');
    await expect(select).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.locator("h1:visible")).toHaveText("Походження об'єкта");
    await expect(select).toHaveValue("");
    const options = await select.locator("option").allTextContents();
    expect(options[0]).toBe("Оберіть об'єкт-джерело");
    expect(options.slice(1)).toEqual(["Розсада томата · Рослина · Невідомо"]);
    expect(options.join(" ")).not.toContain("Бджолосім'я");
    await expect(
      page.locator('[data-provenance-source-submit="true"]'),
    ).toBeDisabled();
    await expect(page.locator("main:visible")).toContainText(
      "Лише рослини з вашого саду",
    );
    await scanAccessibility(page, testInfo, "object-provenance-uk-1440");
    await capture(page, testInfo, "object-provenance-uk-1440");

    // Back walks the way it came.
    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(/\/settings$/u);
    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(
      new RegExp(`/garden/objects/${garden.tomato}$`, "u"),
    );
    await expect(page.locator("#follow-up-composer")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a same-kind source is recorded by name; a crafted cross-kind request is refused and writes nothing", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await resetGarden(gardener.id);
    await withCookies(context, baseURL!, cookies, "uk");
    await page.setViewportSize(DESKTOP);
    const garden = await seedGarden();
    const path = `/garden/objects/${garden.tomato}/provenance`;

    // A request no honest form sends: the chosen option is rewritten to name
    // the bee colony before it is submitted.
    await open(page, path, '[data-provenance-source-select="true"]');
    const select = page.locator('[data-provenance-source-select="true"]');
    await waitForHydration(select);
    await select.selectOption(garden.seedling);
    const submit = page.locator('[data-provenance-source-submit="true"]');
    await expect(submit).toHaveText(
      "Записати: «Томат черрі» походить від «Розсада томата»",
    );
    await select
      .locator(`option[value="${garden.seedling}"]`)
      .evaluate(
        (option, beesId) => option.setAttribute("value", beesId),
        garden.bees,
      );
    await submit.click();
    await expect(
      page.locator('[data-provenance-source-status="refused"]'),
    ).toBeAttached({ timeout: 20_000 });
    await expect(page.locator("main")).toContainText(
      "Не записано: рослина не може походити від тварини",
    );
    expect(await edgeRows(gardener.id)).toEqual([]);
    // React resets the form once the server answers; the button follows the
    // list, so it never names a choice the list no longer shows.
    await expect(select).toHaveValue("");
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText("Записати об'єкт-джерело");
    await capture(page, testInfo, "object-provenance-uk-1440-refused");

    // The honest request, from a fresh page.
    await open(page, path, '[data-provenance-source-select="true"]');
    await waitForHydration(select);
    await select.selectOption(garden.seedling);
    await submit.click();
    await expect(
      page.locator('[data-provenance-source-status="recorded"]'),
    ).toHaveText("Походження записано.", { timeout: 20_000 });
    await expect(select).toHaveValue("");
    await expect(submit).toBeDisabled();
    await expect
      .poll(() => edgeRows(gardener.id), { timeout: 15_000 })
      .toEqual([
        {
          subject_plant_object_id: garden.tomato,
          source_plant_object_id: garden.seedling,
        },
      ]);
    await expect(page.locator("[data-provenance-records] li")).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page.locator("[data-provenance-records]")).toContainText(
      "Розсада томата",
    );
    await expect(
      page.locator('[data-object-section="provenance"]'),
    ).toContainText("1");
    await capture(page, testInfo, "object-provenance-uk-1440-recorded");
  });

  test("an animal's pages speak of animals, on a phone", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await resetGarden(gardener.id);
    await withCookies(context, baseURL!, cookies, "bg");
    await page.setViewportSize(PHONE);
    const garden = await seedGarden();

    await open(
      page,
      `/garden/objects/${garden.bees}`,
      '[data-living-object-passport="overview"]',
    );
    const overview = page.locator('[data-living-object-passport="overview"]');
    await expect(overview).toContainText("Животно");
    await expect(overview).toContainText("Вид или порода");
    expect(await overview.innerText()).not.toMatch(/растени/iu);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectReflow(page);

    await open(
      page,
      `/garden/objects/${garden.bees}/provenance`,
      "[data-object-subpage-header]",
    );
    await expect(page.locator("[data-object-subpage-header]")).toContainText(
      "Животно · Балкон",
    );
    // No other animal to come from — said in words, and no plant offered.
    await expect(page.locator("main")).toContainText(
      "В градината ви още няма друго животно",
    );
    await expect(
      page.locator('[data-provenance-source-select="true"]'),
    ).toHaveCount(0);
    await expectReflow(page);
    await scanAccessibility(page, testInfo, "object-provenance-bg-390");
    await capture(page, testInfo, "object-provenance-bg-390-animal");

    await open(
      page,
      `/garden/objects/${garden.bees}/settings`,
      "#passport-privacy",
    );
    await expect(page.locator("[data-object-subpage-header]")).toContainText(
      "Животно · Балкон",
    );
    await expectReflow(page);
    await scanAccessibility(page, testInfo, "object-settings-bg-390");
    await capture(page, testInfo, "object-settings-bg-390-animal");
  });

  test("old links land on the moved blocks, a stranger learns nothing, and a cancelled delete deletes nothing", async ({
    browser,
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(150_000);
    await resetGarden(gardener.id);
    await withCookies(context, baseURL!, cookies, "ru");
    await page.setViewportSize(DESKTOP);
    const garden = await seedGarden();
    const [entryId] = await seedHistory(garden, garden.tomato, 1);

    // An old fragment link lands on the page that holds the block now.
    await page.goto(`/garden/objects/${garden.tomato}#passport-catalog`, {
      waitUntil: "load",
    });
    await expect(page).toHaveURL(
      new RegExp(
        `/garden/objects/${garden.tomato}/settings#passport-catalog$`,
        "u",
      ),
      { timeout: 20_000 },
    );
    await expect(page.locator("#passport-catalog")).toBeVisible({
      timeout: 20_000,
    });
    await page.goto(`/garden/objects/${garden.tomato}#passport-provenance`, {
      waitUntil: "load",
    });
    await expect(page).toHaveURL(
      new RegExp(
        `/garden/objects/${garden.tomato}/provenance#passport-provenance$`,
        "u",
      ),
      { timeout: 20_000 },
    );

    // Cancelling a deletion deletes nothing.
    await open(
      page,
      `/garden/objects/${garden.tomato}`,
      '[data-living-object-passport="overview"]',
    );
    const trigger = page.locator(`[data-entry-actions-trigger="${entryId}"]`);
    await waitForHydration(trigger);
    await trigger.click();
    await page.locator('[data-entry-action="delete"]').click();
    const dialog = page.locator(`[data-entry-delete-dialog="${entryId}"]`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Спостереження 1");
    await expect(page.locator(":focus")).toHaveText("Отмена");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    const lifecycle = await pool.query<{ lifecycle_state: string }>(
      "select lifecycle_state from journal_entries where id = $1",
      [entryId],
    );
    expect(lifecycle.rows[0]?.lifecycle_state).toBe("active");
    await expect(page.locator("#passport-timeline article")).toHaveCount(1);

    // Another gardener: the same "not in your garden" on all three pages,
    // with nothing of the object in them.
    const other = await browser.newContext();
    try {
      await withCookies(other, baseURL!, strangerCookies, "ru");
      const strangerPage = await other.newPage();
      for (const suffix of ["", "/settings", "/provenance"]) {
        await open(
          strangerPage,
          `/garden/objects/${garden.tomato}${suffix}`,
          '[data-workspace-record="missing"]',
        );
        const text = await strangerPage.locator("main").innerText();
        expect(text).not.toContain("Томат черрі");
        expect(text).not.toContain("Балкон");
      }
    } finally {
      await other.close();
    }
    expect(await edgeRows(gardener.id)).toEqual([]);
  });
});
