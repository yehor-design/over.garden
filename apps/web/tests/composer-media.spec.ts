import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Locator, type Page } from "playwright/test";

import { fakeStaging, photograph } from "./helpers/fake-staging";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * Photographs and blocks inside the shared composer (`OVE-487`).
 *
 * A plain note needs no photograph, no formatting decision and no cover
 * decision; the tools that add one sit under the text as ordinary buttons and
 * never take the caret. Photographs are converted to WebP in this browser,
 * uploaded straight to staging, and say which step they are in, per
 * photograph; a failed upload is retried, a broken file is named and removed,
 * a photograph moves by keyboard, and Publish sends exactly the photographs
 * the story shows, in the order it shows them.
 *
 * **Nothing reaches production.** The staging Worker is
 * `media-stage.over.garden`, which a local run cannot sign for, so the
 * session route and the Worker are answered here, and the publish request is
 * read and refused: this proves what the browser sends. The server's claim of
 * those uploads is the unchanged ADR-0019 contract, proven end to end against
 * a local Worker in `OVE-487-PROOF.md`.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";
async function seedTomato(pool: Pool, userId: string) {
  const space = randomUUID();
  const tomato = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Теплиця')`,
    [space, userId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind)
     values ($1, $2, $3, 'Томат', 'plant')`,
    [tomato, userId, space],
  );
  return tomato;
}

async function openComposer(page: Page, tomato: string) {
  await page.goto(`/garden/new?object=${tomato}`, { waitUntil: "load" });
  const composer = page.locator('[data-entry-composer="true"]');
  await waitForHydration(composer);
  await expect(
    composer.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  return composer;
}

function editorOf(composer: Locator) {
  return composer
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first();
}

async function editorHasFocus(page: Page) {
  return page.evaluate(
    () => document.activeElement?.getAttribute("contenteditable") === "true",
  );
}

test.describe("photographs and blocks in the shared composer (OVE-487)", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("a plain note: the tools sit under the text, keep the caret, and ask nothing about photographs", async ({
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
          prefix: "ove487-text",
        })
      ).id;
      const tomato = await seedTomato(pool, userId);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      const composer = await openComposer(page, tomato);

      // No cover question and no photo section on a note without a photo.
      await expect(
        composer.locator("[data-journal-cover-controls]"),
      ).toHaveCount(0);
      await expect(composer.locator("[data-photo-picker-control]")).toHaveCount(
        0,
      );
      const tools = composer.locator('[data-journal-composer-tools="true"]');
      await expect(tools).toBeVisible();
      for (const tool of ["photo", "bold", "italic", "bulletList", "blocks"]) {
        await expect(
          tools.locator(`[data-journal-tool="${tool}"]`),
        ).toBeVisible();
      }
      // The first line invites writing, not a command.
      await expect(
        composer.locator("[data-journal-placeholder]").first(),
      ).toHaveAttribute("data-journal-placeholder", "Як минув день у саду?");

      // Bold from the row, on a selection: the caret stays in the story.
      const editor = editorOf(composer);
      await editor.click();
      await page.keyboard.type("Нижнє листя пожовкло");
      await page.keyboard.down("Shift");
      for (let i = 0; i < "пожовкло".length; i += 1) {
        await page.keyboard.press("ArrowLeft");
      }
      await page.keyboard.up("Shift");
      await tools.locator('[data-journal-tool="bold"]').click();
      await expect(editor.locator("strong")).toHaveText("пожовкло");
      await expect(tools.locator('[data-journal-tool="bold"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(await editorHasFocus(page)).toBe(true);

      // Every block from the keyboard through the one plain button: Tab to
      // it, open, choose Quote; the caret goes into the new quote.
      // ArrowRight, not End: macOS keybindings, which Playwright keeps, give
      // End to scrolling and would leave the word selected.
      await page.keyboard.press("ArrowRight");
      await page.mouse.move(4, 4);
      const blocksButton = tools.locator('[data-journal-tool="blocks"]');
      let reached = false;
      const walked: string[] = [];
      for (let press = 0; press < 12 && !reached; press += 1) {
        await page.keyboard.press("Tab");
        reached = await blocksButton.evaluate(
          (node) => node === document.activeElement,
        );
        walked.push(
          await page.evaluate(() => {
            const active = document.activeElement;
            return active
              ? `${active.tagName}:${active.getAttribute("data-journal-tool") ?? active.getAttribute("aria-label") ?? ""}`
              : "none";
          }),
        );
      }
      expect(
        reached,
        `the block button is reachable by Tab: ${walked.join(" → ")}`,
      ).toBe(true);
      await page.keyboard.press("Enter");
      const quote = page.locator('[data-journal-tool-block="quote"]');
      await expect(quote).toBeVisible();
      await quote.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => editorHasFocus(page)).toBe(true);
      await page.keyboard.type("Старе листя знизу");
      await expect(editor.locator("blockquote")).toContainText(
        "Старе листя знизу",
      );

      // The whole width on a phone: no 56 px gutter beside the text.
      await page.setViewportSize({ width: 390, height: 844 });
      const canvas = composer.locator("[data-lexical-journal-canvas]");
      await expect
        .poll(() =>
          canvas.evaluate((node) => getComputedStyle(node).paddingLeft),
        )
        .toBe("0px");
      await expect(
        composer.locator("[data-journal-block-gutter]"),
      ).toBeHidden();
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect
        .poll(() =>
          canvas.evaluate((node) => getComputedStyle(node).paddingLeft),
        )
        .toBe("56px");

      // A plain note publishes as it always has.
      const disclosure = composer.locator(
        'input[name="publicationDisclosureAccepted"]',
      );
      if ((await disclosure.count()) > 0) await disclosure.check();
      await composer.locator('[data-entry-composer-publish="true"]').click();
      await page.waitForURL(new RegExp(`/garden/objects/${tomato}`, "u"), {
        timeout: 30_000,
      });
      const entries = await pool.query<{
        content_document: {
          blocks: Array<{ type: string; data?: Record<string, unknown> }>;
        };
      }>(
        `select content_document from journal_entries where owner_user_id = $1`,
        [userId],
      );
      expect(entries.rows).toHaveLength(1);
      expect(
        entries.rows[0]!.content_document.blocks.map((block) => block.type),
      ).toContain("quote");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("photographs: device stages, a failed upload retried, a broken file named and removed, a keyboard move, and exactly those sent", async ({
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
          prefix: "ove487-media",
        })
      ).id;
      const tomato = await seedTomato(pool, userId);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);

      // Every upload waits until the test knows which photograph is which.
      let knowIds!: (ids: { portrait: string; landscape: string }) => void;
      const ids = new Promise<{ portrait: string; landscape: string }>(
        (resolve) => (knowIds = resolve),
      );
      let releasePortrait!: () => void;
      const portraitReleased = new Promise<void>(
        (resolve) => (releasePortrait = resolve),
      );
      let landscapeAllowed = false;
      const staging = await fakeStaging(context, async (upload) => {
        const known = await ids;
        if (upload.mediaAssetId === known.portrait) {
          await portraitReleased;
          return "stage";
        }
        if (upload.mediaAssetId === known.landscape && !landscapeAllowed) {
          return "fail";
        }
        return "stage";
      });
      let published: Record<string, unknown> | null = null;
      await context.route("**/api/garden/entries", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        published = route.request().postDataJSON() as Record<string, unknown>;
        // Read, then refused: the server's claim is not this test's to make.
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "service_unavailable" }),
        });
      });

      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 900 });
      const composer = await openComposer(page, tomato);
      const editor = editorOf(composer);
      await editor.click();
      await page.keyboard.type("Плями на листі після зливи");

      // Three files in one pick: a portrait JPEG, a landscape PNG and a file
      // that only says it is a JPEG.
      const chooser = page.waitForEvent("filechooser");
      await composer.locator('[data-journal-tool="photo"]').click();
      const picker = await chooser;
      expect(picker.isMultiple()).toBe(true);
      await picker.setFiles([
        {
          name: "portrait.jpg",
          mimeType: "image/jpeg",
          buffer: await photograph(page, "portrait", "image/jpeg"),
        },
        {
          name: "landscape.png",
          mimeType: "image/png",
          buffer: await photograph(page, "landscape", "image/png"),
        },
        {
          name: "broken.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("not a photograph"),
        },
      ]);
      const photos = composer.locator("[data-lexical-journal-image-content]");
      await expect(photos).toHaveCount(3);
      const [portraitId, landscapeId, brokenId] = await photos.evaluateAll(
        (nodes) =>
          nodes.map((node) => node.getAttribute("data-media-asset-id")!),
      );
      knowIds({ portrait: portraitId!, landscape: landscapeId! });
      const photo = (id: string) =>
        composer.locator(
          `[data-lexical-journal-image-content][data-media-asset-id="${id}"]`,
        );
      const action = (id: string, name: string) =>
        photo(id).locator(`[data-journal-image-action="${name}"]`);

      // The cover is a question now that there is a photograph.
      await expect(
        composer.locator('[data-journal-cover-controls="true"]'),
      ).toBeVisible();

      // Per photograph: the portrait sits in the upload step while its PUT is
      // held; the readiness line counts what Publish would wait for.
      await expect(photo(portraitId!)).toHaveAttribute(
        "data-media-status",
        "staging",
        { timeout: 20_000 },
      );
      await expect(photo(portraitId!).getByRole("status")).toContainText(
        "Надсилаємо в тимчасове сховище",
      );
      await expect(
        composer.locator("[data-journal-media-readiness]"),
      ).toHaveAttribute("data-journal-media-readiness", /preparing|failed/u);
      releasePortrait();
      await expect(photo(portraitId!)).toHaveAttribute(
        "data-media-status",
        "ready",
        { timeout: 20_000 },
      );
      // Ready means ready to publish — never "uploaded" or "published".
      await expect(
        photo(portraitId!).locator('[data-journal-image-ready="true"]'),
      ).toHaveText("Готове. З’явиться разом із записом після публікації.");

      // The landscape's upload is refused; the broken file never converts.
      await expect(photo(landscapeId!)).toHaveAttribute(
        "data-media-status",
        "failed",
        { timeout: 20_000 },
      );
      await expect(photo(brokenId!)).toHaveAttribute(
        "data-media-status",
        "failed",
        { timeout: 20_000 },
      );
      await expect(
        composer.locator("[data-journal-media-readiness]"),
      ).toHaveText(
        "Не вдалося підготувати: Фото 2, Фото 3. Повторіть або приберіть, щоб опублікувати.",
      );

      // Publish with a failed photograph sends nothing and takes the reader
      // to the first photograph that needs them.
      const disclosure = composer.locator(
        'input[name="publicationDisclosureAccepted"]',
      );
      if ((await disclosure.count()) > 0) await disclosure.check();
      await composer.locator('[data-entry-composer-publish="true"]').click();
      await expect(action(landscapeId!, "retry")).toBeFocused();
      expect(published).toBeNull();

      // Every control names the photograph it acts on.
      await expect(action(brokenId!, "remove")).toHaveAttribute(
        "aria-label",
        "Прибрати: Фото 3",
      );
      await photo(portraitId!)
        .locator("[data-journal-image-caption]")
        .fill("Жовті плями на нижньому листі");
      await expect(action(portraitId!, "remove")).toHaveAttribute(
        "aria-label",
        "Прибрати: Фото 1 — Жовті плями на нижньому листі",
      );

      // Retry, by keyboard, succeeds now that the Worker takes it.
      landscapeAllowed = true;
      await action(landscapeId!, "retry").focus();
      await page.keyboard.press("Enter");
      await expect(photo(landscapeId!)).toHaveAttribute(
        "data-media-status",
        "ready",
        { timeout: 20_000 },
      );
      // The broken file goes, by its name.
      await action(brokenId!, "remove").click();
      await expect(photos).toHaveCount(2);

      // A keyboard move: the portrait goes below the landscape, the move is
      // said out loud, and the focus stays on the photograph that moved.
      await action(portraitId!, "move-down").focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          photos.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-media-asset-id")),
          ),
        )
        .toEqual([landscapeId, portraitId]);
      await expect(
        composer.locator("[data-lexical-reorder-live-region]"),
      ).toContainText(
        "Фото 2 — Жовті плями на нижньому листі переміщено на позицію 3 з 4",
      );
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement?.getAttribute("data-media-asset-id") ??
              null,
          ),
        )
        .toBe(portraitId);

      await expect(
        composer.locator("[data-journal-media-readiness]"),
      ).toHaveText("Фото готові: 2. Опубліковуються лише разом із записом.");

      // Publish sends the story's photographs, in the story's order, with
      // exactly the receipts the Worker gave for their latest uploads.
      await composer.locator('[data-entry-composer-publish="true"]').click();
      await expect
        .poll(() => published !== null, { timeout: 20_000 })
        .toBe(true);
      const request = published! as {
        document: {
          blocks: Array<{
            type: string;
            mediaAssetId?: string;
            caption?: string;
          }>;
        };
        coverMediaAssetId: string | null;
        mediaClaimReceipts: string[];
      };
      const images = request.document.blocks.filter(
        (block) => block.type === "image",
      );
      expect(images.map((block) => block.mediaAssetId)).toEqual([
        landscapeId,
        portraitId,
      ]);
      expect(images[1]!.caption).toBe("Жовті плями на нижньому листі");
      expect(request.coverMediaAssetId).toBe(landscapeId);
      const latest = new Map<string, number>();
      for (const upload of staging.uploads.filter((u) => u.status === 200)) {
        latest.set(
          upload.mediaAssetId,
          Math.max(latest.get(upload.mediaAssetId) ?? 0, upload.generation),
        );
      }
      const expectedReceipts = staging.uploads
        .filter(
          (upload) =>
            upload.status === 200 &&
            upload.generation === latest.get(upload.mediaAssetId),
        )
        .map((upload) => upload.receipt);
      expect([...request.mediaClaimReceipts].sort()).toEqual(
        [...expectedReceipts].sort(),
      );
      // Nothing from the broken file was ever uploaded, and every staged
      // upload was a WebP made here, one per rendition.
      expect(staging.uploads.some((u) => u.mediaAssetId === brokenId)).toBe(
        false,
      );
      for (const upload of staging.uploads) {
        expect(upload.contentType).toBe("image/webp");
        expect(Math.max(upload.width, upload.height)).toBeLessThanOrEqual(2560);
      }
      // No rendition was staged twice: the retry sent again only what the
      // Worker had refused.
      const staged = staging.uploads.filter((u) => u.status === 200);
      const renditions = new Set(
        staged.map((u) => `${u.mediaAssetId}/${u.generation}/${u.variant}`),
      );
      expect(renditions.size).toBe(staged.length);
      expect(
        staging.uploads.filter(
          (u) => u.status !== 200 && u.mediaAssetId !== landscapeId,
        ),
      ).toEqual([]);

      // The refusal leaves the story, and nothing is persisted.
      await expect(photos).toHaveCount(2);
      const entries = await pool.query(
        `select 1 from journal_entries where owner_user_id = $1`,
        [userId],
      );
      expect(entries.rows).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });
});
