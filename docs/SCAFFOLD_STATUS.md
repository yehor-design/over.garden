# Runtime Scaffold — Status & Verification

Current status: the 2026-06-26 walking skeleton is implemented and locally verified, and SDD Slice 1 / Issue 1 adds the first real product path: authenticated space -> plant object -> journal entry -> object readback. See `docs/WALKING_SKELETON.md` and `docs/SDD_VERTICAL_SLICE_ROADMAP.md` for verification commands and slice rules.

## Proven Locally

- Next.js App Router + TypeScript builds successfully.
- shadcn/ui renders inside SSR pages.
- Better Auth route is mounted at `/api/auth/[...all]`; live sign-up returns a session cookie.
- Kysely + `pg` connect to local Docker Postgres.
- Better Auth tables are created through Better Auth's migration helper during `pnpm local:bootstrap`.
- SQL app schema creates `health`, `spaces`, `plant_objects`, `journal_entries`, `media_assets`, and `job_queue`.
- `kysely-codegen` generated `src/db/generated.ts` from 10 live tables.
- `/skeleton` and `/api/skeleton/journal` prove auth -> scoped repository -> Postgres -> queue -> SSR readback.
- `/garden` and `/garden/objects/[objectId]` prove the first product path outside `/skeleton`: authenticated create/readback for one space, one plant object, and one title/body entry.
- Repository contract tests prove owner-scoped object readback and idempotent entry creation through `(owner_user_id, client_mutation_id)`.
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
- Production auth UX, email delivery, password reset, OAuth decisions.
- Full privacy invariant suite for every cross-user access path beyond the first product repository contracts.
- iOS Safari offline capture spike on a real device.
- Photo attachment, offline sync, public SSR publication, 410 deletion, and H1 event slices.

## Next Build Step

Continue `Execution Batch 1` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` after reviewing the first product slice implementation.

Every future Linear issue must be a vertical SDD slice, not a layer ticket. It must start from a user behavior and integrate the needed surfaces together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Do not create standalone tasks for "schema", "UI", "media", "analytics", "search", or "public pages" unless that work is inside the same issue as the user-visible path.

The next vertical issue is `OVE-12`: one-photo entry, quarantine upload, stripped derivative processing, and derivative-only readback inside the real `/garden` entry flow. Do not open a standalone media pipeline task.
