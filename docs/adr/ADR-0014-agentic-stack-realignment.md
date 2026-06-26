# ADR-0014 — Agentic stack realignment: Kysely, Better Auth, R2 quarantine, DO Postgres

- **Status:** Accepted
- **Date:** 2026-06-26
- **Supersedes:** ADR-0004, ADR-0007, ADR-0011, ADR-0012, ADR-0013 where they bind the app to Supabase Auth/Storage/RLS, Drizzle, Railway, pgmq, or Supabase Realtime.
- **Still compatible with:** ADR-0001 (TS app + Python matching), ADR-0002 (Next.js SSR/ISR), ADR-0003 (shadcn/ui), ADR-0005 (Meilisearch), ADR-0006 (PWA-first), ADR-0009 (Cloudflare edge/DNS), ADR-0010 (analytics, with privacy review before implementation).

## Context

OverGarden will be built mostly by AI coding agents working from Linear SDD tasks. The previous locked stack optimized for Supabase bundle velocity, Drizzle RLS ergonomics, and Supabase Broadcast. After review, the sharper constraint is different: reduce agent mistakes and reduce operational ambiguity while preserving the product-critical properties: SSR SEO, offline capture, Cyrillic matching, media safety, low infra cost, and a small founder-operable surface.

The previous stack also had a contradictory rule: docs banned query builders while the app used an ORM. That contradiction is dangerous in an SDD/agent workflow because future agents will “fix” toward whichever sentence they read last.

## Decision

1. Use **Kysely** in the TypeScript app as the only typed SQL builder. It is not an ORM: no entity layer, no hidden engine, no app data ownership. SQL migrations remain the schema source of truth; generated DB types are used by the app.
2. Use **Better Auth** for auth instead of Supabase Auth.
3. Use **DigitalOcean Managed Postgres** as the production database target. Local development uses Docker Postgres.
4. Use **Cloudflare R2** for object storage. Uploads go to a private quarantine bucket with presigned URLs; public pages serve only worker-created stripped derivatives.
5. Keep **Meilisearch** as a derived public index. Run it with the Python worker on one small DigitalOcean droplet at launch, with memory limits and rebuildable indexes. Do not add Hetzner/Railway provider sprawl before metrics justify it.
6. Use a **plain Postgres-backed queue table** for TS -> Python work. No Redis, no pgmq extension, no Python-only queue framework.
7. Keep **Python worker-first** for matching/dedup/reindex. FastAPI is optional internal/admin/health surface only; product typeahead reads Meilisearch, not a synchronous Python API.
8. Keep **PWA offline capture** via IndexedDB/Dexie, idempotency keys, visible sync state, and manual retry. Do not promise iOS Background Sync reliability.
9. Build in this order: walking skeleton, then vertical SDD slices. CI gates and privacy/media/SSR tests are part of the stack, not polish.

## Consequences

- The app loses Supabase bundle convenience but gains a clearer, provider-portable architecture.
- RLS is no longer the primary guardrail. The primary guardrail is scoped repository functions plus invariant tests. Sensitive tables may still use least-privilege DB roles and SQL policies later, but agents must not rely on broad browser-direct DB access.
- Media safety becomes explicit: client compression is an optimization, not a trust boundary. The server/worker derivative is the only public artifact.
- Realtime is deferred. Every surface must have a canonical server fetch path. Add live updates only after a feature proves it needs them.
- Infra cost remains low, but cost is not the main variable. The main variable is time-to-H1 validation and the number of mistakes the founder must manually catch.

## Non-goals

- Do not introduce Prisma.
- Do not reintroduce Supabase Auth/Storage/RLS as the default app platform without a new ADR.
- Do not replace Meilisearch with pg_trgm by assumption; run a PoC only if the first shippable slice can avoid multi-type typeahead.
- Do not add a fourth hosting provider to save a few dollars per month.
