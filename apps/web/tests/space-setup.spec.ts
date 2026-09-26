import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "playwright/test";

import { fakeStaging, photograph } from "./helpers/fake-staging";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectFieldError,
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * Creating a space is a full-screen stepper (`OVE-523`, ADR-0035 D1,
 * DESIGN.md §5.24–5.25): «Як називається простір?», then an optional photo
 * cropped and turned in the browser, then «Створити». Every step is an
 * address, closing asks first, the name alone works without JavaScript, and a
 * caller that sent `returnTo` gets the new space's id back.
 *
 * Every outcome is read back from the database, because a page that says
 * "Created" proves only that the page said so. The staging Worker cannot be
 * signed for locally, so a photo's uploads are answered in the browser and
 * the request that commits it is read (`helpers/fake-staging.ts`).
 */

const LOCALE_COOKIE = "overgarden_interface_locale";

async function spacesOf(pool: Pool, userId: string) {
  return (
    await pool.query<{
      id: string;
      display_name: string;
      location_visibility: string;
      coarse_region_code: string | null;
    }>(
      "select id, display_name, location_visibility, coarse_region_code from spaces where owner_user_id = $1 order by created_at",
      [userId],
    )
  ).rows;
}

async function photosOf(pool: Pool, spaceId: string) {
  return (
    await pool.query<{ id: string; usage_role: string }>(
      "select id, usage_role from media_assets where space_id = $1",
      [spaceId],
    )
  ).rows;
}

async function openStepper(page: Page, query = "") {
  await page.goto(`/garden/spaces/new${query}`, { waitUntil: "load" });
  const stepper = page.locator('[data-creation-stepper="true"]');
  await expect(stepper).toBeVisible({ timeout: 20_000 });
  await waitForHydration(stepper);
  return stepper;
}

async function createSpace(
  request: APIRequestContext,
  baseURL: string,
  displayName: string,
) {
  const response = await request.post(`${baseURL}/api/garden/spaces`, {
    data: {
      requestId: randomUUID(),
      displayName,
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { space: { id: string } }).space.id;
}

test.describe("space setup", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("keyboard at 320 px: the name, Back, the photo step skipped — one hidden space", async ({
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
          prefix: "ove523-flow",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 320, height: 720 });
      const stepper = await openStepper(page);
      await expectReflow(page);

      await expect(stepper.getByRole("heading", { level: 1 })).toHaveText(
        "Як називається простір?",
      );
      await expect(stepper.locator("[data-creation-progress]")).toHaveText(
        "Крок 1 з 2",
      );
      // The answer has focus as the step opens; the site behind is inert.
      const name = stepper.getByLabel("Назва простору");
      await expect(name).toBeFocused();
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll("nav, footer")]
            .filter((node) => !node.closest("[data-creation-stepper]"))
            .map((node) => node.closest("[inert]") !== null),
        ),
      ).not.toContain(false);

      // Enter with nothing typed: an inline error, and the step stays.
      await page.keyboard.press("Enter");
      await expectFieldError(name);
      await expect(name).toBeFocused();
      await expect(page).not.toHaveURL(/step=photo/u);

      await page.keyboard.type("Теплиця за будинком");
      await page.keyboard.press("Enter");
      await page.waitForURL(/step=photo/u);
      await expect(stepper.getByRole("heading", { level: 1 })).toHaveText(
        "Додайте фото простору",
      );
      await expect(stepper.getByRole("heading", { level: 1 })).toBeFocused();
      await expect(stepper.locator("[data-creation-progress]")).toHaveText(
        "Крок 2 з 2",
      );
      await scanAccessibility(page, testInfo, "space-setup-photo-320");

      // The browser's Back is the stepper's Back, and the name survives it —
      // and a reload.
      await page.goBack();
      await expect(name).toHaveValue("Теплиця за будинком");
      await page.reload({ waitUntil: "load" });
      await waitForHydration(stepper);
      await expect(name).toHaveValue("Теплиця за будинком");
      await expect(name).toBeFocused();
      await scanAccessibility(page, testInfo, "space-setup-name-320");

      // A phone's keyboard shrinks the layout viewport
      // (`interactive-widget=resizes-content`): the step's button stays above it.
      await page.setViewportSize({ width: 375, height: 360 });
      const primary = stepper.locator('[data-creation-primary="true"]');
      await expect
        .poll(async () => {
          const box = await primary.boundingBox();
          return box ? box.y + box.height : Infinity;
        })
        .toBeLessThanOrEqual(360);
      await page.setViewportSize({ width: 320, height: 720 });

      await page.keyboard.press("Enter");
      await page.waitForURL(/step=photo/u);
      await page.screenshot({
        path: testInfo.outputPath("photo-step-320.png"),
      });
      await stepper.getByRole("button", { name: "Пропустити" }).click();

      // The new space's own page, and exactly that one space.
      await page.waitForURL(/\/garden\/spaces\/[0-9a-f-]{36}$/u);
      const createdId = new URL(page.url()).pathname.split("/").at(-1);
      await expect(page.locator("#space-overview-heading")).toHaveText(
        "Теплиця за будинком",
      );
      await expect(page.locator("[data-space-cover]")).toHaveCount(0);
      expect(await spacesOf(pool, userId)).toEqual([
        {
          id: createdId,
          display_name: "Теплиця за будинком",
          location_visibility: "hidden",
          coarse_region_code: null,
        },
      ]);
      expect(await photosOf(pool, createdId!)).toEqual([]);

      // A new stepper starts empty: the draft went with the space.
      const again = await openStepper(page);
      await expect(again.getByLabel("Назва простору")).toHaveValue("");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a photo: cropped and turned in the browser, uploaded at once, handed to «Створити»", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove523-photo",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const staging = await fakeStaging(context, async () => {
        await released;
        return "stage";
      });
      // The create request is read, then sent on without the photo: its claim
      // needs the real Worker's receipts, which `route.test.ts` and
      // `schema:owned-photos:prove-database` prove instead.
      let sent = null as {
        displayName: string;
        photo: Record<string, unknown> | null;
      } | null;
      await context.route("**/api/garden/spaces", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const body = route.request().postDataJSON() as Record<string, unknown>;
        sent = body as typeof sent;
        await route.continue({
          postData: JSON.stringify({ ...body, photo: null }),
        });
      });

      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 900 });
      const stepper = await openStepper(page);
      await stepper.getByLabel("Назва простору").fill("Балкон");
      await page.keyboard.press("Enter");
      await page.waitForURL(/step=photo/u);

      // A portrait photo from the gallery opens the editor, not an upload.
      await stepper.locator('[data-owned-photo-input="true"]').setInputFiles({
        name: "balcony.jpg",
        mimeType: "image/jpeg",
        buffer: await photograph(page, "portrait", "image/jpeg"),
      });
      const frame = stepper.locator('[data-photo-crop-frame="true"]');
      await expect(frame).toBeVisible();
      const done = stepper.locator('[data-photo-crop-done="true"]');
      await expect(done).toBeEnabled();
      expect(staging.uploads).toHaveLength(0);
      // The editor's «Скасувати» and «Готово» decide; the step's buttons wait.
      await expect(
        stepper.locator('[data-creation-primary="true"]'),
      ).toBeDisabled();
      await expect(
        stepper.locator('[data-creation-secondary="true"]'),
      ).toBeDisabled();
      await scanAccessibility(page, testInfo, "space-setup-editor-1280");

      // Every control has a keyboard equivalent and a name.
      await frame.focus();
      await page.keyboard.press("r");
      await expect(frame).toHaveAttribute("data-crop-turns", "1");
      await stepper.getByRole("button", { name: "Повернути" }).click();
      await expect(frame).toHaveAttribute("data-crop-turns", "2");
      await stepper.getByRole("button", { name: "Скинути" }).click();
      await expect(frame).toHaveAttribute("data-crop-turns", "0");
      await frame.focus();
      await page.keyboard.press("r");
      await page.keyboard.press("+");
      await page.keyboard.press("ArrowLeft");
      await expect(frame).toHaveAttribute("data-crop-turns", "1");
      await page.screenshot({ path: testInfo.outputPath("editor-1280.png") });
      await stepper.getByRole("button", { name: "Готово" }).click();
      // Focus comes back into the field, so Escape and Tab still start here.
      await expect(
        stepper.locator('[data-owned-photo-replace="true"]'),
      ).toBeFocused();

      // The upload state is words; with a photo there is nothing to skip.
      const status = stepper.locator("[data-owned-photo-status]");
      await expect(status).toHaveText("Завантажуємо фото…");
      await expect(
        stepper.getByRole("button", { name: "Пропустити" }),
      ).toHaveCount(0);
      release();
      await expect(status).toHaveAttribute("data-owned-photo-status", "ready", {
        timeout: 30_000,
      });
      await expect(
        stepper.locator('[data-owned-photo-preview="true"]'),
      ).toHaveAttribute("alt", "Фото простору «Балкон»");
      await page.screenshot({
        path: testInfo.outputPath("photo-ready-1280.png"),
      });

      // The crop is the cover's frame: a portrait turned a quarter is cut to
      // 16:9 before any byte leaves the browser.
      const staged = staging.uploads.filter((upload) => upload.status === 200);
      const primary = staged.find((upload) => upload.variant === 0);
      expect(primary).toBeDefined();
      expect(primary!.contentType).toBe("image/webp");
      expect(primary!.width / primary!.height).toBeCloseTo(16 / 9, 1);

      await stepper.getByRole("button", { name: "Створити" }).click();
      await page.waitForURL(/\/garden\/spaces\/[0-9a-f-]{36}$/u);
      const createdId = new URL(page.url()).pathname.split("/").at(-1)!;

      // Exactly the staged photo and its receipts were handed over.
      expect(sent).not.toBeNull();
      const photo = sent!.photo!;
      expect(photo.mediaAssetId).toBe(primary!.mediaAssetId);
      expect(typeof photo.stagingSessionId).toBe("string");
      expect([...(photo.receipts as string[])].sort()).toEqual(
        staged.map((upload) => upload.receipt!).sort(),
      );
      // A committed photo is the server's now: leaving the stepper deletes
      // nothing it handed over.
      expect(staging.deletes).not.toContain(primary!.mediaAssetId);
      expect((await spacesOf(pool, userId)).map((space) => space.id)).toEqual([
        createdId,
      ]);
      expect(errors).toEqual([]);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("settings: a photo added, shown on the space and in My garden, then removed", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove523-settings",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const spaceId = await createSpace(context.request, baseURL!, "Пасіка");
      const staging = await fakeStaging(context, async () => "stage");
      // The save is read; the row the server's claim would write is written
      // here, and the page is told it was saved.
      const owner = userId;
      let saved = null as Record<string, unknown> | null;
      await context.route(
        `**/api/garden/spaces/${spaceId}/photo`,
        async (route) => {
          if (route.request().method() !== "PUT") return route.continue();
          const photo = (
            route.request().postDataJSON() as { photo: Record<string, unknown> }
          ).photo;
          saved = photo;
          const mediaAssetId = photo.mediaAssetId as string;
          await pool.query(
            `insert into media_assets (id, owner_user_id, space_id, derivative_key, usage_role,
             intrinsic_width, intrinsic_height, focal_x, focal_y, upload_generation,
             declared_size_bytes, variant_long_edges)
           values ($1, $2, $3, $4, 'cover_only', 1600, 900, 0.5, 0.5, 1, 90000, '{1280,480}')`,
            [
              mediaAssetId,
              owner,
              spaceId,
              `derivatives/${mediaAssetId}/1.webp`,
            ],
          );
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "saved" }),
          });
        },
      );

      const page = await context.newPage();
      await page.goto(`/garden/spaces/${spaceId}/settings`, {
        waitUntil: "load",
      });
      const settings = page.locator("[data-space-photo-settings]");
      await waitForHydration(settings);
      await settings.locator('[data-owned-photo-input="true"]').setInputFiles({
        name: "hives.png",
        mimeType: "image/png",
        buffer: await photograph(page, "landscape", "image/png"),
      });
      await expect(
        settings.locator('[data-photo-crop-frame="true"]'),
      ).toBeVisible();
      await expect(
        settings.locator('[data-photo-crop-done="true"]'),
      ).toBeEnabled();
      await settings.getByRole("button", { name: "Готово" }).click();

      // Saved as soon as it uploaded; the page read again shows the stored one.
      await expect(settings).toHaveAttribute(
        "data-space-photo-settings",
        "saved",
        {
          timeout: 30_000,
        },
      );
      expect(saved).not.toBeNull();
      const [row] = await photosOf(pool, spaceId);
      expect(row).toEqual({
        id: saved!.mediaAssetId,
        usage_role: "cover_only",
      });
      const stored = settings.locator('[data-owned-photo-preview="true"]');
      await expect(stored).toHaveAttribute("srcset", /480w/u);
      await scanAccessibility(page, testInfo, "space-settings-photo");
      expect(staging.deletes).not.toContain(row!.id);

      await page.goto(`/garden/spaces/${spaceId}`, { waitUntil: "load" });
      const cover = page.locator('[data-space-cover="true"]');
      await expect(cover).toHaveAttribute("alt", /Пасіка/u);
      await expect(cover).toHaveAttribute("srcset", /1280w/u);
      await page.goto("/garden", { waitUntil: "load" });
      await expect(
        page.locator('[data-garden-space-photo="true"]'),
      ).toHaveCount(1);

      // «Прибрати» takes it away, and its files are queued for revocation.
      await page.goto(`/garden/spaces/${spaceId}/settings`, {
        waitUntil: "load",
      });
      await waitForHydration(settings);
      await settings.getByRole("button", { name: "Прибрати" }).click();
      await expect(settings).toHaveAttribute(
        "data-space-photo-settings",
        "removed",
      );
      await expect(
        settings.locator('[data-owned-photo-field="empty"]'),
      ).toBeVisible();
      expect(await photosOf(pool, spaceId)).toEqual([]);
      const revokes = await pool.query<{ reason: string }>(
        `select payload->>'reason' as reason from job_queue
          where payload->>'kind' = 'media_derivative_revoke'
            and payload::text like '%' || $1 || '%'`,
        [row!.id],
      );
      expect(revokes.rows.length).toBeGreaterThan(0);
      expect(new Set(revokes.rows.map((job) => job.reason))).toEqual(
        new Set(["photo_removed"]),
      );
      await pool.query(
        `delete from job_queue where payload::text like '%' || $1 || '%'`,
        [row!.id],
      );
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("closing asks first, keeps the answers on «Продовжити», and leaves nothing behind", async ({
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
          prefix: "ove523-close",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "ru", url: baseURL! },
      ]);
      const page = await context.newPage();
      const stepper = await openStepper(page);

      // Nothing answered: closing simply leaves.
      await stepper.getByRole("button", { name: "Закрыть" }).click();
      await page.waitForURL(/\/garden$/u);

      const again = await openStepper(
        page,
        "?returnTo=%2Fgarden%2Fobjects%2Fnew",
      );
      const name = again.getByLabel("Название пространства");
      await name.fill("Пасека");
      await page.keyboard.press("Escape");
      const dialog = page.locator('[data-space-setup-discard="true"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading")).toBeVisible();
      await dialog.getByRole("button", { name: "Продолжить создание" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(name).toHaveValue("Пасека");

      await again.getByRole("button", { name: "Закрыть" }).click();
      await dialog.getByRole("button", { name: "Выйти" }).click();
      // Back to the caller, with no space and no draft.
      await page.waitForURL(/\/garden\/objects\/new$/u);
      expect(await spacesOf(pool, userId)).toEqual([]);
      const fresh = await openStepper(page);
      await expect(fresh.getByLabel("Название пространства")).toHaveValue("");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a lost response is uncertain, and the retry yields one space", async ({
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
          prefix: "ove523-retry",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "bg", url: baseURL! },
      ]);
      const page = await context.newPage();
      const stepper = await openStepper(page);
      await stepper.getByLabel("Име на пространството").fill("Пчелин");
      await page.keyboard.press("Enter");
      await page.waitForURL(/step=photo/u);

      // The request reaches the server and commits; its answer never arrives.
      await page.route("**/api/garden/spaces", async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      });
      await stepper.getByRole("button", { name: "Пропусни" }).click();
      const uncertain = stepper.locator(
        '[data-space-setup-outcome="uncertain"]',
      );
      await expect(uncertain).toBeVisible();
      expect(await spacesOf(pool, userId)).toHaveLength(1);

      await page.unroute("**/api/garden/spaces");
      await stepper.getByRole("button", { name: "Пропусни" }).click();
      await page.waitForURL(/\/garden\/spaces\/[0-9a-f-]{36}$/u);
      const rows = await spacesOf(pool, userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(new URL(page.url()).pathname.split("/").at(-1));
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("before the bundle runs the name step posts to a real endpoint, and returnTo gets the id", async ({
    browser,
    baseURL,
  }) => {
    // With scripts off a workspace page streams into hidden boundaries and
    // shows nothing (ADR-0024 D3, left so by the owner), so the control cannot
    // be clicked; the form it renders is submitted as the browser would.
    const context = await browser.newContext({ javaScriptEnabled: false });
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove523-nojs",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      const open = () =>
        page.goto("/garden/spaces/new?returnTo=%2Fgarden%2Fobjects%2Fnew", {
          waitUntil: "load",
        });
      const submit = (displayName: string) =>
        page.evaluate((value) => {
          const field = document.querySelector<HTMLInputElement>(
            'form [name="displayName"]',
          )!;
          field.value = value;
          field.form!.submit();
        }, displayName);

      await open();
      // The form streams in its own boundary, so it is found by its field.
      const form = page.locator('form:has([name="displayName"])');
      await expect(form).toHaveCount(1);
      expect(await form.getAttribute("action")).not.toContain("javascript:");
      expect((await form.getAttribute("method"))?.toLowerCase()).toBe("post");

      // Nothing typed: the action answers the field's error and writes
      // nothing. (The page it answers with streams into hidden boundaries like
      // every workspace page without scripts, so the answer is read from the
      // action's state in the response rather than from painted text.)
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes("/garden/spaces/new"),
        ),
        submit("  "),
      ]);
      await expect
        .poll(() => page.content().catch(() => ""))
        .toContain('{"status":"invalid","errors":{"name":"name_required"}}');
      expect(await spacesOf(pool, userId)).toEqual([]);

      await open();
      await Promise.all([
        page.waitForURL(/\/garden\/objects\/new\?space=/u),
        submit("Город"),
      ]);
      const rows = await spacesOf(pool, userId);
      expect(rows.map((row) => row.display_name)).toEqual(["Город"]);
      expect(new URL(page.url()).searchParams.get("space")).toBe(rows[0]!.id);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("the endpoint: one space per intent, same-name warning, validation, refusal", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const stranger = await browser.newContext();
    const guest = await browser.newContext();
    let userId: string | null = null;
    let strangerId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove484-api",
        })
      ).id;
      strangerId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context: stranger,
          pool,
          prefix: "ove484-stranger",
        })
      ).id;
      const endpoint = `${baseURL}/api/garden/spaces`;
      const requestId = randomUUID();
      const body = {
        requestId,
        displayName: "  Балкон   на сході ",
        locationVisibility: "hidden",
        coarseRegionCode: null,
      };

      const first = await context.request.post(endpoint, { data: body });
      expect(first.status()).toBe(201);
      expect(first.headers()["cache-control"]).toContain("no-store");
      const created = await first.json();
      expect(created).toMatchObject({
        status: "created",
        replayed: false,
        space: { id: requestId, displayName: "Балкон на сході" },
      });

      // The same intent again — a double press, or a retry after a lost
      // response — reads the first space back.
      const again = await context.request.post(endpoint, { data: body });
      expect(again.status()).toBe(200);
      expect(await again.json()).toMatchObject({
        status: "created",
        replayed: true,
        space: { id: requestId },
      });
      // Concurrent presses of one intent still make one row.
      await Promise.all(
        [0, 1, 2].map(() => context.request.post(endpoint, { data: body })),
      );
      expect(await spacesOf(pool, userId)).toHaveLength(1);

      // Another intent with the same name asks first…
      const sameName = await context.request.post(endpoint, {
        data: {
          ...body,
          requestId: randomUUID(),
          displayName: "балкон на сході",
        },
      });
      expect(sameName.status()).toBe(409);
      expect(await sameName.json()).toMatchObject({
        status: "duplicate_name",
        existing: { id: requestId },
      });
      // …and a second space of that name is the gardener's choice.
      const anyway = await context.request.post(endpoint, {
        data: {
          ...body,
          requestId: randomUUID(),
          displayName: "Балкон на сході",
          allowDuplicateName: true,
        },
      });
      expect(anyway.status()).toBe(201);
      expect(await spacesOf(pool, userId)).toHaveLength(2);

      // Field problems are answers, not crashes.
      const empty = await context.request.post(endpoint, {
        data: { ...body, requestId: randomUUID(), displayName: "   " },
      });
      expect(empty.status()).toBe(422);
      expect(await empty.json()).toMatchObject({
        errors: { name: "name_required" },
      });
      const badRegion = await context.request.post(endpoint, {
        data: {
          ...body,
          requestId: randomUUID(),
          locationVisibility: "region",
          coarseRegionCode: "XX-99",
        },
      });
      expect(badRegion.status()).toBe(422);
      expect(
        (
          await context.request.post(endpoint, {
            data: { ...body, requestId: "not-a-uuid" },
          })
        ).status(),
      ).toBe(400);
      // A photo that is not a staged photo's receipts is refused whole.
      const badPhoto = await context.request.post(endpoint, {
        data: {
          ...body,
          requestId: randomUUID(),
          displayName: "З фото",
          photo: { stagingSessionId: "x", mediaAssetId: "y", receipts: [] },
        },
      });
      expect(badPhoto.status()).toBe(400);

      // Nobody else can read or claim that id, and a guest cannot write.
      const claimed = await stranger.request.post(endpoint, { data: body });
      expect(claimed.status()).toBe(409);
      expect(await claimed.json()).toEqual({ status: "conflict" });
      expect(await spacesOf(pool, strangerId)).toHaveLength(0);
      expect(
        (await guest.request.post(endpoint, { data: body })).status(),
      ).toBe(401);
      expect(await spacesOf(pool, userId)).toHaveLength(2);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      if (strangerId) await cleanupCollection(pool, strangerId);
      await Promise.all([context.close(), stranger.close(), guest.close()]);
    }
  });

  test("an empty garden offers two ways to start, and a guest is asked to sign in", async ({
    browser,
    baseURL,
  }) => {
    const guest = await browser.newContext();
    try {
      const page = await guest.newPage();
      await page.goto("/garden/spaces/new", { waitUntil: "load" });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Новий простір",
      );
      await expect(page.locator("[data-creation-stepper]")).toHaveCount(0);
    } finally {
      await guest.close();
    }

    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      userId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context,
          pool,
          prefix: "ove523-entry",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/garden", { waitUntil: "load" });
      const setup = page.locator('[data-garden-setup="true"]');
      await expect(setup.locator("[data-garden-setup-action]")).toHaveCount(2);
      await expect(
        setup.locator('[data-garden-setup-action="add-space"]'),
      ).toHaveAttribute("href", "/garden/spaces/new");
      await expect(
        setup.locator('[data-garden-setup-action="add-object"]'),
      ).toHaveAttribute("href", "/garden/objects/new");
      // No form on the page: nothing is created for the gardener.
      await expect(page.locator("main form")).toHaveCount(0);

      // A gardener with a space sees the Spaces section and its action.
      await createSpace(context.request, baseURL!, "Сад");
      await page.goto("/garden", { waitUntil: "load" });
      await expect(
        page.locator('[data-garden-new-space="true"]').first(),
      ).toHaveAttribute("href", "/garden/spaces/new");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });
});
