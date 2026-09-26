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
import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import { expireSyntheticSession } from "./helpers/redesign-fixtures";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";
import { postPastRateLimit } from "./helpers/auth-rate-limit";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * Bookmarks (`OVE-502`), the one shelf since the wishlist was retired
 * (ADR-0033).
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=saved-shelves.spec.ts
 *
 * One ordinary member has saved thirteen of another gardener's entries, that
 * gardener's tomato passport, and one entry its author has since withdrawn. A
 * second member has saved nothing. What this proves, against a production
 * build and the local database:
 *
 * - **Nothing saved is one way out, and no filters.** The chips that could
 *   only ever show nothing are gone from an empty shelf.
 * - **The shelf has one name**, the same in the account menu, the page title
 *   and the sign-in prompt, in UK, BG and RU; the retired wishlist's address
 *   is a real 404.
 * - **A saved entry reads as a post** and opens with the way back: the entry's
 *   return link names Bookmarks and lands on the same filter and page.
 * - **A removal the database refuses stays on the shelf** and says so beside
 *   its row — pressed from the keyboard — and the retry removes it with its
 *   name, and Undo puts it back. The database is read back each time.
 * - **What is no longer public stays and can be removed**; an ended session
 *   sends the removal to sign-in and back, and writes nothing.
 * - Every form has a real endpoint before the bundle runs, and axe finds
 *   nothing at 375 px or 1440 px.
 */

const PREFIX = "ove502";
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
  "ove-502",
);
const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 375, height: 812 } as const;
const SAVED_ENTRIES = 13;

test.describe.configure({ mode: "serial" });

let pool: Pool;
let fixture: OrganismFixture;
let member: SyntheticGardener;
let empty: SyntheticGardener;
let author: SyntheticGardener;
const accounts: string[] = [];
let passwordHash: Promise<string> | null = null;
let memberCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let emptyCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
/** The author's entries, newest first, as the shelf lists them. */
let entries: Array<{ id: string; title: string }> = [];
let goneEntryId: string;
let passportId: string;
let failTrigger: string | null = null;

test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  fixture = await seedOrganismFixture(pool, PREFIX);
  member = await account(`${PREFIX}-member`);
  empty = await account(`${PREFIX}-empty`);
  author = await account(`${PREFIX}-author`);
  await seedShelves();

  for (const [gardener, assign] of [
    [member, (cookies: typeof memberCookies) => (memberCookies = cookies)],
    [empty, (cookies: typeof memberCookies) => (emptyCookies = cookies)],
  ] as const) {
    const context = await browser.newContext();
    try {
      await signIn(context, baseURL, gardener);
      assign(await context.cookies(baseURL));
    } finally {
      await context.close();
    }
  }
});

test.afterAll(async () => {
  if (failTrigger) await dropFailingWrites().catch(() => undefined);
  for (const id of accounts) {
    for (const [table, column] of [
      ["engagement_bookmarks", "owner_user_id"],
      ["journal_entries", "owner_user_id"],
      ["plant_objects", "owner_user_id"],
      ["spaces", "owner_user_id"],
    ] as const) {
      await pool.query(`delete from ${table} where ${column} = $1::uuid`, [id]);
    }
    await removeSyntheticGardener(pool, id);
  }
  await cleanupOrganismFixture(pool, fixture).catch(() => undefined);
  await pool.end();
});

test("an empty shelf has one way out and no filter chips", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await signedContext(
    browser,
    baseURL!,
    emptyCookies,
    "uk",
    PHONE,
  );
  try {
    const page = await context.newPage();
    await page.goto("/bookmarks", { waitUntil: "load" });
    const surface = visibleSurface(page);
    await expect(surface.locator('[data-slot="empty-state"]')).toBeVisible();
    await expect(surface.locator("[data-bookmark-filters]")).toHaveCount(0);
    await expect(
      surface.getByRole("link", { name: "Знайти журнали" }),
    ).toHaveCount(1);
    await expectReflow(page);
    await scanAccessibility(page, testInfo, "bookmarks-empty-375");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "bookmarks-empty-uk-375.png"),
      fullPage: true,
    });

    // The wishlist is retired (ADR-0033): its address is a real 404 in every
    // language, decided before anything streams.
    for (const address of ["/wishlist", "/bg/wishlist", "/ru/wishlist"]) {
      const response = await page.request.get(address, { maxRedirects: 0 });
      expect(response.status(), address).toBe(404);
    }
  } finally {
    await context.close();
  }
});

test("the shelf has one name: the menu, the title and the sign-in say it alike, in three languages", async ({
  browser,
  baseURL,
}) => {
  for (const [locale, name] of [
    ["uk", "Закладки"],
    ["bg", "Отметки"],
    ["ru", "Закладки"],
  ] as const) {
    const prefix = locale === "uk" ? "" : `/${locale}`;
    const signedIn = await signedContext(
      browser,
      baseURL!,
      memberCookies,
      locale,
      DESKTOP,
    );
    const guest = await localeContext(browser, baseURL!, locale, DESKTOP);
    try {
      const page = await signedIn.newPage();
      await page.goto(`${prefix}/bookmarks`, { waitUntil: "load" });
      await expect(visibleSurface(page).locator("h1")).toHaveText(name);
      await page
        .locator("[data-site-shell-account-menu-trigger]:visible")
        .click();
      const menu = page.locator('[data-site-shell-account-menu="true"]');
      await expect(menu.locator(`a[href="${prefix}/bookmarks"]`)).toHaveText(
        name,
      );
      await expect(menu.locator(`a[href="${prefix}/wishlist"]`)).toHaveCount(0);

      const visitor = await guest.newPage();
      await visitor.goto(`${prefix}/bookmarks?kind=journal_entry`, {
        waitUntil: "load",
      });
      const prompt = visitor.locator("[data-sign-in-prompt]:visible");
      await expect(prompt).toContainText(new RegExp(name, "iu"));
      // The guest's way in keeps the view they asked for.
      const next = new URL(
        (await prompt
          .locator('a[href^="/auth/sign-in"]')
          .first()
          .getAttribute("href"))!,
        baseURL,
      ).searchParams.get("next");
      expect(next).toBe(`${prefix}/bookmarks?kind=journal_entry`);
    } finally {
      await signedIn.close();
      await guest.close();
    }
  }
});

test("a saved entry reads as a post and opens with the way back to the same page of the shelf", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await signedContext(
    browser,
    baseURL!,
    memberCookies,
    "uk",
    DESKTOP,
  );
  try {
    const page = await context.newPage();
    await page.goto("/bookmarks", { waitUntil: "load" });
    const shelf = page.locator('[data-saved-shelf="bookmarks"]');
    await expect(shelf).toBeVisible();
    // Thirteen entries, the passport and the withdrawn one: fifteen, in one
    // portion of twenty (`OVE-518`), so no «Показати ще».
    await expect(page.locator("[data-my-social-count]")).toHaveAttribute(
      "data-my-social-count",
      "15",
    );
    await expect(shelf.locator(":scope > li")).toHaveCount(15);
    await expect(
      shelf.locator('li[data-saved-item="journal_entry"] article'),
    ).toHaveCount(13);
    await expect(page.locator("[data-show-more-link]")).toHaveCount(0);
    await scanAccessibility(page, testInfo, "bookmarks-many-1440");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "bookmarks-many-uk-1440.png"),
      fullPage: true,
    });

    await page.goto("/bookmarks?kind=journal_entry", {
      waitUntil: "load",
    });
    await expect(shelf).toBeVisible();
    const card = shelf
      .locator(
        'li[data-saved-item="journal_entry"][data-saved-available="true"]',
      )
      .first();
    const link = card.locator('article a[href*="from="]').first();
    const href = (await link.getAttribute("href"))!;
    expect(new URL(href, baseURL).searchParams.get("from")).toBe(
      "/bookmarks?kind=journal_entry",
    );
    await link.click();
    await page.waitForURL((target) => target.searchParams.has("from"));
    const back = page.locator('[data-return-link="true"]:visible');
    await expect(back).toHaveText("Закладки");
    await expect(back).toHaveAttribute(
      "href",
      "/bookmarks?kind=journal_entry",
    );
    await back.click();
    await page.waitForURL(
      (target) =>
        target.pathname === "/bookmarks" &&
        target.searchParams.get("kind") === "journal_entry",
    );
    // The thirteen entries and the withdrawn one: the filtered shelf.
    await expect(
      page.locator('[data-saved-shelf="bookmarks"]:visible > li'),
    ).toHaveCount(14);

    await page.setViewportSize(PHONE);
    await page.goto("/bookmarks", { waitUntil: "load" });
    await expect(shelf).toBeVisible();
    await expectReflow(page);
    await scanAccessibility(page, testInfo, "bookmarks-many-375");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "bookmarks-many-uk-375.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("a removal the database refuses stays on the shelf and says so; the retry names what it removed, and Undo puts it back", async ({
  browser,
  baseURL,
}) => {
  const context = await signedContext(
    browser,
    baseURL!,
    memberCookies,
    "uk",
    DESKTOP,
  );
  try {
    const page = await context.newPage();
    const [first] = entries;
    await page.goto("/bookmarks", { waitUntil: "load" });
    const row = () => page.locator(`#saved-journal_entry-${first!.id}`);
    const remove = () =>
      row().getByRole("button", {
        name: `Прибрати із закладок: ${first!.title}`,
      });
    await waitForHydration(remove());

    await installFailingWrites();
    // From the keyboard: the button is reached and pressed with Enter.
    await remove().focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/outcome=failed/u);
    await expect(row().locator('[data-shelf-outcome="failed"]')).toHaveText(
      "Не вдалося прибрати, закладка лишилася. Спробуйте ще раз.",
    );
    expect(await bookmarkState(first!.id)).toBe("active");
    await expect(page.locator("[data-my-social-count]")).toHaveAttribute(
      "data-my-social-count",
      "15",
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "bookmarks-remove-failed-uk-1440.png"),
      fullPage: true,
    });

    await dropFailingWrites();
    await waitForHydration(remove());
    await remove().focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/outcome=removed/u);
    const notice = page.locator('[data-shelf-notice="true"]');
    await expect(notice).toContainText(
      `«${first!.title}» прибрано із закладок`,
    );
    expect(await bookmarkState(first!.id)).toBe("removed");
    await expect(row()).toHaveCount(0);

    const undo = notice.getByRole("button", { name: "Повернути" });
    await waitForHydration(undo);
    await undo.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/outcome=restored/u);
    await expect(page.locator('[data-shelf-notice="true"]')).toContainText(
      `«${first!.title}» повернуто до закладок`,
    );
    await expect(row()).toBeVisible();
    expect(await bookmarkState(first!.id)).toBe("active");
  } finally {
    await context.close();
  }
});

test("what is no longer public stays on the shelf, says why, and can still be removed", async ({
  browser,
  baseURL,
}) => {
  const context = await signedContext(
    browser,
    baseURL!,
    memberCookies,
    "uk",
    DESKTOP,
  );
  try {
    const page = await context.newPage();
    await page.goto("/bookmarks?kind=journal_entry", {
      waitUntil: "load",
    });
    const gone = page.locator(`#saved-journal_entry-${goneEntryId}`);
    await expect(gone).toHaveAttribute("data-saved-available", "false");
    await expect(gone).toContainText("Більше недоступно");
    await expect(gone).toContainText(
      "Цей запис прибрали, або автор більше не показує його публічно.",
    );
    // Without a public name, the button says what it was and when it was
    // saved, so two withdrawn entries are two different buttons.
    const remove = gone.getByRole("button", {
      name: /^Прибрати із закладок: Більше недоступно · Записи · Збережено /u,
    });
    await waitForHydration(remove);
    await remove.click();
    await page.waitForURL(/outcome=removed/u);
    // It has no public name any more, so the notice does not invent one —
    // and offers no Undo, which could only fail.
    const goneNotice = page.locator('[data-shelf-notice="true"]');
    await expect(goneNotice).toContainText("Прибрано із закладок");
    await expect(
      goneNotice.getByRole("button", { name: "Повернути" }),
    ).toHaveCount(0);
    expect(await bookmarkState(goneEntryId)).toBe("removed");
  } finally {
    await context.close();
  }
});

test("before the bundle runs, every shelf form posts to a real endpoint", async ({
  browser,
  baseURL,
}) => {
  const context = await signedContext(
    browser,
    baseURL!,
    memberCookies,
    "uk",
    DESKTOP,
    {
      javaScriptEnabled: false,
    },
  );
  try {
    const page = await context.newPage();
    for (const address of ["/bookmarks"]) {
      await page.goto(address, { waitUntil: "load" });
      const forms = await page.evaluate(() =>
        // Every form: with scripts off the shelf is still in the streamed,
        // hidden segment, outside `main`, where the bundle would move it from.
        [...document.querySelectorAll("form")].map((form) => ({
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

test("an ended session sends a removal to sign-in and back to the shelf, and writes nothing", async ({
  browser,
  baseURL,
}) => {
  const context = await signedContext(
    browser,
    baseURL!,
    memberCookies,
    "uk",
    DESKTOP,
  );
  try {
    const page = await context.newPage();
    const saved = entries[1]!;
    await page.goto("/bookmarks", { waitUntil: "load" });
    const row = page.locator(`#saved-journal_entry-${saved.id}`);
    const remove = row.getByRole("button", {
      name: `Прибрати із закладок: ${saved.title}`,
    });
    await waitForHydration(remove);
    await expireSyntheticSession(pool, context, member.id);

    await remove.click();
    await page.waitForURL(/\/auth\/sign-in/u);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/bookmarks");
    expect(await bookmarkState(saved.id)).toBe("active");

    await signInOnScreen(page, member);
    await page.waitForURL((target) => target.pathname === "/bookmarks", {
      timeout: 30_000,
    });
    await expect(row).toBeVisible();
  } finally {
    await context.close();
  }
});

// -- fixtures ---------------------------------------------------------------

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

/**
 * The author's tomato and fourteen entries about it; the member saves every
 * one, the passport, and — after its author withdraws it — the fourteenth.
 */
async function seedShelves() {
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Теплиця')
     returning id::text id`,
    [author.id],
  );
  const object = await pool.query<{ id: string }>(
    `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
     values ($1::uuid, $2::uuid, 'Томат', 'plant') returning id::text id`,
    [author.id, space.rows[0]!.id],
  );
  passportId = object.rows[0]!.id;
  const created: Array<{ id: string; title: string }> = [];
  for (let index = 0; index <= SAVED_ENTRIES; index += 1) {
    const title = `Томат, день ${index + 1}`;
    const row = await pool.query<{ id: string }>(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, $4, 'Нові листки на верхівці.',
               $5, $6, now() - make_interval(days => $7::int),
               current_date - $7::int, 'uk', 'public', 'active', 'real_ugc',
               'object')
       returning id::text id`,
      [
        author.id,
        space.rows[0]!.id,
        passportId,
        title,
        randomUUID(),
        `${PREFIX}-${randomUUID().slice(0, 8)}`,
        SAVED_ENTRIES - index,
      ],
    );
    created.push({ id: row.rows[0]!.id, title });
  }
  // Saved in order, so the newest save is the last entry.
  for (const [index, entry] of created.entries()) {
    await pool.query(
      `insert into engagement_bookmarks
         (owner_user_id, target_kind, target_ref, created_at, updated_at)
       values ($1::uuid, 'journal_entry', $2, now() - make_interval(mins => $3::int),
               now() - make_interval(mins => $3::int))`,
      [member.id, entry.id, 100 - index],
    );
  }
  await pool.query(
    `insert into engagement_bookmarks
       (owner_user_id, target_kind, target_ref, created_at, updated_at)
     values ($1::uuid, 'lineage_object', $2, now() - interval '200 minutes',
             now() - interval '200 minutes')`,
    [member.id, passportId],
  );
  // The oldest save is withdrawn by its author: still saved, not public.
  const gone = created[0]!;
  goneEntryId = gone.id;
  await pool.query(
    `update journal_entries set public_gone_at = now() where id = $1::uuid`,
    [gone.id],
  );
  entries = created.slice(1).reverse();
}

async function bookmarkState(entryId: string) {
  const row = await pool.query<{ state: string }>(
    `select bookmark_state as state from engagement_bookmarks
      where owner_user_id = $1::uuid and target_kind = 'journal_entry'
        and target_ref = $2`,
    [member.id, entryId],
  );
  return row.rows[0]?.state ?? null;
}

/** Every bookmark write for the member fails, as a refused write would. */
async function installFailingWrites() {
  failTrigger = `${PREFIX}_fail_${randomUUID().slice(0, 8)}`;
  await pool.query(
    `create function ${failTrigger}() returns trigger language plpgsql as $$
     begin raise exception 'ove502 shelf fault'; end $$`,
  );
  await pool.query(
    `create trigger ${failTrigger} before insert or update on engagement_bookmarks
     for each row when (new.owner_user_id = '${member.id}'::uuid)
     execute function ${failTrigger}()`,
  );
}

async function dropFailingWrites() {
  if (!failTrigger) return;
  await pool.query(
    `drop trigger if exists ${failTrigger} on engagement_bookmarks`,
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

async function signedContext(
  browser: Browser,
  baseURL: string,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
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
  await context.addCookies(cookies);
  return context;
}

/** One sign-in per gardener; Better Auth's limiter answers 429 to a flurry. */
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

/** The personal page itself, not its loading frame or a hidden page before it. */
function visibleSurface(page: Page) {
  return page.locator(
    '[data-my-social-surface]:not([data-state="loading"]):visible',
  );
}
