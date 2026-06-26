# AGENTS.md — OverGarden

Operating guide for AI agents and humans working in this repo. Read this before any change. Current stack authority is `docs/TECH_STACK_DECISIONS.md` plus ADR-0014. Older ADRs are historical if ADR-0014 supersedes them.

## Project

OverGarden is a gardening journal plus catalog-as-social-graph for Ukraine and Bulgaria. The audience includes Ukrainian users under wartime risk, so location privacy and image metadata handling are safety-critical.

## Current Stack

- Next.js App Router + TypeScript on Vercel.
- shadcn/ui only for UI primitives.
- Better Auth for auth.
- DigitalOcean Managed Postgres for production data; Docker Postgres locally.
- Kysely as the typed SQL builder. SQL migrations are schema source of truth. No ORM.
- Cloudflare R2 for media: private quarantine bucket -> worker-created public derivative.
- Meilisearch as a derived public search/typeahead index.
- Python worker for RapidFuzz/Splink/PyICU/CyrTranslit matching, dedup, and reindex work.
- Plain Postgres `job_queue` table for TS -> Python background work. No Redis, no pgmq, no Python-only queue framework.
- PWA offline capture with Dexie/IndexedDB and idempotency keys.
- Cloudflare for DNS/edge/WAF/R2. Cloudflare must not cache HTML.

## Hard Rules

1. No precise location anywhere in v0. Region-level only. No coordinates in payloads, URLs, logs, analytics, image metadata, search docs, or public pages.
2. Public photos must be stripped derivatives. Upload originals only to private quarantine, re-encode/resize/strip with `sharp`, publish derivative only, delete the original after successful processing.
3. Client-side EXIF stripping is an optimization, not a safety boundary. Never trust client processing as the only privacy control.
4. No browser-direct broad database access. All app data access goes through server APIs/server actions/repositories. Presigned upload URLs are narrow object-specific exceptions.
5. Kysely is allowed and expected. Do not introduce Prisma, Drizzle, TypeORM, or another ORM without a superseding ADR.
6. Scoped repositories are mandatory for user/private data. Types do not protect against missing `user_id`, visibility, or public/private predicates.
7. Meilisearch indexes public rows only. Treat search indexing as a privacy boundary and test it.
8. Realtime is not a source of truth. Add live updates only after the canonical server fetch path exists.
9. Every public SEO page must be server-rendered and must stay noindex until it has real UGC depth.
10. No secrets in git. Use env vars/platform secret stores. `.env*` is git-ignored except `.env.example`.

## Workflow

- Build a walking skeleton first, then vertical SDD slices.
- Keep changes scoped and wire all affected surfaces together: SQL/types -> repository -> route/action -> UI -> tests -> docs.
- Prefer machine-checkable guardrails over prose instructions: typecheck, lint, focused tests, privacy tests, SSR tests, media tests, search-index tests.
- English for code, identifiers, comments, commit messages, and repository docs.
- Conventional Commits.

## Linear SDD Task Rule

All future Linear execution issues must be vertical SDD slices, not layer tickets. A valid issue starts from a concrete user behavior and owns every layer needed to prove that behavior end to end: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs.

Do not create standalone issues such as "build schema", "build UI", "add media pipeline", "add analytics", "build public pages", or "wire search" unless that work is inside the same issue as a user-visible path. Before creating or accepting a Linear issue, run the `SDD Slice Test` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`. If it fails the test, rewrite the issue before implementation.

The roadmap is not the full backlog. Only the current execution batch in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is ready for Linear. Later horizon slices must be rewritten into fresh vertical SDD issues after the current batch is reviewed.

## Decision Changes

Existing ADRs are immutable historical records. To change a stack decision, add a superseding ADR and update the consolidated docs/instructions so future agents do not read contradictory canon.

## Do Not Touch Without Explicit Maintainer Sign-off

- Destructive database changes, schema drops, bulk deletes, history rewrites, force-push.
- Weakening location privacy, media derivative guarantees, scoped repository rules, or search-index privacy boundaries.
