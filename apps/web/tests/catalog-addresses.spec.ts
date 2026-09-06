import { expect, test, type APIRequestContext } from "playwright/test";
import { Pool } from "pg";

import { getPublicSurfaceCopy } from "../src/lib/public-surface-localization";
import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";

/**
 * Organism addresses end to end (OVE-388, ADR-0026 D8–D9), over HTTP alone
 * against a production build and a real database:
 *
 *   1. a species at `/species/{slug}` and a form at `/species/{slug}/{form}`
 *      answer 200 in every locale, with `Taxon` JSON-LD (`@id` permalink,
 *      `scientificName`, `taxonRank`, `parentTaxon`, `sameAs`,
 *      `dateModified`), a `BreadcrumbList` and uk/bg/ru `hreflang`; a form
 *      without entries and without a species renders at its legacy
 *      `/variety/{slug}` address, `noindex` because nothing first-hand was
 *      published on it (ADR-0026 D9), with no JSON-LD and no engagement
 *      panel;
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
    let fixture: OrganismFixture | null = null;

    try {
      fixture = await seedOrganismFixture(pool, "ove388");
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
      // address, which is its canonical until a species exists; reachable but
      // noindex, with no JSON-LD, because its content comes only from
      // sources (ADR-0026 D9); no engagement panel, since nothing public can
      // be liked yet.
      const orphanPath = `/variety/${fixture.orphanSlug}`;
      const orphan = await get(request, orphanPath);
      expect(orphan.status()).toBe(200);
      const orphanHtml = await orphan.text();
      expect(orphanHtml).toContain("Сирота");
      expect(orphanHtml).toMatch(/name="robots" content="noindex, nofollow"/u);
      expect(orphanHtml).not.toContain('type="application/ld+json"');
      expect(orphanHtml).not.toContain('data-organism-section="experience"');
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
      if (fixture) await cleanupOrganismFixture(pool, fixture);
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

