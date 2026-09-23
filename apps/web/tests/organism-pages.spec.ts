import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "playwright/test";
import { Pool } from "pg";

import { waitForHydration } from "./helpers/hydration";
import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";

/**
 * `OVE-497`: an organism's page leads with who it is and what gardeners
 * wrote, and its forms live in their own register view.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=organism-pages.spec.ts
 *
 * The organisms are the spec's own, written the way an import writes them:
 * a species with 621 forms (the tomato's count in production), one of them
 * written about and one registered with a number and a status; a species
 * with one form; a fungus with no forms and no common name; and a honey bee
 * with a breed. The pages are read as a reader reads them — the served bytes
 * for what is static, a browser for what is clicked.
 */

const PREFIX = "ove497";
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
  "ove-497",
);

type Locale = "uk" | "bg" | "ru";

let pool: Pool;
const run = randomUUID().slice(0, 6);
const digits = String(parseInt(run, 16) % 100_000).padStart(5, "0");
const snapshotId = randomUUID();
const assertionId = randomUUID();
const organismIds: string[] = [];
const contexts: BrowserContext[] = [];
/** A species and a cultivar gardeners here wrote about, with the editors' note. */
let evidence: OrganismFixture;

interface Organism {
  id: string;
  slug: string;
  name: string;
}
const organisms = {} as Record<
  | "tomato"
  | "barao"
  | "written"
  | "mint"
  | "moroccan"
  | "fungus"
  | "bee"
  | "carpathian",
  Organism
>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });

  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'Ukraine State Register of Plant Varieties', 'taxonomy', $2,
             'https://example.test/', 'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `${PREFIX}-${run}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );

  organisms.tomato = await seedOrganism({
    key: "tomato",
    name: "Solanum oveum",
    rank: "species",
    kingdom: "Plantae",
    source: "species_backbone",
    names: [
      ["помідор ове", "uk", "vernacular"],
      ["домат ове", "bg", "vernacular"],
      ["помидор ове", "ru", "vernacular"],
    ],
  });
  organisms.barao = await seedOrganism({
    key: "barao",
    name: "Де Барао ове",
    rank: "cultivar",
    kingdom: "Plantae",
    source: "ua_state_register",
    names: [["Де Барао ове", "uk", "denomination"]],
    formOf: organisms.tomato.id,
    registeredUa: true,
  });
  await pool.query(
    `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
     values ($1, 'ua_register', $2, $3)`,
    [organisms.barao.id, `RegisterVarietis:9497${digits}`, assertionId],
  );
  await pool.query(
    `insert into catalog_item_facts (catalog_item_id, predicate, region_code, value, value_normalized, assertion_id)
     values ($1, 'registration_status', 'UA', 'registered', 'registered', $2)`,
    [organisms.barao.id, assertionId],
  );
  organisms.written = await seedOrganism({
    key: "written",
    name: "Яблучко ове",
    rank: "cultivar",
    kingdom: "Plantae",
    source: "ua_state_register",
    names: [],
    formOf: organisms.tomato.id,
  });
  // Somebody here wrote about this one: it comes first among the dozen.
  await pool.query(
    `update catalog_items set first_hand_content_at = now() where id = $1::uuid`,
    [organisms.written.id],
  );
  // And 619 more, for 621 in all.
  const bulk = await pool.query<{ id: string }>(
    `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
       source_id, locale, node_kind, rank, kingdom, identity_state, search_weight)
     select gen_random_uuid(), 'Сорт ове ' || lpad(n::text, 3, '0'),
            catalog_normalize_name('Сорт ове ' || lpad(n::text, 3, '0')),
            $1 || '-f' || n, 'ua_state_register', $2 || ':f' || n, 'uk',
            'cultivar', 'cultivar', 'Plantae', 'active', 1
     from generate_series(1, 619) as n
     returning id`,
    [`${PREFIX}-${run}`, `${PREFIX}:${run}`],
  );
  organismIds.push(...bulk.rows.map((row) => row.id));
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     select form_id, $2::uuid, 'form_of', $3::uuid from unnest($1::uuid[]) as form_id`,
    [bulk.rows.map((row) => row.id), organisms.tomato.id, assertionId],
  );

  organisms.mint = await seedOrganism({
    key: "mint",
    name: "Mentha oveum",
    rank: "species",
    kingdom: "Plantae",
    source: "species_backbone",
    names: [["м'ята ове", "uk", "vernacular"]],
  });
  organisms.moroccan = await seedOrganism({
    key: "moroccan",
    name: "Мароко ове",
    rank: "cultivar",
    kingdom: "Plantae",
    source: "ua_state_register",
    names: [],
    formOf: organisms.mint.id,
  });
  // No common name in any language, no forms, nothing anybody keeps.
  organisms.fungus = await seedOrganism({
    key: "fungus",
    name: "Boletus oveus",
    rank: "species",
    kingdom: "Fungi",
    source: "species_backbone",
    names: [],
  });
  organisms.bee = await seedOrganism({
    key: "bee",
    name: "Apis oveum",
    rank: "species",
    kingdom: "Animalia",
    source: "species_backbone",
    names: [["медоносна бджола ове", "uk", "vernacular"]],
  });
  organisms.carpathian = await seedOrganism({
    key: "carpathian",
    name: "Карпатка ове",
    rank: "cultivar",
    kingdom: "Animalia",
    source: "ua_official_bee_breed",
    names: [],
    formOf: organisms.bee.id,
  });

  evidence = await seedOrganismFixture(pool, `${PREFIX}e`);
  await pool.query(
    `insert into variety_seed_proofs (catalog_item_id, title, summary, body, source_label, status, author_user_id, published_at)
     values ($1, 'Як його вирощують', 'Коротко, для початку.', 'Висаджують після останніх заморозків, у теплий ґрунт, і не поспішають із поливом, доки розсада не прийметься на новому місці.', 'OverGarden', 'published', $2, now())`,
    [evidence.formId, evidence.ownerUserId],
  );
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (!pool) return;
  if (evidence) {
    await pool.query(
      `delete from variety_seed_proofs where catalog_item_id = $1::uuid`,
      [evidence.formId],
    );
    await cleanupOrganismFixture(pool, evidence);
  }
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
  source: string;
  names: ReadonlyArray<readonly [string, string, string]>;
  formOf?: string;
  registeredUa?: boolean;
}): Promise<Organism> {
  const id = randomUUID();
  const slug = `${PREFIX}-${input.key}-${run}`;
  await pool.query(
    `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
       source_id, locale, node_kind, rank, kingdom, identity_state, search_weight, registered_ua)
     values ($1, $2, catalog_normalize_name($2), $3, $4, $5, $6, $7, $8, $9, 'active', 5, $10)`,
    [
      id,
      input.name,
      slug,
      input.source,
      `${PREFIX}:${run}:${input.key}`,
      input.rank === "species" ? "la" : "uk",
      input.rank === "species" ? "taxon" : "cultivar",
      input.rank,
      input.kingdom,
      input.registeredUa ?? false,
    ],
  );
  organismIds.push(id);
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

const speciesPath = (organism: Organism, locale: Locale = "uk") =>
  `${locale === "uk" ? "" : `/${locale}`}/species/${organism.slug}`;
const formsPath = (organism: Organism, locale: Locale = "uk") =>
  `${speciesPath(organism, locale)}/register`;

test.describe("an organism's pages (OVE-497)", () => {
  test("a species with 621 forms leads with who it is, and names a dozen of them", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(
      `${baseURL}${speciesPath(organisms.tomato)}`,
      { headers: { cookie: `${LOCALE_COOKIE}=uk` } },
    );
    expect(response.status()).toBe(200);
    const html = await response.text();

    // The name a gardener knows it by, the scientific name beneath it as
    // Latin, the kind in plain words.
    expect(html).toMatch(/<h1[^>]*>Помідор ове<\/h1>/u);
    expect(html).toMatch(
      /<p lang="la" data-organism-scientific-name="true"[^>]*>Solanum oveum<\/p>/u,
    );
    expect(html).toContain(">вид</p>");
    // Not "Публічний вид": the card says what the organism is. (The site's
    // own footer, outside the card, says what the site is.)
    const card = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(card).not.toContain("Публічний");
    expect(html).toMatch(
      /<meta name="description" content="Solanum oveum — вид\. У каталозі 621 форма цього виду\./u,
    );
    // No counts of nothing: the paragraph already says nobody has written.
    expect(html).not.toMatch(/>0 записів</u);
    expect(html).toContain("Публічних записів садівників ще немає.");
    // What a gardener can do with it, and where it is in the catalogue.
    expect(html).toContain(
      `href="/garden/objects/new?catalog=${organisms.tomato.slug}"`,
    );
    expect(html).toContain('data-organism-crumb="catalogue"');

    // A dozen forms, the one written about first — not 621 chips.
    const forms = html.slice(
      html.indexOf('data-organism-relations="forms"'),
      html.indexOf("</ul>", html.indexOf('data-organism-relations="forms"')),
    );
    const named = [...forms.matchAll(/<li>/gu)].length;
    expect(named).toBe(12);
    expect(forms.indexOf("Яблучко ове")).toBeGreaterThan(-1);
    expect(forms.indexOf("Яблучко ове")).toBeLessThan(
      forms.indexOf("Сорт ове"),
    );
    expect(html).toContain(">Тут 12 з 621.</p>");
    expect(html).toMatch(
      new RegExp(
        `href="${formsPath(organisms.tomato)}"[^>]*data-organism-register-hub="true"|data-organism-register-hub="true"[^>]*href="${formsPath(organisms.tomato)}"`,
        "u",
      ),
    );
    expect(html).toContain("Усі форми (621)");
    // The editors' note and the sources never pass as a gardener's journal:
    // nobody wrote, so there is no experience section at all.
    expect(html).not.toContain('data-organism-section="experience"');
  });

  test("the forms live in their register — searched, paged — and Back returns to the same view", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(speciesPath(organisms.tomato), { waitUntil: "load" });
    await page.screenshot({
      path: path.join(SCREENSHOTS, "species-621-1280.png"),
      fullPage: true,
    });

    const allForms = page.locator('[data-organism-register-hub="true"]');
    await waitForHydration(allForms);
    await allForms.click();
    await page.waitForURL(`**${formsPath(organisms.tomato)}`);
    const hub = page.locator('main[data-public-catalog-register="true"]');
    await expect(hub.locator("h1")).toHaveText("Сорти виду «помідор ове»");
    await expect(hub.locator('[data-register-count="true"]')).toHaveText(
      "Усього: 621",
    );
    await expect(hub.locator("[data-register-form]")).toHaveCount(100);
    await expect(hub.getByText("Сторінка 1 з 7")).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "register-1280.png"),
    });
    await scanAccessibility(page, testInfo, "register-uk-1280");

    // By keyboard: the field, a word of a name, Enter.
    const field = hub.locator(
      'form[data-register-search="true"] input[name="q"]',
    );
    await field.focus();
    await expect(field).toBeFocused();
    await page.keyboard.type("барао");
    await page.keyboard.press("Enter");
    await page.waitForURL(/[?&]q=/u);
    await expect(hub.locator('[data-register-result="true"]')).toContainText(
      "За «барао» знайдено: 1",
    );
    const row = hub.locator(`[data-register-form="${organisms.barao.id}"]`);
    await expect(row).toContainText("Де Барао ове");
    // The number a seed packet quotes, not the ingest's identifier.
    await expect(row).toContainText(`Держреєстр України: 9497${digits}`);

    // Into the form, and its crumbs lead back up.
    await row.getByRole("link", { name: "Де Барао ове" }).click();
    await page.waitForURL(
      `**/species/${organisms.tomato.slug}/${organisms.barao.slug}`,
    );
    const card = page.locator('main[data-public-organism-card="true"]');
    await expect(card.locator("h1")).toHaveText("Де Барао ове");
    // Its species as the reader knows it, quoted.
    await expect(card.locator("[data-organism-fact]")).toContainText(
      "сорт виду «помідор ове»",
    );
    await expect(card.locator('[data-organism-crumb="species"]')).toHaveText(
      "Помідор ове",
    );
    await expect(card.locator('[data-organism-crumb="forms"]')).toHaveAttribute(
      "href",
      formsPath(organisms.tomato),
    );
    // The source's facts in words: the register by its name, the status and
    // the country in the reader's language, the number as printed.
    const sources = card.locator('[data-organism-section="names-and-sources"]');
    await expect(sources).toContainText("Держреєстр України");
    await expect(sources).toContainText(`9497${digits}`);
    await expect(sources).not.toContainText("RegisterVarietis:");
    await expect(sources).toContainText("зареєстровано");
    await expect(sources).toContainText("(Україна)");
    await expect(sources).not.toContainText("ua_state_register");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "form-1280.png"),
      fullPage: true,
    });

    // Back returns to the same search.
    await page.goBack();
    await page.waitForURL(/[?&]q=%D0%B1%D0%B0%D1%80%D0%B0%D0%BE/u);
    await expect(
      page.locator('form[data-register-search="true"] input[name="q"]'),
    ).toHaveValue("барао");
    await expect(
      page.locator(`[data-register-form="${organisms.barao.id}"]`),
    ).toBeVisible();

    // Every form: the next page, and then back to the first.
    await page.getByRole("link", { name: "Показати всі" }).click();
    await page.waitForURL(`**${formsPath(organisms.tomato)}`);
    await page.getByRole("link", { name: "Наступна сторінка" }).click();
    await page.waitForURL(/[?&]page=2/u);
    await expect(page.getByText("Сторінка 2 з 7")).toBeVisible();
    await expect(
      page.locator(
        'main[data-public-catalog-register="true"] [data-register-form]',
      ),
    ).toHaveCount(100);
  });

  test("a view of the register is followed and kept out of the index; past the last page is a 404", async ({
    request,
    baseURL,
  }) => {
    const get = (url: string) =>
      request.get(`${baseURL}${url}`, {
        headers: { cookie: `${LOCALE_COOKIE}=uk` },
        maxRedirects: 0,
      });
    const root = await get(formsPath(organisms.tomato));
    expect(root.status()).toBe(200);
    expect(root.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
    for (const view of ["?page=2", "?q=%D0%B1%D0%B0%D1%80%D0%B0%D0%BE"]) {
      const response = await get(`${formsPath(organisms.tomato)}${view}`);
      expect(response.status(), view).toBe(200);
      expect(response.headers()["x-robots-tag"], view).toBe("noindex, follow");
    }
    // Seven pages of a hundred; the eighth is not a page (ADR-0029 D3). The
    // register streams, so the answer is the not-found page in the bytes of
    // a response already kept out of the index.
    const past = await get(`${formsPath(organisms.tomato)}?page=8`);
    expect(past.headers()["x-robots-tag"]).toBe("noindex, follow");
    expect(await past.text()).toContain("Сторінку не знайдено");
    // A species with no forms has no register at all.
    expect((await get(formsPath(organisms.fungus))).status()).toBe(404);
  });

  test("one form is named without a count to apologise for; a fungus with no name is its Latin name", async ({
    request,
    baseURL,
  }) => {
    const get = async (url: string) => {
      const response = await request.get(`${baseURL}${url}`, {
        headers: { cookie: `${LOCALE_COOKIE}=uk` },
      });
      expect(response.status(), url).toBe(200);
      return response.text();
    };

    const mint = await get(speciesPath(organisms.mint));
    expect(mint).toMatch(/<h1[^>]*>М&#x27;ята ове<\/h1>/u);
    expect(mint).toContain("Мароко ове");
    expect(mint).toContain("Усі форми (1)");
    expect(mint).not.toContain("data-organism-forms-shown");

    const fungus = await get(speciesPath(organisms.fungus));
    // No common name in the catalogue: the heading is the accepted name,
    // marked as Latin, and nothing is left blank.
    expect(fungus).toMatch(/<h1 lang="la"[^>]*>Boletus oveus<\/h1>/u);
    expect(fungus).not.toContain("data-organism-scientific-name");
    expect(fungus).not.toContain('data-organism-relations="forms"');
    expect(fungus).not.toContain("data-organism-register-hub");
    // Nobody keeps a fungus.
    expect(fungus).not.toContain("data-organism-add-to-garden");
  });

  test("an animal's forms are its breeds, in Bulgarian and Russian too", async ({
    request,
    baseURL,
  }) => {
    const bg = await request.get(
      `${baseURL}${formsPath(organisms.bee, "bg")}`,
      {
        headers: { cookie: `${LOCALE_COOKIE}=bg` },
      },
    );
    expect(bg.status()).toBe(200);
    // No Bulgarian name for this bee: the accepted name stands in.
    expect(await bg.text()).toContain("Породи на вида „Apis oveum“");
    const ru = await request.get(
      `${baseURL}${formsPath(organisms.tomato, "ru")}`,
      { headers: { cookie: `${LOCALE_COOKIE}=ru` } },
    );
    const ruHtml = await ru.text();
    expect(ruHtml).toContain("Сорта вида «помидор ове»");
    expect(ruHtml).toContain("Страница 1 из 7");

    const card = await request.get(
      `${baseURL}${speciesPath(organisms.bee, "bg")}`,
      { headers: { cookie: `${LOCALE_COOKIE}=bg` } },
    );
    const cardHtml = await card.text();
    expect(cardHtml).toContain("Карпатка ове");
    expect(cardHtml).toContain("Всички форми (1)");
  });

  test("gardeners' journals, the editors' note and the sources are three things, each said for what it is", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(
      `${baseURL}/species/${evidence.speciesSlug}/${evidence.formSlug}`,
      { headers: { cookie: `${LOCALE_COOKIE}=uk` } },
    );
    expect(response.status()).toBe(200);
    const html = await response.text();
    const order = [...html.matchAll(/data-organism-section="([a-z-]+)"/gu)].map(
      (match) => match[1]!,
    );
    // What gardeners wrote, then what the editors wrote, then the sources.
    expect(order.indexOf("experience")).toBeGreaterThan(order.indexOf("facts"));
    expect(order.indexOf("editorial")).toBeGreaterThan(
      order.indexOf("experience"),
    );
    expect(order.indexOf("names-and-sources")).toBeGreaterThan(
      order.indexOf("editorial"),
    );
    // The experience is referenced: each entry leads to the journal it is from.
    const experience = html.slice(
      html.indexOf('data-organism-section="experience"'),
      html.indexOf('data-organism-section="editorial"'),
    );
    expect(experience).toContain("Відкрити вихідний запис");
    // And the editors' note says whose it is.
    const editorial = html.slice(
      html.indexOf('data-organism-section="editorial"'),
      html.indexOf('data-organism-section="names-and-sources"'),
    );
    expect(editorial).toContain("Від редакції OverGarden");
    expect(editorial).toContain("Як його вирощують");
    expect(editorial).not.toContain("Відкрити вихідний запис");
  });

  test("the card is read before any script runs", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, {
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(speciesPath(organisms.tomato), { waitUntil: "load" });
    await expect(page.locator("h1")).toHaveText("Помідор ове");
    await expect(
      page.locator('[data-organism-register-hub="true"]'),
    ).toBeVisible();
  });

  test("axe finds nothing on a species, a form and a register, in UK, BG and RU at 390 and 1280 px", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    for (const locale of ["uk", "bg", "ru"] as const) {
      for (const width of [390, 1280] as const) {
        const context = await readerContext(browser, baseURL!, {
          locale,
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        for (const [name, url] of [
          ["species", speciesPath(organisms.tomato, locale)],
          [
            "form",
            `${speciesPath(organisms.tomato, locale)}/${organisms.barao.slug}`,
          ],
          ["register", formsPath(organisms.tomato, locale)],
        ] as const) {
          await page.goto(url, { waitUntil: "load" });
          await expect(page.locator("h1").first()).toBeVisible();
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            ),
            `${name} ${locale} ${width}`,
          ).toBeLessThanOrEqual(0);
          await scanAccessibility(page, testInfo, `${name}-${locale}-${width}`);
          if (width === 390 && locale === "uk") {
            await page.screenshot({
              path: path.join(SCREENSHOTS, `${name}-uk-390.png`),
              fullPage: name !== "register",
            });
          }
        }
        await context.close();
      }
    }
  });
});
