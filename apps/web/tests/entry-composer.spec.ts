import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Locator, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * The one entry composer (`OVE-486`): every New entry opens it, the global one
 * with the owned-destination picker first and a contextual one with its
 * destination named; changing where keeps what was written; a space entry
 * mentions its objects; a double press is one entry; an ended session keeps
 * the text. Every outcome is read back from the database.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";

interface Garden {
  userId: string;
  greenhouse: string;
  balcony: string;
  greenhouseTomato: string;
  balconyTomato: string;
}

async function seedGarden(pool: Pool, userId: string): Promise<Garden> {
  const garden = {
    userId,
    greenhouse: randomUUID(),
    balcony: randomUUID(),
    greenhouseTomato: randomUUID(),
    balconyTomato: randomUUID(),
  };
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name)
     values ($1, $3, 'Теплиця'), ($2, $3, 'Балкон')`,
    [garden.greenhouse, garden.balcony, userId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind)
     values ($1, $3, $4, 'Томат', 'plant'), ($2, $3, $5, 'Томат', 'plant')`,
    [
      garden.greenhouseTomato,
      garden.balconyTomato,
      userId,
      garden.greenhouse,
      garden.balcony,
    ],
  );
  return garden;
}

async function entriesOf(pool: Pool, userId: string) {
  return (
    await pool.query<{
      id: string;
      entry_scope: string;
      plant_object_id: string | null;
      space_id: string;
      body: string;
      entry_date: string;
    }>(
      `select id, entry_scope, plant_object_id, space_id, body,
              to_char(entry_date, 'YYYY-MM-DD') as entry_date
         from journal_entries where owner_user_id = $1 order by created_at`,
      [userId],
    )
  ).rows;
}

async function typeInto(page: Page, composer: Locator, text: string) {
  const editor = composer
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first();
  await expect(
    composer.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready");
  await editor.click();
  await page.keyboard.type(text);
}

async function acceptDisclosure(composer: Locator) {
  const disclosure = composer.locator(
    'input[name="publicationDisclosureAccepted"]',
  );
  if ((await disclosure.count()) > 0) await disclosure.check();
}

test.describe("the one entry composer", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("global Write: the picker first, the right tomato, the text kept across a change", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove486-global",
        })
      ).id;
      const garden = await seedGarden(pool, userId);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/garden", { waitUntil: "load" });

      // Activation 1: the shell's Write.
      const write = page
        .locator('[data-site-shell-action="new-entry"]')
        .filter({ visible: true })
        .first();
      await expect(write).toHaveAttribute("href", "/garden/new");
      await waitForHydration(write);
      await write.click();
      await page.waitForURL(/\/garden\/new$/u);
      const composer = page.locator('[data-entry-composer="true"]');
      await expect(composer).toBeVisible({ timeout: 20_000 });
      await waitForHydration(composer);

      // The picker is the first question and already has focus.
      const picker = composer.getByRole("combobox").first();
      await expect(picker).toBeFocused();
      // Activation 2 (typing counted apart): the greenhouse tomato.
      await picker.fill("Томат");
      const greenhouseOption = composer
        .getByRole("option")
        .filter({ hasText: "Теплиця" })
        .first();
      await greenhouseOption.click();
      await expect(
        composer.locator('[data-entry-composer-destination-name="true"]'),
      ).toHaveText("Томат");
      await expect(composer).toContainText("Теплиця");
      // A pick moves focus straight into the text: no Continue step.
      await expect(
        composer.locator(
          "[data-lexical-journal-canvas] [contenteditable='true']",
        ),
      ).toBeFocused();
      await page.keyboard.type("Перші квіти на нижній китиці");

      // Change to the balcony tomato: the text stays.
      await composer.locator('[data-entry-composer-change="true"]').click();
      await composer.getByRole("combobox").first().fill("Томат");
      await composer
        .getByRole("option")
        .filter({ hasText: "Балкон" })
        .first()
        .click();
      await expect(composer).toContainText("Перші квіти на нижній китиці");
      await expect(composer).toContainText("Балкон");
      await scanAccessibility(page, testInfo, "entry-composer-global");

      await acceptDisclosure(composer);
      await composer.locator('[data-entry-composer-publish="true"]').click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${garden.balconyTomato}`, "u"),
        { timeout: 30_000 },
      );
      const entries = await entriesOf(pool, userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entry_scope: "object",
        plant_object_id: garden.balconyTomato,
        space_id: garden.balcony,
      });
      expect(entries[0]!.body).toContain("Перші квіти на нижній китиці");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a space note mentions its objects, and a double press is one entry", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove486-space",
        })
      ).id;
      const garden = await seedGarden(pool, userId);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "bg", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/garden/new?space=${garden.greenhouse}`, {
        waitUntil: "load",
      });
      const composer = page.locator('[data-entry-composer="true"]');
      await waitForHydration(composer);
      // Contextual: the space is named, no picker.
      await expect(
        composer.locator('[data-entry-composer-destination-name="true"]'),
      ).toHaveText("Теплиця");
      await expect(composer.getByRole("combobox")).toHaveCount(0);
      // The phone gets a full-height writing surface: no tab bar under it.
      await expect(
        page.getByRole("navigation", { name: /мобилна навигация/iu }),
      ).toHaveCount(0);

      await typeInto(page, composer, "Слана тази нощ");
      await acceptDisclosure(composer);
      // Publish with no mention: asked, not sent.
      await composer.locator('[data-entry-composer-publish="true"]').click();
      await expect(
        composer.locator('[data-entry-composer-error="destination"]'),
      ).toBeVisible();
      expect(await entriesOf(pool, userId)).toHaveLength(0);

      const mentions = composer.locator(
        '[data-entry-composer-mentions="true"]',
      );
      await mentions.getByRole("checkbox", { name: "Томат" }).check();
      const publish = composer.locator('[data-entry-composer-publish="true"]');
      await publish.dblclick();
      // A space's own page since OVE-490.
      await page.waitForURL(/\/garden\/spaces\/[0-9a-f-]{36}/u, {
        timeout: 30_000,
      });
      const entries = await entriesOf(pool, userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entry_scope: "space",
        plant_object_id: null,
        space_id: garden.greenhouse,
      });
      const mentioned = await pool.query<{ plant_object_id: string }>(
        `select plant_object_id from journal_entry_object_mentions where journal_entry_id = $1`,
        [entries[0]!.id],
      );
      expect(mentioned.rows.map((row) => row.plant_object_id)).toEqual([
        garden.greenhouseTomato,
      ]);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("an ended session keeps the text and says how to publish it", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove486-session",
        })
      ).id;
      const garden = await seedGarden(pool, userId);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "ru", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto(`/garden/new?object=${garden.greenhouseTomato}`, {
        waitUntil: "load",
      });
      const composer = page.locator('[data-entry-composer="true"]');
      await waitForHydration(composer);
      await typeInto(page, composer, "Подвязал стебель");
      await acceptDisclosure(composer);

      // The session ends while the gardener writes.
      await context.clearCookies();
      await composer.locator('[data-entry-composer-publish="true"]').click();
      const ended = composer.locator('[data-entry-composer-session="ended"]');
      await expect(ended).toBeVisible({ timeout: 20_000 });
      await expect(ended.getByRole("link")).toHaveAttribute("target", "_blank");
      // Still here, with the words.
      expect(new URL(page.url()).pathname).toBe("/garden/new");
      await expect(composer).toContainText("Подвязал стебель");
      expect(await entriesOf(pool, userId)).toHaveLength(0);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("an object's page and a gardener with nothing yet", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove486-context",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      // Nothing to write to: the two ways to have something.
      await page.goto("/garden/new", { waitUntil: "load" });
      await expect(
        page.locator('[data-entry-composer-empty-action="object"]'),
      ).toHaveAttribute("href", "/garden/objects/new");
      await expect(
        page.locator('[data-entry-composer-empty-action="first-entry"]'),
      ).toBeVisible();

      const garden = await seedGarden(pool, userId);
      await page.goto(`/garden/objects/${garden.greenhouseTomato}`, {
        waitUntil: "load",
      });
      const composer = page.locator(
        '#follow-up-composer [data-entry-composer="true"]',
      );
      await expect(composer).toBeVisible({ timeout: 20_000 });
      await expect(
        composer.locator('[data-entry-composer-destination-name="true"]'),
      ).toHaveText("Томат");
      await expect(composer.getByRole("combobox")).toHaveCount(0);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });
});
