# OVE-175 Public Living-Object Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest browse evidence-backed plant, animal, and bee-colony identities from `/objects`, then continue to a real public object passport, journal, species, variety, or breed aggregation without authentication.

**Architecture:** Add one public-safe Kysely read model over eligible published journal evidence and its living objects. Render that model through localized SSR browse routes with URL-owned filters/search/page state, and reuse one catalog-kind-aware evidence renderer for variety, species, and breed routes. Extend the deterministic OVE-187 manifest with real catalog rows and stable edge-state URLs rather than frontend-only mock data.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Kysely/Postgres, shadcn primitives, lucide-react, Vitest, Browser plugin.

## Global Constraints

- Guest reads never require a session; mutation-time auth remains owned by OVE-174.
- Every public query requires public, active, published, non-gone journal evidence and owner/object consistency.
- Exact location, owner IDs, private records, raw source payloads, restricted source fields, unsafe contact-like identity text, and media storage keys never enter the public view model.
- Unknown, provisional, and unavailable identities remain visibly non-authoritative.
- Public catalog browse and thin catalog evidence remain `noindex` until the centralized policy promotes the deep aggregation.
- Plant, animal, and bee-colony labels share one architecture without relabeling animal behavior as plant behavior.
- All new fixture rows remain deterministic, clearly synthetic, non-production-only, idempotent, and exact-namespace resettable.

---

### Task 1: Public catalog request and repository contract

**Files:**

- Create: `apps/web/src/server/public-object-catalog-repository.ts`
- Create: `apps/web/src/server/public-object-catalog-repository.test.ts`

**Interfaces:**

- Produces: `normalizePublicObjectCatalogRequest(input): PublicObjectCatalogRequest`
- Produces: `listPublicObjectCatalogPage(request, locale, executor?): Promise<PublicObjectCatalogPage>`
- Produces: `buildPublicObjectCatalogGroupsQuery(executor, request)` for privacy-contract tests.

- [ ] **Step 1: Write failing normalization tests** for allowlisted `kind`, `identity`, bounded `q`, and positive `page`; invalid values must fall back without preserving attacker-controlled state.
- [ ] **Step 2: Run `pnpm test -- src/server/public-object-catalog-repository.test.ts`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the typed request contract** with `kind = all | plant | animal | bee_colony`, `identity = all | plant_variety | species | breed | provisional | unknown | unavailable`, `page >= 1`, and a normalized 120-character query.
- [ ] **Step 4: Write failing SQL-contract tests** proving public/active/published/non-gone predicates, object-owner equality, derivative-only media, catalog allowlisting, and absence of private/location/source-only fields.
- [ ] **Step 5: Implement the grouped evidence query** with stable ordering, `PUBLIC_OBJECT_CATALOG_PAGE_SIZE + 1`, aggregate-safe object/journal counts, representative object/journal paths, and catalog/provisional/unknown/unavailable classification.
- [ ] **Step 6: Add serialization tests** for long names, no image, portrait/landscape image URLs, zero/one/many journals, and contact-like provisional labels becoming Unknown.
- [ ] **Step 7: Run the focused repository test** and keep it green.

### Task 2: Localized catalog UI and URL-owned interaction state

**Files:**

- Create: `apps/web/src/lib/public-object-catalog-copy.ts`
- Create: `apps/web/src/lib/public-object-catalog-copy.test.ts`
- Create: `apps/web/src/components/public/public-object-catalog.tsx`
- Create: `apps/web/src/components/public/public-object-catalog.test.tsx`
- Create: `apps/web/src/components/public/public-object-catalog-search.tsx`
- Create: `apps/web/src/app/objects/page.tsx`
- Create: `apps/web/src/app/objects/page.test.tsx`
- Create: `apps/web/src/app/objects/loading.tsx`
- Create: `apps/web/src/app/[locale]/objects/page.tsx`
- Create: `apps/web/src/app/[locale]/objects/loading.tsx`
- Create: `apps/web/src/app/api/public/objects/suggestions/route.ts`
- Create: `apps/web/src/app/api/public/objects/suggestions/route.test.ts`
- Modify: `apps/web/src/proxy.ts`

**Interfaces:**

- Consumes: `PublicObjectCatalogPage` and `PublicObjectCatalogRequest` from Task 1.
- Produces: `buildPublicObjectCatalogHref(locale, request)` and an SSR `PublicObjectCatalog` surface.

- [ ] **Step 1: Write failing copy and component tests** for all three locales, domain-specific kind/identity labels, breadcrumb hierarchy, edge-state copy, long-label wrapping, and links to real evidence.
- [ ] **Step 2: Implement localized copy and SSR catalog composition** with compact kind tabs, identity filters, GET search, active-filter reset, evidence cards, previous/next pagination, empty/error/loading states, and route-owned context modules.
- [ ] **Step 3: Write failing suggestion-route tests** proving two-character minimum, bounded output, no auth requirement, and the same public-safe repository boundary.
- [ ] **Step 4: Implement an accessible debounced combobox** that links suggestions to the real evidence route while the GET form remains functional without JavaScript.
- [ ] **Step 5: Implement canonical Ukrainian plus `/bg/objects` and `/ru/objects` wrappers**, localized metadata/hreflang, central `noindex`, and proxy redirects for persisted non-Ukrainian locale.
- [ ] **Step 6: Run focused route/component/copy/API tests** and keep them green.

### Task 3: Catalog-kind-aware deep evidence routes

**Files:**

- Modify: `apps/web/src/lib/garden/public-paths.ts`
- Modify: `apps/web/src/lib/garden/public-paths.test.ts`
- Modify: `apps/web/src/server/public-variety-repository.ts`
- Modify: `apps/web/src/server/public-variety-repository.test.ts`
- Modify: `apps/web/src/server/public-variety-metadata.ts`
- Modify: `apps/web/src/server/public-variety-metadata.test.ts`
- Create: `apps/web/src/components/public/public-catalog-evidence-page.tsx`
- Modify: `apps/web/src/app/variety/[slug]/page.tsx`
- Create: `apps/web/src/app/species/[slug]/page.tsx`
- Create: `apps/web/src/app/breed/[slug]/page.tsx`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/sitemap.test.ts`

**Interfaces:**

- Produces: `publicCatalogEvidencePath(catalogKind, slug)` mapping `plant_variety -> /variety`, `species -> /species`, and `breed -> /breed`.
- Extends: `PublicVarietyPage.catalog.catalogKind` and sitemap rows with `catalogKind`.

- [ ] **Step 1: Write failing path/repository/metadata tests** for all three catalog kinds and wrong-kind 404 behavior.
- [ ] **Step 2: Add catalog kind to the public aggregation contract** without exposing raw source fields or weakening existing public-entry predicates.
- [ ] **Step 3: Extract one shared evidence renderer** whose labels and CTA are catalog-kind-aware; keep wishlist/engagement semantics limited to surfaces whose existing contracts support them.
- [ ] **Step 4: Add species and breed route wrappers** and make `/variety/[slug]` reject non-variety rows.
- [ ] **Step 5: Route JSON-LD canonical URLs and sitemap URLs through `publicCatalogEvidencePath`** while preserving the centralized threshold policy.
- [ ] **Step 6: Run focused deep-route, metadata, path, repository, and sitemap tests.**

### Task 4: Deterministic OVE-175 fixture extension

**Files:**

- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Modify: `apps/web/src/server/visual-fixtures/repository.ts`
- Modify: `apps/web/src/server/visual-fixtures/repository.test.ts`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.tsx`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.test.tsx`
- Create: `apps/web/src/lib/visual-fixtures/public-object-catalog-scenarios.ts`
- Create: `apps/web/src/lib/visual-fixtures/public-object-catalog-scenarios.test.ts`
- Modify: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`

**Interfaces:**

- Extends: `VisualFixtureManifest.catalogEvidence` with exact catalog item/name IDs and stable browse scenarios.
- Extends: fixture status counts with `catalogItems` and `catalogNames`.

- [ ] **Step 1: Write failing manifest tests** for plant/animal/bee species, plant varieties, animal/bee breeds, aliases, unavailable identity, page-size-minus-one, page-size, page-size-plus-one, empty, combined-filter, reset, loading, and error URLs.
- [ ] **Step 2: Add clearly synthetic `visual_fixture` catalog rows and aliases** and bind them to existing public fixture objects without changing the 30-object/80-entry baseline.
- [ ] **Step 3: Extend seed/reset/status queries** in foreign-key-safe order and prove exact IDs only; no production search, source snapshots, analytics, or notifications.
- [ ] **Step 4: Add stable catalog routes to the fixture index and scenario resolver**; production and disabled-fixture environments must ignore state-forcing parameters.
- [ ] **Step 5: Update the runbook and run focused fixture tests.**

### Task 5: Project status and full verification

**Files:**

- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

- [ ] **Step 1: Record the shipped OVE-175 behavior and fixture extension** without marking later Slice 18 work complete.
- [ ] **Step 2: Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm visual:fixtures:verify`, `pnpm mainline:closeout:check`, and `git diff --check`.**
- [ ] **Step 3: Run browser QA** on desktop and 320px for all kinds, nested identities, search/typeahead, combined/zero-result filters, reset, pagination, long labels, no-media and mixed-aspect media, loading/error, guest and authenticated shell states, 404, and deep evidence links.
- [ ] **Step 4: Capture Drive2 reference, OverGarden before, desktop after, mobile after, and matched side-by-side screenshots.**

### Task 6: Mainline and Linear closeout

- [ ] **Step 1: Review the complete diff and rerun the final verification gate.**
- [ ] **Step 2: Commit with a Conventional Commit message and push `main`.**
- [ ] **Step 3: Verify exact-SHA GitHub CI, Vercel `READY`, and redacted live smoke on `https://over.garden`.**
- [ ] **Step 4: Attach visual evidence and a mainline closeout comment to OVE-175.**
- [ ] **Step 5: Move OVE-175 to `Done` only after all failure gates are closed.**
