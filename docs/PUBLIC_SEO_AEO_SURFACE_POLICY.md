# Public SEO/AEO Surface Policy

Status: active. Owner decision: ADR-0022, D3 (2026-09-02), amended by ADR-0026
D9 (2026-09-05) for organism cards. Supersedes the
measured-threshold policy that this file described before OVE-368.

## Rule

Every live public page is indexable. A page is `noindex` only when it is:

- not a public candidate: workspace, auth, and operator routes, a record that
  is gone (410 tombstone for 7 days, then 404), or a page whose load failed;
- an empty listing: a directory, feed, topic, or catalog that lists nothing;
- served under a locale prefix that its canonical path does not carry;
- an organism card without first-hand content (ADR-0026 D9): a species,
  cultivar or breed page whose content comes only from sources stays `noindex`
  until a gardener publishes on it or the owner marks it indexable. Slice 24
  implements this rule; until then organism pages follow the rules above.

There is no word count, entity count, staleness, or quality-class threshold,
no metadata deadline, no `public_noindex` column, and no private profile.
Code: `src/server/public-surface-indexing-policy.ts` (the decision),
`src/server/public-surface-discovery.ts` (the per-route inventory and the
source shape: `visibleText`, `distinctPublicEntityIds`, `canonicalPath`,
`equivalentLocales`).

## What each route emits

- Indexable: `robots index,follow`, one canonical path, `hreflang`
  alternates only for locales the page really has, one JSON-LD graph built
  from facts visible on the page (`src/server/public-surface-metadata.ts`).
- `noindex`: `robots noindex,nofollow`, no canonical, no JSON-LD.
- A listing counts only what it lists. Static headings and intros never make
  an empty listing indexable.

## Organism addresses (ADR-0026 D8, D9)

- A species answers at `/species/{slug}`; a cultivar or breed at
  `/species/{species-slug}/{form-slug}`; each in every locale (`/bg/…`,
  `/ru/…`). The species slug is the accepted scientific name in ASCII; the
  form slug is the registered denomination romanized per the Cabinet of
  Ministers resolution 55 (2010) for Ukrainian and the 2009 transliteration
  law for Bulgarian (`src/lib/catalog/slugs.ts`). Vernaculars never appear
  in a slug. A slug is never reused: `assignCatalogSlug`
  (`src/server/catalog-slug-repository.ts`) appends `-2`, `-3` past every
  slug another organism ever held, and the `0054` trigger writes the history.
- `/id/{uuid}` is the permalink and the JSON-LD `@id`; `/eppo/{code}`,
  `/col/{id}`, `/gbif/{key}` and `/wikidata/{qid}` resolve an external
  identifier. All five answer HTTP 308 to the canonical path in the requested
  locale, or a real 404 document (route handlers under `src/app/(default)`
  and `src/app/[locale]`, `src/app/catalog-alias-route.ts`).
- Every slug a card ever had, every old `/variety/{slug}` and `/breed/{slug}`
  path and every merged card answer 308; an unknown slug answers a real 404.
  The status is decided in `src/proxy.ts` by one bounded lookup
  (`src/server/public-catalog-address-repository.ts`) before any shell
  streams; the page repeats the lookup through `use cache` for client-side
  navigations. A form not yet linked to a species keeps its legacy address
  until the link exists.
- One builder spells every catalog path: `publicCatalogEvidencePath` in
  `src/lib/garden/public-paths.ts`.
- The canonical of an organism page follows the route family it was served
  from (unprefixed, `/bg`, `/ru`), never the cookie locale; `hreflang`
  alternates list uk, bg and ru. The JSON-LD graph is `WebPage` →
  `Taxon` (`@id`, `scientificName`, `taxonRank`, `parentTaxon` for a form,
  `sameAs` from `catalog_item_identifiers`, `dateModified` from
  `content_updated_at`) plus a `BreadcrumbList` of two or three items
  (`src/server/public-variety-metadata.ts`).

## Sitemap

`/sitemap.xml` is a sitemap index; `/sitemaps/<chunk>.xml` serves one chunk
(`authored`, `catalog`, `topics`, `communities`, `profiles-N`, `entries-N`,
5 000 URLs per chunk). Both are route handlers that read the database at
request time (`src/server/public-sitemap.ts`,
`src/server/public-sitemap-repository.ts`); nothing is generated at build.
Every indexable public page belongs to exactly one chunk. The `catalog`
chunk lists canonical organism addresses only, never a 308 target, with
`lastmod` the later of `content_updated_at` and the newest public entry.

## Robots

`/robots.txt` allows every crawler on public routes and disallows workspace,
auth, operator, and API paths. Privacy is enforced server-side (401/403 and
the public projections), never by `robots.txt`.

## Privacy and language boundary

Public projections carry only public-safe fields. Facts in metadata and JSON-LD
come from the rendered page, never from owner-private columns. Language
alternates are emitted only for locales the page really serves; a page that
exists in one language has no alternates.

## Verification

Unit tests cover the decision table, the discovery inventory, the metadata
builder, the sitemap chunks, and each public route's metadata. Production
proof for a release: `curl -sI https://over.garden/sitemap.xml`, one chunk,
and the `<meta name="robots">`, canonical, and JSON-LD of one live entry.
