# Interface Locale Contract

Status: active
Issues: OVE-164 through OVE-171
Date: 2026-07-14

## Purpose

OverGarden resolves one interface locale for public and signed-in requests so a visitor does not fall back to English when moving from a localized public page into `/garden` or a deeper product route. This contract owns locale resolution and continuity; OVE-165 through OVE-170 own complete copy coverage for their respective surfaces, and OVE-171 owns the final route-and-state coverage gate. OVE-166 is complete: trust-sensitive authentication, recovery, support, erasure, privacy, consent, and publication-disclosure surfaces now consume one exact-parity `uk`/`bg`/`ru` copy contract. OVE-167 is complete: the owner workspace, inventory, first-object composer, local drafts, offline queue, media recovery, coarse-region choices, and save feedback consume the exact-parity `garden-workspace-copy.ts` contract while preserving authored and catalog values. OVE-168 is complete: owner object follow-up, privacy, catalog resolution, provenance, progress/value moments, source attribution chrome, and lifecycle actions consume the exact-parity `owner-object-copy.ts` contract while preserving canonical mutations, private scope, lifecycle behavior, UGC, catalog identity, official source names, and provenance values. OVE-169 is complete: owner claims, invitation claim and secure handoff, consent outcomes, questions/follows, route metadata, dates, and action/recovery copy consume the exact-parity `owner-lineage-copy.ts` contract; existing social, community, and profile copy remains the canonical regression input.

OVE-166 depends only on the OVE-164 locale foundation. OVE-167 depends on OVE-164 plus OVE-161 because first-entry typeahead copy must target the final approved alias, locale-variant, trust, and no-match states. OVE-168 depends on OVE-164, the completed OVE-165 public-surface contract, and OVE-161 for the same owner catalog-resolve/readback boundary. OVE-169 depends on OVE-164 and OVE-165. OVE-170 depends on OVE-164 plus the OVE-163 matching rollout because it must include the final operator matching queue, approval, alias, duplicate-review, proof, and failure states. OVE-171 depends directly on OVE-166 through OVE-170 and receives OVE-161/163 transitively. OVE-186 and its external OVE-188 protective-DNS blocker do not block localization implementation or local/preview proof.

`docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md` is the binding incremental-work boundary. OVE-166 through OVE-170 extend only the verified partial or missing surfaces recorded there; already shipped locale contracts remain regression inputs and must not be rebuilt wholesale.

## Supported Locales And Canonical URLs

The supported interface locales are exactly `uk`, `bg`, and `ru`. The deterministic fallback is `uk`.

- Ukrainian public pages use the unprefixed canonical route, such as `/` and `/privacy`.
- Bulgarian public pages use `/bg`, such as `/bg/privacy`.
- Russian public pages use `/ru`, such as `/ru/privacy`.
- Legacy `/uk` public URLs redirect permanently to the corresponding unprefixed Ukrainian URL.
- When a persisted `bg` or `ru` preference reaches an unprefixed public route that already has a localized counterpart, Proxy redirects to that prefixed counterpart. This applies only to the allowlisted localized editorial and engagement surfaces; it does not reinterpret UGC, auth, support, legal-intake, market-specific, or private paths.
- Signed-in and operator routes remain unprefixed, such as `/garden`, `/garden/objects/:id`, and `/admin`.

The locale of a signed-in route is request state, not URL state. Do not add `locale`, journal data, object identifiers beyond the canonical route parameter, return payloads, or private context to signed-in query strings merely to preserve language.

## Resolution Order

`resolveInterfaceLocale()` applies this order and ignores unsupported or malformed values at every step:

1. An explicit supported selection supplied by a trusted language-setting boundary.
2. A localized public route prefix (`/uk`, `/bg`, or `/ru`). A language-switcher navigation is represented by this route locale today.
3. The persisted supported preference from the `overgarden_interface_locale` cookie. A future profile preference may feed the same persisted-preference input, but OVE-164 does not add a database field.
4. Request fallback: supported country signal (`UA` -> `uk`, `BG` -> `bg`), then ranked `Accept-Language`.
5. Deterministic safe default: `uk`.

Next.js Proxy is the request boundary that applies this contract. It overwrites the internal `x-overgarden-interface-locale` request header, sets `Content-Language`, and persists the resolved value when it differs from the current cookie. Server components consume the request through `getRequestInterfaceLocale()` and obtain copy through `getInterfaceCopy()`.

Route prefetch is read-only: requests marked by Next.js or the browser as prefetch may render the target locale, but they must not update the preference cookie. API requests, mutations, RSC reads, and Server Actions also receive locale context without changing preference state or triggering canonical redirects. Language-switcher choices use normal document links rather than Next.js client navigation, so an actual click reaches the persistence boundary and replaces root `<html lang>` plus metadata atomically. Only a GET HTML document navigation or trusted explicit selection may persist a different locale.

## Persistence And Privacy

The locale cookie contains only one allowlisted enum value: `uk`, `bg`, or `ru`.

- `HttpOnly`
- `SameSite=Lax`
- `Secure` on HTTPS
- `Path=/`
- one-year maximum age

Never write journal titles or bodies, object or space names, handles, emails, precise location, region, media keys, invite or reset tokens, internal IDs, referrers, IP addresses, user agents, or analytics data into locale cookies, locale headers, copy dictionaries, translation artifacts, or locale-only tests.

## Translation Boundary

Translate interface-owned content:

- navigation and application chrome;
- commands, labels, forms, validation, recovery, loading, empty, offline, and error states;
- application-authored metadata and structured interface copy;
- application-authored editorial and aggregation copy where the route supports that locale.

Do not machine-translate or silently rewrite:

- user-authored journal titles or bodies;
- user-chosen object and space names;
- handles or email addresses;
- catalog scientific names;
- official source names, legal titles, source quotations, or external evidence labels.

These values may appear inside a localized interface exactly as stored. A translated explanatory label may surround them, but the source value remains unchanged.

## Consumer Rules

- Pure or client-safe code imports locale types, resolver primitives, and copy contracts from `apps/web/src/lib/interface-localization.ts`.
- Server components import `getRequestInterfaceLocale()` from `apps/web/src/server/interface-localization.ts` and pass the resolved locale or copy to client components explicitly.
- Public URLs continue to use `localizedPath()` and their existing hreflang/indexability policy.
- `apps/web/src/lib/public-surface-localization.ts` owns interface copy for public journal readback, object passports, variety aggregations, localized profiles, engagement controls, source-credit chrome, and public failure states. Unprefixed UGC routes resolve their interface locale from the request contract; localized profile routes use their validated route locale.
- `apps/web/src/lib/trust-surface-copy.ts` owns authored copy for authentication panels and intents, provider linking, sign-in help, password reset, invitation entry, support, erasure intake/status, privacy and analytics controls, first-publication disclosure, and their validation/recovery states. Client components inherit the shared shell locale unless a route passes an explicit validated locale.
- `apps/web/src/lib/garden-workspace-copy.ts` owns authored copy for the owner workspace, inventory and continuity sections, first-object creation, object-kind and mention controls, local drafts, offline and media recovery, queue states, and save-progress feedback. Client controls receive the resolved locale explicitly; locale branches must not alter draft schemas, IndexedDB payloads, idempotency keys, repositories, media handling, or canonical mutations.
- `apps/web/src/lib/owner-object-copy.ts` owns owner-only object follow-up, privacy, catalog resolution, provenance, source-attribution chrome, progress/value moments, and publication/archive lifecycle copy. Owner controls receive the resolved locale explicitly; catalog values, source names, provenance labels, object and journal UGC, mutation payloads, authorization, visibility, lifecycle, and derivative-media boundaries remain locale-independent.
- Coarse-region codes remain stable machine values. `apps/web/src/lib/garden/regions.ts` localizes only their displayed labels and does not add precise location data.
- Public-surface metadata and JSON-LD may localize application-authored collection or page labels, but retain catalog names and journal headlines exactly as stored. Canonical URLs, hreflang, and the server-side indexability decision remain independent of locale copy.
- Cross-locale language-switcher choices use plain document links; speculative navigation must never change preference state, and client navigation must not preserve a stale root document language.
- Public links rendered from `/garden` must use the resolved locale rather than `DEFAULT_PUBLIC_LOCALE`.
- Links between signed-in routes remain canonical unprefixed paths; the HTTP-only cookie carries locale continuity.
- Domain logic, repositories, analytics event semantics, privacy rules, and authorization must not branch by locale.

## Failure Behavior

Malformed headers or cookies are ignored, never echoed. Missing locale state falls back to request signals and then Ukrainian. Locale resolution must not block authentication, journal saves, offline retries, media processing, redirects, or public readback.

## Verification

The executable contract covers:

- source precedence and malformed-value fallback;
- localized-route cookie persistence;
- prefetch requests cannot mutate the persisted preference;
- APIs, mutations, RSC reads, and Server Actions cannot persist locale state or trigger document redirects;
- public-to-`/garden` cookie handoff without locale query parameters;
- root routing with a persisted preference;
- persisted-locale redirects for allowlisted localized public routes without redirecting UGC paths;
- request header and cookie server resolution;
- locale-aware workspace metadata, navigation, public-profile links, and object chrome;
- localized public journal, passport, variety, profile, engagement, source-credit, structured-data, not-found, and gone chrome across `uk`, `bg`, and `ru`;
- exact recursive key parity for all trust-sensitive `uk`, `bg`, and `ru` copy, with placeholders and stable product/provider names preserved;
- localized auth-intent ready, invalid, expired, cancellation, OAuth-recovery, and resumed-action states without exposing raw provider or transport errors;
- localized auth help, password reset, account linking, join, support, erasure, privacy/consent, and first-publication metadata and controls;
- exact recursive key parity for owner workspace, inventory, creation, drafts, offline queue, media recovery, and save feedback across `uk`, `bg`, and `ru`;
- localized object-kind, mention, date, plural, error-recovery, and coarse-region chrome while preserving UGC, object and space names, catalog and scientific names, source labels, handles, and user-entered text;
- exact recursive key parity for owner object follow-up, privacy, catalog, provenance, progress/value, source, and lifecycle copy across `uk`, `bg`, and `ru`;
- localized owner publication/archive consequences and locale-aware public continuations while signed-in object routes remain unprefixed;
- owner route and control coverage that preserves UGC, catalog/scientific names, official source names, provenance values, private payloads, scoped repositories, idempotency, and processed-derivative-only media;
- deterministic OVE-187 empty, sparse, typical, dense, offline, loading, partial-error, full-error, long-copy, and twenty creation-state contracts through production repositories;
- unchanged user-authored object and journal text;
- existing public canonical and hreflang tests.
