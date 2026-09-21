# Static catalog directory: family receipt

Date: 2026-09-21. Second page family of OVE-467. The organism detail and
register pages keep their existing implementations; this migrates `/catalog`.

## Behavior

The plain catalog renders its title, filters, alphabet and result cards in its
static document. The former localized layout boundary and default loading file
are removed. All four reads use the established static-render attempt: a failure
in kingdoms, register hubs, results or facets defers the render instead of
caching a degraded document. At request time the existing recoverable state
remains. Metadata uses the same static-aware loader as the other migrated pages.

The internal query twin accepts exactly `kingdom`, `rank`, `register`, `grown`,
`letter`, `q`, `sort` and `page`. Repeated facets examine every value when choosing
the twin, so `kingdom=&kingdom=plantae` cannot silently render an unfiltered static
page. Unknown tracking keys retain the static document. The twin itself is not
a public address. Canonical paths, repository queries, indexing rules and the
organism-address contract are unchanged.

Facet and sort selection uses the shared document-navigation option introduced
for journals. This makes the proxy select the query tree instead of reusing a
cached default tree. Alphabet links retain client navigation; the keyboard proof
asserts the selected letter and hidden form field after navigation, not just the
changed URL. A retained hidden route tree is excluded from visible-state queries.

The no-JavaScript proof covers the plain static directory in all three locales.
The shared `/q/loading.tsx` still makes filtered views request-time streamed
content; GET markup and responses are tested separately. This migration does
not claim that every filtered interaction works as a visible no-script page.
Broader filter interaction work remains in the discovery redesign.

## Validation completed

- Focused unit suites: 21 assertions across the page, query-twin routing and
  catalog component, including all four failed static reads, repeated facets,
  recoverable request-time failures and out-of-range pages.
- Catalog browser suite: 8 passed; addresses, canonical/indexing, GET filter
  responses, hydrated keyboard alphabet navigation and axe at 375/1440 px.
- Static-document browser suite: 14 passed, including catalog HTTP/no-JS
  coverage in UK/BG/RU and held-reveal adoption for guest/member sessions.
- Healthy, unconfigured (both database variables explicitly empty) and
  unreachable loopback database builds pass. Lint and typecheck pass.

- Full unit/contract suite: 4,311 passed, 29 existing skips across 564 passing
  files; media worker: 14 passed. Full lint passes.

- Full production-build browser gate: 207 passed, one existing skip, no retries
  (5.9 minutes).

## Matched evidence and limits

The same 12 catalog card IDs were present before and after. Before, 0/12 were
outside hidden segments; after, 12/12 are visible in the served bytes. The title
moves into head; the loading directory disappears; visible text grows from
1,422 to 2,005 characters. Sorted SEO tags (18), title and the JSON-LD graph
are byte-identical. `ove-467-catalog/seo-parity.json` holds that comparison.

Lighthouse CLI 13.5.0, default mobile configuration, three samples per method,
no concurrent build/test work:

| Environment and method | Before | After |
| --- | --- | --- |
| Local applied LCP | 1,507.84 ms | 1,769.27 ms |
| Local simulated LCP | 3,757.41 ms | 3,975.27 ms |
| Local CLS | 0 | 0 |
| Production applied LCP baseline | 3,113.70 ms | Measured after release |
| Production simulated LCP baseline | 4,709.49 ms | Measured after release |

The local applied result meets 2 s but worsens by 261.43 ms; the simulated
result also worsens. Its LCP element is the consent notice paragraph. This is
proof of visible document delivery, not a measured speedup. Production's budget
is unmet before this release and is a separate acceptance still to prove.

The production baseline was remeasured on parent main
`d10c002ead8962b543da3c8807185a1277430c25`, after the journal release, so that
release is not attributed to this change. Local baseline runtime `ca1a8ac5`
is identical to that parent main. The final local build discards ISR snapshots
from temporary browser fixtures. One new local curation test node is retained
by its immutable audit receipt; its public address was temporarily unset for
measurement to reproduce the original 12-card fixture, then restored exactly.
No audit history was deleted. The unmatched 13-card attempt was discarded.

`ove-467-catalog/performance.json` records every sample, configuration and report
hash. Adjacent compressed reports omit embedded screenshots only. Production
release evidence follows after green CI and exact-SHA deployment. OVE-467
and the complete redesign remain in progress.
