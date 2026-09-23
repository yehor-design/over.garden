import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import { expect, test, type BrowserContext, type Page } from "playwright/test";

import { signInOwnerFixture } from "./helpers/owner-fixture";
import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The reader's own pages, proved in a browser (`OVE-456`).
 *
 * Three things here have no headless expression, and each of them is an
 * acceptance criterion:
 *
 * - **The strip.** Whether four addresses read as one family is a question
 *   about a rendered document, and the bar that used to sit under it was a
 *   bordered `role="group"` that stopped where its content did.
 * - **Axe, empty and populated, at both widths.** An empty state and a list of
 *   rows are different documents, and below `lg` the shell swaps its rail for a
 *   tab bar — so one scan proves one of four screens.
 * - **The forms, with no JavaScript at all.** `OwnerScopedActionForm` renders
 *   React's placeholder endpoint until the bundle runs, and outside Next's
 *   pipeline the correct and the broken shape look identical. A context with
 *   `javaScriptEnabled: false` is the only place the difference shows.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=personal-surfaces.spec.ts
 */

const PREFIX = "ove456";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1_440, height: 900 } as const;

const PERSONAL_PAGES = [
  "/feed",
  "/notifications",
  "/bookmarks",
  "/wishlist",
] as const;

let pool: Pool;
let fixture: OrganismFixture;
let gardener: SyntheticGardener;
/**
 * The gardener's session cookies, taken once.
 *
 * Better Auth rate-limits its endpoints per window and answers `429` to the
 * fourth call in it, so a spec that signs in per test spends its whole budget
 * on authentication and then fails on something that is not its subject. One
 * sign-up, one sign-in, and every context after that is handed the cookies.
 */
let sessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  fixture = await seedOrganismFixture(pool, PREFIX);

  const authContext = await browser.newContext();
  try {
    gardener = await signInSyntheticGardener({
      baseURL,
      context: authContext,
      pool,
      prefix: PREFIX,
    });
    sessionCookies = await authContext.cookies(baseURL);
  } finally {
    await authContext.close();
  }
});

test.afterAll(async () => {
  await cleanupOrganismFixture(pool, fixture).catch(() => undefined);
  await removeSyntheticGardener(pool, gardener?.id ?? null).catch(
    () => undefined,
  );
  await pool.end();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await signGardenerInto(context, baseURL);
});

test.describe("personal pages use primary navigation and account utilities", () => {
  test("personal pages do not repeat primary destinations as competing tabs", async ({
    page,
  }) => {
    for (const address of PERSONAL_PAGES) {
      const response = await page.goto(address, { waitUntil: "load" });
      expect(response?.status(), address).toBe(200);

      const strip = page.locator('[data-slot="tab-links"]');
      await expect(strip, address).toHaveCount(0);
      await page
        .locator("[data-site-shell-account-menu-trigger]:visible")
        .click();
      for (const utility of ["/bookmarks", "/wishlist"]) {
        await expect(
          page.locator(`[data-site-shell-account-menu] a[href="${utility}"]`),
        ).toBeVisible();
      }
      await page.keyboard.press("Escape");

      // The half-width bar was a bordered `role="group"` of links. A link
      // cannot carry `aria-pressed`, which is why it had to become a form of
      // chips (DESIGN.md §5.1).
      const surface = page.locator("[data-my-social-surface]");
      await expect(surface.locator('[role="group"]'), address).toHaveCount(0);
      await expect(surface.locator("a[aria-pressed]"), address).toHaveCount(0);
    }
  });

  test("a filter chip is a real control, and the filter lands in the URL", async ({
    page,
  }) => {
    // The chips are drawn only on a shelf with something to filter
    // (`OVE-502`), so this one holds a saved variety.
    await seedShelves();
    try {
      await page.goto("/bookmarks", { waitUntil: "load" });
      const filters = page.locator('[data-bookmark-filters="true"]');
      const chip = filters.getByRole("button", { name: "Записи" });
      await expect(chip).toHaveAttribute("aria-pressed", "false");
      await chip.click();
      await page.waitForURL(/\/bookmarks\?kind=journal_entry/u);
      await expect(
        page
          .locator('[data-bookmark-filters="true"]')
          .getByRole("button", { name: "Записи" }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      await clearShelves();
    }
  });
});

test.describe("axe, empty and populated, at 375 px and 1440 px", () => {
  test("the empty family is clean at both widths", async ({ page }) => {
    for (const address of [...PERSONAL_PAGES, "/erasure"]) {
      await scanBothWidths(page, address, `${address} (empty)`);
    }
  });

  test("the populated shelves are clean at both widths", async ({ page }) => {
    await seedShelves();
    try {
      for (const address of ["/bookmarks", "/wishlist"]) {
        await scanBothWidths(page, address, `${address} (populated)`);
      }
    } finally {
      await clearShelves();
    }
  });
});

test.describe("removing something, and taking it back", () => {
  test("a removal offers Undo, and Undo puts it back", async ({ page }) => {
    await seedShelves();
    try {
      await page.goto("/wishlist", { waitUntil: "load" });
      await expect(page.getByText("Де Барао")).toBeVisible();

      await page
        .locator('[data-shelf-remove="true"]')
        .first()
        .click({ timeout: 15_000 });
      await page.waitForURL(/outcome=removed/u);
      const notice = page.locator('[data-shelf-notice="true"]');
      await expect(notice).toBeVisible();
      // The notice names what it removed (`OVE-502`).
      await expect(notice).toContainText(
        "«Де Барао» прибрано зі списку бажань",
      );
      await expect(
        page.locator('[data-saved-shelf="wishlist"]').getByText("Де Барао"),
      ).toHaveCount(0);

      await notice.getByRole("button", { name: "Повернути" }).click();
      // The address it lands on, not "an address containing /wishlist": the
      // page it is leaving already matches that, so the looser pattern
      // resolves before the navigation and asserts the old document.
      await page.waitForURL(/\/wishlist\?outcome=restored/u);
      await expect(
        page.locator('[data-saved-shelf="wishlist"]').getByText("Де Барао"),
      ).toBeVisible();
    } finally {
      await clearShelves();
    }
  });
});

test.describe("before the bundle runs", () => {
  test("the wishlist removal and the erasure request post to a real endpoint", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await seedShelves();
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await signGardenerInto(context, baseURL);
      const page = await context.newPage();

      for (const address of ["/wishlist", "/erasure"]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        await expectRealPostEndpoints(page, address);
      }
    } finally {
      await context.close();
      await clearShelves();
    }
  });

  test("the owner's moderation and erasure controls post to a real endpoint", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await context.addCookies([
        { name: "overgarden_interface_locale", value: "uk", url: baseURL },
        { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
      ]);
      await signInOwnerFixture({ request: context.request, baseURL });
      // The owner's queue renders controls only when there is a request to
      // decide; an empty queue is an empty state and proves nothing here.
      await pool.query(
        `insert into erasure_requests (requester_user_id) values ($1::uuid)`,
        [gardener.id],
      );
      const page = await context.newPage();

      for (const address of [
        "/account/communities/observation-and-care",
        "/garden/privacy/erasure-requests",
      ]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        await expectRealPostEndpoints(page, address);
      }
    } finally {
      await context.close();
      await pool.query(
        `delete from erasure_requests where requester_user_id = $1::uuid`,
        [gardener.id],
      );
    }
  });
});

/**
 * Every form on the screen has a real endpoint, and at least one of them posts.
 *
 * React answers a Server Action wrapped in a client closure with
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"`,
 * a placeholder it replaces on hydration and never before.
 */
async function expectRealPostEndpoints(page: Page, label: string) {
  const forms = await page.evaluate(() =>
    [...document.querySelectorAll("form")].map((form) => ({
      action: form.getAttribute("action"),
      method: (form.getAttribute("method") ?? "get").toLowerCase(),
    })),
  );
  expect(forms.length, `${label} has no form`).toBeGreaterThan(0);
  for (const form of forms) {
    expect(
      form.action ?? "",
      `${label} has a placeholder action: ${JSON.stringify(form)}`,
    ).not.toContain("javascript:");
  }
  expect(
    forms.some((form) => form.method === "post"),
    `${label} has no POST form: ${JSON.stringify(forms)}`,
  ).toBe(true);
}

/** The reader's language, market and session, in any context this run opens. */
async function signGardenerInto(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...sessionCookies,
  ]);
}

/** One bookmark and one wishlist item, straight into the tables they live in. */
async function seedShelves() {
  await pool.query(
    `insert into wishlist_items (owner_user_id, catalog_item_id, source_surface)
     values ($1::uuid, $2::uuid, 'public_variety')
     on conflict (owner_user_id, catalog_item_id) do nothing`,
    [gardener.id, fixture.formId],
  );
  await pool.query(
    `insert into engagement_bookmarks (owner_user_id, target_kind, target_ref, bookmark_state)
     values ($1::uuid, 'variety', $2::text, 'active')
     on conflict (owner_user_id, target_kind, target_ref)
     do update set bookmark_state = 'active'`,
    [gardener.id, fixture.formSlug],
  );
}

async function clearShelves() {
  await pool.query(
    `delete from wishlist_items where owner_user_id = $1::uuid`,
    [gardener.id],
  );
  await pool.query(
    `delete from engagement_bookmarks where owner_user_id = $1::uuid`,
    [gardener.id],
  );
}

interface Violation {
  id: string;
  impact: string | null;
  targets: string[];
}

async function axeViolations(page: Page): Promise<Violation[]> {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

async function scan(page: Page, url: string, label: string) {
  const response = await page.goto(url, { waitUntil: "load" });
  expect(response?.status(), `${label} answered ${response?.status()}`).toBe(
    200,
  );
  await page.waitForTimeout(1_000);
  const violations = await axeViolations(page);
  expect(violations, `${label}: ${JSON.stringify(violations)}`).toEqual([]);
}

async function scanBothWidths(page: Page, url: string, label: string) {
  await page.setViewportSize(PHONE);
  await scan(page, url, `${label} at 375 px`);
  await page.setViewportSize(DESKTOP);
  await scan(page, url, `${label} at 1440 px`);
}
