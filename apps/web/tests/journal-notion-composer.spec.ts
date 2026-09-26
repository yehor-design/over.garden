import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import { WCAG_AA_TAGS } from "./helpers/redesign-accessibility";
import { Pool } from "pg";


/**
 * The Notion-shaped composer end to end (SDD Slice 26, ADR-0028), against a
 * production build and a real database:
 *
 *   1. an entry written with the input rules and the slash menu alone — a
 *      heading, a to-do, a callout, a quote and a marked run — with no
 *      pointer on any formatting control;
 *   2. the gutter: hovering a block moves it there, dragging it reorders the
 *      document, and the block menu turns one block into another;
 *   3. the floating pill on a selection, and the link it writes;
 *   4. the entry published, and every one of those blocks read back from the
 *      public page a reader sees.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/journal-notion-composer.spec.ts
 */
const TEST_PASSWORD = "OVE417-local-password-1!";

test.use({ trace: "off" });

test.describe("OVE-417 Notion-shaped composer", () => {
  test("writes, reorders and publishes an entry through the new controls", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    const origin = requiredBaseUrl(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let userId = "";

    try {
      userId = await createVerifiedCredentialSession({
        baseURL: origin,
        context,
        pool,
      });

      // The one composer writes to a plant of the gardener's own (the
      // combined first-entry form is gone, ADR-0035 D1).
      const plantId = await seedPlant(pool, userId, `Помідор ${randomUUID().slice(0, 8)}`);
      await page.goto(`${origin}/garden/new?object=${plantId}`);
      const composer = page.locator('[data-entry-composer="true"]');
      const canvas = composer.locator("[data-lexical-journal-canvas]");
      await expect(canvas).toBeVisible();
      await expect(
        composer.locator('[data-structured-journal-composer="true"]'),
      ).toHaveAttribute("data-status", "ready");

      // The retired row of every mark stays retired; ADR-0028 D3 as amended
      // puts one row of ordinary tools under the text instead (`OVE-487`).
      await expect(composer.locator('[role="toolbar"]')).toHaveCount(0);
      await expect(
        composer.getByRole("group", { name: "Інструменти запису" }),
      ).toBeVisible();

      const editor = canvas.locator('[contenteditable="true"]').first();
      await editor.click();

      // 1. The first line invites writing, not a command (`OVE-487`); the
      //    next empty line names the key that opens the menu.
      await expect(
        canvas.locator("[data-journal-placeholder]"),
      ).toHaveAttribute("data-journal-placeholder", "Як минув день у саду?");

      // 2. Input rules: a heading, a list, and a marked run — no control used.
      await page.keyboard.type("## Травень");
      await page.keyboard.press("Enter");
      await expect(
        canvas.locator("[data-journal-placeholder]"),
      ).toHaveAttribute("data-journal-placeholder", /\//u);
      await page.keyboard.type("- полити зранку");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("це **важливо** для сорту");
      await expect(canvas.locator("h2")).toHaveText("Травень");
      await expect(canvas.locator("ul li").first()).toHaveText("полити зранку");
      await expect(canvas.locator("strong")).toHaveText("важливо");

      // 3. The slash menu, by keyboard only.
      await page.keyboard.press("Enter");
      await page.keyboard.type("/");
      const menu = canvas.locator("[data-journal-slash-menu]");
      await expect(menu).toBeVisible();
      await page.keyboard.type("вин");
      await expect(menu.locator("[data-journal-slash-option]")).toHaveCount(1);
      await page.keyboard.press("Enter");
      await page.keyboard.type("Полити перед спекою");
      await expect(
        canvas.locator('[data-lexical-journal-callout="true"]'),
      ).toHaveText(/Полити перед спекою/u);

      // 4. A to-do and a quote, again from the keyboard.
      await page.keyboard.press("Enter");
      await page.keyboard.type("[x] підв'язати томати");
      await expect(
        canvas.locator('li[role="checkbox"][aria-checked="true"]'),
      ).toHaveCount(1);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("> Рости повільно");
      await expect(canvas.locator("blockquote")).toHaveText(/Рости повільно/u);

      // 5. The gutter belongs to the block the pointer is over.
      const blocks = canvas.locator('[contenteditable="true"] > *');
      const blockCount = await blocks.count();
      expect(blockCount).toBeGreaterThan(4);
      const gutter = canvas.locator("[data-journal-block-gutter]");
      await blocks.first().hover();
      await expect(gutter).toBeVisible();
      // The gutter lands on the block a frame after the pointer does, so this
      // is both the assertion and the wait the drag below depends on.
      await expectGutterOn(gutter, blocks.first());
      const firstBox = await blocks.first().boundingBox();

      // 6. Dragging the last block above the first reorders the document.
      const lastText = (await blocks.last().innerText()).trim();
      await blocks.last().hover();
      await expectGutterOn(gutter, blocks.last());
      const handle = canvas.locator('[data-journal-gutter-action="handle"]');
      const handleBox = await handle.boundingBox();
      if (!handleBox || !firstBox)
        throw new Error("The gutter never appeared.");
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, firstBox.y + 2, {
        steps: 12,
      });
      await expect(
        canvas.locator('[data-journal-insertion-line="reorder"]'),
      ).toBeVisible();
      await page.mouse.up();
      await expect(blocks.first()).toHaveText(lastText);

      // 7. The floating pill, and the link it writes. One word, so the anchor
      // it produces is one anchor.
      await canvas.locator("strong").dblclick();
      const pill = canvas.locator("[data-journal-selection-toolbar]");
      await expect(pill).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("editor-selection-controls.png"), animations: "disabled" });
      await pill.locator('[data-journal-format="link"]').click();
      await pill
        .locator('input[type="url"]')
        .fill("https://example.com/tomato");
      await page.keyboard.press("Enter");
      await expect(
        canvas.locator('a[href="https://example.com/tomato"]'),
      ).toHaveCount(1);

      // 8. Publish, and read the blocks back from the page a reader sees.
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
      if (response.status() >= 400) {
        throw new Error(
          `Publish answered ${response.status()}: ${await response
            .text()
            .catch(() => "(body unavailable)")}`,
        );
      }

      const entry = await pool.query<{ id: string; slug: string | null }>(
        `select e.id::text as id, e.public_slug as slug
         from journal_entries e
         where e.owner_user_id = $1::uuid
         order by e.created_at desc limit 1`,
        [userId],
      );
      const slug = entry.rows[0]?.slug;
      if (!slug) throw new Error("The entry was not published with a slug.");

      await page.goto(`${origin}/journal/${slug}`);
      const article = page.locator('[data-journal-document="v1"]');
      await expect(article).toBeVisible();
      // Every block written through the new controls survives to the reader.
      await expect(
        article.locator('[data-block-type="heading"][data-level="2"]'),
      ).toHaveText("Травень");
      await expect(
        article.locator('[data-block-type="list"][data-list-style="todo"]'),
      ).toHaveCount(1);
      await expect(
        article.locator('[data-block-type="callout"][role="note"]'),
      ).toHaveCount(1);
      await expect(article.locator('[data-block-type="quote"]')).toHaveCount(1);
      await expect(
        article.locator('a[href="https://example.com/tomato"]'),
      ).toHaveCount(1);
      // The page keeps exactly one h1, and it is the entry title.
      await expect(page.locator("h1")).toHaveCount(1);
    } finally {
      if (userId) {
        await pool
          .query('delete from public."user" where id = $1::uuid', [userId])
          .catch(() => undefined);
      }
      await pool.end();
    }
  });
});


test.describe("OVE-458 the composer a keyboard can finish", () => {
  test("holds its column, moves a block by key, states the cover and warns on the way out", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    const origin = requiredBaseUrl(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let userId = "";

    try {
      userId = await createVerifiedCredentialSession({
        baseURL: origin,
        context,
        pool,
      });

      // The one composer writes to a plant of the gardener's own (the
      // combined first-entry form is gone, ADR-0035 D1).
      const plantId = await seedPlant(pool, userId, `Помідор ${randomUUID().slice(0, 8)}`);
      await page.goto(`${origin}/garden/new?object=${plantId}`);
      const composer = page.locator('[data-entry-composer="true"]');
      const canvas = composer.locator("[data-lexical-journal-canvas]");
      await expect(canvas).toBeVisible();
      await expect(
        composer.locator('[data-structured-journal-composer="true"]'),
      ).toHaveAttribute("data-status", "ready");

      // 1. AC1 — the column is Notion's 708 px and the gutter its 56 px, both
      //    unchanged by the redesign. The 708 is a **cap**: inside the shell's
      //    704 px content column (`--container-content`) minus the page's own
      //    padding the canvas renders at 656, which is 70–75 Cyrillic
      //    characters and inside DESIGN.md §3's measure. The Linear card says
      //    a 40 px gutter; ADR-0028 D3 says 56, and the ADR is the decision of
      //    record.
      const column = await canvas.evaluate((node) => ({
        maxWidth: getComputedStyle(node).maxWidth,
        paddingLeft: Number.parseFloat(getComputedStyle(node).paddingLeft),
        width: node.getBoundingClientRect().width,
      }));
      expect(column.maxWidth).toBe("708px");
      expect(column.paddingLeft).toBe(56);
      expect(column.width).toBeLessThanOrEqual(708);
      expect(column.width).toBeGreaterThan(600);

      const editor = canvas.locator('[contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type("Перший");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Другий");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Третій");

      // 2. AC1 — the slash menu is one flat list. A submenu closes the parent
      //    with reason `sibling-open`, so a nested menu here is a defect.
      await page.keyboard.press("Enter");
      await page.keyboard.type("/");
      const menu = canvas.locator("[data-journal-slash-menu]");
      await expect(menu).toBeVisible();
      await expect(
        menu.locator('[aria-haspopup="menu"], [role="menu"] [role="menu"]'),
      ).toHaveCount(0);
      const optionCount = await menu
        .locator("[data-journal-slash-option]")
        .count();
      expect(optionCount).toBeGreaterThan(6);
      await page.keyboard.press("Escape");
      // The "/" and then the empty block it was typed into, so the document
      // is back to the three paragraphs the reordering below counts.
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");

      // 3. AC2 — a block moves by key. The caret is in the last block, so the
      //    gutter belongs to it without any pointer; Tab reaches the handle.
      const blocks = canvas.locator('[contenteditable="true"] > *');
      await expect(blocks.last()).toHaveText("Третій");
      // The pointer leaves the canvas, because hover outranks the caret and
      // the click that started the typing left it over the first block. This
      // is the keyboard's run: nothing below touches the mouse.
      await page.mouse.move(4, 4);
      const handle = canvas.locator('[data-journal-gutter-action="handle"]');
      await expect(handle).toBeAttached();
      let reached = false;
      for (let press = 0; press < 5 && !reached; press += 1) {
        await page.keyboard.press("Tab");
        reached = await handle.evaluate(
          (node) => node === document.activeElement,
        );
      }
      expect(reached, "the drag handle is reachable by Tab").toBe(true);
      // The handle names the block it will move, and where that block is.
      await expect(handle).toHaveAttribute("aria-label", /3 \/ 3/u);
      await page.keyboard.press("ArrowUp");
      await expect(blocks.nth(1)).toHaveText("Третій");
      // The move is announced, not merely performed.
      await expect(
        composer.locator("[data-lexical-reorder-live-region]"),
      ).toContainText(/2 з 3/u);

      // 4. The shortcut sheet says what the rules are, from the same modules
      //    that implement them.
      const sheetTrigger = composer.locator(
        '[data-journal-shortcut-sheet-trigger="true"]',
      );
      await sheetTrigger.click();
      const sheet = page.locator('[data-journal-shortcut-sheet="true"]');
      await expect(sheet).toBeVisible();
      // Settled, not opening: axe computes contrast from what is painted, and
      // a popup mid-transition is still partly transparent.
      await expect(sheet).toHaveCSS("opacity", "1");
      await expect(sheet).toContainText("## ");
      await expect(sheet).toContainText("[x]");
      await expect(sheet).toContainText("**…**");
      // Axe over the page while the sheet is open: a popover portals out of
      // the composer, so the picker spec's composer-scoped run never sees it.
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      // 5. AC7 — the cover says its value in words, and changes it by key.
      //    It is a question only once there is a photograph (`OVE-487`): a
      //    note of three paragraphs has no cover section at all, and the
      //    tool row's photo button brings one. The photograph's upload is
      //    refused here — no Worker in this run — and its block, which is
      //    what the cover chooses between, is there regardless.
      await expect(
        composer.locator("[data-journal-cover-controls]"),
      ).toHaveCount(0);
      const chooser = page.waitForEvent("filechooser");
      await composer.locator('[data-journal-tool="photo"]').click();
      await (
        await chooser
      ).setFiles({
        name: "leaf.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
      await expect(
        composer.locator('[data-journal-cover-controls="true"]'),
      ).toBeVisible();
      const coverValue = composer.locator('[data-journal-cover-value="true"]');
      await expect(coverValue).toContainText(/Обрано: Автоматично/u);
      const noCover = composer.getByRole("button", {
        name: "Без обкладинки",
        exact: true,
      });
      await noCover.focus();
      await page.keyboard.press("Enter");
      await expect(coverValue).toContainText(/Обрано: Без обкладинки/u);
      await expect(noCover).toHaveAttribute("aria-pressed", "true");

      // 6. AC5 — leaving with unpublished work warns once, in the product's
      //    own dialog, and the reader who stays keeps their work.
      const catalogLink = page
        .locator('a[href="/catalog"], a[href^="/catalog?"]')
        .first();
      await catalogLink.click();
      const guard = page.locator('[data-unpublished-work-guard="true"]');
      await expect(guard).toBeVisible();
      await expect(guard).toContainText(/чернеток немає/u);
      expect(new URL(page.url()).pathname).toBe("/garden/new");
      await page.getByRole("button", { name: "Залишитися" }).click();
      await expect(guard).toBeHidden();
      await expect(blocks.first()).toHaveText("Перший");

      // Confirming goes where the reader pressed.
      await catalogLink.click();
      await page.getByRole("button", { name: "Піти й відкинути" }).click();
      await page.waitForURL(/\/catalog(\?|$)/u, { timeout: 30_000 });
    } finally {
      if (userId) {
        await pool
          .query('delete from public."user" where id = $1::uuid', [userId])
          .catch(() => undefined);
      }
      await pool.end();
    }
  });
});

/**
 * Axe over the whole document, at the WCAG 2.1 AA tags DESIGN.md §10 gates on.
 * Through the protocol rather than a script element: the page's CSP blocks the
 * element, and a blocked script tag never fires its load event.
 */
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
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(
      {
        include: [["body"]],
        // `base-ui` traps focus with two zero-size `aria-hidden` sentinels
        // that carry `tabindex="0"` — the standard focus-lock pattern, which
        // axe reports as `aria-hidden-focus` wherever any overlay is open. It
        // is the library's, not this composer's, and a screen reader never
        // reaches one: focus landing there is redirected in the same tick.
        exclude: [["[data-base-ui-focus-guard]"]],
      } as unknown as Document,
      {
        runOnly: { type: "tag", values: tags },
      },
    );
    // The selector too: a violation without a path costs an afternoon.
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, WCAG_AA_TAGS);
}

/** The gutter is positioned imperatively one frame after the pointer moves. */
async function expectGutterOn(gutter: Locator, block: Locator) {
  await expect
    .poll(async () => {
      const gutterBox = await gutter.boundingBox();
      const blockBox = await block.boundingBox();
      if (!gutterBox || !blockBox) return Number.POSITIVE_INFINITY;
      return Math.abs(gutterBox.y - blockBox.y);
    })
    .toBeLessThan(8);
}

/**
 * Through the one helper that knows how: sign-up answers 500 on a machine with
 * no mail provider and 429 to the fourth caller in a window, and the copy of
 * the flow that stood here knew the first and not the second — so this spec
 * failed whenever enough others signed somebody in beside it (`OVE-462`).
 */
async function createVerifiedCredentialSession(input: {
  baseURL: string;
  context: BrowserContext;
  pool: Pool;
}) {
  const gardener = await signInSyntheticGardener({
    baseURL: input.baseURL,
    context: input.context,
    pool: input.pool,
    prefix: "ove417",
    password: TEST_PASSWORD,
  });
  return gardener.id;
}

function requiredBaseUrl(baseURL: string | undefined) {
  if (!baseURL) throw new Error("A baseURL is required for the composer spec.");
  return baseURL.replace(/\/$/, "");
}

function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the composer spec.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The composer spec runs against a loopback database only.");
  }
  return url;
}

/** A space and a plant in it, owned by the gardener the test signed in. */
async function seedPlant(pool: Pool, userId: string, name: string): Promise<string> {
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1, 'Сад') returning id::text as id`,
    [userId],
  );
  const plant = await pool.query<{ id: string }>(
    `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
     values ($1, $2, $3, 'plant') returning id::text as id`,
    [userId, space.rows[0]!.id, name],
  );
  return plant.rows[0]!.id;
}

