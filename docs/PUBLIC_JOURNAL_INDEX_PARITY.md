# Public journal Meilisearch parity (OVE-227)

Status: active operator contract
Policy version: `ove242.publicIndexParity.v3` (supersedes
`ove227.publicIndexParity.v2`, which superseded `ove196.publicIndexParity.v1`)

## What changed in v3 (OVE-242)

`v2` compared the index against Postgres exactly, but it could still report
`zeroGap` while a committed revocation had never reached Meilisearch, because
nothing durable recorded that the revocation was owed. `v3` also reads the
transactional public-projection outbox: `zeroGap` additionally requires
`projection_overdue = 0` and `projection_dead = 0`. The outbox contract itself
is owned by `docs/PUBLIC_PROJECTION_REVOCATION.md`.

## What changed in v2

`v1` could report `zeroGap` while the index was stale. It compared only ids,
key sets, and a few projection classes, and — worse — it substituted expected
values for observed ones before hashing, so a stale title, body, slug, path,
publish date, or cover derivative URL compared equal. It also counted overdue
and dead-lettered indexing jobs as ordinary `pending` work.

`v2` fixes exactly that:

- **Exact full-value comparison.** Every allowed field is canonicalized and
  hashed (SHA-256). Any value change to any public field is `stale`.
- **No expected-value substitution.** An observed document is validated on its
  own schema, value domains, URL origin, and lifecycle before any comparison.
- **Fail-closed queue gate.** `zeroGap` additionally requires `overdue = 0` and
  `terminal_failure = 0`.
- **Safe drift naming.** Reports carry field-name and reason classes plus
  digests, never values.

Canonical owners:

- Document contract, validation, canonicalization, hashing:
  `apps/web/src/server/search/public-journal-document-contract.ts`
- Expected corpus from Postgres:
  `apps/web/src/server/search/public-journal-eligibility.ts`
- Classify/plan/apply and the queue gate:
  `apps/web/src/server/search/public-journal-parity.ts`
- Slug rule shared with the write path:
  `apps/web/src/lib/garden/public-journal-slug.ts`

## Commands

```bash
cd apps/web
pnpm smoke:public-index-parity -- --environment local --confirm-environment local
pnpm smoke:public-index-parity -- --environment local --confirm-environment local --mode plan
pnpm smoke:public-index-parity -- --environment local --confirm-environment local --mode apply
```

Adversarial integration proof (local only; injects each defect class into the
real local index, then repairs back and proves idempotency):

```bash
cd apps/web
pnpm smoke:public-index-parity-adversarial -- --environment local --confirm-environment local
```

Production (read-only classify first; apply only after reviewing the plan):

```bash
cd apps/web
pnpm smoke:public-index-parity -- --environment production --confirm-environment production --allow-gap
pnpm smoke:public-index-parity -- --environment production --confirm-environment production --mode plan
pnpm smoke:public-index-parity -- --environment production --confirm-environment production --mode apply --allow-non-local-mutation
pnpm smoke:public-index-parity -- --environment production --confirm-environment production
```

## Parity classes

| Class              | Meaning                                                    | Blocks `zeroGap` |
| ------------------ | ---------------------------------------------------------- | ---------------- |
| `missing`          | Eligible in Postgres, absent from Meilisearch              | yes              |
| `extraneous`       | Present in Meilisearch, not eligible in Postgres           | yes              |
| `stale`            | Present but any public field value differs                 | yes              |
| `unsafe_schema`    | Failed schema/value/URL/lifecycle validation               | yes              |
| `duplicate`        | Same id seen more than once                                | yes              |
| `invalid_id`       | Primary key is not a journal UUID                          | yes              |
| `overdue`          | Index/unindex job runnable for > 300 s                     | yes              |
| `terminal_failure` | Index/unindex job dead-lettered                            | yes              |
| `pending`          | Index/unindex job in flight and not yet overdue            | no               |

## Validation the gate applies to each observed document

- Exact allowed key set; any unknown key, and any key on the forbidden list, is
  `unsafe_schema`.
- `id` is a journal UUID; `kind` is `journal_entry`.
- `title` and `body` are non-empty and contain no precise-location text
  (OVE-234 fail-closed, even when the current Postgres row is clean).
- `publicSlug` matches the canonical slug rule; `publicPath` equals
  `/journal/<slug>` built from that same slug.
- `locationVisibility` is `region` or `hidden`; `coarseRegionCode` is a valid
  code present **exactly when** the visibility is `region`.
- `entryDate` and `createdAt` are canonical millisecond-UTC ISO timestamps.
- `coverPublicUrl` exists exactly when `coverSource` is not `none`, is absolute,
  carries no query/fragment/credentials, is not a quarantine key, and sits under
  the configured `R2_PUBLIC_BASE_URL` origin and path prefix.

## Rules

- Postgres is source of truth. Never edit Postgres to match Meilisearch.
- Evidence is counts, class names, booleans, and SHA-256 digests only. Never
  print document ids, titles, bodies, slugs, cover URLs, or job payloads.
- Repair is idempotent: reindex upserts by primary key and deletion is by id, so
  a retried batch converges instead of double-applying. Reindex runs before
  deletion so an eligible-but-unsafe document is rewritten, never dropped.
- Repair batches are bounded (default 100, max 500) with at most 3 attempts and
  exponential backoff.
- OVE-186 must call `assertDrive2PublicSearchParityGate` against a zero-gap
  classify report; that gate now also fails on `overdue` and `terminal_failure`.
