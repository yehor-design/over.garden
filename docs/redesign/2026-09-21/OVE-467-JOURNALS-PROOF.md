# Static journal directory: family receipt

Date: 2026-09-21. First family of OVE-467; this receipt does not close the
remaining page families or the production performance work.

## Behavior

The plain journal directory renders its content as a static document, including
its title, filter controls and entry cards. A photograph eligible for first-screen
priority carries its preload in the head. The old
localized layout boundary and unprefixed loading file are removed. A failed or
unavailable database defers through the existing `renderStaticPublicPage`
mechanism instead of caching an error/empty response for every reader.

The internal `[locale]/q/journals` twin handles exactly the normalizer's keys:
`q`, `kind`, `catalog`, `topic`, `season`, `region`, `sort`, `page`. The proxy keeps
the reader's address unchanged and refuses direct `/q` addresses. Unknown
tracking parameters retain the static document. Metadata still describes the
unfiltered first page; existing pagination indexing rules remain authoritative.
Repository queries, public addresses and the journal data contract are unchanged.

The migration exposed a client navigation cache boundary: the plain page does
not read `searchParams`, so Next can reuse its cached tree for a query-only
navigation without reaching the proxy. Journal facet and sort changes therefore
use a document navigation to let Proxy resolve the correct tree. Chip removals
retain their existing client links and live result-count region. The trade-off
is that selecting a facet loads a new document rather than announcing into the
previous document's result-count region. Browser tests wait for hydration after
each document navigation and check three filters, reload and Back. The focused
production-build browser suite passes all five cases (7.8 s), including chip
removal preserving the live region, no-JS GET filtering, and accessibility at
375/1440 px. The focused component suite passes nine tests. The full gate passes 205 scenarios with one existing skip and no retries.
The final performance samples below use the release candidate runtime.

## Served bytes and SEO

With the same eight-entry local fixture, before and after:

| Fact | Before | After |
| --- | --- | --- |
| Title inside head | No | Yes |
| First photograph preload inside head | No | Yes |
| First photograph hidden | Yes | No |
| Entry cards outside every hidden segment | 0 of 8 | 8 of 8 |
| Directory state in initial visible bytes | Loading | Ready |
| Visible text characters | 1,293 | 5,471 |

`ove-467-journals/local-before.json` and `local-after.json` record the HTTP
inspection. `seo-parity.json` records byte-identical sorted SEO tags (18), title,
and JSON-LD (one graph). Moving metadata into head changes its location, not its
value. Browser gate assertions inspect HTML offsets, rather than accepting the
post-hydration DOM as evidence of a static document.

## Performance method and limits

Lighthouse CLI 13.5.0, default mobile throttling, production build, same machine,
URL and eight-entry fixture before/after; three samples per method. Baseline
`fbcd448e2be66b6f89f8bdaa7b922a61cc86d8fa` has the same product code as merged
main `18f1a4e9b91eb12e6e7a01ffda04702ade84d0d3`. Final after samples ran without
concurrent build/test work, after rebuilding the same code to remove ISR results
left by temporary browser fixtures. Synthetic WebP objects were stored in loopback MinIO,
not production. The fixture stayed unchanged between captures.

| Local median | Before | After |
| --- | --- | --- |
| Applied throttling LCP | 1,809.08 ms | 1,804.02 ms |
| Simulated LCP | 3,757.20 ms | 4,348.41 ms |
| Applied CLS | 0 | 0 |

**The measured LCP element is the unanswered consent notice paragraph in both
runs.** These figures meet the local applied budget but do not demonstrate a
material content-paint speedup. The simulated result worsened; it is retained,
not omitted. The content delivery proof is the HTTP evidence above. Production
network performance must be measured independently; the existing production
budget work remains open.

`ove-467-journals/performance.json` contains each sample, environment, throttling,
LCP element and hashes. Adjacent compressed reports retain all numeric audits
and diagnostics but omit redundant embedded screenshot images.

## Validation

- Full local unit/contract suite: 563 files, 4,301 passed, 29 existing skips;
  media worker: 14 passed.
- Existing proxy suite and focused page/twin tests passed. A failed static read
  explicitly throws the deferral signal; filtered request-time failures retain
  the existing recoverable interface.
- Lint passed.
- Healthy, effectively unconfigured (`DATABASE_URL` and `DIRECT_URL` empty),
  and unreachable loopback database production builds passed. Blank environment
  values deliberately prevent `.env.local` from supplying a real connection.
- Full browser gate: 205 passed, one existing skip, no retries (5.9 minutes).
  The gate now covers visible directory content in UK/BG/RU, no-JS reading,
  query twins and held segment adoption for guest/member sessions.
- The static-document fixture warms the directory, then publishes through the
  real atomic API on loopback. Each locale must contain the returned public
  entry address. This proves publication invalidates a prerendered snapshot,
  including CI builds over an initially empty database; raw SQL seeding alone
  cannot invalidate it.

No production data, account settings or consent choices are changed by this work.

## Production release

PR #439 merged after CI run `35640381821` passed at tested head
`dd5109474feba1811680a8d86b551ece986e2b5f`: browser shards 103 + 102 passed,
one existing skip, no retries; web checks and Python passed. Local `main`
and `origin/main` were synchronized to `d10c002ead8962b543da3c8807185a1277430c25`.
Vercel `dpl_8opJcEmqnvYzFiHvDX4ZzEwm6qd9` reached READY on that exact SHA.

Production `/journals` serves all eight entry cards outside hidden segments,
with the title in head and 4,747 visible text characters, through PRERENDER/HIT.
The first photograph is eager with high fetch priority; Vercel carries its
preload in the HTTP `Link` header rather than an HTML link element. The sorted 18 SEO tags, title and JSON-LD are byte-identical to the
previous production release. UK/BG/RU and `?kind=plant` return 200; the held-reveal
probe adopts all 25 segments with no dropped segment, leftover hidden segment,
page error or hydration error. These are read-only guest production checks;
signed-in publication and held-reveal scenarios use isolated local/CI fixtures.

Production Lighthouse CLI medians (same real data, URL and methods): applied
LCP **5,318.48 → 5,546.08 ms**, simulated **5,834.62 → 5,386.56 ms**; CLS 0.
The applied result worsened by 227.60 ms (4.3%); there is no production speedup
claim and the 2 s budget remains unmet. The document-content gate passes,
while the production performance acceptance remains open with the existing
bundle/media work. `ove-467-journals/production-performance.json` records all
samples and adjacent compressed reports; the HTTP and browser evidence are
saved alongside it.
