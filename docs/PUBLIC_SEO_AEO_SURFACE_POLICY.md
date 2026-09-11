# Public SEO/AEO Surface Policy

Status: active for the indexing rule; **superseded on addressing by ADR-0029**
(2026-09-11). The "Organism addresses" section below describes behaviour
production does not have yet and is replaced by ADR-0029 D9; read that file
first. "Sitemap" and "Robots" were rewritten on 2026-09-11 by `OVE-421` and now
describe what the code does. Owner decision: ADR-0022, D3
(2026-09-02), amended by ADR-0026 D9 (2026-09-05) for organism cards — that
indexing rule stands unchanged. Supersedes the measured-threshold policy that
this file described before OVE-368.

## Rule

Every live public page is indexable. A page is `noindex` only when it is:

- not a public candidate: workspace, auth, and operator routes, a record that
  is gone (410 tombstone for 7 days, then 404), or a page whose load failed;
- an empty listing: a directory, feed, topic, or catalog that lists nothing;
- served under a locale prefix that its canonical path does not carry;
- an organism card without first-hand content (ADR-0026 D9): a species,
  cultivar or breed page whose content comes only from sources stays `noindex`
  until a gardener publishes on it or the owner marks it indexable
  (`catalog_items.first_hand_content_at`, `indexable_override`). Live since
  Slice 24. A `noindex` organism page also carries no JSON-LD and no
  `lastmod` line in the catalog sitemap — the graph and the sitemap are built
  from the same decision, so there is no second rule to keep in step. This is
  what keeps 101,619 source-built organism pages out of the index without a
  word count or a quality class.

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
(`authored`, `catalog`, `topics`, `communities`, `profiles-N`, `entries-N`).
Both are route handlers that read the database at request time
(`src/server/public-sitemap.ts`, `src/server/public-sitemap-repository.ts`);
nothing is generated at build.

**A chunk lists every canonical URL and nothing else.** A page that is
self-canonical in each of the three route families contributes three URLs —
authored content, organism cards, profiles and communities all do. A page whose
canonical is a single unprefixed address contributes one: topics today, journal
entries and object passports permanently (ADR-0029 D10, since their content is
never translated).

**Chunks are budgeted in emitted URLs, not in rows** — 5 000 URLs per chunk. A
row that yields one URL per locale therefore fills a chunk three times faster
than a row that yields one.

**No chunk emits a URL the page itself would refuse to index.** Where the SQL
predicate does not already imply eligibility, the chunk evaluates the page's own
`sitemapEligible` decision: a community can be active, on a curated topic, and
hold no contributions, which the empty-listing rule refuses. Where the predicate
does imply it, the code says which clause does the work — a journal entry's
`body` CHECK, a profile's `exists(public entries)` — rather than leaving the
reader to re-derive it.

## Robots

`/robots.txt` allows every crawler on public routes and disallows `/garden`,
`/account`, `/auth`, `/erasure`, `/api` and `/skeleton`. Those routes are
already `noindex` and already answer 401/403 to an unauthorised reader: the list
buys crawl budget, not privacy. Privacy is enforced server-side and never by
this file.

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
