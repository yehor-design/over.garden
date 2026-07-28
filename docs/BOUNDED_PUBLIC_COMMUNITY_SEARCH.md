# Bounded Public Community Search

Status: active guardrail  
Owner: OVE-239

Public community search reuses the `journal_entries` Meilisearch index only for UUID hints. PostgreSQL remains authoritative and reapplies the complete community, contribution, membership-ban, journal-publication, profile, object, media, viewer-block, kind, and cursor boundary before rendering a card.

## Budgets

- Queries normalize whitespace, stop at 100 code units, and enter search mode at 2 characters. Empty and one-character values browse the community.
- Meilisearch returns at most 256 UUID hints inside 400 ms and uses the shared two-failure, 30-second circuit.
- Degraded search selects at most 256 newest eligible identifiers from the requested community without reading journal text, then applies `ILIKE` only inside that set under transaction-local `statement_timeout = 700ms`.
- The process bulkhead permits 4 active database phases and 16 FIFO waiters. Queue wait is 100 ms and the repository response fence is 1,200 ms.
- Dependency errors are reduced to bounded reason classes. Query text, hit content, identifiers, SQL, provider errors, request metadata, and precise location are forbidden in logs and receipts.

## User-visible degradation

The `uk`, `bg`, and `ru` community pages preserve the query and controls and announce one non-blocking `role=status` notice. There is no automatic retry. A visitor can explicitly resubmit or reset the filters.

## Verification

```bash
cd apps/web
pnpm exec vitest run src/server/search/public-community-search.test.ts
pnpm exec vitest run src/server/community-repository.test.ts src/components/public/public-community.test.tsx
tsx scripts/verify-public-community-search-plan.ts --environment local --confirm-environment local
tsx scripts/verify-public-community-search-load.ts --environment local --confirm-environment local
```

The scripts are loopback-only and read-only. Receipts contain aggregate counts, timing, plan-node classes, and reason classes only.

## Rollback

Revert the OVE-239 repository commit. Do not restore a corpus-wide leading-wildcard scan. If Meilisearch must be disabled, retain the bounded community fallback and localized degraded notice. This slice changes no schema and owns no index writer or reindex operation.
