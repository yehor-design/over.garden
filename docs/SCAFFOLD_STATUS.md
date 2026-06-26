# Runtime Scaffold — Status & Verification

The scaffold now reflects the 2026-06-26 stack realignment in ADR-0014.

## Landed in Code

- Next.js App Router + TypeScript remains the app/runtime base.
- shadcn/ui remains the UI base.
- Supabase clients and Drizzle scaffold were removed.
- Better Auth is installed and mounted at `/api/auth/[...all]`.
- Kysely + `pg` are installed and wired as the server-side database access layer.
- SQL migrations are represented as plain SQL; generated DB types are produced by `kysely-codegen` once a database is available.
- R2 presigned quarantine uploads are wired through the S3-compatible AWS SDK.
- `sharp` derivative generation is present for worker-side resize/re-encode/metadata stripping.
- Dexie offline queue is present for browser-side capture buffering.
- Meilisearch JS client seam remains present.
- Plain Postgres `job_queue` producer exists in TypeScript; Python worker consumes the same table with `FOR UPDATE SKIP LOCKED`.
- Local `docker-compose` now includes Postgres, Meilisearch, and MinIO.

## Still Deferred

- Real Better Auth DB migration/table generation and sign-in UI.
- Live DigitalOcean Managed Postgres connection.
- R2 bucket creation, lifecycle rules, and worker that moves quarantine originals to public derivatives.
- Privacy tests for scoped repositories, media derivatives, and search indexing.
- iOS offline capture spike.
- Meilisearch reindex worker and public-only index tests.
- Vercel/Cloudflare/DO production wiring.

## Verification Commands

Run from `apps/web`:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Run from `infra` when Docker is available:

```bash
docker compose up -d
```

Run from `services/matching` when Python deps are installed:

```bash
uv sync --frozen
uv run uvicorn app.main:app --reload
uv run python -m app.worker
```

## Notes

This scaffold is still infrastructure proof, not product UI. The next correct build step is a walking skeleton that sends one trivial authenticated action through: UI -> server action/route -> scoped repository -> Postgres -> optional queue -> SSR health/readback. After that, work should be sliced vertically by product behavior, not by layers.
