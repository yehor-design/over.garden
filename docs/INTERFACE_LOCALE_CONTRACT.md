# Interface Locale Contract

Status: current. The market-and-locale model below was replaced on 2026-09-17
(`OVE-460`, PR #398) and re-stated here on the same day (`OVE-446`). The
sections after "Language-Control Ownership" are the OVE-205 text and are
history unless this page says otherwise.
Issues: OVE-205 (the market-before-locale resolver), OVE-208 (typography), OVE-338 (account routes), OVE-460 (the reader's language), OVE-446 (this restatement), OVE-472 (a choice that stays chosen)
Date: 2026-09-17, superseding 2026-08-25

## Purpose

OverGarden resolves the visitor's interface market before it resolves an
interface locale, and the locale it resolves is **the reader's**.

**What changed on 2026-09-17, and why.** The previous contract gave Ukraine one
language and no control, and Bulgaria two. Read literally, it meant a reader in
Ukraine could not read the interface in Bulgarian or Russian, and a reader in
Bulgaria who chose Ukrainian was moved into the Ukraine market by the prefix
alone — and so lost the control that had got them there. On production this
showed as `/journals` answering `Content-Language: bg` with `<html lang="uk">`,
Ukrainian content under Bulgarian chrome, a language control the old contract
forbade on that page, and a full-width bar offering the reader the language they
were already reading. The owner's decision, taken that day and reaffirmed when
the question was put again: **both markets offer all three languages, and the
market decides only which language a reader who has chosen nothing starts in.**

The current product contract is:

- The interface language is the reader's, on every address. It lives in a
  bounded cookie; the country sets it on a first visit; a locale prefix in an
  address is an explicit choice and is written back to the cookie.
- **Exactly one** language control is rendered on every user-facing document and
  application-owned rendered state, in **both** markets, offering all three
  languages. Zero is a defect and two is a defect.
- An unprefixed public address renders from the reader's locale subtree with the
  URL and the status unchanged. `isReaderLocalizedPublicPath` in
  `src/lib/interface-route-policy.ts` says which addresses have a prefixed twin.
- User-authored content, catalog identity, scientific names, official source
  names, and literal evidence are never silently translated. An entry keeps the
  language it was written in, and carries `lang` and `inLanguage` to say so —
  including inside a feed or a directory somebody is reading in another language
  (WCAG 3.1.2).

Copy is typed per locale (`uk`, `bg`, `ru`), so typecheck proves every key
exists in every language, and
`src/lib/interface-locale-surface.test.ts` proves it again at runtime including
nested records. The former coverage registry, its baseline document, and the
browser matrix were retired by ADR-0022.

## Market And Locale Model

The supported interface markets and their allowed locales are closed enums:

| Market   | Allowed locales  | Default locale | Public canonical form                      | Language control |
| -------- | ---------------- | -------------- | ------------------------------------------ | ---------------- |
| Ukraine  | `uk`, `bg`, `ru` | `uk`           | unprefixed, for example `/` and `/privacy` | exactly one      |
| Bulgaria | `uk`, `bg`, `ru` | `bg`           | unprefixed, the reader's language inside   | exactly one      |

The resolver determines the market first and only then validates a locale
inside that market. **A locale signal never moves a visitor between markets** —
that is the one rule the previous model broke, and it broke it through the
locale prefix.

1. A trusted supported country signal establishes `BG` -> Bulgaria or
   `UA` -> Ukraine. It wins over a conflicting persisted market value.
2. A bounded persisted market decision may establish the market only when the
   country signal is absent, malformed, or unsupported.
3. Missing, malformed, unsupported, or contradictory remaining market input
   fails to the **Ukraine** market.
4. The locale is taken from the first of: an explicit value, the route's locale
   prefix, the persisted preference. Each is accepted only if it is one of the
   three; otherwise the market's default locale is used. The explicit value is
   what the proxy forwards to the render, and it forwards one **only when the
   address names a language** — the one fact the render cannot read for
   itself. Everywhere else the render reads the cookie, which is where a Server
   Action's choice lands: a language pinned on the request before the choice
   used to outrank it, and every workspace page re-rendered in the language
   just left (`OVE-472`, ADR-0024 D4 amended 2026-09-21).
5. `Accept-Language` is **not** an input. A header the reader never set is not a
   choice they made, and `resolveInterfaceLocalization` has no parameter for it.
6. A locale prefix chooses a language and says nothing about the market. A
   reader in Bulgaria reading `/uk/journals` is in the Bulgaria market reading
   Ukrainian.

`src/lib/interface-locale-surface.test.ts` walks the whole matrix — country
signal x persisted market x URL prefix x persisted locale, 600 combinations —
asserts every answer is a market-valid locale, and names the production failure
above as its own case.

**The preference is written on a document load and on nothing else.** Next
strips `Next-Router-Prefetch` before middleware runs, so `proxy.ts` cannot tell
a router prefetch of `/ru/...` from a router navigation. It used to write the
preference on both: merely _hovering_ an option rewrote the reader's saved
language (ADR-0024 D4, reproduced in Chromium on 2026-09-04), and until
2026-09-21 the prefetches of a page's own `/ru/...` links undid a choice made
seconds earlier (`OVE-472`). A router fetch sends `Sec-Fetch-Dest: empty`, which
does reach the proxy, so `isDocumentNavigationRequest` is the one gate, whatever
the link. Every option is still a plain anchor, and never prefetched. Three
modules may build such an address — the route policy that declares the
builder, the language control, and the raw `404`/`410` lifecycle document — and
the same test fails if a fourth appears or if one of the three reaches for
`next/link`.

**An address with no prefixed twin is linked unprefixed in every language.**
`/support` and the workspace render in the reader's language at their one
address; `/bg/support` and `/bg/garden` are 404s, and the footer and the
owner's empty profile linked them until 2026-09-21.
`site-shell-navigation.test.ts` asks the proxy's own classification about every
link the shell draws, in every language.

Legacy `/uk` public URLs permanently redirect to their corresponding
unprefixed canonical URL. `/uk` is not a supported canonical prefix and must
not be generated by navigation, metadata, sitemap, or hreflang.

## What Is No Longer True

Kept so that nobody re-derives a rule the product does not follow:

- "Ukraine renders zero language controls, zero hidden placeholders, and zero
  reserved spacing for such a control." **Superseded.** Every market renders
  exactly one.
- "Bulgaria's public canonical form is `/bg/**` or `/ru/**`." **Superseded.**
  Every market's canonical form is unprefixed; the prefix is how a reader
  states a choice, and the proxy folds it back.
- "The locale notice offers a page in the reader's language." **Deleted**
  (PR #400). It compared the reader's language with the route's and offered the
  reader their own, which made sense only while an unprefixed address was always
  Ukrainian. It now appears on a page already in the right language, so it is
  gone along with the copy key it was the only reader of. The language control
  is the one way to change a language, and it is on every page.

Signed-in, authentication, garden, account, and operator routes remain
canonical and unprefixed, including `/garden`, `/garden/objects/:id`,
`/garden/profile`, `/account/communities`, `/account/moderation/comments`,
`/garden/catalog/curation`, and `/garden/privacy/erasure-requests`. The market
and locale of those routes are request state, never query-string state. The
retired `/admin` namespace and every descendant are exact `404`, not locale
entry points or compatibility redirects.

## Language-Control Ownership

The rendered control invariant is the same in both markets:

- Every market renders **exactly one** application-owned language control on
  every user-facing document and state, offering all three languages.
- One shared control owner must be selected for each rendered tree. Nested
  layouts, pages, dialogs, and error boundaries must not introduce a second
  owner.
- Since `OVE-443` that owner is the site footer, which is also the product's
  `contentinfo` landmark. The routes with no shell keep their own owner:
  `AuthenticatedUtilityRegion` for the erasure surfaces, and the raw lifecycle
  document for `404`/`410` HTML.

The Bulgaria invariant applies to public, authentication, garden, account, and
operator pages; authorized and denied states; loading and error boundaries;
route and global not-found UI; application-owned `404`/`410` lifecycle HTML;
and the global error fallback. A sparse or exceptional state is not an
exemption. Raw protocol/API responses that intentionally contain no product UI
remain non-UI and must be classified as such in the coverage registry.

The control exposes exactly the three allowed choices, `uk`, `bg` and `ru`,
identifies the current choice accessibly, supports keyboard and screen-reader
operation, and does not change domain behavior, authorization, mutation
payloads, or privacy rules.

## Typography Ownership

OVE-208 makes the shared proportional typography token the only application
owner for ordinary interface and authored text. `--font-sans` and
`--font-heading` resolve through `--font-overgarden-sans` to Google Sans for
every `uk`, `bg`, and `ru` document, including route states, raw community,
object, profile, and journal lifecycle `404`/`410` HTML, and the global error
fallback. Semantic code, identifiers, and machine evidence remain on
`--font-mono`; a component must not choose a proportional family directly.

The root `html[lang]` remains authoritative, including `lang="bg"` for
Bulgarian OpenType localized forms. Typography must not transform or rewrite
user-authored, catalog, scientific, or source text. Font binaries are pinned,
content-hashed, self-hosted same-origin assets with immutable public caching;
no runtime request may reach Google Fonts or another font CDN. `/fonts/**`
stays outside personalized market/locale proxy handling and cannot vary by
cookie, locale preference, identity, or private content.

This is a reversible and still-unvalidated product hypothesis. Rolling the
semantic proportional token back to Geist must not require component rewrites.
OVE-208 does not change information architecture, color, copy, action semantics,
or the existing visual language. Its only component-level layout delta is the
mobile community-report positioning-containment correction required to keep
existing localized controls inside the viewport; this is not a redesign or
evidence that users prefer Google Sans.

## Switching Localized Public Documents

On localized Bulgaria public routes, `/bg/**` <-> `/ru/**` switching is an
ordinary same-origin document navigation to the equivalent localized route.
It must atomically replace the root document language and metadata.

The target builder may preserve only route-approved public view state, such as
an allowlisted filter, sort, cursor/page value, and the client-side fragment
for an existing public anchor. It must:

- validate and rebuild query parameters rather than copy the raw query string;
- reject return URLs, credentials, tokens, mutation payloads, private IDs,
  journal drafts, media keys, and user-authored form values;
- retain a fragment only in the browser, only for the same public resource,
  and never send it to the server or persist it in a cookie;
- drop unknown, duplicate, malformed, or unsafe values.

Speculative navigation and prefetch are read-only. They may render a target for
inspection, but they cannot persist a market or locale choice.

## Switching Canonical Unprefixed Documents

Canonical unprefixed product/auth/garden/operator routes cannot express a
Bulgarian-market language choice in their path. Their shared control therefore
uses one narrow, same-origin POST preference boundary, followed by a hard
reload of the current canonical URL.

The preference mutation accepts only the bounded Bulgaria market and a locale
enum of `bg` or `ru`. It must not accept or derive a return URL, redirect target,
query string, fragment, token, object/user ID, draft, media key, private
context, or arbitrary JSON. It must reject:

- `GET`, cross-origin, prefetch, RSC, and server-action lookalike requests;
- an invalid content type, market, locale, origin, or fetch context;
- a Ukraine-market language mutation;
- additional unrecognized fields.

The response is `no-store`, contains no open redirect, and does not echo
private input. After success, the browser reloads the exact current canonical
URL with a no-referrer navigation. The cookie/state layer stores only bounded
market/locale enums and retains the existing `HttpOnly`, `SameSite=Lax`,
HTTPS-only `Secure`, `Path=/`, and bounded-age privacy properties. It must not
store user content or identity.

## Dirty And In-Flight Locale Change Coordinator — REMOVED (ADR-0024, D4; OVE-379)

**This section is history.** The coordinator was deleted on 2026-09-04 together
with the 1 938 lines that implemented it. A language change is **a navigation**,
not a document lifecycle transition: on a public page the option is a link
carrying `prefetch={false}`, and on an unprefixed route it is a form over a
Server Action that writes the cookie. Nothing replaces the document, so composer
text survives a language change, and there is no stay-or-discard decision to
make. There is no status message and no confirmation dialog.

Why it is recorded rather than deleted: the coordinator replaced the global
`fetch` (so any non-GET request anywhere disabled the control) and watched
`input` across the whole document (so one keystroke raised a discard dialog
before a reload destroyed that text anyway). ADR-0024 names the shape — it was
ADR-0022 D6's mutation registry returning under another name — and forbids
rebuilding it. Anything below in this section describes the removed design:

A language change was treated as a document lifecycle transition, not an
independent product mutation. One shared coordinator owned it across all
Bulgaria surfaces:

1. A clean page changes immediately.
2. A registered safe local flush may finish before navigation.
3. Dirty user work requires an explicit stay-or-discard/continue decision;
   cancellation keeps the current document and locale unchanged.
4. While a locale change, safe flush, upload, sync, or canonical mutation is
   in flight, duplicate locale changes are disabled and cannot replay the
   product mutation.
5. Unknown completion state fails closed on the current document. It never
   copies a draft, token, upload, journal text, object data, or mutation payload
   into a URL, cookie, header, analytics event, or locale request.

The local journal composer, edge-staging upload, auth-intent, and
current-session exit boundaries register with this coordinator while their
rendered state is dirty or in flight. The coordinator remains the single owner;
future editor/photo/cover work must extend it rather than fork language-change
behavior.

### Downstream real-UI proof ownership (founder-approved 2026-07-22)

The founder resolved the completion-order contradiction in OVE-205's
2026-07-18 structured-journal addendum by assigning final real-product UI proof
to the vertical slice that implements that UI. This clarification supersedes
only the earlier allocation of those future browser checks to OVE-205. Every
market, privacy, continuity, and no-data-loss invariant remains binding.

OVE-205 owns the shared market-aware control, narrow preference endpoint,
clean/dirty/safe-flush/in-flight/seal/recovery coordinator, integration with
every currently rendered product state, and the payload-free
`owner-composer-drafts` adapter. OVE-205 also keeps a fail-closed ownership
ledger for downstream UI, but it does not claim that nonexistent UI passed.

- OVE-317 preserves OVE-202's Cyrillic IME/serialization, ten-inline-photo,
  inline-upload, conflict, connection-required refusal, and failed-flush
  locale-transition proof.
  Its editor must consume the shared proportional token, use the real italic
  face, and persist no `font-family` styling in the structured document.
  OVE-202 records `browser-backed` proof with scenario
  `editor-clean-locale-transition`; OVE-317 re-proves the migrated authoring
  runtime on the required cross-browser and maintainer-authorized
  device-equivalent matrix, with physical-device and VoiceOver-runtime residual
  risk stated explicitly.
- OVE-206 owns final pointer/touch/keyboard reorder, active-gesture blocking,
  committed-order serialization, focus, announcement, and transition proof.
  OVE-206 records `browser-backed` proof with scenario
  `pointer-commit-immediate-transition`; founder physical iPhone Safari
  checklist is required before Linear Done.
- OVE-207 owns final automatic/explicit-inline/separate-cover behavior,
  dedicated-cover upload, selected-image removal, and combined ten-inline plus
  one-cover transition proof. OVE-207 records `browser-backed` proof with
  scenario `locale-transition-with-cover`; founder physical iPhone Safari
  checklist remains residual operator smoke before trusting device gesture
  feel.

The dependency order remains OVE-205 -> OVE-202 -> OVE-206 -> OVE-207. Each
downstream slice must replace only its own ownership-ledger entry with real
product-browser scenarios before that slice can be marked Done. An internal
fixture or adapter-only contract cannot satisfy a downstream slice. Conversely,
an explicitly downstream-owned entry has `blocksCurrentIssue: false` and does
not block OVE-205 after OVE-205's own current-surface and exact-SHA gates pass.

## Translation Boundary

Translate interface-owned content:

- navigation and application chrome;
- commands, labels, forms, validation, recovery, loading, empty,
  connection-required, and
  error states;
- application-authored metadata and structured interface copy;
- application-authored editorial and aggregation copy where the route supports
  that locale.

Do not machine-translate or silently rewrite:

- user-authored journal titles or bodies;
- user-chosen object and space names;
- handles or email addresses;
- catalog and scientific names;
- official source names, legal titles, source quotations, or external evidence
  labels.

The OVE-164 through OVE-170 typed copy contracts remain canonical inputs,
including `trust-surface-copy.ts`, `garden-workspace-copy.ts`,
`owner-object-copy.ts`, `owner-lineage-copy.ts`, the public/social/profile
contracts, and the operator copy contracts. OVE-205 changes where and when a
locale may be chosen; it does not create a parallel dictionary system.

## Fail-Closed Coverage Contract

Every application-owned rendered surface must declare, in the exact coverage
registry:

- route and state owner, including layout/loading/error/not-found/global-error
  and raw application lifecycle renderers;
- market source, market fallback, allowed locales, and locale default;
- zero-control or exactly-one-control expectation and the owning component;
- shared proportional/monospace token ownership, including exceptional raw
  documents and global error;
- public-path switch target policy or unprefixed POST preference policy;
- auth/role/denied/lifecycle variants;
- dirty/in-flight registration and expected navigation outcome;
- deterministic browser proof at required mobile and desktop viewports.

A new or unclassified route, layout, state boundary, raw lifecycle renderer, or
control owner fails CI. Coverage cannot be inferred from a page module while
its layout, fallback, or lifecycle HTML remains unregistered.

## Privacy And Domain Invariants

Never place journal titles/bodies, object or space names, handles, emails,
precise location, region, media keys, invitation/reset tokens, internal IDs,
referrers, IP addresses, user agents, or analytics payloads in locale cookies,
locale headers, switch URLs, copy dictionaries, or locale-only evidence.

Font requests must remain same-origin and identity-neutral. Their paths,
queries, response selection, response headers, cache keys, and verification
artifacts must not encode or vary on locale cookies, account state, private
content, or precise location.

Locale branches must not alter repositories, authorization, visibility,
publication, lifecycle, search-index eligibility, idempotency, client-retirement boundaries,
media processing, analytics semantics, or domain mutations. Public photos
remain processed derivatives only, and precise user location remains locked.

## Completion Evidence

OVE-205 closeout was accepted only after the static and browser gates proved,
against the same final behavior commit:

- market-before-locale resolution and stale/cross-market coercion;
- Ukraine `uk`-only canonical behavior with zero controls;
- Bulgaria `bg` default and `bg`/`ru` behavior with exactly one control on every
  registered rendered page/state;
- safe `/bg` <-> `/ru` public switching with allowlisted query and fragment
  preservation;
- the narrow unprefixed POST preference boundary and its negative security
  matrix;
- clean, dirty, cancelled, flushing, in-flight, cross-tab, BFCache, and failure
  coordinator outcomes for existing product states;
- `html[lang]`, `Content-Language`, canonical, hreflang, `404`/`410`, metadata,
  accessibility, and no-duplicate-control invariants;
- exact copy-key parity and unchanged UGC/catalog/source values;
- a schema-v3 downstream ownership ledger that names OVE-202/206/207 without
  treating their unimplemented real UI as OVE-205 completion blockers;
- exact-SHA CI, build, deployment, and safe production smoke.

There is no coverage report or browser artifact any more (ADR-0022); a change
to a localized control is verified by its unit test and by opening the page.

The completed OVE-171 evidence remains a regression input, but its former
page/route count and owner probes are not sufficient OVE-205 proof by
themselves.
