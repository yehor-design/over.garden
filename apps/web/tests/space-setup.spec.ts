import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "playwright/test";

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
 * Creating a space is a short task of its own (`OVE-484`): one question open
 * at a time, answered ones folded and reopenable, one acknowledged space per
 * intent, and a nested create inside the composer that writes nothing.
 *
 * Every outcome is read back from the database, because a status line that
 * says "Created" proves only that the page said so.
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

async function openFlow(page: Page) {
  await page.goto("/garden/spaces/new", { waitUntil: "load" });
  const flow = page.locator('[data-space-setup-flow="create"]');
  await expect(flow).toBeVisible({ timeout: 20_000 });
  await waitForHydration(flow);
  return flow;
}

test.describe("space setup", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("keyboard at 320 px: validate, back-edit, review, create one space", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await browser.newContext();
    let userId: string | null = null;
    try {
      const member = await signInSyntheticGardener({
        baseURL: baseURL!,
        context,
        pool,
        prefix: "ove484-flow",
      });
      userId = member.id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 320, height: 720 });
      const flow = await openFlow(page);
      await expectReflow(page);

      const name = flow.getByLabel("Назва простору");
      // Next with nothing typed: an inline error on the field, focus on it.
      await name.focus();
      await page.keyboard.press("Enter");
      await expectFieldError(name);
      await expect(name).toBeFocused();

      await name.fill("Теплиця за будинком");
      await page.keyboard.press("Enter");
      const region = flow.locator('[data-space-setup-section="region"]');
      await expect(region).toHaveAttribute("data-state", "active");
      await expect(region.getByRole("heading")).toBeFocused();

      // Back keeps the answer.
      await region.getByRole("button", { name: "Назад" }).click();
      await expect(name).toHaveValue("Теплиця за будинком");
      await page.keyboard.press("Enter");

      // Choosing to show a region makes the region required.
      await region.getByText("Показувати область").click();
      await region.getByRole("button", { name: "Далі" }).click();
      const select = region.getByLabel("Область", { exact: true });
      await expectFieldError(select);
      await select.selectOption("UA-30");
      await region.getByRole("button", { name: "Далі" }).click();

      const review = flow.locator('[data-space-setup-section="review"]');
      await expect(review).toHaveAttribute("data-state", "active");
      await expect(review.locator("[data-space-setup-review]")).toContainText(
        "Теплиця за будинком",
      );
      await expect(review).toContainText("не публікує жодного запису");

      // A completed answer is one line, and reopening it keeps the rest.
      await flow
        .getByRole("button", { name: "Змінити: Як називається простір?" })
        .click();
      await name.fill("Теплиця біля саду");
      await page.keyboard.press("Enter");
      await region.getByRole("button", { name: "Далі" }).click();
      await expect(review.locator("[data-space-setup-review]")).toContainText(
        "Теплиця біля саду",
      );
      await scanAccessibility(page, testInfo, "space-setup-review-320");

      await review.getByRole("button", { name: "Створити простір" }).click();
      const result = page.locator('[data-space-setup-result="created"]');
      await expect(result).toBeVisible();
      await expect(result).toContainText(
        "Простір «Теплиця біля саду» створено",
      );
      await expect(result).toBeFocused();
      const createdId = await result.getAttribute("data-space-id");
      await page.screenshot({ path: testInfo.outputPath("created-320.png") });

      // The database holds exactly the one space the page announced.
      const rows = await spacesOf(pool, userId);
      expect(rows).toEqual([
        {
          id: createdId,
          display_name: "Теплиця біля саду",
          location_visibility: "region",
          coarse_region_code: "UA-30",
        },
      ]);
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
          prefix: "ove484-retry",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "ru", url: baseURL! },
      ]);
      const page = await context.newPage();
      const flow = await openFlow(page);
      await flow.getByLabel("Название пространства").fill("Пасека");
      await page.keyboard.press("Enter");
      await flow.getByRole("button", { name: "Далее" }).click();

      // The request reaches the server and commits; its answer never arrives.
      await page.route("**/api/garden/spaces", async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      });
      await flow.getByRole("button", { name: "Создать пространство" }).click();
      const uncertain = flow.locator('[data-space-setup-outcome="uncertain"]');
      await expect(uncertain).toBeVisible();
      await expect(uncertain).toContainText("тот же запрос не создаст второе");
      expect(await spacesOf(pool, userId)).toHaveLength(1);

      await page.unroute("**/api/garden/spaces");
      await uncertain.getByRole("button", { name: "Повторить" }).click();
      const result = page.locator('[data-space-setup-result="created"]');
      await expect(result).toContainText("уже было создано этим запросом");
      const rows = await spacesOf(pool, userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(await result.getAttribute("data-space-id"));
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("from the composer: nothing is written and the text being written stays", async ({
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
          prefix: "ove484-nested",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "bg", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.goto("/garden", { waitUntil: "load" });
      const composer = page.locator("#first-entry-composer");
      const plantName = composer.locator('input[name="plantName"]');
      await waitForHydration(plantName);
      await plantName.fill("Домат Черокі");

      const launch = composer.locator('[data-composer-new-space="true"]');
      await launch.click();
      const sheet = page.locator('[data-slot="sheet-content"]');
      const flow = sheet.locator('[data-space-setup-flow="propose"]');
      await expect(flow).toBeVisible();
      await flow.getByLabel("Име на пространството").fill("Оранжерия");
      await page.keyboard.press("Enter");
      await flow.getByRole("button", { name: "Напред" }).click();
      await expect(flow).toContainText("ще бъде създадено заедно със записа");
      await flow.getByRole("button", { name: "Използвай в записа" }).click();
      await expect(sheet).toHaveCount(0);

      // The editor kept what was typed and now proposes the new space.
      await expect(plantName).toHaveValue("Домат Черокі");
      await expect(composer.locator('input[name="spaceName"]')).toHaveValue(
        "Оранжерия",
      );
      // And nothing was written: the space is created only with Publish.
      expect(await spacesOf(pool, userId)).toHaveLength(0);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("My garden offers the flow, and a guest is asked to sign in", async ({
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
      await expect(page.locator("[data-space-setup-flow]")).toHaveCount(0);
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
          prefix: "ove484-entry",
        })
      ).id;
      // A gardener with a space sees the Spaces section and its action.
      await context.request.post(`${baseURL}/api/garden/spaces`, {
        data: {
          requestId: randomUUID(),
          displayName: "Сад",
          locationVisibility: "hidden",
          coarseRegionCode: null,
        },
      });
      const page = await context.newPage();
      await page.goto("/garden", { waitUntil: "load" });
      const link = page.locator('[data-garden-new-space="true"]');
      await expect(link).toHaveAttribute("href", "/garden/spaces/new");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });
});
