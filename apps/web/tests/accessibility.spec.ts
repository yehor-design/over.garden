import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";

import { openCommandPalette } from "./helpers/command-palette";
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
import { WCAG_AA_TAGS } from "./helpers/redesign-accessibility";
import { waitForHydration } from "./helpers/hydration";

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
  }, WCAG_AA_TAGS);
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

/** The two widths every redesigned screen is signed off at (ADR-0031 D9). */
const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1_440, height: 900 } as const;

/**
 * The same scan at 375 px and 1440 px.
 *
 * A screen can be clean at one width and wrong at the other: below `lg` the
 * shell swaps its rail for a top bar and a tab bar, and above `xl` it adds a
 * context rail — three different documents from one route. Scanning one of
 * them proves one of them.
 */
async function scanBothWidths(page: Page, url: string, label: string) {
  await page.setViewportSize(PHONE);
  await scan(page, url, `${label} at 375 px`);
  await page.setViewportSize(DESKTOP);
  await scan(page, url, `${label} at 1440 px`);
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
 * The focus ring as a reader sees it: a width, a style that is not `none`, and
 * a colour that is not transparent. All three, because any one of them alone
 * can be true while nothing is drawn.
 */
function expectVisibleFocusRing(
  ring: { width: string; style: string; color: string },
  what: string,
) {
  expect(ring.width, `${what}: outline-width`).not.toBe("0px");
  expect(ring.style, `${what}: outline-style`).not.toBe("none");
  expect(ring.color, `${what}: outline-color`).not.toBe("rgba(0, 0, 0, 0)");
}

/**
 * Who has focus, and what ring they draw — read in **one** evaluation.
 *
 * The walk used to count `:focus-visible` with one locator and then evaluate
 * against it with another, and a locator resolves afresh every time. Between
 * the two calls the page can move focus, or hydration can replace the node,
 * and the second call then waits for a `:focus-visible` that no longer exists
 * until the test times out — which is how this failed once in a full gate run
 * while passing alone. One `page.evaluate` on `document.activeElement` cannot
 * race itself.
 */
async function focusedRing(page: Page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    if (!node.matches(":focus-visible")) return null;
    const style = getComputedStyle(node);
    return {
      name: `${node.tagName.toLowerCase()}:${node.getAttribute("data-slot") ?? (node.textContent || "").trim().slice(0, 16)}`,
      width: style.outlineWidth,
      style: style.outlineStyle,
      color: style.outlineColor,
    };
  });
}

/** One space and one plant in it, for the one composer to write about. */
async function seedPlant(ownerUserId: string, name: string): Promise<string> {
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  try {
    const space = await pool.query<{ id: string }>(
      `insert into spaces (owner_user_id, display_name) values ($1, $2) returning id::text as id`,
      [ownerUserId, `Сад ${PREFIX}`],
    );
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
       values ($1, $2, $3, 'plant') returning id::text as id`,
      [ownerUserId, space.rows[0]!.id, name],
    );
    return object.rows[0]!.id;
  } finally {
    await pool.end();
  }
}

/**
 * Publishes one entry through the composer, so `gate 7` has a public entry and
 * a public profile to scan. `gate 8` drives the same composer with the
 * keyboard alone; this one only needs the rows to exist.
 */
async function publishFixtureEntry(
  page: Page,
  ownerUserId: string,
  name: string,
): Promise<string> {
  // A plant of the gardener's own to write about: the combined first-entry
  // form is gone (ADR-0035 D1), and the one composer writes to what exists.
  const objectId = await seedPlant(ownerUserId, name);
  await page.goto(`/garden/new?object=${objectId}`, { waitUntil: "load" });
  const composer = page.locator('[data-entry-composer="true"]');
  await expect(composer).toBeVisible({ timeout: 20_000 });
  await waitForHydration(composer);
  const editor = composer
    .locator(
      '[data-structured-journal-composer="true"] [contenteditable="true"]',
    )
    .first();
  await editor.click();
  await page.keyboard.type("Запис для перевірки доступності.");
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
    // looked like a defect in whatever was being reviewed. The plant was made
    // for this call, so its entry is exactly this one.
    const row = await pool.query<{ author_entry_number: number }>(
      `select author_entry_number from journal_entries
       where author_entry_number is not null and plant_object_id = $1
       order by created_at desc limit 1`,
      [objectId],
    );
    const entryNumber = row.rows[0]?.author_entry_number;
    if (!entryNumber) {
      throw new Error(`The published entry "${name}" has no number.`);
    }
    // The segments after the handle: an entry lives at `/@{handle}/post/{n}`
    // (ADR-0029 D9), and its name would reach the page through a 308.
    return `post/${entryNumber}`;
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

    // `OVE-447` redesigned these two, and its criteria are stated at 375 px
    // and 1440 px, so both are scanned. Nothing is published on a fresh gate
    // database, which means this pass is also the proof that the *designed
    // empty states* are clean — the populated ones are scanned below, after a
    // gardener has published.
    await scanBothWidths(page, "/", "home, signed out");
    await scanBothWidths(page, "/feed", "the followed feed, signed out");
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

    const entry = await publishFixtureEntry(
      page,
      gardenerId,
      `Перший запис ${handle}`,
    );

    await scan(page, `/@${handle}`, "a public profile");
    await scan(page, `/@${handle}/${entry}`, "a public entry");

    // With one entry published, the home feed and the followed feed are now
    // lists of real cards rather than empty states — a different document, and
    // the one a reader actually gets.
    await scanBothWidths(page, "/", "home with cards, signed in");
    await scanBothWidths(page, "/feed", "the followed feed, signed in");
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
    // Settle on the control before walking to it. The screen arrives through
    // the document's Suspense boundary, so on a busy server `load` can fire
    // while the form is still absent — and then `tabTo` walks sixty steps past
    // a control that does not exist yet and reports it as unreachable.
    await expect(email).toBeVisible({ timeout: 20_000 });
    await tabTo(page, email, "the email control");
    await page.keyboard.type(`${PREFIX}-keyboard@example.test`);
    // Two stops between the credentials since `OVE-455`: the forgotten-password
    // link beside the password label, and the show/hide control inside the
    // field. `tabTo` walks to each rather than assuming a count, so a control
    // that leaves the tab order still fails here.
    await tabTo(page, password, "the password control");
    await page.keyboard.type(TEST_PASSWORD);

    const submit = page
      .locator("form")
      .filter({ has: password })
      .locator('button[type="submit"]')
      .first();
    await tabTo(page, submit, "the submit control");
    await expect(submit).toBeFocused();
    await expect(submit).toHaveAccessibleName(/\S/);
    // Focus is visible on whatever holds it (DESIGN.md §8, WCAG 2.4.7).
    //
    // The **style** is what this asserts, not only the width. Asserting the
    // width alone is what let the ring disappear from every control in the
    // product unnoticed: Tailwind v4 compiles `outline-none` to
    // `--tw-outline-style: none` and `focus-visible:outline-2` to
    // `outline-style: var(--tw-outline-style)`, so a control carrying both
    // reported `2px` and a set colour while drawing nothing. Thirty-seven
    // places carried both.
    const submitRing = await submit.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        color: style.outlineColor,
      };
    });
    expectVisibleFocusRing(submitRing, "the submit control");
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

    const name = `Помідор ${PREFIX}-${Date.now()}`;
    const objectId = await seedPlant(gardenerId, name);
    await page.goto(`/garden/new?object=${objectId}`, { waitUntil: "load" });
    const composer = page.locator('[data-entry-composer="true"]');
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await waitForHydration(composer);

    const editor = composer
      .locator(
        '[data-structured-journal-composer="true"] [contenteditable="true"]',
      )
      .first();
    await tabTo(page, editor, "the journal editor");
    await page.keyboard.type("Перший запис, набраний лише з клавіатури.");

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
      "select id::text as id from journal_entries where plant_object_id = $1 limit 1",
      [objectId],
    );
    expect(persisted.rows[0]?.id).toBeTruthy();
  });

  test("every control the keyboard reaches draws a ring", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto("/journals", { waitUntil: "load" });
    await expect(
      page.locator('[data-site-shell-region="header"]'),
    ).toBeVisible();
    // The page's own controls arrive after the shell does, and the walk counts
    // them — settling on the shell alone made this flake in a full run while
    // passing on its own.
    await expect(page.locator('input[type="search"]').first()).toBeVisible({
      timeout: 20_000,
    });

    // A walk rather than one control: the defect this catches was in the
    // shared primitives — `Button`, `Link`, `Input`, `Chip`, `Pagination` —
    // so a single assertion on a single screen would have passed while the
    // rest of the product drew nothing.
    const walked: string[] = [];
    for (let step = 0; step < 24; step += 1) {
      await page.keyboard.press("Tab");
      const focused = await focusedRing(page);
      if (!focused) continue;
      walked.push(focused.name);
      expectVisibleFocusRing(focused, focused.name);
    }
    // The walk has to have found something, or the assertions above are
    // vacuous — and it has to have found more than one *kind* of control,
    // because the defect was in the shared primitives.
    expect(walked.length, JSON.stringify(walked)).toBeGreaterThan(8);
    const kinds = new Set(walked.map((name) => name.split(":")[0]));
    expect([...kinds].sort(), JSON.stringify(walked)).toEqual(
      expect.arrayContaining(["a", "button", "input"]),
    );
  });

  test("open the command palette and reach a result", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // The gap this used to declare is closed: `OVE-445` built the palette, and
    // `tests/command-palette.spec.ts` drives it across all five groups. What
    // stays here is gate 8's own question — can this flow be reached from a
    // page by keyboard alone — so the gate stops depending on another file.
    await selectLocale(context, baseURL);
    await page.goto("/journals", { waitUntil: "load" });
    await expect(
      page.locator('[data-site-shell-region="header"]'),
    ).toBeVisible();

    const palette = await openCommandPalette(page);
    const field = page.locator('[data-command-palette-input="true"]');
    await expect(field).toBeFocused();

    await page.keyboard.type("стрічка");
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelectorAll('[role="option"]').length,
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    // The active option is named through `aria-activedescendant` while focus
    // stays in the field: that is what a screen reader reads.
    expect(await field.getAttribute("aria-activedescendant")).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
  });
});
