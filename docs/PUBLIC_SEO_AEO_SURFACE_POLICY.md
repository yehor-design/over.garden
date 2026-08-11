# Public SEO/AEO Surface Policy

Status: current implementation policy
Date: 2026-07-03
Owner: founder/operator
Linear: OVE-115, OVE-116, OVE-117, OVE-130

## Purpose

This policy defines which public OverGarden surfaces may be indexable and eligible for `sitemap.xml`. It is the developer-facing bridge between the product research in `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md`, the page map in `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`, and the app implementation in `apps/web/src/server/public-surface-indexing-policy.ts`.

## Product Assumption

OverGarden can start public discovery at MVP through authored, useful pages, while UGC and aggregation pages earn indexability only after they are safe and non-thin. The upside is early search/AEO visibility; the risk is sitewide quality damage if thin programmatic pages enter the index too early.

## User Job And Trust Concern

A visitor should find useful public OverGarden pages without encountering empty catalog stubs, private workspace surfaces, unsafe UGC, precise location, raw media keys, or owner-scoped content. A gardener should be able to publish without that publication automatically making every related aggregation indexable.

## Current Server Policy

The source of truth is `apps/web/src/server/public-surface-indexing-policy.ts`.

Current decisions:

- Authored useful surfaces may be indexable and sitemap-eligible: marketing landing pages, editorial blog pages, guide pages, and AEO answer pages.
- OVE-173 replaces the localized authored homepages with a read-first public UGC feed. `/`, `/bg`, and `/ru` therefore emit `noindex, nofollow` and remain out of the sitemap until a later explicit quality gate promotes a safe, non-thin feed surface. Ukrainian remains the unprefixed canonical default for the primary domain.
- Private workspace, auth, and operator route groups such as `/garden`, `/auth/*`, and `/admin/*` must emit `noindex, nofollow` route metadata. This metadata is a crawl-quality control, not a privacy boundary.
- OVE-116 adds the first authored content foundation in `apps/web/src/server/public-seo-content.ts`: `/blog`, one blog article, one guide, one AEO answer page, and `/markets/ukraine` plus `/markets/bulgaria`.
- OVE-117 moves the canonical public content routes into language-aware surfaces, superseded by the 2026-07-05 domain-default locale decision: Ukrainian uses unprefixed routes such as `/`, `/blog`, and `/markets/ukraine`; Bulgarian uses `/bg`; Russian remains available as `/ru` for the Bulgarian market.
- Root `/` renders Ukrainian by default. Requests with a Bulgaria country signal redirect to `/bg`; legacy `/uk` URLs permanently redirect to their unprefixed equivalents.
- Public journal entries require explicit publication and remain `noindex` while `public_noindex = true`.
- Variety and topic aggregation pages require all content-quality thresholds before they become indexable.
- Current aggregation thresholds are at least 3 safe public entries, at least 600 aggregate body characters, and a trust gate. Variety aggregation must be backed by either a curated `confirmed` catalog item or a seeded item from an approved source-backed family. Topic aggregation must pass a curated-topic trust state before a future topic route can become indexable.
- Topic/tag capture is only a signal layer. `journal_entry_topic_signals` may connect entries to explicit safe tags, object context, catalog context, catalog mentions, or operator-curated topics, but public topic membership must use only `accepted` + `eligible` signals for `curated` topics and must still pass the aggregation thresholds above.
- Public living-object passport pages, public profiles, and full lineage graph pages are shareable but `noindex`.
- Missing public surfaces are `noindex` and never sitemap-eligible.

## Sitemap Rule

`apps/web/src/app/sitemap.ts` must include only surfaces whose server-side policy returns `sitemapEligible = true`.

Static and authored SEO/AEO sitemap URLs must use canonical localized paths. Non-localized public content URLs are legacy redirects and must not be included.

Every sitemap row must include a stable `lastmod`/`lastModified` value. Authored static/content surfaces use their explicit content-foundation date, while promoted aggregation rows must provide the latest safe public source-content timestamp through the same sitemap-entry path. Do not use build time or request time as a fake freshness signal.

The sitemap must not include:

- authenticated routes such as `/garden` or surviving operator readouts;
- lineage-invitation claim, auth, reset, health, or erasure routes;
- retired control-plane paths such as `/admin`, `/admin/users`, `/join`, and
  the former pilot diagnostic routes (which must remain exact `404`);
- public journal entries while `public_noindex = true`;
- private, archived, public-gone, owner-scoped, provisional, rejected, merged, unsafe-source, untrusted-topic, or thin aggregation rows;
- free tag, object passport, profile, or lineage graph URLs while they are policy `noindex`.

## Metadata And Structured Data Rule

Public route metadata must use the same policy for `robots`.

Structured data must never bypass the policy. For example, variety JSON-LD is emitted only when the server policy marks the variety aggregation indexable. Thin pages must not receive templated JSON-LD because that is both a quality risk and an AEO spam signal.

OVE-116 answer-page JSON-LD is limited to curated authored answer pages. It must include only the page, FAQ questions, and FAQ answers already visible in the HTML; it must not carry private journal text, media internals, raw source payloads, or user identifiers.

## Robots.txt Rule

`apps/web/src/app/robots.ts` must point to the canonical `https://over.garden/sitemap.xml` and allow normal crawl/retrieval discovery for public authored/indexable pages. It must not block workspace/auth/operator paths as a substitute for route-level `noindex`, because crawlers need to see page metadata and `robots.txt` is not a privacy control.

## Privacy Boundary

Robots and sitemap controls are discovery controls, not privacy controls. The privacy boundary remains data-level minimization:

- no precise coordinates in public HTML, metadata, URL, sitemap, JSON-LD, logs, or public search documents;
- public media uses stripped derivatives only;
- owner ids, emails, invite links, tokens, raw journal internals, quarantine keys, and source-only catalog fields stay out of public surfaces;
- archived/public-gone entries leave sitemap/indexable metadata and return the appropriate public gone state.
- user-generated journal bodies stay in the author's language and must not be machine-translated silently for localized route chrome or hreflang clusters.

## Non-Goals

- This policy does not localize authenticated product workspace routes; `/garden` remains the gated workspace path until a later slice migrates private/product app routing.
- This policy does not promote every variety/topic page. OVE-130 adds the source/catalog trust gate for promotion; OVE-139 feeds topic pages through the same curated-topic gate before any topic URL enters the sitemap. Provisional explicit tags, low-confidence assignments, archived entries, private entries, and public-gone entries are not public topic membership.
- This policy does not add monetization.
