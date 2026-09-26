import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
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
 * A community as a place to read and to add to (`OVE-500`).
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=community-contribution.spec.ts
 *
 * What this proves, against a production build and the local database:
 *
 * - **The community says what it is and how to take part**, in three
 *   languages, at a phone's width and a desk's, with no sideways scroll.
 * - **A guest's "add an entry" survives signing in** and lands on this
 *   community's own step — the control focused — never on a garden setup.
 * - **Writing for a community is the one composer, with the community
 *   named**: a plant or an animal only, back to the community after Publish
 *   with the new entry offered first, and one press adds it. The database is
 *   read back: one contribution, to this community, of that entry, and not
 *   one object or space created on the way.
 * - **A refusal says which rule refused**, and a forged form from somebody
 *   who is not a member writes nothing.
 * - **A discussion leads back, and a removed one says it is gone.**
 *
 * The community is the spec's own (its slug sorts after every other spec's
 * `observation-and-care`), and the gardeners are written straight into the
 * database with a password, as `auth-intent.spec.ts` does: sign-up is
 * rate-limited across the whole gate, and every sign-in here still goes
 * through the screen or the API a browser uses.
 */

const PREFIX = "ove500c";
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
  "ove-500",
);
/** A long name in all three languages: the layout has to carry it. */
const CONTENT_KEY = "visual-care-across-every-living-object";

let pool: Pool;
let community: { id: string; slug: string };
const gardeners: string[] = [];
let passwordHash: Promise<string> | null = null;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  const slug = `${PREFIX}-${randomUUID().slice(0, 8)}`;
  const created = await pool.query<{ id: string }>(
    `insert into communities (slug, content_key, journal_topic_id,
                              lifecycle_state, participation_state)
     select $1::text, $2::text, journal_topic_id, 'active', 'open'
       from communities where slug = 'observation-and-care'
     returning id::text id`,
    [slug, CONTENT_KEY],
  );
  community = { id: created.rows[0]!.id, slug };
  await pool.query(
    `insert into community_rules (community_id, rule_key, sort_order, rule_state)
     select $1::uuid, rule_key, sort_order, rule_state
       from community_rules
      where community_id = (select id from communities
                             where slug = 'observation-and-care')`,
    [community.id],
  );
});

test.afterAll(async () => {
  for (const id of gardeners) {
    await pool.query(
      `delete from engagement_comments where author_user_id = $1::uuid`,
      [id],
    );
    await pool.query(
      `delete from community_contribution_reports where reporter_user_id = $1::uuid`,
      [id],
    );
  }
  await pool.query(
    `delete from community_contributions where community_id = $1::uuid`,
    [community.id],
  );
  await pool.query(
    `delete from community_memberships where community_id = $1::uuid`,
    [community.id],
  );
  await pool.query(
    `delete from community_rules where community_id = $1::uuid`,
    [community.id],
  );
  await pool.query(`delete from communities where id = $1::uuid`, [
    community.id,
  ]);
  for (const id of gardeners) {
    for (const [table, column] of [
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
  return { id, email, handle };
}

async function join(userId: string, state: "active" | "banned" = "active") {
  await pool.query(
    `insert into community_memberships
       (community_id, user_id, membership_state, banned_at)
     values ($1::uuid, $2::uuid, $3,
             case when $3 = 'banned' then now() end)
     on conflict (community_id, user_id)
       do update set membership_state = excluded.membership_state,
                     banned_at = excluded.banned_at, left_at = null`,
    [community.id, userId, state],
  );
}

/** A space and one plant in it; returns their ids. */
async function garden(userId: string, plant = "Базилік") {
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Балкон')
     returning id::text id`,
    [userId],
  );
  const object = await pool.query<{ id: string }>(
    `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
     values ($1::uuid, $2::uuid, $3, 'plant') returning id::text id`,
    [userId, space.rows[0]!.id, plant],
  );
  return { spaceId: space.rows[0]!.id, objectId: object.rows[0]!.id };
}

/** A published public entry about one object, the way the composer leaves one. */
async function publishedEntry(userId: string, title: string) {
  const { spaceId, objectId } = await garden(userId, `Томат ${title}`);
  const entry = await pool.query<{ id: string }>(
    `insert into journal_entries
       (owner_user_id, space_id, plant_object_id, title, body,
        client_mutation_id, public_slug, published_at, entry_date,
        source_language, visibility, lifecycle_state, content_class,
        entry_scope)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(), current_date,
             'uk', 'public', 'active', 'real_ugc', 'object')
     returning id::text id`,
    [
      userId,
      spaceId,
      objectId,
      title,
      "Листя рівне, нових плям немає.",
      randomUUID(),
      `${PREFIX}-entry-${randomUUID().slice(0, 8)}`,
    ],
  );
  return entry.rows[0]!.id;
}

async function contribute(userId: string, entryId: string) {
  const row = await pool.query<{ id: string }>(
    `insert into community_contributions
       (community_id, contributor_user_id, journal_entry_id,
        contribution_state, discussion_state)
     values ($1::uuid, $2::uuid, $3::uuid, 'active', 'open')
     returning id::text id`,
    [community.id, userId, entryId],
  );
  return row.rows[0]!.id;
}

async function readerContext(
  browser: Browser,
  baseURL: string,
  locale: "uk" | "bg" | "ru" = "uk",
  viewport = { width: 1280, height: 900 },
) {
  const context = await browser.newContext({ viewport });
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

/** A request context signed in through the API a browser's form posts to. */
async function signedInRequest(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  baseURL: string,
  gardener: SyntheticGardener,
) {
  const request = await playwright.request.newContext();
  const { response, statuses } = await postPastRateLimit(() =>
    request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin: baseURL },
      data: { email: gardener.email, password: SYNTHETIC_GARDENER_PASSWORD },
    }),
  );
  if (response.ok()) return request;
  throw new Error(
    `${gardener.email} could not sign in (${statuses.join(", ")})`,
  );
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

/**
 * A multipart body React's server-action endpoint accepts: Playwright's own
 * `multipart` drops an empty field, and `$ACTION_REF_1` is exactly that.
 */
function encodeMultipart(fields: Array<[string, string]>) {
  const boundary = `----overgarden${randomUUID().replace(/-/gu, "")}`;
  const body = fields
    .map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
    .join("");
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.from(`${body}--${boundary}--\r\n`, "utf8"),
  };
}

/** Every field of the first `<form>` that contains `marker`, as a browser posts it. */
function readFormFields(html: string, marker: string) {
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gu)]
    .map((match) => match[0])
    .find(
      (candidate) =>
        candidate.includes(marker) && candidate.includes("$ACTION_"),
    );
  if (!form) return null;
  const fields: Array<[string, string]> = [
    ...form.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/gu),
  ].map((match) => [
    match[1]!,
    match[2]!.replaceAll("&amp;", "&").replaceAll("&quot;", '"'),
  ]);
  for (const match of form.matchAll(/<input[^>]*\bname="(\$ACTION_[^"]+)"/gu)) {
    if (!fields.some(([name]) => name === match[1]))
      fields.push([match[1]!, ""]);
  }
  return fields;
}

test.describe("a community as a place to read and to add to", () => {
  test("every language says what the community is and how to take part", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    for (const [locale, prefix, addEntry, stepTitle] of [
      ["uk", "", "Додати запис", "Додати запис до спільноти"],
      ["bg", "/bg", "Добавяне на запис", "Добавяне на запис в общността"],
      ["ru", "/ru", "Добавить запись", "Добавить запись в сообщество"],
    ] as const) {
      // 320 CSS px is the reflow width (WCAG 1.4.10), 1280 a desk.
      for (const width of [320, 1280]) {
        const context = await readerContext(browser, baseURL!, locale, {
          width,
          height: width < 768 ? 720 : 900,
        });
        const page = await context.newPage();
        const response = await page.goto(
          `${prefix}/communities/${community.slug}`,
          { waitUntil: "load" },
        );
        expect(response?.status()).toBe(200);
        const main = page.locator(
          `main[data-public-community="${community.slug}"]`,
        );
        await expect(
          main.locator('[data-community-identity="true"]'),
        ).toBeVisible();
        // The topic it files under, at its address in this language.
        await expect(
          main.locator('[data-community-topic="observation-and-care"] a'),
        ).toHaveAttribute("href", `${prefix}/topics/observation-and-care`);
        // Join and add an entry, side by side, and the step they lead to.
        const add = main.locator('[data-community-add-entry="header"]');
        await expect(add).toHaveText(addEntry);
        await expect(add).toHaveAttribute("href", "#community-contribute");
        await expect(main.locator("#community-contribute h2")).toHaveText(
          stepTitle,
        );
        await expectReflow(page);
        if (width === 320 || locale === "uk") {
          await scanAccessibility(
            page,
            testInfo,
            `community-${locale}-${width}`,
          );
        }
        if (locale === "bg" && width === 320) {
          await page.screenshot({
            path: path.join(SCREENSHOTS, "community-bg-320.png"),
            fullPage: true,
          });
        }
        await context.close();
      }
    }
  });

  test("a guest's Add entry comes back through sign-in to this community's step", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const gardener = await account(`${PREFIX}-guest`);
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(`/communities/${community.slug}`, { waitUntil: "load" });

    // The header's action is an anchor to the step, for every reader.
    const header = page.locator('[data-community-add-entry="header"]');
    await waitForHydration(header);
    await header.click();
    await expect(page).toHaveURL(/#community-contribute$/u);
    const trigger = page
      .locator(
        '[data-community-contribute-step="guest"] [data-auth-intent-control="contribute"]:visible',
      )
      .first();
    await waitForHydration(trigger);
    await trigger.click();

    // The one sign-in screen, saying what it is for.
    await page.waitForURL(/\/auth\/sign-in\?/u, { timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("intent")).toBe("contribute");
    await expect(page.locator("h1:visible")).toHaveText(
      "Увійдіть, щоб додати свій запис до спільноти",
    );
    await signInOnScreen(page, gardener);

    // Back to this community, at its step, the next control focused: this
    // reader is not a member yet, so it is Join.
    await page.waitForURL(
      (target) =>
        target.pathname === `/communities/${community.slug}` &&
        target.searchParams.get("authIntent") === "contribute" &&
        target.searchParams.get("authControl") === "add-entry",
      { timeout: 25_000 },
    );
    await expect(
      page.locator('[data-community-contribute-step="join"]'),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => focusedIntentControl(page), { timeout: 20_000 })
      .toEqual({ control: "contribute", ref: "add-entry" });

    await page.keyboard.press("Enter");
    await page.waitForURL(
      (target) => target.searchParams.get("contributeAction") === "joined",
      { timeout: 20_000 },
    );
    await expect(page.locator('[data-action-outcome="joined"]')).toContainText(
      "Ви приєдналися до спільноти",
    );
    // A member with nothing published yet is sent to write — for this
    // community — not to a garden setup.
    await expect(
      page.locator(
        '[data-community-contribute-step="write"] [data-community-compose]',
      ),
    ).toHaveAttribute(
      "href",
      `/garden/new?community=${community.slug}&returnTo=%2Fcommunities%2F${community.slug}`,
    );
    const membership = await pool.query<{ membership_state: string }>(
      `select membership_state from community_memberships
        where community_id = $1::uuid and user_id = $2::uuid`,
      [community.id, gardener.id],
    );
    expect(membership.rows[0]?.membership_state).toBe("active");
    await context.close();
  });

  test("a member writes for the community and adds the new entry with one press", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(150_000);
    const member = await account(`${PREFIX}-writer`);
    await join(member.id);
    const { objectId } = await garden(member.id);
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(
      `/auth/sign-in?next=${encodeURIComponent(`/communities/${community.slug}`)}`,
      { waitUntil: "load" },
    );
    await signInOnScreen(page, member);
    await page.waitForURL(
      (target) => target.pathname === `/communities/${community.slug}`,
      { timeout: 25_000 },
    );

    const compose = page.locator(
      '[data-community-contribute-step="write"] [data-community-compose]',
    );
    await waitForHydration(compose);
    await compose.click();
    await page.waitForURL(
      (target) =>
        target.pathname === "/garden/new" &&
        target.searchParams.get("community") === community.slug,
      { timeout: 20_000 },
    );

    // The composer names the community, and offers only what a community
    // takes: a plant or an animal, never the space it lives in.
    const composer = page.locator('[data-entry-composer="true"]');
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await waitForHydration(composer);
    await expect(
      composer.locator('[data-entry-composer-community="accepting"]'),
    ).toContainText(
      "Запис для спільноти «Догляд за рослинами, тваринами та бджолиними сім’ями впродовж усього року»",
    );
    const picker = composer.getByRole("combobox").first();
    await picker.fill("Ба");
    const options = composer.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 15_000 });
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText("Базилік");
    await options.first().click();
    await typeInto(page, "Базилік дав нове листя після пересадки.");
    await scanAccessibility(page, testInfo, "community-composer-uk-1280");
    await composer.locator('[data-entry-composer-publish="true"]').click();

    // Back to the community's step, with the new entry offered first.
    await page.waitForURL(
      (target) =>
        target.pathname === `/communities/${community.slug}` &&
        /^[0-9a-f-]{36}$/u.test(target.searchParams.get("contribute") ?? ""),
      { timeout: 40_000 },
    );
    const entry = await pool.query<{ id: string; entry_scope: string }>(
      `select id::text id, entry_scope from journal_entries
        where owner_user_id = $1::uuid`,
      [member.id],
    );
    expect(entry.rows).toHaveLength(1);
    const entryId = entry.rows[0]!.id;
    expect(entry.rows[0]!.entry_scope).toBe("object");
    expect(new URL(page.url()).searchParams.get("contribute")).toBe(entryId);
    const step = page.locator('[data-community-contribute-step="choose"]');
    await expect(
      step.locator('[data-action-outcome="fresh-entry"]'),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(step.locator('select[name="journalEntryId"]')).toHaveValue(
      entryId,
    );
    // Nothing is added until the member says so.
    expect(
      (
        await pool.query(
          `select 1 from community_contributions where journal_entry_id = $1::uuid`,
          [entryId],
        )
      ).rowCount,
    ).toBe(0);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "community-fresh-entry-1280.png"),
    });

    const add = step.getByRole("button", { name: "Додати до спільноти" });
    await waitForHydration(add);
    await add.click();
    await page.waitForURL(
      (target) => target.searchParams.get("contributeAction") === "contributed",
      { timeout: 20_000 },
    );
    await expect(
      page.locator('[data-action-outcome="contributed"]'),
    ).toContainText("Запис додано до спільноти.");

    // Read back: one contribution, to this community, of that entry — and
    // not one object or space created on the way.
    const contributions = await pool.query<{
      community_id: string;
      journal_entry_id: string;
    }>(
      `select community_id::text, journal_entry_id::text
         from community_contributions where contributor_user_id = $1::uuid`,
      [member.id],
    );
    expect(contributions.rows).toEqual([
      { community_id: community.id, journal_entry_id: entryId },
    ]);
    const owned = await pool.query<{ objects: number; spaces: number }>(
      `select (select count(*)::int from plant_objects where owner_user_id = $1::uuid) objects,
              (select count(*)::int from spaces where owner_user_id = $1::uuid) spaces`,
      [member.id],
    );
    expect(owned.rows[0]).toEqual({ objects: 1, spaces: 1 });
    const own = await pool.query<{ plant_object_id: string }>(
      `select plant_object_id::text from journal_entries where id = $1::uuid`,
      [entryId],
    );
    expect(own.rows[0]!.plant_object_id).toBe(objectId);
    await context.close();
  });

  test("a refusal says which rule refused, and a forged form writes nothing", async ({
    baseURL,
    playwright,
  }) => {
    test.setTimeout(120_000);
    const member = await account(`${PREFIX}-member`);
    await join(member.id);
    await publishedEntry(member.id, `${PREFIX} перевірка`);
    const outsider = await account(`${PREFIX}-outsider`);
    const outsiderEntry = await publishedEntry(outsider.id, `${PREFIX} чужий`);
    const url = `${baseURL}/communities/${community.slug}`;

    const memberRequest = await signedInRequest(playwright, baseURL!, member);
    const html = await (await memberRequest.get(url)).text();
    const fields = readFormFields(html, 'name="journalEntryId"');
    expect(
      fields,
      "the member's step rendered no contribution form",
    ).not.toBeNull();

    // The outsider posts the member's form with their own entry: an admitted
    // session, and not a member of this community.
    const outsiderRequest = await signedInRequest(
      playwright,
      baseURL!,
      outsider,
    );
    const forged = fields!
      .filter(([name]) => name !== "ownerUserId")
      .map(([name, value]): [string, string] =>
        name === "journalEntryId" ? [name, outsiderEntry] : [name, value],
      );
    const encoded = encodeMultipart(forged);
    const response = await outsiderRequest.post(url, {
      headers: { "content-type": encoded.contentType, origin: baseURL! },
      data: encoded.body,
      maxRedirects: 0,
    });
    expect(response.status()).toBeLessThan(400);
    expect(
      response.headers()["x-action-redirect"] ?? response.headers().location,
    ).toMatch(/contributeAction=not_member/u);
    expect(
      (
        await pool.query(
          `select 1 from community_contributions where journal_entry_id = $1::uuid`,
          [outsiderEntry],
        )
      ).rowCount,
    ).toBe(0);

    // A banned member is told so, in words, and still writes nothing.
    await join(outsider.id, "banned");
    const banned = await outsiderRequest.post(url, {
      headers: { "content-type": encoded.contentType, origin: baseURL! },
      data: encoded.body,
      maxRedirects: 0,
    });
    expect(
      banned.headers()["x-action-redirect"] ?? banned.headers().location,
    ).toMatch(/contributeAction=banned/u);
    expect(
      (
        await pool.query(
          `select 1 from community_contributions where journal_entry_id = $1::uuid`,
          [outsiderEntry],
        )
      ).rowCount,
    ).toBe(0);

    // And the words the step shows for it.
    const refused = await (
      await outsiderRequest.get(`${url}?contributeAction=banned`)
    ).text();
    expect(refused).toContain(
      "Модератор обмежив вашу участь у цій спільноті, тож додати запис не вийде.",
    );
    await memberRequest.dispose();
    await outsiderRequest.dispose();
  });

  test("a discussion leads back, and a removed one says it is gone", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const author = await account(`${PREFIX}-author`);
    await join(author.id);
    const entryId = await publishedEntry(author.id, `${PREFIX} обговорення`);
    const contributionId = await contribute(author.id, entryId);
    const context = await readerContext(browser, baseURL!, "bg");
    const page = await context.newPage();

    await page.goto(`/bg/communities/${community.slug}`, { waitUntil: "load" });
    const discuss = page
      .locator(
        `a[href="/bg/communities/${community.slug}/discussions/${contributionId}"]`,
      )
      .first();
    await waitForHydration(discuss);
    await discuss.click();
    await page.waitForURL(
      (target) => target.pathname.endsWith(`/discussions/${contributionId}`),
      { timeout: 20_000 },
    );
    // The discussion names its entry as a readable post, and its title does.
    await expect(
      page.locator('#discussion-entry [data-slot="entry-card"]'),
    ).toBeVisible();
    await expect(page).toHaveTitle(/^Обсъждане: /u);
    await page.goBack();
    await page.waitForURL(
      (target) => target.pathname === `/bg/communities/${community.slug}`,
      { timeout: 20_000 },
    );
    await expect(
      page.locator(`main[data-public-community="${community.slug}"]`),
    ).toBeVisible();

    // Removed by a moderator: the address says so and leads back.
    await pool.query(
      `update community_contributions
          set contribution_state = 'removed', removed_at = now(),
              removed_by_user_id = $2::uuid, removal_reason = 'off_topic'
        where id = $1::uuid`,
      [contributionId, author.id],
    );
    await page.goto(
      `/bg/communities/${community.slug}/discussions/${contributionId}`,
      { waitUntil: "load" },
    );
    const gone = page.locator(
      '[data-public-community-discussion-state="unavailable"]',
    );
    await expect(gone).toContainText("Това обсъждане не е достъпно");
    await expect(
      gone.locator('[data-community-discussion-back="true"]'),
    ).toHaveAttribute("href", `/bg/communities/${community.slug}`);
    await context.close();
  });
});
