# OverGarden

A gardening journal that doubles as a catalog-as-social-graph for Ukraine and Bulgaria. Users keep a growing journal; public variety/region pages aggregate real first-hand experience; a later lineage layer traces where plants came from.

Status: pre-MVP. The stack has been realigned for agentic development: fewer hidden platform assumptions, stronger type feedback, network-required journal writes under ADR-0017, and the explicit speed-and-reach MVP posture under ADR-0018. See `docs/TECH_STACK_DECISIONS.md`, the superseding ADRs, `docs/WALKING_SKELETON.md`, `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/INFRASTRUCTURE_REGISTRY.md`, and `docs/product-research/README.md`.

## Stack

Next.js App Router + TypeScript · shadcn/ui · Better Auth · Kysely · DigitalOcean Managed Postgres · Cloudflare R2 · Meilisearch · Python worker (RapidFuzz, Splink, PyICU, CyrTranslit) · online-only server-authoritative journal writes · Cloudflare edge/DNS.

## Repository Layout

- `apps/web/` — Next.js app and app backend.
- `services/matching/` — Python health service + background worker skeleton.
- `infra/` — local runtime services and SQL helpers. Apple Container is the preferred local container runtime; Docker is fallback-only where Apple Container is unavailable or lacks a required feature.
- `docs/TECH_STACK_DECISIONS.md` — current consolidated stack decisions.
- `docs/CONTAINER_RUNTIME_POLICY.md` — Apple Container-first runtime policy plus Docker fallback matrix.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md` — living roadmap for vertical SDD execution slices; not a full backlog.
- `docs/INFRASTRUCTURE_REGISTRY.md` — live non-secret infrastructure values, provider IDs, bucket/domain names, env contracts, and dashboard links.
- `docs/product-research/` — duplicated product research corpus for ICP, JTBD, positioning, IA, SEO/content, trust/privacy, GTM, and validation evidence.
- `docs/adr/` — historical ADRs plus current superseding decisions; ADR-0017 owns online-only persistence and ADR-0018 owns the MVP refusal, media, indexability, and in-product admin posture.
- `AGENTS.md` — operating rules for AI agents and humans.

## Agentic Execution

Every new or materially rewritten Linear work item must follow `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`, start from its tracked AI-agent template, and pass the validator plus the applicable `SDD Slice Test` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`. Product execution remains a behavior-first vertical slice; remediation, operator, decision, canon-correction, and coordination-container work uses the standard's bounded contracts. Do not split one behavior into isolated schema, UI, media, analytics, search, or public-page layer tickets, and do not invent fake product layers for a legitimate non-product task.

The open OVE-213 through OVE-244 reference batch predates contract v1. Each issue must receive its own current-main/current-Linear re-audit, material v1 rewrite, final validation, saved-body read-back, and digest match before assignment or `In Progress`; the range is not blanket-certified by this repository standard.

Issues that touch DNS, R2, production env, media URLs, deployment, storage, or external services must include `docs/INFRASTRUCTURE_REGISTRY.md` under the exact `Required context` heading.

User-facing issues must also run the Product Thinking Gate in `docs/product-research/README.md` and include the relevant research files in their context.

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

This product handles user data under wartime risk. Precise location remains
locked. ADR-0018 is the explicit maintainer-approved supersession for the MVP
serve-under-uncertainty, format-conversion-only media, measured indexability,
and in-product admin posture; its accepted cross-account-read exposure must be
named honestly, and runtime changes remain owned by OVE-330 through OVE-339.
