# Interface Locale Contract

Status: active
Issues: OVE-164 through OVE-171
Date: 2026-07-14

## Purpose

OverGarden resolves one interface locale for public and signed-in requests so a visitor does not fall back to English when moving from a localized public page into `/garden` or a deeper product route. This contract owns locale resolution and continuity; OVE-165 through OVE-170 own complete copy coverage for their respective surfaces, and OVE-171 owns the final route-and-state coverage gate.

OVE-166, OVE-167, and OVE-170 depend only on the OVE-164 locale foundation. OVE-168 and OVE-169 also depend on the completed OVE-165 public-surface copy contract. These five surface slices may execute independently and in parallel; OVE-171 depends on all five. OVE-186 and its external OVE-188 protective-DNS blocker do not block localization implementation or local/preview proof.

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
- unchanged user-authored object and journal text;
- existing public canonical and hreflang tests.
