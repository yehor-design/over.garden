# OVE-180 Gardener Profile V2 Implementation Plan

> **For agentic workers:** implement each task with red-green tests and verify
> the complete vertical slice before closeout.

**Goal:** Ship an object-first, public-safe gardener profile with exact owner
preview, real profile actions, deterministic edge states, and Drive2-like IA.

**Architecture:** Add bounded profile fields and scoped relationship tables to
the SQL source of truth; expose separate public and owner repositories; render
one localized profile presentation inside SiteShell; extend the fixture corpus
and verifier through the same production loaders.

**Tech stack:** Next.js App Router, React Server Components and server actions,
TypeScript, Kysely/Postgres, shadcn/ui primitives, Vitest, Browser/Playwright.

## Global constraints

- No exact location, email, auth provider, private object, draft, raw media key,
  moderation evidence, or relationship identity in public profile readback.
- Public and owner contracts remain separate; profile pages stay noindex.
- Guest reading stays open; follow/report/block mutations use OVE-174 intent.
- No dead controls, direct messages, public reputation score, or leaderboard.
- OVE-183 owns downstream followed feed and notification integration.

### Task 1: Profile schema and validation contracts

- [x] Write failing SQL/type tests for bounded bio/languages/coarse region,
      visibility/lifecycle settings, processed avatar ownership, and scoped
      follow/block/report tables.
- [x] Add additive, repeatable SQL plus indexes, checks, foreign keys, and
      generated Kysely types.
- [x] Run schema tests, `pnpm local:bootstrap`, and `pnpm db:types`.

### Task 2: Public and owner profile repositories

- [x] Write failing query/serializer tests for public object/journal/media
      evidence, exact predicates, aggregate kinds, allowed relationship counts,
      viewer block state, and forbidden fields.
- [x] Implement the bounded public loader and hard lifecycle lookup.
- [x] Implement the scoped owner editor/preview loader and profile update
      validation without sharing owner fields with the public model.

### Task 3: Profile actions and auth intent

- [x] Write failing tests for localized profile return targets, profile follow,
      report, block, unfollow, and owner unblock.
- [x] Extend the OVE-174 target/action matrix for profile mutations.
- [x] Implement idempotent scoped mutations and server actions; remove follows
      in both directions inside the block transaction.

### Task 4: Localized object-first profile UI

- [x] Write failing component and route tests for object-first ordering, dense
      disclosures, empty recovery, long strings, safe avatar/region/languages,
      viewer actions, mobile safety controls, owner preview, and noindex metadata.
- [x] Add the dedicated localized copy contract and shared profile component.
- [x] Rebuild localized public routes and `/garden/profile` inside SiteShell.
- [x] Add generic hard profile `404` handling to proxy.

### Task 5: Deterministic profile fixtures

- [x] Write failing manifest/seed/reset/evidence tests for six profile
      archetypes, exact public IDs/counts, relationship counts, blocked/private
      outcomes, raster/fallback avatar, long copy, and dense thresholds.
- [x] Version and extend the manifest, repository, fixture index, status counts,
      machine verifier, and environment documentation.
- [x] Run the focused fixture suite and full `pnpm visual:fixtures:verify`.

### Task 6: Verification and visual gate

- [x] Run focused tests after each red-green cycle.
- [x] Run Prettier check, `git diff --check`, full tests, lint, typecheck,
      production build, DB type check, privacy sweeps, and mainline closeout.
- [x] Run Browser QA at 1280 desktop, 390px, and 320px for guest/non-owner/
      owner/blocked/private plus all profile archetypes and locales.
- [x] Capture Drive2 reference, exact OverGarden before, desktop/mobile after,
      owner, blocked/private, and matched side-by-side evidence.

### Task 7: Mainline and Linear closeout

- [ ] Commit the verified vertical slice with a Conventional Commit.
- [ ] Push `main`, verify exact-SHA CI and production deployment, and run
      redacted live smoke without fixture identities or private content.
- [x] Attach the complete screenshot gate to OVE-180.
- [ ] Add the mainline closeout comment and move OVE-180 to Done only after
      every failure gate is clear.
