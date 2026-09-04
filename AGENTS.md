# AGENTS.md — OverGarden

Read this whole page before changing anything. It is the current operating
guide for AI agents and humans. Read `docs/PROJECT_STATE.md` beside it: it says
what is true in production right now, what is being worked on, and what is
knowingly unfinished. Current decisions live in
`docs/adr/ADR-0022-owner-mvp-reset.md` and
`docs/adr/ADR-0023-workspace-resilience.md` and
`docs/adr/ADR-0024-server-authoritative-interaction.md`; older ADRs and dated documents are
history and never override them.

## Product

OverGarden is a public gardening journal for Ukraine and Bulgaria: a gardener
keeps a narrative journal per plant or animal, every entry is public and
indexable, and public variety, topic, profile, and community pages aggregate
real first-hand experience. There are no private entries, no drafts, no
offline mode, and no separate admin panel. Speed and search discovery come
before defensive refusal.

## Stack

| Layer | Decision |
| --- | --- |
| App | Next.js App Router + TypeScript on Vercel (`fra1`), Cache Components for public pages |
| UI | shadcn/ui primitives, Tailwind, `next/font/local` for Google Sans and Geist Mono |
| Auth | Better Auth with session cookie cache; one sealed `owner` role bootstrapped by CLI |
| Data | DigitalOcean Managed Postgres, Kysely, SQL migrations under `apps/web/sql` are the schema truth, no ORM |
| Journal | Lexical composer, `JournalDocumentV1` is the sole persisted document contract |
| Media | Browser converts photos to WebP variants, uploads straight to the Cloudflare staging Worker, atomic Publish promotes them to the public bucket served at `media.over.garden` |
| Search | Meilisearch as a derived public index; Python worker for matching and reindex jobs |
| Queue | Postgres `job_queue` table |
| Edge | Cloudflare DNS and R2; Vercel serves and caches HTML |

Live provider values are in `docs/INFRASTRUCTURE_REGISTRY.md`; read it before
touching DNS, R2, env, or deployment. Local infra starts with
`infra/container-up` (Apple Container first, Docker as fallback).

## Hard rules (ADR-0022)

1. No ORM. Kysely plus SQL migrations only.
2. No server-side image processing, no source-original retention, no metadata
   cleaning step. The browser-made WebP variants are the only artifacts.
3. No durable browser journal state: no IndexedDB, service worker, PWA
   manifest, offline queue, or draft. Only an acknowledged Publish is durable.
4. Everything public is indexable. `noindex` only for empty listings, the
   seven-day 410 tombstone, and signed-in workspace screens.
5. Public pages are cached with tags and revalidated by the mutations that
   change them; workspace, account, auth, erasure, health, and API stay
   `no-store`.
6. Authorization happens on the server at the moment of the mutation. No
   client-side session gates, admission tokens, or pre-checks.
7. Admin pages live in the account menu under the sealed owner role and must
   work in production.
8. No voice dictation, no speech recognition.
9. No secrets in git. `.env*` is ignored except `.env.example`.
10. Do not touch without the owner's explicit sign-off: destructive schema
    changes, bulk deletes, history rewrites, force-push.
11. A page under `/garden/**` never awaits a `@/server/*` read outside
    `settleSection`. Settle it into a bounded failure class and render that
    value; `error.tsx` does not catch a Server Component error on a hard load
    (ADR-0023).

`apps/web/scripts/check-banned-dependencies.ts` enforces the mechanical half of
these rules in CI and in `pnpm test`.

## How we work

- Start from a fresh `origin/main`; branch `codex/<issue>-<slug>`; one Linear
  issue per branch; implement end to end (SQL → repository → route → UI →
  tests → docs); Conventional Commits; open a PR; merge only on green CI;
  then move the Linear issue to Done and sync `main`.
- CI is `.github/workflows/ci.yml`: install, services, bootstrap, generated
  DB types check, lint, typecheck, banned-dependency gate, tests, build, plus
  the Python matching job. Keep it under ten minutes.
- Do not name a Done Linear issue in a PR title or body; the GitHub
  integration reopens it. Describe the work instead.
- Read-only commands against production are fine; anything that changes
  production data, schema, or provider state needs one explicit approval each.
- English for code, identifiers, commits, and repository docs.

## Task template

Every Linear task uses this shape and nothing more:

```
## Outcome
## Owner decisions this task implements
## Scope (in / out)
## Key files
## Acceptance criteria
## Proof
## Dependencies
```

## Where things are

- `docs/PROJECT_STATE.md` — read first: production truth, direction, known gaps.
  `docs/DELIVERY_LOG_2026-09.md` — what shipped in the reset and why.
- `docs/adr/ADR-0022-owner-mvp-reset.md` — current decisions and what they
  supersede. `docs/adr/ADR-0023-workspace-resilience.md` — how a workspace page
  handles failure. `docs/adr/ADR-0024-server-authoritative-interaction.md` — why
  a public control may not depend on hydration, and what a like, a language
  choice, and a sign-in are made of. `docs/TECH_STACK_DECISIONS.md` — stack detail and ADR index.
- `docs/INFRASTRUCTURE_REGISTRY.md` — provider IDs, buckets, domains, env.
- `docs/PRODUCTION_SCHEMA_STATE.md` — which migrations the production database
  actually runs, and how to check before assuming.
- `docs/MEDIA_LIFECYCLE.md`, `docs/ONLINE_ONLY_JOURNAL.md`,
  `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`, `docs/ADMIN_ROLE_BOOTSTRAP.md`,
  `docs/STABLE_REGISTRY.md`, `docs/MIGRATION_ALLOCATION.md` — current
  behaviour of each area.
- `docs/product-research/` — product research, written before the code existed.
  Read `docs/product-research/PRODUCT_CANON_2026-09.md` first: it states what the
  product is today and outranks every other file there. Then read the two to five
  files relevant to a user-facing change. Every file carries a dated status header;
  `SUPERSEDED_DECISIONS_LEDGER.md` lists the research decisions the product cancelled
  and what replaced them. The corpus never overrides this page or the ADRs.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/runbooks/`,
  `docs/audit-inbox/`, `docs/reviews/`, `docs/linear/` — historical receipts.
- `apps/web/AGENTS.md` — the Next.js version notice; read the framework docs
  in `node_modules/next/dist/docs/` before using an API from memory.
