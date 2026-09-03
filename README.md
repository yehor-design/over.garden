# OverGarden

A gardening journal that doubles as a catalog-as-social-graph for Ukraine and Bulgaria. Users keep a growing journal; public variety/region pages aggregate real first-hand experience; a later lineage layer traces where plants came from.

Status: pre-MVP, online-only, everything public. Start with `docs/PROJECT_STATE.md` — what is true in production, what is next, what is knowingly unfinished. The current decisions are in `docs/adr/ADR-0022-owner-mvp-reset.md` and `docs/adr/ADR-0023-workspace-resilience.md`; the stack detail is in `docs/TECH_STACK_DECISIONS.md`; live provider values are in `docs/INFRASTRUCTURE_REGISTRY.md`; product research is in `docs/product-research/README.md`.

## Stack

Next.js App Router + TypeScript · shadcn/ui · Better Auth · Kysely · DigitalOcean Managed Postgres · Cloudflare R2 · Meilisearch · Python worker (RapidFuzz, Splink, PyICU, CyrTranslit) · online-only server-authoritative journal writes · Cloudflare edge/DNS.

## Repository Layout

- `apps/web/` — Next.js app and app backend.
- `services/matching/` — Python background worker for matching and reindex jobs. Its self-reporting HTTP service was retired by OVE-357; liveness comes from the worker's heartbeat row.
- `infra/` — local runtime services and SQL helpers. Apple Container is the preferred local container runtime; Docker is fallback-only where Apple Container is unavailable or lacks a required feature.
- `docs/TECH_STACK_DECISIONS.md` — current consolidated stack decisions.
- `docs/CONTAINER_RUNTIME_POLICY.md` — Apple Container-first runtime policy plus Docker fallback matrix.
- `docs/PROJECT_STATE.md` — production truth, current direction, known gaps. `docs/DELIVERY_LOG_2026-09.md` — what the owner MVP reset shipped and why. `docs/PRODUCTION_SCHEMA_STATE.md` — which migrations production runs.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md` — historical roadmap and execution log; active work lives in Linear.
- `docs/INFRASTRUCTURE_REGISTRY.md` — live non-secret infrastructure values, provider IDs, bucket/domain names, env contracts, and dashboard links.
- `docs/product-research/` — duplicated product research corpus for ICP, JTBD, positioning, IA, SEO/content, trust/privacy, GTM, and validation evidence.
- `docs/adr/` — ADRs; `ADR-0022-owner-mvp-reset.md` is the current authority and lists what it supersedes in ADR-0017, ADR-0018, and ADR-0019.
- `AGENTS.md` — operating rules for AI agents and humans.

## How work happens

Every change is one Linear issue on one branch, implemented end to end (SQL,
repository, route, UI, tests, docs) and merged on green CI. `AGENTS.md` is the
one-page operating guide and contains the task template; ADR-0022 records the
current product and engineering decisions. Historical roadmaps, runbooks, and
audits under `docs/` are receipts, not instructions.

## Getting Started

Apple Container is the primary local runtime on supported Apple Silicon/macOS 26 machines. OVE-77 closes the local migration proof: on a supported Mac, Docker Desktop is not required for local infra, web bootstrap/type checks/tests, or the matching worker/search test path. Docker Compose remains available only for unsupported hosts or a verified Apple Container feature gap; GitHub Actions Ubuntu CI and the production Linux worker droplet keep Docker for their documented platform boundaries. See `docs/CONTAINER_RUNTIME_POLICY.md` and `infra/README.md`.

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

Supported-Mac closeout:

```bash
command -v container
container system status
infra/container-up
cd apps/web
pnpm local:bootstrap
pnpm db:types:check
pnpm test
cd ../../services/matching
uv run --frozen pytest
```

If those commands pass on a supported Apple Silicon/macOS 26 machine, Docker Desktop can be removed from that local development machine. Keep Docker only for explicitly named fallback, CI, or production Linux cases.

Python worker:

```bash
cd services/matching
uv sync --frozen
uv run uvicorn app.main:app --reload
uv run python -m app.worker
```

## Safety Notes

The audience includes people living under wartime risk. The product stores no
precise coordinates for users, entries, or media, and a gardener chooses whether
a region label is shown at all. Beyond that, ADR-0022 deliberately favours
speed and reach over defensive refusal for the MVP; the accepted trade-offs are
listed in that ADR.
