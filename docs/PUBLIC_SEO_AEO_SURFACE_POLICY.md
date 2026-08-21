# Public SEO/AEO Surface Policy

Status: current canon; runtime transition pending OVE-335 and OVE-336
Date: 2026-08-20
Owner: founder/operator
Linear: OVE-115, OVE-116, OVE-117, OVE-130, OVE-329
Posture authority: ADR-0018

## Purpose

This policy defines which public OverGarden candidates may be indexable and
eligible for `sitemap.xml`. It bridges the product research in
`docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md`, the page map in
`docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`, ADR-0018, and the
runtime owner in `apps/web/src/server/public-surface-indexing-policy.ts`.

The App Router Metadata API remains the implementation surface for route
metadata, `robots.ts`, and `sitemap.ts`. Route metadata and discovery files are
SEO controls, never privacy or authorization boundaries.

## Product Assumption

OverGarden earns public discovery through a single measurable content threshold
instead of blanket route-kind exclusion. The upside is earlier search/AEO reach;
the risk is index-quality damage if the starting threshold is too permissive.
OVE-335 owns the threshold runtime and OVE-336 owns structured-answer,
canonical, and locale-alternate parity.

## Candidate boundary

A page first has to be a public-surface candidate. Private workspace and auth
routes, positively private or erased records, missing pages, and internal
operator actions are not candidates. Their exclusion is a resolved product/data
state, not a low quality score.

Candidate examples include authored landing/editorial/guide/answer pages and
publicly readable feed, journal, variety, topic, passport, profile, or lineage
surfaces. A candidate is evaluated by one constant, regardless of its kind.

## Canonical measured threshold

Every caller reads the same owner-adjustable constant:
`PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`.

| Member                    | MVP starting value | Passing behavior                                                     |
| ------------------------- | ------------------ | -------------------------------------------------------------------- |
| `minimumQualityClass`     | `partial`          | `verified` and `partial` pass; `unverified` remains below threshold. |
| `minimumWordCount`        | `120`              | At least 120 meaningful visible words.                               |
| `minimumDistinctEntities` | `1`                | At least one distinct public entity.                                 |
| `maximumStalenessDays`    | `540`              | Content no older than 540 days at evaluation.                        |

All four members must pass. A passing candidate is indexable and
sitemap-eligible. A below-threshold candidate emits `noindex` and stays out of
the sitemap. This is a measured outcome, not a permanent per-kind rule.

Until OVE-335 lands, `apps/web/src/server/public-surface-indexing-policy.ts`
still implements the older per-surface thresholds. That code is transitional
runtime and must not be copied into a new contract. OVE-335 replaces it with the
constant above and extends the existing `PublicSurfaceIndexReason` vocabulary.

OVE-331 supplies the derived input quality carried by public-journal search
documents. `verified` means the safe projection is complete; `partial` means an
optional cover was omitted/unresolved or an unavailable coarse region was
conservatively represented as hidden. `unverified` stays below the threshold.
These classes cannot turn a positively private, erased, revoked, invalid, or
coordinate-bearing record into a public-surface candidate.

## Sitemap rule

`apps/web/src/app/sitemap.ts` includes only public candidates whose canonical
server decision returns `sitemapEligible = true`. Static and authored entries
use canonical localized paths. Each row carries a stable source/content
`lastModified`; build or request time is never fake freshness.

The sitemap excludes non-candidates and below-threshold candidates. It does not
maintain a second list of route kinds or repeat the threshold members.

## Metadata and structured-data rule

Every candidate route uses the same server decision for `robots` metadata,
canonical status, sitemap membership, and structured-data admission. JSON-LD
may contain only facts already visible on the page and may not bypass a failed
threshold member. Authored FAQ/answer data remains limited to visible questions
and answers.

The older blanket `noindex` statements for UGC, variety, topic, profile,
passport, lineage, and localized feed surfaces are superseded by ADR-0018. They
remain discoverable in historical receipts but are not current instructions.

## Robots.txt rule

`apps/web/src/app/robots.ts` points to the canonical
`https://over.garden/sitemap.xml` and permits normal retrieval so crawlers can
observe route metadata. The Robots Exclusion Protocol is a discovery mechanism,
not a privacy or authentication control.

## Privacy and language boundary

- Precise coordinates do not enter public HTML, metadata, URLs, sitemap rows,
  JSON-LD, logs, or public search documents.
- Owner ids, emails, invitation links, tokens, raw journal internals, media
  capabilities, and source-only catalog fields stay out of public surfaces.
- Positively private, erased, or public-gone records are not candidates.
- User-authored journal bodies stay in the author's language and are not silently
  translated for localized chrome or alternate-link clusters.
- Media follows ADR-0018's format-conversion-only target; OVE-333 and OVE-334
  own the runtime transition from the earlier quarantine pipeline.

## Non-goals

- This canon-only policy does not change runtime indexability in OVE-329.
- It does not make private product or account routes public candidates.
- It does not add monetization or invent content to clear a threshold.
- It does not treat metadata or the Robots Exclusion Protocol as access control.
