import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

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
import { scanAccessibility } from "./helpers/redesign-accessibility";
import { removeSyntheticGardener } from "./helpers/synthetic-gardener";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * `OVE-496`: the catalogue's door, the search it leads with, and the way from
 * an organism found there to a gardener's own object.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=catalog-door.spec.ts
 *
 * The organisms are the spec's own, written into the local database the way
 * an import writes them: two mints, a cultivar of each (one of them called
 * "4217"), the honey bee, a chanterelle with a Russian name spelled with ё,
 * and sixty-one numbered cultivars for a second page. One mint is written
 * about. The door is a static document cached for days, so it is told the
 * catalogue changed the way production is — a card intent, drained by the
 * cron — and read until it says so. Every search goes through the page's own
 * form; the gardener signs in through the screen; the object is created
 * through object setup and read back from the database.
 */

const PREFIX = "ove496";
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
  "ove-496",
);

type Locale = "uk" | "bg" | "ru";

interface Organism {
  id: string;
  slug: string;
  name: string;
}

let pool: Pool;
const run = randomUUID().slice(0, 6);
const snapshotId = randomUUID();
const assertionId = randomUUID();
const organismIds: string[] = [];
const gardenerIds: string[] = [];
const contexts: BrowserContext[] = [];
const organisms = {} as Record<
  "spicata" | "piperita" | "moroccan" | "numbered" | "bee" | "chanterelle",
  Organism
>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });

  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', $2, 'https://example.test/',
             'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `${PREFIX}-${run}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );

  organisms.spicata = await seedOrganism({
    key: "spicata",
    name: "Mentha spicata",
    rank: "species",
    kingdom: "Plantae",
    names: [
      ["Mentha spicata", "la", "scientific_accepted"],
      ["м'ята колосиста", "uk", "vernacular"],
      ["джоджен", "bg", "vernacular"],
      ["мята колосовая", "ru", "vernacular"],
    ],
  });
  organisms.piperita = await seedOrganism({
    key: "piperita",
    name: "Mentha piperita",
    rank: "species",
    kingdom: "Plantae",
    names: [
      ["Mentha piperita", "la", "scientific_accepted"],
      ["м'ята перцева", "uk", "vernacular"],
      ["пиперментова мента", "bg", "vernacular"],
      ["мята перечная", "ru", "vernacular"],
    ],
  });
  organisms.moroccan = await seedOrganism({
    key: "moroccan",
    name: "Марокканська",
    rank: "cultivar",
    kingdom: "Plantae",
    names: [["Марокканська", "uk", "denomination"]],
    formOf: organisms.spicata.id,
  });
  organisms.numbered = await seedOrganism({
    key: "numbered",
    name: `4217${run.replace(/\D/gu, "").slice(0, 2)}`,
    rank: "cultivar",
    kingdom: "Plantae",
    names: [],
    formOf: organisms.piperita.id,
  });
  organisms.bee = await seedOrganism({
    key: "bee",
    name: "Apis mellifera ove",
    rank: "species",
    kingdom: "Animalia",
    names: [
      ["медоносна бджола ове", "uk", "vernacular"],
      ["медоносна пчела ове", "bg", "vernacular"],
      ["медоносная пчела ове", "ru", "vernacular"],
    ],
  });
  organisms.chanterelle = await seedOrganism({
    key: "chanterelle",
    name: "Cantharellus ove",
    rank: "species",
    kingdom: "Fungi",
    names: [["лисичка жёлтая ове", "ru", "vernacular"]],
  });
  // A second page: sixty-one cultivars of the peppermint.
  for (let index = 1; index <= 61; index += 1) {
    const number = String(index).padStart(3, "0");
    await seedOrganism({
      key: `page-${number}`,
      name: `Перцева ове ${number}`,
      rank: "cultivar",
      kingdom: "Plantae",
      names: [],
      formOf: organisms.piperita.id,
    });
  }

  // The spearmint has been written about: one public entry about a
  // gardener's spearmint is what publishes it (`OVE-519`).
  const author = await createAuthor();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон ове')`,
    [spaceId, author],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state)
     values ($1, $2, $3, 'Моя м''ята', 'plant', $4, 'selected')`,
    [objectId, author, spaceId, organisms.spicata.id],
  );
  await pool.query(
    `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
       visibility, lifecycle_state, published_at, public_slug, client_mutation_id)
     values ($1, $2, $3, 'М''ята відросла', 'Після зрізання м''ята відросла за тиждень.', 'object',
             'public', 'active', now(), $4, $4)`,
    [author, spaceId, objectId, `${PREFIX}-mint-${objectId.slice(0, 8)}`],
  );

  // And the cached door is told, the way production tells it: a card intent,
  // drained by the cron, which expires the catalogue's tags.
  await pool.query(
    `insert into public_projection_intents (
       entity_kind, entity_id, owner_user_id, desired_state, desired_generation,
       desired_reason, privacy_reducing, status, attempts, available_at, updated_at)
     values ('catalog_item', $1::uuid, null, 'present',
       nextval('public_projection_generation_seq'), 'catalog_card', false,
       'pending', 0, now(), now())
     on conflict (entity_kind, entity_id) do update set
       desired_generation = excluded.desired_generation, status = 'pending',
       attempts = 0, available_at = now(), updated_at = now()`,
    [organisms.spicata.id],
  );
  const secret = process.env.CRON_SECRET;
  expect(secret, "the gate runner hands the spec its cron secret").toBeTruthy();
  // `request` is a test fixture; a context's own client is available here.
  const cron = await browser.newContext();
  const drained = await cron.request.post(
    `${baseURL}/api/cron/catalog-card-revalidate`,
    { headers: { authorization: `Bearer ${secret}` } },
  );
  expect(drained.status()).toBe(200);
  await cron.close();
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (!pool) return;
  for (const [table, column] of [
    ["journal_entries", "owner_user_id"],
    ["plant_objects", "owner_user_id"],
    ["spaces", "owner_user_id"],
  ] as const) {
    await pool.query(`delete from ${table} where ${column} = any($1::uuid[])`, [
      gardenerIds,
    ]);
  }
  for (const id of gardenerIds) await removeSyntheticGardener(pool, id);
  await pool.query(
    `delete from public_projection_intents where entity_kind = 'catalog_item' and entity_id = any($1::uuid[])`,
    [organismIds],
  );
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
    organismIds,
  ]);
  await pool.query(
    `delete from catalog_source_assertions where id = $1::uuid`,
    [assertionId],
  );
  await pool.query(`delete from catalog_source_snapshots where id = $1::uuid`, [
    snapshotId,
  ]);
  await pool.end();
});

async function seedOrganism(input: {
  key: string;
  name: string;
  rank: "species" | "cultivar";
  kingdom: "Plantae" | "Animalia" | "Fungi";
  names: ReadonlyArray<readonly [string, string, string]>;
  formOf?: string;
}): Promise<Organism> {
  const id = randomUUID();
  const slug = `${PREFIX}-${input.key}-${run}`;
  await pool.query(
    `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
       source_id, locale, node_kind, rank, kingdom, identity_state, search_weight)
     values ($1, $2, catalog_normalize_name($2), $3, 'internal_seed', $4, $5, $6, $7, $8, 'active', 5)`,
    [
      id,
      input.name,
      slug,
      `${PREFIX}:${run}:${input.key}`,
      input.rank === "species" ? "la" : "uk",
      input.rank === "species" ? "taxon" : "cultivar",
      input.rank,
      input.kingdom,
    ],
  );
  organismIds.push(id);
  // A species a gardener can choose is a member of the standard base
  // (ADR-0035 D3); the setup launch offers no other.
  if (input.rank === "species" && input.kingdom !== "Fungi") {
    const kind = input.kingdom === "Animalia" ? "animal" : "plant";
    await pool.query(
      `insert into catalog_standard_species (
         catalog_item_id, base_key, object_kind, base_group, latin_name, base_version
       )
       values ($1, $2, $3, $4, $5, '2026-09-26')`,
      [
        id,
        `${kind}:${slug}`,
        kind,
        kind === "animal" ? "other_animals" : "herbs",
        input.name,
      ],
    );
  }
  for (const [display, locale, nameType] of input.names) {
    await pool.query(
      `insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
       values ($1, $2, catalog_normalize_name($2), $3, true, $4)
       on conflict do nothing`,
      [id, display, locale, nameType],
    );
  }
  if (input.formOf) {
    await pool.query(
      `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
       values ($1, $2, 'form_of', $3)`,
      [id, input.formOf, assertionId],
    );
  }
  return { id, slug, name: input.name };
}

async function readerContext(
  browser: Browser,
  baseURL: string,
  options: {
    locale?: Locale;
    viewport?: { width: number; height: number };
    javaScriptEnabled?: boolean;
  } = {},
) {
  const locale = options.locale ?? "uk";
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  contexts.push(context);
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
      // Storage may be blocked; the notice is then simply drawn.
    }
  }, CONSENT_KEY);
  return context;
}

function doorPath(locale: Locale) {
  return locale === "uk" ? "/catalog" : `/${locale}/catalog`;
}

/** Searches through the door's own form, as a reader does. */
async function searchFromDoor(
  page: Page,
  locale: Locale,
  query: string,
  scope: "plantae" | "animalia" | "" = "plantae",
) {
  await page.goto(doorPath(locale), { waitUntil: "load" });
  const form = page.locator('[data-catalog-search-form="true"]');
  await form
    .locator(`input[type="radio"][name="kingdom"][value="${scope}"]`)
    .check();
  await form.locator('input[name="q"]').fill(query);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/[?&]q=/u);
}

function row(page: Page, organism: Organism) {
  return page.locator(`[data-catalog-card="${organism.id}"]`);
}

async function rowOrder(page: Page, ids: string[]) {
  return page.evaluate((wanted) => {
    const order = [...document.querySelectorAll("[data-catalog-card]")].map(
      (element) => element.getAttribute("data-catalog-card"),
    );
    return wanted.map((id) => order.indexOf(id));
  }, ids);
}

test.describe("the catalogue's door (OVE-496)", () => {
  test("opens on a search, on what gardeners wrote about, and on a way into the register", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    // The static door refreshes once the drained intent has expired its tags.
    await expect
      .poll(
        async () => {
          await page.goto("/catalog", { waitUntil: "load" });
          return page
            .locator(
              `#catalog-first-hand [data-catalog-card="${organisms.spicata.id}"]`,
            )
            .count();
        },
        { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe(1);

    await expect(page.locator("h1")).toHaveText("Знайдіть рослину чи тварину");
    // At 1280 px a context rail would fit; the door has no second copy of its
    // own kingdoms and registers to put there (OG-UX-015).
    await expect(
      page.locator('[data-site-shell-region="context"]'),
    ).toHaveCount(0);
    const form = page.locator('[data-catalog-search-form="true"]');
    await expect(form.getByRole("radio", { name: "Рослини" })).toBeChecked();
    await expect(
      form.getByRole("radio", { name: "Тварини" }),
    ).not.toBeChecked();
    // Only what gardeners wrote about; the peppermint is not claimed.
    await expect(
      page.locator(
        `#catalog-first-hand [data-catalog-card="${organisms.piperita.id}"]`,
      ),
    ).toHaveCount(0);
    await expect(page.locator("#catalog-legend dt")).toHaveText([
      "Вид",
      "Сорт або порода",
      "Ваша рослина чи тварина",
    ]);
    await expect(
      page.locator('#catalog-all [data-catalog-kingdom="plantae"]'),
    ).toHaveAttribute("href", "/catalog?kingdom=plantae");
    await expect(
      page.locator('#catalog-all nav a[href="/catalog?letter=m"]'),
    ).toHaveCount(1);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "door-1280.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "door-uk-1280");
  });

  test("every way into a view of the register reaches it, on a slow connection too", async ({
    browser,
    baseURL,
  }) => {
    // The register is the door's query twin. While a link's route tree has
    // not arrived, Next 16.2 predicts one from the same path without its
    // query — the door, whose page the router already holds — so a client
    // link asked nothing and changed only the URL. That held from the door
    // and from one view of the register to another: the shell links the door
    // from every page. A prefetch held back is a phone on a slow network,
    // which made it every click (`public-query-twin.ts`).
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.route(
      (url) =>
        url.searchParams.has("letter") || url.searchParams.has("kingdom"),
      async (route) => {
        if (route.request().headers()["next-router-prefetch"]) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
        }
        await route.continue().catch(() => undefined);
      },
    );

    // The prediction needs the door's own route, which the router has once
    // it asks for the door's segments — as it has by the time a reader has
    // scrolled to the letters.
    const doorRouteKnown = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/catalog" &&
          !new URL(response.url()).searchParams.has("letter") &&
          !new URL(response.url()).searchParams.has("kingdom") &&
          response.request().headers()["next-router-segment-prefetch"] !==
            undefined,
      );
    let known = doorRouteKnown();
    await page.goto("/catalog", { waitUntil: "load" });
    await known;
    const letter = page.locator('#catalog-all nav a[href="/catalog?letter=m"]');
    await waitForHydration(letter);
    await letter.scrollIntoViewIfNeeded();
    await letter.click();
    await page.waitForURL(/[?&]letter=m(?:&|$)/u);
    await expect(page.locator("h1:visible")).toHaveText("Каталог організмів");
    await expect(
      page.locator(
        'nav[aria-label="За літерою"]:visible a[aria-current="true"]',
      ),
    ).toHaveText("m");
    await expect(
      page.locator("[data-catalog-card]:visible").first(),
    ).toBeVisible();

    known = doorRouteKnown();
    await page.goto("/catalog", { waitUntil: "load" });
    await known;
    const plants = page.locator(
      '#catalog-all [data-catalog-kingdom="plantae"]',
    );
    await waitForHydration(plants);
    await plants.scrollIntoViewIfNeeded();
    known = doorRouteKnown();
    await plants.click();
    await page.waitForURL(/[?&]kingdom=plantae(?:&|$)/u);
    const plantsView = page.locator(
      'main[data-catalog-browse-kingdom="plantae"]:visible',
    );
    await expect(plantsView).toBeVisible();
    await known;

    // From that view to another: a letter among plants.
    const plantLetter = page.locator(
      'nav[aria-label="За літерою"]:visible a[href="/catalog?kingdom=plantae&letter=m"]',
    );
    await waitForHydration(plantLetter);
    known = doorRouteKnown();
    await plantLetter.click();
    await page.waitForURL(/[?&]letter=m(?:&|$)/u);
    await expect(plantsView).toBeVisible();
    await expect(
      page.locator(
        'nav[aria-label="За літерою"]:visible a[aria-current="true"]',
      ),
    ).toHaveText("m");
    await known;

    // And back out of the letter by its chip, still among plants.
    const chip = page.getByRole("link", { name: "Прибрати фільтр: M" });
    await waitForHydration(chip);
    await chip.click();
    await page.waitForURL(
      (url) =>
        !url.searchParams.has("letter") &&
        url.searchParams.get("kingdom") === "plantae",
    );
    await expect(plantsView).toBeVisible();
    await expect(
      page.locator(
        'nav[aria-label="За літерою"]:visible a[aria-current="true"]',
      ),
    ).toHaveText("Усі літери");
  });

  test("finds a plant by its common name typed any way, a species before its forms", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();

    // A typographic apostrophe finds the names stored with a straight one.
    await searchFromDoor(page, "uk", "м’ята");
    await expect(row(page, organisms.spicata)).toContainText("м'ята колосиста");
    await expect(row(page, organisms.piperita)).toContainText("м'ята перцева");
    // Two species share the name; each says which it is.
    await expect(row(page, organisms.spicata)).toContainText("Mentha spicata");
    await expect(row(page, organisms.piperita)).toContainText(
      "Mentha piperita",
    );

    // The name typed exactly comes first.
    await searchFromDoor(page, "uk", "м'ята перцева");
    const [piperita, spicata] = await rowOrder(page, [
      organisms.piperita.id,
      organisms.spicata.id,
    ]);
    expect(piperita).toBe(0);
    expect(spicata).toBe(-1);

    // A scientific name finds the same card.
    await searchFromDoor(page, "uk", "Mentha spi");
    await expect(row(page, organisms.spicata)).toBeVisible();
  });

  test("a numbered cultivar says which species it belongs to", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await searchFromDoor(page, "uk", organisms.numbered.name);
    await expect(
      row(page, organisms.numbered).locator(
        '[data-catalog-card-species="true"]',
      ),
    ).toHaveText("Сорт виду «м'ята перцева»");
    // Nothing is offered to add from here (`OVE-519`).
    await expect(page.locator("[data-catalog-add-to-garden]")).toHaveCount(0);
  });

  test("a search that finds nothing among plants says where it would", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await searchFromDoor(page, "uk", "медоносна бджола ове", "plantae");
    await expect(page.locator("[data-catalog-card]")).toHaveCount(0);
    const everywhere = page.locator('[data-catalog-search-everywhere="true"]');
    await expect(everywhere).toHaveText("Шукати в усьому каталозі (1)");
    await everywhere.click();
    await expect(row(page, organisms.bee)).toBeVisible();
    // A fungus is found too.
    await searchFromDoor(page, "ru", "лисичка желтая ове", "");
    await expect(row(page, organisms.chanterelle)).toBeVisible();
    // ё typed as ё finds the same.
    await searchFromDoor(page, "ru", "лисичка жёлтая ове", "");
    await expect(row(page, organisms.chanterelle)).toBeVisible();
  });

  test("searches in Bulgarian and Russian — a common name, a scientific one, nothing among plants — and pages past sixty", async ({
    browser,
    baseURL,
  }) => {
    const bg = await (
      await readerContext(browser, baseURL!, { locale: "bg" })
    ).newPage();
    await searchFromDoor(bg, "bg", "джоджен");
    await expect(row(bg, organisms.spicata)).toContainText("джоджен");
    await expect(bg.locator("h1")).toHaveText("Каталог на организмите");
    await searchFromDoor(bg, "bg", "Mentha pip");
    await expect(row(bg, organisms.piperita)).toBeVisible();
    await searchFromDoor(bg, "bg", "медоносна пчела ове", "plantae");
    await expect(bg.locator("[data-catalog-card]")).toHaveCount(0);
    const bgEverywhere = bg.locator('[data-catalog-search-everywhere="true"]');
    await expect(bgEverywhere).toHaveText("Търсене в целия каталог (1)");
    await bgEverywhere.click();
    await expect(row(bg, organisms.bee)).toBeVisible();

    const ru = await (
      await readerContext(browser, baseURL!, { locale: "ru" })
    ).newPage();
    // Two species answer to one common name; each says which it is.
    await searchFromDoor(ru, "ru", "мята");
    await expect(row(ru, organisms.spicata)).toContainText("Mentha spicata");
    await expect(row(ru, organisms.piperita)).toContainText("Mentha piperita");
    await searchFromDoor(ru, "ru", "Mentha spi");
    await expect(row(ru, organisms.spicata)).toBeVisible();
    await searchFromDoor(ru, "ru", "медоносная пчела ове", "plantae");
    await expect(ru.locator("[data-catalog-card]")).toHaveCount(0);
    const ruEverywhere = ru.locator('[data-catalog-search-everywhere="true"]');
    await expect(ruEverywhere).toHaveText("Искать во всём каталоге (1)");
    await ruEverywhere.click();
    await expect(row(ru, organisms.bee)).toBeVisible();

    const page = await (await readerContext(browser, baseURL!)).newPage();
    await searchFromDoor(page, "uk", "Перцева ове");
    await expect(page.locator("[data-catalog-card]")).toHaveCount(60);
    await expect(page.locator("[data-catalog-result-count]")).toHaveText(
      "61 організмів",
    );
    await page.getByRole("link", { name: "Наступна сторінка" }).click();
    await page.waitForURL(/page=2/u);
    await expect(page.locator("[data-catalog-card]")).toHaveCount(1);
  });

  test("the search is asked and answered before any script runs", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, {
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    // The door is a static document: its form is on the screen and works
    // with no runtime at all.
    await page.goto("/catalog", { waitUntil: "load" });
    await expect(
      page.locator('[data-catalog-search-form="true"]'),
    ).toBeVisible();
    await searchFromDoor(page, "uk", "м'ята колосиста");
    expect(new URL(page.url()).searchParams.get("kingdom")).toBe("plantae");
    // The answer is request-time content from the listing's query twin: it is
    // in the served document, streamed, as every twin's is (ADR-0032 D5;
    // revealing a streamed segment takes the runtime, the owner's standing
    // decision of 2026-09-04).
    expect(await page.content()).toContain(
      `data-catalog-card="${organisms.spicata.id}"`,
    );
  });

  test("axe finds nothing on the door and a result list, in UK, BG and RU at 320 and 1280 px", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    for (const locale of ["uk", "bg", "ru"] as const) {
      for (const width of [320, 1280] as const) {
        const context = await readerContext(browser, baseURL!, {
          locale,
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        await page.goto(doorPath(locale), { waitUntil: "load" });
        await expect(page.locator('[data-catalog-view="door"]')).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
          `door ${locale} ${width}`,
        ).toBeLessThanOrEqual(0);
        await scanAccessibility(page, testInfo, `door-${locale}-${width}`);
        const query = { uk: "м'ята", bg: "джоджен", ru: "мята" }[locale];
        await searchFromDoor(page, locale, query);
        await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
          `results ${locale} ${width}`,
        ).toBeLessThanOrEqual(0);
        await scanAccessibility(page, testInfo, `results-${locale}-${width}`);
        if (width === 320) {
          await page.screenshot({
            path: path.join(SCREENSHOTS, `results-${locale}-320.png`),
            fullPage: true,
          });
          await page.goto(doorPath(locale), { waitUntil: "load" });
          await page.screenshot({
            path: path.join(SCREENSHOTS, `door-${locale}-320.png`),
            fullPage: true,
          });
        }
        await context.close();
      }
    }
  });
});

/** A gardener who writes, with the handle sign-up's trigger claims for them. */
async function createAuthor() {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [
      id,
      `${PREFIX}-author-${id}@example.test`,
      PRIVATE_AUTH_COMPATIBILITY_NAME,
    ],
  );
  await acceptLegalDocuments(pool, id);
  gardenerIds.push(id);
  return id;
}
