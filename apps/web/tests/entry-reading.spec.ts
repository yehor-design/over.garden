import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "playwright/test";

import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";

import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import {
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * A permanent entry page (`OVE-493`), in a browser, against `next start` and
 * the local database:
 *
 * - it reads as the card did — who and when, where it belongs, the words —
 *   with one section for the rest of its journal, each entry once, at 1440,
 *   390 and 320;
 * - like, comment, save and share sit in one row, in that tab order;
 * - share sends the canonical address, by the device's sheet or a copied link;
 * - a member's comment: a dropped connection keeps the words and says so, a
 *   double press posts one comment, the server's answer empties the field;
 * - like and save: a double press is one change, and a dropped connection
 *   puts back what the server last said;
 * - a guest's comment keeps its intent through sign-in; the page's HTML reads
 *   without a script; the directory's card and the page say the same things.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=entry-reading.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const NARROW = { width: 320, height: 640 } as const;
const DISPLAY_NAME = "Олена з Полтави";

let pool: Pool;
let fixture: PublishedEntryFixture;
let member: SyntheticGardener;
let memberCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let olderEntries: { id: string; path: string; title: string }[] = [];

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  fixture = await seedPublishedEntryFixture(pool, "ove493", {
    title: `Перші зав'язі ${randomUUID().slice(0, 6)}`,
  });
  // The author has a public profile, so the byline names a person.
  await pool.query(
    `insert into user_public_profiles (user_id, handle, normalized_handle, display_name)
     values ($1, $2, $2, $3)
     on conflict (user_id) do update set display_name = excluded.display_name`,
    [fixture.ownerUserId, fixture.handle, DISPLAY_NAME],
  );
  // Three earlier entries of the same object: the one before this entry, and
  // two more of its journal.
  const place = await pool.query<{ space_id: string; plant_object_id: string }>(
    "select space_id, plant_object_id from journal_entries where id = $1",
    [fixture.entryId],
  );
  const { space_id: spaceId, plant_object_id: objectId } = place.rows[0]!;
  olderEntries = [];
  for (const daysAgo of [10, 20, 30]) {
    const id = randomUUID();
    const title = `Раніше, ${daysAgo} днів тому`;
    const inserted = await pool.query<{ n: number }>(
      `insert into journal_entries (id, owner_user_id, space_id, plant_object_id, title, body,
         entry_scope, visibility, lifecycle_state, published_at, public_slug,
         source_language, client_mutation_id, entry_date)
       values ($1, $2, $3, $4, $5, 'Раніший запис цього журналу.', 'object', 'public', 'active',
               now() - make_interval(days => $6), $7, 'uk', $7, current_date - $6::int)
       returning author_entry_number as n`,
      [
        id,
        fixture.ownerUserId,
        spaceId,
        objectId,
        title,
        daysAgo,
        `ove493-older-${id.slice(0, 8)}`,
      ],
    );
    olderEntries.push({
      id,
      path: `/@${fixture.handle}/post/${inserted.rows[0]!.n}`,
      title,
    });
  }

  const context = await browser.newContext();
  try {
    member = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove493-member",
    });
    memberCookies = await context.cookies(baseURL!);
    // One entry published through the real ingress expires the public
    // listings' cached reads, so the directory shows the seeded entry.
    const memberSpace = randomUUID();
    const memberObject = randomUUID();
    await pool.query(
      "insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Грядка')",
      [memberSpace, member.id],
    );
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
       values ($1, $2, $3, 'Перець', 'plant', 'unknown')`,
      [memberObject, member.id, memberSpace],
    );
    const response = await context.request.post(
      `${baseURL}/api/garden/entries`,
      {
        headers: {
          origin: baseURL!,
          [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
            ATOMIC_JOURNAL_CREATE_PROTOCOL,
        },
        data: buildAtomicTextJournalCreateRequest({
          publishId: randomUUID(),
          context: {
            target: "plant_object_entry",
            plantObjectId: memberObject,
            entryDate: new Date().toISOString().slice(0, 10),
          },
          title: "Оновлення списків",
          text: "Цей запис оновлює списки.",
        }),
      },
    );
    expect(response.status(), await response.text()).toBe(200);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (fixture) {
    await pool
      .query(
        "delete from engagement_comments where target_kind = 'journal_entry' and target_ref = $1",
        [fixture.entryId],
      )
      .catch(() => undefined);
    await pool
      .query(
        "delete from engagement_likes where target_kind = 'journal_entry' and target_ref = $1",
        [fixture.entryId],
      )
      .catch(() => undefined);
    await pool
      .query(
        "delete from engagement_bookmarks where target_kind = 'journal_entry' and target_ref = $1",
        [fixture.entryId],
      )
      .catch(() => undefined);
    await pool
      .query("delete from user_public_profiles where user_id = $1", [
        fixture.ownerUserId,
      ])
      .catch(() => undefined);
    await pool
      .query("delete from media_assets where owner_user_id = $1", [
        fixture.ownerUserId,
      ])
      .catch(() => undefined);
    await cleanupPublishedEntryFixture(pool, fixture).catch(() => undefined);
  }
  if (member) await cleanupCollection(pool, member.id).catch(() => undefined);
  await pool.end().catch(() => undefined);
});

async function asReader(
  context: BrowserContext,
  baseURL: string,
  signedIn: boolean,
) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...(signedIn ? memberCookies : []),
  ]);
}

async function openEntry(page: Page, query = "") {
  const response = await page.goto(`${fixture.entryPath}${query}`, {
    waitUntil: "load",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

async function top(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} is not laid out`);
  return box.y;
}

/** Server Actions post to the page's own address with a `Next-Action` header. */
async function dropNextAction(page: Page) {
  let dropped = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      !dropped &&
      request.method() === "POST" &&
      request.headers()["next-action"]
    ) {
      dropped = true;
      await route.abort("internetdisconnected");
      return;
    }
    await route.continue();
  });
  return () => dropped;
}

async function commentCount() {
  const result = await pool.query<{ n: number }>(
    `select count(*)::int as n from engagement_comments
     where target_kind = 'journal_entry' and target_ref = $1 and author_user_id = $2`,
    [fixture.entryId, member.id],
  );
  return result.rows[0]!.n;
}

test.describe("a permanent entry page", () => {
  test("reads as the card did, with one section for the rest of its journal", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await asReader(context, baseURL!, false);
    for (const [label, size] of [
      ["1440", DESKTOP],
      ["390", PHONE],
      ["320", NARROW],
    ] as const) {
      await page.setViewportSize(size);
      await openEntry(page);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(fixture.title);
      await expect(
        page.locator('[data-entry-byline="true"]').getByRole("link"),
      ).toHaveAccessibleName(`Автор ${DISPLAY_NAME} @${fixture.handle}`);
      expect(await top(page, '[data-entry-byline="true"]')).toBeLessThan(
        await top(page, '[data-entry-context="true"]'),
      );
      expect(await top(page, '[data-entry-context="true"]')).toBeLessThan(
        await top(page, "h1"),
      );
      await expect(page.locator('[data-entry-context="true"]')).toContainText(
        "Рослина",
      );
      await expectReflow(page);
      await capture(page, testInfo, `entry-uk-${label}`);
    }
    // The rest of the journal: one section, the entry before this one named,
    // and the others each once.
    const related = page.locator('[data-related-history="true"]');
    await expect(related).toHaveCount(1);
    await expect(
      related.locator('[data-journal-chronology="true"] a'),
    ).toHaveCount(1);
    for (const older of olderEntries) {
      await expect(related.locator(`a[href="${older.path}"]`)).toHaveCount(1);
    }
    await scanAccessibility(page, testInfo, "entry-uk-320");
  });

  test("like, comment, save and share sit in one row, in that tab order", async ({
    context,
    page,
    baseURL,
  }) => {
    await asReader(context, baseURL!, true);
    await page.setViewportSize(DESKTOP);
    await openEntry(page);
    const bar = page.locator('[data-slot="engagement-bar"]:visible');
    const share = bar.getByRole("button", { name: "Поділитися" });
    await expect(share).toBeVisible({ timeout: 20_000 });
    const like = bar.getByRole("button", { name: /Подобається/u });
    await waitForHydration(like);
    await like.focus();
    for (const name of [/Зберегти/u, /Коментувати/u, /Поділитися/u]) {
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toHaveAccessibleName(name);
    }
    // Enter on Comment lands on the composer.
    await bar.getByRole("link", { name: "Коментувати" }).press("Enter");
    await expect(page).toHaveURL(/#comment-compose$/u);
  });

  test("share sends the canonical address, by the device's sheet or a copied link", async ({
    browser,
    baseURL,
  }) => {
    const canonical = `${new URL(baseURL!).origin}${fixture.entryPath}`;
    // The device's sheet: whatever the address bar carries, the entry's one
    // address is what is shared.
    const sheet = await browser.newContext({ viewport: DESKTOP });
    try {
      await asReader(sheet, baseURL!, false);
      await sheet.addInitScript(() => {
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (data: ShareData) => {
            (window as unknown as { shared: ShareData }).shared = data;
          },
        });
      });
      const page = await sheet.newPage();
      await openEntry(page, "?from=%2Fjournals%3Fq%3Dtomato&cursor=abc");
      const share = page.getByRole("button", { name: "Поділитися" });
      await expect(share).toBeVisible({ timeout: 20_000 });
      await share.click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { shared?: ShareData }).shared ?? null,
          ),
        )
        .toEqual({ title: fixture.title, url: canonical });
    } finally {
      await sheet.close();
    }

    // No sheet: the link is copied, and the reader is told.
    const copy = await browser.newContext({
      viewport: DESKTOP,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    try {
      await asReader(copy, baseURL!, false);
      await copy.addInitScript(() => {
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: undefined,
        });
      });
      const page = await copy.newPage();
      await openEntry(page, "?authIntent=comment");
      const share = page.getByRole("button", { name: "Поділитися" });
      await expect(share).toBeVisible({ timeout: 20_000 });
      await share.click();
      await expect(page.locator('[data-share-status="copied"]')).toHaveText(
        "Посилання скопійовано.",
      );
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        canonical,
      );
    } finally {
      await copy.close();
    }
  });

  test("a member's comment: a dropped connection keeps the words, a double press posts one", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await asReader(context, baseURL!, true);
    await page.setViewportSize(PHONE);
    await openEntry(page);
    const field = page.locator("#engagement-comment");
    await waitForHydration(field);
    const words = `Листя без плям ${randomUUID().slice(0, 4)}`;
    await field.fill(words);

    // The connection drops on the way: the words stay, the reason is said,
    // the page is still the entry, and nothing was written.
    const wasDropped = await dropNextAction(page);
    await page
      .locator('[data-comment-form="comment"] [data-comment-submit]')
      .click();
    await expect(
      page
        .locator('[data-comment-form="comment"]')
        .getByText("Дію тимчасово не вдалося виконати. Спробуйте ще раз."),
    ).toBeVisible({ timeout: 20_000 });
    expect(wasDropped()).toBe(true);
    await expect(page.locator("#engagement-comment")).toHaveValue(words);
    await expect(page.locator("h1")).toHaveText(fixture.title);
    expect(await commentCount()).toBe(0);
    await capture(page, testInfo, "entry-uk-390-comment-dropped");
    await page.unroute("**/*");

    // A double press posts one comment, and the server's answer empties the
    // field.
    await page
      .locator('[data-comment-form="comment"] [data-comment-submit]')
      .dblclick();
    await expect(page.locator("#comments")).toContainText(words, {
      timeout: 20_000,
    });
    await expect(page.locator("#engagement-comment")).toHaveValue("");
    expect(await commentCount()).toBe(1);
  });

  test("like and save: one change for a double press, and a lost request puts back the truth", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await asReader(context, baseURL!, true);
    await page.setViewportSize(DESKTOP);
    await openEntry(page);
    const bar = page.locator('[data-slot="engagement-bar"]:visible');
    const like = bar.getByRole("button", { name: /Подобається|Вподобано/u });
    await waitForHydration(like);
    const before = await like.getAttribute("aria-pressed");
    expect(before).toBe("false");

    // A lost request: the control comes back as the server last had it.
    const wasDropped = await dropNextAction(page);
    await like.click();
    await expect(
      bar.getByText("Дію тимчасово не вдалося виконати. Спробуйте ще раз."),
    ).toBeVisible({ timeout: 20_000 });
    expect(wasDropped()).toBe(true);
    await expect(
      bar.getByRole("button", { name: /Подобається|Вподобано/u }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("h1")).toHaveText(fixture.title);
    await page.unroute("**/*");

    // A double press is one change.
    await bar
      .getByRole("button", { name: /Подобається|Вподобано/u })
      .dblclick();
    await expect(
      bar.getByRole("button", { name: /Подобається|Вподобано/u }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await expect(
      bar.getByRole("button", { name: /Подобається|Вподобано/u }),
    ).toHaveAttribute("aria-pressed", "true");
    const likes = await pool.query<{ n: number }>(
      `select count(*)::int as n from engagement_likes
       where target_kind = 'journal_entry' and target_ref = $1 and user_id = $2`,
      [fixture.entryId, member.id],
    );
    expect(likes.rows[0]!.n).toBe(1);

    // Save is the server's answer too.
    const save = bar.getByRole("button", { name: /Зберегти|Збережено/u });
    await save.dblclick();
    await expect(save).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    await expect
      .poll(async () => {
        const saved = await pool.query<{ state: string }>(
          `select bookmark_state as state from engagement_bookmarks
           where owner_user_id = $1 and target_kind = 'journal_entry' and target_ref = $2`,
          [member.id, fixture.entryId],
        );
        return saved.rows.map((row) => row.state);
      })
      .toEqual(["active"]);
  });

  test("a guest's comment keeps its intent through sign-in, and the HTML reads without a script", async ({
    context,
    page,
    baseURL,
    request,
  }) => {
    await asReader(context, baseURL!, false);
    await page.setViewportSize(DESKTOP);
    await openEntry(page);
    const trigger = page
      .locator("#comment-compose")
      .getByRole("button", { name: "Коментар" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/@"), {
      timeout: 20_000,
    });
    expect(new URL(page.url()).pathname).toMatch(/sign|auth|login|вхід/iu);

    // The document itself: the words, the byline and working controls, and
    // no share button a reader without a script would press in vain.
    const html = await (await request.get(fixture.entryPath)).text();
    expect(html).toContain(fixture.title);
    expect(html).toContain(DISPLAY_NAME);
    expect(html).toContain('data-entry-byline="true"');
    expect(html).toContain('data-slot="engagement-bar"');
    expect(html).toMatch(/<form[^>]*action="\/auth\/intent\/start"/u);
    // (The label travels in the page's data for the hydrated control; the
    // control's own markup is what must be absent.)
    expect(html).not.toContain("data-share-control");
  });

  test("the way back names the feed or the journals, whichever the reader came from", async ({
    context,
    page,
    baseURL,
  }) => {
    await asReader(context, baseURL!, false);
    await page.setViewportSize(DESKTOP);
    const back = page.locator('[data-return-link="true"]');

    await openEntry(page, `?${new URLSearchParams({ from: "/?kind=plant" })}`);
    await waitForHydration(back);
    await expect(back).toHaveText("Стрічка");
    await expect(back).toHaveAttribute("href", "/?kind=plant");
    // The canonical address is the entry's own, whatever the query says.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${fixture.entryPath}$`, "u"),
    );

    await openEntry(
      page,
      `?${new URLSearchParams({ from: "/journals?topic=harvest" })}`,
    );
    await waitForHydration(back);
    await expect(back).toHaveText("Журнали");
    await expect(back).toHaveAttribute("href", "/journals?topic=harvest");
  });

  test("the directory's card and the page say the same things", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await asReader(context, baseURL!, false);
    await page.setViewportSize(DESKTOP);
    await expect
      .poll(
        async () => {
          await page.goto(`/journals?q=${encodeURIComponent(fixture.title)}`, {
            waitUntil: "load",
          });
          return page
            .locator("[data-entry-card]")
            .filter({ hasText: fixture.title })
            .count();
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(1);
    const cardItem = page
      .locator("[data-entry-card]")
      .filter({ hasText: fixture.title });
    const cardDate = await cardItem
      .locator('[data-entry-card-byline="true"] time')
      .first()
      .getAttribute("datetime");
    await expect(
      cardItem.locator('[data-entry-card-byline="true"]'),
    ).toContainText(DISPLAY_NAME);

    await openEntry(page);
    await expect(
      page.locator('[data-entry-byline="true"] time').first(),
    ).toHaveAttribute("datetime", cardDate!);
    await expect(page.locator('[data-entry-byline="true"]')).toContainText(
      DISPLAY_NAME,
    );
  });
});
