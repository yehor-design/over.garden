# ADR-0039 — Bulgarian is the unprefixed language, Ukrainian lives at `/ua`

- **Status:** Accepted (decision 2026-09-25, SDD Slice 29 addendum 4). Recorded
  by `OVE-511` (29.01). Implemented by `OVE-536` (29.24), which also updates
  `docs/INTERFACE_LOCALE_CONTRACT.md`, `docs/ADDRESS_LAW_EXECUTION.md`,
  `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md` and `DESIGN.md` §6 to match, in one
  deploy.
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0029 **D1**'s example that the unprefixed family is Ukrainian, and
    **D3**'s list of legacy prefixes: `/bg/…` and `/uk/…` are now retired
    spellings that answer one 308 each (D3 below);
  - ADR-0029 **D9**'s locale column for profiles: a profile has language
    versions (`/@h`, `/ua/@h`, `/ru/@h`). D10's wording that groups profiles
    with the addresses that have none is corrected here;
  - ADR-0029 **D10**: `x-default` on `uk`, "`/uk/…` still folds to the
    canonical spelling" (its amendment of 2026-09-17), and "a crawler … still
    sees the Ukrainian page at `/journals`";
  - ADR-0029 **D11**'s "the render path treats a null as the default locale":
    a NULL `source_language` is `uk` by a named rule, not because `uk` is the
    default (D5 below);
  - ADR-0029 **D15**'s phase 1 line "the unprefixed family renders `uk`";
  - ADR-0029's rejected alternative "Prefix everything, including `uk`" is not
    revived: Ukrainian moves to a prefix because Bulgarian takes the unprefixed
    family, not for consistency;
  - ADR-0032 **D1** ("the proxy rewrites the default locale too … `/journals`
    now renders from `/uk/journals`") and **D3** (its example `/uk/journals`
    against `/journals`): the default locale is `bg`, and the internal
    `[locale]` subtree for Ukrainian keeps the code `uk` behind the `/ua`
    address;
  - ADR-0024 has no fold sentence of its own; the fold it relies on is ADR-0029
    D10's amendment, superseded above. Its D4 mechanism — a language choice is
    a document navigation that writes the cookie — is unchanged.
- **Relates to:** `docs/INTERFACE_LOCALE_CONTRACT.md` (the reader's language on
  every address), ADR-0029 D3 (one hop, decided in the proxy).

## Context

The owner decided on 2026-09-25: «Болгарська мова по дефолту без /, а
українська з /ua … старе правило /uk → 308 на голий шлях треба скасувати тим
самим деплоєм, інакше буде цикл редиректів. Українська локалізація має бути
ua, а не uk». The owner was told the same day that the address segment becomes
`ua` while the language code stays `uk`, because `ua` is Ukraine's country
code and not a language code: search engines and screen readers would not
recognise `lang="ua"` as Ukrainian.

## Decision

### D1. The addresses

A page with language versions answers in Bulgarian at its unprefixed address
(`/feed`, `/@olena`), in Ukrainian under `/ua` (`/ua/feed`, `/ua/@olena`) and in
Russian under `/ru`, as before. Entries (`/@h/post/{n}`), object passports and
space pages keep one unprefixed address: gardeners' words are never
translated.

### D2. `ua` is an address segment, `uk` is the language

`ua` appears only in the address and in the switcher's visible label «UA».
Everything a machine reads stays `uk`: `<html lang>`, `hreflang`,
`Content-Language`, `og:locale` (`uk_UA`), the cookie value, Intl formatting
and every stored language code and its CHECK. One module maps code ↔ segment
(`uk` ↔ `ua`, `bg` ↔ none, `ru` ↔ `ru`) and is the only place that builds or
parses a prefix.

### D3. Old spellings, one 308 each, in the same deploy

- `/bg/…` answers one 308 to the unprefixed address and, on a document
  navigation, remembers Bulgarian — what `/uk/…` did until now.
- `/uk/…` answers one 308 to `/ua/…`, or to the unprefixed address for a page
  with no language versions (`/uk/auth/reset-password?token=…` →
  `/auth/reset-password?token=…`). The query is kept.
- The old rule "`/uk/…` → the unprefixed address" is removed in the same
  deploy; otherwise the two rules loop.
- No request takes more than one 308 to its final address.

### D4. Who starts in which language

A reader with no language cookie starts in Ukrainian from Ukraine, and in
Bulgarian from Bulgaria or anywhere else — crawlers included. A chosen language
is remembered as before, and an unprefixed address still renders in the
reader's chosen language with the address and the 200 unchanged. `x-default`
is the unprefixed Bulgarian address. Country never redirects.

### D5. What stays `uk` by name

The default locale's other jobs are split out and keep `uk` as named rules: an
entry with no recorded `source_language` is Ukrainian; topic slugs keep the
Ukrainian transliteration table; Ukraine's starting language is Ukrainian.

## Consequences

- Google has indexed the Ukrainian pages at the unprefixed addresses, which now
  show Bulgarian, and the Ukrainian pages move to `/ua`. Expect a transition;
  the owner resubmits the sitemaps after the deploy.
- Sitemaps list the unprefixed, `/ua` and `/ru` addresses, and no `/bg/`
  address.
- A redirect matrix with `maxRedirects: 0` over every spelling and page family
  is the proof that nothing chains or loops.
