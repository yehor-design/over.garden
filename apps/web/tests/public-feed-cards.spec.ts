import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "playwright/test";

import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";

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
 * The public feed's cards and its discovery bar (`OVE-492`), in a browser,
 * against `next start` and the local database:
 *
 * - a card reads author and date, then the object, then the words, then the
 *   photographs, at a phone's width and a desk's; three photographs sit side
 *   by side, and photographs that arrive late shift and clip nothing;
 * - a backdated entry is dated by its observation and names its publication,
 *   in the feed and in the journals directory, in UK, BG and RU;
 * - a text note draws no photograph's box; a long entry offers Read more with
 *   its name, reachable by keyboard, and Back returns to the card;
 * - the gardener's language is on their words only;
 * - one discovery bar: Latest and Following as modes, plants or animals behind
 *   Filters, and it works with scripts off.
 *
 * Seeded rows reach the filtered views, which render at request time; the
 * static `/` is covered by `static-documents.spec.ts`.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=public-feed-cards.spec.ts
 */

const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const LONG_BODY = Array.from(
  { length: 6 },
  (_, index) =>
    `Абзац ${index + 1}: нижній ярус без плям, пасинки прибрані до другого листка, мульча тримає вологу, а зав'язь на другій китиці рівна.`,
).join(" ");
const PHOTO = readFileSync(
  path.join(process.cwd(), "public/illustrations/empty-journal.webp"),
);

interface Fixture {
  handle: string;
  displayName: string;
  plant: string;
  bees: string;
  text: { id: string; title: string };
  long: { id: string; title: string };
  photos: { id: string; title: string; keyPrefix: string };
  backdated: { id: string; title: string };
  bulgarian: { id: string; title: string };
}

let pool: Pool;
let gardener: SyntheticGardener;
let fixture: Fixture;

test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const context = await browser.newContext();
  try {
    gardener = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove492",
    });
    fixture = await seed();
    // The feed's reads are cached, and rows written by SQL invalidate
    // nothing. One entry published through the real ingress expires the
    // feed's tags, so the next read includes the seeded rows too.
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
            plantObjectId: fixture.plant,
            entryDate: new Date().toISOString().slice(0, 10),
          },
          title: "Через справжню публікацію",
          text: "Цей запис оновлює стрічку.",
        }),
      },
    );
    expect(response.status(), await response.text()).toBe(200);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (gardener) {
    await pool
      .query("delete from media_assets where owner_user_id = $1", [gardener.id])
      .catch(() => undefined);
    await cleanupCollection(pool, gardener.id).catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
});

async function seed(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 6);
  const displayName = "Олена з Полтави";
  await pool.query(
    "update user_public_profiles set display_name = $2 where user_id = $1",
    [gardener.id, displayName],
  );
  const space = randomUUID();
  const plant = randomUUID();
  const bees = randomUUID();
  await pool.query(
    "insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Город')",
    [space, gardener.id],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $3, $4, 'Томат Чорний принц', 'plant', 'unknown'),
            ($2, $3, $4, 'Бджолосім''я Карніка', 'animal', 'unknown')`,
    [plant, bees, gardener.id, space],
  );

  // Published in this order, a second apart, so the newest — the one with
  // three photographs — is the feed's first card.
  let second = 50;
  const entry = async (input: {
    objectId: string;
    title: string;
    body: string;
    entryDaysAgo?: number;
    language?: "uk" | "bg" | "ru";
  }) => {
    const id = randomUUID();
    second -= 1;
    await pool.query(
      `insert into journal_entries
         (id, owner_user_id, space_id, plant_object_id, entry_scope, title, body,
          client_mutation_id, entry_date, content_class, visibility,
          lifecycle_state, published_at, public_slug, source_language)
       values ($1, $2, $3, $4, 'object', $5, $6, $7, current_date - $8::int,
               'real_ugc', 'public', 'active', now() - make_interval(secs => $9),
               $10, $11)`,
      [
        id,
        gardener.id,
        space,
        input.objectId,
        input.title,
        input.body,
        randomUUID(),
        input.entryDaysAgo ?? 0,
        second,
        `ove492-${suffix}-${id.slice(0, 8)}`,
        input.language ?? "uk",
      ],
    );
    return { id, title: input.title };
  };

  const backdated = await entry({
    objectId: plant,
    title: `Весняна розсада ${suffix}`,
    body: "Перша пересадка у більші горщики.",
    entryDaysAgo: 120,
  });
  const bulgarian = await entry({
    objectId: plant,
    title: `Седмичен преглед ${suffix}`,
    body: "Листата са здрави, поливането е редовно.",
    language: "bg",
  });
  const text = await entry({
    objectId: plant,
    title: `Коротка нотатка ${suffix}`,
    body: "Полила ввечері.",
  });
  const long = await entry({
    objectId: plant,
    title: `Довгий огляд ${suffix}`,
    body: LONG_BODY,
  });
  const photos = await entry({
    objectId: plant,
    title: `Три фото ${suffix}`,
    body: "Нижній ярус, китиця і корінь після дощу.",
  });
  const keyPrefix = `derivatives/ove492-${suffix}`;
  for (const [position, size] of [
    [0, [1200, 1600]],
    [1, [1600, 1200]],
    [2, [1600, 900]],
  ] as const) {
    await pool.query(
      `insert into media_assets (id, owner_user_id, journal_entry_id, derivative_key, alt_text, caption,
         document_position, usage_role, intrinsic_width, intrinsic_height, focal_x, focal_y,
         upload_generation, declared_size_bytes, variant_long_edges)
       values ($1, $2, $3, $4, null, $5, $6, 'inline', $7, $8, 0.5, 0.5, 1, 34000, '{}')`,
      [
        randomUUID(),
        gardener.id,
        photos.id,
        `${keyPrefix}/${position + 1}.webp`,
        position === 0 ? "Нижній ярус без плям" : null,
        position,
        size[0],
        size[1],
      ],
    );
  }

  return {
    handle: gardener.handle,
    displayName,
    plant,
    bees,
    text,
    long,
    photos: { ...photos, keyPrefix },
    backdated,
    bulgarian,
  };
}

async function reader(
  context: BrowserContext,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
  ]);
}

/** The seeded photographs arrive late, as a slow network would bring them. */
async function slowPhotographs(page: Page, delayMs = 1_500) {
  await page.route(`**/${fixture.photos.keyPrefix}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ contentType: "image/webp", body: PHOTO });
  });
}

function card(page: Page, id: string): Locator {
  return page.locator(`[data-entry-card="${id}"]`);
}

async function openFeed(page: Page, query = "?kind=plant") {
  // A cache that was just expired may answer once more with what it held.
  await expect
    .poll(
      async () => {
        const response = await page.goto(`/${query}`, { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        return card(page, fixture.photos.id).count();
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(1);
  await expect(card(page, fixture.photos.id)).toBeVisible({ timeout: 20_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: false,
  });
}

async function top(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not laid out");
  return box.y;
}

test.describe("the public feed's cards", () => {
  test("a card reads author and date, the object, the words, then the photographs, at both widths", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await reader(context, baseURL!, "uk");
    await slowPhotographs(page);
    for (const [label, size] of [
      ["1440", DESKTOP],
      ["390", PHONE],
    ] as const) {
      await page.setViewportSize(size);
      await openFeed(page);
      // Whatever the feed opens with, its author is on the first screen.
      const first = page.locator("[data-entry-card]").first();
      const firstByline = first.locator('[data-entry-card-byline="true"]');
      expect(
        (await top(firstByline)) +
          ((await firstByline.boundingBox())?.height ?? 0),
      ).toBeLessThan(size.height);

      // The photographed card, in reading order.
      const photographed = card(page, fixture.photos.id);
      await photographed.scrollIntoViewIfNeeded();
      const byline = photographed.locator('[data-entry-card-byline="true"]');
      const subject = photographed.locator('[data-entry-card-subject="true"]');
      const heading = photographed.getByRole("heading");
      const media = photographed.locator("[data-entry-card-media]");
      await expect(byline.getByRole("link")).toHaveAccessibleName(
        `Автор ${fixture.displayName}`,
      );
      expect(await top(byline)).toBeLessThan(await top(subject));
      expect(await top(subject)).toBeLessThan(await top(heading));
      expect(await top(heading)).toBeLessThan(await top(media));
      // Three photographs, side by side; the first described in words.
      await expect(media).toHaveAttribute("data-entry-card-media", "grid");
      await expect(media.locator("img")).toHaveCount(3);
      await expect(
        media.getByRole("img", { name: "Нижній ярус без плям" }),
      ).toHaveCount(1);
      await expectReflow(page);
      await capture(page, testInfo, `feed-uk-${label}-first-card`);
    }
    await scanAccessibility(page, testInfo, "feed-uk-390-cards");
  });

  test("photographs that arrive late shift nothing and clip nothing", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await reader(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    await slowPhotographs(page, 2_500);
    await openFeed(page);
    const photographed = card(page, fixture.photos.id);
    const before = await photographed.boundingBox();
    await expect
      .poll(
        () =>
          photographed
            .locator("img")
            .evaluateAll((images) =>
              images.every(
                (image) => (image as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        { timeout: 20_000 },
      )
      .toBe(true);
    const after = await photographed.boundingBox();
    expect(after?.height).toBe(before?.height);
    expect(after?.y).toBe(before?.y);
    // Nothing of a photograph spills out of its card.
    const spills = await photographed.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(spills).toBe(false);
  });

  test("a backdated entry is dated by its observation and names its publication, in UK, BG and RU", async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(DESKTOP);
    for (const [locale, published] of [
      ["uk", "Опубліковано"],
      ["bg", "Публикувано"],
      ["ru", "Опубликовано"],
    ] as const) {
      await context.clearCookies();
      await reader(context, baseURL!, locale);
      const prefix = locale === "uk" ? "" : `/${locale}`;
      const response = await page.goto(`${prefix || "/"}?kind=plant`, {
        waitUntil: "load",
      });
      expect(response?.status()).toBe(200);
      const backdated = card(page, fixture.backdated.id);
      await expect(backdated).toBeVisible({ timeout: 20_000 });
      const times = backdated.locator('[data-entry-card-byline="true"] time');
      await expect(times).toHaveCount(2);
      const observed = await times.first().getAttribute("datetime");
      expect(observed).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(
        (Date.now() - Date.parse(`${observed}T00:00:00Z`)) / 86_400_000,
      ).toBeGreaterThan(100);
      await expect(times.nth(1)).toContainText(published);
      // An entry published the day it was observed says so once.
      await expect(
        card(page, fixture.text.id).locator(
          '[data-entry-card-byline="true"] time',
        ),
      ).toHaveCount(1);

      // The journals directory gives the date the same meaning.
      const directory = await page.goto(
        `${prefix}/journals?q=${encodeURIComponent(fixture.backdated.title)}`,
        { waitUntil: "load" },
      );
      expect(directory?.status()).toBe(200);
      const listed = page
        .locator("[data-entry-card]")
        .filter({ hasText: fixture.backdated.title });
      await expect(listed).toBeVisible({ timeout: 20_000 });
      await expect(
        listed.locator('[data-entry-card-published="true"]'),
      ).toContainText(published);
      await expect(
        listed.locator('[data-entry-card-byline="true"] time').first(),
      ).toHaveAttribute("datetime", observed!);
    }
  });

  test("a text note is a short card; a long entry offers Read more by name, and Back returns to it", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await reader(context, baseURL!, "uk");
    await page.setViewportSize(PHONE);
    await slowPhotographs(page, 0);
    await openFeed(page);
    const note = card(page, fixture.text.id);
    await expect(note.locator("[data-entry-card-media]")).toHaveCount(0);
    expect((await note.boundingBox())!.height).toBeLessThan(300);

    const long = card(page, fixture.long.id);
    await expect(
      card(page, fixture.text.id).locator("[data-entry-card-read-more]"),
    ).toHaveCount(0);
    const readMore = long.getByRole("link", {
      name: `Читати далі ${fixture.long.title}`,
    });
    await expect(readMore).toBeVisible();
    await waitForHydration(readMore);
    // The keyboard reaches Read more straight after the title.
    await long.getByRole("heading").getByRole("link").focus();
    await page.keyboard.press("Tab");
    await expect(readMore).toBeFocused();
    await capture(page, testInfo, "feed-uk-390-read-more");
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/@[^/]+\/post\/\d+/u, { timeout: 20_000 });
    // The feed stays mounted and hidden behind the entry (React `<Activity>`).
    await expect(page.locator("main:visible")).toContainText("Абзац 6");
    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(/\?kind=plant$/u);
    await expect(card(page, fixture.long.id)).toBeInViewport({
      timeout: 20_000,
    });
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrolled),
    ).toBeLessThan(400);
  });

  test("the gardener's language is on their words, and the dates keep the page's", async ({
    context,
    page,
    baseURL,
  }) => {
    await reader(context, baseURL!, "uk");
    await page.setViewportSize(DESKTOP);
    await openFeed(page);
    const bulgarian = card(page, fixture.bulgarian.id);
    const marked = bulgarian.locator('[lang="bg"]');
    await expect(marked.first()).toContainText(fixture.bulgarian.title);
    await expect(marked.locator("time")).toHaveCount(0);
    await expect(marked.filter({ hasText: fixture.displayName })).toHaveCount(
      0,
    );
    await expect(
      bulgarian.locator('[data-entry-card-byline="true"] time').first(),
    ).toContainText(/\d{4} р\./u);
  });

  test("one discovery bar: Latest and Following, plants or animals behind Filters", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await reader(context, baseURL!, "uk");
    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size);
      const response = await page.goto("/", { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      const modes = page.locator('[data-filter-bar-modes="true"]');
      await expect(modes).toBeVisible({ timeout: 20_000 });
      await expect(
        modes.getByRole("link", { name: "Останні" }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        modes.getByRole("link", { name: "Підписки" }),
      ).toHaveAttribute("href", "/feed");
      // Plants and animals are not a row of chips on the first screen.
      await expect(
        page.getByRole("button", { name: "Рослини", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator('[data-feed-kind-filters="true"]')).toHaveCount(
        0,
      );
    }
    await scanAccessibility(page, testInfo, "feed-uk-390-bar");

    // Filters: a draft until Show results, then an address.
    await page.setViewportSize(DESKTOP);
    const bar = page.locator('[data-slot="filter-bar"]:visible');
    await waitForHydration(bar);
    await bar.locator('[data-filter-bar-open="true"]').focus();
    await page.keyboard.press("Enter");
    const panel = page.locator('[data-slot="filter-panel"]:popover-open');
    await expect(panel).toBeVisible();
    await panel
      .locator('[data-filter-bar-facet="kind"]')
      .selectOption("animal");
    // A draft: choosing moves nothing.
    expect(new URL(page.url()).searchParams.get("kind")).toBeNull();
    await panel.getByRole("button", { name: "Показати результати" }).click();
    await page.waitForURL(/\/\?kind=animal$/u, { timeout: 20_000 });
    await expect(page.locator('[data-filter-bar-active="1"]')).toBeVisible({
      timeout: 20_000,
    });
    const chip = page.getByRole("link", { name: "Прибрати фільтр: Тварина" });
    await expect(chip).toBeVisible();
    await chip.click();
    await page.waitForURL(/\/$/u, { timeout: 20_000 });

    // Following, and back to Latest.
    await page
      .locator('[data-filter-bar-modes="true"]')
      .getByRole("link", { name: "Підписки" })
      .click();
    await page.waitForURL(/\/feed$/u, { timeout: 20_000 });
    const back = page
      .locator('[data-filter-bar-modes="true"]:visible')
      .getByRole("link", { name: "Останні" });
    await expect(back).toBeVisible({ timeout: 20_000 });
    await back.click();
    await page.waitForURL(/\/$/u, { timeout: 20_000 });
  });

  test("with scripts off, the feed reads in order and its bar is real links and a real form", async ({
    browser,
    baseURL,
    page,
  }) => {
    test.setTimeout(120_000);
    // The static `/` regenerates after the publication in `beforeAll`; wait
    // for it with scripts on, then read it with scripts off. (A filtered view
    // is a query twin that streams, and needs scripts to reveal — ADR-0032.)
    await openFeed(page, "");
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: PHONE,
    });
    try {
      await reader(context, baseURL!, "uk");
      const offline = await context.newPage();
      const response = await offline.goto("/", { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      const photographed = card(offline, fixture.photos.id);
      await expect(photographed).toBeVisible({ timeout: 20_000 });
      expect(
        await top(photographed.locator('[data-entry-card-byline="true"]')),
      ).toBeLessThan(
        await top(photographed.locator("[data-entry-card-media]")),
      );
      await expect(
        offline
          .locator('[data-filter-bar-modes="true"]')
          .getByRole("link", { name: "Підписки" }),
      ).toHaveAttribute("href", "/feed");
      // The Filters button opens its panel natively, and the panel is a GET
      // form that submits without a bundle.
      await offline.locator('[data-filter-bar-open="true"]').click();
      const panel = offline.locator('[data-slot="filter-panel"]:popover-open');
      await expect(panel).toBeVisible();
      await panel
        .locator('[data-filter-bar-facet="kind"]')
        .selectOption("animal");
      await panel.getByRole("button", { name: "Показати результати" }).click();
      // A native GET also sends the facets left at "any", empty.
      await offline.waitForURL(
        (url) =>
          url.pathname === "/" && url.searchParams.get("kind") === "animal",
        { timeout: 20_000 },
      );
    } finally {
      await context.close();
    }
  });
});
