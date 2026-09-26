import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * Adding a plant or an animal is its own short setup (`OVE-485`): kind, name
 * (the catalogue search), space, review — with nothing lost between steps or
 * across a space created on the way, and one object per intent. A species
 * page launches nothing since `OVE-519`.
 *
 * Every outcome is read back from the database.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";

async function objectsOf(pool: Pool, userId: string) {
  return (
    await pool.query<{
      id: string;
      display_name: string;
      object_kind: string;
      space_id: string;
      catalog_item_id: string | null;
      variety_state: string;
      variety_text: string | null;
    }>(
      `select id, display_name, object_kind, space_id, catalog_item_id,
              variety_state, variety_text
         from plant_objects where owner_user_id = $1 order by created_at`,
      [userId],
    )
  ).rows;
}

async function spacesOf(pool: Pool, userId: string) {
  return (
    await pool.query<{ id: string; display_name: string }>(
      "select id, display_name from spaces where owner_user_id = $1 order by created_at",
      [userId],
    )
  ).rows;
}

async function openFlow(page: Page, query = "") {
  await page.goto(`/garden/objects/new${query}`, { waitUntil: "load" });
  const flow = page.locator('[data-object-setup-flow="true"]');
  await expect(flow).toBeVisible({ timeout: 20_000 });
  await waitForHydration(flow);
  return flow;
}

test.describe("object setup", () => {
  let pool: Pool;
  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("a first-time gardener at 320 px: own name, a space made on the way, one object", async ({
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
          prefix: "ove485-first",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      await page.setViewportSize({ width: 320, height: 720 });
      const flow = await openFlow(page);
      await expectReflow(page);

      // Kind: plant is the default; the question is answered with Next.
      await flow.getByRole("button", { name: "Далі" }).click();
      const nameSection = flow.locator('[data-object-setup-section="name"]');
      await expect(nameSection).toHaveAttribute("data-state", "active");
      // Next with no name: an error, and the step stays open.
      await nameSection.getByRole("button", { name: "Далі" }).click();
      await expect(
        nameSection.locator('[data-object-setup-error="name"]'),
      ).toBeVisible();
      const name = nameSection.getByRole("combobox");
      await name.fill("Томат на підвіконні");
      await nameSection.getByRole("button", { name: "Далі" }).click();

      // No space yet: the space stepper, then back here with the new space
      // selected (`?space=`, ADR-0035 D1).
      const spaceSection = flow.locator('[data-object-setup-section="space"]');
      await expect(spaceSection).toHaveAttribute("data-state", "active");
      await spaceSection
        .locator('[data-object-setup-new-space="true"]')
        .click();
      await page.waitForURL("**/garden/spaces/new?returnTo=**");
      const stepper = page.locator('[data-creation-stepper="true"]');
      await waitForHydration(stepper);
      await stepper.getByLabel("Назва простору").fill("Підвіконня");
      await page.keyboard.press("Enter");
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      await page.waitForURL(/\/garden\/objects\/new\?space=/u);
      const back = await openFlow(page, new URL(page.url()).search);
      await back.getByRole("button", { name: "Далі" }).click();
      const renamed = back.locator('[data-object-setup-section="name"]');
      await renamed.getByRole("combobox").fill("Томат на підвіконні");
      await renamed.getByRole("button", { name: "Далі" }).click();
      const chosen = back.locator('[data-object-setup-section="space"]');
      await expect(chosen).toContainText("Підвіконня");

      await chosen.getByRole("button", { name: "Далі" }).click();
      const review = back.locator('[data-object-setup-section="review"]');
      await expect(review).toHaveAttribute("data-state", "active");
      await expect(review.locator("[data-object-setup-review]")).toContainText(
        "Ще не визначено",
      );
      await expect(review).toContainText("нічого не публікує");
      await scanAccessibility(page, testInfo, "object-setup-review-320");
      await review.locator('[data-object-setup-submit="true"]').click();

      const result = page.locator('[data-object-setup-result="created"]');
      await expect(result).toBeVisible();
      await expect(result).toBeFocused();
      const objectId = await result.getAttribute("data-object-id");
      await expect(
        result.locator('[data-object-setup-write="true"]'),
      ).toHaveAttribute(
        "href",
        `/garden/objects/${objectId}#follow-up-composer`,
      );

      const [space] = await spacesOf(pool, userId);
      expect(space?.display_name).toBe("Підвіконня");
      expect(await objectsOf(pool, userId)).toEqual([
        {
          id: objectId,
          display_name: "Томат на підвіконні",
          object_kind: "plant",
          space_id: space!.id,
          catalog_item_id: null,
          variety_state: "unknown",
          variety_text: null,
        },
      ]);
      // Adding an object publishes nothing.
      expect(
        (
          await pool.query(
            "select count(*)::int as n from journal_entries where owner_user_id = $1",
            [userId],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("a returning gardener with 20 spaces: an animal, the right space, a same-name warning", async ({
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
          prefix: "ove485-many",
        })
      ).id;
      const spaceIds: string[] = [];
      for (let index = 1; index <= 20; index += 1) {
        const id = randomUUID();
        spaceIds.push(id);
        await pool.query(
          "insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)",
          [id, userId, `Двір ${String(index).padStart(2, "0")}`],
        );
      }
      await pool.query(
        `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
         values ($1, $2, 'Кури', 'animal')`,
        [userId, spaceIds[16]],
      );
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "ru", url: baseURL! },
      ]);
      const page = await context.newPage();
      const flow = await openFlow(page);

      await flow.getByRole("radio", { name: /^Животное/u }).check();
      await expect(
        flow.getByRole("radio", { name: /^Животное/u }),
      ).toBeChecked();
      await flow.getByRole("button", { name: "Далее" }).click();
      await flow
        .locator('[data-object-setup-section="name"]')
        .getByRole("combobox")
        .fill("Кури");
      await flow
        .locator('[data-object-setup-section="name"]')
        .getByRole("button", { name: "Далее" })
        .click();

      // Twenty spaces: find the seventeenth by typing, choose it.
      const spaceSection = flow.locator('[data-object-setup-section="space"]');
      const picker = spaceSection.getByRole("combobox");
      await picker.fill("Двір 17");
      await spaceSection
        .getByRole("option", { name: /Двір 17/u })
        .first()
        .click();
      await spaceSection.getByRole("button", { name: "Далее" }).click();
      await flow.locator('[data-object-setup-submit="true"]').click();

      // The same name in the same space is asked about, not refused.
      const duplicate = flow.locator('[data-object-setup-outcome="duplicate"]');
      await expect(duplicate).toBeVisible();
      await expect(duplicate).toContainText("Двір 17");
      expect(await objectsOf(pool, userId)).toHaveLength(1);
      await duplicate
        .getByRole("button", { name: "Добавить ещё одно" })
        .click();
      const result = page.locator('[data-object-setup-result="created"]');
      await expect(result).toBeVisible();

      const objects = await objectsOf(pool, userId);
      expect(objects).toHaveLength(2);
      expect(objects[1]).toMatchObject({
        id: await result.getAttribute("data-object-id"),
        display_name: "Кури",
        object_kind: "animal",
        space_id: spaceIds[16],
      });
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });

  test("the endpoint: one object per intent, and every refusal is a status", async ({
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
          prefix: "ove485-api",
        })
      ).id;
      strangerId = (
        await signInSyntheticGardener({
          baseURL: baseURL!,
          context: stranger,
          pool,
          prefix: "ove485-stranger",
        })
      ).id;
      const spaceId = randomUUID();
      const strangerSpaceId = randomUUID();
      await pool.query(
        "insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Сад'), ($3, $4, 'Чужий сад')",
        [spaceId, userId, strangerSpaceId, strangerId],
      );
      const endpoint = `${baseURL}/api/garden/objects`;
      const body = {
        requestId: randomUUID(),
        objectKind: "plant",
        displayName: "  Яблуня   біла ",
        spaceId,
        catalogItemId: null,
        catalogLabel: "Біла наливна",
      };

      const first = await context.request.post(endpoint, { data: body });
      expect(first.status()).toBe(201);
      expect(first.headers()["cache-control"]).toContain("no-store");
      expect(await first.json()).toMatchObject({
        status: "created",
        replayed: false,
        object: { id: body.requestId, displayName: "Яблуня біла" },
      });
      const again = await context.request.post(endpoint, { data: body });
      expect(again.status()).toBe(200);
      expect(await again.json()).toMatchObject({ replayed: true });
      await Promise.all(
        [0, 1, 2].map(() => context.request.post(endpoint, { data: body })),
      );
      const rows = await objectsOf(pool, userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        variety_state: "free_text",
        variety_text: "Біла наливна",
      });

      // Another gardener's space is not a destination.
      const foreignSpace = await context.request.post(endpoint, {
        data: { ...body, requestId: randomUUID(), spaceId: strangerSpaceId },
      });
      expect(foreignSpace.status()).toBe(422);
      expect(await foreignSpace.json()).toEqual({
        status: "space_unavailable",
      });
      // A catalogue id that is not selectable is refused, not linked.
      const missingIdentity = await context.request.post(endpoint, {
        data: {
          ...body,
          requestId: randomUUID(),
          displayName: "Інша",
          catalogItemId: randomUUID(),
        },
      });
      expect(missingIdentity.status()).toBe(422);
      expect(await missingIdentity.json()).toEqual({
        status: "identity_unavailable",
      });
      const empty = await context.request.post(endpoint, {
        data: { ...body, requestId: randomUUID(), displayName: " " },
      });
      expect(empty.status()).toBe(422);
      expect(
        (
          await context.request.post(endpoint, {
            data: { ...body, objectKind: "mineral" },
          })
        ).status(),
      ).toBe(400);
      // Nobody else can claim the id; a guest cannot write.
      const claimed = await stranger.request.post(endpoint, {
        data: { ...body, spaceId: strangerSpaceId },
      });
      expect(claimed.status()).toBe(409);
      expect(await claimed.json()).toEqual({ status: "conflict" });
      expect(
        (await guest.request.post(endpoint, { data: body })).status(),
      ).toBe(401);
      expect(await objectsOf(pool, userId)).toHaveLength(1);
      expect(await objectsOf(pool, strangerId)).toHaveLength(0);
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      if (strangerId) await cleanupCollection(pool, strangerId);
      await Promise.all([context.close(), stranger.close(), guest.close()]);
    }
  });

  test("a space stepper left half-way writes nothing and returns here, and My garden offers the flow", async ({
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
          prefix: "ove485-cancel",
        })
      ).id;
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
      ]);
      const page = await context.newPage();
      const flow = await openFlow(page);
      await flow.getByRole("button", { name: "Далі" }).click();
      await flow
        .locator('[data-object-setup-section="name"]')
        .getByRole("combobox")
        .fill("Малина");
      await flow
        .locator('[data-object-setup-section="name"]')
        .getByRole("button", { name: "Далі" })
        .click();
      await flow.locator('[data-object-setup-new-space="true"]').click();
      await page.waitForURL("**/garden/spaces/new?returnTo=**");
      const stepper = page.locator('[data-creation-stepper="true"]');
      await waitForHydration(stepper);
      await stepper.getByLabel("Назва простору").fill("Недороблений");
      // Leaving asks first, then returns to this flow with nothing written.
      await page.keyboard.press("Escape");
      await page
        .locator('[data-space-setup-discard="true"]')
        .getByRole("button", { name: "Вийти" })
        .click();
      await page.waitForURL(/\/garden\/objects\/new$/u);
      expect(await spacesOf(pool, userId)).toHaveLength(0);
      const back = await openFlow(page);
      await back.getByRole("button", { name: "Далі" }).click();
      await back
        .locator('[data-object-setup-section="name"]')
        .getByRole("combobox")
        .fill("Малина");
      await back
        .locator('[data-object-setup-section="name"]')
        .getByRole("button", { name: "Далі" })
        .click();
      // Next without a space: an error, not a request.
      await back
        .locator('[data-object-setup-section="space"]')
        .getByRole("button", { name: "Далі" })
        .click();
      await expect(
        back.locator('[data-object-setup-error="space"]'),
      ).toBeVisible();
      expect(await objectsOf(pool, userId)).toHaveLength(0);

      // My garden's inventory offers this flow once there is a garden.
      await context.request.post(`${baseURL}/api/garden/spaces`, {
        data: {
          requestId: randomUUID(),
          displayName: "Сад",
          locationVisibility: "hidden",
          coarseRegionCode: null,
        },
      });
      await page.goto("/garden", { waitUntil: "load" });
      await expect(
        page
          .locator(
            '[data-garden-new-object="true"], [data-garden-inventory-new-object="true"]',
          )
          .first(),
      ).toHaveAttribute("href", "/garden/objects/new");
    } finally {
      if (userId) await cleanupCollection(pool, userId);
      await context.close();
    }
  });
});
