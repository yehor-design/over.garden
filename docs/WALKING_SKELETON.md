# Walking Skeleton

Status: implemented and locally verified on 2026-06-26. The original walking-skeleton proof used Docker Compose; OVE-73 re-proved the supported-Mac fresh-checkout web bootstrap on 2026-06-30 against Apple Container Postgres, Meilisearch, and MinIO with Docker Desktop stopped. OVE-77 closes the local cleanup proof: supported Apple Silicon/macOS 26 development no longer requires Docker Desktop for local infra, bootstrap, type checks, tests, or matching pytest. OVE-95 aligns local and CI Postgres with the production major version, currently Postgres 18. CI repeats the fresh-checkout bootstrap contract by starting Postgres 18 plus MinIO, running `pnpm local:bootstrap`, and failing if generated Kysely types drift from the committed `src/db/generated.ts`. OVE-75 documents that CI keeps Docker only because GitHub-hosted Ubuntu does not run Apple Container service containers; that CI exception does not restore Docker Desktop as a local requirement.

This is not product UI. It is the first end-to-end proof that the selected stack works together before agents start building product slices.

## What It Proves

1. **Stack baseline is committed separately.** `86d902b8 Realign stack to Kysely / Better Auth & R2` is the stack realignment baseline.
2. **Local infra works.** The original walking-skeleton proof used Docker Compose to start Postgres, Meilisearch, and MinIO. Current runtime policy is Apple Container-first for supported local Macs: `infra/container-up` starts the same service trio on the same local ports, with Postgres 18 matching the production major version and Docker Compose retained as fallback for unsupported hosts or verified feature gaps. OVE-73 proves the normal web bootstrap and test path does not require Docker Desktop on a supported Mac. `pnpm local:bootstrap` applies app SQL, creates Better Auth tables through Better Auth's migration helper, creates R2/MinIO buckets, and applies local public-read policy to the derivative bucket.
3. **Better Auth round-trip works.** `/api/auth/sign-up/email` creates a user and returns `overgarden.session_token`.
4. **Vertical journal slice works.** `/skeleton` and `/api/skeleton/journal` go through auth -> scoped repository -> Kysely -> Postgres -> queue -> SSR readback.
5. **Media quarantine pipeline works.** `/api/media/uploads` creates a presigned quarantine upload URL; `/api/media/process` reads the quarantine object, re-encodes a metadata-stripped WebP derivative with `sharp`, writes it to the public bucket, deletes the original, and marks the row processed.
6. **Offline queue is test-covered.** Dexie stores queued mutations with idempotency keys under IndexedDB shim.
7. **Search/worker seam works.** Public journal entries enqueue `matching` jobs; the Python worker consumes the Postgres queue with `FOR UPDATE SKIP LOCKED`; Meilisearch Cyrillic typo proof passes.

## Commands

These commands use the current Apple Container-first local runtime and were fresh-checkout verified by OVE-73. Docker Compose remains documented in `infra/README.md` only as fallback.

```bash
infra/container-up
infra/container-status

cd apps/web
pnpm install
cp .env.example .env.local
pnpm mainline:closeout:check
pnpm local:bootstrap
pnpm db:types
pnpm db:types:check
pnpm lint
pnpm typecheck
pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
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
