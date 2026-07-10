# OVE-187 Visual Demo Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-refusing, deterministic visual-fixture environment that seeds realistic OverGarden users, spaces, objects, journals, and raster media onto real routes and resets only its own namespace.

**Architecture:** A pure environment guard and versioned manifest feed a Kysely repository and S3-compatible fixture media store. CLI commands perform seed/reset/verification, while a development/designated-preview-only Next.js route queries safe manifest status and links real product routes.

**Tech Stack:** Next.js App Router, TypeScript, Kysely, Postgres, AWS S3 client/MinIO, Vitest, shadcn/ui, Lucide, built-in ImageGen raster assets.

## Global Constraints

- No production writes, canonical-production access, query-parameter enablement, real identities, credentials, exact location, analytics, notifications, sitemap entries, or search jobs.
- Stable manifest IDs are the namespace; reset may delete only those exact IDs and media keys.
- Preserve current schema and repository privacy boundaries; do not add a mock domain model or fixture-only product columns.
- Use generated or explicitly reusable EXIF-free raster assets, never remote random placeholders, CSS/SVG stand-ins, Drive2 assets, or Lorem Ipsum.
- Tests precede implementation and each RED failure is observed before GREEN.
- Commit and push only after the complete issue passes every required gate.

---

### Task 1: Environment And Manifest Contracts

**Files:**

- Create: `apps/web/src/lib/visual-fixtures/environment.test.ts`
- Create: `apps/web/src/lib/visual-fixtures/environment.ts`
- Create: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Create: `apps/web/src/lib/visual-fixtures/manifest.ts`

**Interfaces:**

- Produces: `resolveVisualFixtureEnvironment(env): VisualFixtureEnvironment`
- Produces: `VISUAL_FIXTURE_MANIFEST`, `VISUAL_FIXTURE_MANIFEST_HASH`, and typed fixture row/scenario collections.

- [x] Write environment tests for unconditional Production/canonical refusal, disabled/missing values, local loopback/database match, and explicit preview acceptance.
- [x] Run the focused tests and verify RED because the modules do not exist.
- [x] Implement the minimal environment guard and verify GREEN.
- [x] Write manifest tests for 4 actors, 5 spaces, 30 objects with 18/8/4 class split, 80 entries, 16 media assets, threshold-crossing density, multilingual natural copy, stable unique IDs/slugs/keys, no exact-location/credential markers, and a stable hash.
- [x] Run and verify RED before implementing the manifest.
- [x] Implement the manifest and verify GREEN.

### Task 2: Generated Raster Fixture Assets

**Files:**

- Create: `apps/web/test/visual-fixtures/media/*.png`
- Create: `apps/web/test/visual-fixtures/media/README.md`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Test: `apps/web/src/lib/visual-fixtures/manifest.test.ts`

**Interfaces:**

- Consumes: manifest media specifications.
- Produces: 16 stable local image paths, SHA-256 digests, dimensions, aspect labels, alt text, and derivative keys.

- [x] Generate 16 photorealistic plant, animal, and apiary fixture images with the built-in ImageGen tool.
- [x] Copy every selected generated file into the workspace with a stable descriptive filename.
- [x] Add asset metadata/digest expectations to the failing manifest test and observe RED.
- [x] Add the final metadata and README provenance, then verify GREEN.

### Task 3: Namespace-Scoped Repository And Media Store

**Files:**

- Create: `apps/web/src/server/visual-fixtures/repository.test.ts`
- Create: `apps/web/src/server/visual-fixtures/repository.ts`
- Create: `apps/web/src/server/visual-fixtures/media-store.test.ts`
- Create: `apps/web/src/server/visual-fixtures/media-store.ts`

**Interfaces:**

- Produces: `seedVisualFixtures(executor, manifest)` and `resetVisualFixtures(executor, manifest)`.
- Produces: `getVisualFixtureStatus(executor, manifest)` with counts/status only.
- Produces: `uploadVisualFixtureMedia(store, manifest)` and `deleteVisualFixtureMedia(store, manifest)`.

- [x] Write failing SQL-contract tests proving deterministic upserts and exact-ID dependency-ordered reset without analytics/job/search writes.
- [x] Run focused repository tests and observe RED.
- [x] Implement transactional Kysely builders and status serialization, then verify GREEN.
- [x] Write failing media-store tests for exact key prefix, deterministic upload metadata, and namespace-only deletion.
- [x] Implement the injectable S3-compatible adapter and verify GREEN.

### Task 4: Seed, Reset, And Verify Commands

**Files:**

- Create: `apps/web/scripts/visual-fixtures-seed.ts`
- Create: `apps/web/scripts/visual-fixtures-reset.ts`
- Create: `apps/web/scripts/visual-fixtures-verify.ts`
- Create: `apps/web/src/lib/visual-fixtures/command.test.ts`
- Create: `apps/web/src/lib/visual-fixtures/command.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`

**Interfaces:**

- Produces package scripts `visual:fixtures:seed`, `visual:fixtures:reset`, and `visual:fixtures:verify`.
- Produces redacted JSON summaries containing only version, hash, environment class, and counts.

- [x] Write failing tests for redacted command summaries and production-refusal ordering.
- [x] Implement shared command orchestration and thin CLI entrypoints.
- [x] Add scripts and documented fail-closed environment values.
- [x] Run focused tests and verify GREEN.

### Task 5: Fixture Index On Real Routes

**Files:**

- Create: `apps/web/src/app/__visual-fixtures/page.test.tsx`
- Create: `apps/web/src/app/__visual-fixtures/page.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/proxy.test.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/server/public-object-passport-repository.test.ts`
- Modify: `apps/web/src/server/public-object-passport-repository.ts`
- Modify: `apps/web/src/lib/public-surface-localization.ts`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.test.tsx`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.tsx`

**Interfaces:**

- Consumes: environment guard, manifest scenarios, and safe repository status.
- Produces: a production-inaccessible operational index with real journal/object/profile/404/410 links and media aspect gallery.

- [x] Write failing route and Proxy tests for a hard disabled/Production 404, safe enabled output, real route links, actor handles without credentials, and no owner/storage/database identifiers.
- [x] Write a failing SiteShell exclusion test for `/__visual-fixtures`.
- [x] Implement the Shadcn/Lucide operator page, shell exclusion, pre-App-Router hard-404 guard, and the real passport's localized five-plus-five disclosure.
- [x] Run focused tests and verify GREEN.

### Task 6: Local Integration And Browser Evidence

**Files:**

- Create: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`
- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`
- Update this checklist.

**Interfaces:**

- Consumes all prior tasks on a bootstrapped local Postgres/MinIO stack.
- Produces reproducible seed/hash/reset/sentinel/reseed proof and matched desktop/mobile screenshots.

- [x] Run local bootstrap and `pnpm visual:fixtures:seed` twice; verify identical hash/counts.
- [x] Run `pnpm visual:fixtures:verify`; prove sentinel survival, namespace cleanup, media reachability, and final reseed.
- [x] Start the production build locally with fixture mode enabled.
- [x] Browser-test `/__visual-fixtures`, representative public journal/object/profile, 404, and 410 routes at desktop and 320px; inspect console and horizontal overflow.
- [x] Compare matched screenshots against the approved Drive2 information-region references and fix visible fixture/integration defects; later archetype reconstruction remains owned by OVE-176 through OVE-179.
- [x] Write the operator runbook and update roadmap/status docs with non-production boundaries.

### Task 7: Full Verification And Closeout

**Files:**

- Update this checklist and all touched docs/tests.

**Interfaces:**

- Produces: current-main containment, CI/deployment refusal proof, redacted Linear evidence, and OVE-187 Done.

- [x] Run focused tests, full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`, and `pnpm mainline:closeout:check`.
- [x] Audit the diff for secrets, exact location, production-enablement paths, random remote assets, and unrelated changes.
- [ ] Commit with a Conventional Commit and push `main`.
- [ ] Verify `HEAD == origin/main`, GitHub CI success, and Vercel Production returns 404 for `/__visual-fixtures`.
- [ ] Attach redacted screenshots/proof to Linear and move OVE-187 to Done.
