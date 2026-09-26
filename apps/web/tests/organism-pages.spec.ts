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
 * `OVE-497`, as `OVE-519` left it: an organism's page is its names, a short
 * text and what gardeners wrote, and its forms live in their own register
 * view, which the page no longer lists or links.
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
/** A species and a cultivar gardeners here wrote about, with an editors' note no page shows. */
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

const speciesPath = (organism: Organism, locale: Locale = "uk") =>
  `${locale === "uk" ? "" : `/${locale}`}/species/${organism.slug}`;
const formsPath = (organism: Organism, locale: Locale = "uk") =>
  `${speciesPath(organism, locale)}/register`;

test.describe("an organism's pages (OVE-497)", () => {
  test("a species with 621 forms is its names, its text and «Записи» — not a list of forms", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(
      `${baseURL}${speciesPath(organisms.tomato)}`,
      { headers: { cookie: `${LOCALE_COOKIE}=uk` } },
    );
    expect(response.status()).toBe(200);
    const html = await response.text();

    // The name a gardener knows it by, the Latin name beneath it as Latin.
    expect(html).toMatch(/<h1[^>]*>Помідор ове<\/h1>/u);
    expect(html).toMatch(
      /<p lang="la" data-species-latin="true"[^>]*>Solanum oveum<\/p>/u,
    );
    // The text under the names is the meta description, word for word.
    const text =
      "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.";
    expect(html).toContain(`>${text}</p>`);
    expect(html).toContain(`<meta name="description" content="${text}"/>`);
    // Nobody wrote about it: noindex, and the empty state under «Записи».
    expect(html).toContain('data-species-published="false"');
    expect(html).toMatch(/name="robots" content="noindex, nofollow"/u);
    expect(html).toContain("Публічних записів ще немає.");
    // Nothing else: no forms, no counts, no crumbs, no way into the garden.
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main).not.toContain("Сорт ове");
    expect(main).not.toContain("621");
    expect(main).not.toContain(formsPath(organisms.tomato));
    expect(main).not.toContain("/garden/objects/new");
    expect(main).not.toContain("Публічний");
  });

  test("the forms live in their register — searched, paged — and Back returns to the same view", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(formsPath(organisms.tomato), { waitUntil: "load" });
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
    await waitForHydration(field);
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

    // Into the form: its name, and its species as a link back up (`OVE-519`).
    await row.getByRole("link", { name: "Де Барао ове" }).click();
    await page.waitForURL(
      `**/species/${organisms.tomato.slug}/${organisms.barao.slug}`,
    );
    const form = page.locator("main[data-species-page]");
    await expect(form.locator("h1")).toHaveText("Де Барао ове");
    await expect(form.locator("[data-species-parent]")).toHaveAttribute(
      "href",
      speciesPath(organisms.tomato),
    );
    await expect(form.locator("[data-species-parent]")).toHaveText(
      "Помідор ове Solanum oveum",
    );
    await expect(form.locator("[data-species-text]")).toHaveText(
      "Записи про цей сорт від людей, які ведуть його журнал на Overgarden.",
    );
    // The register's facts stay in the register: the page shows no source.
    await expect(form).not.toContainText("Держреєстр України");
    await expect(form).not.toContainText(`9497${digits}`);
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
    // register streams, so the answer is the not-found page in a response
    // already kept out of the index: no register is rendered at all. (The
    // not-found words themselves are in every page's shell, so they prove
    // nothing.)
    const last = await get(`${formsPath(organisms.tomato)}?page=7`);
    expect(await last.text()).toContain('data-public-catalog-register="true"');
    const past = await get(`${formsPath(organisms.tomato)}?page=8`);
    expect(past.headers()["x-robots-tag"]).toBe("noindex, follow");
    expect(await past.text()).not.toContain(
      'data-public-catalog-register="true"',
    );
    // A species with no forms has no register at all.
    expect((await get(formsPath(organisms.fungus))).status()).toBe(404);
  });

  test("a species with one form names none; a fungus with no name is its Latin name", async ({
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
    expect(mint).not.toContain("Мароко ове");
    expect(mint).not.toContain("Усі форми");

    const fungus = await get(speciesPath(organisms.fungus));
    // No common name in the catalogue: the heading is the accepted name,
    // marked as Latin, and nothing is left blank or said twice.
    expect(fungus).toMatch(/<h1 lang="la"[^>]*>Boletus oveus<\/h1>/u);
    expect(fungus).not.toContain("data-species-latin");
    // Neither a plant nor an animal: the page says «вид».
    expect(fungus).toContain(
      "Записи про цей вид від людей, які ведуть його журнал на Overgarden.",
    );
  });

  test("an animal's forms are its breeds in its register, in Bulgarian and Russian too", async ({
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

    // The bee's own page, fully in Bulgarian, lists no breed.
    const card = await request.get(
      `${baseURL}${speciesPath(organisms.bee, "bg")}`,
      { headers: { cookie: `${LOCALE_COOKIE}=bg` } },
    );
    const cardHtml = await card.text();
    expect(cardHtml).toContain(
      "Записи за това животно от хора, които водят дневника му в Overgarden.",
    );
    expect(cardHtml).toContain("Още няма публични записи.");
    expect(cardHtml).not.toContain("Карпатка ове");
  });

  test("a cultivar's entry is on its page and on its species', and nothing but entries is", async ({
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
    const entries = (html: string) =>
      [
        ...html
          .slice(html.indexOf('id="species-entries"'))
          .matchAll(/<li class="min-w-0">/gu),
      ].length;

    // The species lists its own entry and its cultivar's (`OVE-519`).
    const species = await get(`/species/${evidence.speciesSlug}`);
    expect(species).toContain('data-species-published="true"');
    expect(species).toMatch(/name="robots" content="index, follow"/u);
    expect(entries(species)).toBe(2);
    // The cultivar lists its own.
    const form = await get(
      `/species/${evidence.speciesSlug}/${evidence.formSlug}`,
    );
    expect(form).toContain('data-species-published="true"');
    expect(entries(form)).toBe(1);
    // The editors' note stays in the database; no section, no source.
    for (const html of [species, form]) {
      expect(html).not.toContain("Як його вирощують");
      expect(html).not.toContain("Від редакції");
      expect(html).not.toContain("State Register of Plant Varieties");
      expect(html).not.toContain("data-organism-section");
    }
  });

  test("the page is read before any script runs", async ({
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
      page.getByRole("heading", { level: 2, name: "Записи" }),
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
