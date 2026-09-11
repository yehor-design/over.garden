# ADR-0029 — The address law: one permanent address per thing, one rule per question

- **Status:** Accepted (audit 2026-09-10, decisions 2026-09-11). To be executed
  as SDD Slice 27, `OVE-419` onwards.
- **Date:** 2026-09-11
- **Decision owner:** founder/owner
- **Supersedes:** ADR-0026 D8 (Addresses) in full, and the addressing half of
  ADR-0026 D9 — the canonical, `hreflang` and sitemap clauses. **D9's indexing
  rule itself stands unchanged:** an organism card whose content comes only from
  sources is reachable but `noindex` until a gardener publishes on it or the
  owner marks it. Also supersedes the "Organism addresses", "Sitemap" and
  "Robots" sections of `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`.
- **Relates to:** ADR-0022 D3 (everything public is indexable) and D4 (cache
  tags, `no-store` for private routes), ADR-0023 (`settleSection`, and why
  `notFound()` under a streamed shell answers 200), ADR-0024 (a public control
  may not depend on hydration), ADR-0026 D1–D7 and D10–D15 (unchanged).

## Context

An audit on 2026-09-10 fetched every canonical URL in the production sitemap and
compared it with the repository. It found twenty-one defects. Four are
structural, and each of the four is the visible end of the same missing thing:
no rule that says what an address *is*, applied to every surface.

The symptoms, all reproduced against production:

- No `metadataBase` is set anywhere, so every `canonical`, every `hreflang`
  alternate and every `og:url` ships as a relative path. Google supports a
  relative canonical; its `hreflang` documentation requires fully-qualified
  URLs, and the Open Graph specification requires an absolute `og:url`. The
  entire language layer the code builds is therefore inert.
- The unprefixed paths — the ones the sitemap submits — answer `307` to `/bg`
  whenever `x-vercel-ip-country` is not `UA`. The Googlebot user agent is not
  exempt; verified.
- Journal entries and topics hard-code `canonicalPath` to the unprefixed path,
  so `/bg/topics/plants` declares `/topics/plants` canonical and
  `/topics/plants` answers 307 back to `/bg/topics/plants`. A canonical that
  redirects is discarded.
- `createAtomicPublicSlug` runs `normalize("NFKD")` and then maps everything
  that is not `\p{Letter}\p{Number}` to a hyphen. NFKD decomposes **й** into
  `и + ◌̆` and **ї** into `і + ◌̈`; the combining mark is a `\p{Mark}`, so it
  becomes a hyphen. Five of the eleven live entry slugs are misspelled or split
  mid-word: `календарноі`, `сталии`, `зав-язуванням`, `деи-ствие`.

Underneath those: five different slug generators (`createAtomicPublicSlug`,
`createCatalogPublicSlug`, `buildUaStateRegisterPublicSlug`, the EU-OJ
`buildPublicSlug`, `explicitTagTopicDefinition`), of which only one implements
what ADR-0026 D8 describes — and the ingest pipeline never calls it. Three
different locale-canonical strategies. `explicitTagTopicDefinition` filters with
`/[^\w -]+/g`, and `\w` without the `u` flag is `[A-Za-z0-9_]`, so every
Cyrillic tag falls through to `tag-{sha256[0:12]}`.

None of this is fixable defect-by-defect. Twenty-one findings with twenty-one
patches would leave the same shape and grow a sixth generator by the next slice.
What is missing is one law per question, and a gate that keeps it.

Separately, the audit found the catalog contributes nothing to discovery at all:
there is no `/species` index page, no catalog entry in the site shell
navigation, and `/objects` links to zero catalog pages. The only public links
into 114,669 organism pages come from journal entries, of which there are
eleven. Entry JSON-LD carries five fields — no `author`, no `image`, no `about`.
Photo `alt` text is the entry title plus an index (`"Томат - Sep 1, 1"`), in two
different formats on one page. There is no image sitemap. `?page=999` answers
`200, index` and page 2 canonicalises to page 1.

## Decision

### D1. The two questions, answered once

**What is an address for?** It is a permanent identifier that happens to be
readable. Google uses URLs as identifiers; a slug buys a keyword hint, human
trust in a result or a shared link, and a legible label in an answer engine's
citation — nothing else. Stability first, legibility second, keywords third.

**What does a locale prefix mean?** "The main content of this page is authored
in this language." Never "the interface is in this language". The interface
language is a cookie.

Every decision below is a consequence of one of those two.

### D2. Two addresses per public entity: a permalink and a name

The **permalink** is `/id/{uuid}`: immutable, `noindex`, always 308 to the
current name, and the JSON-LD `@id` of the *thing*. The **name** is the slug
address: canonical, indexed, and the JSON-LD `@id` of the *page*. The catalog
already works this way; D2 extends it to journal entries, object passports,
topics, communities and profiles. Nothing is ever unreachable, and no address is
load-bearing for identity.

### D3. An address resolves to 200, 308 or 404, decided before the shell streams

One bounded lookup in `src/proxy.ts` commits to a status. Canonical spelling →
200. Any historical or non-canonical spelling — a retired slug, wrong case, a
trailing slash, a legacy prefix, a merged entity → **308**. Anything else → a
real **404 document**. There is no fourth outcome, and specifically no `200`
carrying a `noindex` apology, which is what Cache Components produces whenever
the decision is deferred to the page (ADR-0023).

### D4. Script follows the content

| namespace | script | source |
| --- | --- | --- |
| species, cultivar, breed | ASCII | the accepted scientific name / the registered denomination, romanized |
| journal entry, object, topic tag, community | native (uk/bg Cyrillic preserved) | the author's own words |
| profile handle | ASCII | already `^[a-z0-9][a-z0-9_]{2,29}$` |

Google states that non-Latin URLs are correct and recommended for non-Latin
sites, and renders them decoded in results. One function, two modes.

### D5. The slug budget is measured after percent-encoding

`min(60 characters decoded, 180 characters encoded)`, truncated at the last
hyphen that fits. One Cyrillic character costs six characters encoded, so the
current 96-character limit admits a 576-character segment. This is not
theoretical: `OVE-377` records Like answering `500` on 7 of 8 entries because a
capability token embedded a Cyrillic slug and overflowed its own bound. 60
decoded characters is about four Ukrainian words.

### D6. The disambiguator is a counter, never a hash

`-2`, `-3`, … against every slug the namespace has ever issued — the rule
`assignCatalogSlug` already implements against `catalog_item_slug_history`. No
UUID tail, no SHA prefix, no source registry's application number. A random
suffix destroys the only thing the slug was for.

Corollary: within one species, two cultivars named *Advance* are almost
certainly the same cultivar from two registers, so a catalog collision counter
is a reconciliation signal (ADR-0026 D4) and is counted as one.

### D7. The slug namespace matches the path namespace

Forms live at `/species/{species}/{form}`, so a form slug is unique **within its
species**. `buildTakenCatalogSlugsQuery` enforces global uniqueness across both
namespaces today; that was necessary while a bare `/species/{x}` could mean
either a species or a legacy form, and it stops being necessary once every form
has a species parent. Until then it manufactures `-2` for names that never
collide.

### D8. A slug is frozen at publish; a rename is an explicit act with a 308

Titles are editable and the slug does not follow — already true, now stated.
Changing an address is a deliberate action that writes a history row and starts
answering 308 from the old address, the way the `0054` trigger does for catalog
items.

### D9. The address map

| entity | address | locales |
| --- | --- | --- |
| journal entry | `/@{handle}/{slug}` | none |
| object passport | `/@{handle}/objects/{slug}` | none |
| species | `/species/{slug}` | uk · bg · ru |
| cultivar, breed | `/species/{species}/{form}` | uk · bg · ru |
| topic | `/topics/{slug}` | uk · bg · ru |
| community | `/communities/{slug}` | uk · bg · ru |
| profile | `/@{handle}` | uk · bg · ru |
| editorial | `/blog/…`, `/guides/…`, `/answers/…`, `/markets/…` | uk · bg · ru |
| directories | `/journals`, `/objects`, `/feed`, `/knowledge`, `/communities` | uk · bg · ru |
| permalink and aliases | `/id/{uuid}`, `/eppo/…`, `/col/…`, `/gbif/…`, `/wikidata/…` | n/a |

`objects` is a reserved entry slug. Depth never exceeds three segments after the
locale prefix.

The author-scoped namespace is why the random suffix disappears: a flat
`/journal/{slug}` namespace is global, so "мій перший помідор" collides across
gardeners and *forces* a disambiguator into every URL. Scoping to the handle
makes collisions per-person and rare. It also puts the first-hand claim — the
product's whole proposition — where a reader and an answer engine both see it.
Handles are immutable today (`handle_registry_state` is CHECK-constrained to
`'current'`), so a future rename needs one prefix-level 308 rule, not a row per
entry.

### D10. Locale, and geography

A locale prefix exists only where a translation of the page's **main content**
exists. Editorial pages are translated by hand; a directory's, profile's,
community's, topic's and organism card's chrome *is* that page's own content and
is translated. A gardener's entry and an object passport are never translated:
one address, `lang` from the author's language, no `hreflang`.

Every served URL is its own canonical. `hreflang` is absolute, lists only the
locales the page really has, and carries `x-default` on `uk`.

**Geography suggests; it never redirects.** A canonical URL answers 200 to
everyone. A visitor whose language differs gets a banner and the existing
switcher. `hreflang` is the mechanism for showing a Bulgarian searcher the
Bulgarian page, and it only works if the alternate is not itself a redirect —
the present geo-307 does not coexist with `hreflang`, it disables it.

### D11. Feeds are language-blind (owner decision, 2026-09-11)

No listing is ever filtered by content language. No language badge, chip or
marker appears on any card. No same-language ranking boost. Entries in every
language stay side by side, in one chronological order, and nothing disappears
when the interface language changes.

Three translated chrome pages over one shared multilingual list is what
`hreflang` is for, not duplication — the defect is the missing `hreflang`, not
the three copies. `public-journal-directory-query.ts` has no language predicate
today; adding one would have been a regression.

`journal_entries.source_language` becomes `NOT NULL`, written at publish. It is
**server-side only**: it drives `lang` on the entry element and `inLanguage` in
JSON-LD, and nothing else. Today a Ukrainian entry renders inside a `lang="bg"`
document, so screen readers apply Bulgarian phonetics to Ukrainian text and
Google records the wrong content language.

### D12. One declaration generates the validator, the constraint and the lint

`src/lib/address/address-manifest.ts` is the sole declaration: one entry per
namespace giving script, budget, reserved words and shape. `pnpm
address:contract:build` emits the TypeScript guard, the SQL `CHECK` and the
banned-literal rule, the way `job-queue-manifest.ts` and `pnpm
queue:contract:build` already work. Neither generated artifact is hand-edited.

This is what stops a sixth generator, and it is why the existing 82-case
romanization fixture passes today on a function the ingest pipeline never calls.

### D13. Discovery and the entity graph

Addressing is half of discovery. These six are the other half, approved
2026-09-11:

1. **Connect the graph.** An entry carries `about → {"@id": "/id/{catalogItemId}"}`,
   `author → Person @id = the profile URL`, `image`, `inLanguage`,
   `dateModified`, `publisher` and a `BreadcrumbList`; an organism card carries
   `subjectOf` back. Entry JSON-LD carries five fields today and asserts neither
   authorship nor subject. This is the highest-value item in the ADR: it turns
   114,669 identified organisms beside first-hand accounts into one traversable
   graph.
2. **A front door for the catalog.** A `/species` browse hierarchy and a catalog
   entry in the site shell. 114,669 pages currently have no inbound internal
   link and are discoverable only from the sitemap.
3. **Photographs.** A gardener-written caption becomes the `alt`; `ImageObject`
   in the graph; `<image:image>` in the sitemap. Photos are the content of a
   gardening record and image search is a first-class channel for it.
4. **Aggregation hubs worth indexing.** Pages built from catalog data that are
   substantive on their own — "621 сортів томата в Держреєстрі України" — a few
   hundred of them, not a hundred thousand. They are also the crawl path into
   the catalog. D9's `noindex` rule for bare source-built cards stands.
5. **IndexNow.** Bing and Yandex are a materially larger share in Ukraine and
   Bulgaria than in Western markets, and both accept IndexNow. It attaches to
   the existing revalidation path.
6. **Bounded pagination.** Past the last page → 404. A paginated page
   self-canonicalises rather than pointing at page 1. Filter combinations do not
   multiply into crawlable space.

### D14. Rejected

- **`llms.txt`.** Google confirmed in 2025 that it does not support it and does
  not plan to, and its 2026 generative-AI guidance lists it among things not
  needed. A 90-day observation of ~500M AI-crawler visits recorded 408 fetches
  of the file; of the fifty most-cited domains, one has it.
- **Language chips and language filtering** (D11) — owner decision.
- **Keyword-stuffed slugs.** URLs are identifiers; length does not rank, and
  under D5 it costs six characters per Cyrillic letter.
- **A second markup vocabulary** beside JSON-LD.
- **`/@{handle}/{object}/{entry}`** — four levels, and it moves entry addresses
  whenever a plant is renamed.
- **Indexing the source-built catalog** to use its scale. A hundred thousand
  pages reading "*Bactrocera dorsalis* — вид" is thin content; ADR-0026 D9 was
  right and stands.

### D15. Migration path

Ordered so nothing moves before the layer that catches it exists.

| phase | contents | reversible |
| --- | --- | --- |
| 0 | `metadataBase` and absolute URLs; sitemap stops emitting `noindex` URLs; sitemap chunks counted in URLs; `robots.txt` reconciled; Open Graph completed | yes, no address moves |
| 1 | geo-307 removed; one canonical rule; `hreflang` everywhere it belongs; the unprefixed family renders `uk`; `source_language` and `lang` | yes |
| 2 | the address manifest and one slugifier, which generates the `CHECK` `journal_entries.public_slug` has never had; topic tags; `publicCommunityPath` and the banned-literal lint; proxy-decided 404s; case 308; the two missing route halves; bounded pagination | yes, new content only |
| 3 | `journal_entry_slug_history`; the backfill of every entry and ~101,619 catalog addresses behind 308s; resubmitted sitemap index | no |
| 4 | D13: the entity graph, the catalog front door, image captions and image sitemap, aggregation hubs, IndexNow | yes |

Phase 3 is a bulk write to production and falls under `AGENTS.md` hard rule 10:
it needs a separate explicit sign-off at the moment it runs, after the redirect
layer is proven on a disposable database.

## Consequences

- Two addresses per public thing, and a slug history table per namespace. That
  is more schema than the current design and it is the price of never breaking a
  link.
- Entry addresses couple to the handle. Handles cannot change today; when they
  can, the rename is one prefix rule.
- The proxy does one more bounded lookup on more route families. The catalog
  lookup's budget (400 ms statement deadline, ADR-0026) is the precedent.
- Phase 1 changes response codes on paths that currently redirect. Shared
  `/bg/journal/…` links keep working, through a 308 instead of a 200.
- `hreflang` becoming functional is itself a behaviour change: Google may start
  serving `/bg/…` to Bulgarian searchers where it previously served the
  unprefixed page, or the reverse.
- Phase 4 adds indexable aggregation pages. Each is an owner-facing surface and
  is approved individually before it reaches the menu.

## Superseded clauses

| document | clause | replaced by |
| --- | --- | --- |
| ADR-0026 | D8 Addresses, in full | D2–D9 |
| ADR-0026 | D9, the canonical/`hreflang`/sitemap sentences only | D10 |
| `PUBLIC_SEO_AEO_SURFACE_POLICY.md` | "Organism addresses" | D9 |
| `PUBLIC_SEO_AEO_SURFACE_POLICY.md` | "Sitemap" | D15 phase 0, D13 |
| `PUBLIC_SEO_AEO_SURFACE_POLICY.md` | "Robots" | D15 phase 0 |

ADR-0026 D9's indexing rule, D1–D7 and D10–D15 stand unchanged.

## Rollout and rollback

Phases 0, 1, 2 and 4 are ordinary branches with ordinary rollbacks: revert the
commit. Phase 3 is not — once an address moves and a 308 is live, reverting the
backfill would break links the 308 has already taught. Its rollback is forward:
the history table holds every slug an entity ever had, so a bad backfill is
corrected by assigning the intended slug, which writes another history row and
leaves both old addresses answering 308.

Production proof per phase: `curl -sI` on one canonical address of each route
family for the status; the emitted `canonical`, `hreflang` and JSON-LD of one
live entry and one organism card; one sitemap chunk checked against the pages it
lists.

## Rejected alternatives

**Patch the twenty-one findings individually.** Leaves five slug generators and
three locale strategies in place, and the next slice adds a sixth. The manifest
in D12 is the only durable answer.

**Keep `/journal/{slug}` flat and fix the suffix.** A global namespace forces a
disambiguator forever. The suffix cannot be removed without scoping the
namespace.

**Prefix everything, including `uk`.** Would move every current address for a
consistency the `hreflang` layer already provides, and the unprefixed family is
the one with links pointing at it.

**Keep the geo-307 but only on `/`.** Halves the damage and keeps the mechanism.
Since `/` is the most-linked URL on the site, making it a redirect wastes the
authority it has, and `hreflang` plus `x-default` already tells a search engine
which homepage to show.
