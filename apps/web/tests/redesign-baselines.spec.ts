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
  test.fail(
    !process.env.REDESIGN_ENFORCE_BASELINES,
    "Known OG-UX global writing regression; corrected with OVE-486",
  );
  await expect(write).toHaveAttribute("href", "/garden/new");
});

test("OVE-483/486: no implicit first-space selection among three spaces", async ({
  page,
}) => {
  await page.goto("/garden");
  const select = page.locator(
    '#first-entry-composer select[name="spaceChoice"]',
  );
  await expect(select).toBeVisible();
  test.fail(
    !process.env.REDESIGN_ENFORCE_BASELINES,
    "Known first-space default; desired choice is explicit",
  );
  await expect(select).toHaveValue("");
});

test("OVE-482: filter dismiss is named Close rather than Reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journals");
  const trigger = page.locator('[data-filter-bar-open="true"]:visible');
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.locator('[data-slot="sheet-content"]');
  await expect(dialog).toBeVisible();
  const close = dialog.locator('[data-slot="sheet-close"]');
  await expect(close).toBeVisible();
  test.fail(
    !process.env.REDESIGN_ENFORCE_BASELINES,
    "Known filter dismiss label; corrected in OVE-482",
  );
  await expect(close).toHaveAccessibleName(/Закрити/);
});
