# AGENTS.md — OverGarden

Operating guide for AI agents (and humans) working in this repo. Read this fully before any change. The authoritative, detailed decisions live in `docs/TECH_STACK_DECISIONS.md` and `docs/adr/`; read the governing ADR before touching the area it covers. If you believe a rule here or a decision in those docs is wrong, surface it to the maintainer — do not silently violate it.

## Project

OverGarden — a gardening journal + catalog-as-social-graph for Ukraine & Bulgaria. Zero-stage pre-MVP: the stack is decided and locked; application implementation has not started. The audience includes Ukrainian users under wartime risk, so the privacy rules below are safety-critical, not cosmetic.

## Stack (do not substitute any of these without a superseding ADR)

* Next.js (App Router) + TypeScript — SSR/ISR; the app backend is TS route handlers / server actions.
* UI: shadcn/ui only — added via the shadcn CLI/MCP. Do not introduce another component library; do not hand-roll components.
* ORM: Drizzle — NOT Prisma. Prisma was reversed (ADR-0011). Do not reintroduce Prisma.
* DB/platform: PostgreSQL via Supabase (Auth + Storage + RLS). UTF-8 DB locale (required for Cyrillic matching).
* Matching/dedup: an isolated Python service (Meilisearch · RapidFuzz · Splink · PyICU · CyrTranslit). Do not reimplement it in TypeScript.
* Search: Meilisearch (self-hosted), a derived index over Postgres.
* Realtime: Supabase Broadcast from Database (DB triggers) — not raw Postgres Changes, not client-to-client broadcast (ADR-0013).
* Mobile: PWA (offline capture). Edge/DNS: Cloudflare. Product analytics: PostHog (first-party).

## Hard rules (the binding invariants — non-negotiable)

1. No precise location anywhere. v0 stores no exact coordinates. Never put coordinates in a client payload, URL, query string, log, or analytics event. Region = ISO 3166-2 oblast/province only.
2. EXIF-GPS is stripped server-side in the worker (sharp) before any photo is public. Serve only the stripped derivative; never fall back to the GPS-bearing original.
3. Single-door data access. The browser never gets anon-key-wide direct DB access (no raw table reads, no Realtime on raw tables, no broad Storage). All data access goes through the server tier. Only exceptions: signed upload URLs; Broadcast-from-Database channels.
4. App-tier authz is primary; RLS is a narrow floor on sensitive tables (location data, private objects, `proposed` lineage edges) via a least-privilege DB role — never connect as superuser/service-role for app queries.
5. Privacy policies live in the Drizzle schema (versioned) and are covered by CI invariant tests proving user A cannot see user B's private data via any access path. No privacy/authz change ships without its test.
6. Meilisearch indexes only public rows. Index correctness is a privacy boundary — a "reindex everything" job must not leak private objects. Covered by a test.
7. Realtime is an enhancement layer, never the source of truth. Every live surface has a canonical server fetch path (Realtime delivery is not guaranteed).
8. SSR every public page; no public content behind a client-only JS shell (AI crawlers don't run JS). No-index thin programmatic pages — index a variety×region page only once it carries real first-hand UGC.
9. Cloudflare does not cache HTML (Vercel owns the ISR cache). Allow-list verified search/retrieval crawlers in any WAF/bot rule; SSL mode Full (Strict).
10. No secrets in git. Use env vars / the platform secret store; `.env*` is git-ignored. Never hard-code keys. Personal/local overrides go in `CLAUDE.local.md` (git-ignored).

## Workflow

* TDD: red → green → refactor. Write the failing test first. For any privacy/authz code, the invariant test (rule 5) is mandatory, not optional.
* English for all code, comments, identifiers, commit messages, specs, and docs.
* Conventional Commits. Keep changes scoped, and wire all affected surfaces in the same change (schema → types → queries → API → tests → docs).
* Before changing data access, realtime, edge config, or the matching service, read the governing ADR in `docs/adr/` first.

## Do not touch without explicit maintainer sign-off

* The decision records (`docs/TECH_STACK_DECISIONS.md`, `docs/adr/*`) are immutable. To change a decision, propose a superseding ADR — do not edit the existing one.
* Irreversible/destructive ops: schema drops, bulk deletes, history rewrites, force-push.
