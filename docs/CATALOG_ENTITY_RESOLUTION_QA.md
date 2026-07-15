# Catalog Entity-Resolution QA

Status: OVE-89 exact/conflict gate extended by OVE-162 fuzzy advisory QA
Primary command: `cd apps/web && pnpm catalog:sources:entity-resolution-qa`
Report schema: `ove162.catalogEntityResolutionQa.v2`

OVE-89 is the safe review gate between source-family catalog imports and OVE-90 production proof. OVE-162 extends that same report with persisted RapidFuzz near-duplicate evidence computed by the Python worker. Neither lane imports source rows, calls external APIs, promotes candidates, publishes aliases, or merges catalog identities. The operator receives exact and fuzzy risks together before trusting full-catalog typeahead.

## Command

```bash
cd apps/web
pnpm catalog:sources:entity-resolution-qa
```

The command prints JSON that is safe to paste into Linear only when `leakCheck = "passed"`.

To refresh fuzzy evidence, a curator uses **Refresh fuzzy QA** on `/garden/catalog/curation`. The server enqueues the exact payload `{ "kind": "catalog_fuzzy_duplicate_qa_refresh" }`; its database constraint rejects every extra payload key. The worker reads only ownerless `seeded`/`confirmed` source-backed catalog identity fields, uses deterministic rare-trigram blocking plus RapidFuzz scoring, and atomically replaces only `catalog_fuzzy_duplicate_suggestions` advisory rows.

The local proof command refuses every non-loopback database, seeds one near-duplicate fixture, proves persisted/reportable evidence, then restores the prior derived result set:

```bash
cd apps/web
pnpm smoke:catalog-fuzzy-duplicate-qa
```

Use `pnpm smoke:catalog-fuzzy-duplicate-qa:seed-ui` to leave the fixture visible for browser QA and `pnpm smoke:catalog-fuzzy-duplicate-qa:reset-ui` afterward.

## Report Scope

The report reviews:

- source-backed canonical catalog rows from approved projection families;
- likely duplicates with the same normalized canonical identity and catalog kind;
- cross-source disagreements for the same normalized concept;
- accepted alias collisions where one normalized alias points at multiple source-backed concepts;
- manual-review and blocked source-candidate groups from safe `allowed_projection.reviewQueue` metadata.
- source-backed near-name pairs scored by RapidFuzz after bounded deterministic blocking.

The report groups clusters as `canonical_concept`, `likely_duplicate`, `fuzzy_duplicate`, `alias_collision`, `source_disagreement`, `blocked_projection`, and `manual_review_required`. Exact normalized duplicates remain `likely_duplicate`; fuzzy pairs never replace or hide them. Fuzzy evidence includes score, score bucket, reason codes, normalized labels, source family, catalog kind, catalog status, locale relation, current/stale status, and a recommended route. The report remains bounded to the top 240 fuzzy rows and 24 rendered fuzzy clusters, but it reports the full persisted pair count beside the reviewed count so a sample can never be mistaken for the complete review queue.

Same-locale fuzzy pairs at or above the review threshold route to `merge_review`. Cross-locale pairs use the stricter threshold and route only to `hold`; they cannot collapse Ukrainian and Bulgarian concepts. If either catalog row changed after scoring, the report marks evidence `stale` and routes it to `hold` until the next refresh. All fuzzy clusters remain advisory: no worker or report path updates `catalog_items`, `catalog_item_names`, journal history, public pages, or Meilisearch.

## Safety Boundary

The QA read model may expose only catalog identity, canonical/normalized labels, public slug, catalog kind/status/locale, source family, aggregate counts, bounded fuzzy score/reason enums, matcher version, evidence freshness, projection/review status, and safe review labels. It must not expose raw source payloads, source-only fields, source record keys, checksums, journal text, owner data, media internals, precise location, legal/source-only caveat bodies, email, IP, user agent, cookies, or tokens. The recursive leak gate rejects forbidden field keys before output.

`/garden/catalog/curation` renders the same report for admin roles with `operator:mutate` beside the source-candidate review lane. The UI is a review surface, not an automatic merge tool: OVE-89 proves where human review is needed and that risky rows remain held or blocked.

OVE-129 extends the review and typeahead surfaces with safe trust-state copy. Selectable typeahead suggestions may show only derived labels such as curated, source-backed, candidate, source family, type, locale, and a plain-language caveat from an allowlist. Quarantined, held/review-needed, blocked, rejected, and promoted source candidates must be described in those safe states; raw source payloads, source-only keys, source record identifiers, legal/source-only caveat bodies, private journal data, media internals, precise location, and owner data remain outside public/catalog evidence.

## Downstream Rule

OVE-90 and the later OVE-163 combined matching rollout must attach the current v2 report before claiming trusted availability. Any `likely_duplicate`, `fuzzy_duplicate`, `alias_collision`, `source_disagreement`, or `manual_review_required` cluster must either be resolved through a later explicit merge/hold/reject path or called out as an accepted blocker. OVE-162 does not itself perform a destructive resolution.
