# OVE-164 Interface Locale Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a validated `uk`, `bg`, or `ru` interface locale from public entry through `/garden` and deeper routes without adding locale or private state to signed-in URLs.

**Architecture:** Extend the existing public locale primitives with a typed interface-copy contract and a pure precedence resolver. Next.js Proxy persists only the validated locale in an HTTP-only cookie and forwards the resolved value through an internal request header; server components consume one cached request helper, while localized public URLs and signed-in URLs retain their current canonical shapes.

**Tech Stack:** Next.js 16 App Router and Proxy, React 19 server components, TypeScript, Vitest, Testing Library static rendering.

## Global Constraints

- Supported interface locales are exactly `uk`, `bg`, and `ru`; deterministic fallback is `uk`.
- Canonical Ukrainian public URLs remain unprefixed; Bulgarian and Russian public URLs remain under `/bg` and `/ru`.
- Signed-in URLs remain unprefixed and must not carry locale, journal text, identifiers, tokens, email, location, or media data.
- User-authored text, object names, handles, emails, scientific names, official source names, and external evidence labels are never machine-translated.
- OVE-164 localizes representative workspace chrome and metadata only; dependent OVE-165 through OVE-170 own complete page translation.

---

### Task 1: Pure Locale And Copy Contract

**Files:**

- Create: `apps/web/src/lib/interface-localization.ts`
- Create: `apps/web/src/lib/interface-localization.test.ts`

**Interfaces:**

- Consumes: `PublicLocale`, `isPublicLocale`, and request fallback helpers from `apps/web/src/lib/public-localization.ts`.
- Produces: `InterfaceLocale`, `resolveInterfaceLocale()`, `getInterfaceCopy()`, `INTERFACE_LOCALE_COOKIE_NAME`, and `INTERFACE_LOCALE_REQUEST_HEADER`.

- [x] **Step 1: Write failing tests** for explicit selection, route locale, persisted preference, request fallback, invalid values, and typed Ukrainian/Bulgarian/Russian workspace chrome.
- [x] **Step 2: Run tests to verify RED** with `pnpm exec vitest run src/lib/interface-localization.test.ts`; expected failure is a missing `interface-localization` module.
- [x] **Step 3: Implement the minimal pure resolver and copy records** with no request APIs or locale-specific domain logic.
- [x] **Step 4: Run tests to verify GREEN** with the same command; expected result is all locale-contract tests passing.

### Task 2: Request Persistence And Server Resolution

**Files:**

- Create: `apps/web/src/server/interface-localization.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.test.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**

- Consumes: Task 1 resolver, cookie name, and internal header name.
- Produces: `getRequestInterfaceLocale()` and a proxy handoff that sets `Content-Language`, a validated HTTP-only locale cookie, and the internal request header.

- [x] **Step 1: Write failing proxy tests** proving route locale overrides cookie, `/bg` sets only the locale cookie, `/garden` consumes that cookie, invalid cookies fall back safely, root routing honors persisted choice, and `/uk` remains a 308 canonical redirect.
- [x] **Step 2: Run tests to verify RED** with `pnpm exec vitest run src/proxy.test.ts`; expected failures are missing locale cookie/header behavior.
- [x] **Step 3: Implement proxy and server request resolution**, remove duplicate static `/uk` redirects that bypass cookie persistence, and set root `<html lang>` from the resolved locale.
- [x] **Step 4: Run proxy and root-route tests to verify GREEN** with `pnpm exec vitest run src/proxy.test.ts src/app/page.test.tsx`.

### Task 3: Signed-In Workspace Handoff

**Files:**

- Modify: `apps/web/src/app/garden/layout.tsx`
- Modify: `apps/web/src/app/garden/page.tsx`
- Modify: `apps/web/src/app/garden/page.test.tsx`
- Modify: `apps/web/src/app/garden/closed-pilot-write-callout.tsx`
- Modify: `apps/web/src/app/garden/objects/[objectId]/page.tsx`
- Modify: `apps/web/src/app/garden/objects/[objectId]/page.test.tsx`
- Modify: `apps/web/src/app/garden/profile/page.tsx`
- Modify: `apps/web/src/app/garden/profile/actions.ts`

**Interfaces:**

- Consumes: `getRequestInterfaceLocale()` and `getInterfaceCopy()`.
- Produces: locale-aware workspace metadata, visible workspace/object chrome, public navigation paths, profile paths, wishlist return paths, and public privacy links while `/garden` URLs stay unchanged.

- [x] **Step 1: Write failing rendering tests** proving Bulgarian workspace navigation stays under `/bg`, Ukrainian object readback shows Ukrainian chrome, and user-authored names remain unchanged.
- [x] **Step 2: Run focused tests to verify RED** with `pnpm exec vitest run src/app/garden/page.test.tsx src/app/garden/objects/[objectId]/page.test.tsx`.
- [x] **Step 3: Wire the shared request locale and copy contract** into the listed server surfaces and pass locale explicitly to client components or actions where required.
- [x] **Step 4: Run focused tests to verify GREEN** with the same command and the affected profile/wishlist tests.

### Task 4: Contract Documentation And Completion Proof

**Files:**

- Create: `docs/INTERFACE_LOCALE_CONTRACT.md`
- Modify: `docs/SCAFFOLD_STATUS.md`

**Interfaces:**

- Consumes: the shipped resolver, persistence mechanism, and translation boundaries.
- Produces: the canonical locale precedence, storage, URL, translation, and future-consumer rules for OVE-165 through OVE-171.

- [x] **Step 1: Document exact precedence and privacy boundaries**, including why signed-in URLs never carry locale and why UGC and source evidence are not translated.
- [x] **Step 2: Run focused localization tests**, then `pnpm run lint`, `pnpm exec tsc --noEmit --pretty false`, `pnpm test`, `pnpm run build`, and `pnpm mainline:closeout:check`.
- [x] **Step 3: Run browser QA** for a localized public route into `/garden` and an object route, checking URL, DOM language/chrome, console health, screenshot evidence, and interaction continuity.
- [x] **Step 4: Review the final diff against every OVE-164 acceptance criterion** and resolve all critical or important findings before repository closeout.
