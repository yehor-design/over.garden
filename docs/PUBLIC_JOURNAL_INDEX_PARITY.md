# Public journal Meilisearch parity (OVE-196)

Status: active operator contract
Policy version: `ove196.publicIndexParity.v1`

## Command

```bash
cd apps/web
pnpm smoke:public-index-parity -- --environment local --confirm-environment local
pnpm smoke:public-index-parity -- --environment local --confirm-environment local --mode plan
pnpm smoke:public-index-parity -- --environment local --confirm-environment local --mode apply

pnpm smoke:public-index-parity -- --environment production --confirm-environment production --allow-gap
pnpm smoke:public-index-parity -- --environment production --confirm-environment production --mode plan
pnpm smoke:public-index-parity -- --environment production --confirm-environment production --mode apply --allow-non-local-mutation
pnpm smoke:public-index-parity -- --environment production --confirm-environment production
```

## Rules

- Postgres is source of truth. Never edit Postgres to match Meilisearch.
- Evidence is counts and booleans only. Never print document IDs, titles, bodies, slugs, or job payloads.
- Journal Meilisearch primary key is the journal entry UUID string. Non-UUID documents are `invalid_id`.
- Optional cover fields are `coverSource` plus public derivative `coverPublicUrl` only.
- OVE-186 must call `assertDrive2PublicSearchParityGate` against a zero-gap classify report.
