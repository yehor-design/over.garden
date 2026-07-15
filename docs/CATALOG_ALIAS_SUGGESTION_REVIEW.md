# Catalog Alias Suggestion Review

Status: implemented by OVE-160
Owner surface: `/garden/catalog/curation`
Worker job: `matching:catalog_alias_suggestions_refresh`
Generator version: `ove160-v1`

## Product Boundary

Gardeners should find one canonical plant, animal, or bee identity using the
spelling and script they naturally know. Generated aliases can improve that
discovery, but an ambiguous or incorrect synonym can silently merge distinct
concepts in search. OVE-160 therefore makes generation deterministic and
asynchronous while keeping publication human-gated.

The Product Thinking Gate uses:

- `docs/product-research/DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md` for one canonical
  identity with multiple reviewed names;
- `docs/product-research/MATCHING-ENGINE_STACK_SPEC.md` for the bounded
  CyrTranslit and locale-aware matching stack;
- `docs/product-research/B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md` for a
  curator flow that does not block garden capture;
- `docs/CATALOG_ENTITY_RESOLUTION_QA.md` for collision review and operator-safe
  evidence.

Generated evidence is not a product alias. Only an explicit approval may add a
row to `catalog_item_names`; only that product table feeds the canonical
Postgres typeahead and the derived Meilisearch rebuild.

## Generation Contract

1. A curator searches an ownerless `seeded` or `confirmed` catalog identity and
   queues exactly `{ kind, catalogItemId }` with an idempotency key scoped to
   that identity.
2. The Python worker loads only primary names or non-generated aliases that
   were already accepted. Generated output is never recursively used as source
   evidence.
3. The worker applies bounded locale rules for Ukrainian, Bulgarian, and
   Russian names: CyrTranslit forward variants, high-roundtrip-confidence
   reverse variants, and the explicit Ukrainian `ґ/г` and Russian `ё/е`
   folds. Unsupported locales and mixed-script source names produce no guess.
4. A normalized name already owned by another selectable concept becomes
   `review_needed` with `normalized_collision`; it is never auto-selected or
   product-visible.
5. Every row records the exact source-name ID, a semantic SHA-256 fingerprint,
   generator version, closed reason codes, confidence, and generated time.
   Existing unresolved rows become `stale` before an idempotent upsert.
6. An unchanged accepted or rejected row remains durable on replay. Materially
   changed evidence may reopen a rejected row and clears its old decision.

Alias generation uses the same bounded 300-second worker lease as catalog
matching. A queued rerun during active processing is preserved by the shared
claim-token and `rerun_requested` contract.

## Review Contract

`/garden/catalog/curation` shows generated, collision, rejected, and accepted
states together with the safe source label, candidate label, locale, script,
confidence, and closed reason codes. Generate, approve, and reject controls
show pending and result/error feedback. The page remains sealed-owner/operator
only.

Approval runs in a serializable Postgres transaction:

1. Lock the review row and its exact source name.
2. Recompute the semantic fingerprint and verify the catalog identity remains
   global and selectable under generator `ove160-v1`.
3. Recheck normalized-name ownership. Any cross-concept collision returns
   `collision`, records `review_needed`, and creates neither product alias nor
   reindex job.
4. Insert one non-primary `catalog_item_names` row, or bind the existing
   same-item alias after a concurrent idempotent insert.
5. Record reviewer, time, `approved_generated_alias`, and the closed result,
   then enqueue the shared idempotent `catalog_typeahead_reindex` in the same
   transaction.

Rejection records one closed reason and audit metadata on the projection only.
It does not add a catalog name or enqueue typeahead work. Stale source evidence
fails closed and must be regenerated before another decision.

## Privacy And Search Boundary

The job payload, read model, UI, tests, and smoke evidence contain global
catalog IDs and bounded catalog-name evidence only. They must not read, store,
render, log, or index user IDs from garden ownership, journal text, media or
storage fields, email/contact data, IP/user-agent/referrer values, raw source
payloads or keys, or precise location. The internal reviewer UUID is audit-only
and is not projected into the operator read model or typeahead document.

Only accepted `catalog_item_names` rows are searchable. `generated`,
`review_needed`, `rejected`, and `stale` projections remain outside Postgres
typeahead and Meilisearch documents.

## Verification

```bash
cd services/matching
uv run --frozen pytest tests/test_catalog_aliases.py tests/test_worker.py \
  tests/test_worker_recovery.py
uv run --frozen ruff check app tests scripts/run_catalog_alias_generation.py

cd ../../apps/web
pnpm local:bootstrap
pnpm db:types:check
pnpm test -- catalog-alias job-queue-contract privacy-invariant-sweep
pnpm smoke:catalog-alias-approval
pnpm lint
pnpm typecheck
```

The default smoke creates and drops a disposable loopback Postgres database,
executes the real Python worker payload, and proves generated, collision,
rejected, approved, replay, reindex, and Postgres typeahead behavior. It refuses
non-loopback databases before any write.

For manual UI evidence on the configured local database, first sign in and
bootstrap that local account as the sealed owner, then run:

```bash
pnpm smoke:catalog-alias-approval:seed-ui
# open /garden/catalog/curation?aliasQuery=OVE160
pnpm smoke:catalog-alias-approval:reset-ui
```

The fixture mode leaves realistic generated, collision, rejected, and accepted
rows for browser review and removes only fixed OVE-160 fixture identities on
reset. It is local-only and never substitutes for OVE-163 non-local rollout
proof.
