import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  cleanupOrganismFixture,
  cleanupStaleOrganismRuns,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The command palette, driven by keyboard alone (DESIGN.md §5.2, ADR-0031 D7).
 *
 * Not one mouse event in the keyboard walk. A palette is a keyboard control
 * before it is anything else, and the only way to know it can be driven that
 * way is to drive it that way.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/command-palette.spec.ts
 *
 * Start it **without** `--hostname 127.0.0.1` (see `tests/site-shell.spec.ts`).
 */

const PREFIX = "ove445";
const TEST_PASSWORD = "OVE445-local-password-1!";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
  ]);
}

async function axeViolations(page: Page) {
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
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

/** The palette's own state, read the way a screen reader would. */
async function readPalette(page: Page) {
  return page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>(
      '[data-command-palette-input="true"]',
    );
    const listbox = field?.getAttribute("aria-controls")
      ? document.getElementById(field.getAttribute("aria-controls")!)
      : null;
    const activeId = field?.getAttribute("aria-activedescendant") ?? null;
    return {
      fieldRole: field?.getAttribute("role") ?? null,
      expanded: field?.getAttribute("aria-expanded") ?? null,
      listboxRole: listbox?.getAttribute("role") ?? null,
      focusIsField: document.activeElement === field,
      groups: [...(listbox?.querySelectorAll('[role="group"]') ?? [])].map(
        (group) =>
          document
            .getElementById(group.getAttribute("aria-labelledby") ?? "")
            ?.textContent?.trim() ?? "",
      ),
      options: [...(listbox?.querySelectorAll('[role="option"]') ?? [])].map(
        (option) => ({
          id: option.id,
          group: option.getAttribute("data-command-palette-result"),
          label: option.textContent?.trim() ?? "",
        }),
      ),
      activeLabel: activeId
        ? (document.getElementById(activeId)?.textContent?.trim() ?? null)
        : null,
      live:
        document
          .querySelector('[data-command-palette-live="true"]')
          ?.textContent?.trim() ?? "",
    };
  });
}

test.describe("the command palette", () => {
  let pool: Pool;
  let fixture: OrganismFixture;
  let gardenerId: string | null = null;
  let handle: string | null = null;

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

  test("opens on ⌘K and is driven to a result without a pointer", async ({
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

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator('[data-command-palette="true"]')).toBeVisible();

    // The combobox holds focus from the first keystroke; the arrows move a
    // pointer, not focus, which is what lets a reader keep typing.
    await page.keyboard.type("помідор");
    await expect
      .poll(async () => (await readPalette(page)).options.length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    const opened = await readPalette(page);
    expect(opened.fieldRole).toBe("combobox");
    expect(opened.expanded).toBe("true");
    expect(opened.listboxRole).toBe("listbox");
    expect(opened.focusIsField).toBe(true);
    expect(opened.activeLabel).not.toBeNull();
    expect(opened.live).toMatch(/\d/u);

    await page.keyboard.press("ArrowDown");
    const moved = await readPalette(page);
    expect(moved.activeLabel).not.toBe(opened.activeLabel);
    expect(moved.focusIsField).toBe(true);

    await page.keyboard.press("ArrowUp");
    expect((await readPalette(page)).activeLabel).toBe(opened.activeLabel);

    // Axe over the open palette, before anything is chosen.
    const violations = await axeViolations(page);
    expect(violations, JSON.stringify(violations)).toEqual([]);

    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.pathname.endsWith("/journals"), {
      timeout: 15_000,
    });
    expect(page.url()).not.toContain("/journals");
  });

  test("Esc closes it and gives focus back to whatever had it", async ({
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

    // `/` from a page with nothing focused: the second of three entry points.
    await page.locator("body").click();
    await page.keyboard.press("/");
    await expect(page.locator('[data-command-palette="true"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-command-palette="true"]'),
    ).not.toBeVisible();

    // And the third: the rail's own control, reached by keyboard, which is
    // what focus must come back to.
    const trigger = page.locator('[data-command-palette-trigger]').first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-command-palette="true"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-command-palette="true"]'),
    ).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("reaches every group the corpus can answer with", async ({
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
      prefix: PREFIX,
      password: TEST_PASSWORD,
    });
    gardenerId = gardener.id;
    handle = gardener.handle;
    await pool.query(
      `insert into user_public_profiles (user_id, handle, normalized_handle, display_name)
       values ($1::uuid, $2::text, $2::text, $3::text)
       on conflict (user_id) do update set display_name = excluded.display_name`,
      [gardenerId, handle, `Садівник ${PREFIX}`],
    );

    // Journals: the fixture publishes one public entry per organism, so the
    // species' name is a journal title as well as an organism name.
    const groupsFor = async (query: string) => {
      await page.goto("/journals", { waitUntil: "load" });
      await expect(
        page.locator('[data-site-shell-region="header"]'),
      ).toBeVisible();
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.locator('[data-command-palette="true"]')).toBeVisible();
      await page.keyboard.type(query);
      await expect
        .poll(async () => (await readPalette(page)).options.length, {
          timeout: 10_000,
        })
        .toBeGreaterThan(0);
      const reading = await readPalette(page);
      await page.keyboard.press("Escape");
      return new Set(reading.options.map((option) => option.group));
    };

    expect([...(await groupsFor("помідор"))]).toContain("organisms");
    // The fixture titles its public entry "Перше суцвіття"; the palette
    // searches titles, so that is the journal this corpus can answer with.
    expect([...(await groupsFor("Перше суцвіття"))]).toContain("journals");
    expect([...(await groupsFor(`Садівник ${PREFIX}`))]).toContain("gardeners");
    // Actions come from the rail, so they answer whatever the corpus holds.
    expect([...(await groupsFor("Журнали"))]).toContain("actions");
  });

  test("a query that matches nothing shows a state, not an empty box", async ({
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
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("zzzqqqxxxнічого");
    await expect(
      page.locator('[data-screen-state="empty-no-results"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("`/` stays typable inside the composer's contenteditable", async ({
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
      prefix: `${PREFIX}-slash`,
      password: TEST_PASSWORD,
    });
    const slashGardenerId = gardener.id;

    try {
      await page.goto("/garden", { waitUntil: "load" });
      const editor = page
        .locator(
          '#first-entry-composer [data-structured-journal-composer="true"] [contenteditable="true"]',
        )
        .first();
      await expect(editor).toBeVisible({ timeout: 20_000 });
      await editor.click();
      // The composer is a `contenteditable`, not an `<input>`, so a rule that
      // checked only inputs would make the editor swallow every `/` a gardener
      // typed — a date, a fraction and the editor's own `/` menu, all at once.
      await page.keyboard.type("18/09");
      await expect(
        page.locator('[data-command-palette="true"]'),
      ).not.toBeVisible();
      await expect(editor).toContainText("18/09");
    } finally {
      await removeSyntheticGardener(pool, slashGardenerId);
    }
  });
});

test.describe("the palette is an enhancement, never the only way in", () => {
  test("`/journals` and the catalogue search with scripts disabled", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // ADR-0022 D3 and ADR-0031 D7: everything public is indexable, and a
    // palette that replaced these pages would take 114,669 of them out of the
    // index. With no JavaScript the palette cannot exist; these must.
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ]);
    const page = await context.newPage();

    try {
      for (const address of ["/journals", "/objects"]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        // A real form with a real method, which is what "searchable without
        // JavaScript" means.
        const forms = await page.evaluate(() =>
          [...document.querySelectorAll("form")].map((form) => ({
            action: form.getAttribute("action"),
            method: (form.getAttribute("method") ?? "get").toLowerCase(),
            hasTextField: Boolean(
              form.querySelector('input[type="search"], input[type="text"]'),
            ),
          })),
        );
        expect(
          forms.some((form) => form.hasTextField && form.method === "get"),
          `${address} has no scripts-off search form: ${JSON.stringify(forms)}`,
        ).toBe(true);
        // And the palette's trigger is inert rather than misleading: it is a
        // button that needs a bundle, and the page says so by still offering
        // the plain links beside it.
        expect(
          await page.evaluate(() =>
            [...document.querySelectorAll("a[href]")].map((link) =>
              link.getAttribute("href"),
            ),
          ),
        ).toContain("/journals");
      }
    } finally {
      await context.close();
    }
  });
});
