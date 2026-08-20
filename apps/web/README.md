# OverGarden Web App

Next.js App Router + TypeScript app for OverGarden.

Current stack in this package:

- shadcn/ui for UI primitives.
- Better Auth mounted at `/api/auth/[...all]`.
- Kysely + `pg` for typed SQL access to Postgres.
- Cloudflare R2 through the S3 SDK. ADR-0018 targets format-conversion-only
  media; the current presigned quarantine path remains transitional runtime
  until OVE-333 and OVE-334 land.
- `sharp` for WebP format conversion.
- Network-required journal writes under ADR-0017. Existing Dexie/PWA runtime is
  a temporary, explicitly owned retirement surface and must accept no new
  durable browser journal writes after the child cutover.
- Meilisearch client for derived public search.

ADR-0018 is the current MVP posture: unresolved authorization/ownership/session
conditions serve with an accepted cross-account-read exposure, public candidates
use one measured quality threshold, and admin tools belong in the account product.
OVE-330 through OVE-339 own the runtime and final authority convergence; this
package description does not claim those child effects have already shipped.

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
pnpm build
```

Local builds and `pnpm dev` can use the isolated local-only fallback after
copying `.env.example`. Production and Preview serving require the platform
versioned pair `BETTER_AUTH_SECRETS` and
`BETTER_AUTH_CURRENT_SECRET_VERSION`; the first ordered entry is current.
Keep the legacy singular `BETTER_AUTH_SECRET` only during the bounded
migration grace period so existing encrypted state and verification links can
complete. Serving compatibility also requires a canonical 32-byte standard
Base64 or Base64url legacy key and the non-secret, strict UTC
`BETTER_AUTH_LEGACY_GRACE_UNTIL` deadline. An invalid or expired singular
value is clean-cut from auth reads while the declared current key remains the
explicit Better Auth fallback. Never put real values in this repository or
command history.

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
pnpm build
```
