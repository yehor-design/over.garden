import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInOwnerFixture } from "./helpers/owner-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The account's pages (`OVE-503`), in a browser, against `next start` and the
 * local database:
 *
 * - `/garden/profile` is the public identity alone: how others see you, each
 *   field saying who sees it, then the public address, which says what a new
 *   one changes before it is saved;
 * - a bio saves alone and changes only the bio; a refused display name keeps
 *   its words on its own field, focused; a taken handle is refused inline with
 *   the words kept and focus on the field;
 * - a rename moves the gardener's work: the old entry address answers one 308
 *   to the new one, the old profile a 410 — as the page promised;
 * - `/account/settings` holds the language, the blocked list and the way to
 *   your data; `/account/security` the sign-in methods and sign-out;
 * - the menu offers them to a member, and the owner's tools only to the owner;
 * - UK/BG/RU at 320 reflow and pass axe.
 *
 * A failed section beside working ones on a hard load is proved by
 * `scripts/prove-account-pages-partial-failure.ts`: the honest fault is a lock
 * on a shared table, which would stall the gate's other worker.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=account-settings.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const NARROW = { width: 320, height: 640 } as const;
const PREFIX = "ove503";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-503",
);

let pool: Pool;
let member: SyntheticGardener;
let other: SyntheticGardener;
let memberCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const signIn = async (prefix: string) => {
    const context = await browser.newContext();
    try {
      const signedIn = await signInSyntheticGardener({
        baseURL: baseURL!,
        context,
        pool,
        prefix,
      });
      return { signedIn, cookies: await context.cookies(baseURL!) };
    } finally {
      await context.close();
    }
  };
  ({ signedIn: member, cookies: memberCookies } = await signIn(
    `${PREFIX}-member`,
  ));
  ({ signedIn: other } = await signIn(`${PREFIX}-other`));

  // The other gardener has a name, so the blocked list shows a person.
  await pool.query(
    `update user_public_profiles
        set display_name = 'Сусідка Марта', display_name_policy_version = 'ove203-identity-v1'
      where user_id = $1::uuid`,
    [other.id],
  );
  // One published entry, so a rename has an address to move.
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Балкон')
     returning id::text id`,
    [member.id],
  );
  await pool.query(
    `insert into journal_entries
       (owner_user_id, space_id, title, body, client_mutation_id, public_slug,
        published_at, entry_date, source_language, visibility,
        lifecycle_state, content_class, entry_scope)
     values ($1::uuid, $2::uuid, 'Перший полив', 'Полили весь балкон.', $3, $4,
             now(), current_date, 'uk', 'public', 'active', 'real_ugc', 'space')`,
    [
      member.id,
      space.rows[0]!.id,
      randomUUID(),
      `${PREFIX}-${randomUUID().slice(0, 8)}`,
    ],
  );
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.afterAll(async () => {
  for (const gardener of [member, other]) {
    if (!gardener) continue;
    await pool.query(
      "delete from profile_blocks where blocker_user_id = $1::uuid or blocked_user_id = $1::uuid",
      [gardener.id],
    );
    await pool.query(
      "delete from journal_entries where owner_user_id = $1::uuid",
      [gardener.id],
    );
    await pool.query("delete from spaces where owner_user_id = $1::uuid", [
      gardener.id,
    ]);
    await removeSyntheticGardener(pool, gardener.id);
  }
  await pool?.end();
});

async function memberPage(
  browser: Browser,
  baseURL: string,
  locale: "uk" | "bg" | "ru" = "uk",
) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...memberCookies,
  ]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("overgarden:analytics-consent", "declined");
    } catch {
      // Storage blocked: the notice shows; the proofs still run.
    }
  });
  return { context, page: await context.newPage() };
}

async function readProfile(userId: string) {
  const row = await pool.query<Record<string, unknown>>(
    `select handle, display_name, bio, languages, location_visibility,
            coarse_region_code, relationship_visibility, avatar_media_asset_id
       from user_public_profiles where user_id = $1::uuid`,
    [userId],
  );
  return row.rows[0]!;
}

async function openEditor(page: Page) {
  const response = await page.goto("/garden/profile");
  expect(response?.status()).toBe(200);
  await waitForHydration(page.locator('[data-owner-profile-editor="v4"]'));
}

test("the profile page is the public identity, in the order a gardener needs it", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  await openEditor(page);

  await expect(page.locator("h1:visible")).toHaveText("Мій публічний профіль");
  const sections = page.getByRole("navigation", { name: "Розділи акаунта" });
  await expect(sections.getByRole("link")).toHaveText([
    "Публічний профіль",
    "Налаштування",
    "Вхід і безпека",
  ]);
  await expect(
    sections.getByRole("link", { name: "Публічний профіль" }),
  ).toHaveAttribute("aria-current", "page");

  // How others see you, then the address — and each field says who sees it.
  const headings = await page.locator("main h2").allInnerTexts();
  expect(headings.indexOf("Як вас бачать інші")).toBeLessThan(
    headings.indexOf("Публічна адреса"),
  );
  await expect(page.getByLabel("Ім’я для показу")).toHaveAccessibleDescription(
    "Видно всім: у профілі й над кожним вашим записом.",
  );
  await expect(page.getByLabel("Про себе")).toHaveAccessibleDescription(
    "Видно всім у профілі, з вашими переносами рядків.",
  );
  // Every region in the reader's language; none of it in English.
  const regions = await page
    .locator('select[name="coarseRegionCode"] option')
    .allInnerTexts();
  expect(regions.join(" ")).toContain("Україна — Хмельницька область");
  expect(regions.join(" ")).not.toMatch(/Ukraine|Bulgaria|Oblast|Province/u);
  // Nothing about signing in or blocking lives here.
  await expect(page.getByTestId("account-methods-panel")).toHaveCount(0);
  await expect(page.locator("#blocked-profiles")).toHaveCount(0);

  // The preview is closed until asked for, and nothing in it acts.
  const preview = page.locator("#public-profile-preview");
  await expect(preview).not.toHaveAttribute("open", "");
  await preview.locator("summary").click();
  await expect(preview.locator("form, button, input")).toHaveCount(0);

  await page.screenshot({
    path: path.join(SCREENSHOTS, "profile-editor-1440.png"),
    fullPage: true,
  });
  await context.close();
});

test("a bio saves alone: only the bio changes, and the form says so", async ({
  browser,
  baseURL,
}) => {
  const before = await readProfile(member.id);
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  await openEditor(page);

  const bio = `Балкон на сході, ${randomUUID().slice(0, 6)}.`;
  await page.getByLabel("Про себе").fill(bio);
  await page.getByRole("button", { name: "Зберегти профіль" }).click();
  // The form answers in place: no navigation, the words stay on the page.
  await expect(page.locator("#public-profile-status")).toHaveText(
    "Профіль збережено.",
  );
  await expect(page).toHaveURL(/\/garden\/profile$/u);
  await expect(page.getByLabel("Про себе")).toHaveValue(bio);

  const after = await readProfile(member.id);
  expect(after.bio).toBe(bio);
  expect({ ...after, bio: before.bio }).toEqual(before);
  await context.close();
});

test("a refused display name keeps its words on its own field, focused", async ({
  browser,
  baseURL,
}) => {
  const before = await readProfile(member.id);
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  await openEditor(page);

  // A bidirectional control character: the identity policy refuses it.
  const refused = "Оксана‮навпаки";
  const field = page.getByLabel("Ім’я для показу");
  await field.fill(refused);
  await page.getByRole("button", { name: "Зберегти профіль" }).click();

  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(refused);
  await expect(page.locator("#field-displayName-error")).toHaveText(
    "Ім’я для показу недоступне. Спробуйте інше.",
  );
  // Nothing was saved.
  expect(await readProfile(member.id)).toEqual(before);
  await context.close();
});

test("a taken or malformed handle is refused inline, with the words kept and focus on them", async ({
  browser,
  baseURL,
}) => {
  const before = await readProfile(member.id);
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  await openEditor(page);

  // The consequences are on the page before the field that causes them.
  const handleSection = page.locator("#public-handle-editor");
  await expect(handleSection).toContainText("Що зміниться");
  await expect(handleSection).toContainText(
    "Посилання на ваші записи й об’єкти за старою адресою переспрямують на нову.",
  );

  const field = page.locator("#public-handle-candidate");
  await field.fill(other.handle);
  await page.getByRole("button", { name: "Змінити адресу" }).click();
  // The handle's own status, as an alert (Next's route announcer is one too).
  const status = page.locator("#public-handle-status");
  await expect(status).toHaveAttribute("role", "alert");
  await expect(status).toHaveText("Цей нік недоступний. Спробуйте інший.");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveValue(other.handle);

  await field.fill("a!");
  await page.getByRole("button", { name: "Змінити адресу" }).click();
  await expect(status).toContainText("Нік має містити від 3 до 30");
  await expect(field).toHaveValue("a!");

  expect((await readProfile(member.id)).handle).toBe(before.handle);
  await context.close();
});

test("the account's settings: language, the blocked list and your data", async ({
  browser,
  baseURL,
}) => {
  await pool.query(
    `insert into profile_blocks (blocker_user_id, blocked_user_id, block_state)
     values ($1::uuid, $2::uuid, 'active')`,
    [member.id, other.id],
  );
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  const response = await page.goto("/account/settings");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1:visible")).toHaveText("Налаштування");
  await waitForHydration(page.locator("[data-interface-language-setting]"));

  // The blocked list, and its undo — which answers where it was pressed.
  const blocked = page.locator("#blocked-profiles");
  await expect(blocked).toContainText("Сусідка Марта");
  await Promise.all([
    page.waitForURL(/relationshipStatus=unblocked/u),
    blocked
      .getByRole("button", { name: "Розблокувати, Сусідка Марта" })
      .click(),
  ]);
  await expect(blocked.getByRole("status")).toHaveText("Профіль розблоковано.");
  await expect(blocked).toContainText("Заблокованих профілів немає.");
  const state = await pool.query<{ block_state: string }>(
    "select block_state from profile_blocks where blocker_user_id = $1::uuid",
    [member.id],
  );
  expect(state.rows.map((row) => row.block_state)).not.toContain("active");

  // Data and deletion, and what the request does.
  await expect(page.locator("#account-data")).toContainText(
    "сам запит нічого не видаляє",
  );

  // The language, in place: the page answers in the one chosen.
  await page.getByRole("button", { name: "Български" }).click();
  await expect(page.locator("h1:visible")).toHaveText("Настройки");
  await expect(page.getByRole("button", { name: "Български" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Let the buttons' colour transition finish, so the picture is the state.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(SCREENSHOTS, "account-settings-bg-1440.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Українська" }).click();
  await expect(page.locator("h1:visible")).toHaveText("Налаштування");
  await context.close();
});

test("sign-in and security: the methods and the way out, and nothing public", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  const response = await page.goto("/account/security");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1:visible")).toHaveText("Вхід і безпека");
  await expect(page.getByTestId("account-methods-panel")).toBeVisible();
  await expect(page.locator('[data-sign-out-control="profile"]')).toBeVisible();
  await expect(page.locator('input[name="displayName"]')).toHaveCount(0);
  await page.screenshot({
    path: path.join(SCREENSHOTS, "account-security-1440.png"),
    fullPage: true,
  });
  await context.close();
});

test("the menu offers the account's pages to a member, and the owner's tools only to the owner", async ({
  browser,
  baseURL,
}) => {
  const openMenu = async (page: Page) => {
    await page.goto("/garden");
    const trigger = page.locator(
      '[data-site-shell-account-menu-trigger="true"]:visible',
    );
    await waitForHydration(trigger);
    await trigger.click();
    return page.locator('[data-site-shell-account-menu="true"]');
  };

  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  const menu = await openMenu(page);
  const settings = menu.locator('[data-site-shell-account-settings="true"]');
  await expect(settings.locator("a")).toHaveText([
    "Налаштування",
    "Вхід і безпека",
    "Приватність",
    "Видалення даних",
  ]);
  await expect(
    menu.locator('[data-site-shell-operator-menu="true"]'),
  ).toHaveCount(0);
  await context.close();

  const ownerContext = await browser.newContext();
  await ownerContext.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL! },
  ]);
  await signInOwnerFixture({
    request: ownerContext.request,
    baseURL: baseURL!,
  });
  const ownerPage = await ownerContext.newPage();
  await ownerPage.setViewportSize(DESKTOP);
  const ownerMenu = await openMenu(ownerPage);
  // The same menu with one more group — not another design.
  await expect(
    ownerMenu.locator('[data-site-shell-account-settings="true"] a'),
  ).toHaveText([
    "Налаштування",
    "Вхід і безпека",
    "Приватність",
    "Видалення даних",
  ]);
  await expect(
    ownerMenu.locator('[data-site-shell-operator-menu="true"]'),
  ).toHaveCount(1);
  await ownerContext.close();
});

test("a rename moves the gardener's work, as the page promised", async ({
  browser,
  baseURL,
}) => {
  const oldHandle = member.handle;
  const newHandle = `ove503_${randomUUID().replace(/-/gu, "").slice(0, 10)}`;
  const entry = await pool.query<{ n: number }>(
    "select author_entry_number as n from journal_entries where owner_user_id = $1::uuid",
    [member.id],
  );
  const entryNumber = entry.rows[0]!.n;

  const { context, page } = await memberPage(browser, baseURL!);
  await page.setViewportSize(DESKTOP);
  await openEditor(page);
  await page.locator("#public-handle-candidate").fill(newHandle);
  await page.getByRole("button", { name: "Змінити адресу" }).click();
  await expect(page.locator("#public-handle-status")).toContainText(
    "Адресу змінено.",
  );
  await expect(page.locator("#public-handle-editor")).toContainText(
    `over.garden/@${newHandle}`,
  );
  member.handle = newHandle;

  // The entry's old address answers one 308, straight to the new one.
  const moved = await page.request.get(`/@${oldHandle}/post/${entryNumber}`, {
    maxRedirects: 0,
    headers: { accept: "text/html" },
  });
  expect(moved.status()).toBe(308);
  expect(moved.headers()["location"]).toMatch(
    new RegExp(`/@${newHandle}/post/${entryNumber}$`, "u"),
  );
  const landed = await page.goto(`/@${oldHandle}/post/${entryNumber}`);
  expect(landed?.status()).toBe(200);
  expect(page.url()).toContain(`/@${newHandle}/post/${entryNumber}`);
  // The old profile is a tombstone; the new one answers.
  const gone = await page.request.get(`/@${oldHandle}`, {
    maxRedirects: 0,
    headers: { accept: "text/html" },
  });
  expect(gone.status()).toBe(410);
  const live = await page.request.get(`/@${newHandle}`, {
    headers: { accept: "text/html" },
  });
  expect(live.status()).toBe(200);
  await context.close();
});

test("at 320 px, in every language, the three pages reflow and axe finds nothing", async ({
  browser,
  baseURL,
}, testInfo) => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    const { context, page } = await memberPage(browser, baseURL!, locale);
    await page.setViewportSize(NARROW);
    for (const address of [
      "/garden/profile",
      "/account/settings",
      "/account/security",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), `${locale} ${address}`).toBe(200);
      await expect(page.locator("h1:visible")).toBeVisible();
      await expectReflow(page);
      await scanAccessibility(
        page,
        testInfo,
        `${locale}${address.replaceAll("/", "-")}-320`,
      );
      if (locale !== "uk") {
        await page.screenshot({
          path: path.join(
            SCREENSHOTS,
            `${address.split("/").at(-1)}-${locale}-320.png`,
          ),
          fullPage: true,
        });
      }
    }
    await context.close();
  }
});

test("a signed-out reader is asked to sign in and brought back", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL! },
  ]);
  const page = await context.newPage();
  for (const address of ["/account/settings", "/account/security"]) {
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(200);
    const signIn = page
      .locator('[data-sign-in-prompt="true"]:visible a[href*="/auth/sign-in"]')
      .first();
    await expect(signIn).toHaveAttribute(
      "href",
      new RegExp(`next=${encodeURIComponent(address)}`, "u"),
    );
  }
  await context.close();
});
