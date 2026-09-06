import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "playwright/test";
import { Pool } from "pg";

import { getPublicSurfaceCopy } from "../src/lib/public-surface-localization";

/**
 * Organism addresses end to end (OVE-388, ADR-0026 D8–D9), over HTTP alone
 * against a production build and a real database:
 *
 *   1. a species at `/species/{slug}` and a form at `/species/{slug}/{form}`
 *      answer 200 in every locale, with `Taxon` JSON-LD (`@id` permalink,
 *      `scientificName`, `taxonRank`, `parentTaxon`, `sameAs`,
 *      `dateModified`), a `BreadcrumbList` and uk/bg/ru `hreflang`; a form
 *      without entries and without a species renders at its legacy
 *      `/variety/{slug}` address, indexable under today's rule, with no
 *      engagement panel because it is not a public engagement target yet;
 *   2. the old `/variety/{slug}` path, the permalink `/id/{uuid}`, the EPPO
 *      alias, a wrong route family and every historical slug answer HTTP 308
 *      to the canonical path, keeping the locale prefix, on GET and HEAD;
 *   3. an unknown slug, an unknown identifier and a malformed permalink
 *      answer a real, localized, noindex 404 document, never a streamed
 *      shell (every request runs in a fresh context: a prefixed visit sets
 *      the interface-locale cookie, which would localize the next answer);
 *   4. the sitemap's catalog chunk carries the canonical address and never
 *      a 308 target.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/catalog-addresses.spec.ts
 */
interface Fixture {
  suffix: string;
  speciesId: string;
  speciesSlug: string;
  formId: string;
  formSlug: string;
  orphanId: string;
  orphanSlug: string;
  ownerUserId: string;
  snapshotId: string;
  assertionId: string;
  eppo: { itemId: string; seeded: boolean };
}

const DOCUMENT_HEADERS = { accept: "text/html", "sec-fetch-dest": "document" };

test.use({ trace: "off" });

test.describe("OVE-388 organism addresses", () => {
  test("answers real 200, 308 and 404 statuses with Taxon JSON-LD, hreflang and a canonical-only sitemap", async ({
    baseURL,
    playwright,
  }) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const contexts: APIRequestContext[] = [];
    const request: Fresh = async () => {
      const context = await playwright.request.newContext({ baseURL });
      contexts.push(context);
      return context;
    };
    let fixture: Fixture | null = null;

    try {
      fixture = await seedFixture(pool);
      const speciesPath = `/species/${fixture.speciesSlug}`;
      const formPath = `${speciesPath}/${fixture.formSlug}`;

      // 1. The canonical species page: 200, Taxon, breadcrumbs, hreflang.
      const species = await get(request, speciesPath);
      expect(species.status()).toBe(200);
      const speciesHtml = await species.text();
      expect(speciesHtml).toContain("Solanum lycopersicum");
      expect(speciesHtml).toMatch(canonicalLink(speciesPath));
      for (const locale of ["uk", "bg", "ru"]) {
        expect(speciesHtml, `hreflang ${locale}`).toMatch(new RegExp(`hreflang="${locale}"`, "iu"));
      }
      const speciesGraph = jsonLdGraph(speciesHtml);
      const speciesTaxon = nodeOfType(speciesGraph, "Taxon");
      expect(speciesTaxon).toMatchObject({
        scientificName: "Solanum lycopersicum",
        taxonRank: "species",
        dateModified: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
      });
      expect(String(speciesTaxon["@id"])).toMatch(new RegExp(`/id/${fixture.speciesId}$`, "u"));
      expect(speciesTaxon).not.toHaveProperty("parentTaxon");
      if (fixture.eppo.seeded) {
        expect(speciesTaxon.sameAs).toEqual(["https://gd.eppo.int/taxon/LYPES"]);
      }
      expect(nodeOfType(speciesGraph, "WebPage")).toMatchObject({
        mainEntity: { "@id": speciesTaxon["@id"] },
      });
      const speciesCrumbs = breadcrumbItems(speciesGraph);
      expect(speciesCrumbs).toHaveLength(2);
      expect(String(speciesCrumbs[1]!.item)).toMatch(new RegExp(`${escapeRegExp(speciesPath)}$`, "u"));

      // The form under its species: parentTaxon and a three-step trail.
      const form = await get(request, formPath);
      expect(form.status()).toBe(200);
      const formHtml = await form.text();
      expect(formHtml).toContain("Де Барао");
      expect(formHtml).toMatch(canonicalLink(formPath));
      const formGraph = jsonLdGraph(formHtml);
      const formTaxon = nodeOfType(formGraph, "Taxon");
      expect(formTaxon).toMatchObject({ taxonRank: "cultivar" });
      expect(String(formTaxon["@id"])).toMatch(new RegExp(`/id/${fixture.formId}$`, "u"));
      expect((formTaxon.parentTaxon as { name: string; url: string }).name).toMatch(/^Solanum lycopersicum/u);
      expect((formTaxon.parentTaxon as { name: string; url: string }).url).toMatch(
        new RegExp(`${escapeRegExp(speciesPath)}$`, "u"),
      );
      expect(breadcrumbItems(formGraph)).toHaveLength(3);

      // A form without a species and without entries: rendered at its legacy
      // address, which is its canonical until a species exists; indexable
      // under today's rule (the next task adds the organism noindex case);
      // no engagement panel, since nothing public can be liked yet.
      const orphanPath = `/variety/${fixture.orphanSlug}`;
      const orphan = await get(request, orphanPath);
      expect(orphan.status()).toBe(200);
      const orphanHtml = await orphan.text();
      expect(orphanHtml).toContain("Сирота");
      expect(orphanHtml).toMatch(/name="robots" content="index, follow"/u);
      expect(orphanHtml).toMatch(canonicalLink(orphanPath));
      const orphanGraph = jsonLdGraph(orphanHtml);
      const orphanTaxon = nodeOfType(orphanGraph, "Taxon");
      expect(orphanTaxon).toMatchObject({ taxonRank: "cultivar", name: "Сирота" });
      expect(orphanTaxon).not.toHaveProperty("parentTaxon");
      expect(breadcrumbItems(orphanGraph)).toHaveLength(2);
      expect(orphanHtml).not.toContain('data-engagement-panel');
      await expectRedirect(request, baseURL, `/species/${fixture.orphanSlug}`, orphanPath);

      // The prefixed locale: its own canonical and document language.
      const localized = await get(request, `/bg${speciesPath}`);
      expect(localized.status()).toBe(200);
      const localizedHtml = await localized.text();
      expect(localizedHtml).toMatch(/<html[^>]*lang="bg"/u);
      expect(localizedHtml).toMatch(canonicalLink(`/bg${speciesPath}`));
      expect(String(breadcrumbItems(jsonLdGraph(localizedHtml))[0]!.item)).toMatch(/\/bg$/u);

      // 2. Permanent redirects: legacy path, permalink, alias, wrong family.
      await expectRedirect(request, baseURL, `/variety/${fixture.formSlug}`, formPath);
      await expectRedirect(request, baseURL, `/variety/${fixture.formSlug}`, formPath, "HEAD");
      await expectRedirect(request, baseURL, `/ru/variety/${fixture.formSlug}`, `/ru${formPath}`);
      await expectRedirect(request, baseURL, `/id/${fixture.speciesId}`, speciesPath);
      await expectRedirect(request, baseURL, `/bg/id/${fixture.formId}`, `/bg${formPath}`);
      await expectRedirect(request, baseURL, `/breed/${fixture.speciesSlug}`, speciesPath);
      const eppo = await get(request, "/eppo/lypes");
      expect(eppo.status()).toBe(308);
      const eppoTarget = new URL(eppo.headers()["location"] ?? "", baseURL).pathname;
      if (fixture.eppo.seeded) {
        expect(eppoTarget).toBe(speciesPath);
      } else {
        expect(eppoTarget).toMatch(/^\/(species|variety|breed)\//u);
      }

      // 3. Real 404 documents, localized, noindex.
      const copy = { uk: getPublicSurfaceCopy("uk"), bg: getPublicSurfaceCopy("bg") };
      await expectNotFound(request, `/species/ove388-no-such-organism-${fixture.suffix}`, copy.uk.organism.notFound);
      await expectNotFound(request, `/bg/species/ove388-no-such-organism-${fixture.suffix}`, copy.bg.organism.notFound);
      await expectNotFound(request, `${speciesPath}/ove388-no-such-form-${fixture.suffix}`, copy.uk.organism.notFound);
      await expectNotFound(request, "/eppo/ZZZZZ", copy.uk.organism.notFound);
      await expectNotFound(request, "/ru/wikidata/Q999999999999", getPublicSurfaceCopy("ru").organism.notFound);
      await expectNotFound(request, "/id/not-a-uuid", copy.uk.organism.notFound);

      // A rename: the old slug answers 308 forever, the form follows its species.
      const renamedSlug = `${fixture.speciesSlug}-renamed`;
      await pool.query(`update catalog_items set public_slug = $1 where id = $2::uuid`, [renamedSlug, fixture.speciesId]);
      const renamedPath = `/species/${renamedSlug}`;
      await expectRedirect(request, baseURL, speciesPath, renamedPath);
      await expectRedirect(request, baseURL, formPath, `${renamedPath}/${fixture.formSlug}`);
      await expectRedirect(request, baseURL, `/id/${fixture.speciesId}`, renamedPath);
      await expectRedirect(request, baseURL, `/bg${formPath}`, `/bg${renamedPath}/${fixture.formSlug}`);
      expect((await get(request, renamedPath)).status()).toBe(200);
      expect((await get(request, `${renamedPath}/${fixture.formSlug}`)).status()).toBe(200);
      const history = await pool.query<{ slug: string; closed: boolean }>(
        `select slug, valid_to is not null as closed from catalog_item_slug_history
         where catalog_item_id = $1::uuid order by valid_from`,
        [fixture.speciesId],
      );
      expect(history.rows).toEqual([
        { slug: fixture.speciesSlug, closed: true },
        { slug: renamedSlug, closed: false },
      ]);

      // 4. The sitemap: the canonical address of the indexable species only.
      const sitemap = await (await request()).get("/sitemaps/catalog.xml", { maxRedirects: 0 });
      expect(sitemap.status()).toBe(200);
      const sitemapXml = await sitemap.text();
      expect(sitemapXml).toContain(`${renamedPath}</loc>`);
      expect(sitemapXml).toContain(`${renamedPath}/${fixture.formSlug}</loc>`);
      expect(sitemapXml).not.toContain(`${speciesPath}</loc>`);
      expect(sitemapXml).not.toContain(`${speciesPath}/${fixture.formSlug}</loc>`);
      expect(sitemapXml).not.toContain(`/variety/${fixture.formSlug}</loc>`);
      expect(sitemapXml).not.toContain(`/variety/${fixture.orphanSlug}</loc>`);

      console.info(
        JSON.stringify({
          canonicalSpecies: 200,
          canonicalForm: 200,
          orphanFormLegacyAddress: 200,
          localizedSpecies: 200,
          legacyVariety: 308,
          permalink: 308,
          eppoAlias: 308,
          eppoSeededHere: fixture.eppo.seeded,
          historicalSlug: 308,
          unknownSlug: 404,
          unknownIdentifier: 404,
          sitemapCanonicalOnly: true,
        }),
      );
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
      if (fixture) await cleanupFixture(pool, fixture);
      await pool.end();
    }
  });
});

/** A new request context per call: no cookie survives from one path to the next. */
type Fresh = () => Promise<APIRequestContext>;

async function get(request: Fresh, path: string) {
  return (await request()).get(path, { maxRedirects: 0, headers: DOCUMENT_HEADERS });
}

async function expectRedirect(
  request: Fresh,
  baseURL: string,
  path: string,
  target: string,
  method: "GET" | "HEAD" = "GET",
) {
  const response =
    method === "HEAD"
      ? await (await request()).head(path, { maxRedirects: 0, headers: DOCUMENT_HEADERS })
      : await get(request, path);
  expect(response.status(), `${method} ${path}`).toBe(308);
  const location = response.headers()["location"];
  expect(location, `${method} ${path} Location`).toBeTruthy();
  expect(new URL(location ?? "", baseURL).pathname, `${method} ${path} target`).toBe(target);
}

async function expectNotFound(request: Fresh, path: string, copyText: string) {
  const response = await get(request, path);
  expect(response.status(), path).toBe(404);
  expect(response.headers()["x-robots-tag"], `${path} X-Robots-Tag`).toBe("noindex, nofollow");
  expect(await response.text(), `${path} body`).toContain(copyText);
}

function canonicalLink(path: string) {
  return new RegExp(`rel="canonical" href="[^"]*${escapeRegExp(path)}"`, "u");
}

function jsonLdGraph(html: string): Record<string, unknown>[] {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u.exec(html);
  if (!match) throw new Error("The page carries no JSON-LD.");
  const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
  return (parsed["@graph"] as Record<string, unknown>[] | undefined) ?? [parsed];
}

function nodeOfType(graph: Record<string, unknown>[], type: string) {
  const node = graph.find((candidate) => candidate["@type"] === type);
  if (!node) throw new Error(`No ${type} node in the JSON-LD graph.`);
  return node;
}

function breadcrumbItems(graph: Record<string, unknown>[]) {
  return nodeOfType(graph, "BreadcrumbList").itemListElement as { position: number; item: string }[];
}

async function cleanupStaleRuns(pool: Pool) {
  const staleUsers = await pool.query<{ id: string }>(
    `select id::text as id from "user" where email like 'ove388-%'`,
  );
  const userIds = staleUsers.rows.map((row) => row.id);
  if (userIds.length > 0) {
    await pool.query(`delete from journal_entries where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from plant_objects where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from spaces where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from "user" where id = any($1::uuid[])`, [userIds]);
  }
  const staleItems = await pool.query<{ id: string }>(
    `select id::text as id from catalog_items where public_slug like 'ove388-%' or source_id like '%:ove388:%'`,
  );
  const itemIds = staleItems.rows.map((row) => row.id);
  if (itemIds.length > 0) {
    await pool.query(
      `update plant_objects set catalog_item_id = null, variety_state = 'unknown', variety_text = null
       where catalog_item_id = any($1::uuid[])`,
      [itemIds],
    );
    await pool.query(
      `delete from catalog_item_relations where from_catalog_item_id = any($1::uuid[]) or to_catalog_item_id = any($1::uuid[])`,
      [itemIds],
    );
    await pool.query(`delete from catalog_item_identifiers where catalog_item_id = any($1::uuid[])`, [itemIds]);
    await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [itemIds]);
  }
  await pool.query(
    `delete from catalog_source_assertions where source_snapshot_id in
       (select id from catalog_source_snapshots where source_version like 'ove388-%')`,
  );
  await pool.query(`delete from catalog_source_snapshots where source_version like 'ove388-%'`);
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  await cleanupStaleRuns(pool);
  const suffix = randomUUID().slice(0, 8);
  const snapshotId = randomUUID();
  const assertionId = randomUUID();
  const speciesId = randomUUID();
  const formId = randomUUID();
  const orphanId = randomUUID();
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const formObjectId = randomUUID();
  const speciesSlug = `ove388-solanum-lycopersicum-${suffix}`;
  const formSlug = `ove388-de-barao-${suffix}`;
  const orphanSlug = `ove388-syrota-${suffix}`;

  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', $2, 'https://example.test/',
             'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `ove388-${suffix}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );
  const items: Array<[string, string, string, string, string, string, string, string]> = [
    [speciesId, "Solanum lycopersicum L.", "species", "species_backbone", "la", "taxon", "Plantae", speciesSlug],
    [formId, "Де Барао", "plant_variety", "ua_state_register", "uk", "cultivar", "Plantae", formSlug],
    [orphanId, "Сирота", "plant_variety", "ua_state_register", "uk", "cultivar", "Plantae", orphanSlug],
  ];
  for (const [id, name, kind, source, locale, nodeKind, kingdom, slug] of items) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, catalog_kind, normalized_name, public_slug, status, source,
         source_id, locale, node_kind, kingdom, identity_state, search_weight)
       values ($1, $2, $3, catalog_normalize_name($2), $4, 'seeded', $5, $6, $7, $8, $9, 'active', 5)`,
      [id, name, kind, slug, source, `${source}:ove388:${id}`, locale, nodeKind, kingdom],
    );
  }
  const names: Array<[string, string, string, boolean, string]> = [
    [speciesId, "Solanum lycopersicum", "la", true, "scientific_accepted"],
    [speciesId, "помідор", "uk", false, "vernacular"],
    [formId, "Де Барао", "uk", true, "denomination"],
    [orphanId, "Сирота", "uk", true, "denomination"],
  ];
  for (const [itemId, display, locale, primary, nameType] of names) {
    await pool.query(
      `insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
       values ($1, $2, catalog_normalize_name($2), $3, $4, $5)
       on conflict do nothing`,
      [itemId, display, locale, primary, nameType],
    );
  }
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     values ($1, $2, 'form_of', $3)`,
    [formId, speciesId, assertionId],
  );

  // `/eppo/LYPES` must resolve; a database that already links the tomato's
  // EPPO code keeps its row, an empty one gets the code on this species.
  const existingEppo = await pool.query<{ id: string }>(
    `select catalog_item_id::text as id from catalog_item_identifiers where scheme = 'eppo' and value = 'LYPES' limit 1`,
  );
  let eppo: Fixture["eppo"];
  if (existingEppo.rows[0]) {
    eppo = { itemId: existingEppo.rows[0].id, seeded: false };
  } else {
    await pool.query(
      `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values ($1, 'eppo', 'LYPES', $2)`,
      [speciesId, assertionId],
    );
    eppo = { itemId: speciesId, seeded: true };
  }

  // One public entry each makes the species and the form indexable, so their
  // JSON-LD and sitemap rows exist; the orphan stays without entries.
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'ove388 gardener', $2, true, now(), now())`,
    [ownerUserId, `ove388-${suffix}@example.test`],
  );
  await pool.query(`insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'ove388 garden')`, [
    spaceId,
    ownerUserId,
  ]);
  const objects: Array<[string, string, string]> = [
    [objectId, speciesId, "Помідор на балконі"],
    [formObjectId, formId, "Де Барао на грядці"],
  ];
  for (const [id, catalogItemId, displayName] of objects) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state, variety_text)
       values ($1, $2, $3, $4, 'plant', $5, 'selected', null)`,
      [id, ownerUserId, spaceId, displayName, catalogItemId],
    );
    await pool.query(
      `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
         visibility, lifecycle_state, published_at, public_slug, client_mutation_id)
       values ($1, $2, $3, 'Перше суцвіття', 'Перший публічний запис про рослину на балконі.', 'object',
               'public', 'active', now() - interval '1 day', $4, $4)`,
      [ownerUserId, spaceId, id, `ove388-entry-${id.slice(0, 8)}-${suffix}`],
    );
  }

  return {
    suffix,
    speciesId,
    speciesSlug,
    formId,
    formSlug,
    orphanId,
    orphanSlug,
    ownerUserId,
    snapshotId,
    assertionId,
    eppo,
  };
}

async function cleanupFixture(pool: Pool, fixture: Fixture) {
  await pool.query(`delete from journal_entries where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from plant_objects where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from spaces where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from "user" where id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from catalog_item_relations where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_item_identifiers where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
    [fixture.speciesId, fixture.formId, fixture.orphanId],
  ]);
  await pool.query(`delete from catalog_source_assertions where id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_source_snapshots where id = $1`, [fixture.snapshotId]);
}

function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the address spec.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The address spec runs against a loopback database only.");
  }
  return url;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

