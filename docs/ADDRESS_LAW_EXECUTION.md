# SDD Slice 27 — the address law: execution runbook

The executor's companion to `docs/adr/ADR-0029-address-law.md`. The ADR says
what is decided; this file says what to do, in what order, and what each task
must prove. Read the ADR first.

Evidence for every "today" claim below is the audit of 2026-09-10, which fetched
every canonical URL in the production sitemap. Reproduce any of it with the
`curl` line beside it.

## Status of the task list

Linear holds `OVE-419` … `OVE-422`. The workspace then hit the free-plan issue
limit (`You've exceeded the free issue limit for this workspace`, 2026-09-11),
so tasks 5 through 16 live here in the same seven-section shape and move to
Linear when the limit lifts. Numbering below is positional, not a Linear id.

| # | Linear | Phase | Task |
| --- | --- | --- | --- |
| 1 | `OVE-419` | — | The address law: record ADR-0029 |
| 2 | `OVE-420` | 0 | Every URL absolute, Open Graph finished |
| 3 | `OVE-421` | 0 | Sitemap stops submitting `noindex`; robots.txt reconciled |
| 4 | `OVE-422` | 1 | Geography stops redirecting; canonical = URL served |
| 5 | — | 1 | `hreflang` everywhere it belongs, nowhere it does not |
| 6 | — | 1 | Content language: `source_language`, `lang`, `inLanguage` |
| 7 | — | 2 | The address manifest and one slugifier |
| 8 | — | 2 | Topic tags, the community path builder, the banned-literal lint |
| 9 | — | 2 | Proxy-decided 404s, case 308, the two missing route halves, bounded pagination |
| 10 | — | 3 | Entry and passport addresses move to `/@{handle}` |
| 11 | — | 3 | The catalog re-slug backfill |
| 12 | — | 4 | The entity graph |
| 13 | — | 4 | A front door for the catalog |
| 14 | — | 4 | Photographs |
| 15 | — | 4 | Aggregation hubs worth indexing |
| 16 | — | 4 | IndexNow |

Phases are ordered so nothing moves before the layer that catches it exists.
Within a phase, tasks are independent unless a Dependencies line says otherwise.

---

## 5. `hreflang` everywhere it belongs, and nowhere it does not

**Outcome.** Every page that genuinely exists in more than one language declares
its siblings; every page that exists in one declares none. Three near-duplicate
homepages stop competing with each other.

**Owner decisions.** ADR-0029 D10. Audit finding LOC-01.

**Scope.** In: `equivalentLocales` corrected per family. Six families pass
`[locale]` — a one-element list, and `buildPublicSurfaceMetadata` only emits
alternates above one — so home, profile, community detail, journals, objects and
the communities index emit no `hreflang` at all today. Pages whose chrome is
translated pass `PUBLIC_LOCALES`; a gardener's entry and an object passport pass
`[]`. `x-default` on `uk`. Review `ru` against the market: it targets Russian
speakers globally, not Bulgaria's. Out: `metadataBase` (task 2); canonical
selection (task 4).

**Key files.** `src/app/[locale]/page.tsx`, `[profileHandle]/page.tsx`,
`communities/[slug]/page.tsx`, `journals/page.tsx`, `objects/page.tsx`,
`communities/page.tsx`; `src/lib/public-localization.ts`.

**Acceptance.** `/`, `/bg`, `/ru` each list all three plus `x-default`. An entry
emits none. Every alternate, fetched, returns 200 and names the fetching page
among its own alternates — reciprocity is what Google requires. No alternate is
a redirect.

**Proof.** One page per family: fetch, follow every alternate, assert 200 and
reciprocity.

**Dependencies.** Tasks 2 and 4.

---

## 6. Content language: `source_language`, `lang`, `inLanguage`

**Outcome.** Each entry declares the language it was written in, and the page
says so honestly. A Ukrainian entry stops being served inside a `lang="bg"`
document.

**Owner decisions.** ADR-0029 D11. **Server-side only: no language badge, chip
or marker on any card, and no listing filtered by content language, ever.**

**Scope.** In: `journal_entries.source_language` written at publish and made
`NOT NULL` (it exists, is nullable, is CHECK-constrained to `uk`/`bg`, and is
written by nothing but the deletion path); `lang` on the entry element from it;
`inLanguage` in the entry's JSON-LD; the unprefixed route family renders `uk`
rather than the cookie locale, so the shared CDN copy stops serving one visitor's
language to everyone. Out: any user-visible language affordance. Any change to
ordering or filtering — `public-journal-directory-query.ts` has no language
predicate and gains none.

**Key files.** `apps/web/sql/00XX_source_language.sql`,
`src/server/journal-repository.ts`, `src/app/catalog-evidence-route.tsx:107`,
the entry page and layout.

**Acceptance.** Every public entry row has a language. The entry page's `lang`
matches it. `curl -sb 'overgarden_interface_locale=uk'` on an unprefixed catalog
URL returns a Ukrainian document — today it returns a Bulgarian one from cache,
with `<html lang="uk">` and `Content-Language: bg`. No new visible control.

**Proof.** The `curl` above; one entry's JSON-LD showing `inLanguage`; a
screenshot of an entry card before and after, identical.

**Dependencies.** Task 4.

---

## 7. The address manifest and one slugifier

**Outcome.** One declaration describes every slug namespace, and generates the
TypeScript guard, the SQL `CHECK` and the lint rule. The five generators become
one function.

**Owner decisions.** ADR-0029 D4, D5, D6, D12.

**Scope.** In: `src/lib/address/address-manifest.ts` — one entry per namespace
with script, budget, reserved words, shape; `pnpm address:contract:build`
emitting the guard, the constraint and the banned-literal rule, the way
`job-queue-manifest.ts` and `pnpm queue:contract:build` already do; one
`slugify(text, { script, language })` implementing D4/D5 — **`NFC`, never
`NFKD`**, apostrophes dropped before the separator pass, budget
`min(60 decoded, 180 encoded)` truncated at a hyphen; the generated `CHECK` on
`journal_entries.public_slug`, the only slug column that has never had one.
Retire `createAtomicPublicSlug`, `createCatalogPublicSlug`,
`buildUaStateRegisterPublicSlug` and the EU-OJ `buildPublicSlug`. Out: moving
any existing slug (tasks 10, 11).

**Acceptance.** The 82-case romanization fixture runs against the function the
ingest pipeline actually calls. `Полив без календарної пастки` →
`полив-без-календарної-пастки`, with `ї` intact — today
`полив-без-календарноі-пастки-5364380c26`. `Обкладинка як сталий орієнтир
сезону` keeps `сталий` and truncates at the budget. `действие` is not split.
No generated file is hand-edited; CI fails if a regenerated file differs.

**Proof.** The fixture; a `psql` transaction inserting a bad slug and being
refused by the generated `CHECK`, rolled back.

**Dependencies.** Task 1.

---

## 8. Topic tags, the community path builder, the banned-literal lint

**Outcome.** A gardener's own word becomes the topic address, and no call site
spells a public path by hand.

**Owner decisions.** ADR-0029 D4, D12. Audit findings SLG-02, SLG-05.

**Scope.** In: `explicitTagTopicDefinition` routes through the shared slugifier —
its filter is `/[^\w -]+/g`, and `\w` without the `u` flag is `[A-Za-z0-9_]`, so
`помідори` becomes `tag-81e9f6d3034d` today and every Cyrillic tag is an opaque
hash; the `journal_topics.slug` CHECK widens to the manifest's native-script
shape; `publicCommunityPath` is added and the roughly ten inline
`` `/topics/${slug}` ``, `` `/communities/${slug}` `` and
`` `/journal/${item.publicSlug}` `` literals go through the builders; a lint rule
bans those literals, in the shape of the existing banned-dependency gate.

**Acceptance.** `помідори` → `/topics/помідори`. Existing `tag-*` slugs keep
working through the history table. The lint fails on a reintroduced literal.

**Proof.** Unit fixture; `pnpm test`; the lint failing on a deliberate
reintroduction.

**Dependencies.** Task 7.

---

## 9. Proxy-decided 404s, case 308, the missing route halves, bounded pagination

**Outcome.** Every public address resolves to 200, 308 or 404. Nothing answers
200 with a `noindex` apology, and no filter combination opens crawlable space.

**Owner decisions.** ADR-0029 D3. Audit findings ADR-04, ADR-05, ADR-06.

**Scope.** In: the proxy's bounded lookup extended to journal entries, topics,
communities and profiles; a 308 to the lower-case address beside the existing
trailing-slash rule — `/bg/topics/PLANTS` and `/bg/@YEHOR` answer `200, index,
follow` today, so every case variant is a crawlable duplicate; section roots
`/species` and `/variety` get a real page or a real 404 instead of the current
`200` + `noindex`; `lineage/objects/[objectId]` gains its `[locale]` half — it
answers `500` today — and `communities/[slug]/discussions/[contributionId]` its
unprefixed half, which currently 307s to `/bg` and loses the destination;
pagination past the last page answers 404, and a paginated page
self-canonicalises rather than pointing at page 1.

**Acceptance.** `/bg/topics/PLANTS` → 308. `/bg/lineage/objects/{uuid}` → 200 or
404, never 500. `/bg/journals?page=999` → 404; today it is `200, index, follow`.
`?page=2` canonicalises to itself.

**Proof.** A table of `curl -sI` results across the families, before and after.

**Dependencies.** Task 7.

---

## 10. Entry and passport addresses move to `/@{handle}`

**Outcome.** A journal entry lives at `/@{handle}/{slug}` and an object passport
at `/@{handle}/objects/{slug}`, each at exactly one address, with every previous
address answering 308 forever.

**Owner decisions.** ADR-0029 D9, D10, and owner decisions D1/D2 of 2026-09-11.

**Scope.** In: `journal_entry_slug_history` with the trigger
`catalog_item_slug_history_sync` is modelled on; recomputation of every existing
entry slug through the task-7 slugifier, with the random suffix dropped and the
author namespace supplying uniqueness; `objects` reserved as an entry slug;
`/journal/{slug}`, `/bg/journal/{slug}`, `/ru/journal/{slug}` and
`/lineage/objects/{uuid}` answering 308; `publicJournalEntryPath` and the
Meilisearch projection following. Out: the catalog (task 11).

**Acceptance.** Every one of the eleven live entries reachable at its old
address through a 308 and at its new address with 200. No entry has a
disambiguating suffix unless a same-author collision produced `-2`. The
Meilisearch parity gate passes.

**Proof.** Old → new for all eleven, by `curl -sI`; the search parity gate; the
sitemap regenerated and every `<loc>` fetched at 200.

**Dependencies.** Tasks 7, 9. **Bulk production write — hard rule 10 sign-off at
the moment it runs.**

---

## 11. The catalog re-slug backfill

**Outcome.** Organism addresses carry the name and nothing else:
`/species/solanum-lycopersicum/advance`, not
`/species/solanum-lycopersicum-species-backbone/advance-ua-register-09040016`.

**Owner decisions.** ADR-0029 D6, D7, D9; ADR-0026 D8's original intent, which
the ingest pipeline never implemented.

**Scope.** In: recomputation of every `catalog_items.public_slug` through the
task-7 slugifier and `assignCatalogSlug`, so the `0054` trigger writes the
history and the existing resolver answers the 308; the form namespace scoped per
species (D7); the `-species-backbone` and `eu-oj-` prefixes and the
`-ua-register-{n}` suffixes removed; collision counters recorded as
reconciliation signals. Roughly 101 619 addresses.

**Acceptance.** A sample of 100 old addresses all answer 308 to the new one. The
catalog sitemap chunk lists only canonical addresses. No two organisms share a
slug within a species. Picker and typeahead unaffected.

**Proof.** The backfill rehearsed on a disposable database first, with row counts
before and after; then production, then 100 sampled `curl -sI`; sitemap index
resubmitted.

**Dependencies.** Tasks 7, 10. **Bulk production write — hard rule 10 sign-off at
the moment it runs.** Note `docs/production-probes-need-a-timeout.md`: bound
every statement.

---

## 12. The entity graph

**Outcome.** An entry says what it is about and who wrote it, and an organism
card says what has been written about it. The highest-value item in the slice.

**Owner decisions.** ADR-0029 D13 item 1.

**Scope.** In: entry JSON-LD gains `about → {"@id": "/id/{catalogItemId}"}`,
`author → Person` with `@id` the profile URL, `image`, `inLanguage`,
`dateModified`, `publisher` and a `BreadcrumbList`; the organism card gains
`subjectOf`; `ProfilePage → mainEntity → Person`; site-level `Organization` and
`WebSite`. Today an entry's whole graph is `WebPage{name}` plus
`BlogPosting{headline, datePublished}` — five fields, no author, no subject, no
image, though the entry has two photos.

**Acceptance.** Every fact in the graph is visible on the page (ADR-0022 D3).
The `@id` of a thing is its permalink; the `@id` of a page is its canonical.
Google's Rich Results Test reports no error on an entry and on an organism card.

**Proof.** The JSON-LD of one live entry and one card, before and after; a
traversal from entry `about` to the card and back through `subjectOf`.

**Dependencies.** Tasks 6, 10.

---

## 13. A front door for the catalog

**Outcome.** The catalog is reachable by clicking. 114 669 organism pages have
no inbound internal link today and are discoverable only from the sitemap.

**Owner decisions.** ADR-0029 D13 item 2.

**Scope.** In: a `/species` browse hierarchy a crawler can walk; a catalog entry
in the site shell — `site-shell-navigation.ts` has none; links from `/objects`,
which contains zero catalog links. Out: changing ADR-0026 D9's `noindex` rule
for bare source-built cards; it stands.

**Acceptance.** Every indexable organism page is reachable from `/` in four
clicks or fewer. The browse pages obey the empty-listing `noindex` rule. **New
owner-facing surface: approved individually before it reaches the menu.**

**Proof.** A crawl from `/` with JavaScript disabled, reporting depth to a
sample of organism pages.

**Dependencies.** Task 11.

---

## 14. Photographs

**Outcome.** A gardener's photographs are findable. They are the content of a
gardening record, and image search is a first-class channel for it.

**Owner decisions.** ADR-0029 D13 item 3.

**Scope.** In: a caption field in the composer, which becomes the `alt` — today
`alt` is the entry title plus an index, in two different formats on one page
(`"Томат - Sep 1, 1"` and `"Томат - Sep 1 1"`); `ImageObject` in the entry
graph; `<image:image>` in the entries sitemap chunk. Out: server-side image
processing, which ADR-0022 forbids.

**Acceptance.** An uncaptioned photo gets a useful fallback, never a numbered
one. The sitemap validates against the image extension schema. The composer
change is keyboard-reachable and needs no hydration to submit (ADR-0024).

**Proof.** One entry's rendered `alt` values and sitemap entry; a composer
screenshot.

**Dependencies.** Tasks 10, 12.

---

## 15. Aggregation hubs worth indexing

**Outcome.** A few hundred pages built from catalog data that are substantive on
their own — "621 сортів томата в Держреєстрі України" — rather than a hundred
thousand thin ones.

**Owner decisions.** ADR-0029 D13 item 4. ADR-0026 D9 stands: a bare
source-built card stays `noindex`.

**Scope.** In: the hub template, its indexing rule, and its place in the browse
hierarchy from task 13. Out: lifting `noindex` on individual cards.

**Acceptance.** Each hub carries facts not present on any single card. The
empty-listing rule applies. **New owner-facing surface: approved individually.**

**Proof.** One rendered hub with its JSON-LD; the sitemap chunk it joins.

**Dependencies.** Tasks 11, 13.

---

## 16. IndexNow

**Outcome.** A new or changed page reaches Bing and Yandex in minutes rather
than weeks. Both are a materially larger share in Ukraine and Bulgaria than in
Western markets.

**Owner decisions.** ADR-0029 D13 item 6.

**Scope.** In: the key file at the site root, and a submission on the same
mutations that already revalidate a cache tag. Out: any Google-specific
submission API; Google reads the sitemap.

**Acceptance.** Submissions are idempotent and rate-limited; a failed submission
never fails the mutation. The key file is served at 200 and is not a secret.

**Proof.** A submission receipt for one URL, and that URL appearing in Bing
Webmaster Tools.

**Dependencies.** Tasks 10, 11 — do not announce addresses that are about to
move.

---

## Traps recorded before they cost a day

- `notFound()` under a streamed shell answers **200**, not 404. Any real 404 is
  decided in `src/proxy.ts` before the shell streams (ADR-0023, and the audit's
  ADR-05).
- `pnpm typecheck` fails on a clean `main` for reasons unrelated to any change;
  it is never `main` that broke.
- The catalog picker's statement deadline is 400 ms and was raised from 150 ms
  after a cold production 503. Any new bounded proxy lookup inherits that
  lesson.
- One unbounded production read held the managed database at 100% for seven
  hours. Every backfill statement carries a timeout.
- A slug change rewrites `catalog_item_slug_history`; a destructive migration
  breaks every earlier migration replay. Guard both.
- Verify against real Chromium, not the preview browser, before claiming a page
  needs no hydration.
