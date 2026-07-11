# OVE-176 Public Journal Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest search and filter real public living-object journals from `/journals`, retain that discovery state through entry navigation, and continue reading without authentication.

**Architecture:** Add one canonical Postgres read model over public, active, published, non-gone object journals. A bounded Meilisearch query may provide relevance hints, but Postgres always revalidates and renders every result; unavailable or stale search data therefore cannot leak content or make the directory unusable. Render the model through localized SSR routes with URL-owned filters, deterministic pagination, route-owned context modules, and OVE-187 fixture evidence.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Kysely/Postgres, Meilisearch, shadcn primitives, lucide-react, Vitest, Browser plugin.

## Global Constraints

- Guest reads and filters never require a session or trigger an auth prompt.
- Every rendered row requires public, active, published, non-gone journal state plus owner/object/space consistency.
- Meilisearch is derived relevance input only; its title, body, location, media, author, or object fields are never rendered.
- Exact location, hidden-region values, emails, owner IDs, internal IDs, private text, media storage keys, and raw search documents never enter result HTML.
- Query, kind, catalog, topic, season, region, sort, and page inputs are allowlisted and bounded in URL state.
- Public UGC directory metadata remains `noindex` until the central quality policy explicitly promotes it.
- Fixture scenarios use real seeded rows and the real repository; frontend mocks are limited to gated loading/error compositions.

---

### Task 1: Canonical journal directory read model

**Files:**

- Create: `apps/web/src/server/public-journal-directory-repository.ts`
- Create: `apps/web/src/server/public-journal-directory-repository.test.ts`
- Create: `apps/web/src/server/search/public-journal-directory-search.ts`
- Create: `apps/web/src/server/search/public-journal-directory-search.test.ts`

**Interfaces:**

- Produces: `normalizePublicJournalDirectoryRequest(input): PublicJournalDirectoryRequest`.
- Produces: `listPublicJournalDirectoryPage(request, locale, executor?, searchHints?): Promise<PublicJournalDirectoryPage>`.
- Produces: `listPublicJournalDirectoryFacets(executor?): Promise<PublicJournalDirectoryFacets>`.
- Produces: `searchPublicJournalDirectoryCandidates(query): Promise<string[] | null>`.

- [ ] **Step 1: Write failing normalization tests** for bounded query, allowlisted kind/topic/catalog/season/region/sort, positive page, and rejection of contact/coordinate-like search input.
- [ ] **Step 2: Run the focused tests** and confirm failure because the repository module does not exist.
- [ ] **Step 3: Implement the request contract** with eight-result pages and canonical defaults.
- [ ] **Step 4: Write failing SQL and serialization tests** proving public/active/published/non-gone predicates, owner/object/space consistency, safe region visibility, derivative-only media, trusted topic membership, catalog allowlisting, deterministic sort/page behavior, and no internal/private fields in rendered cards.
- [ ] **Step 5: Implement the DB query, facet queries, and card serializer** with title/body/object/catalog/topic matching and season/coarse-region filters.
- [ ] **Step 6: Write and pass Meilisearch hint tests** that retrieve UUIDs only, bound hit counts, reject malformed hits, and degrade to `null` on unavailability.

### Task 2: Localized SSR directory and retained navigation state

**Files:**

- Create: `apps/web/src/lib/public-journal-directory-copy.ts`
- Create: `apps/web/src/lib/public-journal-directory-copy.test.ts`
- Create: `apps/web/src/components/public/public-journal-directory.tsx`
- Create: `apps/web/src/components/public/public-journal-directory.test.tsx`
- Create: `apps/web/src/app/journals/page.tsx`
- Create: `apps/web/src/app/journals/page.test.tsx`
- Create: `apps/web/src/app/journals/loading.tsx`
- Create: `apps/web/src/app/[locale]/journals/page.tsx`
- Create: `apps/web/src/app/[locale]/journals/loading.tsx`
- Modify: `apps/web/src/app/journal/[slug]/route.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.test.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.test.ts`
- Modify: `apps/web/src/lib/public-surface-localization.ts`

**Interfaces:**

- Produces: `buildPublicJournalDirectoryHref(locale, request)` with stable parameter ordering.
- Produces: an SSR `PublicJournalDirectory` with search, explicit filters, active-filter removal, reset, count, load-more pagination, loading, empty, exhausted, and recoverable error states.
- Extends: public journal detail navigation with an allowlisted `from` path back to the exact directory query.

- [ ] **Step 1: Write failing localized copy/component tests** for all filters, active chips, result context, no/one/gallery media, pagination, empty/error/loading states, long text, and zero guest auth prompts.
- [ ] **Step 2: Implement the localized directory composition** as one dense result list with native accessible GET controls and route-owned context rail modules.
- [ ] **Step 3: Write failing route tests** for canonical Ukrainian and prefixed Bulgarian/Russian pages, metadata/hreflang, repository failure, fixture states, and persisted-locale redirect.
- [ ] **Step 4: Implement route wrappers and loading boundaries** under the shared shell and central noindex policy.
- [ ] **Step 5: Add an allowlisted `from` contract to journal detail** and render a localized back link without changing canonical URLs or engagement return paths.

### Task 3: Deterministic OVE-176 fixture evidence

**Files:**

- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Create: `apps/web/src/lib/visual-fixtures/public-journal-directory-scenarios.ts`
- Create: `apps/web/src/lib/visual-fixtures/public-journal-directory-scenarios.test.ts`
- Modify: `apps/web/src/lib/visual-fixtures/command.ts`
- Modify: `apps/web/src/lib/visual-fixtures/command.test.ts`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.tsx`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.test.tsx`
- Modify: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`

**Interfaces:**

- Extends: `VisualFixtureManifest.journalDirectoryEvidence` with stable URLs, expected ordered entry IDs, expected counts, authored locales, and page-size boundaries.
- Extends: fixture verification with real repository comparisons after deterministic seed.

- [ ] **Step 1: Write failing manifest/scenario tests** for plant/animal/bee entries, three authored locales, safe/hidden region states, multiple catalog identities/topics/problems/seasons, page-size-minus-one/exact/plus-one, two full pages, no result, reset, loading, error, and exhausted URLs.
- [ ] **Step 2: Add natural curated topic/problem memberships** over existing deterministic journal rows without adding mock-only domain data.
- [ ] **Step 3: Record exact ordered IDs/counts and validate every evidence URL** against the fixture manifest.
- [ ] **Step 4: Make `visual:fixtures:verify` execute the real directory repository** and fail when ordering, counts, filtering, or privacy eligibility diverges.
- [ ] **Step 5: Expose the scenarios on the fixture index and update the operator runbook.**

### Task 4: Full verification and visual gate

**Files:**

- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

- [ ] **Step 1: Record OVE-176 behavior and fixture coverage** without marking OVE-177 or later slices complete.
- [ ] **Step 2: Run focused tests, Python search tests, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm visual:fixtures:verify`, `pnpm mainline:closeout:check`, and `git diff --check`.**
- [ ] **Step 3: Run Browser QA** on desktop and 320px for default, single/combined filters, query/reset, no result, pagination/exhaustion, loading/error, retained detail/back state, guest/auth shell, and privacy/console/overflow checks.
- [ ] **Step 4: Capture matched Drive2 reference, OverGarden before, desktop after, mobile after, and side-by-side evidence.**

### Task 5: Mainline and Linear closeout

- [ ] **Step 1: Review the complete diff and rerun the final verification gate.**
- [ ] **Step 2: Commit with a Conventional Commit message and push `main`.**
- [ ] **Step 3: Verify exact-SHA GitHub CI, Vercel `READY`, and live `/journals` smoke on `https://over.garden`.**
- [ ] **Step 4: Attach visual evidence and a closeout comment to OVE-176.**
- [ ] **Step 5: Move OVE-176 to `Done` only after every failure gate is closed.**
