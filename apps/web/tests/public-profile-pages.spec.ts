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
 * A gardener's public profile (`OVE-494`), in a browser, against
 * `next start` and the local database:
 *
 * - who the gardener is — name, handle, a long bio in their own line breaks,
 *   region and languages in the reader's language, counts in words — then
 *   two views, **Entries** and **Objects**, at 1440, 390 and 320;
 * - many-page data: 23 entries are three pages of ten and 14 objects are two
 *   pages of twelve, every page a real link, page two kept out of the index
 *   and a page past the end a 404;
 * - an entry is the feed's own card; an object is a journal, and says so;
 * - the owner sees an edit link, another member follows, a guest follows
 *   through sign-in — and none of them sees a settings form;
 * - the document reads without a script, a keyboard reaches everything in
 *   order, and an empty profile shows no zero and no picture;
 * - Bulgarian and Russian read their own words.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=public-profile-pages.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const NARROW = { width: 320, height: 640 } as const;
const PREFIX = "ove494";
const DISPLAY_NAME = "Оксана · сад над Дністром";
const ENTRY_COUNT = 23;
const OBJECT_COUNT = 14;
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-494",
);
// Two paragraphs and 560 characters: the whole bio, in its own line breaks.
const LONG_BIO = [
  "Тримаю невеликий сад на схилі над Дністром: дванадцять грядок, дві вулики і стару яблуню, яку посадив ще мій дід. "
    .repeat(3)
    .trim(),
  "Записую все, що змінюється, навіть коли нічого не вдалося — бо саме такі записи потім найкорисніші.",
].join("\n");

let pool: Pool;
let gardener: SyntheticGardener;
let member: SyntheticGardener;
let gardenerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let memberCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
/** Newest publication first — the order the profile lists them in. */
let entryTitles: string[] = [];
/** Newest journal first — the order the profile lists them in. */
let objectNames: string[] = [];

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);

  // Two gardeners with sessions, signed in once for the whole file: Better
  // Auth rate-limits sign-up, and spec files run in parallel.
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
  ({ signedIn: gardener, cookies: gardenerCookies } = await signIn(
    `${PREFIX}-gardener`,
  ));
  ({ signedIn: member, cookies: memberCookies } = await signIn(
    `${PREFIX}-member`,
  ));

  const profile = await pool.query(
    `update user_public_profiles
        set display_name = $2, display_name_policy_version = 'ove203-identity-v1',
            bio = $3, languages = array['uk', 'bg'],
            location_visibility = 'region', coarse_region_code = 'UA-68',
            relationship_visibility = 'counts'
      where user_id = $1::uuid`,
    [gardener.id, DISPLAY_NAME, LONG_BIO],
  );
  expect(profile.rowCount, "the gardener has no public profile").toBe(1);

  const run = randomUUID().slice(0, 6);
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
     returning id::text id`,
    [gardener.id, `Сад на схилі ${run}`],
  );
  const spaceId = space.rows[0]!.id;

  // Fourteen objects, each with one entry; the first object has seven more,
  // and two entries are about the whole space. Publication is spaced a
  // minute apart, newest first, so the order on every page is known.
  const objectIds: string[] = [];
  entryTitles = [];
  objectNames = [];
  let minute = 0;
  const publish = async (input: {
    title: string;
    objectId: string | null;
    daysAgo: number;
  }) => {
    await pool.query(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7,
               now() - make_interval(mins => $8), current_date - $9::int,
               'uk', 'public', 'active', 'real_ugc', $10)`,
      [
        gardener.id,
        spaceId,
        input.objectId,
        input.title,
        "Що змінилося за тиждень: полив, підживлення і що з цього вийшло.",
        randomUUID(),
        `${PREFIX}-${run}-${minute}`,
        minute,
        input.daysAgo,
        input.objectId ? "object" : "space",
      ],
    );
    entryTitles.push(input.title);
    minute += 1;
  };

  for (let index = 0; index < OBJECT_COUNT; index += 1) {
    const name = `Об’єкт ${String(index + 1).padStart(2, "0")} ${run}`;
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects
         (owner_user_id, space_id, display_name, object_kind, public_slug,
          variety_state)
       values ($1::uuid, $2::uuid, $3, $4, $5, 'unknown')
       returning id::text id`,
      [
        gardener.id,
        spaceId,
        name,
        index % 5 === 4 ? "animal" : "plant",
        `${PREFIX}-${run}-object-${index + 1}`,
      ],
    );
    objectIds.push(object.rows[0]!.id);
    objectNames.push(name);
  }
  // Newest first: the first object's entries are the most recent, then one
  // entry for each object in order, then the two about the space.
  for (let extra = 0; extra < 7; extra += 1) {
    await publish({
      title: `Щоденник першого об’єкта, запис ${extra + 1}`,
      objectId: objectIds[0]!,
      daysAgo: extra,
    });
  }
  for (let index = 0; index < OBJECT_COUNT; index += 1) {
    await publish({
      title: `Перший запис про ${objectNames[index]}`,
      objectId: objectIds[index]!,
      daysAgo: 10 + index,
    });
  }
  for (let spaceEntry = 0; spaceEntry < 2; spaceEntry += 1) {
    await publish({
      title: `Про весь сад, запис ${spaceEntry + 1}`,
      objectId: null,
      daysAgo: 30 + spaceEntry,
    });
  }
  expect(entryTitles).toHaveLength(ENTRY_COUNT);
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.afterAll(async () => {
  if (gardener) {
    await pool.query(
      "delete from journal_entries where owner_user_id = $1::uuid",
      [gardener.id],
    );
    await pool.query(
      "delete from plant_objects where owner_user_id = $1::uuid",
      [gardener.id],
    );
    await pool.query("delete from spaces where owner_user_id = $1::uuid", [
      gardener.id,
    ]);
    await removeSyntheticGardener(pool, gardener.id);
  }
  if (member) await removeSyntheticGardener(pool, member.id);
  await pool?.end();
});

async function readerContext(
  browser: Browser,
  baseURL: string,
  reader: "guest" | "owner" | "member",
  options: { javaScriptEnabled?: boolean } = {},
) {
  const context = await browser.newContext({
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
  ]);
  // The analytics notice is answered, so the screenshots show the page.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("overgarden:analytics-consent", "declined");
    } catch {
      // A page with storage blocked shows the notice; the proofs still run.
    }
  });
  if (reader === "owner") await context.addCookies(gardenerCookies);
  if (reader === "member") await context.addCookies(memberCookies);
  return context;
}

/**
 * The titles of the entry cards the open panel shows, in order — once they
 * are there: a `?page=` view is the profile's `/q` twin, which streams.
 */
async function visibleEntryTitles(page: Page) {
  const titles = page.locator(
    '[data-profile-entries="true"]:visible [data-slot="entry-card"] h3',
  );
  await expect(titles.first()).toBeVisible();
  return titles.allInnerTexts();
}

async function visibleObjectNames(page: Page) {
  const names = page.locator(
    '[data-profile-objects="true"]:visible [data-profile-object] h3',
  );
  await expect(names.first()).toBeVisible();
  return names.allInnerTexts();
}

test("a guest reads who the gardener is, then every entry, a page at a time", async ({
  browser,
  baseURL,
}) => {
  const context = await readerContext(browser, baseURL!, "guest");
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP);
  const response = await page.goto(`/@${gardener.handle}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBeUndefined();

  // Identity: one `h1`, nothing above it, the whole bio in its own lines.
  const header = page.locator('[data-slot="profile-header"]:visible');
  await expect(page.locator("h1:visible")).toHaveCount(1);
  await expect(page.locator("h1:visible")).toHaveText(DISPLAY_NAME);
  await expect(header).toContainText(`@${gardener.handle}`);
  const bio = header.locator("[data-profile-bio]");
  expect(await bio.innerText()).toBe(LONG_BIO);
  // Region and languages in the reader's language, never a code.
  await expect(header.locator("[data-profile-region]")).toContainText(
    "Україна — Хмельницька область",
  );
  await expect(header.locator("[data-profile-languages]")).toContainText(
    "Українська · Български",
  );
  await expect(header).not.toContainText("UA-68");
  // No follower yet: no count, not a zero.
  await expect(header.locator("[data-profile-counts]")).toHaveCount(0);

  // Two views, each saying how many things are behind it.
  const tabs = page.locator('[role="tab"]:visible');
  await expect(tabs).toHaveText([
    `Записи${ENTRY_COUNT}`,
    `Об’єкти${OBJECT_COUNT}`,
  ]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");

  // Page one: the ten newest, as the feed's card, author first.
  expect(await visibleEntryTitles(page)).toEqual(entryTitles.slice(0, 10));
  const firstCard = page
    .locator('[data-profile-entries="true"]:visible [data-slot="entry-card"]')
    .first();
  await expect(firstCard).toContainText("Автор");
  await expect(firstCard).toContainText("Обговорення");
  const pagination = page.getByRole("navigation", { name: "Сторінки записів" });
  await expect(pagination).toContainText("Сторінка 1 з 3");
  await page.screenshot({
    path: path.join(SCREENSHOTS, "profile-guest-1440.png"),
  });

  // Page two, by the real link: ten more, out of the index, canonical intact.
  const [second] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith(`/@${gardener.handle}?page=2`) &&
        candidate.request().resourceType() === "document",
    ),
    pagination.getByRole("link", { name: "Старіші" }).click(),
  ]);
  expect(second.status()).toBe(200);
  expect(second.headers()["x-robots-tag"]).toBe("noindex, follow");
  await expect(page).toHaveURL(
    new RegExp(`/@${gardener.handle}\\?page=2$`, "u"),
  );
  expect(await visibleEntryTitles(page)).toEqual(entryTitles.slice(10, 20));
  expect(await page.getAttribute('link[rel="canonical"]', "href")).toMatch(
    new RegExp(`/@${gardener.handle}$`, "u"),
  );

  // Page three holds the last three, and there is no page four.
  await page
    .getByRole("navigation", { name: "Сторінки записів" })
    .getByRole("link", { name: "Старіші" })
    .click();
  await expect(page).toHaveURL(new RegExp(`\\?page=3$`, "u"));
  expect(await visibleEntryTitles(page)).toEqual(entryTitles.slice(20));
  await expect(
    page
      .getByRole("navigation", { name: "Сторінки записів" })
      .getByRole("button", { name: "Старіші" }),
  ).toBeDisabled();
  const beyond = await page.goto(`/@${gardener.handle}?page=4`);
  expect(beyond?.status()).toBe(404);

  // Every entry was reached once.
  expect(new Set(entryTitles).size).toBe(ENTRY_COUNT);
  await context.close();
});

test("objects are journals, twelve to a page, each one opening its passport", async ({
  browser,
  baseURL,
}) => {
  const context = await readerContext(browser, baseURL!, "guest");
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP);
  await page.goto(`/@${gardener.handle}?page=2`);
  await waitForHydration(page.locator('[role="tablist"]:visible'));

  // From page two of the entries, the objects tab opens the first page of
  // the objects, and the address says so; back on the entries, it names the
  // page the entries were drawn at.
  await page.getByRole("tab", { name: /Об’єкти/u }).click();
  await expect(page).toHaveURL(
    new RegExp(`/@${gardener.handle}\\?tab=objects$`, "u"),
  );
  await page.getByRole("tab", { name: /Записи/u }).click();
  await expect(page).toHaveURL(
    new RegExp(`/@${gardener.handle}\\?page=2$`, "u"),
  );

  await page.goto(`/@${gardener.handle}?tab=objects`);
  // The newest journal first: the first object has the newest entries.
  const names = await visibleObjectNames(page);
  expect(names).toHaveLength(12);
  expect(names[0]).toBe(objectNames[0]);
  const journal = page.locator("[data-profile-object-journal]:visible");
  await expect(journal.first()).toContainText("Журнал: 8 записів");
  await expect(journal.nth(1)).toContainText("Журнал: 1 запис");
  await expect(journal.first()).toContainText("Останній запис");

  const objectsPages = page.getByRole("navigation", {
    name: "Сторінки об’єктів",
  });
  await expect(objectsPages).toContainText("Сторінка 1 з 2");
  await objectsPages.getByRole("link", { name: "Наступні" }).click();
  await expect(page).toHaveURL(new RegExp(`\\?tab=objects&page=2$`, "u"));
  const rest = await visibleObjectNames(page);
  expect(rest).toHaveLength(OBJECT_COUNT - 12);
  expect(new Set([...names, ...rest]).size).toBe(OBJECT_COUNT);

  // An object's card opens its passport, the journal it names.
  const passport = page
    .locator('[data-profile-objects="true"]:visible [data-profile-object] h3 a')
    .first();
  const href = await passport.getAttribute("href");
  expect(href).toMatch(new RegExp(`^/@${gardener.handle}/objects/`, "u"));
  const opened = await page.goto(href!);
  expect(opened?.status()).toBe(200);
  await context.close();
});

test("the document reads without a script, and every list is in it", async ({
  browser,
  baseURL,
}) => {
  const context = await readerContext(browser, baseURL!, "guest", {
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  const response = await page.goto(`/@${gardener.handle}`);
  expect(response?.status()).toBe(200);
  const html = await response!.text();

  // What a crawler and a reader without scripts get: the gardener, the first
  // ten entries, and the first twelve objects in the (hidden) second panel.
  await expect(page.locator("h1:visible")).toHaveText(DISPLAY_NAME);
  expect(await visibleEntryTitles(page)).toEqual(entryTitles.slice(0, 10));
  for (const name of objectNames.slice(0, 12)) expect(html).toContain(name);
  // The next page is a real link, not a button waiting for a bundle.
  expect(html).toContain(`href="/@${gardener.handle}?page=2"`);
  expect(html).toContain('data-public-profile="v3"');
  // The follow a guest can press works without a script too.
  expect(html).toContain('action="/auth/intent/start"');

  // A view with a query is the profile's `/q` twin, which streams: like every
  // query view (ADR-0032 D5) its content is revealed by the page's own inline
  // script, so without one only its bytes can be read. They carry the view
  // the server chose — the objects open — and every object on the page.
  const objects = await page.request.get(`/@${gardener.handle}?tab=objects`);
  expect(objects.status()).toBe(200);
  const objectsHtml = await objects.text();
  expect(objectsHtml).toContain('data-profile-tab="objects"');
  for (const name of objectNames.slice(0, 12)) {
    expect(objectsHtml).toContain(name);
  }
  // An old link to the retired "about" tab loses the parameter at the proxy,
  // so it is the static document itself: the entries, readable as they are.
  await page.goto(`/@${gardener.handle}?tab=about`);
  expect(await visibleEntryTitles(page)).toEqual(entryTitles.slice(0, 10));
  await context.close();
});

test("the owner edits, another member follows, a guest follows through sign-in", async ({
  browser,
  baseURL,
}) => {
  for (const [reader, viewport, label] of [
    ["owner", DESKTOP, "self-1440"],
    ["owner", PHONE, "self-390"],
    ["member", DESKTOP, "member-1440"],
    ["member", PHONE, "member-390"],
    ["guest", PHONE, "guest-390"],
  ] as const) {
    const context = await readerContext(browser, baseURL!, reader);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(`/@${gardener.handle}`);
    const header = page.locator('[data-slot="profile-header"]:visible');
    // The reader's own controls stream in after the static facts.
    if (reader === "owner") {
      const edit = header.getByRole("link", { name: "Редагувати профіль" });
      await expect(edit).toBeVisible();
      await expect(edit).toHaveAttribute(
        "href",
        "/garden/profile#public-profile-editor",
      );
      await expect(
        header.getByRole("button", { name: /Стежити/u }),
      ).toHaveCount(0);
    } else if (reader === "member") {
      await expect(
        header.getByRole("button", { name: `Стежити, ${DISPLAY_NAME}` }),
      ).toBeVisible();
      await expect(
        header.getByRole("link", { name: "Редагувати профіль" }),
      ).toHaveCount(0);
      await expect(
        header.locator('summary[aria-label="Інші дії"]'),
      ).toBeVisible();
    } else {
      await expect(
        header.getByRole("button", { name: "Стежити" }),
      ).toBeVisible();
    }
    // Settings and security live in the workspace, never on this page. (The
    // follow and report forms carry the handle as a hidden field; an editable
    // one would be the settings form.)
    await expect(
      page.locator('input[name="handle"]:not([type="hidden"])'),
    ).toHaveCount(0);
    await expect(page.locator('input[name="displayName"]')).toHaveCount(0);
    await expect(page.locator('textarea[name="bio"]')).toHaveCount(0);
    await expect(page.locator('[name="relationshipVisibility"]')).toHaveCount(
      0,
    );
    await expectReflow(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, `profile-${label}.png`),
    });
    await context.close();
  }
});

test("a keyboard reaches the actions, the views and the first entry, in that order", async ({
  browser,
  baseURL,
}) => {
  const context = await readerContext(browser, baseURL!, "member");
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP);
  await page.goto(`/@${gardener.handle}`);
  const header = page.locator('[data-slot="profile-header"]:visible');
  const follow = header.getByRole("button", {
    name: `Стежити, ${DISPLAY_NAME}`,
  });
  await expect(follow).toBeVisible();
  await waitForHydration(page.locator('[role="tablist"]:visible'));

  await follow.focus();
  await page.keyboard.press("Tab");
  await expect(header.locator('summary[aria-label="Інші дії"]')).toBeFocused();
  await page.keyboard.press("Tab");
  const entriesTab = page.getByRole("tab", { name: /Записи/u });
  await expect(entriesTab).toBeFocused();
  // Into the open panel — the panel itself takes focus first, as the ARIA
  // tabs pattern has it — and then the first card's first link.
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="tabpanel"]:visible')).toBeFocused();
  await page.keyboard.press("Tab");
  const firstCard = page
    .locator('[data-profile-entries="true"]:visible [data-slot="entry-card"]')
    .first();
  expect(
    await firstCard.evaluate((card) => card.contains(document.activeElement)),
  ).toBe(true);

  // Back to the tabs: the arrow moves to the objects, and Tab enters them.
  await entriesTab.focus();
  await page.keyboard.press("ArrowRight");
  const objectsTab = page.getByRole("tab", { name: /Об’єкти/u });
  await expect(objectsTab).toBeFocused();
  await expect(objectsTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="tabpanel"]:visible')).toBeFocused();
  await page.keyboard.press("Tab");
  const firstObject = page
    .locator('[data-profile-objects="true"]:visible [data-profile-object]')
    .first();
  expect(
    await firstObject.evaluate((card) => card.contains(document.activeElement)),
  ).toBe(true);
  await context.close();
});

test("an empty profile says so, without a zero, a picture or an invitation", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await readerContext(browser, baseURL!, "guest");
  const page = await context.newPage();
  await page.setViewportSize(NARROW);
  const response = await page.goto(`/@${member.handle}`);
  expect(response?.status()).toBe(200);
  const panel = page.locator('[role="tabpanel"]:visible');
  await expect(panel).toContainText("Опублікованих записів ще немає.");
  await expect(
    panel.locator('[data-screen-state="empty-no-results"]'),
  ).toHaveCount(1);
  await expect(page.locator("[data-profile-counts]")).toHaveCount(0);
  await expect(page.locator('[role="tab"]:visible')).toHaveText([
    "Записи",
    "Об’єкти",
  ]);
  // No picture: the initials, decorative, and no image standing in.
  const avatar = page.locator(
    '[data-slot="profile-header"]:visible [data-slot="avatar"]',
  );
  await expect(avatar).toHaveCount(1);
  await expect(avatar.locator("img")).toHaveCount(0);
  await expectReflow(page);
  await scanAccessibility(page, testInfo, "profile-empty-320");
  await page.screenshot({
    path: path.join(SCREENSHOTS, "profile-empty-320.png"),
  });
  await context.close();
});

test("at 320 px a long bio wraps, nothing scrolls sideways, and axe finds nothing", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await readerContext(browser, baseURL!, "guest");
  const page = await context.newPage();
  await page.setViewportSize(NARROW);
  await page.goto(`/@${gardener.handle}`);
  await expect(page.locator("h1:visible")).toHaveText(DISPLAY_NAME);
  await expectReflow(page);
  await scanAccessibility(page, testInfo, "profile-320");
  await page.screenshot({
    path: path.join(SCREENSHOTS, "profile-guest-320.png"),
    fullPage: false,
  });
  await page.goto(`/@${gardener.handle}?tab=objects`);
  await expectReflow(page);
  await scanAccessibility(page, testInfo, "profile-objects-320");
  await context.close();
});

test("Bulgarian and Russian read their own words", async ({
  browser,
  baseURL,
}) => {
  const context = await readerContext(browser, baseURL!, "guest");
  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  for (const [prefix, entries, objects, status, region] of [
    ["/bg", "Записи", "Обекти", "Страница 1 от 3", "Украйна"],
    ["/ru", "Записи", "Объекты", "Страница 1 из 3", "Украина"],
  ] as const) {
    const response = await page.goto(`${prefix}/@${gardener.handle}`);
    expect(response?.status(), prefix).toBe(200);
    await expect(page.locator('[role="tab"]:visible')).toHaveText([
      `${entries}${ENTRY_COUNT}`,
      `${objects}${OBJECT_COUNT}`,
    ]);
    await expect(
      page.locator(
        '[data-slot="profile-header"]:visible [data-profile-region]',
      ),
    ).toContainText(region);
    await expect(
      page.locator('nav[data-slot="pagination"]:visible').first(),
    ).toContainText(status);
    // A page link keeps the reader's language.
    expect(
      await page
        .locator('nav[data-slot="pagination"]:visible a[rel="next"]')
        .first()
        .getAttribute("href"),
    ).toBe(`${prefix}/@${gardener.handle}?page=2`);
  }
  // The `/uk` prefix folds to the canonical unprefixed address, page and all.
  const folded = await page.request.get(`/uk/@${gardener.handle}?page=2`, {
    maxRedirects: 0,
  });
  expect(folded.status()).toBe(308);
  expect(folded.headers()["location"]).toMatch(
    new RegExp(`/@${gardener.handle}\\?page=2$`, "u"),
  );
  await context.close();
});
