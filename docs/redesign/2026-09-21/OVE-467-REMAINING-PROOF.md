# Remaining public families as static documents: receipt

Date: 2026-09-22. The fifth to tenth OVE-467 families (ADR-0032 D8):
`/topics/{slug}`, `/knowledge`, the article shape (`/blog`, `/blog/{slug}`,
`/guides/{slug}`, `/answers/{slug}`), `/markets/{market}`, the legal pages
(`/privacy`, `/support`, `/first-publication-disclosure`) and `/sources/eppo`,
in all three locales.

They ship in one pull request, not one per family as the issue's scope asks.
The work was left in the checkout by an earlier session as two uncommitted
units that shared the query-twin table, the cache module and the gate spec;
the owner asked for it to be finished as it stood (2026-09-22). Every family
still has its own rows in `tests/static-documents.spec.ts`, its own served-byte
evidence below and its own production numbers.

## Behavior

- **Topic.** A static document with one placeholder sample for
  `generateStaticParams`. Entries, evidence and counts are the same for every
  reader; the follow control — the one thing that is not — is a request-time
  region (`topic-regions.tsx`) with the guest's control as its fallback, and it
  alone reads `authIntent`. The route's `loading.tsx` is gone.
- **Knowledge hub.** Static; `q`, `type` and `kind` render from an internal
  `/q/knowledge` twin (not an address: it answers 404). Its `loading.tsx` is
  gone. The filter bar already crosses into the twin with a document
  navigation (OVE-482).
- **Articles.** Guides and answers read their evidence through the cached
  `readPublicKnowledgeEvidence`; a failed read defers to the request instead of
  caching a page whose evidence says nothing. The blog and the three authored
  shapes lost their `loading.tsx`.
- **Markets.** The landing is authored text; its `loading.tsx` is gone.
  `generateStaticParams` now lists the default locale too: since ADR-0032 D1
  the proxy rewrites `/markets/ukraine` to `/uk/markets/ukraine`, and a pair
  left out rendered on demand from the fallback shell — once the page lost its
  boundary that regenerated with a revalidate of 0 and answered **500** under
  `next start`.
- **A landing written in fewer than three languages** (found here, and already
  wrong in production). `ukraine` exists in Ukrainian only and `bulgaria` in
  Bulgarian and Russian, but the proxy rewrote the unprefixed address into the
  reader's language regardless: a Bulgarian or Russian reader of
  `/markets/ukraine`, and a Ukrainian reader of `/markets/bulgaria`, got the
  not-found page inside a 200 ("Пазарна страница"). Now the reader gets the
  landing in a language it has (`src/lib/market-landing-locales.ts`), and a
  prefixed spelling of a translation that does not exist (`/bg/markets/ukraine`)
  answers one 308 to the page.
- **Legal pages.** They were already static (no boundary, no request data);
  they now have their row in the gate.
- **EPPO archive.** `/sources/eppo` is static; `kind`, `q` and `cursor` render
  from an internal `/q/sources/eppo` twin. The unfiltered first page is a cached
  read (`readPublicEppoSourcePage`, tagged `catalog`). A record page
  (`/sources/eppo/{code}`) is not in the issue's list and keeps a boundary of its
  own beside it.
- **The dark archive.** `STABLE_REGISTRY_PUBLIC_DISCOVERY` is not installed in
  production (ADR-0025 D3), so the archive is dark there — and it answered a
  soft 404 (200, not-found page inside) at every address. The proxy now answers
  a real 404 at every `/sources/eppo/**` address while the flag is off
  (`src/proxy.test.ts`). The CI browser job opens the archive
  (`.github/workflows/ci.yml`): before, `editorial-surfaces.spec.ts` asserted
  "200 and the word EPPO" against that soft 404, which is to say it proved the
  not-found page.

Canonical addresses, `hreflang`, JSON-LD and indexing are unchanged except
where noted under *Served bytes*.

## Validation

- Unit/contract suite: 564 files, 4,334 tests; lint and typecheck clean.
- Builds: `DATABASE_URL`/`DIRECT_URL` empty; an unreachable loopback database;
  healthy. With the archive open the healthy build logs no
  `DYNAMIC_SERVER_USAGE` (as `main` in CI); with it closed the 21 it logs are all
  `/[locale]/sources/eppo`'s not-found render reading the session, and the build
  succeeds.
- Full production-build browser gate on a fresh database: **218 passed**, one
  existing external-fixture skip, no failures. New rows: the authored pages, a
  market and the archive (UK/BG), the knowledge hub and a topic (UK/BG/RU, and
  `?authIntent=follow` keeping the static document), a Bulgarian reader of
  `/markets/ukraine` getting the Ukrainian landing, `/bg/markets/ukraine`
  answering 308, both twins answering 404 by name, and the families added to
  the no-JavaScript, hydration and held-reveal rows.

## Served bytes

Production before the change (`seo-production-before.json`, crawler user agent,
explicit language cookie):

- Knowledge, blog, articles and markets: 12–18 SEO tags and one JSON-LD block
  each; the after-release readback is in the Linear receipt.
- **Topics had no `<title>` and no SEO tag in the served HTML at all** — the
  metadata was only in the flight payload, even for Googlebot. A static topic
  has them in `<head>`.
- Legal pages: two SEO tags, `noindex, nofollow` (non-candidate surfaces), and
  no JSON-LD.
- `/sources/eppo`: a soft 404 in production (dark archive).

## Performance

Lighthouse CLI 13.5.0, default mobile configuration, production, three samples
per method (`ove-467-remaining/production-before-*.json.gz`,
`production-before-samples.json`). Before the change:

| Surface | Applied LCP (median) | Simulated LCP (median) | Max CLS |
| --- | --- | --- | --- |
| `/knowledge` | 3,218 ms | 4,725 ms | 0 |
| `/topics/plants` | 5,079 ms | 3,965 ms | 0.1215 |
| `/guides/start-a-living-plant-record` | 3,069 ms | 3,361 ms | 0.1215 |
| `/blog` | 3,069 ms | 4,859 ms | 0 |
| `/markets/ukraine` | 3,076 ms | 4,708 ms | 0.1834 |
| `/privacy` | 3,077 ms | 3,371 ms | 0 |

The after-release medians, measured the same way on the released build, are
in the Linear receipt. The production budget (`LCP ≤ 2.0 s`) is OVE-469's
acceptance; no speedup is claimed here.

## Not claimed

- `/sources/eppo/{code}` stays a request-time page.
- The pre-existing `Invalid revalidate configuration provided: 0 < 1` that
  `next start` logs while an entry page or a passport regenerates in the local
  gate is not investigated here; production (Vercel) logged no 500 on any page
  in the seven days before this change.
