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
pnpm build
```

Database type generation after a DB is available:

```bash
pnpm db:types
```

The product UI has not started; `/health` is only an infrastructure tracer.
