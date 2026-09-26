import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "playwright/test";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import {
  seedCollection,
  cleanupCollection,
  COLLECTION_PRESETS,
} from "./helpers/redesign-fixtures";
import { waitForHydration } from "./helpers/hydration";
import {
  scanAccessibility,
  REDESIGN_WIDTHS,
} from "./helpers/redesign-accessibility";
import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import type { OwnedDestinationPage } from "../src/lib/garden/owned-destinations";

test("owned corpus: 0/1/100/1000, complete cursor traversal, cross-user refusal, publication recency and removed target", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(150_000);
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  const context = await browser.newContext();
  const stranger = await browser.newContext();
  let userId: string | null = null;
  try {
    const member = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove483-corpus",
    });
    userId = member.id;
    const endpoint = `${baseURL}/api/garden/destinations`;
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL! },
    ]);
    const emptyPage = await context.newPage();
    await emptyPage.setViewportSize({ width: 320, height: 900 });
    // Adding the first plant asks for its space; with none yet, the picker
    // says so (the combined first-entry form is gone, ADR-0035 D1).
    await emptyPage.goto(`${baseURL}/garden/objects/new`);
    const setup = emptyPage.locator('[data-object-setup-flow="true"]');
    await waitForHydration(setup);
    await setup.getByRole("button", { name: "Далі" }).click();
    const setupName = setup.locator('[data-object-setup-section="name"]');
    await setupName.getByRole("combobox").fill("Перша рослина");
    await setupName.getByRole("button", { name: "Далі" }).click();
    const emptyPicker = setup.locator(
      '[data-object-setup-section="space"] [data-owned-destination-picker="space"]',
    );
    await waitForHydration(emptyPicker.getByRole("combobox"));
    await emptyPicker.getByRole("combobox").click();
    await expect(emptyPicker.getByRole("status")).toHaveText(
      "У вас ще немає створених просторів.",
    );
    await emptyPicker.screenshot({
      path: testInfo.outputPath("empty-space-picker.png"),
    });
    await emptyPage.close();
    expect((await stranger.request.get(endpoint)).status()).toBe(401);
    let fixture: Awaited<ReturnType<typeof seedCollection>>;
    for (const preset of COLLECTION_PRESETS) {
      await pool.query("delete from plant_objects where owner_user_id=$1", [
        userId,
      ]);
      await pool.query("delete from spaces where owner_user_id=$1", [userId]);
      fixture = await seedCollection(pool, userId, preset);
      const ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const response = await context.request.get(endpoint, {
          params: cursor ? { cursor } : {},
        });
        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toContain("no-store");
        const page: OwnedDestinationPage = await response.json();
        expect(page.items.length).toBeLessThanOrEqual(20);
        expect(page.recent).toEqual([]);
        for (const row of page.items) {
          expect(ids.has(row.id)).toBe(false);
          ids.add(row.id);
          if (row.kind === "object")
            expect(
              fixture.spaces.some((space) => space.id === row.parent?.id),
            ).toBe(true);
        }
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids.size).toBe(preset.spaces + preset.objects);
      expect(ids.has(fixture.deletedDestinationId)).toBe(false);
    }
    const final = fixture!;
    const parentSearch: OwnedDestinationPage = await (
      await context.request.get(endpoint, {
        params: { q: final.spaces[19].name },
      })
    ).json();
    expect(parentSearch.items[0]).toMatchObject({
      kind: "space",
      id: final.spaces[19].id,
    });
    expect(
      (
        await (
          await context.request.get(endpoint, { params: { q: "%" } })
        ).json()
      ).items,
    ).toEqual([]);
    const late = final.objects[999];
    const searched: OwnedDestinationPage = await (
      await context.request.get(endpoint, { params: { q: late.name } })
    ).json();
    expect(searched.items.map((row) => row.id)).toContain(late.id);
    const duplicates: OwnedDestinationPage = await (
      await context.request.get(endpoint, { params: { q: "Томат" } })
    ).json();
    expect(duplicates.items).toHaveLength(20);
    expect(
      new Set(
        duplicates.items.map((row) =>
          row.kind === "object" ? row.parent?.id : null,
        ),
      ).size,
    ).toBe(20);
    const synonym = await pool.query<{
      catalog_item_id: string;
      display_name: string;
    }>(
      "select n.catalog_item_id, n.display_name from catalog_item_names n join catalog_items c on c.id=n.catalog_item_id where c.identity_state='active' and length(n.display_name) between 5 and 100 order by n.id limit 1",
    );
    expect(synonym.rows).toHaveLength(1);
    await pool.query(
      "update plant_objects set catalog_item_id=$1 where id=$2 and owner_user_id=$3",
      [synonym.rows[0].catalog_item_id, late.id, userId],
    );
    let synonymCursor: string | null = null;
    let foundSynonym = false;
    do {
      const bySynonym: OwnedDestinationPage = await (
        await context.request.get(endpoint, {
          params: {
            q: synonym.rows[0].display_name,
            ...(synonymCursor ? { cursor: synonymCursor } : {}),
          },
        })
      ).json();
      foundSynonym ||= bySynonym.items.some(
        (row) => row.id === late.id && row.kind === "object" && !!row.species,
      );
      synonymCursor = bySynonym.nextCursor;
    } while (synonymCursor && !foundSynonym);
    expect(foundSynonym).toBe(true);
    const foreign = await signInSyntheticGardener({
      baseURL: baseURL!,
      context: stranger,
      pool,
      prefix: "ove483-foreign",
    });
    try {
      const first = await (await context.request.get(endpoint)).json();
      const leaked: OwnedDestinationPage = await (
        await stranger.request.get(endpoint, {
          params: { cursor: first.nextCursor },
        })
      ).json();
      expect(leaked.items).toEqual([]);
      expect(
        (
          await context.request.get(endpoint, {
            params: { cursor: first.nextCursor, q: "different" },
          })
        ).status(),
      ).toBe(400);
      const publish = (targetId: string, actor = context) =>
        actor.request.post(`${baseURL}/api/garden/entries`, {
          headers: {
            origin: baseURL!,
            [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
              ATOMIC_JOURNAL_CREATE_PROTOCOL,
          },
          data: buildAtomicTextJournalCreateRequest({
            publishId: randomUUID(),
            context: {
              target: "plant_object_entry",
              plantObjectId: targetId,
              entryDate: "2026-09-21",
            },
            title: "Destination proof",
            text: "Synthetic public observation in the selected destination.",
          }),
        });
      expect((await publish(late.id, stranger)).status()).toBe(404);
      const published = await publish(late.id);
      expect(published.status(), await published.text()).toBe(200);
      const recents: OwnedDestinationPage = await (
        await context.request.get(endpoint)
      ).json();
      expect(recents.recent.map((row) => row.id)).toEqual([late.id]);
      // A publication on an object must not invent a recent space publication.
      expect(recents.recent.every((row) => row.kind === "object")).toBe(true);
      const removed = final.objects[500];
      await pool.query(
        "delete from plant_objects where id=$1 and owner_user_id=$2",
        [removed.id, userId],
      );
      const removedResponse = await publish(removed.id);
      expect(removedResponse.status()).toBe(404);
      expect(await removedResponse.json()).toEqual({
        code: "destination_unavailable",
      });
      expect(
        (
          await pool.query(
            "select count(*)::int as count from journal_entries where owner_user_id=$1",
            [userId],
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await cleanupCollection(pool, foreign.id);
    }
  } finally {
    if (userId) await cleanupCollection(pool, userId);
    await context.close();
    await stranger.close();
    await pool.end();
  }
});

test("picker keyboard, explicit selection, 503 recovery, retained editor and localized reflow", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(150_000);
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  const context = await browser.newContext();
  let userId: string | null = null;
  try {
    const member = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove483-ui",
    });
    userId = member.id;
    const fixture = await seedCollection(pool, userId, {
      spaces: 20,
      objects: 1000,
    });
    const page = await context.newPage();
    for (const locale of ["uk", "bg", "ru"] as const) {
      await context.addCookies([
        { name: "overgarden_interface_locale", value: locale, url: baseURL! },
      ]);
      // A thousand objects: a new plant from the one composer, whose space is
      // chosen from twenty.
      await page.goto(`${baseURL}/garden/new`);
      const writer = page.locator('[data-entry-composer="true"]');
      await waitForHydration(writer);
      await writer.getByRole("combobox").first().fill("Retained plant name");
      await writer.locator('[data-owned-destination-create="true"]').click();
      const parent = writer.locator(
        '[data-entry-composer-new-object="true"] [data-owned-destination-picker="space"]',
      );
      const input = parent.getByRole("combobox");
      await waitForHydration(input);
      await expect(parent.locator("[data-destination-selection]")).toHaveCount(
        0,
      );
      await input.fill(fixture.spaces[19].name);
      await expect(parent.getByRole("option")).toHaveCount(1);
      await input.press("ArrowDown");
      const activeId = await input.getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
      expect(
        await page.evaluate((id) => !!document.getElementById(id!), activeId),
      ).toBe(true);
      await input.press("Enter");
      await expect(
        parent.locator("[data-destination-selection]"),
      ).toHaveAttribute(
        "data-destination-selection",
        `space:${fixture.spaces[19].id}`,
      );
      const plantName = writer.locator('input[name="newObjectName"]');
      await expect(plantName).toHaveValue("Retained plant name");
      await page.route("**/api/garden/destinations?**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"unavailable"}',
        }),
      );
      await input.fill("Retry query");
      await expect(parent.getByRole("status")).toContainText(
        /екрані|екрана|экране/,
      );
      await expect(
        parent.locator("[data-destination-selection]"),
      ).toContainText(fixture.spaces[19].name);
      await page.unroute("**/api/garden/destinations?**");
      await parent
        .getByRole("button", {
          name: /Спробувати знову|Опитайте отново|Попробовать снова/,
        })
        .click();
      await expect(input).toHaveValue("Retry query");
      await expect(plantName).toHaveValue("Retained plant name");
      await input.fill(fixture.spaces[17].name);
      await expect(parent.getByRole("option")).toHaveCount(1);
      await input.press("Escape");
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(input).not.toHaveAttribute("aria-activedescendant");
      for (const width of REDESIGN_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await input.click();
        await expect(parent.getByRole("option")).toHaveCount(1);
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
        await parent.screenshot({
          path: testInfo.outputPath(`picker-${locale}-${width}.png`),
        });
      }
      await scanAccessibility(page, testInfo, `picker-${locale}`);
    }
    const composer = page.locator('[data-entry-composer="true"]');
    const retainedText =
      "Запись остаётся после исчезновения выбранного пространства.";
    const editor = composer
      .locator(
        '[data-structured-journal-composer="true"] [contenteditable="true"]',
      )
      .first();
    await editor.fill(retainedText);
    const disclosure = composer.locator(
      'input[name="publicationDisclosureAccepted"]',
    );
    if (await disclosure.count()) await disclosure.check();
    await pool.query(
      "delete from plant_objects where space_id=$1 and owner_user_id=$2",
      [fixture.spaces[19].id, userId],
    );
    await pool.query("delete from spaces where id=$1 and owner_user_id=$2", [
      fixture.spaces[19].id,
      userId,
    ]);
    const refused = page.waitForResponse(
      (response) =>
        response.url().includes("/api/garden/entries") &&
        response.request().method() === "POST",
    );
    await composer.getByRole("button", { name: /^Опубликовать$/ }).click();
    expect((await refused).status()).toBe(404);
    await expect(composer.getByRole("alert")).toContainText(
      "Выберите другое пространство",
    );
    await expect(editor).toContainText(retainedText);
    const replacement = composer.locator(
      '[data-owned-destination-picker="space"]',
    );
    // The field still holds this name from the reflow loop, so focusing it
    // shows that list at once and asks for it again 180 ms later; a key
    // pressed in between highlights a row the fresh answer then resets, and
    // Publish went out with the removed space (a race of the test's, seen on
    // `main` too). Choose from the fresh list, and see the choice made.
    const refreshed = page.waitForResponse((response) =>
      response.url().includes("/api/garden/destinations?"),
    );
    await replacement.getByRole("combobox").fill(fixture.spaces[17].name);
    await refreshed;
    await expect(replacement.getByRole("option")).toHaveCount(1);
    await replacement.getByRole("combobox").press("ArrowDown");
    await replacement.getByRole("combobox").press("Enter");
    await expect(
      replacement.locator("[data-destination-selection]"),
    ).toHaveAttribute(
      "data-destination-selection",
      `space:${fixture.spaces[17].id}`,
    );
    const acknowledged = page.waitForResponse(
      (response) =>
        response.url().includes("/api/garden/entries") &&
        response.request().method() === "POST",
    );
    await composer.getByRole("button", { name: /^Опубликовать$/ }).click();
    expect((await acknowledged).status()).toBe(200);
    const written = await pool.query(
      "select space_id, body from journal_entries where owner_user_id=$1",
      [userId],
    );
    expect(written.rows).toHaveLength(1);
    expect(written.rows[0].space_id).toBe(fixture.spaces[17].id);
    expect(written.rows[0].body).toContain(retainedText);
    // The collection's search reaches an object far beyond its first page
    // (OVE-489), and its Write names that object.
    const late = fixture.objects[998];
    await page.goto(`${baseURL}/garden?q=${encodeURIComponent(late.name)}`);
    await expect(
      page.locator('[data-garden-collection-list="object"] > li'),
    ).toHaveCount(1);
    await expect(
      page.locator(`[data-garden-write="${late.id}"]`),
    ).toHaveAttribute("href", new RegExp(`^/garden/new\\?object=${late.id}&`));
  } finally {
    if (userId) await cleanupCollection(pool, userId);
    await context.close();
    await pool.end();
  }
});
