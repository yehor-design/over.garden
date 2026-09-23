import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
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
 * A space's own page (`OVE-490`), in a browser, against `next start` and the
 * local database:
 *
 * - a space note: Write is one activation, the published note is in the
 *   history once, labelled as the space's, under its one permalink — and Back
 *   from that permalink returns to the history;
 * - adding a plant here preselects the space and returns to it;
 * - many plants and a long history are pages of their own; an object's page
 *   leads back to its space;
 * - settings: a rename shows at once, a space with plants cannot be deleted,
 *   an empty one can;
 * - another gardener's space says nothing about itself, and the garden
 *   page's old address answers 308.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=space-page.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

let pool: Pool;
let gardener: SyntheticGardener;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const context = await browser.newContext();
  try {
    gardener = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove490",
    });
    cookies = await context.cookies(baseURL!);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (gardener) await cleanupCollection(pool, gardener.id).catch(() => {});
  await pool.end().catch(() => undefined);
});

async function signedIn(
  context: BrowserContext,
  baseURL: string,
  locale: "uk" | "bg" | "ru" = "uk",
) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...cookies,
  ]);
}

async function resetGarden() {
  for (const table of [
    "journal_entry_object_mentions",
    "journal_entries",
    "plant_objects",
    "spaces",
  ]) {
    await pool.query(`delete from ${table} where owner_user_id = $1::uuid`, [
      gardener.id,
    ]);
  }
}

async function seedSpace(
  name: string,
  objectNames: readonly string[],
): Promise<{ id: string; objects: { id: string; name: string }[] }> {
  const id = randomUUID();
  await pool.query(
    "insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)",
    [id, gardener.id, name],
  );
  const objects = objectNames.map((objectName) => ({
    id: randomUUID(),
    name: objectName,
  }));
  if (objects.length > 0) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
       select id, $1::uuid, $2::uuid, name, 'plant', 'unknown'
       from unnest($3::uuid[], $4::text[]) as f(id, name)`,
      [gardener.id, id, objects.map((o) => o.id), objects.map((o) => o.name)],
    );
  }
  return { id, objects };
}

/** Dated fixture entries; `visual_fixture` keeps them off public surfaces. */
async function seedEntries(
  spaceId: string,
  entries: readonly { objectId: string | null; daysAgo: number }[],
) {
  for (const [index, entry] of entries.entries()) {
    await pool.query(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, entry_scope, title, body,
          client_mutation_id, entry_date, content_class)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'OVE-490 fixture', $6,
               current_date - $7::int, 'visual_fixture')`,
      [
        gardener.id,
        spaceId,
        entry.objectId,
        entry.objectId ? "object" : "space",
        `OVE-490 fixture ${index + 1}`,
        randomUUID(),
        entry.daysAgo,
      ],
    );
  }
}

async function openSpace(page: Page, spaceId: string, query = "") {
  const response = await page.goto(`/garden/spaces/${spaceId}${query}`, {
    waitUntil: "load",
  });
  expect(response?.status()).toBe(200);
  // Visible, not merely present: the section is hidden until React reveals it.
  await expect(page.locator(`[data-space-overview="${spaceId}"]`)).toBeVisible({
    timeout: 20_000,
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

async function typeInto(page: Page, composer: Locator, text: string) {
  await expect(
    composer.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready");
  await composer
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first()
    .click();
  await page.keyboard.type(text);
}

test.describe("a space's own page", () => {
  test("a space note: one activation, then once in the history under its permalink, and Back returns", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(150_000);
    await resetGarden();
    await signedIn(context, baseURL!);
    await page.setViewportSize(DESKTOP);
    const space = await seedSpace("Теплиця", ["Томат", "Перець"]);

    await openSpace(page, space.id);
    await expect(page.locator("h1")).toHaveText("Простір");
    await expect(page.locator("#space-overview-heading")).toHaveText("Теплиця");
    await expect(page.locator('[data-space-history-list="true"]')).toHaveCount(
      0,
    );
    await scanAccessibility(page, testInfo, "space-uk-1440");

    // Write: one activation, the space already named.
    const write = page.locator('[data-space-action="write"]');
    await waitForHydration(write);
    await write.click();
    await expect(page).toHaveURL(/\/garden\/new\?space=/u);
    const composer = page.locator('[data-entry-composer="true"]');
    await waitForHydration(composer);
    await expect(
      composer.locator('[data-entry-composer-destination-name="true"]'),
    ).toHaveText("Теплиця");
    await typeInto(page, composer, "Провітрили теплицю після дощу");
    const disclosure = composer.locator(
      'input[name="publicationDisclosureAccepted"]',
    );
    if ((await disclosure.count()) > 0) await disclosure.check();
    await composer
      .locator('[data-entry-composer-mentions="true"]')
      .getByRole("checkbox", { name: "Томат" })
      .check();
    await composer.locator('[data-entry-composer-publish="true"]').click();

    // Acknowledged: back on the space, the note in its history, once.
    await page.waitForURL(new RegExp(`/garden/spaces/${space.id}`, "u"), {
      timeout: 30_000,
    });
    const rows = page.locator("[data-space-history-entry]");
    await expect(rows).toHaveCount(1, { timeout: 20_000 });
    await expect(rows.first()).toHaveAttribute(
      "data-space-history-about",
      "space",
    );
    await expect(rows.first()).toContainText("Про простір");
    await capture(page, testInfo, "space-uk-1440-note-in-history");
    const written = await pool.query<{
      id: string;
      entry_scope: string;
      space_id: string;
    }>(
      "select id, entry_scope, space_id from journal_entries where owner_user_id = $1",
      [gardener.id],
    );
    expect(written.rows).toHaveLength(1);
    expect(written.rows[0]).toMatchObject({
      entry_scope: "space",
      space_id: space.id,
    });

    // The permalink is the entry's one public address; Back returns here.
    const permalink = rows.first().locator("p a").first();
    const href = await permalink.getAttribute("href");
    expect(href).toMatch(/^\/@[a-z0-9_]+\/post\/\d+$/u);
    await permalink.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`, "u"));
    await expect(page.locator("main")).toContainText(
      "Провітрили теплицю після дощу",
    );
    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(new RegExp(`/garden/spaces/${space.id}`, "u"));
    await expect(page.locator("[data-space-history-entry]")).toHaveCount(1);
  });

  test("adding a plant here preselects the space and returns to it, on a phone", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await resetGarden();
    await signedIn(context, baseURL!, "bg");
    await page.setViewportSize(PHONE);
    const space = await seedSpace("Балкон", []);

    await openSpace(page, space.id);
    await expectReflow(page);
    await expect(page.locator('[data-space-section="objects"]')).toContainText(
      "В това пространство още няма растения и животни.",
    );
    await page.locator('[data-space-action="add-object"]').click();
    await expect(page).toHaveURL(/\/garden\/objects\/new\?space=/u);
    const flow = page.locator('[data-object-setup-flow="true"]');
    await waitForHydration(flow);
    await flow.getByRole("button", { name: "Напред" }).click();
    const nameSection = flow.locator('[data-object-setup-section="name"]');
    await nameSection.getByRole("combobox").fill("Мушкато");
    await nameSection.getByRole("combobox").press("Escape");
    await nameSection.getByRole("button", { name: "Напред" }).click();
    const spaceSection = flow.locator('[data-object-setup-section="space"]');
    await expect(spaceSection).toContainText("Балкон");
    await spaceSection.getByRole("button", { name: "Напред" }).click();
    await flow.locator('[data-object-setup-submit="true"]').click();

    await page.waitForURL(new RegExp(`/garden/spaces/${space.id}`, "u"), {
      timeout: 30_000,
    });
    await expect(
      page.locator('[data-space-objects-list="true"] > li'),
    ).toHaveCount(1, { timeout: 20_000 });
    await expect(
      page.locator('[data-space-objects-list="true"]'),
    ).toContainText("Мушкато");
    await capture(page, testInfo, "space-bg-390-plant-added");
    const created = await pool.query<{ space_id: string }>(
      "select space_id from plant_objects where owner_user_id = $1",
      [gardener.id],
    );
    expect(created.rows).toEqual([{ space_id: space.id }]);
  });

  test("many plants and a long history are pages of their own, and an object leads back", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await resetGarden();
    await signedIn(context, baseURL!);
    await page.setViewportSize(DESKTOP);
    const space = await seedSpace(
      "Город",
      Array.from(
        { length: 30 },
        (_, i) => `Грядка ${String(i + 1).padStart(2, "0")}`,
      ),
    );
    await seedEntries(
      space.id,
      Array.from({ length: 25 }, (_, i) => ({
        objectId: i % 2 ? space.objects[i]!.id : null,
        daysAgo: i,
      })),
    );

    await openSpace(page, space.id);
    await expect(page.locator('[data-space-views="true"]')).toBeVisible();
    await expect(
      page.locator('[data-space-objects-list="true"] > li'),
    ).toHaveCount(6);
    await expect(page.locator("[data-space-history-entry]")).toHaveCount(10);
    await expect(page.locator('[data-space-all="history"]')).toContainText(
      "25",
    );
    await capture(page, testInfo, "space-uk-1440-many");
    // Labels: the space's own notes and the plants' entries, each once.
    const abouts = await page
      .locator("[data-space-history-entry]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-space-history-about")),
      );
    expect(new Set(abouts)).toEqual(new Set(["space", "object"]));

    await page.locator('[data-space-all="history"]').click();
    await expect(page).toHaveURL(/view=history/u);
    await expect(page.locator("[data-space-history-entry]")).toHaveCount(20);
    await expect(
      page.locator('[data-space-pagination="history"]'),
    ).toContainText("Сторінка 1 з 2");
    await page
      .locator('[data-space-pagination="history"] a[rel="next"]')
      .click();
    await expect(page.locator("[data-space-history-entry]")).toHaveCount(5);
    const ids = await page
      .locator("[data-space-history-entry]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-space-history-entry")),
      );
    expect(new Set(ids).size).toBe(5);

    await page.goto(`/garden/spaces/${space.id}?view=objects`, {
      waitUntil: "load",
    });
    await expect(
      page.locator('[data-space-objects-list="true"] > li'),
    ).toHaveCount(24, { timeout: 20_000 });
    await expect(
      page.locator('[data-space-pagination="objects"]'),
    ).toContainText("Сторінка 1 з 2");

    // The object's page names its space and leads back to it.
    await page.goto(`/garden/objects/${space.objects[0]!.id}`, {
      waitUntil: "load",
    });
    const back = page.locator(`a[href="/garden/spaces/${space.id}"]`).first();
    await expect(back).toBeVisible({ timeout: 20_000 });
    await back.click();
    await expect(page).toHaveURL(
      new RegExp(`/garden/spaces/${space.id}$`, "u"),
    );
  });

  test("settings: a rename shows at once, a space with plants is not deleted, an empty one is", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await resetGarden();
    await signedIn(context, baseURL!, "ru");
    await page.setViewportSize(DESKTOP);
    const kept = await seedSpace("Сад", ["Яблоня"]);
    const empty = await seedSpace("Пустой угол", []);

    await page.goto(`/garden/spaces/${kept.id}/settings`, {
      waitUntil: "load",
    });
    const form = page.locator('[data-space-settings-form="true"]');
    await expect(form).toBeVisible({ timeout: 20_000 });
    await waitForHydration(form);
    await scanAccessibility(page, testInfo, "space-settings-ru-1440");
    await expect(
      page.locator('[data-space-delete-blocked="true"]'),
    ).toContainText("растений и животных — 1");
    await expect(page.locator("[data-space-delete-trigger]")).toHaveCount(0);
    await capture(page, testInfo, "space-settings-ru-1440-blocked");

    await form.locator('[data-space-settings-name="true"]').fill("Сад у дома");
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(
      form.locator('[data-space-settings-status="saved"]'),
    ).toContainText("Сохранено.");
    const renamed = await pool.query<{ display_name: string }>(
      "select display_name from spaces where id = $1",
      [kept.id],
    );
    expect(renamed.rows[0]?.display_name).toBe("Сад у дома");
    await openSpace(page, kept.id);
    await expect(page.locator("#space-overview-heading")).toHaveText(
      "Сад у дома",
    );

    // An empty space: deleted after one confirmation, Cancel focused first.
    await page.goto(`/garden/spaces/${empty.id}/settings`, {
      waitUntil: "load",
    });
    const trigger = page.locator(`[data-space-delete-trigger="${empty.id}"]`);
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await waitForHydration(trigger);
    await trigger.click();
    const dialog = page.locator(`[data-space-delete-dialog="${empty.id}"]`);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
    await capture(page, testInfo, "space-settings-ru-1440-delete-dialog");
    await dialog.locator(`[data-space-delete-confirm="${empty.id}"]`).click();
    await page.waitForURL(/\/garden(#garden-spaces)?$/u, { timeout: 20_000 });
    const left = await pool.query<{ id: string }>(
      "select id from spaces where owner_user_id = $1 order by created_at",
      [gardener.id],
    );
    expect(left.rows.map((row) => row.id)).toEqual([kept.id]);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from plant_objects where space_id = $1",
          [kept.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  test("another gardener's space says nothing about itself, and the old address answers 308", async ({
    browser,
    baseURL,
    request,
  }) => {
    test.setTimeout(90_000);
    await resetGarden();
    const space = await seedSpace("Приватна теплиця", ["Томат"]);

    const old = await request.get(`/garden?space=${space.id}`, {
      maxRedirects: 0,
      headers: { accept: "text/html" },
    });
    expect(old.status()).toBe(308);
    expect(new URL(old.headers().location!, baseURL).pathname).toBe(
      `/garden/spaces/${space.id}`,
    );

    const stranger = await browser.newContext();
    let strangerId: string | null = null;
    try {
      strangerId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context: stranger,
          pool,
          prefix: "ove490-stranger",
        })
      ).id;
      const page = await stranger.newPage();
      const response = await page.goto(`/garden/spaces/${space.id}`, {
        waitUntil: "load",
      });
      expect(response?.status()).toBe(200);
      await expect(
        page.locator('[data-workspace-record="missing"]'),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("body")).not.toContainText("Приватна теплиця");
      await expect(page.locator("body")).not.toContainText("Томат");
      const settings = await page.goto(`/garden/spaces/${space.id}/settings`, {
        waitUntil: "load",
      });
      expect(settings?.status()).toBe(200);
      await expect(
        page.locator('[data-workspace-record="missing"]'),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-space-settings-form]")).toHaveCount(0);
    } finally {
      if (strangerId) await cleanupCollection(pool, strangerId);
      await stranger.close();
    }
  });
});
