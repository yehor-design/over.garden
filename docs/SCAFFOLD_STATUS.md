# Runtime scaffold — status & verification

What the `chore/runtime-scaffold` work landed, what is **proven** locally, what
is **deferred** until the managed platforms (Supabase / Vercel / Railway) are
wired, and the decisions taken where the original setup brief diverged from the
binding decision records.

> The infrastructure tracer (the `health` model + `/health` page + the service
> version endpoint) is **not product**. It exists to prove the seams and is
> deleted when `DESIGN.md` is filled in. No product UI was built; `DESIGN.md`
> remains a stub; the only data model is `health`.

## Reconciliation — brief vs. binding records

The setup brief was written against a **pre-2026-06-23** snapshot of the stack.
The repository's binding records (`AGENTS.md`, `docs/TECH_STACK_DECISIONS.md`,
ADR-0009/0011/0012/0013, finalized 2026-06-23) supersede it. Where they
conflicted, the binding records won (per `AGENTS.md`: do not silently violate;
changing a decision needs a superseding ADR). Decisions taken:

| Topic | Brief said | Built (binding record) | Why |
|---|---|---|---|
| ORM | Prisma 7 + `@prisma/adapter-pg` | **Drizzle** + `postgres-js` | ADR-0011 reversed Prisma→Drizzle on RLS-ergonomics grounds; `AGENTS.md` forbids reintroducing Prisma. |
| Access model | RLS as primary gate | **Variant D** — server-tier-primary authz, RLS a narrow floor, single-door data access | ADR-0012. RLS-primary was explicitly rejected. |
| Queue | "Procrastinate or pgmq" | **pgmq** only | §2.9 forbids Procrastinate (Python-only); TS enqueues / Python consumes needs a SQL contract. |
| Edge/HSTS | HSTS at Vercel | HSTS set explicitly at the app, **Cloudflare**-aware | ADR-0009: Cloudflare owns edge/DNS/HSTS; app sets it as defense-in-depth. |
| PWA SW | (empty SW) | static no-op `public/sw.js` (dropped Serwist) | Serwist exists for precaching/offline and forces a webpack build; an empty carcass is more faithful as a no-op SW and keeps Next 16's default Turbopack. |

If a re-reversal to Prisma is actually intended, it needs an **ADR-0014
superseding ADR-0011** + maintainer sign-off — not a silent change.

## Repository layout

```
apps/web/              Next.js 16 (App Router) + TS — the app + app backend → Vercel
  src/app/             routes incl. /health (SSR tracer), manifest.ts, sw-register
  src/components/ui/   shadcn/ui primitives (Button) — exempt from token lint gate
  src/db/              Drizzle schema (health) + postgres-js client
  src/server/          Variant D single-door data-access layer + pgmq producer
  src/lib/supabase/    @supabase/ssr server + browser clients
  src/proxy.ts         Next 16 proxy (session refresh; was middleware.ts)
  drizzle/             generated migration SQL (incl. RLS)
services/matching/     Isolated Python FastAPI service + worker → Railway (uv, Docker)
infra/                 docker-compose (Meilisearch) + infra/sql/0001_pgmq.sql
docs/                  decision records (binding) + this file
```

## Pinned versions (verified against registries, June 2026)

Next 16.2.9 · React 19.2.4 · Tailwind v4 · shadcn 4.11 · ESLint 9 (flat) ·
drizzle-orm 0.45.2 / drizzle-kit 0.31.10 · postgres-js 3.4.9 ·
@supabase/ssr 0.12.0 / supabase-js 2.108.2 · meilisearch (js) 0.58.0.
Python 3.12 (uv 0.11.24) · fastapi 0.138.0 · rapidfuzz 3.14.5 · splink 4.0.16 ·
PyICU 2.16.2 · cyrtranslit 1.2.0 · meilisearch (py) 0.41.1 · psycopg 3.3.4.
Meilisearch image `getmeili/meilisearch:v1.48.1`. Lockfiles committed.

## Definition of Done — status

### Proven locally (commands + observed output)

- **SSR seam** — `next build` + `next start`; `curl /health` returns 200 with
  ~15.9 KB of content in the initial HTML payload (not an empty JS shell).
- **shadcn ↔ SSR** — the shadcn `Button` text renders in that server HTML.
- **UTF-8 / Cyrillic** — Ukrainian + Bulgarian Cyrillic strings present in the
  server-rendered payload.
- **HSTS** — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  on responses (plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).
- **Lint gate binds** — an intentional probe (inline `style`, `w-[437px]`, raw
  hex) produced 5 ESLint errors and failed `pnpm lint`; removed → clean. These
  are best-effort lexical guards: they catch the direct mistake but not a value
  hidden behind a variable/concatenation (inherent to ESLint AST rules) — the
  real "tokens only" guarantee is design-system discipline.
- **TypeScript strict binds** — an intentional type error failed `tsc`/build;
  removed → clean. `next build` is gated by a `prebuild` lint+typecheck hook.
- **Drizzle → SQL + RLS floor** — `drizzle-kit generate` emits `CREATE TABLE health`,
  `ENABLE ROW LEVEL SECURITY`, and the `authenticated` SELECT policy.
- **Variant D code paths** — `/health` exercises the RSC `getClaims` auth path
  and the Drizzle data-access path server-side; both degrade gracefully while
  Supabase is unwired.
- **PWA carcass** — `/manifest.webmanifest` served; `/sw.js` served with
  no-cache headers; SW registered client-side.
- **Python tier** — `uv lock` resolves all 57 packages; `uv sync` compiles
  **PyICU** against system libicu; `import icu/splink/rapidfuzz/...` all succeed;
  FastAPI `/health` returns 200 with library versions (incl. `icu` version).
- **Secrets** — every real `.env`/`.env.local` is git-ignored; only `.env.example`
  templates are committable.

### Deferred (needs the managed platforms — GitHub is connected; Supabase/Vercel/Railway are not yet)

- Prisma↔… **Drizzle↔Supabase live**: migration over the DIRECT connection;
  runtime queries over the Supavisor transaction pooler; write+read a `health` row.
- Supabase **Auth** sign-up/sign-in round-trip; live RSC session read.
- Supabase **Storage** upload + public (stripped-derivative) URL.
- **RLS live deny** — an unauthorized query is actually rejected.
- **UTF-8 via `pg_trgm`** round-trip on a live DB.
- **Meilisearch** Cyrillic typo proof live (`app/search.py`); needs a running
  Meilisearch (`infra/docker-compose.yml`).
- **pgmq round-trip** enqueue (TS) → consume (Python) on a live DB
  (`infra/sql/0001_pgmq.sql`).
- **Vercel** preview deploy (SSR + HSTS on the deployed URL).
- **Railway** deploy of the Python service + Meilisearch; Next→Python
  service-to-service call; worker→Postgres direct; EU-region co-location.

## Wiring the deferred platforms (next step)

1. Supabase (EU): set `DATABASE_URL` (pooler 6543), `DIRECT_URL` (5432),
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` in `apps/web/.env.local`; `pnpm db:migrate`; enable
   pgmq (`infra/sql/0001_pgmq.sql` or the Dashboard Queues integration).
2. Railway (EU): deploy `services/matching` (Docker) + the worker (same image,
   `CMD python -m app.worker`) + Meilisearch; set the service env from
   `services/matching/.env.example`.
3. Vercel: root directory `apps/web`; push env secrets; confirm SSR + HSTS on
   the preview URL.
