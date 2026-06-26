# Walking Skeleton

Status: implemented and locally verified on 2026-06-26.

This is not product UI. It is the first end-to-end proof that the selected stack works together before agents start building product slices.

## What It Proves

1. **Stack baseline is committed separately.** `86d902b8 Realign stack to Kysely / Better Auth & R2` is the stack realignment baseline.
2. **Local infra works.** Docker Compose starts Postgres, Meilisearch, and MinIO. `pnpm local:bootstrap` applies app SQL, creates Better Auth tables through Better Auth's migration helper, creates R2/MinIO buckets, and applies local public-read policy to the derivative bucket.
3. **Better Auth round-trip works.** `/api/auth/sign-up/email` creates a user and returns `overgarden.session_token`.
4. **Vertical journal slice works.** `/skeleton` and `/api/skeleton/journal` go through auth -> scoped repository -> Kysely -> Postgres -> queue -> SSR readback.
5. **Media quarantine pipeline works.** `/api/media/uploads` creates a presigned quarantine upload URL; `/api/media/process` reads the quarantine object, re-encodes a metadata-stripped WebP derivative with `sharp`, writes it to the public bucket, deletes the original, and marks the row processed.
6. **Offline queue is test-covered.** Dexie stores queued mutations with idempotency keys under IndexedDB shim.
7. **Search/worker seam works.** Public journal entries enqueue `matching` jobs; the Python worker consumes the Postgres queue with `FOR UPDATE SKIP LOCKED`; Meilisearch Cyrillic typo proof passes.

## Commands

```bash
cd infra
cp .env.example .env
docker compose up -d

cd ../apps/web
cp .env.example .env.local
pnpm install
pnpm local:bootstrap
pnpm db:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Python worker and Meili proof:

```bash
cd services/matching
uv sync --frozen
DIRECT_URL='postgresql://overgarden:overgarden@localhost:5432/overgarden' \
  QUEUE_NAME='matching' \
  uv run python -m app.worker

MEILISEARCH_HOST='http://localhost:7700' \
  MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' \
  uv run python -m app.search
```

## Smoke Paths

- `GET /skeleton` renders the SSR walking skeleton page.
- `POST /api/auth/sign-up/email` creates the local skeleton user.
- `POST /api/skeleton/journal` creates a journal entry and enqueues a public index job.
- `GET /api/skeleton/journal` reads scoped entries for the current user.
- `POST /api/media/uploads` returns a presigned quarantine upload URL.
- `POST /api/media/process` converts the quarantine original to a public stripped derivative and deletes the original.

## Guardrail Tests

- `src/server/media/derivatives.test.ts` proves derivatives are WebP and do not retain EXIF.
- `src/lib/offline/queue.test.ts` proves offline mutations are stored with idempotency keys.
- `src/server/search/documents.test.ts` proves private entries are not turned into Meilisearch documents.

## Next SDD Rule

From here, product work must be vertical. `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is the living execution roadmap, not a full backlog.

A valid Linear task must name the end-to-end user behavior and touch the necessary layers together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Do not build all database schema, all UI, all media, all analytics, all public pages, or all worker logic as isolated horizontal phases.

Before creating or accepting a Linear issue, run the `SDD Slice Test` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`. If the task only proves one layer in isolation, rewrite it before implementation.
