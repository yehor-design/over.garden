import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";
import { postPastRateLimit } from "./helpers/auth-rate-limit";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * Activity and its reminders (`OVE-501`).
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=notification-activity.spec.ts
 *
 * One ordinary member — no owner rights anywhere — with four plants called
 * «Томат»: two on «Балкон», two in «Теплиця», none written about in two
 * weeks. Two other gardeners comment on the member's basil, and one of them
 * follows the member. What this proves, against a production build and the
 * local database:
 *
 * - **Every row says what it is about.** The four reminders name the plant,
 *   its kind, its space and its organism, the two on the same shelf are told
 *   apart by the day each was added, and the last entry is a date — never
 *   "time to", never "needs attention".
 * - **Write is the composer for exactly that plant.** One press opens it with
 *   that plant chosen; publishing writes the entry to that plant — read back
 *   from the database — and its reminder leaves the list and the count.
 * - **A plant deleted after the list was drawn** opens the composer with the
 *   reason and the picker, not silently empty-handed.
 * - **The count is the receipts.** A receipt the database refuses is said
 *   beside its row and changes nothing; written, it takes exactly the row's
 *   unread events off the header — and off the garden's rail, which counted
 *   another model before.
 * - **Another member's forged receipt changes nothing of this member's.**
 * - **The preferences are their own page** under Activity, and turning the
 *   reminders off takes them out of the list and the count.
 * - **A guest keeps the view through sign-in**, BG and RU say the same
 *   things, every form has a real endpoint before the bundle runs, and axe
 *   finds nothing at 375 px or 1440 px. (With scripts off, the list itself
 *   stays behind its loading frame, as every streamed personal page does.)
 *
 * The tests run in order: each one leaves the member's activity in the state
 * the next one counts from.
 */

const PREFIX = "ove501";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-501",
);
const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 375, height: 812 } as const;

test.describe.configure({ mode: "serial" });

let pool: Pool;
let member: SyntheticGardener;
let commenters: SyntheticGardener[] = [];
const accounts: string[] = [];
let passwordHash: Promise<string> | null = null;
let memberCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
/** The four tomatoes, by where they live and when they were added. */
let tomatoes: {
  balconyOld: string;
  greenhouseOld: string;
  balconyNew: string;
  greenhouseNew: string;
};
let basilEntryTitle: string;
let failTrigger: string | null = null;

test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  member = await account(`${PREFIX}-member`);
  commenters = [
    await account(`${PREFIX}-first`),
    await account(`${PREFIX}-second`),
  ];
  await seedMemberGarden();

  const context = await browser.newContext();
  try {
    await signIn(context, baseURL, member);
    memberCookies = await context.cookies(baseURL);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (failTrigger) await dropFailingReceipts().catch(() => undefined);
  for (const id of accounts) {
    await pool.query(
      `delete from engagement_comments where author_user_id = $1::uuid`,
      [id],
    );
    await pool.query(
      `delete from profile_follows
        where follower_user_id = $1::uuid or target_user_id = $1::uuid`,
      [id],
    );
    for (const [table, column] of [
      ["notification_receipts", "owner_user_id"],
      ["notification_preferences", "owner_user_id"],
      ["journal_entries", "owner_user_id"],
      ["plant_objects", "owner_user_id"],
      ["spaces", "owner_user_id"],
    ] as const) {
      await pool.query(`delete from ${table} where ${column} = $1::uuid`, [id]);
    }
    await removeSyntheticGardener(pool, id);
  }
  await pool.end();
});

test("every reminder names its plant and space, and four «Томат» rows are told apart", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });
    // Revealed, not merely streamed: the list replaces its loading frame
    // about half a second after load.
    await expect(reminderRows(page).first()).toBeVisible();
    await expect(
      page.locator(
        '[data-my-social-surface]:not([data-state="loading"]):visible h1',
      ),
    ).toHaveText("Події");
    // Four reminders, two comments in one row and one follow: seven unread.
    await expectCount(page, 7);
    await expect(reminderRows(page)).toHaveCount(4);
    await expect(page.locator('[data-notification-row="social"]')).toHaveCount(
      2,
    );

    const reminders = await describeReminders(page);
    expect(new Set(reminders.map((row) => row.about)).size).toBe(4);
    expect(new Set(reminders.map((row) => row.writeLabel)).size).toBe(4);
    const byId = new Map(reminders.map((row) => [row.objectId, row]));
    expect([...byId.keys()].sort()).toEqual(Object.values(tomatoes).sort());
    for (const [id, space] of [
      [tomatoes.balconyOld, "Балкон"],
      [tomatoes.balconyNew, "Балкон"],
      [tomatoes.greenhouseOld, "Теплиця"],
      [tomatoes.greenhouseNew, "Теплиця"],
    ] as const) {
      const row = byId.get(id)!;
      expect(row.about).toContain("Томат · Рослина · ");
      expect(row.about).toContain(space);
      // Both tomatoes on a shelf read the same until the day each was added.
      expect(row.about).toMatch(/додано \d{1,2} [^\s]+ \d{4}/u);
      expect(row.origin).toBe("Нагадування");
    }
    // A fact, not a diagnosis: the date of the last entry, or none yet.
    expect(byId.get(tomatoes.balconyOld)!.lastEntry).toEqual({
      date: isoDay(-25),
      text: "Останній запис: 4 тижні тому",
    });
    for (const id of [
      tomatoes.balconyNew,
      tomatoes.greenhouseOld,
      tomatoes.greenhouseNew,
    ]) {
      expect(byId.get(id)!.lastEntry).toEqual({
        date: "never",
        text: "Ще без записів",
      });
    }
    const text = await page
      .locator('[data-my-social-surface]:not([data-state="loading"]):visible')
      .innerText();
    expect(text).not.toMatch(/Час додати|уваги|потребу|Системні/u);

    // The two comments on the basil are one row that names the entry, the
    // plant, its space, and both people.
    const comments = page.locator('[data-notification-row="social"]', {
      has: page.locator('[data-notification-link="comment"]'),
    });
    await expect(comments.locator("[data-notification-link]")).toHaveText(
      "Новий коментар до вашого запису (2)",
    );
    await expect(comments.locator("[data-notification-about]")).toHaveText(
      `«${basilEntryTitle}» · Базилік · Балкон`,
    );
    await expect(
      comments.locator('[data-notification-origin="social"]'),
    ).toHaveText(`Від @${commenters[1]!.handle}, @${commenters[0]!.handle}`);
    await expect(comments).toHaveAttribute(
      "data-notification-unread-count",
      "2",
    );

    // A keyboard reader who reaches the row's link hears the what, the where
    // and the when: the link is described by the two lines under it.
    const link = reminderRows(page).first().locator("[data-notification-link]");
    const described = await link.evaluate((element) =>
      (element.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" | "),
    );
    expect(described).toMatch(/Томат · Рослина · .* \| .*Нагадування/u);

    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-uk-1440.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "activity-uk-1440");
    await page.setViewportSize(PHONE);
    await page.reload({ waitUntil: "load" });
    // The list, not its loading frame, is what gets measured and scanned.
    await expect(reminderRows(page).first()).toBeVisible();
    await expect(reminderRows(page)).toHaveCount(4);
    await expectReflow(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-uk-375.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "activity-uk-375");
  } finally {
    await context.close();
  }
});

test("Write opens the composer for exactly that plant, and the entry lands on it", async ({
  browser,
  baseURL,
}) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });

    // Close first: the composer returns to the row it was opened from.
    const other = page.locator(
      `[data-notification-write="${tomatoes.greenhouseNew}"]`,
    );
    const otherRow = await rowAnchor(page, tomatoes.greenhouseNew);
    await other.click();
    await page.waitForURL(/\/garden\/new\?/u);
    const opened = new URL(page.url());
    expect(opened.searchParams.get("object")).toBe(tomatoes.greenhouseNew);
    expect(opened.searchParams.get("returnTo")).toBe(
      `/notifications#${otherRow}`,
    );
    const composer = page.locator('[data-entry-composer="true"]');
    await waitForHydration(
      composer.locator('[data-entry-composer-publish="true"]'),
    );
    await composer.getByRole("button", { name: "Скасувати" }).click();
    await page.waitForURL((target) => target.pathname === "/notifications");
    expect(new URL(page.url()).hash).toBe(`#${otherRow}`);

    // One activation: the Write of the older greenhouse tomato.
    const write = page.locator(
      `[data-notification-write="${tomatoes.greenhouseOld}"]`,
    );
    await expect(write).toHaveAccessibleName(/^Записати: Томат · Теплиця/u);
    await write.click();
    await page.waitForURL(/\/garden\/new\?/u);
    expect(new URL(page.url()).searchParams.get("object")).toBe(
      tomatoes.greenhouseOld,
    );
    await expect(
      composer.locator("[data-entry-composer-destination-name]"),
    ).toHaveText("Томат");
    await expect(
      composer.locator('[data-entry-composer-destination="true"]'),
    ).toContainText("Теплиця");
    await expect(
      composer.locator("[data-owned-destination-picker]"),
    ).toHaveCount(0);
    await expect(
      composer.locator("[data-entry-composer-destination-name]"),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "composer-from-reminder-uk-1440.png"),
      fullPage: true,
    });

    await typeInto(page, "Перші квіти на нижній китиці.");
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await page.waitForURL(
      (target) =>
        target.pathname === `/garden/objects/${tomatoes.greenhouseOld}`,
      { timeout: 40_000 },
    );

    // The database, not the screen: the entry is on that tomato, and not on
    // its twin in the same greenhouse.
    const written = await pool.query<{ plant_object_id: string }>(
      `select plant_object_id::text from journal_entries
        where owner_user_id = $1::uuid and lifecycle_state = 'active'
        order by created_at desc limit 1`,
      [member.id],
    );
    expect(written.rows[0]?.plant_object_id).toBe(tomatoes.greenhouseOld);

    await page.goto("/notifications", { waitUntil: "load" });
    await expect(reminderRows(page)).toHaveCount(3);
    await expect(
      page.locator(`[data-notification-write="${tomatoes.greenhouseOld}"]`),
    ).toHaveCount(0);
    await expectCount(page, 6);
  } finally {
    await context.close();
  }
});

test("a plant deleted after the list was drawn: Write says so and offers the picker", async ({
  browser,
  baseURL,
}) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });
    const write = page.locator(
      `[data-notification-write="${tomatoes.balconyNew}"]`,
    );
    await expect(write).toBeVisible();
    await pool.query(`delete from plant_objects where id = $1::uuid`, [
      tomatoes.balconyNew,
    ]);

    await write.click();
    await page.waitForURL(/\/garden\/new\?/u);
    const composer = page.locator('[data-entry-composer="true"]');
    const notice = page.locator(
      '[data-entry-composer-destination-notice="object"]',
    );
    await expect(notice).toHaveText(
      "Рослини чи тварини з цього посилання немає у вашому саду — можливо, її видалили. Оберіть, про що записати.",
    );
    await expect(
      composer.locator("[data-owned-destination-picker]"),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "composer-deleted-plant-uk-1440.png"),
      fullPage: true,
    });

    await page.goto("/notifications", { waitUntil: "load" });
    await expect(reminderRows(page)).toHaveCount(2);
    await expectCount(page, 5);
  } finally {
    await context.close();
  }
});

test("a receipt the database refuses is said beside its row, and the count moves only when it is written", async ({
  browser,
  baseURL,
}) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });
    const comments = () =>
      page.locator('[data-notification-row="social"]', {
        has: page.locator('[data-notification-link="comment"]'),
      });
    const markRead = () =>
      comments().locator('[data-notification-receipt="read"] button');
    await expect(markRead()).toHaveAccessibleName(
      /^Позначити прочитаним: Новий коментар до вашого запису \(2\) · «/u,
    );

    await installFailingReceipts();
    await markRead().click();
    await page.waitForURL(/receipt=failed/u);
    await expect(
      comments().locator('[data-notification-outcome="failed"]'),
    ).toHaveText("Не вдалося зберегти, нічого не змінилося. Спробуйте ще раз.");
    await expect(comments()).toHaveAttribute("data-notification-read", "false");
    await expect(
      comments().locator('[data-notification-outcome="failed"]'),
    ).toBeVisible();
    await expectCount(page, 5);
    const stored = await pool.query(
      `select 1 from notification_receipts where owner_user_id = $1::uuid`,
      [member.id],
    );
    expect(stored.rowCount).toBe(0);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-receipt-failed-uk-1440.png"),
      fullPage: true,
    });

    // The row's own button is the retry.
    await dropFailingReceipts();
    await markRead().click();
    await page.waitForURL(/receipt=read/u);
    await expect(comments()).toHaveAttribute("data-notification-read", "true");
    await expect(
      comments().locator('[data-notification-outcome="read"]'),
    ).toHaveText("Позначено прочитаним.");
    // Exactly the row's two unread events leave the count.
    await expectCount(page, 3);
    await expectCountMatchesRows(page);

    // The garden's rail links here and says the same number.
    await page.goto("/garden", { waitUntil: "load" });
    const rail = page.locator(
      '[data-site-shell-context="route-owned"] a[href="/notifications"]',
    );
    await expect(rail).toContainText("Події");
    await expect(rail).toContainText("3");
  } finally {
    await context.close();
  }
});

test("another member's forged receipt changes nothing of this member's", async ({
  browser,
  baseURL,
  playwright,
}) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  const request = await playwright.request.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });
    const keys = await reminderRows(page)
      .first()
      .locator('[data-notification-receipt="dismissed"] input[name="eventKey"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
    expect(keys).toHaveLength(1);

    await signInRequest(request, baseURL!, commenters[0]!);
    const forged = await request.post("/api/notifications/receipts", {
      headers: { origin: baseURL! },
      form: {
        eventKey: keys[0]!,
        receiptState: "dismissed",
        returnTo: "/notifications",
      },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(303);

    await page.reload({ waitUntil: "load" });
    await expect(page.locator(`#notification-${keys[0]}`)).toBeVisible();
    await expectCount(page, 3);
    const mine = await pool.query(
      `select receipt_state from notification_receipts
        where owner_user_id = $1::uuid and event_key = $2`,
      [member.id, keys[0]],
    );
    expect(mine.rowCount).toBe(0);
  } finally {
    await request.dispose();
    await context.close();
  }
});

test("the preferences are their own page, and turning reminders off leaves the list and the count", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto("/notifications", { waitUntil: "load" });
    await expect(page.locator("[data-notification-settings]")).toHaveCount(0);
    await page.locator("[data-notification-settings-link]").click();
    await page.waitForURL(
      (target) => target.pathname === "/notifications/settings",
    );
    await expect(
      page.locator(
        '[data-my-social-surface]:not([data-state="loading"]):visible h1',
      ),
    ).toHaveText("Налаштування подій");
    // Activity stays the selected destination while its settings are open.
    await expect(
      page
        .locator(
          '[data-site-shell-nav-item="notifications"][aria-current="page"]:visible',
        )
        .first(),
    ).toBeVisible();
    const form = page.locator('[data-notification-settings="true"]');
    await expect(form).toBeVisible();
    await expect(form.locator("legend")).toHaveText([
      "Від інших садівників",
      "Нагадування",
    ]);
    await expect(form).toContainText(
      "Про ваші рослини й тварини без записів за останні два тижні.",
    );
    await scanAccessibility(page, testInfo, "activity-settings-uk-1440");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-settings-uk-1440.png"),
      fullPage: true,
    });

    await form.getByLabel("Нагадування про записи").uncheck();
    await form.getByRole("button", { name: "Зберегти" }).click();
    await page.waitForURL(/saved=1/u);
    await expect(
      page.locator('[data-notification-settings-outcome="saved"]'),
    ).toHaveText("Налаштування збережено.");
    await expect(form.getByLabel("Нагадування про записи")).not.toBeChecked();

    await page.goto("/notifications", { waitUntil: "load" });
    await expect(reminderRows(page)).toHaveCount(0);
    // The two unread reminders are out of the count as well as the list.
    await expectCount(page, 1);
    await expectCountMatchesRows(page);

    await page.goto("/notifications/settings", { waitUntil: "load" });
    await form.getByLabel("Нагадування про записи").check();
    await form.getByRole("button", { name: "Зберегти" }).click();
    await page.waitForURL(/saved=1/u);
    await page.setViewportSize(PHONE);
    await page.reload({ waitUntil: "load" });
    await expect(
      page.locator('[data-notification-settings-outcome="saved"]'),
    ).toBeVisible();
    await expectReflow(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-settings-saved-uk-375.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "activity-settings-uk-375");

    await page.goto("/notifications", { waitUntil: "load" });
    await expect(reminderRows(page)).toHaveCount(2);
    await expectCount(page, 3);
  } finally {
    await context.close();
  }
});

test("a guest keeps the view and the plant through sign-in", async ({
  browser,
  baseURL,
}) => {
  const context = await localeContext(browser, baseURL!, "uk", PHONE);
  try {
    const page = await context.newPage();
    await page.goto(
      `/garden/new?object=${tomatoes.balconyOld}&returnTo=%2Fnotifications`,
      {
        waitUntil: "load",
      },
    );
    const composerNext = new URL(
      (await page
        .locator('main a[href^="/auth/sign-in"]')
        .first()
        .getAttribute("href"))!,
      baseURL,
    ).searchParams.get("next");
    expect(composerNext).toBe(
      `/garden/new?object=${tomatoes.balconyOld}&returnTo=/notifications`,
    );

    await page.goto("/notifications?filter=reminders", { waitUntil: "load" });
    await expect(page.locator("[data-sign-in-prompt]:visible")).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "activity-guest-uk-375.png"),
      fullPage: true,
    });
    const signIn = page.locator('main a[href^="/auth/sign-in"]').first();
    expect(
      new URL((await signIn.getAttribute("href"))!, baseURL).searchParams.get(
        "next",
      ),
    ).toBe("/notifications?filter=reminders");
    await signIn.click();
    await page.waitForURL(/\/auth\/sign-in/u);
    await signInOnScreen(page, member);
    await page.waitForURL(
      (target) =>
        target.pathname === "/notifications" &&
        target.searchParams.get("filter") === "reminders",
      { timeout: 30_000 },
    );
    await expect(reminderRows(page)).toHaveCount(2);
    await expect(page.locator('[data-notification-row="social"]')).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});

test("Bulgarian and Russian say the same things", async ({
  browser,
  baseURL,
}) => {
  for (const [locale, expected, viewport] of [
    [
      "bg",
      {
        title: "Известия",
        origin: "Напомняне",
        write: /^Запиши: Томат · Балкон/u,
        about: "Томат · Растение · Балкон",
        lastEntry: "Последен запис: ",
        settings: "Настройки на известията",
      },
      DESKTOP,
    ],
    [
      "ru",
      {
        title: "События",
        origin: "Напоминание",
        write: /^Записать: Томат · Балкон/u,
        about: "Томат · Растение · Балкон",
        lastEntry: "Последняя запись: ",
        settings: "Настройки событий",
      },
      PHONE,
    ],
  ] as const) {
    const context = await memberContext(browser, baseURL!, locale, viewport);
    try {
      const page = await context.newPage();
      await page.goto(`/${locale}/notifications`, { waitUntil: "load" });
      await expect(
        page.locator(
          '[data-my-social-surface]:not([data-state="loading"]):visible h1',
        ),
      ).toHaveText(expected.title);
      const row = page.locator(
        `#${await rowAnchor(page, tomatoes.balconyOld)}`,
      );
      await expect(
        row.locator('[data-notification-origin="reminder"]'),
      ).toHaveText(expected.origin);
      await expect(row.locator("[data-notification-about]")).toContainText(
        expected.about,
      );
      await expect(row.locator("[data-notification-last-entry]")).toContainText(
        expected.lastEntry,
      );
      await expect(
        row.locator(`[data-notification-write="${tomatoes.balconyOld}"]`),
      ).toHaveAccessibleName(expected.write);
      await expect(row).toBeVisible();
      await expectReflow(page);
      await page.screenshot({
        path: path.join(
          SCREENSHOTS,
          `activity-${locale}-${viewport.width}.png`,
        ),
        fullPage: true,
      });
      await page.goto(`/${locale}/notifications/settings`, {
        waitUntil: "load",
      });
      await expect(
        page.locator(
          '[data-my-social-surface]:not([data-state="loading"]):visible h1',
        ),
      ).toHaveText(expected.settings);
    } finally {
      await context.close();
    }
  }
});

test("before the bundle runs, every receipt and preference form posts to a real endpoint", async ({
  browser,
  baseURL,
}) => {
  const context = await memberContext(browser, baseURL!, "uk", DESKTOP, {
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    for (const address of ["/notifications", "/notifications/settings"]) {
      await page.goto(address, { waitUntil: "load" });
      const forms = await page.evaluate(() =>
        [...document.querySelectorAll("main form")].map((form) => ({
          action: form.getAttribute("action") ?? "",
          method: (form.getAttribute("method") ?? "get").toLowerCase(),
        })),
      );
      expect(forms.length, address).toBeGreaterThan(0);
      for (const form of forms) {
        expect(form.action, address).not.toContain("javascript:");
      }
      expect(
        forms.some((form) => form.method === "post"),
        address,
      ).toBe(true);
    }
  } finally {
    await context.close();
  }
});

// -- fixtures ---------------------------------------------------------------

/** An account with a password, written the way `auth-intent.spec.ts` writes one. */
async function account(prefix: string): Promise<SyntheticGardener> {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${prefix}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  await acceptLegalDocuments(pool, id);
  accounts.push(id);
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await passwordHash],
  );
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
      where user_id = $1::uuid and lifecycle_state = 'current'`,
    [id],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error(`${email} holds no handle`);
  return { id, email, handle };
}

async function seedMemberGarden() {
  const space = async (name: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
         returning id::text id`,
        [member.id, name],
      )
    ).rows[0]!.id;
  const balcony = await space("Балкон");
  const greenhouse = await space("Теплиця");
  const plant = async (spaceId: string, name: string, daysAgo: number) =>
    (
      await pool.query<{ id: string }>(
        `insert into plant_objects
           (owner_user_id, space_id, display_name, object_kind,
            created_at, updated_at)
         values ($1::uuid, $2::uuid, $3, 'plant',
                 now() - make_interval(days => $4::int), now())
         returning id::text id`,
        [member.id, spaceId, name, daysAgo],
      )
    ).rows[0]!.id;
  tomatoes = {
    balconyOld: await plant(balcony, "Томат", 40),
    greenhouseOld: await plant(greenhouse, "Томат", 30),
    balconyNew: await plant(balcony, "Томат", 20),
    greenhouseNew: await plant(greenhouse, "Томат", 10),
  };
  // The older balcony tomato was written about 25 days ago; the others never.
  await entry(balcony, tomatoes.balconyOld, "Томат зав'язав плоди", 25);

  // The basil was written about today, so it has no reminder — and two other
  // gardeners comment on that entry, and the first of them follows the member.
  const basil = await plant(balcony, "Базилік", 40);
  basilEntryTitle = "Базилік на підвіконні";
  const basilEntry = await entry(balcony, basil, basilEntryTitle, 0);
  for (const [index, commenter] of commenters.entries()) {
    await pool.query(
      `insert into engagement_comments
         (author_user_id, body, client_mutation_id, comment_state,
          target_kind, target_ref, created_at, updated_at)
       values ($1::uuid, 'Гарне листя.', $2, 'active', 'journal_entry',
               $3::text, now() - make_interval(mins => $4::int),
               now() - make_interval(mins => $4::int))`,
      [commenter.id, randomUUID(), basilEntry, 30 - index * 10],
    );
  }
  await pool.query(
    `insert into profile_follows (follower_user_id, target_user_id, follow_state)
     values ($1::uuid, $2::uuid, 'active')`,
    [commenters[0]!.id, member.id],
  );
}

async function entry(
  spaceId: string,
  objectId: string,
  title: string,
  daysAgo: number,
) {
  const row = await pool.query<{ id: string }>(
    `insert into journal_entries
       (owner_user_id, space_id, plant_object_id, title, body,
        client_mutation_id, public_slug, published_at, entry_date,
        source_language, visibility, lifecycle_state, content_class,
        entry_scope)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'Коротка нотатка.', $5, $6,
             now() - make_interval(days => $7::int),
             current_date - $7::int,
             'uk', 'public', 'active', 'real_ugc', 'object')
     returning id::text id`,
    [
      member.id,
      spaceId,
      objectId,
      title,
      randomUUID(),
      `${PREFIX}-${randomUUID().slice(0, 8)}`,
      daysAgo,
    ],
  );
  return row.rows[0]!.id;
}

/** Every receipt write for the member fails, as a refused write would. */
async function installFailingReceipts() {
  failTrigger = `${PREFIX}_fail_${randomUUID().slice(0, 8)}`;
  await pool.query(
    `create function ${failTrigger}() returns trigger language plpgsql as $$
     begin raise exception 'ove501 receipt fault'; end $$`,
  );
  await pool.query(
    `create trigger ${failTrigger} before insert or update on notification_receipts
     for each row when (new.owner_user_id = '${member.id}'::uuid)
     execute function ${failTrigger}()`,
  );
}

async function dropFailingReceipts() {
  if (!failTrigger) return;
  await pool.query(
    `drop trigger if exists ${failTrigger} on notification_receipts`,
  );
  await pool.query(`drop function if exists ${failTrigger}()`);
  failTrigger = null;
}

// -- browser ----------------------------------------------------------------

async function localeContext(
  browser: Browser,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
  viewport: { width: number; height: number },
  options: { javaScriptEnabled?: boolean } = {},
) {
  const context = await browser.newContext({ viewport, ...options });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: baseURL,
    },
  ]);
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "declined");
    } catch {
      // Storage may be blocked; the banner is then simply drawn.
    }
  }, CONSENT_KEY);
  return context;
}

/** The member's one session, handed to every context this run opens. */
async function memberContext(
  browser: Browser,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
  viewport: { width: number; height: number },
  options: { javaScriptEnabled?: boolean } = {},
) {
  const context = await localeContext(
    browser,
    baseURL,
    locale,
    viewport,
    options,
  );
  await context.addCookies(memberCookies);
  return context;
}

/**
 * Better Auth answers `429` to the fourth sign-in in its window across the
 * whole gate, so a sign-in waits and tries again rather than failing a test
 * that is not about signing in.
 */
async function signIn(
  context: BrowserContext,
  baseURL: string,
  gardener: SyntheticGardener,
) {
  const { response, statuses } = await postPastRateLimit(() =>
    context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin: baseURL },
      data: { email: gardener.email, password: SYNTHETIC_GARDENER_PASSWORD },
    }),
  );
  if (response.ok()) return;
  throw new Error(
    `${gardener.email} could not sign in (${statuses.join(", ")})`,
  );
}

async function signInRequest(
  request: { post: BrowserContext["request"]["post"] },
  baseURL: string,
  gardener: SyntheticGardener,
) {
  const { response, statuses } = await postPastRateLimit(() =>
    request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin: baseURL },
      data: { email: gardener.email, password: SYNTHETIC_GARDENER_PASSWORD },
    }),
  );
  if (response.ok()) return;
  throw new Error(
    `${gardener.email} could not sign in (${statuses.join(", ")})`,
  );
}

async function signInOnScreen(page: Page, gardener: SyntheticGardener) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') });
  await waitForHydration(form.locator('button[type="submit"]'));
  await form.locator('input[name="email"]').fill(gardener.email);
  await form
    .locator('input[name="password"]')
    .fill(SYNTHETIC_GARDENER_PASSWORD);
  await form.locator('button[type="submit"]').click();
}

async function typeInto(page: Page, text: string) {
  const composer = page.locator('[data-entry-composer="true"]');
  await expect(
    composer.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready");
  await composer
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first()
    .click();
  await page.keyboard.type(text);
}

function reminderRows(page: Page) {
  return page.locator('[data-notification-row="reminder"]');
}

/** The header's number, and the words it is said in. */
async function expectCount(page: Page, count: number) {
  const header = page.locator("[data-my-social-count]");
  await expect(header).toHaveAttribute("data-my-social-count", String(count));
  await expect(header).toHaveText(`Непрочитані: ${count}`);
}

/** The header's count is the sum of the rows' unread events — never rows. */
async function expectCountMatchesRows(page: Page) {
  const perRow = await page
    .locator("[data-notification-row]")
    .evaluateAll((rows) =>
      rows.reduce(
        (sum, row) =>
          sum + Number(row.getAttribute("data-notification-unread-count") ?? 0),
        0,
      ),
    );
  await expect(page.locator("[data-my-social-count]")).toHaveAttribute(
    "data-my-social-count",
    String(perRow),
  );
}

async function rowAnchor(page: Page, objectId: string) {
  const id = await page
    .locator("[data-notification-row]", {
      has: page.locator(`[data-notification-write="${objectId}"]`),
    })
    .getAttribute("id");
  if (!id) throw new Error(`no row for ${objectId}`);
  return id;
}

async function describeReminders(page: Page) {
  return reminderRows(page).evaluateAll((rows) =>
    rows.map((row) => {
      const write = row.querySelector("[data-notification-write]");
      const last = row.querySelector("[data-notification-last-entry]");
      return {
        objectId: write?.getAttribute("data-notification-write") ?? "",
        writeLabel: write?.getAttribute("aria-label") ?? "",
        about:
          row.querySelector("[data-notification-about]")?.textContent ?? "",
        origin:
          row.querySelector("[data-notification-origin]")?.textContent ?? "",
        lastEntry: {
          date: last?.getAttribute("data-notification-last-entry") ?? "",
          text: last?.textContent ?? "",
        },
      };
    }),
  );
}

function isoDay(offsetDays: number) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}
