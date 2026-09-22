import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * Editing an entry, leaving it, and deleting it (`OVE-488`). Every outcome is
 * read back from the database or from the entry's public address:
 *
 * - the edit page names where the entry is, and Save keeps its address and
 *   returns to the entry's own place in the timeline; a double press is one
 *   revision;
 * - a clean Cancel leaves at once; a dirty Escape, Cancel or Back asks Stay
 *   or Discard, and Stay keeps every word;
 * - a failed save keeps the text and Save works again; an ended session keeps
 *   the text and offers sign-in in another tab;
 * - deleting lives in the entry's own menu, names the entry, returns focus on
 *   Cancel, and on Confirm the entry leaves the timeline and its address
 *   answers 410;
 * - another gardener's entry, or a deleted one, is not editable.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";

interface SeededEntry {
  objectId: string;
  entryId: string;
  title: string;
  publicPath: string;
}

async function seedEntry(
  pool: Pool,
  userId: string,
  title: string,
): Promise<SeededEntry> {
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const entryId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Теплиця')`,
    [spaceId, userId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind)
     values ($1, $2, $3, 'Томат', 'plant')`,
    [objectId, userId, spaceId],
  );
  const body = "Нижні листки жовтіють після зливи.";
  const document = {
    schemaVersion: 1,
    blocks: [{ id: "b_first", type: "paragraph", spans: [{ text: body }] }],
  };
  const inserted = await pool.query<{ n: number }>(
    `insert into journal_entries (id, owner_user_id, space_id, plant_object_id, title, body,
       content_document, content_schema_version, entry_scope, visibility, lifecycle_state,
       published_at, public_slug, source_language, client_mutation_id, entry_date)
     values ($1, $2, $3, $4, $5, $6, $7, 1, 'object', 'public', 'active', now(), $8, 'uk', $8,
       current_date)
     returning author_entry_number as n`,
    [
      entryId,
      userId,
      spaceId,
      objectId,
      title,
      body,
      JSON.stringify(document),
      `ove488-${entryId.slice(0, 8)}`,
    ],
  );
  const handle = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
      where user_id = $1 and lifecycle_state = 'current'`,
    [userId],
  );
  return {
    objectId,
    entryId,
    title,
    publicPath: `/@${handle.rows[0]!.handle}/post/${inserted.rows[0]!.n}`,
  };
}

async function revisionOf(pool: Pool, entryId: string) {
  const row = await pool.query<{
    revision: number;
    title: string;
    body: string;
    state: string;
  }>(
    `select journal_revision::int as revision, title, body, lifecycle_state as state
       from journal_entries where id = $1`,
    [entryId],
  );
  return row.rows[0] ?? null;
}

async function openEdit(page: Page, entry: SeededEntry) {
  const returnTo = `/garden/objects/${entry.objectId}#passport-entry-${entry.entryId}`;
  await page.goto(
    `/garden/entries/${entry.entryId}/edit?returnTo=${encodeURIComponent(returnTo)}`,
    { waitUntil: "load" },
  );
  const form = page.locator('[data-local-composer-kind="edit_entry"]');
  await waitForHydration(form);
  await expect(
    form.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  return form;
}

async function typeInStory(page: Page, text: string) {
  const editor = page
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test.describe("editing, leaving and deleting an entry (OVE-488)", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("names the destination, saves once to the same address, and returns to the entry", async ({
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
          prefix: "ove488-save",
        })
      ).id;
      const entry = await seedEntry(pool, userId, "Жовте листя");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      const form = await openEdit(page, entry);

      await expect(
        form.locator('[data-entry-edit-destination-name="true"]'),
      ).toHaveText("Томат");
      await expect(
        form.locator('[data-entry-edit-destination="true"]'),
      ).toContainText("Теплиця");
      // Delete is not beside Save: it is in the entry's own menu.
      await expect(
        form.locator("[data-entry-actions-trigger]"),
      ).toHaveAttribute("aria-label", "Дії із записом «Жовте листя»");

      await typeInStory(page, " Обірвала два листки.");
      const save = form.getByRole("button", { name: "Зберегти зміни" });
      await save.dblclick();
      await page.waitForURL(
        new RegExp(
          `/garden/objects/${entry.objectId}#passport-entry-${entry.entryId}$`,
          "u",
        ),
        { timeout: 30_000 },
      );
      const saved = await revisionOf(pool, entry.entryId);
      // A double press is one revision.
      expect(saved?.revision).toBe(2);
      expect(saved?.body).toContain("Обірвала два листки.");
      // The address is the entry's, unchanged.
      const publicPage = await context.request.get(
        `${baseURL}${entry.publicPath}`,
        {
          maxRedirects: 0,
        },
      );
      expect(publicPage.status()).toBe(200);
      expect(await publicPage.text()).toContain("Обірвала два листки.");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a clean Cancel leaves at once; a dirty Escape, Cancel or Back asks, and Stay keeps every word", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove488-leave",
        })
      ).id;
      const entry = await seedEntry(pool, userId, "Підв'язка");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto(`/garden/objects/${entry.objectId}`, {
        waitUntil: "load",
      });

      // Clean: Cancel leaves without a question.
      let form = await openEdit(page, entry);
      await form.locator('[data-entry-edit-cancel="true"]').click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${entry.objectId}`, "u"),
      );
      await expect(
        page.locator('[data-unpublished-work-guard="true"]'),
      ).toHaveCount(0);

      form = await openEdit(page, entry);
      await typeInStory(page, " Друга підв'язка.");
      const guard = page.locator('[data-unpublished-work-guard="true"]');

      // Escape asks; Stay keeps the words and the page.
      await page.keyboard.press("Escape");
      await expect(guard).toBeVisible();
      await guard.locator('[data-unpublished-work-guard-stay="true"]').click();
      await expect(guard).toBeHidden();
      await expect(form).toContainText("Друга підв'язка.");

      // Back asks too, and the composer is still there to be asked.
      await page.evaluate(() => window.history.back());
      await expect(guard).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(
        `/garden/entries/${entry.entryId}/edit`,
      );
      await guard.locator('[data-unpublished-work-guard-stay="true"]').click();
      await expect(form).toContainText("Друга підв'язка.");

      // Cancel asks; Discard leaves for the entry's place, and nothing saved.
      await form.locator('[data-entry-edit-cancel="true"]').click();
      await expect(guard).toBeVisible();
      await guard
        .locator('[data-unpublished-work-guard-confirm="true"]')
        .click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${entry.objectId}`, "u"),
      );
      expect((await revisionOf(pool, entry.entryId))?.revision).toBe(1);

      // Back after a dirty edit, then Leave: the page before, not a loop.
      form = await openEdit(page, entry);
      await typeInStory(page, " Ще раз.");
      await page.evaluate(() => window.history.back());
      await expect(guard).toBeVisible();
      await guard
        .locator('[data-unpublished-work-guard-confirm="true"]')
        .click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${entry.objectId}`, "u"),
      );
      expect((await revisionOf(pool, entry.entryId))?.body).not.toContain(
        "Ще раз.",
      );
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a failed save keeps the text and saves on retry; an ended session keeps it too", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove488-retry",
        })
      ).id;
      const entry = await seedEntry(pool, userId, "Полив");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      const form = await openEdit(page, entry);
      await typeInStory(page, " Полила ввечері.");

      // The server refuses once.
      let refuse = true;
      await page.route(
        `**/api/garden/entries/${entry.entryId}`,
        async (route) => {
          if (refuse && route.request().method() === "PATCH") {
            refuse = false;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ code: "service_unavailable" }),
            });
            return;
          }
          await route.continue();
        },
      );
      const save = form.getByRole("button", { name: "Зберегти зміни" });
      await save.click();
      await expect(
        form.locator('[data-local-journal-composer-status="failed"]'),
      ).toBeVisible({ timeout: 20_000 });
      await expect(form).toContainText("Полила ввечері.");
      expect((await revisionOf(pool, entry.entryId))?.revision).toBe(1);

      // The session ends: Save keeps the text and offers sign-in elsewhere.
      const cookies = await context.cookies();
      await context.clearCookies();
      await save.click();
      const ended = form.locator('[data-entry-edit-session="ended"]');
      await expect(ended).toBeVisible({ timeout: 20_000 });
      await expect(ended.getByRole("link")).toHaveAttribute("target", "_blank");
      expect(new URL(page.url()).pathname).toBe(
        `/garden/entries/${entry.entryId}/edit`,
      );
      await expect(form).toContainText("Полила ввечері.");

      // Signed in again (as another tab would), Save works from the same text.
      await context.addCookies(cookies);
      await save.click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${entry.objectId}`, "u"),
        {
          timeout: 30_000,
        },
      );
      const saved = await revisionOf(pool, entry.entryId);
      expect(saved?.revision).toBe(2);
      expect(saved?.body).toContain("Полила ввечері.");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("deleting lives in the entry's menu, names it, cancels cleanly and answers 410 once confirmed", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove488-delete",
        })
      ).id;
      const kept = await seedEntry(pool, userId, "Перше цвітіння");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto(`/garden/objects/${kept.objectId}`, {
        waitUntil: "load",
      });
      const trigger = page.locator(
        `[data-entry-actions-trigger="${kept.entryId}"]`,
      );
      await waitForHydration(trigger);
      // No delete form sits in the timeline.
      await expect(page.locator('input[name="deleteAccepted"]')).toHaveCount(0);

      // By keyboard: open the menu, choose Delete.
      await trigger.focus();
      await page.keyboard.press("Enter");
      const deleteItem = page.locator('[data-entry-action="delete"]');
      await expect(deleteItem).toBeVisible();
      await deleteItem.focus();
      await page.keyboard.press("Enter");
      const dialog = page.locator(
        `[data-entry-delete-dialog="${kept.entryId}"]`,
      );
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Видалити «Перше цвітіння»?");
      await expect(dialog).toContainText("7 днів");
      // Cancel is where focus starts, and Cancel changes nothing.
      await expect(
        dialog.getByRole("button", { name: "Скасувати" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect((await revisionOf(pool, kept.entryId))?.state).toBe("active");

      // Confirmed: gone from the timeline, a tombstone at its address.
      await trigger.click();
      await deleteItem.click();
      await expect(dialog).toBeVisible();
      await dialog
        .locator(`[data-entry-delete-confirm="${kept.entryId}"]`)
        .click();
      await expect(trigger).toHaveCount(0, { timeout: 20_000 });
      await expect(
        page.locator("#passport-timeline").getByText("Перше цвітіння"),
      ).toHaveCount(0);
      // Said aloud once the entry and its menu are gone.
      await expect(page.locator("[data-og-status-announcer]")).toHaveText(
        "Запис «Перше цвітіння» видалено.",
      );
      expect((await revisionOf(pool, kept.entryId))?.state).toBe(
        "deleted_retention",
      );
      const tombstone = await context.request.get(
        `${baseURL}${kept.publicPath}`,
        {
          maxRedirects: 0,
        },
      );
      expect(tombstone.status()).toBe(410);

      // The edit link of a deleted entry is not an editor.
      await page.goto(`/garden/entries/${kept.entryId}/edit`, {
        waitUntil: "load",
      });
      await expect(
        page.locator('[data-local-composer-kind="edit_entry"]'),
      ).toHaveCount(0);

      // Delete from the edit page lands on the object, not on a tombstone.
      const second = await seedEntry(pool, userId, "Друга спроба");
      const form = await openEdit(page, second);
      await form
        .locator(`[data-entry-actions-trigger="${second.entryId}"]`)
        .click();
      await page.locator('[data-entry-action="delete"]').click();
      await page
        .locator(`[data-entry-delete-confirm="${second.entryId}"]`)
        .click();
      await page.waitForURL(
        new RegExp(`/garden/objects/${second.objectId}$`, "u"),
        { timeout: 30_000 },
      );
      expect((await revisionOf(pool, second.entryId))?.state).toBe(
        "deleted_retention",
      );
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("another gardener's entry has no editor here", async ({
    browser,
    baseURL,
  }) => {
    const ownerContext = await browser.newContext();
    const otherContext = await browser.newContext();
    let ownerId: string | null = null;
    let otherId: string | null = null;
    try {
      ownerId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context: ownerContext,
          pool,
          prefix: "ove488-owner",
        })
      ).id;
      otherId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context: otherContext,
          pool,
          prefix: "ove488-other",
        })
      ).id;
      const entry = await seedEntry(pool, ownerId, "Чужий запис");
      await otherContext.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await otherContext.newPage();
      await page.goto(`/garden/entries/${entry.entryId}/edit`, {
        waitUntil: "load",
      });
      await expect(
        page.locator('[data-local-composer-kind="edit_entry"]'),
      ).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(
        "Нижні листки жовтіють після зливи.",
      );
    } finally {
      if (ownerId) await cleanupCollection(pool, ownerId);
      if (otherId) await cleanupCollection(pool, otherId);
      await ownerContext.close();
      await otherContext.close();
    }
  });
});
