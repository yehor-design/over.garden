import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
} from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

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
    const suffix = randomUUID().slice(0, 8);
    let userId = "";

    try {
      userId = await createVerifiedCredentialSession({
        baseURL: origin,
        context,
        email: `ove417-${suffix}@example.test`,
        pool,
      });

      await page.goto(`${origin}/garden`);
      const composer = page.locator("#first-entry-composer");
      const canvas = composer.locator("[data-lexical-journal-canvas]");
      await expect(canvas).toBeVisible();
      await expect(
        composer.locator('[data-structured-journal-composer="true"]'),
      ).toHaveAttribute("data-status", "ready");

      // The retired button row leaves nothing behind.
      await expect(composer.locator('[role="toolbar"]')).toHaveCount(0);

      const editor = canvas.locator('[contenteditable="true"]').first();
      await editor.click();

      // 1. The placeholder names the key that opens the menu.
      await expect(
        canvas.locator("[data-journal-placeholder]"),
      ).toHaveAttribute("data-journal-placeholder", /\//u);

      // 2. Input rules: a heading, a list, and a marked run — no control used.
      await page.keyboard.type("## Травень");
      await page.keyboard.press("Enter");
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
      await pill.locator('[data-journal-format="link"]').click();
      await pill
        .locator('input[type="url"]')
        .fill("https://example.com/tomato");
      await page.keyboard.press("Enter");
      await expect(
        canvas.locator('a[href="https://example.com/tomato"]'),
      ).toHaveCount(1);

      // 8. Publish, and read the blocks back from the page a reader sees.
      const nameField = composer.locator('input[name="plantName"]');
      await nameField.fill(`Помідор ${suffix}`);
      await nameField.press("Escape");
      const spaceName = composer.locator('input[name="spaceName"]');
      if ((await spaceName.count()) > 0 && !(await spaceName.inputValue())) {
        await spaceName.fill(`Сад ${suffix}`);
      }
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

async function createVerifiedCredentialSession(input: {
  baseURL: string;
  context: BrowserContext;
  email: string;
  pool: Pool;
}) {
  // The user and credential rows are written before the verification mail is
  // sent; without a mail provider the request answers 500 after the rows
  // exist, and the row is the fact this run needs.
  const signUp = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-up/email`,
    {
      headers: { origin: input.baseURL },
      data: {
        email: input.email,
        password: TEST_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    },
  );
  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [input.email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error(
      `Synthetic auth user was not persisted (sign-up answered ${signUp.status()}).`,
    );
  }
  await input.pool.query(
    'update public."user" set "emailVerified" = true where id = $1::uuid',
    [userId],
  );
  const signIn = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-in/email`,
    {
      headers: { origin: input.baseURL },
      data: { email: input.email, password: TEST_PASSWORD },
    },
  );
  expect(signIn.ok()).toBe(true);
  return userId;
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
