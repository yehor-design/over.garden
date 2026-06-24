# OverGarden

A gardening journal that doubles as a catalog-as-social-graph — plant varieties are the shared graph — for Ukraine and Bulgaria. People keep a searchable narrative growing-journal; public variety-in-region pages aggregate real first-hand experience; a lineage layer traces where each plant came from (seed and cutting provenance passed between growers).

Status — pre-MVP. The technology stack and architecture are decided and locked (see `docs/TECH_STACK_DECISIONS.md`). The **runtime scaffold has landed** (Next.js app, Drizzle data layer, Supabase wiring, PWA carcass, Python matching service, queue + search seams) and its seams are verified locally; product implementation has not started. See `docs/SCAFFOLD_STATUS.md` for exactly what is proven vs. deferred until the managed platforms are connected.

## Stack (summary)

Next.js (App Router) + TypeScript · shadcn/ui · Drizzle ORM · PostgreSQL via Supabase · an isolated Python matching service (Meilisearch · RapidFuzz · Splink · PyICU · CyrTranslit) · Supabase Realtime (Broadcast from Database) · PWA · Cloudflare edge · PostHog analytics.

Full rationale, the rejected alternatives, and the binding invariants are in `docs/TECH_STACK_DECISIONS.md` and the ADRs under `docs/adr/`.

## Repository layout

* `docs/TECH_STACK_DECISIONS.md` — consolidated, binding stack & architecture decisions, with the ADR index.
* `docs/adr/` — Architecture Decision Records (one per significant decision; immutable, superseded rather than edited).
* `AGENTS.md` — operating guide and binding invariants for AI coding agents (and humans). Read it before contributing.
* `CLAUDE.md` — pointer to `AGENTS.md` for Claude Code.
* `apps/web/` — Next.js (App Router) + TypeScript app and app backend → deployed to Vercel.
* `services/matching/` — isolated Python (FastAPI + worker) matching tier → deployed to Railway.
* `infra/` — local `docker-compose` (Meilisearch) and the `pgmq` enablement SQL.
* `docs/SCAFFOLD_STATUS.md` — what the runtime scaffold proves vs. defers.

## Getting started

```bash
# Web app (apps/web)
cd apps/web
pnpm install
cp .env.example .env.local      # fill in when Supabase is wired
pnpm dev                        # http://localhost:3000  (try /health)
pnpm lint && pnpm typecheck     # design-token + strict-TS gates
pnpm build                      # gated by lint + typecheck
pnpm db:generate                # emit Drizzle migration SQL from the schema

# Matching service (services/matching) — needs uv (https://astral.sh/uv)
cd services/matching
uv sync                         # PyICU compiles against system libicu
uv run uvicorn app.main:app --reload   # http://localhost:8000/health

# Local Meilisearch (for the Cyrillic search proof)
cd infra && cp .env.example .env && docker compose up -d
```

Supabase / Vercel / Railway are connected later; the app boots without them (DB/auth seams degrade gracefully). See `docs/SCAFFOLD_STATUS.md` for the wiring steps.

## Contributing

This product handles data for users under wartime risk, so several architectural rules are safety-critical. Before contributing — human or agent — read `AGENTS.md` and the relevant ADR. Do not weaken the privacy invariants (location lock, single-door data access, EXIF stripping, the RLS floor and its invariant tests) without a superseding ADR and maintainer sign-off.

## License

TBD.
