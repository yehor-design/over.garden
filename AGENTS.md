# AGENTS.md — OverGarden

Read this whole page before changing anything. It is the current operating
guide for AI agents and humans. Read `docs/PROJECT_STATE.md` beside it: it says
what is true in production right now, what is being worked on, and what is
knowingly unfinished. Current decisions live in
`docs/adr/ADR-0022-owner-mvp-reset.md`,
`docs/adr/ADR-0023-workspace-resilience.md`,
`docs/adr/ADR-0024-server-authoritative-interaction.md`,
`docs/adr/ADR-0025-stable-registry-retired.md`,
`docs/adr/ADR-0026-organism-knowledge-graph.md`,
`docs/adr/ADR-0027-owner-health-page-retired.md` and
`docs/adr/ADR-0028-notion-shaped-composer.md`,
`docs/adr/ADR-0029-address-law.md`,
`docs/adr/ADR-0030-editorial-pipeline-in-overgarden.md`,
`docs/adr/ADR-0031-design-system-and-redesign.md` and
`docs/adr/ADR-0032-static-public-documents.md`; older ADRs and dated
documents are history and never override them.

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
| UI | One design system: `DESIGN.md` is the canon (tokens, components, layout, patterns, accessibility). shadcn/ui primitives, Tailwind, `next/font/google` for Google Sans and Geist Mono |
| Auth | Better Auth with session cookie cache; one sealed `owner` role bootstrapped by CLI |
| Data | DigitalOcean Managed Postgres, Kysely, SQL migrations under `apps/web/sql` are the schema truth, no ORM |
| Journal | Lexical composer, `JournalDocumentV1` is the sole persisted document contract |
| Media | Browser converts photos to WebP variants, uploads straight to the Cloudflare staging Worker, atomic Publish promotes them to the public bucket served at `media.over.garden` |
| Search | The gardener picker is one Postgres statement behind `/api/public/catalog/typeahead` (ADR-0026 D7, `src/server/catalog-repository.ts`, `src/components/garden/catalog-picker.tsx`); Meilisearch stays a derived public index for journal search; Python worker for matching and reindex jobs |
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
   change them; workspace, account, auth, erasure, and API stay `no-store`. One
   exception (ADR-0026 D7): the public catalog typeahead route under
   `/api/public/catalog/` reads no cookies and no personal data and may carry a
   short public cache.
6. Authorization happens on the server at the moment of the mutation. No
   client-side session gates, admission tokens, or pre-checks.
7. Admin pages live in the account menu under the sealed owner role and must
   work in production.
8. No voice dictation, no speech recognition.
9. No secrets in git. `.env*` is ignored except `.env.example`.
10. Do not touch without the owner's explicit sign-off: destructive schema
    changes, bulk deletes, history rewrites, force-push. The closeout migration
    of SDD Slice 24 carries that sign-off in advance (ADR-0026 amendment of
    2026-09-05).
11. A page under `/garden/**` never awaits a `@/server/*` read outside
    `settleSection`. Settle it into a bounded failure class and render that
    value; `error.tsx` does not catch a Server Component error on a hard load
    (ADR-0023). `apps/web/scripts/check-workspace-settled-reads.ts` enforces
    this in CI and in `pnpm test`: an escape looks like every other `await` and
    only shows on a hard load with the dependency already broken.

`apps/web/scripts/check-banned-dependencies.ts` enforces the mechanical half of
these rules in CI and in `pnpm test`, beside
`apps/web/scripts/check-workspace-settled-reads.ts` for rule 11.

## How we work

- Start from a fresh `origin/main`; branch `codex/<issue>-<slug>`; one Linear
  issue per branch; implement end to end (SQL → repository → route → UI →
  tests → docs); Conventional Commits; open a PR; merge only on green CI;
  then move the Linear issue to Done and sync `main`.
- CI is `.github/workflows/ci.yml`: **Web app checks** (install, services,
  bootstrap, generated DB types check, generated job-queue contract check and
  its executed database proof, lint, typecheck, banned-dependency gate, tests)
  beside **Browser proof** (build, then the browser gate in two shards), with
  **Web app** — the required check — needing both, plus the Python matching
  job. Keep it under ten minutes.
- The browser gate is one list: `apps/web/scripts/browser-gate-specs.ts`, run
  by `scripts/run-browser-gate.ts` against `next start`, locally
  (`pnpm gates:browser`) and in CI alike. A new spec goes into that list the day
  it is written; `pnpm check:browser-specs` (in `pnpm test`) fails on one that
  nothing runs. A proof nobody runs is not a proof: seven had rotted that way.
- The job queue contract is generated. `apps/web/src/server/job-queue-manifest.ts`
  is the only place that declares a kind; `pnpm queue:contract:build` writes
  `contracts/job-queue/job-queue.contract.v1.json` and
  `services/matching/app/job_queue_contract.py`. Never hand-edit either, the
  same way `src/db/generated.ts` is never hand-edited.
- `.github/workflows/release-health.yml` fails once a day when the newest
  matching image release on `main` did not succeed. That workflow runs after
  merge, so it can never be a required check — this is the signal instead.
- Do not name a Done Linear issue in a PR title or body; the GitHub
  integration reopens it. Describe the work instead.
- Read-only commands against production are fine; anything that changes
  production data, schema, or provider state needs one explicit approval each.
  For SDD Slice 24 (ADR-0026) the owner gave those approvals in advance on
  2026-09-05; `docs/ORGANISM_GRAPH_EXECUTION.md` records the scope and the
  technical gates that still apply.
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
  choice, and a sign-in are made of. `docs/adr/ADR-0025-stable-registry-retired.md` —
  the Stable Registry release model and the Release Center are retired; the EPPO
  observed capture and every table holding EPPO data stay.
  `docs/adr/ADR-0026-organism-knowledge-graph.md` — the organism knowledge
  graph: one canonical card per organism over the source layer, Catalogue of
  Life as backbone, a curation queue that never blocks a gardener (SDD Slice 24).
  `docs/adr/ADR-0027-owner-health-page-retired.md` — the owner's `/health`
  diagnostics page is retired and the route answers 404 for everyone;
  `/api/health` stays as the monitor endpoint.
  `docs/adr/ADR-0028-notion-shaped-composer.md` — the composer takes Notion's
  shape and `JournalDocumentV1` grows Notion's basic blocks, additively, at
  schema version 1 and with no SQL; it supersedes the closed node and mark
  lists of ADR-0015 and nothing else there.
  `docs/adr/ADR-0029-address-law.md` — one permanent address per public thing,
  one rule per question: the permalink and the name, 200/308/404 decided in the
  proxy, every address ASCII (amended 2026-09-18: a journal entry is
  `/@{handle}/post/{n}`, numbered per author and never reused; object passports,
  topics and communities take Latin names; every older address answers one
  308), a slug budget measured after percent-encoding, a collision counter
  instead of a hash, and a locale prefix only where a translation of the main
  content exists. Feeds are never filtered or badged by language. Supersedes
  ADR-0026 D8 and the addressing half of D9, and the addressing sections of
  `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`.
  `docs/adr/ADR-0030-editorial-pipeline-in-overgarden.md` — the editorial
  pipeline that drafts news and blog articles from the owner's chosen sources
  is built inside OverGarden, for OverGarden only: no separate product, no
  bought service, one reading per piece written separately into `uk`, `bg` and
  `ru`, a human press to publish, and internal links placed by a deterministic
  linker over a resolved candidate set with a mention registry on the cards.
  ADR-0026 D9 is unchanged — an editorial mention does not make a card
  indexable.
  `docs/ADDRESS_LAW_EXECUTION.md` — the executor's runbook for ADR-0029: the
  sixteen tasks in order (`OVE-419`–`OVE-434`), what each must prove, and the
  traps that do not fit an issue body.
  `docs/ORGANISM_GRAPH_EXECUTION.md` — the executor's runbook for that slice:
  the owner's standing authorization, environment quirks, production
  procedures, hand-offs between the fourteen tasks.
  `docs/adr/ADR-0031-design-system-and-redesign.md` — one design system and the
  redesign that delivers it: two token layers, a real component library, a
  three-column shell, light theme only, and WCAG 2.2 AA as a build gate.
  `docs/adr/ADR-0032-static-public-documents.md` — **read before adding or
  changing a public page.** A public page is a static document: its content is
  in the served bytes, outside every `<div hidden>`, and only who is reading
  arrives at request time. It says why a page may not read `searchParams` or
  the session, why a query string renders from a twin under `/q`, why a static
  page has no `loading.tsx` above it, why a failed read is never prerendered,
  and why nothing above a page may change by itself — what the chrome learns
  late lives in a store, never in a context value (D10). Its D8 is the recipe
  for converting a page family; `tests/static-documents.spec.ts` is the gate.
  `DESIGN.md` — **read before changing any interface.** It is authoritative for
  tokens, components, layout, patterns, accessibility and content, and its §10
  rules are enforced in CI rather than reviewed.
  `docs/TECH_STACK_DECISIONS.md` — stack detail and ADR index.
- `docs/INFRASTRUCTURE_REGISTRY.md` — provider IDs, buckets, domains, env.
- `docs/PRODUCTION_SCHEMA_STATE.md` — which migrations the production database
  actually runs, and how to check before assuming.
- `docs/MEDIA_LIFECYCLE.md`, `docs/ONLINE_ONLY_JOURNAL.md`,
  `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`, `docs/ADMIN_ROLE_BOOTSTRAP.md`,
  `docs/MIGRATION_ALLOCATION.md` — current behaviour of each area.
  `docs/STABLE_REGISTRY*.md` are history (ADR-0025); `docs/EPPO_*.md` describe
  the retained capture and are the only registry-era documents still executable.
- `docs/product-research/` — product research, written before the code existed.
  Read `docs/product-research/PRODUCT_CANON_2026-09.md` first: it states what the
  product is today and outranks every other file there. Then read the two to five
  files relevant to a user-facing change. Every file carries a dated status header;
  `SUPERSEDED_DECISIONS_LEDGER.md` lists the research decisions the product cancelled
  and what replaced them. The corpus never overrides this page or the ADRs.
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/runbooks/`,
  `docs/audit-inbox/`, `docs/reviews/`, `docs/linear/`, `docs/superpowers/` —
  historical receipts. Dated plans and specs in `docs/superpowers/` were executed
  long ago; never pick one up as work to do.
- `apps/web/AGENTS.md` — the Next.js version notice; read the framework docs
  in `node_modules/next/dist/docs/` before using an API from memory.
