import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Browser, type Page } from "playwright/test";
import { Pool } from "pg";

import { hashPassword } from "better-auth/crypto";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { mintAuthIntentToken } from "./helpers/auth-intent-token";
import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * `OVE-504`: the four authentication screens, and a guest's action carried
 * through them to the thing they pressed.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=auth-intent.spec.ts
 *
 * Every sign-in here goes through the *screen* — the Server Action a reader's
 * browser posts — never through the API, because the screen is what changed.
 * The gardeners are synthetic, written straight into the local database and
 * removed at the end; nothing leaves it.
 */

const PREFIX = "ove504";
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
  "ove-504",
);

let pool: Pool;
const gardeners: string[] = [];
const entries: PublishedEntryFixture[] = [];

test.beforeAll(() => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.afterAll(async () => {
  for (const entry of entries) await cleanupPublishedEntryFixture(pool, entry);
  for (const id of gardeners) {
    for (const [table, column] of [
      ["engagement_bookmarks", "owner_user_id"],
      ["engagement_follows", "follower_user_id"],
      ["community_memberships", "user_id"],
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

async function guestContext(
  browser: Browser,
  baseURL: string,
  locale: "uk" | "bg" | "ru" = "uk",
  options: { javaScriptEnabled?: boolean } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...options,
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "bg" ? "bulgaria" : "ukraine",
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

let passwordHash: Promise<string> | null = null;

/**
 * An account with a password, written the way the owner fixture writes one
 * (`scripts/seed-browser-owner-fixture.ts`): the `user` row, whose insert
 * claims a handle, and a credential with Better Auth's own hash.
 *
 * Not through the sign-up endpoint, because that endpoint is rate-limited per
 * window across the whole gate, and this file needs a dozen gardeners. The
 * full gate's first run lost one of them to a `429` four times over. Every
 * *sign-in* here still goes through the screen.
 */
async function account(_browser: Browser, _baseURL: string, prefix: string) {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${prefix}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  await acceptLegalDocuments(pool, id);
  gardeners.push(id);
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
  return { id, email, handle } satisfies SyntheticGardener;
}

function credentialForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') });
}

/** Signs in the way a reader does: the screen, its fields, its button. */
async function signInOnScreen(
  page: Page,
  gardener: SyntheticGardener,
  password = SYNTHETIC_GARDENER_PASSWORD,
) {
  const form = credentialForm(page);
  await waitForHydration(form.locator('button[type="submit"]'));
  await form.locator('input[name="email"]').fill(gardener.email);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
}

async function focusedIntentControl(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      control: active?.getAttribute("data-auth-intent-control") ?? null,
      ref: active?.getAttribute("data-auth-intent-control-ref") ?? null,
    };
  });
}

test.describe("a guest's action, through sign-in, to the thing they pressed", () => {
  test("save an entry: the screen says why, signing in lands on the control, and saving it is recorded", async ({
    browser,
    baseURL,
  }) => {
    const entry = await seedPublishedEntryFixture(pool, `${PREFIX}-save`);
    entries.push(entry);
    const reader = await account(browser, baseURL!, `${PREFIX}-reader`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();

    await page.goto(entry.entryPath, { waitUntil: "load" });
    const trigger = page
      .locator('[data-auth-intent-control="bookmark"]:visible')
      .first();
    await waitForHydration(trigger);
    await trigger.click();

    // The one screen, saying which action it is for and that it comes back.
    await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get("intent")).toBe("bookmark");
    expect(url.searchParams.get("next")).toMatch(
      /^\/auth\/intent\/resume\?intent=/u,
    );
    await expect(page.locator("h1:visible")).toHaveText(
      "Увійдіть, щоб додати до закладок",
    );
    await expect(page.locator("main[data-auth-frame]")).toContainText(
      "Після входу ви повернетеся туди, де були",
    );
    // "Back to reading" is the entry, not the resume route.
    await expect(page.locator('[data-auth-cancel="true"]')).toHaveAttribute(
      "href",
      entry.entryPath,
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "sign-in-intent-1280.png"),
    });

    await signInOnScreen(page, reader);
    await page.waitForURL(
      (target) =>
        target.pathname === entry.entryPath &&
        target.searchParams.get("authIntent") === "bookmark",
      { timeout: 25_000 },
    );
    await expect(
      page.locator('[data-auth-intent-resumed="bookmark"]:visible'),
    ).toHaveCount(1, { timeout: 20_000 });
    await expect(
      page.locator('[data-site-shell-action="sign-in"]:visible'),
    ).toHaveCount(0);

    // The control the reader pressed, focused: a browser skips `autofocus`
    // on an address with a fragment, so this is the page's own doing.
    const save = page.locator("#engagement-bookmark");
    await waitForHydration(save);
    await expect(save).toBeFocused({ timeout: 20_000 });
    await expect(save).toHaveAccessibleName("Зберегти");
    await save.click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              `select count(*)::int as n from engagement_bookmarks
                where owner_user_id = $1::uuid and target_ref = $2
                  and bookmark_state = 'active'`,
              [reader.id, entry.entryId],
            )
          ).rows[0]!.n,
        { timeout: 20_000 },
      )
      .toBe(1);
    await context.close();
  });

  test("join a community: the control is focused on return, and joining is recorded", async ({
    browser,
    baseURL,
  }) => {
    const community = await pool.query<{ id: string; slug: string }>(
      `select id::text id, slug from communities
        where lifecycle_state = 'active' and participation_state = 'open'
        order by slug limit 1`,
    );
    const { id: communityId, slug } = community.rows[0]!;
    const member = await account(browser, baseURL!, `${PREFIX}-community`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();

    await page.goto(`/communities/${slug}`, { waitUntil: "load" });
    const trigger = page
      .locator(
        '[data-auth-intent-control="follow"][data-auth-intent-control-ref="community-membership"]:visible',
      )
      .first();
    await waitForHydration(trigger);
    await trigger.click();
    await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });

    // Switching to sign-up and back keeps where the reader is going.
    const switchTo = page.locator('[data-auth-mode-switch="true"] a');
    const next = new URL(page.url()).searchParams.get("next");
    for (const href of await switchTo.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    )) {
      expect(new URL(href, baseURL).searchParams.get("next")).toBe(next);
    }

    await signInOnScreen(page, member);
    await page.waitForURL(
      (target) =>
        target.pathname === `/communities/${slug}` &&
        target.searchParams.get("authControl") === "community-membership",
      { timeout: 25_000 },
    );
    await expect
      .poll(() => focusedIntentControl(page), { timeout: 20_000 })
      .toEqual({ control: "follow", ref: "community-membership" });

    await page.keyboard.press("Enter");
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              `select membership_state from community_memberships
                where community_id = $1::uuid and user_id = $2::uuid`,
              [communityId, member.id],
            )
          ).rows[0]?.membership_state ?? null,
        { timeout: 20_000 },
      )
      .toBe("active");
    await context.close();
  });

  test("follow an object's passport: signing in returns to it, and the follow is recorded", async ({
    browser,
    baseURL,
  }) => {
    const entry = await seedPublishedEntryFixture(pool, `${PREFIX}-object`);
    entries.push(entry);
    const object = await pool.query<{ id: string }>(
      `select plant_object_id::text as id from journal_entries where id = $1::uuid`,
      [entry.entryId],
    );
    const objectId = object.rows[0]!.id;
    const objectSlug = `${PREFIX}-object-${randomUUID().slice(0, 8)}`;
    await pool.query(
      `update plant_objects set public_slug = $2 where id = $1::uuid`,
      [objectId, objectSlug],
    );
    const passportPath = `/@${entry.handle}/objects/${objectSlug}`;
    const follower = await account(browser, baseURL!, `${PREFIX}-follower`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();

    const response = await page.goto(passportPath, { waitUntil: "load" });
    expect(response?.status(), passportPath).toBe(200);
    const trigger = page
      .locator('#comments [data-auth-intent-control="follow"]:visible')
      .first();
    await waitForHydration(trigger);
    await trigger.click();
    await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });
    await expect(page.locator("h1:visible")).toHaveText(
      "Увійдіть, щоб стежити за оновленнями",
    );

    await signInOnScreen(page, follower);
    await page.waitForURL(
      (target) =>
        target.pathname === passportPath &&
        target.searchParams.get("authIntent") === "follow",
      { timeout: 25_000 },
    );
    const follow = page.locator("#lineage-follow");
    await waitForHydration(follow);
    await expect(follow).toBeFocused({ timeout: 20_000 });
    await follow.click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              `select count(*)::int as n from engagement_follows
                where follower_user_id = $1::uuid and follow_state = 'active'`,
              [follower.id],
            )
          ).rows[0]!.n,
        { timeout: 20_000 },
      )
      .toBe(1);
    await context.close();
  });

  test("a space asked for while signed out comes back after signing in, and another member's is refused", async ({
    browser,
    baseURL,
  }) => {
    const owner = await account(browser, baseURL!, `${PREFIX}-space-owner`);
    const stranger = await account(browser, baseURL!, `${PREFIX}-stranger`);
    const spaceId = randomUUID();
    const spaceName = `${PREFIX} балкон ${spaceId.slice(0, 6)}`;
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)`,
      [spaceId, owner.id, spaceName],
    );

    // The owner, signed out, opens their own space from a bookmark.
    const ownerContext = await guestContext(browser, baseURL!);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`/garden/spaces/${spaceId}`, { waitUntil: "load" });
    const prompt = ownerPage.locator("[data-sign-in-prompt] a").first();
    await expect(prompt).toHaveAttribute(
      "href",
      `/auth/sign-in?next=${encodeURIComponent(`/garden/spaces/${spaceId}`)}`,
    );
    await prompt.click();
    await ownerPage.waitForURL(/\/auth\/sign-in\?/u);
    await signInOnScreen(ownerPage, owner);
    await ownerPage.waitForURL(
      (target) => target.pathname === `/garden/spaces/${spaceId}`,
      { timeout: 25_000 },
    );
    await expect(ownerPage.getByText(spaceName).first()).toBeVisible({
      timeout: 20_000,
    });
    await ownerContext.close();

    // Somebody else, sent to that address by a crafted link, gets nothing of it.
    const strangerContext = await guestContext(browser, baseURL!);
    const strangerPage = await strangerContext.newPage();
    await strangerPage.goto(
      `/auth/sign-in?next=${encodeURIComponent(`/garden/spaces/${spaceId}`)}`,
      { waitUntil: "load" },
    );
    await signInOnScreen(strangerPage, stranger);
    await strangerPage.waitForURL(
      (target) => target.pathname === `/garden/spaces/${spaceId}`,
      { timeout: 25_000 },
    );
    await expect(
      strangerPage.locator('[data-workspace-record="missing"]:visible'),
    ).toHaveCount(1, { timeout: 20_000 });
    expect(await strangerPage.content()).not.toContain(spaceName);
    await strangerContext.close();
  });

  test("the global Write action: signing in opens the composer", async ({
    browser,
    baseURL,
  }) => {
    const writer = await account(browser, baseURL!, `${PREFIX}-writer`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/journals", { waitUntil: "load" });
    const write = page
      .locator('[data-site-shell-action="new-entry"]:visible')
      .first();
    await waitForHydration(write);
    await write.click();
    await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });
    await expect(page.locator("h1:visible")).toHaveText(
      "Увійдіть, щоб додати оновлення",
    );
    await signInOnScreen(page, writer);
    await page.waitForURL(
      (target) =>
        target.pathname === "/garden/new" &&
        target.searchParams.get("authIntent") === "create_entry",
      { timeout: 25_000 },
    );
    await context.close();
  });
});

test.describe("what it refuses", () => {
  test("an off-origin return path is never followed, on the screen or after signing in", async ({
    browser,
    baseURL,
  }) => {
    const gardener = await account(browser, baseURL!, `${PREFIX}-redirect`);
    for (const hostile of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "/\\attacker.example/steal",
      "/%2F%2Fattacker.example",
    ]) {
      const context = await guestContext(browser, baseURL!);
      const page = await context.newPage();
      await page.goto(`/auth/sign-in?next=${encodeURIComponent(hostile)}`, {
        waitUntil: "load",
      });
      // Nothing on the screen points there: no link, no form, no carried
      // return path. (The address itself is in the router's payload, as any
      // page's own address is; it is what the screen does with it that counts.)
      const pointing = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "[href], form[action], input[name='next']",
          ),
        ]
          .map(
            (element) =>
              element.getAttribute("href") ??
              element.getAttribute("action") ??
              (element as HTMLInputElement).value,
          )
          .filter((value) => value.includes("attacker.example")),
      );
      expect(pointing, hostile).toEqual([]);
      await expect(
        credentialForm(page).locator('input[name="next"]'),
      ).toHaveValue("/garden");
      await signInOnScreen(page, gardener);
      await page.waitForURL(
        (target) =>
          target.origin === new URL(baseURL!).origin &&
          target.pathname === "/garden",
        { timeout: 25_000 },
      );
      await context.close();
    }

    // A held action pointed off-origin never gets a token at all.
    const context = await guestContext(browser, baseURL!);
    const response = await context.request.post("/auth/intent/start", {
      form: {
        action: "bookmark",
        returnTo: "https://attacker.example/steal",
        targetKind: "journal",
        targetRef: "first-public-harvest",
      },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("/auth/intent?state=invalid");
    const page = await context.newPage();
    await page.goto("/auth/intent?state=invalid", { waitUntil: "load" });
    await page.waitForURL((target) => target.pathname === "/auth/sign-in", {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("notice")).toBe(
      "intent-invalid",
    );
    await expect(
      page.locator('[data-auth-notice="intent-invalid"]'),
    ).toBeVisible();
    await context.close();
  });

  test("an expired action returns to its page without a loop, signed in or not", async ({
    browser,
    baseURL,
  }) => {
    const gardener = await account(browser, baseURL!, `${PREFIX}-expired`);
    const token = mintAuthIntentToken(
      {
        action: "bookmark",
        returnTo: "/journals",
        target: { kind: "journal", ref: "first-public-harvest" },
      },
      { issuedAt: Date.now() - 20 * 60_000 },
    );

    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    // The guest: the sign-in screen, for the page, saying the action is over.
    // (The route's redirect follows the streamed shell, so it lands after
    // `load`; wait for the address rather than read it.)
    await page.goto(`/auth/intent?intent=${encodeURIComponent(token)}`, {
      waitUntil: "load",
    });
    await page.waitForURL((target) => target.pathname === "/auth/sign-in", {
      timeout: 20_000,
    });
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe("/journals");
    expect(url.searchParams.get("notice")).toBe("intent-expired");
    await expect(
      page.locator('[data-auth-notice="intent-expired"]'),
    ).toBeVisible();
    await signInOnScreen(page, gardener);
    await page.waitForURL((target) => target.pathname === "/journals", {
      timeout: 25_000,
    });

    // Signed in now, the same stale token: to the page, not round a loop.
    // Every document request on the way is counted; a loop would never stop.
    let documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest()) documents += 1;
    });
    await page.goto(`/auth/intent/resume?intent=${encodeURIComponent(token)}`, {
      waitUntil: "load",
    });
    await page.waitForURL((target) => target.pathname === "/journals", {
      timeout: 20_000,
    });
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe("/journals");
    expect(documents).toBeLessThanOrEqual(4);
    await context.close();
  });
});

test.describe("each state its own", () => {
  test("already signed in: a state of its own, Continue goes on, and Back is not a trap", async ({
    browser,
    baseURL,
  }) => {
    const gardener = await account(browser, baseURL!, `${PREFIX}-signed-in`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/auth/sign-in?next=%2Fjournals", { waitUntil: "load" });
    await signInOnScreen(page, gardener);
    await page.waitForURL((target) => target.pathname === "/journals", {
      timeout: 25_000,
    });

    // Back lands on the screen, which no longer bounces forward.
    await page.goBack({ waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/auth/sign-in");
    await expect(
      page.locator('main[data-auth-frame="signed-in"]'),
    ).toBeVisible();
    await expect(page.locator("h1:visible")).toHaveText("Ви вже ввійшли");
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await expect(
      page.locator('[data-sign-out-control="profile"]:visible'),
    ).toHaveCount(1);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "signed-in-1280.png"),
    });
    await page.locator('[data-auth-continue="signed-in"]').click();
    await page.waitForURL((target) => target.pathname === "/journals");

    // An email-verification link lands here signed in, and says so.
    await page.goto("/auth/sign-in?next=%2Fjournals&verified=1", {
      waitUntil: "load",
    });
    await expect(page.locator("h1:visible")).toHaveText("Адресу підтверджено");
    await expect(
      page.locator('[data-auth-continue="verified"]'),
    ).toHaveAttribute("href", "/journals");
    await context.close();
  });

  test("a request that never comes back: the words stay, the screen says so, and a retry signs in", async ({
    browser,
    baseURL,
  }) => {
    const gardener = await account(browser, baseURL!, `${PREFIX}-transport`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/auth/sign-in?next=%2Fjournals", { waitUntil: "load" });

    // The Server Action is a POST to the page's own address.
    await page.route("**/auth/sign-in**", (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.fallback(),
    );
    await signInOnScreen(page, gardener);
    const lost = page.locator('[data-auth-message="transport"]');
    await expect(lost).toBeVisible({ timeout: 20_000 });
    await expect(lost).toHaveAttribute("role", "alert");
    // Still here, with what was typed.
    expect(new URL(page.url()).pathname).toBe("/auth/sign-in");
    const form = credentialForm(page);
    await expect(form.locator('input[name="email"]')).toHaveValue(
      gardener.email,
    );
    await expect(form.locator('input[name="password"]')).toHaveValue(
      SYNTHETIC_GARDENER_PASSWORD,
    );

    await page.unroute("**/auth/sign-in**");
    await form.locator('button[type="submit"]').click();
    await page.waitForURL((target) => target.pathname === "/journals", {
      timeout: 25_000,
    });
    await context.close();
  });

  test("pending: the button is busy, says so, and the answer replaces it", async ({
    browser,
    baseURL,
  }) => {
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    await page.route("**/auth/sign-in**", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts += 1;
      await held;
      await route.continue();
    });

    const form = credentialForm(page);
    await waitForHydration(form.locator('button[type="submit"]'));
    await form
      .locator('input[name="email"]')
      .fill(`${PREFIX}-nobody@example.test`);
    await form.locator('input[name="password"]').fill("not-the-password-1");
    const submit = form.locator('button[type="submit"]');
    await submit.click();

    await expect(submit).toHaveAttribute("aria-busy", "true");
    await expect(form.locator('[data-auth-progress="pending"]')).toHaveText(
      "Входимо…",
    );
    // A second press while one is on its way posts nothing more.
    await submit.click();
    await page.waitForTimeout(300);
    expect(posts).toBe(1);

    release();
    const refused = page.locator('[data-auth-message="error"]');
    await expect(refused).toBeVisible({ timeout: 20_000 });
    await expect(submit).not.toHaveAttribute("aria-busy", "true");
    // A refusal keeps the address, so recovering is one field, not two.
    await expect(form.locator('input[name="email"]')).toHaveValue(
      `${PREFIX}-nobody@example.test`,
    );
    await expect(form.locator('input[name="email"]')).toBeFocused();
    await context.close();
  });

  test("a provider refusal, an expired verification link and a finished reset each say their own thing", async ({
    browser,
    baseURL,
  }) => {
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();

    await page.goto("/auth/sign-in?next=%2Fjournals&error=account_not_linked", {
      waitUntil: "load",
    });
    const provider = page.locator('[data-auth-message="provider"]');
    await expect(provider).toContainText("OverGarden");
    await expect(provider).not.toContainText("account_not_linked");
    // The field that takes focus reads it out.
    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "aria-describedby",
      "auth-provider-error",
    );

    await page.goto(
      "/auth/sign-in?next=%2Fjournals&verified=1&error=TOKEN_EXPIRED",
      {
        waitUntil: "load",
      },
    );
    await expect(
      page.locator('[data-auth-notice="verification-expired"]'),
    ).toBeVisible();
    await expect(page.locator('[data-auth-message="provider"]')).toHaveCount(0);

    await page.goto("/auth/sign-in?notice=password-reset", {
      waitUntil: "load",
    });
    await expect(
      page.locator('[data-auth-notice="password-reset"]'),
    ).toHaveAttribute("data-tone", "success");
    await context.close();
  });

  test("a reset link: refused has its own state, a bogus token is refused in the form, and help answers without JavaScript", async ({
    browser,
    baseURL,
  }) => {
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();

    await page.goto("/auth/reset-password?error=INVALID_TOKEN", {
      waitUntil: "load",
    });
    await expect(
      page.locator('[data-reset-link-state="expired"]'),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole("link", { name: "Надіслати нове посилання" }).click();
    await page.waitForURL((target) => target.pathname === "/auth/help");
    await expect(page.locator("#password-reset")).toBeVisible();

    await page.goto("/auth/reset-password?token=not-a-real-token", {
      waitUntil: "load",
    });
    const passwords = page.locator('input[type="password"]');
    await waitForHydration(page.locator('button[type="submit"]').first());
    await passwords.nth(0).fill("OVE504-a-new-password-1");
    await passwords.nth(1).fill("OVE504-a-new-password-1");
    await page.locator('main button[type="submit"]').click();
    const refused = page.locator('[data-auth-message="expired"]');
    await expect(refused).toBeVisible({ timeout: 20_000 });
    await expect(refused.getByRole("link")).toHaveAttribute(
      "href",
      "/auth/help#password-reset",
    );
    await context.close();

    // The request form posts to its own page (a Server Action), not to the
    // auth API from the browser, and answers every address with one sentence.
    const helpContext = await guestContext(browser, baseURL!);
    const help = await helpContext.newPage();
    const posts: string[] = [];
    help.on("request", (request) => {
      if (request.method() === "POST")
        posts.push(new URL(request.url()).pathname);
    });
    await help.goto("/auth/help", { waitUntil: "load" });
    const request = help.locator("#password-reset");
    await waitForHydration(request.locator('button[type="submit"]'));
    await request
      .locator('input[name="email"]')
      .fill(`${PREFIX}-nobody-${randomUUID().slice(0, 6)}@example.test`);
    await request.locator('button[type="submit"]').click();
    const sent = help.locator('[data-auth-message="sent"]');
    await expect(sent).toBeVisible({ timeout: 20_000 });
    await expect(sent).toHaveAttribute("role", "status");
    expect(posts).toEqual(["/auth/help"]);
    await helpContext.close();
  });
});

test.describe("writing survives a sign-in in another tab", () => {
  test("the session ends while writing: the new tab says where the words are, the old tab keeps them, and Publish works", async ({
    browser,
    baseURL,
  }) => {
    const writer = await account(browser, baseURL!, `${PREFIX}-composer`);
    const spaceId = randomUUID();
    const objectId = randomUUID();
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)`,
      [spaceId, writer.id, `${PREFIX} теплиця`],
    );
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
       values ($1, $2, $3, 'Томат', 'plant', 'unknown')`,
      [objectId, writer.id, spaceId],
    );
    const words = `${PREFIX} підв'язала стебло ${randomUUID().slice(0, 8)}`;

    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/auth/sign-in?next=%2Fgarden", { waitUntil: "load" });
    await signInOnScreen(page, writer);
    await page.waitForURL((target) => target.pathname === "/garden", {
      timeout: 25_000,
    });
    await page.goto(`/garden/objects/${objectId}`, { waitUntil: "load" });
    const composer = page.locator(
      '#follow-up-composer [data-entry-composer="true"]',
    );
    await expect(composer).toBeVisible({ timeout: 20_000 });
    const editor = composer.locator('[contenteditable="true"]').first();
    await waitForHydration(editor);
    await editor.click();
    await page.keyboard.type(words);
    // A marker the tab keeps only for as long as it is not reloaded.
    await page.evaluate(() => {
      (window as unknown as { __ove504Tab?: string }).__ove504Tab = "alive";
    });

    // The session ends while the gardener writes.
    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      cookies.filter((cookie) => !cookie.name.startsWith("overgarden.session")),
    );
    await composer.locator('[data-entry-composer-publish="true"]').click();
    const ended = composer.locator('[data-entry-composer-session="ended"]');
    await expect(ended).toBeVisible({ timeout: 20_000 });
    const link = ended.getByRole("link");
    await expect(link).toHaveAttribute("target", "_blank");
    expect(
      new URL((await link.getAttribute("href"))!, baseURL).searchParams.get(
        "notice",
      ),
    ).toBe("return-to-tab");

    // Sign in in the tab it opens.
    const [signInTab] = await Promise.all([
      context.waitForEvent("page"),
      link.click(),
    ]);
    await signInTab.waitForLoadState("load");
    await expect(
      signInTab.locator('[data-auth-notice="return-to-tab"]'),
    ).toBeVisible();
    await signInOnScreen(signInTab, writer);
    await expect(
      signInTab.locator('[data-auth-returned-to-tab="true"]'),
    ).toBeVisible({ timeout: 25_000 });
    await expect(signInTab.locator("h1:visible")).toHaveText(
      "Ви знову ввійшли",
    );
    // It did not open a second, empty composer.
    expect(new URL(signInTab.url()).pathname).toBe("/auth/sign-in");
    await signInTab.screenshot({
      path: path.join(SCREENSHOTS, "returned-to-tab-1280.png"),
    });

    // The first tab was not sent home: same document, same words.
    await page.bringToFront();
    await page.waitForTimeout(1_000);
    expect(
      await page.evaluate(
        () => (window as unknown as { __ove504Tab?: string }).__ove504Tab,
      ),
    ).toBe("alive");
    await expect(composer).toContainText(words);

    // Nothing was put anywhere a browser keeps.
    const stored = await page.evaluate(async () => {
      const values: string[] = [];
      for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = 0; index < storage.length; index += 1) {
          values.push(storage.getItem(storage.key(index) ?? "") ?? "");
        }
      }
      const databases = (await indexedDB.databases?.()) ?? [];
      return { values, databases: databases.map((db) => db.name) };
    });
    expect(stored.values.join("\n")).not.toContain(words);
    expect(stored.databases).toEqual([]);

    // The same button works again, and the entry is published once.
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              `select count(*)::int as n from journal_entries
                where owner_user_id = $1::uuid and body like $2`,
              [writer.id, `%${words}%`],
            )
          ).rows[0]!.n,
        { timeout: 25_000 },
      )
      .toBe(1);
    await context.close();
  });
});

test.describe("keyboard, password managers and language", () => {
  test("a password manager's silent fill and a paste both survive, and nothing blocks them", async ({
    browser,
    baseURL,
  }) => {
    const gardener = await account(browser, baseURL!, `${PREFIX}-autofill`);
    const context = await guestContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/auth/sign-in?next=%2Fjournals", { waitUntil: "load" });
    const form = credentialForm(page);
    await waitForHydration(form.locator('button[type="submit"]'));

    await expect(form.locator('input[name="email"]')).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await expect(form.locator('input[name="password"]')).toHaveAttribute(
      "autocomplete",
      "current-password",
    );

    // A paste is not cancelled by anything on the page.
    const pasted = await page.evaluate(() => {
      const field = document.querySelector<HTMLInputElement>(
        'input[name="password"]',
      )!;
      const data = new DataTransfer();
      data.setData("text/plain", "pasted");
      const event = new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(pasted).toBe(false);

    // A wrong password filled the way a manager fills on load — no `input`
    // event — is refused, and the fill is still there afterwards.
    await page.evaluate(
      ({ email }) => {
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!;
        set.call(document.querySelector('input[name="email"]'), email);
        set.call(
          document.querySelector('input[name="password"]'),
          "a-stale-saved-password",
        );
      },
      { email: gardener.email },
    );
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('[data-auth-message="error"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(form.locator('input[name="email"]')).toHaveValue(
      gardener.email,
    );
    await expect(form.locator('input[name="password"]')).toHaveValue(
      "a-stale-saved-password",
    );

    // The manager's second, right fill — with its events — signs in.
    await form
      .locator('input[name="password"]')
      .fill(SYNTHETIC_GARDENER_PASSWORD);
    await form.locator('button[type="submit"]').click();
    await page.waitForURL((target) => target.pathname === "/journals", {
      timeout: 25_000,
    });
    await context.close();
  });

  for (const locale of ["bg", "ru"] as const) {
    test(`the language chosen (${locale}) survives the round trip to an unprefixed page`, async ({
      browser,
      baseURL,
    }) => {
      const entry = await seedPublishedEntryFixture(
        pool,
        `${PREFIX}-${locale}`,
      );
      entries.push(entry);
      const reader = await account(browser, baseURL!, `${PREFIX}-${locale}`);
      const context = await guestContext(browser, baseURL!, locale);
      const page = await context.newPage();
      await page.goto(entry.entryPath, { waitUntil: "load" });
      const trigger = page
        .locator('[data-auth-intent-control="bookmark"]:visible')
        .first();
      await waitForHydration(trigger);
      await trigger.click();
      await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });
      await expect(page.locator("main[data-auth-frame]")).toHaveAttribute(
        "lang",
        locale,
      );
      await expect(page.locator("h1:visible")).toHaveText(
        locale === "bg"
          ? "Влезте, за да добавите отметка"
          : "Войдите, чтобы добавить в закладки",
      );
      await signInOnScreen(page, reader);
      await page.waitForURL((target) => target.pathname === entry.entryPath, {
        timeout: 25_000,
      });
      // The canonical, unprefixed address, and still the reader's language.
      await expect(page.locator("html")).toHaveAttribute("lang", locale, {
        timeout: 20_000,
      });
      const cookie = (await context.cookies()).find(
        (candidate) => candidate.name === LOCALE_COOKIE,
      );
      expect(cookie?.value).toBe(locale);
      await context.close();
    });
  }

  test("every screen and state is clean under axe, at 320 and 1440, in three languages", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const screens = [
      ["sign-in", "/auth/sign-in"],
      ["sign-up", "/auth/sign-up"],
      ["help", "/auth/help"],
      ["reset", "/auth/reset-password?token=not-a-real-token"],
      ["reset-expired", "/auth/reset-password?error=INVALID_TOKEN"],
      [
        "intent-expired",
        "/auth/sign-in?next=%2Fjournals&notice=intent-expired",
      ],
      ["provider-error", "/auth/sign-in?error=oauth_error"],
    ] as const;
    for (const locale of ["uk", "bg", "ru"] as const) {
      const context = await guestContext(browser, baseURL!, locale);
      const page = await context.newPage();
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, address] of screens) {
          const response = await page.goto(address, { waitUntil: "load" });
          expect(response?.status(), `${address} ${locale}`).toBe(200);
          await page.waitForTimeout(300);
          await scanAccessibility(page, testInfo, `${name}-${locale}-${width}`);
          // No sideways scroll at a phone's width.
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow, `${name} ${locale} ${width}`).toBeLessThanOrEqual(0);
          if (width === 320 && (name === "sign-in" || name === "help"))
            await page.screenshot({
              path: path.join(SCREENSHOTS, `${name}-${locale}-320.png`),
              fullPage: true,
            });
        }
      }
      await context.close();
    }
  });
});
