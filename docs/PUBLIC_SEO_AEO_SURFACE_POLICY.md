# Public SEO/AEO Surface Policy

Status: current implementation policy
Date: 2026-07-03
Owner: founder/operator
Linear: OVE-115, OVE-116

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
- The existing homepage `/` is the first authored marketing landing surface and is included in the sitemap.
- OVE-116 adds the first authored content foundation in `apps/web/src/server/public-seo-content.ts`: `/blog`, one blog article, one guide, one AEO answer page, and `/markets/ukraine` plus `/markets/bulgaria`.
- The UA/BG market routes are live in English for the MVP content foundation; locale-specific `/uk/...` and `/bg/...` routes, hreflang, and language switching remain the OVE-117 localization foundation handoff.
- Public journal entries require explicit publication and remain `noindex` while `public_noindex = true`.
- Variety and topic aggregation pages require all content-quality thresholds before they become indexable.
- Current aggregation thresholds are at least 3 safe public entries and at least 600 aggregate body characters.
- Public profiles and full lineage graph pages are shareable but `noindex`.
- Missing public surfaces are `noindex` and never sitemap-eligible.

## Sitemap Rule

`apps/web/src/app/sitemap.ts` must include only surfaces whose server-side policy returns `sitemapEligible = true`.

The sitemap must not include:

- authenticated routes such as `/garden`, `/admin`, or operator readouts;
- invite, auth, reset, health, erasure, or pilot diagnostic routes;
- public journal entries while `public_noindex = true`;
- private, archived, public-gone, owner-scoped, provisional, rejected, merged, or thin aggregation rows;
- free tag, profile, or lineage graph URLs while they are policy `noindex`.

## Metadata And Structured Data Rule

Public route metadata must use the same policy for `robots`.

Structured data must never bypass the policy. For example, variety JSON-LD is emitted only when the server policy marks the variety aggregation indexable. Thin pages must not receive templated JSON-LD because that is both a quality risk and an AEO spam signal.

OVE-116 answer-page JSON-LD is limited to curated authored answer pages. It must include only the page, FAQ questions, and FAQ answers already visible in the HTML; it must not carry private journal text, media internals, raw source payloads, or user identifiers.

## Privacy Boundary

Robots and sitemap controls are discovery controls, not privacy controls. The privacy boundary remains data-level minimization:

- no precise coordinates in public HTML, metadata, URL, sitemap, JSON-LD, logs, or public search documents;
- public media uses stripped derivatives only;
- owner ids, emails, invite links, tokens, raw journal internals, quarantine keys, and source-only catalog fields stay out of public surfaces;
- archived/public-gone entries leave sitemap/indexable metadata and return the appropriate public gone state.

## Non-Goals

- This policy and OVE-116 content foundation do not create the full localization system. That belongs to OVE-117.
- This policy does not promote every variety/topic page. OVE-130 and OVE-139 must use the same policy and add stronger evidence gates where needed.
- This policy does not add monetization.
