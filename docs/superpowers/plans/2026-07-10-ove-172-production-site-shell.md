# OVE-172 Production Site Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give guests and signed-in gardeners one production OverGarden shell with Drive2-like information architecture across the home, garden, public object passport, and raw public journal routes without loading owner data on public pages.

**Architecture:** A typed, client-safe navigation contract owns localized labels, canonical destinations, route matching, and context-rail variants. Next.js routes use a React shell from the root layout with a server-resolved boolean session state; the raw `/journal/[slug]` route consumes the same pure contract in its HTML renderer. Shadcn Base UI primitives provide the mobile sheet, separator, buttons, and tooltips; route content remains server-rendered and retains its existing scoped repositories.

**Tech Stack:** Next.js 16 App Router and route handlers, React 19 server/client components, TypeScript, Tailwind CSS v4, Shadcn Base Nova/Base UI, Lucide, Vitest, Browser in the Codex in-app surface.

## Global Constraints

- No separate prototype, copied Drive2 asset/text/trade dress, marketplace, direct message, precise geography, or public reputation score.
- Guest reading must never redirect to authentication; authentication state may only alter shell navigation and actions.
- The shell may resolve the current auth session but must never import or invoke owner-scoped garden, journal, profile, media, lineage, notification, or analytics repositories.
- Shell state contains `isAuthenticated` only; it must not serialize email, user ID, session ID, private counts, object data, or drafts.
- Ukrainian uses unprefixed public routes; Bulgarian and Russian retain the existing localized route contract and OVE-164/OVE-165 behavior.
- Desktop uses global header + persistent left rail + central content + contextual right rail; mobile uses compact header + accessible sheet + stable bottom navigation with the same primary routes.
- Reference screenshots remain local execution evidence and are not committed.

---

### Task 1: Execution Governance And Baseline

**Files:**

- Modify: `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- Create: `docs/superpowers/plans/2026-07-10-ove-172-production-site-shell.md`

**Interfaces:**

- Consumes: Linear Slice 18 dependency graph and the completed OVE-145 through OVE-150 research/history.
- Produces: current queue authority for later agents and this executable plan.

- [x] **Step 1: Record Slice 18 as the active reconstruction queue**, Slice 15 as superseded, and OVE-166 through OVE-171 as blocked by OVE-186.
- [x] **Step 2: Preserve OVE-164/OVE-165 as binding locale foundations** and state that completed OVE-148 through OVE-150 are not current visual approval.
- [x] **Step 3: Capture the implementation boundaries and verification gates in this plan.**

### Task 2: Typed Navigation And Minimum Session Contract

**Files:**

- Create: `apps/web/src/lib/site-shell-navigation.ts`
- Create: `apps/web/src/lib/site-shell-navigation.test.ts`
- Create: `apps/web/src/server/site-shell-session.ts`
- Create: `apps/web/src/server/site-shell-session.test.ts`
- Modify: `apps/web/src/lib/interface-localization.ts`
- Modify: `apps/web/src/lib/interface-localization.test.ts`

**Interfaces:**

- Produces: `getSiteShellNavigation(locale, isAuthenticated)`, `getSiteShellRouteContext(pathname)`, `isSiteShellItemActive(pathname, item)`, and `getSiteShellSessionState()` returning `{ isAuthenticated: boolean }` only.

- [x] **Step 1: Write failing tests** for Ukrainian/Bulgarian/Russian route labels and paths, guest/auth groups, active matching, context variants, and boolean-only session serialization.
- [x] **Step 2: Run RED** with `pnpm exec vitest run src/lib/site-shell-navigation.test.ts src/server/site-shell-session.test.ts src/lib/interface-localization.test.ts`; expected failure is missing modules/copy.
- [x] **Step 3: Implement the smallest typed contracts** using existing locale/session helpers without importing any owner repository.
- [x] **Step 4: Run GREEN** with the same focused command.

### Task 3: Shadcn React Shell And Root Integration

**Files:**

- Add with Shadcn CLI and review: `apps/web/src/components/ui/sheet.tsx`
- Add with Shadcn CLI and review: `apps/web/src/components/ui/separator.tsx`
- Add with Shadcn CLI and review: `apps/web/src/components/ui/tooltip.tsx`
- Create: `apps/web/src/components/site-shell/site-shell.tsx`
- Create: `apps/web/src/components/site-shell/site-shell-navigation.tsx`
- Create: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/layout.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Consumes: Task 2 navigation/session contracts.
- Produces: server-rendered guest/auth shell, active desktop rail, contextual right rail, accessible mobile Sheet, and mobile bottom navigation.

- [x] **Step 1: Write failing static-render tests** for the four desktop regions, guest/auth navigation difference, accessible mobile controls, and no serialized user fields.
- [x] **Step 2: Run RED** on the shell/root-layout tests.
- [x] **Step 3: Add the reviewed Shadcn primitives and implement the shell composition** with Lucide icons, semantic tokens, stable dimensions, and route-aware active state.
- [x] **Step 4: Resolve locale and boolean session state in parallel in RootLayout**, then wrap production children without changing route data loaders.
- [x] **Step 5: Run GREEN** and confirm excluded operational routes remain usable.

### Task 4: Representative Route Integration And Raw Journal Parity

**Files:**

- Modify: `apps/web/src/components/public/localized-public-pages.tsx`
- Modify: `apps/web/src/app/page.test.tsx`
- Modify: `apps/web/src/app/garden/page.tsx`
- Modify: `apps/web/src/app/garden/page.test.tsx`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.tsx`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.test.tsx`
- Modify: `apps/web/src/app/journal/[slug]/render.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.test.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.test.ts`

**Interfaces:**

- Consumes: React shell from Task 3 and pure navigation/session contracts from Task 2.
- Produces: no duplicate legacy headers on the home, garden, object passport, and public journal 200/404/410 surfaces; raw journal receives the same guest/auth navigation contract.

- [x] **Step 1: Write failing route/render tests** for shared-shell ownership, localized navigation, guest-open readback, authenticated My navigation, and raw 404/410 recovery links.
- [x] **Step 2: Run RED** on home, garden, passport, journal render, and journal route tests.
- [x] **Step 3: Remove only duplicated page-level global navigation** while retaining route-owned titles, breadcrumbs, actions, and scoped data.
- [x] **Step 4: Render the pure shell contract in raw journal HTML** and resolve only boolean auth state in its route handler.
- [x] **Step 5: Run GREEN** and retain all existing privacy/noindex/410 assertions.

### Task 5: Status, Full Verification, Visual QA, And Closeout

**Files:**

- Modify: `docs/SCAFFOLD_STATUS.md`
- Update checklist: `docs/superpowers/plans/2026-07-10-ove-172-production-site-shell.md`

**Interfaces:**

- Consumes: completed Tasks 1 through 4.
- Produces: current-main implementation proof, matched browser evidence, and a Linear closeout note.

- [x] **Step 1: Run focused shell and representative-route tests**, then `pnpm test`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, production-like `pnpm build`, and `pnpm mainline:closeout:check`.
- [x] **Step 2: Start the canonical local server on `http://localhost:3000`** and use the in-app Browser for guest and authenticated traversal, interaction, console, overflow, keyboard, 1440px desktop, 390px mobile, and 320px narrow checks.
- [x] **Step 3: Capture implemented desktop/mobile screenshots and compare them side-by-side with the matching Drive2 references**; fix every Critical or Important structural mismatch and rerun verification.
- [x] **Step 4: Update status docs and this checklist**, commit with a Conventional Commit, push `main`, verify origin containment/CI/deployment as required, add redacted proof to Linear, then move OVE-172 to Done.
