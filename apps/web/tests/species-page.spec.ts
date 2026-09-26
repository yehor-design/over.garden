import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "playwright/test";
import { Pool } from "pg";

import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import { waitForHydration } from "./helpers/hydration";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * A species page (`OVE-519`, DESIGN.md §5.18), end to end against a
 * production build and a real database:
 *
 *   1. publishing the first public entry about an object of a cultivar
 *      publishes the cultivar's page and its species' page — `index, follow`,
 *      in the sitemap, the entry under «Записи» on both — and deleting that
 *      entry unpublishes both: `noindex`, out of the sitemap, the empty
 *      state, and the addresses still answer 200. Both through the product's
 *      own endpoints, so the cached documents are proven to follow;
 *   2. the page is the five parts and nothing else, its meta description is
 *      its visible text, and its JSON-LD names only what it shows;
 *   3. «Записи» reads in portions of twenty, newest first: the next portion
 *      arrives on scroll, has its own `?cursor=` address that is followed and
 *      not indexed, and a cursor past the end is a real 404;
 *   4. Bulgarian and Russian are the page's own words;
 *   5. axe finds nothing, and nothing scrolls sideways, at 375, 1024 and
 *      1440 px.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=species-page.spec.ts
 *
 * `SPECIES_PROOF_SCREENSHOTS=1` also writes the screenshots the pull request
 * shows next to the Threads reference, to `docs/proof/species-page/`.
 */

const PREFIX = "ove519";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "proof",
  "species-page",
);
const PLANT_TEXT =
  "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.";

type Locale = "uk" | "bg" | "ru";

let pool: Pool;
const run = randomUUID().slice(0, 8);
const snapshotId = randomUUID();
const assertionId = randomUUID();
const catalogIds: string[] = [];
const userIds: string[] = [];
const contexts: BrowserContext[] = [];

interface Organism {
  id: string;
  slug: string;
}
/** The tomato and its cultivar «Черокі» (the acceptance's own example). */
let tomato: Organism;
let cherokee: Organism;
/** A species with twenty-one entries, for the portions. */
let pepper: Organism;
/** A species nobody wrote about. */
let quiet: Organism;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', $2, 'https://example.test/',
             'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `${PREFIX}-${run}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id)
     values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );
  tomato = await seedOrganism({
    name: `Solanum ove${run}`,
    nodeKind: "taxon",
    names: [
      [`Solanum ove${run}`, "la", "scientific_accepted"],
      [`помідор ове${run}`, "uk", "vernacular"],
      [`домат ове${run}`, "bg", "vernacular"],
      [`помидор ове${run}`, "ru", "vernacular"],
    ],
  });
  cherokee = await seedOrganism({
    name: `Черокі ове${run}`,
    nodeKind: "cultivar",
    names: [[`Черокі ове${run}`, "uk", "denomination"]],
    formOf: tomato.id,
  });
  pepper = await seedOrganism({
    name: `Capsicum ove${run}`,
    nodeKind: "taxon",
    names: [
      [`Capsicum ove${run}`, "la", "scientific_accepted"],
      [`перець ове${run}`, "uk", "vernacular"],
    ],
  });
  quiet = await seedOrganism({
    name: `Cucumis ove${run}`,
    nodeKind: "taxon",
    names: [[`Cucumis ove${run}`, "la", "scientific_accepted"]],
  });

  // Twenty-one entries about a gardener's pepper, an hour apart, so the
  // newest twenty are the first portion and the oldest is the next.
  const author = await createAuthor("pepper");
  const spaceId = randomUUID();
  const objectId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Грядка ове')`,
    [spaceId, author],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state)
     values ($1, $2, $3, 'Перець на грядці', 'plant', $4, 'selected')`,
    [objectId, author, spaceId, pepper.id],
  );
  for (let index = 1; index <= 21; index += 1) {
    const number = String(index).padStart(2, "0");
    await pool.query(
      `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
         visibility, lifecycle_state, published_at, public_slug, client_mutation_id)
       values ($1, $2, $3, $4, 'Перець росте, листя рівне, поливаю ввечері.', 'object',
               'public', 'active', now() - make_interval(hours => $5), $6, $6)`,
      [
        author,
        spaceId,
        objectId,
        `Перець ${number}`,
        22 - index,
        `${PREFIX}-${run}-pepper-${number}`,
      ],
    );
  }
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (!pool) return;
  for (const table of ["journal_entries", "plant_objects", "spaces"]) {
    await pool.query(
      `delete from ${table} where owner_user_id = any($1::uuid[])`,
      [userIds],
    );
  }
  for (const id of userIds) await removeSyntheticGardener(pool, id);
  await pool.query(
    `delete from catalog_item_relations where assertion_id = $1::uuid`,
    [assertionId],
  );
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
    catalogIds,
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
  name: string;
  nodeKind: "taxon" | "cultivar";
  names: readonly (readonly [string, string, string])[];
  formOf?: string;
}): Promise<Organism> {
  const id = randomUUID();
  const slug = `${PREFIX}-${run}-${catalogIds.length}`;
  await pool.query(
    `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
       source_id, locale, node_kind, rank, kingdom, identity_state, search_weight)
     values ($1, $2, catalog_normalize_name($2), $3, $4, $5, $6, $7, $8, 'Plantae', 'active', 5)`,
    [
      id,
      input.name,
      slug,
      input.nodeKind === "taxon" ? "species_backbone" : "ua_state_register",
      `${PREFIX}:${run}:${id}`,
      input.nodeKind === "taxon" ? "la" : "uk",
      input.nodeKind,
      input.nodeKind === "taxon" ? "species" : "cultivar",
    ],
  );
  catalogIds.push(id);
  for (const [display, locale, nameType] of input.names) {
    await pool.query(
      `insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
       values ($1, $2, catalog_normalize_name($2), $3, $4, $5)`,
      [id, display, locale, nameType !== "vernacular", nameType],
    );
  }
  if (input.formOf) {
    await pool.query(
      `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
       values ($1, $2, 'form_of', $3)`,
      [id, input.formOf, assertionId],
    );
  }
  return { id, slug };
}

/** A gardener who writes, with the handle sign-up's trigger claims for them. */
async function createAuthor(label: string) {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, `${PREFIX}-${label}-${id}@example.test`, `${PREFIX} ${label}`],
  );
  await acceptLegalDocuments(pool, id);
  userIds.push(id);
  return id;
}

const speciesPath = (organism: Organism, locale: Locale = "uk") =>
  `${locale === "uk" ? "" : `/${locale}`}/species/${organism.slug}`;
const cherokeePath = (locale: Locale = "uk") =>
  `${speciesPath(tomato, locale)}/${cherokee.slug}`;

async function readerContext(
  browser: import("playwright/test").Browser,
  baseURL: string,
  options: {
    locale?: Locale;
    viewport?: { width: number; height: number };
  } = {},
) {
  const locale = options.locale ?? "uk";
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
  });
  contexts.push(context);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    { name: MARKET_COOKIE, value: locale === "bg" ? "bg" : "ua", url: baseURL },
  ]);
  // The analytics question is answered, so its notice covers nothing.
  await context.addInitScript((key) => {
    window.localStorage.setItem(key, "declined");
  }, CONSENT_KEY);
  return context;
}

async function readDocument(request: APIRequestContext, url: string) {
  const response = await request.get(url, {
    headers: { accept: "text/html", cookie: `${LOCALE_COOKIE}=uk` },
    maxRedirects: 0,
  });
  return { status: response.status(), html: await response.text() };
}

async function sitemapPaths(request: APIRequestContext) {
  const response = await request.get("/sitemaps/catalog.xml");
  expect(response.status()).toBe(200);
  return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
    (match) => new URL(match[1]!).pathname,
  );
}

function listedEntries(html: string) {
  const list = html.slice(html.indexOf('id="species-entries"'));
  // Each card's title is its `h3`'s one link.
  return [...list.matchAll(/<h3[^>]*><a[^>]*>([^<]+)<\/a><\/h3>/gu)].map(
    (match) => match[1]!,
  );
}

async function screenshot(page: Page, name: string) {
  if (process.env.SPECIES_PROOF_SCREENSHOTS !== "1") return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOTS, `${name}.png`),
    fullPage: true,
  });
}

test.describe("a species page (OVE-519)", () => {
  test("the first public entry publishes the cultivar's page and its species'; deleting it unpublishes both", async ({
    browser,
    baseURL,
    request,
  }) => {
    test.setTimeout(180_000);
    const context = await readerContext(browser, baseURL!);
    const gardener = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: `${PREFIX}-publisher`,
    });
    userIds.push(gardener.id);
    const spaceId = randomUUID();
    const objectId = randomUUID();
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон ове')`,
      [spaceId, gardener.id],
    );
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state)
       values ($1, $2, $3, 'Черокі на балконі', 'plant', $4, 'selected')`,
      [objectId, gardener.id, spaceId, cherokee.id],
    );

    // Before: both pages answer, unpublished — noindex, the empty state, and
    // out of the sitemap.
    for (const url of [speciesPath(tomato), cherokeePath()]) {
      const before = await readDocument(request, url);
      expect(before.status, url).toBe(200);
      expect(before.html, url).toContain('data-species-published="false"');
      expect(before.html, url).toMatch(
        /name="robots" content="noindex, nofollow"/u,
      );
      expect(before.html, url).toContain("Публічних записів ще немає.");
    }
    expect(await sitemapPaths(request)).not.toContain(speciesPath(tomato));

    // Publish, through the product's own endpoint.
    const title = `Черокі зацвів ${run}`;
    const published = await context.request.post(
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
            plantObjectId: objectId,
            entryDate: new Date().toISOString().slice(0, 10),
          },
          title,
          text: "Перші квіти на нижній китиці, поливаю ввечері під корінь.",
        }),
      },
    );
    expect(published.status(), await published.text()).toBeLessThan(400);
    const entryId = (
      await pool.query<{ id: string }>(
        `select id::text as id from journal_entries where plant_object_id = $1::uuid`,
        [objectId],
      )
    ).rows[0]!.id;

    // After: both pages are published and list the entry; the sitemap has
    // them in every language.
    for (const url of [speciesPath(tomato), cherokeePath()]) {
      await expect
        .poll(async () => (await readDocument(request, url)).html, {
          message: url,
          timeout: 20_000,
        })
        .toContain('data-species-published="true"');
      const after = await readDocument(request, url);
      expect(after.html, url).toMatch(/name="robots" content="index, follow"/u);
      expect(listedEntries(after.html), url).toEqual([title]);
    }
    await expect
      .poll(() => sitemapPaths(request), { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining([
          speciesPath(tomato),
          speciesPath(tomato, "bg"),
          speciesPath(tomato, "ru"),
          cherokeePath(),
        ]),
      );

    // Unpublish: the gardener deletes the entry, from the product.
    const page = await context.newPage();
    await page.goto(`/garden/objects/${objectId}`, { waitUntil: "load" });
    const trigger = page.locator(`[data-entry-actions-trigger="${entryId}"]`);
    await waitForHydration(trigger);
    await trigger.click();
    await page.locator('[data-entry-action="delete"]').click();
    await page.locator(`[data-entry-delete-confirm="${entryId}"]`).click();
    await expect(trigger).toHaveCount(0, { timeout: 20_000 });

    // Both addresses still answer 200, unpublished again.
    for (const url of [speciesPath(tomato), cherokeePath()]) {
      await expect
        .poll(async () => (await readDocument(request, url)).html, {
          message: url,
          timeout: 20_000,
        })
        .toContain('data-species-published="false"');
      const after = await readDocument(request, url);
      expect(after.status, url).toBe(200);
      expect(after.html, url).toMatch(
        /name="robots" content="noindex, nofollow"/u,
      );
      expect(after.html, url).toContain("Публічних записів ще немає.");
      expect(after.html, url).not.toContain(title);
    }
    await expect
      .poll(() => sitemapPaths(request), { timeout: 20_000 })
      .not.toContain(speciesPath(tomato));
    expect(await sitemapPaths(request)).not.toContain(cherokeePath());
  });

  test("is its five parts and nothing else, says what it shows, and its JSON-LD names only that", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(speciesPath(pepper), { waitUntil: "load" });
    const main = page.locator("main[data-species-page]");

    await expect(main.locator("h1")).toHaveText(`Перець ове${run}`);
    await expect(main.locator("[data-species-latin]")).toHaveText(
      `Capsicum ove${run}`,
    );
    await expect(main.locator("[data-species-text]")).toHaveText(PLANT_TEXT);
    await expect(
      main.getByRole("heading", { level: 2, name: "Записи" }),
    ).toBeVisible();
    // One heading of its own, no section, no count, no control of anybody's.
    await expect(main.locator("h2")).toHaveCount(1);
    await expect(main.locator("section")).toHaveCount(1);
    await expect(main).not.toContainText("Додати в мій сад");
    await expect(main.locator("form")).toHaveCount(0);

    // Nothing is for a search engine only.
    await expect(page).toHaveTitle(
      `Перець ове${run} · Capsicum ove${run} | OverGarden`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      PLANT_TEXT,
    );
    const graph = JSON.parse(
      (await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent()) ?? "{}",
    )["@graph"] as Array<Record<string, unknown>>;
    const taxon = graph.find((node) => node["@type"] === "Taxon")!;
    expect(taxon).toMatchObject({
      name: `Перець ове${run}`,
      scientificName: `Capsicum ove${run}`,
      description: PLANT_TEXT,
    });
    expect(Object.keys(taxon).sort()).toEqual(
      [
        "@type",
        "@id",
        "url",
        "name",
        "scientificName",
        "description",
        "subjectOf",
      ].sort(),
    );
    // The entries it lists — the first portion — and no more.
    expect((taxon.subjectOf as unknown[]).length).toBe(20);
    await screenshot(page, "species-1280");
  });

  test("reads «Записи» in portions of twenty, newest first; the next portion arrives on scroll and has its own address", async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto(speciesPath(pepper), { waitUntil: "load" });
    const items = page.locator("#species-entries li");
    await expect(items).toHaveCount(20);
    await expect(items.first()).toContainText("Перець 21");
    await expect(items.nth(19)).toContainText("Перець 02");

    // The link is a real address: the next portion, from the page's twin.
    const more = page.locator("#species-entries").getByRole("link", {
      name: "Показати ще",
    });
    const href = await more.getAttribute("href");
    expect(href).toMatch(new RegExp(`^${speciesPath(pepper)}\\?cursor=`, "u"));
    const portion = await request.get(href!, {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });
    expect(portion.status()).toBe(200);
    expect(portion.headers()["x-robots-tag"]).toBe("noindex, follow");
    const portionHtml = await portion.text();
    expect(listedEntries(portionHtml)).toEqual(["Перець 01"]);
    // Its canonical is the page itself.
    expect(portionHtml).toContain(
      `<link rel="canonical" href="${new URL(speciesPath(pepper), baseURL).href}"/>`,
    );

    // With JavaScript, scrolling to the end appends it in place.
    await waitForHydration(more);
    await more.scrollIntoViewIfNeeded();
    await expect(items).toHaveCount(21, { timeout: 20_000 });
    await expect(items.nth(20)).toContainText("Перець 01");

    // A cursor with nothing after it, or none at all, is a real 404.
    for (const cursor of [
      new URL(href!, baseURL).searchParams.get("cursor")!.slice(0, -2) + "zz",
      "not-a-cursor",
    ]) {
      const past = await request.get(
        `${speciesPath(pepper)}?cursor=${encodeURIComponent(cursor)}`,
        { headers: { accept: "text/html" }, maxRedirects: 0 },
      );
      expect(past.status(), cursor).toBe(404);
    }
    const lastCursor = await request.get(
      `${speciesPath(pepper)}?cursor=${encodeURIComponent(
        Buffer.from(
          JSON.stringify({
            version: 1,
            publishedAt: "2000-01-01T00:00:00.000Z",
            id: randomUUID(),
          }),
        ).toString("base64url"),
      )}`,
      { headers: { accept: "text/html" }, maxRedirects: 0 },
    );
    expect(lastCursor.status()).toBe(404);
  });

  test("speaks Bulgarian and Russian in its own words", async ({
    browser,
    baseURL,
  }) => {
    for (const [locale, expected] of [
      [
        "bg",
        {
          heading: `Домат ове${run}`,
          text: "Записи за това растение от хора, които водят дневника му в Overgarden.",
          empty: "Още няма публични записи.",
        },
      ],
      [
        "ru",
        {
          heading: `Помидор ове${run}`,
          text: "Записи об этом растении от людей, которые ведут его журнал на Overgarden.",
          empty: "Публичных записей пока нет.",
        },
      ],
    ] as const) {
      const context = await readerContext(browser, baseURL!, { locale });
      const page = await context.newPage();
      await page.goto(speciesPath(tomato, locale), { waitUntil: "load" });
      const main = page.locator("main[data-species-page]");
      await expect(main).toHaveAttribute("lang", locale);
      await expect(main.locator("h1")).toHaveText(expected.heading);
      await expect(main.locator("[data-species-text]")).toHaveText(
        expected.text,
      );
      await expect(
        main.getByRole("heading", { level: 2, name: "Записи" }),
      ).toBeVisible();
      await expect(main).toContainText(expected.empty);
      await expect(main).not.toContainText("Записи про цю");
      await expect(main).not.toContainText("Публічних записів ще немає");
    }
  });

  test("axe finds nothing, and nothing scrolls sideways, at 375, 1024 and 1440 px", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    for (const width of [375, 1024, 1440] as const) {
      const context = await readerContext(browser, baseURL!, {
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      for (const [name, url] of [
        ["published", speciesPath(pepper)],
        ["unpublished", speciesPath(quiet)],
        ["cultivar", cherokeePath()],
      ] as const) {
        await page.goto(url, { waitUntil: "load" });
        await expect(page.locator("main[data-species-page] h1")).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
          `${name} at ${width}`,
        ).toBeLessThanOrEqual(0);
        await scanAccessibility(page, testInfo, `species-${name}-${width}`);
        if (width === 375) await screenshot(page, `${name}-375`);
      }
      await context.close();
    }
  });
});
