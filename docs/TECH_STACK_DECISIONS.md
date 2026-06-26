# OverGarden — Technology Stack & Decisions

> **Current status:** superseded and consolidated on 2026-06-26 by ADR-0014. Older ADRs remain in `docs/adr/` as historical records, but this document and ADR-0014 are the current stack surface for new work.

## Product frame

OverGarden is a gardening journal plus catalog-as-social-graph for Ukraine and Bulgaria. The near-term H1 bet is whether users sustain a narrative growing journal habit. The H6 growth bet is public, crawlable, UGC-rich variety/region pages. The build process is agentic: AI agents execute Linear SDD tasks, so the stack must bias toward clear boundaries, type feedback, repeatable patterns, and tests that catch mistakes without requiring the founder to manually inspect every line.

## Current stack

| Layer | Decision |
| --- | --- |
| Web/app runtime | Next.js App Router + TypeScript on Vercel |
| UI | shadcn/ui only |
| Auth | Better Auth |
| Database | DigitalOcean Managed Postgres in production; Docker Postgres locally |
| Type-safe data access | Kysely typed SQL builder; SQL migrations are schema source of truth |
| Data-access safety | Scoped repository functions + invariant tests; no browser-direct broad DB access |
| Object storage | Cloudflare R2 with private quarantine bucket and public derivative bucket/CDN |
| Media processing | Worker-side sharp re-encode/resize/metadata strip; originals deleted after processing |
| Search/typeahead | Meilisearch as a derived public index |
| Matching/dedup | Python worker using RapidFuzz, Splink, PyICU, CyrTranslit; off request path |
| Queue | Plain Postgres `job_queue` table, consumed with `FOR UPDATE SKIP LOCKED` |
| Offline capture | PWA + Dexie/IndexedDB local queue + idempotency keys + visible sync state |
| Realtime | Deferred; canonical server fetch path first |
| Edge/DNS | Cloudflare in front of Vercel; do not cache HTML at Cloudflare |
| Analytics | PostHog / first-party analytics later, after privacy event review |
| Build method | Walking skeleton first, then vertical SDD slices |

## Binding invariants

1. **No precise location in v0.** Store region-level data only. Never put coordinates in payloads, URLs, logs, analytics, image metadata, or search indexes.
2. **Public photos are derivatives only.** User uploads go to private quarantine. A worker re-encodes with `sharp`, strips metadata, stores a public derivative, and deletes the original immediately after successful processing.
3. **Client EXIF stripping is not a trust boundary.** Client compression/metadata removal is useful for bandwidth, but server/worker processing is the guarantee.
4. **No broad browser database access.** The browser talks to app APIs/server actions and receives narrow presigned upload URLs only.
5. **Kysely is allowed; ORMs are not.** Do not reintroduce Prisma/Drizzle/TypeORM. Kysely is the typed SQL builder for app queries; raw parameterized SQL is allowed for escape hatches.
6. **Scoped repositories are mandatory for private/user data.** Kysely types catch column mistakes, not missing visibility predicates. Repositories must encode user scope and visibility by construction.
7. **Meilisearch indexes public data only.** Indexing correctness is a privacy property. Rebuild jobs must be tested against private-row leakage.
8. **Offline capture must be honest.** Queue locally, sync when possible, show unsynced state, support retry. Do not assume iOS background sync will run reliably.
9. **Python is a worker, not a product dependency.** Typeahead uses Meilisearch. Dedup/matching can lag; SEO canonicalization must prevent thin duplicate public pages from being indexed before merge.
10. **Every public SEO page is server-rendered.** No important public content behind a client-only shell. Thin programmatic pages stay noindex until they carry real UGC.
11. **Agents follow vertical slices after the skeleton.** Avoid building “all DB then all auth then all UI”; each SDD slice must integrate the user path end to end.
12. **CI gates are part of the stack.** Typecheck, lint, focused tests, privacy tests, SSR tests, media derivative tests, and search-index privacy tests should be added before expanding product surface area.

## Launch topology

- **Vercel:** Next.js app, app backend, SSR/ISR, preview deploys.
- **DigitalOcean Managed Postgres:** primary durable data store.
- **DigitalOcean Droplet:** Python worker + Meilisearch container at launch. Add memory limits, swap, health checks, and make Meili indexes rebuildable.
- **Cloudflare:** DNS, WAF/bot controls, R2 object storage, CDN for public derivatives. Cloudflare must not cache HTML.

## Local topology

- Docker Postgres for database development.
- Docker Meilisearch for search proof and index integration.
- MinIO as local S3/R2 emulator.
- `apps/web/.env.example` and `infra/.env.example` are the canonical local env templates.

## ADR index

- ADR-0001 — TypeScript app + isolated Python matching tier. Still valid.
- ADR-0002 — Next.js App Router + SSR/ISR. Still valid.
- ADR-0003 — shadcn/ui. Still valid.
- ADR-0004 — Supabase platform. Superseded by ADR-0014.
- ADR-0005 — Meilisearch. Still valid.
- ADR-0006 — PWA-first. Still valid with iOS offline-risk caveat.
- ADR-0007 — Vercel + Supabase + Railway hosting. Superseded by ADR-0014.
- ADR-0008 — Prisma. Superseded historically.
- ADR-0009 — Cloudflare edge/DNS. Still valid; R2 is now accepted, not deferred.
- ADR-0010 — Marketing/analytics. Mostly valid; implementation requires event privacy review.
- ADR-0011 — Drizzle. Superseded by ADR-0014.
- ADR-0012 — Supabase RLS topology. Superseded by ADR-0014; scoped repositories + tests remain.
- ADR-0013 — Supabase Broadcast. Superseded/deferred by ADR-0014.
- ADR-0014 — Current stack realignment. Binding.
