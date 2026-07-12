# OVE-177 Knowledge Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest move from `/knowledge` through a trusted guide, answer, or curated topic into explainably related public journal and living-object evidence without authentication.

**Architecture:** Keep authored knowledge in the existing canonical content source, add explicit topic/catalog evidence rules, and resolve related evidence through one bounded Postgres contract that reuses the public journal serializer. Add a curated topic read model with the central thinness/trust policy, localized SSR routes, route-owned context rails, and a fail-closed OVE-187 corpus for dense, sparse, empty, loading, error, and unavailable visual states.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Kysely/Postgres, shadcn primitives, lucide-react, Vitest, Playwright CLI, Linear and Vercel closeout tooling.

## Global Constraints

- Guest knowledge, guide, answer, topic, journal, catalog, object, and back-navigation reads never require a session.
- Editorial claims and user-authored evidence are labeled and rendered as separate trust states.
- Every related result is explainable by allowlisted topic or catalog links; object kind may classify content but never silently rank evidence.
- Related journal rows remain public, active, object-scoped, published, non-gone, owner-consistent, derivative-only, and exact-location-free.
- Draft authored content, private/archived/gone UGC, hidden-region values, owner IDs, emails, internal storage keys, and raw search documents never enter public HTML.
- The central public-surface policy controls robots and sitemap eligibility; localized UGC projections do not claim translated hreflang content.
- Synthetic knowledge copy and media remain gated to validated local/preview fixture environments and never become production expertise or SEO corpus.

---

### Task 1: Authored knowledge contract and deterministic evidence rules

**Files:**

- Modify: `apps/web/src/server/public-seo-content.ts`
- Modify: `apps/web/src/server/public-localized-content.ts`
- Create: `apps/web/src/lib/public-knowledge-content.ts`
- Create: `apps/web/src/lib/public-knowledge-content.test.ts`
- Create: `apps/web/src/lib/public-knowledge-copy.ts`
- Create: `apps/web/src/lib/public-knowledge-copy.test.ts`

**Interfaces:**

- Produces: `PublicKnowledgeFacet`, `PublicKnowledgeEditorialMeta`, and explicit `PublicKnowledgeEvidenceRule` fields for guide/answer content.
- Produces: localized production content and gated synthetic fixture content through one read-only adapter.
- Produces: bounded URL-owned hub filters for query, content type, and object kind.

- [x] **Step 1: Write failing tests** for allowlisted knowledge filters, explicit evidence rules, editorial metadata, localized copy, authored-language preservation, and production rejection of fixture content.
- [x] **Step 2: Run focused tests** and confirm failure because the knowledge contracts do not exist.
- [x] **Step 3: Implement the minimal content/copy adapters** while preserving existing authored guide and answer content and JSON-LD inputs.
- [x] **Step 4: Run the focused tests** and keep production content independent from visual fixture imports until gated resolution.

### Task 2: Public-safe related evidence and curated topic policy

**Files:**

- Create: `apps/web/src/server/public-knowledge-evidence-repository.ts`
- Create: `apps/web/src/server/public-knowledge-evidence-repository.test.ts`
- Modify: `apps/web/src/server/public-journal-directory-query.ts`
- Modify: `apps/web/src/server/public-journal-directory-repository.ts`
- Modify: `apps/web/src/server/public-journal-directory-repository.test.ts`
- Modify: `apps/web/src/server/public-topic-repository.ts`
- Modify: `apps/web/src/server/public-topic-repository.test.ts`
- Modify: `apps/web/src/server/public-surface-indexing-policy.ts`
- Modify: `apps/web/src/server/public-surface-indexing-policy.test.ts`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/sitemap.test.ts`

**Interfaces:**

- Produces: `listPublicKnowledgeEvidence(rule, locale, options): Promise<PublicKnowledgeEvidence>` with bounded journal cards, object links, match explanations, total count, and DB-only fallback.
- Produces: `listPublicKnowledgeTopics(options)` and hardened `getPublicTopicAggregationPage(slug, options)` with zero/sparse/dense states and exact policy input.
- Extends: journal cards with safe public object and catalog identifiers required for evidence navigation.

- [x] **Step 1: Write failing repository tests** for explicit topic/catalog OR matching, bounded output, deterministic ordering, public/active/published/non-gone predicates, owner consistency, accepted/eligible curated membership, fixture restriction, and no exact/private fields.
- [x] **Step 2: Implement the evidence query and safe serializer reuse** without rendering Meilisearch or private data.
- [x] **Step 3: Write failing topic/policy/sitemap tests** for zero, one, dense, mixed-kind, trusted/untrusted, body threshold, latest safe publication, Ukrainian canonical indexing, and localized UGC noindex behavior.
- [x] **Step 4: Implement the curated topic list/detail and sitemap contracts** through the central policy.

### Task 3: Localized hub, article, and topic routes

**Files:**

- Create: `apps/web/src/components/public/public-knowledge-hub.tsx`
- Create: `apps/web/src/components/public/public-knowledge-hub.test.tsx`
- Create: `apps/web/src/components/public/public-knowledge-evidence.tsx`
- Create: `apps/web/src/components/public/public-knowledge-evidence.test.tsx`
- Modify: `apps/web/src/components/public/localized-public-pages.tsx`
- Modify: `apps/web/src/components/public/localized-public-pages.test.tsx`
- Create: `apps/web/src/app/knowledge/page.tsx`
- Create: `apps/web/src/app/knowledge/page.test.tsx`
- Create: `apps/web/src/app/knowledge/loading.tsx`
- Create: `apps/web/src/app/[locale]/knowledge/page.tsx`
- Create: `apps/web/src/app/[locale]/knowledge/loading.tsx`
- Modify: `apps/web/src/app/guides/[slug]/page.tsx`
- Modify: `apps/web/src/app/[locale]/guides/[slug]/page.tsx`
- Modify: `apps/web/src/app/answers/[slug]/page.tsx`
- Modify: `apps/web/src/app/[locale]/answers/[slug]/page.tsx`
- Create: `apps/web/src/app/topics/[slug]/page.tsx`
- Create: `apps/web/src/app/topics/[slug]/page.test.tsx`
- Create: `apps/web/src/app/[locale]/topics/[slug]/page.tsx`
- Modify: `apps/web/src/lib/site-shell-navigation.ts`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`

**Interfaces:**

- Produces: a dense SSR hub with query/type/kind filters, counts, authored/trusted-topic modules, reset, empty/loading/error states, and route-owned context rail.
- Produces: guide/answer pages with explicit editorial metadata, hierarchy, optional derivative media, related evidence, honest empty/error states, and exact back paths.
- Produces: curated topic pages with visible indexing state, mixed-kind public evidence, and localized route chrome.

- [x] **Step 1: Write failing component tests** for scan density, trust labels, filters, long Cyrillic copy, responsive controls, right rail, no nested cards, and zero auth prompts.
- [x] **Step 2: Implement the hub and shared evidence list** using semantic GET controls and public-safe links.
- [x] **Step 3: Write failing route/metadata tests** for Ukrainian, Bulgarian, Russian, missing/unavailable content, policy robots, canonical paths, and guest/auth shell parity.
- [x] **Step 4: Implement route wrappers and article/topic compositions** while retaining answer JSON-LD only for visible authored answer text.

### Task 4: Deterministic OVE-177 fixture evidence

**Files:**

- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Create: `apps/web/src/lib/visual-fixtures/public-knowledge-scenarios.ts`
- Create: `apps/web/src/lib/visual-fixtures/public-knowledge-scenarios.test.ts`
- Modify: `apps/web/src/lib/visual-fixtures/command.ts`
- Modify: `apps/web/src/lib/visual-fixtures/command.test.ts`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.test.tsx`
- Modify: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`

**Interfaces:**

- Extends: `VisualFixtureManifest.knowledgeEvidence` with three guides, three answers, at least four topics, exact evidence rule/count/entry/object IDs, author/source metadata, dates, optional media, and visible-threshold states.
- Extends: the scenario inventory with hub default/filter/zero/loading/error, guide dense/empty, answer long/unavailable, and topic zero/one/dense routes.

- [x] **Step 1: Write failing manifest/scenario tests** for every required OVE-177 state and production fail-closed behavior.
- [x] **Step 2: Add natural synthetic Cyrillic content** with explicit non-production source labels, multi-paragraph/list/callout density, one processed-media link, and no fake expert claim.
- [x] **Step 3: Add one-entry and zero-entry topic states** while preserving mixed plant/animal/bee dense evidence and exact journal-directory contracts.
- [x] **Step 4: Verify every expected entry/object ID through the real evidence repository** and expose the routes on the fixture index.

### Task 5: Full verification, mainline, and Linear closeout

**Files:**

- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

- [x] **Step 1: Record OVE-177 behavior and fixture coverage** without marking later Slice 18 work complete.
- [x] **Step 2: Run focused tests, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, Python tests, `pnpm visual:fixtures:verify`, `pnpm mainline:closeout:check`, and `git diff --check`.**
- [x] **Step 3: Run guest and authenticated Playwright QA** on desktop and 320px across hub filters, guide/answer/topic evidence, zero/loading/error/unavailable, detail/back, no-auth, console, overflow, and privacy checks.
- [x] **Step 4: Capture Drive2 reference, exact previous-production before, desktop after, mobile after, and matched side-by-side evidence.**
- [ ] **Step 5: Commit with a Conventional Commit message, push `main`, and verify exact-SHA GitHub CI, Vercel `READY`, and live canonical/localized knowledge routes.**
- [ ] **Step 6: Attach redacted synthetic visual evidence and a full closeout comment to OVE-177, then move it to `Done` only after every failure gate is closed.**
