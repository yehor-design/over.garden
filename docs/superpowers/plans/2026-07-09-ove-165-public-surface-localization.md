# OVE-165 Public Surface Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep public discovery, journal readback, passports, varieties, profiles, engagement, and public failure states in the request-selected `uk`, `bg`, or `ru` interface locale.

**Architecture:** Add one typed, client-safe public-surface copy contract that consumes the OVE-164 locale type but never carries UGC or private data. SSR journal rendering receives the resolved request locale from its route handler; React public routes consume the same cached request helper or their validated public route locale. Canonical routes, public indexability policy, user-authored values, scientific names, and official source text remain unchanged.

**Tech Stack:** Next.js 16 App Router and route handlers, React 19 server components, TypeScript, Vitest, Testing Library static rendering.

## Global Constraints

- Supported interface locales are exactly `uk`, `bg`, and `ru`; unknown input falls back through the OVE-164 contract.
- Public canonical URLs and hreflang remain owned by `apps/web/src/lib/public-localization.ts`; unprefixed UGC routes do not gain locale query strings or duplicate localized URLs.
- User-authored journal titles, bodies, comments, object/space names, handles, catalog scientific names, canonical catalog names, official source names, licenses, attribution text, and external evidence labels remain byte-for-byte unchanged.
- Localized UI must preserve `noindex` behavior for journal, passport, variety, and profile surfaces until the existing indexability policy promotes them.
- No locale artifact, metadata, test fixture, or rendered public page may expose precise location, owner IDs, emails, raw media keys, invite tokens, or hidden fields.
- Public-to-`/garden` activation keeps the canonical unprefixed URL; the HTTP-only OVE-164 preference cookie preserves the selected locale.

---

### Task 1: Typed Public-Surface Copy Contract

**Files:**

- Create: `apps/web/src/lib/public-surface-localization.ts`
- Create: `apps/web/src/lib/public-surface-localization.test.ts`
- Modify: `apps/web/src/components/public/language-switcher.tsx`
- Modify: `apps/web/src/components/public/language-switcher.test.tsx`

**Interfaces:**

- Consumes: `InterfaceLocale` from `apps/web/src/lib/interface-localization.ts`.
- Produces: `getPublicSurfaceCopy(locale)` with page metadata labels, journal chrome, passport/variety/profile labels, engagement states, source-credit labels, and public not-found/gone content.

- [x] **Step 1: Write failing tests** for Bulgarian and Russian UI copy, a Ukrainian fallback, and a localized language-switcher accessible label without asserting translated UGC.
- [x] **Step 2: Run RED** with `pnpm exec vitest run src/lib/public-surface-localization.test.ts src/components/public/language-switcher.test.tsx`; expected failure is the missing copy module and English accessible label.
- [x] **Step 3: Implement the minimal typed record** keyed only by the supported locale enum, then pass its switcher label to `LanguageSwitcher`.
- [x] **Step 4: Run GREEN** with the same command; expected result is all contract and switcher tests passing.

### Task 2: Localized SSR Journal Readback And Failure States

**Files:**

- Modify: `apps/web/src/app/journal/[slug]/render.ts`
- Modify: `apps/web/src/app/journal/[slug]/render.test.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.ts`
- Modify: `apps/web/src/app/journal/[slug]/route.test.ts`

**Interfaces:**

- Consumes: `getRequestInterfaceLocale()` and `getPublicSurfaceCopy()`.
- Produces: locale-aware HTML document language, metadata, UI chrome, dates, engagement labels, and 404/410 pages while preserving source values from `PublicJournalEntryPage`.

- [x] **Step 1: Write failing render and route tests** that request `bg`/`ru`, expect localized journal and gone/not-found UI, and assert the existing English fixture title/body/comment remain unchanged.
- [x] **Step 2: Run RED** with `pnpm exec vitest run src/app/journal/[slug]/render.test.ts src/app/journal/[slug]/route.test.ts`; expected failure is English page chrome or missing locale handoff.
- [x] **Step 3: Add an optional locale argument to pure render functions and resolve locale once in the route handler**; localize only application-authored strings, attributes, and dates.
- [x] **Step 4: Run GREEN** with the same command and retain existing privacy/noindex assertions.

### Task 3: Passport, Variety, Profile, Engagement, And Public Not-Found UI

**Files:**

- Modify: `apps/web/src/app/engagement/public-engagement-panel.tsx`
- Modify: `apps/web/src/app/engagement/public-engagement-panel.test.tsx` or create it when absent
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.tsx`
- Modify: `apps/web/src/app/lineage/objects/[objectId]/page.test.tsx`
- Modify: `apps/web/src/app/variety/[slug]/page.tsx`
- Modify: `apps/web/src/app/variety/[slug]/page.test.tsx`
- Modify: `apps/web/src/app/variety/[slug]/source-credits.tsx`
- Modify: `apps/web/src/app/variety/[slug]/source-credits.test.tsx`
- Modify: `apps/web/src/app/[locale]/[profileHandle]/page.tsx`
- Modify: `apps/web/src/app/[locale]/[profileHandle]/page.test.tsx`
- Create: `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/not-found.test.tsx`

**Interfaces:**

- Consumes: `getRequestInterfaceLocale()` for canonical unprefixed public routes and validated `localeParam` for prefixed profiles; the Task 1 public copy record; existing public indexability policy and repository projections.
- Produces: localized React public chrome and metadata without changing canonical links, public projections, action payload contracts, or user/source values.

- [x] **Step 1: Write failing render tests** for a Bulgarian passport, Russian variety and engagement panel, Bulgarian prefixed profile, and locale-aware public not-found response; each test keeps fixture object names, journal text, comments, handles, and official source names unchanged.
- [x] **Step 2: Run RED** with the listed focused route/component tests; expected failure is English UI copy, metadata, source-label chrome, or missing not-found module.
- [x] **Step 3: Thread the resolved locale through these server components and pure child components**; use locale-aware dates/count labels, wishlist hidden locale, source-credit chrome, and existing unprefixed `/garden` activation paths.
- [x] **Step 4: Run GREEN** with the same focused tests and preserve existing public privacy and noindex assertions.

### Task 4: Contract Documentation, Full Verification, And Production Proof

**Files:**

- Modify: `docs/INTERFACE_LOCALE_CONTRACT.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

**Interfaces:**

- Consumes: the shipped OVE-164 locale persistence contract and Tasks 1-3 behavior.
- Produces: an explicit public-surface consumer rule for OVE-166 through OVE-171.

- [x] **Step 1: Document public-copy ownership and the immutable UGC/source boundary**, including canonical/noindex behavior for unprefixed UGC routes.
- [x] **Step 2: Run full local verification**: `pnpm exec vitest run`, `pnpm run lint`, `pnpm run typecheck`, `git diff --check`, `BETTER_AUTH_SECRET=build-only-overgarden-auth-secret-ove165-0123456789 pnpm run build`, and `pnpm mainline:closeout:check`.
- [ ] **Step 3: Run browser smoke** for Ukrainian, Bulgarian, and Russian public pages into `/garden`, plus representative localized journal/passport/variety/profile readback and mobile overflow/console checks.
- [ ] **Step 4: Review every OVE-165 acceptance criterion, resolve all Critical and Important findings, then complete repository and Linear closeout.**
