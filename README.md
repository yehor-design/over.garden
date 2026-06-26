# OverGarden

A gardening journal that doubles as a catalog-as-social-graph for Ukraine and Bulgaria. Users keep a growing journal; public variety/region pages aggregate real first-hand experience; a later lineage layer traces where plants came from.

Status: pre-MVP. The stack has been realigned for agentic development: fewer hidden platform assumptions, stronger type feedback, and explicit privacy/media guardrails. See `docs/TECH_STACK_DECISIONS.md`, ADR-0014, `docs/WALKING_SKELETON.md`, and `docs/SDD_VERTICAL_SLICE_ROADMAP.md`.

## Stack

Next.js App Router + TypeScript · shadcn/ui · Better Auth · Kysely · DigitalOcean Managed Postgres · Cloudflare R2 · Meilisearch · Python worker (RapidFuzz, Splink, PyICU, CyrTranslit) · PWA offline capture with Dexie · Cloudflare edge/DNS.

## Repository Layout

- `apps/web/` — Next.js app and app backend.
- `services/matching/` — Python health service + background worker skeleton.
- `infra/` — local Docker services and SQL helpers.
- `docs/TECH_STACK_DECISIONS.md` — current consolidated stack decisions.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md` — living roadmap for vertical SDD execution slices; not a full backlog.
- `docs/adr/` — historical ADRs plus ADR-0014, the current superseding stack ADR.
- `AGENTS.md` — operating rules for AI agents and humans.

## Agentic Execution

Future Linear issues must be vertical SDD slices. Do not split work into isolated schema, UI, media, analytics, search, or public-page tasks. Each execution issue should start from a user behavior and wire the needed layers end to end. Run the `SDD Slice Test` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` before creating or accepting new Linear work.

## Getting Started

```bash
cd infra
cp .env.example .env
docker compose up -d

cd ../apps/web
pnpm install
cp .env.example .env.local
pnpm dev
pnpm lint
pnpm typecheck
```

Optional local DB bootstrap:

```bash
psql "$DATABASE_URL" -f sql/0001_walking_skeleton.sql
pnpm db:types
```

Python worker:

```bash
cd services/matching
uv sync --frozen
uv run uvicorn app.main:app --reload
uv run python -m app.worker
```

## Safety Notes

This product handles user data under wartime risk. Do not weaken the no-location rule, public-derivative-only photo pipeline, scoped repository requirement, or public-only search index rule without a superseding ADR and maintainer sign-off.
