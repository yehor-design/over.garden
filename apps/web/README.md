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

The canonical development command binds Next.js to `127.0.0.1`. Do not replace
it with an all-interface bind when the walking-skeleton diagnostic is enabled.

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

`/health` is an infrastructure tracer, not a product-readiness signal. The
canonical product and authentication entry is `/garden`.

## Walking Skeleton

The original walking skeleton remains available only as an opt-in local
diagnostic. Production, Vercel Preview, non-loopback request hosts, and the
default local environment receive a hard `404` for `/skeleton` and
`/api/skeleton/**` before authentication or database access.

To use it, run `pnpm local:bootstrap`, enable
`WALKING_SKELETON_ENABLED=true` together with the complete loopback-only visual
fixture environment in `.env.local`, and authenticate through the canonical
`/garden` flow. The diagnostic never creates or pre-fills a shared account.
Its proxy and API require both the framework URL host and the raw HTTP `Host`
header to be loopback; the canonical `pnpm dev` command also binds the listener
itself to `127.0.0.1`.
`/skeleton` provides scoped SSR readback; the gated
`/api/skeleton/journal` endpoint retains the local read/write integration proof.

The boundary is machine-checked in source and fresh production build output:

```bash
pnpm walking-skeleton:boundary:check
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
```
