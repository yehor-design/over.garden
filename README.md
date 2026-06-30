# OverGarden

A gardening journal that doubles as a catalog-as-social-graph for Ukraine and Bulgaria. Users keep a growing journal; public variety/region pages aggregate real first-hand experience; a later lineage layer traces where plants came from.

Status: pre-MVP. The stack has been realigned for agentic development: fewer hidden platform assumptions, stronger type feedback, and explicit privacy/media guardrails. See `docs/TECH_STACK_DECISIONS.md`, ADR-0014, `docs/WALKING_SKELETON.md`, `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/INFRASTRUCTURE_REGISTRY.md`, and `docs/product-research/README.md`.

## Stack

Next.js App Router + TypeScript · shadcn/ui · Better Auth · Kysely · DigitalOcean Managed Postgres · Cloudflare R2 · Meilisearch · Python worker (RapidFuzz, Splink, PyICU, CyrTranslit) · PWA offline capture with Dexie · Cloudflare edge/DNS.

## Repository Layout

- `apps/web/` — Next.js app and app backend.
- `services/matching/` — Python health service + background worker skeleton.
- `infra/` — local runtime services and SQL helpers. Apple Container is the preferred local container runtime; Docker is fallback-only where Apple Container is unavailable or lacks a required feature.
- `docs/TECH_STACK_DECISIONS.md` — current consolidated stack decisions.
- `docs/CONTAINER_RUNTIME_POLICY.md` — Apple Container-first runtime policy plus Docker fallback matrix.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md` — living roadmap for vertical SDD execution slices; not a full backlog.
- `docs/INFRASTRUCTURE_REGISTRY.md` — live non-secret infrastructure values, provider IDs, bucket/domain names, env contracts, and dashboard links.
- `docs/product-research/` — duplicated product research corpus for ICP, JTBD, positioning, IA, SEO/content, trust/privacy, GTM, and validation evidence.
- `docs/adr/` — historical ADRs plus ADR-0014, the current superseding stack ADR.
- `AGENTS.md` — operating rules for AI agents and humans.

## Agentic Execution

Future Linear issues must be vertical SDD slices. Do not split work into isolated schema, UI, media, analytics, search, or public-page tasks. Each execution issue should start from a user behavior and wire the needed layers end to end. Run the `SDD Slice Test` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` before creating or accepting new Linear work.

Issues that touch DNS, R2, production env, media URLs, deployment, storage, or external services must include `docs/INFRASTRUCTURE_REGISTRY.md` in their context files.

User-facing issues must also run the Product Thinking Gate in `docs/product-research/README.md` and include the relevant research files in their context.

## Getting Started

Apple Container is the primary local runtime on supported Apple Silicon/macOS 26 machines. Docker Compose remains available only as a documented fallback; see `docs/CONTAINER_RUNTIME_POLICY.md` and `infra/README.md`.

```bash
infra/container-up
infra/container-status

cd apps/web
pnpm install
cp .env.example .env.local
pnpm local:bootstrap
pnpm db:types
pnpm db:types:check
pnpm dev
pnpm lint
pnpm typecheck
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
