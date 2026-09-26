import { waitForHydration } from "./helpers/hydration";
import { Pool } from "pg";
import { expect, test, type BrowserContext } from "playwright/test";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import { cleanupCollection, seedCollection } from "./helpers/redesign-fixtures";

let pool: Pool;
let userId: string;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Local baseURL required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  const context = await browser.newContext();
  try {
    const user = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: "ove480-baseline",
    });
    userId = user.id;
    await seedCollection(pool, userId, { spaces: 3, objects: 100 });
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
});
test.afterAll(async () => {
  if (userId) await cleanupCollection(pool, userId);
  await pool?.end();
});
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(cookies);
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL! },
  ]);
});

// These are desired-behavior assertions against real rendered controls, not snapshots
// blessing the bug. An unexpected pass demands removing the annotation at correction.
// Set REDESIGN_ENFORCE_BASELINES=1 to obtain the ordinary failing baseline receipt.
test("OVE-486: global Write opens the destination-aware composer", async ({
  page,
}) => {
  await page.goto("/garden");
  const write = page
    .locator("a")
    .filter({ hasText: /^Новий запис$/ })
    .filter({ visible: true })
    .first();
  await expect(write).toBeVisible();
  await expect(write).toHaveAttribute("href", "/garden/new");
});

test("multiple spaces require an explicit destination", async ({ page }) => {
  // Adding a plant or an animal asks for its space first when there is more
  // than one, and picks none by itself (ADR-0035 D1: nothing is chosen for
  // the gardener; OVE-524: «Простір» is the stepper's first question).
  await page.goto("/garden/objects/new");
  const stepper = page.locator('[data-creation-stepper="true"]');
  await expect(stepper).toBeVisible();
  await waitForHydration(stepper);
  await expect(stepper.getByRole("heading", { level: 1 })).toHaveText(
    "Простір",
  );
  await expect(stepper.locator("[data-object-setup-space]")).toHaveCount(3);
  await expect(stepper.locator('[data-choice-selected="true"]')).toHaveCount(0);
  // «Далі» without a choice asks for one and stays.
  await stepper.locator('[data-creation-primary="true"]').click();
  await expect(stepper.getByRole("alert")).toHaveText("Виберіть простір.");
  await expect(page).not.toHaveURL(/step=kind/u);
});

test("OVE-482: filter dismiss is named Close rather than Reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journals");
  const trigger = page.locator('[data-filter-bar-open="true"]:visible');
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.locator('[data-slot="filter-panel"]:popover-open');
  await expect(dialog).toBeVisible();
  const close = dialog.locator('[data-filter-bar-close="true"]');
  await expect(close).toBeVisible();
  await expect(close).toHaveAccessibleName(/Закрити/);
});
