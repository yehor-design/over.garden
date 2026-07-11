# OVE-174 Intent-Aware Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask for authentication only after a guest invokes a mutation, carry one opaque validated intent through Better Auth, and return to the exact safe control without weakening mutation authorization or guest reading.

**Architecture:** A pure typed contract validates action, target, return route, query, anchor, expiry, and resume focus. A server-only AES-GCM token module derives a domain-separated key from the existing Better Auth secret. Dedicated start/auth/resume routes compose the existing auth client into a responsive desktop-dialog/mobile-sheet page. Shared triggers and route focus markers connect engagement, lineage, claim, create, save, and publish surfaces. OVE-187 provides credential-free real-route scenario evidence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Better Auth, Node crypto, Tailwind CSS v4, Shadcn/Base UI primitives, Lucide, Vitest, deterministic OVE-187 fixtures, and browser QA.

## Global Constraints

- Reads, route navigation, filters, pagination, and public detail pages never require authentication.
- Only the existing Better Auth secret protects the token; Production and Preview still fail closed when that secret is unusable.
- The browser-visible token is opaque and contains no readable target, return path, draft, email, invite, location, media, credential, or private payload.
- Resume GET validates token and session but never performs a mutation.
- Every canonical POST/Server Action retains its own session, write-access, ownership, disclosure, idempotency, and repository checks.
- Existing user changes in the worktree must not be reverted; visual evidence stays out of git.

---

### Task 1: Typed Intent And Authenticated Token

**Files:**

- Create: `apps/web/src/lib/auth/auth-intent-contract.ts`
- Create: `apps/web/src/lib/auth/auth-intent-contract.test.ts`
- Create: `apps/web/src/server/auth-intent-token.ts`
- Create: `apps/web/src/server/auth-intent-token.test.ts`

**Produces:** action/target enums, safe route/query/anchor normalization, deterministic resume destinations, AES-GCM issue/verify, fifteen-minute expiry, and fail-closed error classes.

- [x] Write failing tests for every action/target, same-origin preservation, filters/cursors/anchors, external/protocol-relative/backslash/encoded redirects, unknown keys/routes, oversized values, tampering, wrong version, wrong secret, expiry, and forbidden-field absence.
- [x] Run RED with focused Vitest commands and record the expected missing-module failures.
- [x] Implement the smallest pure contract and server-only token module.
- [x] Run GREEN with the same focused commands.

### Task 2: Dedicated Auth And Resume Boundary

**Files:**

- Create: `apps/web/src/app/auth/intent/page.tsx`
- Create: `apps/web/src/app/auth/intent/page.test.tsx`
- Create: `apps/web/src/app/auth/intent/start/route.ts`
- Create: `apps/web/src/app/auth/intent/start/route.test.ts`
- Create: `apps/web/src/app/auth/intent/resume/route.ts`
- Create: `apps/web/src/app/auth/intent/resume/route.test.ts`
- Create: `apps/web/src/app/auth/intent/auth-intent-surface.tsx`
- Create: `apps/web/src/app/auth/intent/auth-intent-surface.test.tsx`
- Modify: `apps/web/src/app/garden/garden-auth-panel.tsx`
- Modify: `apps/web/src/app/garden/garden-auth-panel.test.tsx`

**Produces:** valid/expired/invalid auth states, desktop-dialog/mobile-sheet composition, cancel/back behavior, email/social callback parity, no-loop resume, and exact safe focus redirect.

- [x] Write failing route/component tests for unauthenticated/authenticated start, email/social callback destinations, cancel, failed OAuth, existing account guidance, invalid/expired tokens, open redirect refusal, keyboard labels, and no sensitive serialization.
- [x] Run RED on the focused auth route/component suite.
- [x] Implement the auth page, start/resume routes, accessible surface, and `GardenAuthPanel` callback correction.
- [x] Run GREEN and verify no mutation is reachable from GET.

### Task 3: Mutation Entry Points And Independent Authorization

**Files:**

- Create: `apps/web/src/components/auth/auth-intent-trigger.tsx`
- Create: `apps/web/src/components/auth/auth-intent-focus.tsx`
- Create: `apps/web/src/components/auth/auth-intent-trigger.test.tsx`
- Modify: `apps/web/src/app/api/engagement/shared.ts`
- Modify: `apps/web/src/app/api/engagement/route.test.ts`
- Modify: `apps/web/src/app/engagement/public-engagement-panel.tsx`
- Modify: `apps/web/src/app/engagement/public-engagement-panel.test.tsx`
- Modify: `apps/web/src/app/journal/[slug]/route.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.test.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.test.ts`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.tsx`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.test.tsx`
- Modify: `apps/web/src/app/garden/lineage/invitations/claim/page.tsx`
- Modify: `apps/web/src/app/garden/lineage/invitations/claim/page.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/lib/site-shell-navigation.ts`
- Modify: `apps/web/src/lib/site-shell-navigation.test.ts`
- Modify as needed: workspace create/save/publish controls and their focused tests.

**Produces:** Comment, Bookmark, Follow, Claim, Create Object, Create Entry, Save, and Publish intent starts plus precise focus/resume while existing writes remain independently protected.

- [x] Write failing tests proving guest reads stay open, guest controls generate only opaque auth destinations, signed-in controls keep canonical actions, resumed actions focus the intended control, and unauthorized mutations remain rejected.
- [x] Run RED on engagement, journal, lineage, shell, and workspace tests.
- [x] Implement shared triggers/focus markers and replace the unsigned engagement redirect.
- [x] Run GREEN, including tampered target and insufficient-permission tests.

### Task 4: Deterministic Intent Fixtures And Documentation

**Files:**

- Modify: `apps/web/src/lib/visual-fixtures/manifest.ts`
- Modify: `apps/web/src/lib/visual-fixtures/manifest.test.ts`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.tsx`
- Modify: `apps/web/src/app/%5F%5Fvisual-fixtures/page.test.tsx`
- Modify: `docs/VISUAL_FIXTURE_ENVIRONMENT.md`
- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

**Produces:** stable opaque scenario IDs, intent start/resume links for all mutation classes, guest/auth/cancel/expired/tampered/410/private/permission/real-draft-retention coverage, and current queue/status docs.

- [x] Write failing manifest/index tests for all required scenario classes, credential-free actors, safe paths, exact counts, and forbidden payload absence.
- [x] Run RED on fixture tests.
- [x] Extend the existing versioned manifest/index without production enablement or fake credentials.
- [x] Run GREEN and complete seed-twice/reset/reseed/media verification.

### Task 5: Full Verification, Visual Gate, And Closeout

**Files:**

- Update checklist: `docs/superpowers/plans/2026-07-11-ove-174-intent-aware-auth.md`

- [x] Run focused tests, full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, privacy checks, production-like `pnpm build`, fixture verification, and `pnpm mainline:closeout:check`.
- [x] Exercise every mutation class as guest, already-authenticated, cancel, invalid/expired, deleted/gone, and insufficient-permission states in the real seeded app.
- [x] Verify desktop and 320px keyboard/screen-reader structure, back navigation, exact focus, zero overflow, and zero console errors.
- [x] Compare the captured Drive2 action reference and OverGarden at matched viewports, fix visible defects, and generate redacted side-by-side evidence.
- [ ] Commit with a Conventional Commit, push `main`, verify GitHub CI and exact Vercel Production deployment, run live guest smoke, attach redacted evidence/comment to Linear, and move OVE-174 to Done only after every gate passes.
