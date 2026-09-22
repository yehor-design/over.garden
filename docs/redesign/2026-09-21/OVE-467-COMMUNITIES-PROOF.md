# Static community list and community page: family receipt

Date: 2026-09-22. Fourth page family of OVE-467 (ADR-0032 D8): `/communities`
and `/communities/{slug}`, in all three locales.

## Behavior

Both pages are static documents. The family's `loading.tsx` is gone; the
discussion page, which reads its viewer from its first line, keeps a boundary
of its own beside it. `/communities/{slug}` carries one placeholder sample for
`generateStaticParams`, and both pages go through `renderStaticPublicPage`: a
read that fails defers to the request instead of caching a degraded page, and
a build with no reachable database defers instead of failing.

**The list no longer reads who is reading.** It used to hand a signed-in
gardener a directory with the covers and counts of anyone they had blocked left
out. A static page cannot know its reader, and the list now follows the home
feed: a block governs what a gardener is offered to do and whose profile they
are shown — the proxy refuses that one — not which communities a public list
names.

**The community page keeps every viewer-dependent control**, as request-time
regions whose fallback is the guest's working rendering (D2), in
`community-regions.tsx`: join / leave, the contribution picker, the first-run
action, each contribution's report and block, the moderation link, the resumed
sign-in intent's focus, and the result message a membership redirect carries.
The member's view of the community is read once per request and shared by every
region. A contribution the member's own reading leaves out — the author is
behind a block — renders no controls rather than the guest's.

`q`, `kind` and `cursor` are the community's own parameters and render from an
internal `/q/communities/{slug}` twin (not an address: it answers 404).
`communityAction`, `authIntent` and `authControl` are the regions' to read and
keep the static document. The twin table now holds two kinds of entry: paths,
and patterns for the addresses whose path carries a name — the profile's handle
and the community's slug.

Canonical addresses, `hreflang`, JSON-LD, indexing, the repository queries and
the moderation contracts are unchanged.

## Validation

- Focused unit suites: 18 assertions across the list, the community, the twin
  and the query-twin table — a page that never consumes `searchParams` or the
  session, the placeholder sample rendering nothing, a deferred static read, a
  settled request-time failure, and the twin's own request object.
- Full unit/contract suite and lint/typecheck: see the pull request.
- Builds: healthy, `DATABASE_URL`/`DIRECT_URL` explicitly empty, and an
  unreachable loopback database.
- `static-documents.spec.ts`: 16 passed. The new row walks `/communities` and
  `/communities/{slug}` in UK/BG/RU twice each, with `?communityAction=joined`
  and `?authIntent=follow` keeping the static document; `?kind=plant` rendering
  from the twin at the same address; `/q/communities/{slug}` answering 404; and
  an unknown slug answering 404. The family also joined the no-JavaScript,
  hydration and held-reveal rows.
- `communities.spec.ts`: 8 passed. The no-bundle join proof now asserts both
  halves — the guest's visible control is a real endpoint
  (`/auth/intent/start`), and the member's is the server-action form from the
  streamed region.
- Full production-build browser gate: see the pull request.

## Matched evidence

Both halves measured on 2026-09-22, same machine, same loopback database, same
seeded communities: *before* on a clean build of `main`
(`842a96b6e20d55bce987f0040d8d0eb6e935f824`), *after* on a clean build of this
branch, each with its own server and each page warmed three times first.

| Served document | Before | After |
| --- | --- | --- |
| `/communities` | title not in head, `<h1>` hidden, 931 visible characters | title in head, `<h1>` visible, 1,191 characters |
| `/communities/{slug}` | title not in head, `<h1>` and photograph hidden, 944 characters | both visible, title in head, 1,597 characters |

Sorted SEO tags (18 on the list, 2 on the community), title and JSON-LD are
byte-identical (`ove-467-communities/seo-parity.json`). The gate database's
community holds no contributions, so it is `noindex` with no canonical on both
sides — an empty listing is one of the three places `noindex` is allowed
(ADR-0022 D4); the populated case is covered by the unit tests and by
`communities.spec.ts`.

Lighthouse CLI 13.5.0, default mobile configuration, median of three:

| Surface and method | Before | After |
| --- | --- | --- |
| List, applied LCP | 1,737.91 ms | 1,732.78 ms |
| List, simulated LCP | 3,961.63 ms | 3,960.27 ms |
| List, max CLS | 0 | 0 |
| Community, applied LCP | 1,511.69 ms | 1,509.68 ms |
| Community, simulated LCP | 3,608.16 ms | 3,909.54 ms |
| Community, max CLS | 0.0501 | 0.000189 |

The applied figures are flat — their element is the consent notice's
paragraph, as on the catalog and the profile — and the community's layout
shift is gone. The community's *simulated* figure is 300 ms worse; the
simulated lane is a model over the same byte counts (both runs make the same 69
requests), and the applied lane is what DESIGN.md §9 measures. No speedup is
claimed here; the production budget of 2 s is OVE-469's acceptance.

Reports (screenshots omitted) and hashes are in
`ove-467-communities/performance.json`.

## A trap worth writing down

`pkill -f "next start"` does not stop a Next server: the process renames itself
to `next-server (v16.2.11)`, so the pattern matches nothing. A first attempt at
this comparison measured both halves against one surviving server whose `.next`
had been rebuilt underneath it — its cached HTML named a stylesheet that no
longer existed, the page rendered nearly unstyled, and the "before" numbers
were 450 ms *better* than they should have been. Kill by port
(`lsof -t -i :3189`), and check that the document's stylesheets answer 200
before trusting a measurement.
