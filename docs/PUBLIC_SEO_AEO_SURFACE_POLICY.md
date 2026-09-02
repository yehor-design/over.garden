# Public SEO/AEO Surface Policy

Status: active. Owner decision: ADR-0022, D3 (2026-09-02). Supersedes the
measured-threshold policy that this file described before OVE-368.

## Rule

Every live public page is indexable. A page is `noindex` only when it is:

- not a public candidate: workspace, auth, and operator routes, a record that
  is gone (410 tombstone for 7 days, then 404), or a page whose load failed;
- an empty listing: a directory, feed, topic, or catalog that lists nothing;
- served under a locale prefix that its canonical path does not carry.

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

## Sitemap

`/sitemap.xml` is a sitemap index; `/sitemaps/<chunk>.xml` serves one chunk
(`authored`, `catalog`, `topics`, `communities`, `profiles-N`, `entries-N`,
5 000 URLs per chunk). Both are route handlers that read the database at
request time (`src/server/public-sitemap.ts`,
`src/server/public-sitemap-repository.ts`); nothing is generated at build.
Every indexable public page belongs to exactly one chunk.

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
