# Catalog Match Suggestion Queue

Status: implemented by OVE-158 and OVE-159
Owner surface: `/garden/catalog/curation`
Worker job: `matching:catalog_match_suggestions_refresh`
Evidence schema: `ove158.catalogMatchEvidence.v2`

## Product Boundary

The product assumption is that gardeners should be able to save an unfamiliar
plant, animal, or bee identity immediately while operators receive enough
deterministic evidence to prevent duplicate catalog concepts later. Matching is
therefore asynchronous and advisory. A suggestion never changes a catalog row,
garden object, journal entry, public page, or Meilisearch document by itself.

This slice applies the Product Thinking Gate using:

- `docs/product-research/DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md` for provisional
  identity, nondestructive merge, and catalog-as-social-graph behavior;
- `docs/product-research/MATCHING-ENGINE_STACK_SPEC.md` for the PyICU,
  CyrTranslit, and RapidFuzz deterministic pipeline;
- `docs/product-research/B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md` for the
  non-blocking Unknown/user-added path;
- `docs/CATALOG_ENTITY_RESOLUTION_QA.md` for operator-safe evidence and the
  human-review boundary.

The trust risk is a false canonical match. OVE-158 limits that risk by exposing
score, method, reason codes, locale/script hints, and the current aggregate
affected-object count while preserving an explicit no-safe-match state. OVE-159
adds the explicit human decision boundary for canonical matches. OVE-160 owns
the separate synonym/locale-variant decision and must not broaden this merge
contract.

## Data Flow

1. The canonical `/garden` save transaction upserts a `provisional` /
   `user_added` catalog item and its primary name.
2. The same transaction enqueues only `{ kind, sourceCatalogItemId }` with the
   idempotency key `catalog-match-suggestions:<uuid>`.
3. The Python worker loads that one still-provisional source and only
   `seeded`/`confirmed`, ownerless names of the same catalog kind. The read is
   deterministically ordered and capped at 100,000 candidates; a larger set
   fails closed instead of timing out with partial evidence.
4. PyICU NFKC casefold normalizes text, CyrTranslit creates script-bridging
   keys, and RapidFuzz scores remaining near-name candidates.
5. The worker marks previous unresolved rows `stale` and upserts at most three
   current `pending` rows, or one explicit `no_safe_match` row.
6. The operator read model renders the evidence next to the existing manual
   confirm/merge/reject controls. A bounded per-candidate refresh action can
   recover historical rows or rerun matching after catalog growth.

The worker may lag or be offline without blocking the gardener save. Catalog
matching claims use a bounded 300-second lease by default, while the faster
existing jobs retain the standard 30-second lease. A refresh requested during
active processing sets `rerun_requested`; the current claim finishes with a
compare-and-set token and atomically returns the row to `pending`, so no rescan
is swallowed. Re-delivery is idempotent by
`(source_catalog_item_id, candidate_key, suggestion_kind)`.

## Human Decision Contract

OVE-159 lets a curator approve or reject one current deterministic
`canonical_match` suggestion from `/garden/catalog/curation`.

Approval runs in one Postgres transaction:

1. Lock the pending suggestion, its source and target catalog rows, and the
   exact `catalog_item_names` alias that supplied the scored target label.
2. Verify that the source is still an owner-scoped `provisional` /
   `user_added` row, the target is still an ownerless `seeded` or `confirmed`
   row of the same kind, and SHA-256 semantic fingerprints still match the
   current source identity and the exact target alias/canonical identity.
3. Collect affected public journal paths without selecting journal title or
   body.
4. Move only `user_added` plant objects from the provisional identity to the
   canonical target, set their catalog state to `selected`, and preserve every
   journal row exactly where it is.
5. Mark the source catalog row `merged`, record the reviewed suggestion as
   `approved`, mark its other pending suggestions `stale`, and enqueue the
   idempotent `catalog_typeahead_reindex` job.

The shared typeahead enqueuer revives a completed or failed idempotent reindex
row as `pending`, clears stale lock/error fields, and makes it immediately
available. If the worker is already processing that row, the enqueue preserves
its lock and sets `rerun_requested`; claim-token-scoped completion then returns
the row to `pending`. A canonical approval therefore cannot be acknowledged
without scheduling a post-mutation index rebuild.

If either semantic fingerprint or the bound alias changes, the selected
suggestion becomes `stale` and the transaction makes no catalog, object,
journal, or reindex mutation. Timestamp-only importer touches do not invalidate
otherwise identical evidence. User-added candidate creation locks the same
source row, so an object created concurrently is either included in the merge
or rejected after the committed merge; it cannot remain attached to a merged
provisional row. There is no partial approval state.

Rejection updates only the selected suggestion. It records one bounded reason
(`not_same_entity`, `wrong_catalog_kind`, `locale_or_script_mismatch`,
`insufficient_evidence`, or `other_review_reason`), reviewer, review time,
result, and zero decision-affected objects. The provisional identity, plant
objects, journals, public routes, and typeahead job remain unchanged. Rejected
evidence stays visible as operator history while that provisional candidate is
still pending.

The worker does not reopen a rejected source/target pair when deterministic
matching inputs are unchanged. A changed aggregate object count or an
`updated_at`-only import touch also does not discard the operator decision. A
material source/target fingerprint change, exact alias change, target canonical
identity, score, method, locale/script, reason set, or matcher version may
reopen the row as `pending`; reopening clears the previous decision fields so
the new evidence requires a fresh review.

## Provisional Thresholds

OVE-158 uses conservative, code-owned pilot thresholds:

- `high`: 95-100;
- `medium`: 85-94;
- `low`: 70-84, visibly held for review;
- below 70: no safe target is exposed.

These are engineering guardrails, not validated matching quality claims. They
must be calibrated against operator-labeled UA/BG examples before any later
slice allows automation. Exact normalized matches score 100; exact CyrTranslit
keys score 98; other scores come from deterministic RapidFuzz comparison.

## Privacy Contract

`catalog_match_suggestions` may store only source/target catalog IDs, score and
lifecycle enums, normalized/matched catalog names, catalog kind, locale/script
hints, aggregate affected-object count, matcher version, timestamps, nullable
source/target `updated_at` snapshots, the exact target alias ID, opaque
source/target semantic fingerprints, bounded decision reason/result/affected
count, nullable reviewer ID metadata for an explicit decision, and the
closed-key `safe_evidence` JSON object. Schema v2 deliberately excludes the raw source
display name: it keeps only the normalized matching input and safe target
catalog labels. SQL requires every v2 key, rejects extra keys, verifies every
duplicated evidence value against its relational source column, and pins the
threshold object. It also requires review metadata to be absent for
`pending`/`stale` rows and complete for later `approved`/`rejected` rows.

The queue payload has exactly `kind` and a valid UUID `sourceCatalogItemId`;
Postgres rejects missing, nested, mistyped, or additional keys. The queue
payload, safe evidence, repository read model, and UI must not contain
user IDs, emails, journal title/body, media/storage data, IP/user-agent,
referrer/query data, precise location, external raw payloads, source-only
fields, source record IDs, or checksums. The table's nullable reviewer ID is an
internal audit field and is never projected into those surfaces. Provisional
names remain excluded from global typeahead and public/search projections.

## Verification

```bash
cd services/matching
uv run --frozen pytest
uv run --frozen ruff check app tests
uv run --env-file ../../apps/web/.env.local \
  python -m scripts.smoke_catalog_match_rejection_replay

cd ../../apps/web
pnpm local:bootstrap
pnpm db:types:check
pnpm test -- catalog-repository catalog-curation job-queue-contract
pnpm test -- privacy-invariant-sweep
pnpm smoke:catalog-match-approval
pnpm lint
pnpm typecheck
```

The TypeScript approval smoke refuses non-loopback Postgres before any write,
creates a disposable local database, applies the full SQL schema there, and
drops that database after the proof. The worker replay smoke also refuses
non-loopback Postgres. UI fixture modes are separately guarded and operate only
on the explicitly configured local database.
