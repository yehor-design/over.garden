# Catalog Entity-Resolution QA

Status: OVE-89 exact/conflict gate. Its RapidFuzz half was retired with the
old matcher's tables by OVE-399 on 2026-09-07; the curation queue decides those
pairs now.
Primary command: `cd apps/web && pnpm catalog:sources:entity-resolution-qa`
Report schema: `ove399.catalogEntityResolutionQa.v3`

OVE-89 is the safe review gate between source-family catalog imports and OVE-90 production proof. It imports no source rows, calls no external API, promotes no candidate, publishes no alias and merges no catalog identity: the operator sees where human review is needed before trusting full-catalogue typeahead.

**What v3 removed.** OVE-162 added persisted RapidFuzz near-duplicate pairs, held in `catalog_fuzzy_duplicate_suggestions`. Migration `0061` drops that table with the rest of the old matcher, so the `fuzzy_duplicate` cluster kind, the two fuzzy counters, the `Refresh fuzzy QA` control and the `catalog_fuzzy_duplicate_qa_refresh` job kind are all gone. Near-duplicate review happens in the owner's curation queue (`/garden/catalog/queue`, ADR-0026 D5), where a decision carries its own inverse.

## Command

```bash
cd apps/web
pnpm catalog:sources:entity-resolution-qa
```

The command prints JSON that is safe to paste into Linear only when `leakCheck = "passed"`.

## Report Scope

The report reviews:

- source-backed canonical catalog rows from approved projection families;
- likely duplicates with the same normalized canonical identity and catalog kind;
- cross-source disagreements for the same normalized concept;
- accepted alias collisions where one normalized alias points at multiple source-backed concepts;
- manual-review and blocked source-candidate groups from safe `allowed_projection.reviewQueue` metadata.

The report groups clusters as `canonical_concept`, `likely_duplicate`, `alias_collision`, `source_disagreement`, `blocked_projection`, and `manual_review_required`. Every cluster is advisory: no report path updates `catalog_items`, `catalog_item_names`, journal history or public pages.

## Safety Boundary

The QA read model may expose only catalog identity, canonical/normalized labels, public slug, the derived catalog kind and locale, source family, aggregate counts, projection/review status, and safe review labels. It must not expose raw source payloads, source-only fields, source record keys, checksums, journal text, owner data, media internals, precise location, legal/source-only caveat bodies, email, IP, user agent, cookies, or tokens. The recursive leak gate rejects forbidden field keys before output.

The report is a command, not a page: `/garden/catalog/curation` was replaced by the owner's two links, `/garden/catalog/queue` and `/garden/catalog/sources` (ADR-0026 D5). It is a review surface, not an automatic merge tool: OVE-89 proves where human review is needed and that risky rows remain held or blocked.

OVE-129 extends the review and typeahead surfaces with safe trust-state copy. Selectable typeahead suggestions may show only derived labels such as curated, source-backed, candidate, source family, type, locale, and a plain-language caveat from an allowlist. Quarantined, held/review-needed, blocked, rejected, and promoted source candidates must be described in those safe states; raw source payloads, source-only keys, source record identifiers, legal/source-only caveat bodies, private journal data, media internals, precise location, and owner data remain outside public/catalog evidence.

## Downstream Rule

OVE-90 must attach the current v3 report before claiming trusted availability. Any `likely_duplicate`, `alias_collision`, `source_disagreement` or `manual_review_required` cluster must either be resolved through the owner's curation queue or called out as an accepted blocker. The report itself performs no destructive resolution.
