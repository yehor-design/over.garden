# OverGarden Web App

Next.js App Router + TypeScript app for OverGarden.

Current stack in this package:

- shadcn/ui for UI primitives.
- Better Auth mounted at `/api/auth/[...all]`.
- Kysely + `pg` for typed SQL access to Postgres.
- Cloudflare R2 presigned quarantine uploads through the S3 SDK.
- `sharp` for server/worker image derivatives.
- Dexie for browser offline-capture queue.
- Meilisearch client for derived public search.

## Local Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Checks:

```bash
pnpm lint
pnpm typecheck
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
```

Production-like builds fail closed unless `BETTER_AUTH_SECRET` is configured.
Local `pnpm dev` can use the local-only fallback after copying `.env.example`,
but preview/production deployments must set an explicit platform secret.

Database type generation after a DB is available:

```bash
pnpm db:types
```

The product UI has not started; `/health` is only an infrastructure tracer.

## Walking Skeleton

Run `pnpm local:bootstrap`, then visit `/skeleton`. The page exercises Better Auth, scoped Kysely repositories, Postgres, queueing, and SSR readback.
