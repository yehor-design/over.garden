# ADR-0029 — The address law: one permanent address per thing, one rule per question

- **Status:** Accepted (audit 2026-09-10, decisions 2026-09-11). To be executed
  as SDD Slice 27, `OVE-419` onwards. **Amended 2026-09-18 by two owner
  decisions: every address is ASCII, and a journal entry is addressed by a
  number** — D4, D5, D6, D8, D9, D14 and D15 each carry the change where it
  lands, and phase 5 of D15 is its execution.
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

### D4. Every address is ASCII

| namespace | the address is made of | source |
| --- | --- | --- |
| species, cultivar, breed | a Latin name | the accepted scientific name / the registered denomination, romanized |
| journal entry | a number | the author's own count of publishes (D9) |
| object, topic tag, community | a Latin name | the author's own words, romanized by the language they were written in |
| profile handle | unchanged | already `^[a-z0-9][a-z0-9_]{2,29}$` |

No address this product issues contains a character that percent-encodes. One
slugifier, one mode that issues.

**Amendment, 2026-09-18 (owner decision). What D4 said, and why it was wrong.**
D4 was titled "Script follows the content". It kept the gardener's own alphabet
in the address of an entry, an object, a topic tag and a community, on the
ground that Google recommends non-Latin URLs for non-Latin sites and renders
them decoded in results. That is true, and it is a statement about one surface:
the search result. D4 never looked at the other one. A browser's address bar
hands the clipboard the percent-encoded form, six characters for every Cyrillic
letter, so the entry a gardener copied to send to a neighbour arrived as

`https://over.garden/@yehor/%D0%BA%D1%80%D0%B0%D1%82%D1%8A%D0%BA-%D0%B8-…`

— 181 characters that read as a broken or hostile link. The product has no
share control, so the address bar is how every link travels, and D5 already
knew the cost: it measured the slug budget after percent-encoding because of
`OVE-377`. It treated the cost as a length to budget for rather than as the
thing a reader sees. D1 ranks legibility second only to stability, and on the
surface where links are actually exchanged a native-script address has less
legibility than an opaque one.

The romanization tables were already written for the catalog
(`src/lib/address/romanize.ts`: the Cabinet of Ministers resolution 55 of 2010
for Ukrainian, the 2009 transliteration law for Bulgarian, and the Bulgarian
table for Russian). A name is romanized by the language it was written in,
never by a constant: Bulgarian `домати` is `domati`, and the Ukrainian table
would have spelled it `domaty`.
Addresses issued in the native script before this amendment keep answering,
with one 308 each (D3, D8).

### D5. The slug budget is measured after percent-encoding

`min(60 characters decoded, 180 characters encoded)`, truncated at the last
hyphen that fits. One Cyrillic character costs six characters encoded, so the
current 96-character limit admits a 576-character segment. This is not
theoretical: `OVE-377` records Like answering `500` on 7 of 8 entries because a
capability token embedded a Cyrillic slug and overflowed its own bound. 60
decoded characters is about four Ukrainian words.

Since the amendment of 2026-09-18 every issued slug is ASCII, so the two bounds
coincide at sixty characters. The encoded bound stays as the guard it was, and
it is what an address from before the amendment is still measured against.

### D6. The disambiguator is a counter, never a hash

`-2`, `-3`, … against every slug the namespace has ever issued — the rule
`assignCatalogSlug` already implements against `catalog_item_slug_history`. No
UUID tail, no SHA prefix, no source registry's application number. A random
suffix destroys the only thing the slug was for.

Corollary: within one species, two cultivars named *Advance* are almost
certainly the same cultivar from two registers, so a catalog collision counter
is a reconciliation signal (ADR-0026 D4) and is counted as one.

A journal entry needs no disambiguator since 2026-09-18: its address is a
number (D9), and two numbers under one author cannot collide.

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

An entry's number goes further than frozen (2026-09-18): nothing can rename it
at all. The title is the only part of an entry a gardener might want to
correct, and the address no longer contains it — a typing mistake in the first
title used to live in the link for ever.

### D9. The address map

| entity | address | locales |
| --- | --- | --- |
| journal entry | `/@{handle}/post/{n}` | none |
| object passport | `/@{handle}/objects/{slug}` | none |
| species | `/species/{slug}` | uk · bg · ru |
| cultivar, breed | `/species/{species}/{form}` | uk · bg · ru |
| topic | `/topics/{slug}` | uk · bg · ru |
| community | `/communities/{slug}` | uk · bg · ru |
| profile | `/@{handle}` | uk · bg · ru |
| editorial | `/blog/…`, `/guides/…`, `/answers/…`, `/markets/…` | uk · bg · ru |
| directories | `/journals`, `/objects`, `/feed`, `/knowledge`, `/communities` | uk · bg · ru |
| permalink and aliases | `/id/{uuid}`, `/eppo/…`, `/col/…`, `/gbif/…`, `/wikidata/…` | n/a |

`objects` and `post` are reserved entry names. Depth never exceeds three
segments after the locale prefix.

The author-scoped namespace is why the random suffix disappeared: a flat
`/journal/{slug}` namespace is global, so "мій перший помідор" collides across
gardeners and *forces* a disambiguator into every URL. Scoping to the handle
makes collisions per-person and rare. It also puts the first-hand claim — the
product's whole proposition — where a reader and an answer engine both see it.
Handles are immutable today (`handle_registry_state` is CHECK-constrained to
`'current'`), so a future rename needs one prefix-level 308 rule, not a row per
entry.

**Amendment, 2026-09-18 (owner decision): an entry is addressed by its
number.** Between 2026-09-12 and this amendment an entry lived at
`/@{handle}/{slug}`, its name made from the title at first publish. It now
lives at `/@{handle}/post/{n}`:

- `n` is a plain decimal number, counted **per author** from 1. `/@yehor/post/1`
  and `/@olena/post/1` are two entries; the handle tells them apart, the way a
  flat number does in every building. A site-wide counter would have been
  longer, would say nothing about the author, and would publish the size of the
  platform in every link.
- It is assigned at publish, in publish order, and it says nothing about the
  date the entry describes.
- It never changes, and it is **never reused**. When entry 5 is deleted the
  next one is still 13, and `/post/5` answers 410 and then 404 — never somebody
  else's entry. A durable counter per author guarantees this; `max() + 1` would
  hand a purged entry's number to the next publish.
- Entries that existed on the day of the amendment are numbered by publish
  date, oldest first.
- Digits only. The owner's first sketch was `A1`; every alphabet in the address
  law is lower case and an upper-case address is itself a 308, so `A1` would
  have redirected on arrival. A random code such as `k3f9x2` was offered and
  declined: it cannot be guessed, and it also cannot be said aloud or
  remembered, and everything here is public by rule (`AGENTS.md`, hard rule 4).
  **If the product ever grows an entry that is not public, a guessable number
  is the first thing to revisit.**
- `post` keeps the numbers out of the namespace the names used, so every
  `/@{handle}/{slug}` ever issued is still unambiguous and still answers.

The one-hop rule: `/journal/{slug}`, `/{locale}/journal/{slug}`,
`/@{handle}/{slug}` and `/{locale}/@{handle}/{slug}` each answer **one** 308 to
`/@{handle}/post/{n}`. A chain is a defect — this is the third address these
entries have had in a week, and a crawler follows a finite number of hops.

What does not change: D2's permalink; the 200/308/404 rule of D3; one address
with no locale prefix (D10); `source_language` driving `lang` and `inLanguage`
(D11). Engagement references have been entry ids since migration `0073`, so a
like, a comment and a bookmark stay where they are.

The closed vocabulary the implementing tasks share, so that none invents its
own: the path segment `post` (`PUBLIC_JOURNAL_ENTRY_SEGMENT`); the column
`journal_entries.author_entry_number`; the table
`journal_entry_number_counters`; the function
`assign_journal_entry_number(uuid)`; the manifest namespace
`journalEntryNumber` with the shape `ordinal`; the pattern `^[1-9][0-9]{0,8}$`;
the matcher kinds `journalEntry` (a number) and `legacyJournalEntry` (a name).

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

**Amendment, 2026-09-17: a canonical address renders in the reader's
language.** D10 said what the *status* must be and was read as settling the
*language* too, so an unprefixed address rendered in Ukrainian for everyone.
An entry, a profile and an object passport have no prefixed spelling to escape
to, so a reader in Bulgaria read every gardener's entry in a Ukrainian
interface, and the language control — which took the market from the prefix —
was not drawn on those pages at all.

The status rule is unchanged: 200, at the address asked for, for everyone. The
subtree that renders it is now the reader's. Their language is a cookie, set by
their country on a first visit and by their own choice afterwards; a locale
prefix in an address is that choice, written back to the cookie, and `/uk/…`
still folds to the canonical spelling. What the reader sees therefore follows
them across every page, including the workspace, while the addresses stay
exactly as this ADR defines them: `/bg/…` and `/ru/…` remain real, indexable
addresses, and the `hreflang` cluster is untouched.

Two consequences are deliberate. An unprefixed page served to a reader with a
preference carries the canonical of the twin that rendered it, so a crawler —
which carries no preference and no country — still sees the Ukrainian page at
`/journals` with a self-referential canonical. And the market no longer follows
from the prefix: every market offers all three languages (owner decision,
2026-09-17), so the prefix says what a reader chose and the country says where
they are.

### D11. Feeds are language-blind (owner decision, 2026-09-11)

No listing is ever filtered by content language. No language badge, chip or
marker appears on any card. No same-language ranking boost. Entries in every
language stay side by side, in one chronological order, and nothing disappears
when the interface language changes.

Three translated chrome pages over one shared multilingual list is what
`hreflang` is for, not duplication — the defect is the missing `hreflang`, not
the three copies. `public-journal-directory-query.ts` has no language predicate
today; adding one would have been a regression.

`journal_entries.source_language` is written at publish. It is
**server-side only**: it drives `lang` on the entry element and `inLanguage` in
JSON-LD, and nothing else. Today a Ukrainian entry renders inside a `lang="bg"`
document, so screen readers apply Bulgarian phonetics to Ukrainian text and
Google records the wrong content language.

**Amendment, 2026-09-11.** This decision said the column becomes `NOT NULL`.
Migration `0067` shipped without it, and the constraint admits `ru` as well as
uk/bg. Two facts found by executing the migration rather than reasoning about
it. `ru` is a real authoring language — `BULGARIA_PUBLIC_LOCALES` is (bg, ru),
so a gardener holds a Russian interface and writes in Russian — and the
development database already held such entries. And `NOT NULL` cannot be set
while rows exist that no statement can write to:
`journal_entries_lifecycle_state_check` and
`journal_entries_deletion_retention_check` are both `NOT VALID`, so the
sixteen rows left in the retired `archived` state reject every `UPDATE`, and
`SET NOT NULL` scans the whole table. Requiring the value is blocked on
deciding what an `archived` entry is in a schema that no longer admits that
state, which is a separate decision. Until then the render path treats a null
as the default locale and the publish path never writes one. Production holds
no such row (`docs/PRODUCTION_SCHEMA_STATE.md`, 2026-09-11).

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
- **A number with a readable tail — `/@{handle}/post/12-kratak-zapis`**
  (2026-09-18). It is the shape Stack Overflow and Medium use, and it gives
  every entry two spellings, so one of them is a redirect for ever; it makes the
  link long again, which is what the owner asked to end; and it brings the
  rename question back for a part of the address that identifies nothing. A
  diary title is a poor keyword besides — the words a searcher types belong to
  the organism and the topic pages, whose addresses do carry them.
- **Native-script names** (2026-09-18) — D4 as first written. See its amendment.
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
| 5 | the amendment of 2026-09-18: entry numbers and `/@{handle}/post/{n}` with every older address behind one 308; Latin names for object passports, topics and communities behind 308s; then the entry name stops being issued | no |

Phase 3 is a bulk write to production and falls under `AGENTS.md` hard rule 10:
it needs a separate explicit sign-off at the moment it runs, after the redirect
layer is proven on a disposable database. Phase 5 is the same kind of write and
carries the same condition, once for the entry numbers and once for the Latin
names.

Phase 5 keeps issuing the entry's name until its last task. Some twenty readers
spell "this entry has a public address" as `public_slug is not null`; moving
the address and flipping that predicate in one change would have made a single
failure impossible to attribute. The name is retired only when every active
entry in production already holds a number.

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
- Phase 5 moves entry addresses for the third time in a week. It is affordable
  because the audit of 2026-09-10 counted eleven live entries, and it is the
  last time it will be: a number has nothing in it that a later decision could
  want to change.
- A bare entry link no longer says what the entry is about. Where links are
  exchanged a preview card carries the title and the photograph, and in a
  search result the title and the breadcrumb do; the address was never the
  place a reader learned it from.
- An author's highest entry number is roughly their count of publishes, which
  the profile already shows. Numbers are trivially enumerable, which costs
  nothing while every entry is public and in the sitemap.

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
