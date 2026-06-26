# Runtime Scaffold — Status & Verification

Current status: the 2026-06-26 walking skeleton is implemented and locally verified. See `docs/WALKING_SKELETON.md` for commands and smoke paths.

## Proven Locally

- Next.js App Router + TypeScript builds successfully.
- shadcn/ui renders inside SSR pages.
- Better Auth route is mounted at `/api/auth/[...all]`; live sign-up returns a session cookie.
- Kysely + `pg` connect to local Docker Postgres.
- Better Auth tables are created through Better Auth's migration helper during `pnpm local:bootstrap`.
- SQL app schema creates `health`, `journal_entries`, `media_assets`, and `job_queue`.
- `kysely-codegen` generated `src/db/generated.ts` from 8 live tables.
- `/skeleton` and `/api/skeleton/journal` prove auth -> scoped repository -> Postgres -> queue -> SSR readback.
- R2/MinIO quarantine upload and public derivative processing work locally.
- `sharp` derivative tests prove WebP output without EXIF metadata.
- Dexie offline queue is test-covered with IndexedDB shim.
- Search document privacy test proves private journal entries are not indexed.
- Python worker consumes the Postgres-backed queue and marks jobs `done`.
- Meilisearch Cyrillic typo proof passes against local Docker Meilisearch.

## Verification Commands

```bash
cd infra && docker compose up -d
cd ../apps/web
pnpm local:bootstrap
pnpm db:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cd ../../services/matching
uv run python -m py_compile app/main.py app/search.py app/worker.py
MEILISEARCH_HOST='http://localhost:7700' MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' uv run python -m app.search
```

## Still Deferred

- Production DigitalOcean Managed Postgres provisioning and backups/PITR checks.
- Production Cloudflare R2 bucket creation, lifecycle rules, and CDN/domain binding.
- Production worker process manager/health checks on the DigitalOcean droplet.
- Real auth UX, email delivery, password reset, OAuth decisions.
- Full privacy invariant suite for cross-user access paths.
- iOS Safari offline capture spike on a real device.
- Product data model beyond the walking skeleton tables.

## Next Build Step

Start the first product SDD slice only after this skeleton stays green. The first real slice should be narrow and vertical: authenticated journal capture with one photo, offline queue fallback, sync, stripped derivative, and SSR readback.
