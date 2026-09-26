import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * «Показати ще» (`OVE-518`, DESIGN.md §5.26): a long list shows twenty, then
 * a visible link to the next twenty that loads by itself when it scrolls into
 * view, and is a real address that works without JavaScript.
 *
 * The home feed is read through a topic made for this run, so the listing is
 * exactly the entries seeded here and its cached read is never another
 * spec's. Every count is read from the page and every identity from the
 * database.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=show-more.spec.ts
 */

const LOCALE_COOKIE = "overgarden_interface_locale";
/** Portion one, three more by scrolling, then five that wait for a press. */
const ENTRY_COUNT = 85;

interface Fixture {
  ownerUserId: string;
  topicId: string;
  topicSlug: string;
  spaceId: string;
  objectId: string;
  /** Entry ids, newest first — the feed's order. */
  entries: string[];
}

async function seedFeed(pool: Pool): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const fixture: Fixture = {
    ownerUserId: randomUUID(),
    topicId: randomUUID(),
    topicSlug: `ove518-${suffix}`,
    spaceId: randomUUID(),
    objectId: randomUUID(),
    entries: [],
  };
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Олена з Полтави', $2, true, now(), now())`,
    [fixture.ownerUserId, `ove518-${suffix}@example.test`],
  );
  await acceptLegalDocuments(pool, fixture.ownerUserId);
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Город')`,
    [fixture.spaceId, fixture.ownerUserId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Томат Чорний принц', 'plant', 'unknown')`,
    [fixture.objectId, fixture.ownerUserId, fixture.spaceId],
  );
  await pool.query(
    `insert into journal_topics (id, slug, label, trust_state) values ($1, $2, 'Томати OVE-518', 'curated')`,
    [fixture.topicId, fixture.topicSlug],
  );
  for (let index = 0; index < ENTRY_COUNT; index += 1) {
    const id = await insertEntry(pool, fixture, index, `${index} minutes`);
    fixture.entries.push(id);
  }
  return fixture;
}

async function insertEntry(
  pool: Pool,
  fixture: Fixture,
  index: number,
  age: string,
) {
  const id = randomUUID();
  await pool.query(
    `insert into journal_entries (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
       visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id)
     values ($1, $2, $3, $4, $5, $6, 'object', 'public', 'active',
             now() - $7::interval, $8, 'uk', $8)`,
    [
      id,
      fixture.ownerUserId,
      fixture.spaceId,
      fixture.objectId,
      `Запис ${index + 1}`,
      `Спостереження номер ${index + 1}: листя рівне, зав'язь тримається.`,
      age,
      `ove518-${id.slice(0, 8)}`,
    ],
  );
  await pool.query(
    `insert into journal_entry_topic_signals (journal_entry_id, topic_id, signal_source, review_state, public_membership_state)
     values ($1, $2, 'operator_curated', 'accepted', 'eligible')`,
    [id, fixture.topicId],
  );
  return id;
}

async function cleanup(pool: Pool, fixture: Fixture | null) {
  if (!fixture) return;
  await pool.query(
    "delete from journal_entry_topic_signals where topic_id = $1",
    [fixture.topicId],
  );
  for (const table of ["journal_entries", "plant_objects", "spaces"]) {
    await pool.query(`delete from ${table} where owner_user_id = $1`, [
      fixture.ownerUserId,
    ]);
  }
  await pool.query("delete from journal_topics where id = $1", [
    fixture.topicId,
  ]);
  await pool.query('delete from public."user" where id = $1', [
    fixture.ownerUserId,
  ]);
}

/** The entries the list shows, in its order, by the id each card carries. */
async function listedEntries(page: Page) {
  return page
    .locator('[data-public-feed-list="true"] > li [data-entry-card]')
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-entry-card") ?? ""),
    );
}

/**
 * The same, read from the whole document: without scripts a portion can
 * stream into its own hidden segment beside the list, which only React's
 * inline script moves into place — it is in the HTML all the same.
 */
async function documentEntries(page: Page) {
  return page
    .locator("[data-entry-card]")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-entry-card") ?? ""),
    );
}

test.describe("«Показати ще» on the home feed", () => {
  let pool: Pool;
  let fixture: Fixture | null = null;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    fixture = await seedFeed(pool);
  });
  test.afterAll(async () => {
    await cleanup(pool, fixture);
    await pool.end();
  });

  test("three portions by scrolling, then a press; nothing twice, nothing skipped", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    try {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      const response = await page.goto(`/?topic=${fixture!.topicSlug}`, {
        waitUntil: "load",
      });
      expect(response?.status()).toBe(200);
      const list = page.locator('[data-public-feed-list="true"]');
      await waitForHydration(list);
      await expect(list.locator(":scope > li")).toHaveCount(20);
      const link = page.locator('[data-show-more-link="true"]');
      await expect(link).toHaveText("Показати ще");
      await expect(link).toHaveAttribute("href", /cursor=/u);
      await scanAccessibility(page, testInfo, "show-more-home-1280");

      // Scrolling brings the link within a screen: three portions load by
      // themselves, and the link then waits for a press.
      for (const expected of [40, 60, 80]) {
        await link.scrollIntoViewIfNeeded();
        await expect(list.locator(":scope > li")).toHaveCount(expected, {
          timeout: 15_000,
        });
      }
      await page.mouse.wheel(0, 4_000);
      await page.waitForTimeout(1_500);
      await expect(list.locator(":scope > li")).toHaveCount(80);
      await expect(link).toHaveAttribute("data-show-more-link", "true");
      await expect(page.locator("[data-show-more-announcement]")).toHaveText(
        "Список доповнено.",
      );

      // Scrolling never moved focus; a press by keyboard hands it to the first
      // new item.
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(list.locator(":scope > li")).toHaveCount(ENTRY_COUNT);
      await expect(list.locator(":scope > li").nth(80)).toBeFocused();
      // The last portion has no link after it.
      await expect(link).toHaveCount(0);

      const ids = await listedEntries(page);
      expect(new Set(ids).size).toBe(ENTRY_COUNT);
      expect(ids).toEqual(fixture!.entries);
      await page.screenshot({
        path: testInfo.outputPath("home-after-portions.png"),
      });
    } finally {
      await context.close();
    }
  });

  test("an entry published between two portions duplicates and skips nothing", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    let fresh: string | null = null;
    try {
      const page = await context.newPage();
      await page.goto(`/?topic=${fixture!.topicSlug}`, { waitUntil: "load" });
      const list = page.locator('[data-public-feed-list="true"]');
      await waitForHydration(list);
      await expect(list.locator(":scope > li")).toHaveCount(20);

      fresh = await insertEntry(pool, fixture!, 900, "0 seconds");
      await page
        .locator('[data-show-more-link="true"]')
        .scrollIntoViewIfNeeded();
      await expect(list.locator(":scope > li")).toHaveCount(40, {
        timeout: 15_000,
      });
      const ids = await listedEntries(page);
      expect(new Set(ids).size).toBe(40);
      expect(ids).toEqual(fixture!.entries.slice(0, 40));
      expect(ids).not.toContain(fresh);
    } finally {
      if (fresh) {
        await pool.query(
          "delete from journal_entry_topic_signals where journal_entry_id = $1",
          [fresh],
        );
        await pool.query("delete from journal_entries where id = $1", [fresh]);
      }
      await context.close();
    }
  });

  test("Back from an entry in the third portion returns to it, portions one to three shown", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/?topic=${fixture!.topicSlug}`, { waitUntil: "load" });
      const list = page.locator('[data-public-feed-list="true"]');
      await waitForHydration(list);
      const link = page.locator('[data-show-more-link="true"]');
      for (const expected of [40, 60]) {
        await link.scrollIntoViewIfNeeded();
        await expect(list.locator(":scope > li")).toHaveCount(expected, {
          timeout: 15_000,
        });
      }
      const target = list.locator(":scope > li").nth(45);
      const title = (await target.locator("h2").first().textContent())!.trim();
      await target.locator('a[href*="/post/"]').first().click();
      await page.waitForURL(/\/post\/\d+/u);
      await page.goBack();
      await expect(list.locator(":scope > li").nth(45)).toContainText(title);
      expect(await list.locator(":scope > li").count()).toBeGreaterThanOrEqual(
        60,
      );
      await expect(list.locator(":scope > li").nth(45)).toBeInViewport();
    } finally {
      await context.close();
    }
  });

  test("without JavaScript the link is the next portion's address: 200, its own twenty, noindex, follow", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const first = await page.goto(`/?topic=${fixture!.topicSlug}`, {
        waitUntil: "load",
      });
      expect(first?.headers()["x-robots-tag"]).toBeUndefined();
      const href = await page
        .locator('[data-show-more-link="true"]')
        .getAttribute("href");
      expect(href).toMatch(/cursor=/u);

      const second = await page.goto(href!, { waitUntil: "load" });
      expect(second?.status()).toBe(200);
      expect(second?.headers()["x-robots-tag"]).toBe("noindex, follow");
      expect(await documentEntries(page)).toEqual(
        fixture!.entries.slice(20, 40),
      );

      // A cursor that is not one, and one past the last entry, are nothing.
      const broken = await page.goto(
        `/?topic=${fixture!.topicSlug}&cursor=not-a-cursor`,
      );
      expect(broken?.status()).toBe(404);
      const past = Buffer.from(
        JSON.stringify({
          version: 1,
          publishedAt: "2000-01-01T00:00:00.000Z",
          id: randomUUID(),
        }),
      ).toString("base64url");
      const beyond = await page.goto(
        `/?topic=${fixture!.topicSlug}&cursor=${past}`,
      );
      expect(beyond?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});

test.describe("«Показати ще» on a signed-in list: the bookmark shelf", () => {
  let pool: Pool;
  let fixture: Fixture | null = null;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    fixture = await seedFeed(pool);
  });
  test.afterAll(async () => {
    await cleanup(pool, fixture);
    await pool.end();
  });

  test("twenty saved entries, then the rest in place, paged in SQL by a cursor", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    let readerId: string | null = null;
    try {
      readerId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove518-shelf",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      // Twenty-five saved entries, the newest saved first.
      const saved = fixture!.entries.slice(0, 25);
      for (const [index, entryId] of saved.entries()) {
        await pool.query(
          `insert into engagement_bookmarks (owner_user_id, target_kind, target_ref, bookmark_state, created_at, updated_at)
           values ($1, 'journal_entry', $2, 'active', now() - $3::interval, now())`,
          [readerId, entryId, `${index} minutes`],
        );
      }
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/bookmarks", { waitUntil: "load" });
      const shelf = page.locator('[data-saved-shelf="bookmarks"]');
      await waitForHydration(shelf);
      await expect(page.locator("[data-my-social-count]")).toHaveAttribute(
        "data-my-social-count",
        "25",
      );
      await expect(shelf.locator(":scope > li")).toHaveCount(20);
      const link = page.locator('[data-show-more-link="true"]');
      await expect(link).toHaveAttribute("href", /\/bookmarks\?cursor=/u);
      const href = await link.getAttribute("href");

      await link.scrollIntoViewIfNeeded();
      await expect(shelf.locator(":scope > li")).toHaveCount(25, {
        timeout: 15_000,
      });
      await expect(link).toHaveCount(0);
      const rows = await shelf
        .locator(":scope > li")
        .evaluateAll((items) => items.map((item) => item.id));
      expect(new Set(rows).size).toBe(25);

      // The link's own address is the second portion alone.
      await page.goto(href!, { waitUntil: "load" });
      await expect(
        page.locator('[data-saved-shelf="bookmarks"] > li'),
      ).toHaveCount(5);
    } finally {
      if (readerId) {
        await pool.query(
          "delete from engagement_bookmarks where owner_user_id = $1",
          [readerId],
        );
        await cleanupCollection(pool, readerId);
      }
      await context.close();
    }
  });
});
