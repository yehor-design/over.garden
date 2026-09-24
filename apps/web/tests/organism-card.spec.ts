import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { WCAG_AA_TAGS } from "./helpers/redesign-accessibility";

/**
 * The organism card (`OVE-452`).
 *
 * The card carries more than any other page in the product: names in four
 * languages, identifiers across five sources, relations, facts with the
 * assertions behind them, presence badges, the attribution a licence
 * requires, the forms beneath a species, and the gardener experience under all
 * of it. Two things about it are easy to break by restyling and neither shows
 * up in a screenshot:
 *
 * - **The section order is ADR-0026 D9's**, and it is what makes the first
 *   paragraph usable as an answer. It is read out of the served bytes here,
 *   not eyeballed.
 * - **A collapsed section is invisible to a crawler** even though it is in the
 *   DOM. "Names and sources" holds the identifiers `sameAs` is built from and
 *   the source behind every fact, so it is a real section now rather than a
 *   `<details>` — and this asserts that from the outside.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/organism-card.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** With it, the
 * author-scoped rewrite re-enters the proxy and a public address 308s to
 * itself. CI omits the flag.
 */

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const FIXTURE_PREFIX = "ove452";

/** The order ADR-0026 D9 fixes, and the whole of it. */
const D9_SECTION_ORDER = [
  "facts",
  "experience",
  // The editors' growing note comes after what gardeners wrote (`OVE-497`).
  "editorial",
  "relations",
  "presence",
  "mentions",
  "names-and-sources",
  "attribution",
] as const;

interface CardFixture {
  /** A species with a gardener's published entry under it. */
  speciesSlug: string;
  /** A cultivar beneath that species — the form card. */
  formSlug: string;
  /** A species nobody has written about: source-only. */
  sourceOnlySlug: string;
  /** A card that was merged away, so its address redirects. */
  mergedSlug: string;
  ids: string[];
  snapshotIds: string[];
}

let pool: Pool;
let fixture: CardFixture | null = null;

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
}

/** Evaluated through the protocol: the page's CSP blocks a script element. */
async function axeViolations(page: Page) {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, WCAG_AA_TAGS);
}

/**
 * Four cards, because the card has four shapes and they break differently:
 * one with a gardener's entry under it, a form beneath a species, a
 * source-only node, and one that has been merged away.
 */
async function seedCards(): Promise<CardFixture> {
  const run = randomUUID().slice(0, 8);
  const ids: string[] = [];
  const snapshotIds: string[] = [];

  const insert = async (input: {
    name: string;
    slug: string;
    nodeKind: "taxon" | "cultivar";
    rank: string;
    parentId?: string | null;
    mergedInto?: string | null;
    registeredUa?: boolean;
    indexable?: boolean;
  }) => {
    const row = await pool.query<{ id: string }>(
      `insert into catalog_items
         (canonical_name, normalized_name, public_slug, node_kind, rank,
          kingdom, identity_state, source, source_id,
          parent_catalog_item_id, merged_into_catalog_item_id, registered_ua,
          indexable_override, locale)
       values ($1, lower($1), $2, $3, $4, 'Plantae',
               $5, 'species_backbone', $6, $7::uuid, $8::uuid, $9, $10, 'uk')
       returning id::text id`,
      [
        input.name,
        input.slug,
        input.nodeKind,
        input.rank,
        input.mergedInto ? "merged" : "active",
        `${FIXTURE_PREFIX}-${input.slug}`,
        input.parentId ?? null,
        input.mergedInto ?? null,
        input.registeredUa ?? false,
        input.indexable ?? null,
      ],
    );
    ids.push(row.rows[0]!.id);
    return row.rows[0]!.id;
  };

  const speciesSlug = `${FIXTURE_PREFIX}-species-${run}`;
  const speciesId = await insert({
    name: `Ove452a plantensis ${run}`,
    slug: speciesSlug,
    nodeKind: "taxon",
    rank: "species",
    // The owner has marked this one. A card whose content comes only from
    // sources stays `noindex` until a gardener publishes on it or the owner
    // says so (ADR-0026 D9) — and the two cases render differently, which is
    // why the fixture holds both.
    indexable: true,
  });
  const formSlug = `${FIXTURE_PREFIX}-form-${run}`;
  await insert({
    name: `Ove452a plantensis '${run}'`,
    slug: formSlug,
    nodeKind: "cultivar",
    rank: "cultivar",
    parentId: speciesId,
    registeredUa: true,
  });
  const sourceOnlySlug = `${FIXTURE_PREFIX}-source-${run}`;
  await insert({
    name: `Ove452b solitaria ${run}`,
    slug: sourceOnlySlug,
    nodeKind: "taxon",
    rank: "species",
  });
  const mergedSlug = `${FIXTURE_PREFIX}-merged-${run}`;
  await insert({
    name: `Ove452c historica ${run}`,
    slug: mergedSlug,
    nodeKind: "taxon",
    rank: "species",
    mergedInto: speciesId,
  });

  // A name in the reader's language, so the card has a vernacular to show.
  await pool.query(
    `insert into catalog_item_names
       (catalog_item_id, display_name, normalized_name, locale, is_primary)
     values ($1::uuid, $2, lower($2), 'uk', true)
     on conflict do nothing`,
    [speciesId, `Овешник ${run}`],
  );

  // An identifier, so the outbound block has something to render — and the
  // chain it hangs from, because an identifier without an assertion is a fact
  // with no source, which the schema refuses and the card should too.
  const snapshot = await pool.query<{ id: string }>(
    `insert into catalog_source_snapshots
       (source_slug, source_name, source_category, source_version, source_url,
        license, parser_version, payload_sha256, fetched_at, verified_at)
     values ('eppo', 'EPPO Global Database', 'registry', $1,
             'https://gd.eppo.int/', 'EPPO Open Data Licence', 'ove452-test',
             $2, now(), now())
     returning id::text id`,
    [`ove452-${run}`, randomUUID().replaceAll("-", "").padEnd(64, "0")],
  );
  const snapshotId = snapshot.rows[0]!.id;
  const assertion = await pool.query<{ id: string }>(
    `insert into catalog_source_assertions (source_slug, source_snapshot_id)
     values ('eppo', $1::uuid)
     returning id::text id`,
    [snapshotId],
  );
  await pool.query(
    `insert into catalog_item_identifiers
       (catalog_item_id, scheme, value, assertion_id)
     values ($1::uuid, 'eppo', $2, $3::uuid)
     on conflict do nothing`,
    [speciesId, `OVE${run.toUpperCase()}`, assertion.rows[0]!.id],
  );
  snapshotIds.push(snapshotId);

  return { speciesSlug, formSlug, sourceOnlySlug, mergedSlug, ids, snapshotIds };
}

test.describe("the organism card", () => {
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    fixture = await seedCards();
  });

  test.afterAll(async () => {
    if (fixture) {
      await pool.query(
        `delete from catalog_item_identifiers where catalog_item_id = any($1::uuid[])`,
        [fixture.ids],
      );
      await pool.query(
        `delete from catalog_item_names where catalog_item_id = any($1::uuid[])`,
        [fixture.ids],
      );
      await pool.query(
        `update catalog_items set merged_into_catalog_item_id = null,
                                  parent_catalog_item_id = null
          where id = any($1::uuid[])`,
        [fixture.ids],
      );
      await pool.query(
        `delete from catalog_item_slug_history where catalog_item_id = any($1::uuid[])`,
        [fixture.ids],
      );
      await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
        fixture.ids,
      ]);
      await pool.query(
        `delete from catalog_source_assertions where source_snapshot_id = any($1::uuid[])`,
        [fixture.snapshotIds],
      );
      await pool.query(
        `delete from catalog_source_snapshots where id = any($1::uuid[])`,
        [fixture.snapshotIds],
      );
    }
    await pool.end();
  });

  test("keeps ADR-0026 D9's section order, read out of the bytes", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const response = await request.get(
      `${baseURL}/species/${fixture!.speciesSlug}`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    expect(response.status()).toBe(200);
    const html = await response.text();

    // The sections the card actually has, in the order it has them — a subset
    // of D9's, because a section with nothing in it is not rendered. What
    // must never happen is two of them swapping places.
    const order = [
      ...html.matchAll(/data-organism-section="([a-z-]+)"/gu),
    ].map((match) => match[1]!);
    expect(order.length, "the card rendered no sections").toBeGreaterThan(1);
    expect(order[0], "the fact paragraph is not first").toBe("facts");
    const expected = D9_SECTION_ORDER.filter((name) => order.includes(name));
    expect(order).toEqual(expected);

    // The fact-only first paragraph is prose, first, and not behind anything.
    expect(html).toContain("data-organism-fact");
  });

  test("hides no fact behind an accordion", async ({ baseURL, request }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const response = await request.get(
      `${baseURL}/species/${fixture!.speciesSlug}`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    const html = await response.text();

    // A collapsed section is invisible to a crawler even though it is in the
    // DOM, so **no section of the card may be a `<details>`**. Stated that
    // way rather than "no `<details>` on the page", because the footer's
    // language control and the owner's own tools are both disclosures, and
    // both are controls rather than facts.
    const factDisclosures = [
      ...html.matchAll(/<details\b[^>]*data-organism-section="[^"]*"[^>]*>/gu),
    ].map((match) => match[0]);
    expect(
      factDisclosures,
      `a fact section is an accordion: ${factDisclosures.join(", ")}`,
    ).toEqual([]);

    // And the section that used to be one is a real region now.
    expect(html).toMatch(
      /<section[^>]*data-organism-section="names-and-sources"/u,
    );
  });

  test("shows the identifiers, in mono and linking out", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const response = await request.get(
      `${baseURL}/species/${fixture!.speciesSlug}`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    const html = await response.text();

    expect(html).toContain('data-organism-identifiers="true"');
    expect(html).toContain('data-organism-identifier="eppo"');
    expect(html).toContain("https://gd.eppo.int/taxon/");
    expect(html).toMatch(/class="[^"]*font-mono/u);

    // `sameAs` carries the same identifier, and this task did not touch it.
    expect(html).toContain('"sameAs"');
    expect(html).toContain("https://gd.eppo.int/taxon/");
  });

  test("keeps a source-only card out of the index, JSON-LD and all", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const response = await request.get(
      `${baseURL}/species/${fixture!.sourceOnlySlug}`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    expect(response.status()).toBe(200);
    const html = await response.text();

    // ADR-0026 D9: a card whose content comes only from sources is reachable
    // and `noindex` until a gardener publishes on it or the owner marks it.
    // The redesign did not touch that, and this is how it stays true.
    //
    // The rule is in the document's own `<meta>` here rather than in a header:
    // this page's indexing decision is made where the page is rendered, not
    // in the proxy — the proxy's `X-Robots-Tag` is for the paginated and
    // filtered *listings*, which cannot say it in their own `<head>`.
    expect(html).toContain('content="noindex');
    expect(html).not.toContain("application/ld+json");
  });

  test("axe reports nothing on four cards at 375, 1024 and 1440 px", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const surfaces = [
      // One with a gardener's entry, one form card, one source-only, and one
      // whose address redirects because it was merged away.
      `/species/${fixture!.speciesSlug}`,
      `/species/${fixture!.speciesSlug}/${fixture!.formSlug}`,
      `/species/${fixture!.sourceOnlySlug}`,
      `/species/${fixture!.mergedSlug}`,
    ];

    for (const width of [375, 1_024, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      for (const surface of surfaces) {
        const response = await page.goto(surface, { waitUntil: "load" });
        expect(response?.status(), `${surface}`).toBe(200);
        await page.waitForTimeout(1_200);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${surface} at ${width} px: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });

  test("a merged card's address answers, and names the survivor", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);

    // ADR-0026 D8: every slug ever assigned answers 308 to the current path
    // forever. A merge is the case that makes this matter — the card is gone
    // and the organism is not.
    const response = await page.goto(`/species/${fixture!.mergedSlug}`, {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain(fixture!.speciesSlug);
    expect(
      response?.request().redirectedFrom(),
      "the merged address answered without a redirect",
    ).not.toBeNull();
  });
});
