# Public SEO/AEO Surface Policy

Status: current canon and runtime
Date: 2026-08-24
Owner: founder/operator
Linear: OVE-115, OVE-116, OVE-117, OVE-130, OVE-329, OVE-335
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
OVE-335 owns the threshold runtime and absorbed the canonical, structured-data,
locale-equivalence, and coverage scope of canceled OVE-336. OVE-337 separately
owns user-visible Core Web Vitals budgets and CI enforcement.

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

`apps/web/src/server/public-surface-indexing-policy.ts` is the implemented pure
owner. `apps/web/src/server/public-surface-discovery.ts` is the complete
consumer inventory and safe read-model adapter. A missing or invalid measured
input resolves `candidate_input_unresolved`; a known `unverified` projection
resolves `quality_class_below_threshold`. No route kind, catalog status, topic
trust label, entry count, or body-length proxy can replace any threshold member.

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

The authored, variety, and topic enumerators provide full safe source facts to
the same adapter. Candidate SQL only bounds the public lifecycle set; SQL
`HAVING` clauses and source allowlists do not perform index admission. Dynamic
public routes that are not enumerable remain governed by their route metadata
decision and can be added to the sitemap only when a stable bounded enumerator
exists.

## Metadata and structured-data rule

Every candidate route uses the same server decision for `robots` metadata,
canonical status, sitemap membership, and structured-data admission. JSON-LD
may contain only facts already visible on the page and may not bypass a failed
threshold member. Authored FAQ/answer data remains limited to visible questions
and answers.

The older blanket `noindex` statements for UGC, variety, topic, profile,
passport, lineage, and localized feed surfaces are superseded by ADR-0018. They
remain discoverable in historical receipts but are not current instructions.

The shared builder emits no canonical or JSON-LD for a refused decision. An
admitted decision emits exactly one canonical and one visible-fact graph. The
implemented mapping is:

| Visible surface                                    | Schema fact node           |
| -------------------------------------------------- | -------------------------- |
| Authored blog/guide                                | `Article` or `BlogPosting` |
| Authored answer with visible questions and answers | `FAQPage`                  |
| Journal entry                                      | `BlogPosting`              |
| Feed, directory, topic, community, variety         | `CollectionPage`           |
| Profile                                            | `ProfilePage`              |
| Passport or lineage object                         | `ItemPage`                 |

Every graph also has one `WebPage` envelope. A fact absent from visible HTML is
not added to schema. Visual fixtures, privacy/disclosure controls, missing
records, and unresolved lifecycle reads emit no graph.

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
- A route supplies an explicit equivalent-source locale set. More than one real
  equivalent source produces `hreflang`; one source produces only its canonical;
  an empty set produces no language claims. Topic and user-generated aggregation
  routes canonicalize to their source URL rather than presenting localized
  chrome as translated evidence.
- Media follows ADR-0018's format-conversion-only target; OVE-333 and OVE-334
  own the runtime transition from the earlier quarantine pipeline.

## Non-goals

- It does not make private product or account routes public candidates.
- It does not add monetization or invent content to clear a threshold.
- It does not treat metadata or the Robots Exclusion Protocol as access control.
- It does not promise that every current public URL clears the threshold. Thin,
  stale, or unresolved pages remain readable when already authorized but stay
  outside discovery.

## Runtime inventory and bounded verification

`PUBLIC_SURFACE_DISCOVERY_INVENTORY` registers every route, repository, and
sitemap consumer exactly once with its owning source path. Production source
may call `evaluatePublicSurfaceIndexability` only through the discovery adapter;
the OVE-335 verifier fails on a direct caller, missing inventory owner, duplicate
consumer, or legacy aggregation threshold.

Metadata-source admission is bounded by
`PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS = 150`. Timeout, cancellation, source
failure, and late completion all remain `noindex`; a later independent safe read
can recover without a write, queue claim, search mutation, provider mutation, or
canonical commit.

Local deterministic and fault proof:

```bash
cd apps/web
pnpm exec vitest run scripts/verify-public-surface-discovery.test.ts
pnpm exec tsx scripts/verify-public-surface-discovery.ts --prove-determinism --inject-source-timeout
```

Exact-deployment read-only aggregate proof:

```bash
cd apps/web
pnpm exec tsx scripts/verify-public-surface-discovery.ts --emit-aggregate-receipt --base-url https://over.garden
```

The aggregate retains only surface/candidate/reason/output/locale-equivalence,
timing, cancellation, count, and build-SHA classes. It never emits titles,
bodies, entity or owner identifiers, capabilities, media keys, raw locations,
coordinates, credentials, cookies, IPs, or user agents.
