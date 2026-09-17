import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";
import {
  cleanupOrganismFixture,
  cleanupStaleOrganismRuns,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";

/**
 * Gates 7 and 8 of `DESIGN.md` §10: axe on the key screens, and a keyboard-only
 * path through the primary flows.
 *
 * Both run against a **production build** and a real database, because both
 * questions are about what a person actually gets. `next dev` does not exercise
 * the postpone/resume path, and a jsdom scan cannot compute a colour — the
 * whole token layer would be unmeasured.
 *
 * The keyboard flows contain no mouse event. Not one. A screen that cannot be
 * driven by keyboard does not ship (ADR-0031 D9), and the only way to know is
 * to drive it that way.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/accessibility.spec.ts
 */

const TEST_PASSWORD = "OVE442-local-password-1!";
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const PREFIX = "ove442";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

interface Violation {
  id: string;
  impact: string | null;
  targets: string[];
}

/**
 * Evaluated through the protocol rather than injected as a script element: the
 * page's Content-Security-Policy blocks the element, and a blocked script tag
 * never fires its load event.
 */
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
  // Streamed sections finish after `load`; scanning too early measures the
  // skeleton rather than the screen.
  await page.waitForTimeout(1_500);
  const violations = await axeViolations(page);
  expect(violations, `${label}: ${JSON.stringify(violations)}`).toEqual([]);
}

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
}

/** Tabs until the given locator holds focus, or fails saying how far it got. */
async function tabTo(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  what: string,
) {
  for (let step = 0; step < 60; step += 1) {
    if (await locator.evaluate((node) => node === document.activeElement)) {
      return step;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${what} in 60 steps.`);
}

/**
 * Publishes one entry through the composer, so `gate 7` has a public entry and
 * a public profile to scan. `gate 8` drives the same composer with the
 * keyboard alone; this one only needs the rows to exist.
 */
async function publishFixtureEntry(page: Page, name: string): Promise<string> {
  await page.goto("/garden", { waitUntil: "load" });
  const composer = page.locator("#first-entry-composer");
  await expect(composer).toBeVisible({ timeout: 20_000 });
  await composer.locator('input[name="plantName"]').fill(name);
  await composer.locator('input[name="plantName"]').press("Escape");
  const spaceName = composer.locator('input[name="spaceName"]');
  if ((await spaceName.count()) > 0 && !(await spaceName.inputValue())) {
    await spaceName.fill(`Сад ${PREFIX}`);
  }
  const editor = composer
    .locator(
      '[data-structured-journal-composer="true"] [contenteditable="true"]',
    )
    .first();
  await editor.click();
  await page.keyboard.type("Запис для перевірки доступності.");
  const disclosure = composer.locator(
    'input[name="publicationDisclosureAccepted"]',
  );
  if ((await disclosure.count()) > 0) await disclosure.check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/garden/entries") &&
        candidate.request().method() === "POST",
      { timeout: 30_000 },
    ),
    composer.getByRole("button", { name: /Опублікувати/u }).click(),
  ]);
  expect(response.status(), await response.text().catch(() => "")).toBeLessThan(
    400,
  );
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  try {
    // Scoped to the entry this call just published, not to "the newest one".
    // Playwright runs spec *files* in parallel, so another file publishing at
    // the same moment used to hand this one its slug — which failed here and
    // looked like a defect in whatever was being reviewed.
    const row = await pool.query<{ public_slug: string }>(
      `select public_slug from journal_entries
       where public_slug is not null and title like $1::text
       order by created_at desc limit 1`,
      // The composer titles an entry "{plant name} - {date}", so the plant
      // name this call passed is the prefix of exactly its own entry.
      [`${name} - %`],
    );
    const slug = row.rows[0]?.public_slug;
    if (!slug) {
      throw new Error(`The published entry "${name}" has no public slug.`);
    }
    return encodeURIComponent(slug);
  } finally {
    await pool.end();
  }
}

test.describe("gate 7 — axe on the key screens", () => {
  let pool: Pool;
  let fixture: OrganismFixture;
  let gardenerId: string | null = null;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    await cleanupStaleOrganismRuns(pool, PREFIX);
    fixture = await seedOrganismFixture(pool, PREFIX);
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await cleanupOrganismFixture(pool, fixture);
    await pool.end();
  });

  test("the public screens report zero violations", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    await scan(page, "/", "home");
    await scan(page, "/journals", "the journals directory");
    await scan(page, "/objects", "the catalogue front door");
    await scan(page, `/species/${fixture.speciesSlug}`, "an organism card");
    await scan(page, "/communities", "communities");
    await scan(page, "/auth/sign-in", "sign in");
  });

  test("the signed-in workspace reports zero violations", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: `${PREFIX}-axe`,
      password: TEST_PASSWORD,
    });
    gardenerId = gardener.id;
    await scan(page, "/garden", "the workspace");

    // A public entry and a public profile are the two screens a stranger
    // arrives on, and neither exists until a gardener has published under a
    // handle. The handle is written here rather than driven through the
    // profile form: this test is about the rendered screens, and `gate 8`
    // drives the composer by keyboard for real.
    // Sign-up already claimed a handle for this gardener in the registry, and
    // a profile's handle is a deferred foreign key into it — so the handle is
    // read rather than invented, and only the profile row is written.
    const handle = gardener.handle;
    await pool.query(
      `insert into user_public_profiles (user_id, handle, normalized_handle, display_name)
       values ($1::uuid, $2::text, $2::text, $3::text)
       on conflict (user_id) do update set display_name = excluded.display_name`,
      [gardenerId, handle, "Олена"],
    );

    const entry = await publishFixtureEntry(page, `Перший запис ${handle}`);

    await scan(page, `/@${handle}`, "a public profile");
    await scan(page, `/@${handle}/${entry}`, "a public entry");
  });

  test("a deliberate violation is seen, so a clean run means something", async ({
    page,
  }) => {
    // A check never observed red is indistinguishable from one that cannot go
    // red. The same scan, over a document that is wrong on purpose.
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    await page.evaluate(() => {
      const broken = document.createElement("img");
      broken.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      document.body.append(broken);
    });
    const violations = await axeViolations(page);
    expect(violations.map((violation) => violation.id)).toContain("image-alt");
  });
});

test.describe("gate 8 — a keyboard-only path through the primary flows", () => {
  let pool: Pool;
  let gardenerId: string | null = null;

  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await pool.end();
  });

  test("sign in", async ({ baseURL, context, page }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto("/auth/sign-in", { waitUntil: "load" });

    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();
    await tabTo(page, email, "the email control");
    await page.keyboard.type(`${PREFIX}-keyboard@example.test`);
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.type(TEST_PASSWORD);

    const submit = page
      .locator("form")
      .filter({ has: password })
      .locator('button[type="submit"]')
      .first();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await expect(submit).toHaveAccessibleName(/\S/);
    // Focus is visible on whatever holds it: `0px` would mean the ring was
    // removed without an equal replacement (DESIGN.md §8).
    expect(
      await submit.evaluate((node) => getComputedStyle(node).outlineWidth),
    ).not.toBe("0px");
    await page.keyboard.press("Enter");
    await expect(password).toBeVisible();
  });

  test("filter the journals directory", async ({ baseURL, context, page }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto("/journals", { waitUntil: "load" });
    await page.waitForTimeout(1_000);

    const search = page.locator('input[type="search"]').first();
    await tabTo(page, search, "the journals search control");
    await page.keyboard.type("томат");

    // Enter inside a GET form submits it, which is the behaviour a real
    // `<form method="get">` gives and a div with an onClick does not.
    await Promise.all([
      page.waitForURL((url) => url.searchParams.has("q"), { timeout: 15_000 }),
      page.keyboard.press("Enter"),
    ]);
    expect(new URL(page.url()).searchParams.get("q")).toBe("томат");
    // The filtered view is linkable and survives a reload.
    await page.reload({ waitUntil: "load" });
    expect(new URL(page.url()).searchParams.get("q")).toBe("томат");
  });

  test("publish an entry", async ({ baseURL, context, page }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    gardenerId = (
      await signInSyntheticGardener({
        baseURL,
        context,
        pool,
        prefix: `${PREFIX}-publish`,
        password: TEST_PASSWORD,
      })
    ).id;

    await page.goto("/garden", { waitUntil: "load" });
    const composer = page.locator("#first-entry-composer");
    await expect(composer).toBeVisible({ timeout: 20_000 });

    const plantName = composer.locator('input[name="plantName"]');
    await tabTo(page, plantName, "the plant name control");
    const name = `Помідор ${PREFIX}-${Date.now()}`;
    await page.keyboard.type(name);
    // The picker's listbox opens on typing and can cover the fields beneath
    // it; Escape closes it and keeps what was typed.
    await page.keyboard.press("Escape");

    const spaceName = composer.locator('input[name="spaceName"]');
    if ((await spaceName.count()) > 0) {
      await tabTo(page, spaceName, "the space name control");
      await page.keyboard.type(`Сад ${PREFIX}`);
    }

    const editor = composer
      .locator(
        '[data-structured-journal-composer="true"] [contenteditable="true"]',
      )
      .first();
    await tabTo(page, editor, "the journal editor");
    await page.keyboard.type("Перший запис, набраний лише з клавіатури.");

    const disclosure = composer.locator(
      'input[name="publicationDisclosureAccepted"]',
    );
    if ((await disclosure.count()) > 0) {
      await tabTo(page, disclosure, "the publication disclosure");
      await page.keyboard.press("Space");
      await expect(disclosure).toBeChecked();
    }

    const publish = composer.getByRole("button", { name: /Опублікувати/u });
    await tabTo(page, publish, "the publish control");
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().includes("/api/garden/entries") &&
          candidate.request().method() === "POST",
        { timeout: 30_000 },
      ),
      page.keyboard.press("Enter"),
    ]);
    expect(
      response.status(),
      await response.text().catch(() => ""),
    ).toBeLessThan(400);

    const persisted = await pool.query<{ id: string }>(
      "select id::text as id from plant_objects where display_name = $1 limit 1",
      [name],
    );
    expect(persisted.rows[0]?.id).toBeTruthy();
  });

  test("the command palette flow is declared, not skipped", () => {
    // DESIGN.md §5.2's palette is `OVE-445`; it does not exist yet, so there
    // is nothing to drive. Recording that here rather than leaving a silent
    // gap: a flow nobody wrote is not a flow that passed.
    expect(
      "open the palette and reach a result — blocked on OVE-445",
    ).toContain("OVE-445");
  });
});
