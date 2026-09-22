# Static public profile and object passport: family receipt

Date: 2026-09-22. Third page family of OVE-467 (ADR-0032 D8): the public
profile `/@{handle}` (and `/bg`, `/ru`) and the object passport
`/@{handle}/objects/{slug}`.

## Behavior

Both pages are static documents now. Their `loading.tsx` files are removed, the
profile route and the author-scoped passport route each carry one placeholder
sample for `generateStaticParams`, and both go through `renderStaticPublicPage`:
a failed read defers to the request instead of caching a degraded page, and a
build without a reachable database defers instead of failing.

What differs by reader lives in request-time regions below the public content,
each with the guest's working rendering as its fallback (ADR-0032 D2):

- profile: follow / unfollow / report / block (`profile-regions.tsx`), and the
  result message of a profile action;
- passport: the like and comment panel, and each confirmed lineage edge's
  follow and question forms (`passport-regions.tsx`).

`?tab=` is the only query key the profile reads. It renders from an internal
`/q/@{handle}` twin; the twin is not an address (naming it answers 404), and an
unknown key such as `utm_source` keeps the static document. Choosing a tab
writes the address with `history.replaceState`: every panel is already in the
page, and a router navigation to the twin re-mounted the tree under the
keyboard and lost focus mid-arrow-key.

The mutual-block refusal is unchanged for readers: the proxy answers 404 to a
blocked viewer, now for RSC and prefetch requests as well as documents, before
the shared static representation is read. The page itself never reads the
session.

The author-scoped passport resolves its object through a cached resolver
(`readPublicObjectPassportIdBySlug`, tagged `catalog`, the author's profile tag
and the object's tag) and renders the passport in its own static attempt; it no
longer calls the id route, which would have started a second attempt inside the
first. Lineage claim and invitation acceptances now also expire the `catalog`
and `profiles` tags, since a confirmed edge changes the passport at both ends.

Canonical addresses, `hreflang`, JSON-LD, indexing, the repository queries and
the address law are unchanged.

## Validation

- Focused unit suites: 299 assertions across the profile, the `/q` twin, the
  passport at both addresses, the proxy and the lineage actions — including a
  page that never consumes `searchParams`, deferral of a failed static read, and
  the passport rendering once, in its route's phase.
- Full unit/contract suite: 4,321 passed, 29 existing skips (564 files); media
  worker 14 passed. Lint and typecheck pass.
- Builds: healthy, `DATABASE_URL`/`DIRECT_URL` explicitly empty, and
  `postgres://nobody:nobody@127.0.0.1:59999/nothing` — all three succeed.
- `static-documents.spec.ts`: 15 passed. New row: UK/BG/RU profile and the
  passport, twice each, with `<h1>` and first photograph outside every hidden
  segment, `<title>` and the image preload in `<head>`, no skeleton and over 600
  characters of visible text; a tracking key keeps the static document;
  `?tab=entries` renders that tab; `/q/@…` answers 404. The profile, its tab view
  and the passport joined the no-JavaScript, hydration, held-reveal (guest and
  gardener) and section-marker rows.
- `public-profile.spec.ts`: 5 passed, twice. Two proofs were adjusted to the
  static document, not relaxed: the no-bundle follow proof now asserts the
  guest's visible follow is a real endpoint (`/auth/intent/start`) and posts the
  gardener's server-action form from the streamed region; the rename proof seeds
  a passport nobody has read, because a static profile open in a browser now
  prefetches — and so renders and caches — the static passports it links to.
- Full production-build browser gate: 208 passed, one existing skip, no retries.

## Matched evidence

The same loopback database and the same one-object fixture (`ove467perf`) were
measured before (parent main runtime, 2026-09-21) and after (this branch).

| Surface | Served document before | After |
| --- | --- | --- |
| Profile | title not in head, `<h1>` and photo hidden, skeleton, 997 visible characters | title and image preload in head, `<h1>` and photo visible, no skeleton, 1,725 characters |
| Passport | same, 960 visible characters | same as profile, 2,067 characters |

Sorted SEO tags (18 on the profile, 12 on the passport), title and JSON-LD are
identical once the two builds' local origins are read as one
(`ove-467-profile/seo-parity.json`).

Lighthouse CLI 13.5.0, default mobile configuration, median of three:

| Surface and method | Before | After |
| --- | --- | --- |
| Profile, local applied LCP | 1,779.17 ms | 1,780.07 ms |
| Profile, local simulated LCP | 4,121.47 ms | 4,116.96 ms |
| Profile, local max CLS (applied) | 0.0837 | 0 |
| Passport, local applied LCP | 1,496.96 ms | 1,513.22 ms |
| Passport, local simulated LCP | 3,807.34 ms | 3,757.67 ms |
| Passport, local max CLS | 0.1219 | 0.00037 |
| Profile, production applied LCP | 5,332.98 ms | after release |
| Passport, production applied LCP | 6,354.86 ms | after release |

Locally the LCP is flat — its element is still the consent notice's paragraph,
as on the catalog — and the layout shift is gone: the swap of the loading shape
for the page was the shift, and there is no swap now. No speedup is claimed;
the production budget of 2 s is not met before this release and is OVE-469's
acceptance. Reports (screenshots omitted) and hashes are in
`ove-467-profile/performance.json`.

## Known log noise

A background regeneration of a passport whose fixture was renamed in raw SQL
logs `DYNAMIC_SERVER_USAGE` and `Invalid revalidate configuration provided:
0 < 1` — the same line `main` logs for a vanished entry (a race only a test's
raw write produces). Readers of the old address get the proxy's 308.
