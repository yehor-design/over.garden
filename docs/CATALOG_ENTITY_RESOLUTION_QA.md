# Catalog Entity-Resolution QA

Status: OVE-89 operator QA gate
Primary command: `cd apps/web && pnpm catalog:sources:entity-resolution-qa`
Report schema: `ove89.catalogEntityResolutionQa.v1`

OVE-89 is the safe review gate between source-family catalog imports and OVE-90 production proof. It does not import new source rows, call external APIs, or promote quarantined candidates. It reads the current database state and emits a redacted duplicate/conflict report so the operator can verify that full-catalog typeahead will not show multiple selectable suggestions for one real catalog concept.

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

The report groups clusters as `canonical_concept`, `likely_duplicate`, `alias_collision`, `source_disagreement`, `blocked_projection`, and `manual_review_required`. Each cluster includes a recommended operator route: merge review, hold, reject, review-needed, or no action.

## Safety Boundary

The QA read model may expose only catalog identity, public slug, source family, aggregate counts, projection/review status, and safe review labels. It must not expose raw source payloads, source-only fields, source record keys, checksums, journal text, owner data, media internals, precise location, or legal/source-only caveat bodies.

`/garden/catalog/curation` renders the same report for allowlisted operators beside the source-candidate review lane. The UI is a review surface, not an automatic merge tool: OVE-89 proves where human review is needed and that risky rows remain held or blocked.

## Downstream Rule

OVE-90 must attach the OVE-89 report before claiming production full-catalog availability. Any `likely_duplicate`, `alias_collision`, `source_disagreement`, or `manual_review_required` cluster must either be resolved through a later explicit merge/hold/reject path or called out as an accepted blocker in the OVE-90 evidence.
