# OVE-173 Read-First Home Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the localized marketing-first homepage with a guest-open, repository-backed feed of public living-object journals that supports explicit filters, stable pagination, safe context modules, and deterministic visual states.

**Architecture:** A dedicated public-feed repository owns the bounded canonical query, privacy-minimized serialization, trusted-topic projection, derivative-only media lookup, and cursor contract. The localized homepage remains server-rendered and URL-driven; a small route registration supplies its safe topic/knowledge modules to the existing shell context rail without making the global shell query route data. OVE-187's manifest gains real topic memberships, feed scenarios, and a gallery entry so every visual state is rendered through production routes and repositories.

**Tech Stack:** Next.js 16 App Router, React 19 server/client components, TypeScript, Kysely/Postgres, Tailwind CSS v4, Shadcn compositions, Lucide, Vitest, deterministic OVE-187 fixtures, and browser QA.

## Global Constraints

- Guest reading, filtering, paging, and opening a journal, object, or profile never require authentication.
- The response contains only active published entries, public object/profile fields, accepted curated topics, valid coarse-region codes when explicitly allowed, and processed derivative media URLs.
- Drafts, private/archived/gone content, emails, owner IDs/counts, exact location, moderation data, quarantine/raw media keys, tokens, and mutation IDs never enter the public view model.
- Ranking is explicit recency plus deterministic ID tie-break; no popularity score or opaque recommendation layer.
- Ukrainian remains the unprefixed canonical homepage; Bulgarian and Russian use `/bg` and `/ru`, with localized chrome and unchanged centralized indexing policy.
- Fixture-only state forcing is accepted only when the existing fail-closed visual-fixture environment contract is active and is ignored in Production.
- Reference screenshots remain local/Linear evidence and are not committed.

---

### Task 1: Public Feed Contract And Privacy Boundary

**Files:**

- Create: `apps/web/src/server/public-feed-repository.ts`
- Create: `apps/web/src/server/public-feed-repository.test.ts`

**Produces:** `listPublicFeedPage`, `listTrustedPublicFeedTopics`, public-feed filter normalization, stable opaque cursor encode/decode, and minimized `PublicFeedPage`/`PublicFeedEntry` types.

- [x] Write failing tests for canonical public predicates, object-kind and trusted-topic filters, stable cursor ordering, bounded page size/media/topic queries, invalid cursor recovery, and forbidden-field exclusion.
- [x] Run RED with `pnpm exec vitest run src/server/public-feed-repository.test.ts`.
- [x] Implement the minimal Kysely queries and serializers.
- [x] Run GREEN with the same focused command.

### Task 2: Localized Read-First Route And Shell Context

**Files:**

- Create: `apps/web/src/components/public/public-home-feed.tsx`
- Create: `apps/web/src/components/public/public-home-feed.test.tsx`
- Create: `apps/web/src/components/site-shell/site-shell-context-rail.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/components/public/localized-public-pages.tsx`
- Modify: `apps/web/src/server/public-localized-content.ts`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.test.tsx`

**Consumes:** Task 1 public-feed types and loaders.

**Produces:** localized feed header, grouped explicit filters, topic links, mixed-media journal cards, object/author/journal continuation links, honest empty/loading/error/end states, and route-owned desktop context modules with equivalent mobile access.

- [x] Write failing component/route tests for read-first copy, links, filters, safe media, long text, guest/auth variants, empty/error/loading/pagination, canonical metadata, and no auth wall.
- [x] Run RED on the focused route/component/shell tests.
- [x] Implement the smallest server-rendered feed and context registration using existing shell, button, separator, skeleton, and semantic token patterns.
- [x] Run GREEN and preserve all existing locale/root-route assertions.

### Task 3: Deterministic Feed Fixtures

**Files:**

- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Modify: `apps/web/src/server/visual-fixtures/repository.ts`
- Modify: `apps/web/src/server/visual-fixtures/repository.test.ts`
- Modify: `apps/web/src/lib/visual-fixtures/command.test.ts`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.tsx`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.test.tsx`
- Modify: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`

**Produces:** curated topics and accepted memberships, exact one-image and three-image entries, empty/typical/dense/loading/error/context-empty/pagination URLs, and exact-count seed/reset/status coverage.

- [x] Write failing manifest/repository/index tests for every OVE-173 scenario and reverse-order exact-ID cleanup.
- [x] Run RED on focused fixture tests.
- [x] Extend the shared manifest and real Kysely seed/reset/status queries without adding analytics/search/notification writes.
- [x] Run GREEN, seed twice, reset, reseed, and verify deterministic counts/hash.

### Task 4: Full Verification, Visual Gate, And Closeout

**Files:**

- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`
- Update checklist: `docs/superpowers/plans/2026-07-10-ove-173-read-first-home-feed.md`

- [x] Run focused tests, full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, production-like `pnpm build`, fixture verification, and `pnpm mainline:closeout:check`.
- [x] Run guest and authenticated browser smoke on the real seeded homepage, exercise filters/pagination/content links, inspect console/overflow, and verify desktop plus 320px states.
- [x] Compare Drive2 and OverGarden at matched viewports, fix all structural defects, capture redacted evidence, and update status docs/checklist.
- [x] Commit with a Conventional Commit, push `main`, verify remote containment, attach evidence/comment to Linear, and move OVE-173 to Done only after every gate passes.
