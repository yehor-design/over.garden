# SDD Slice 27 — the address law: execution runbook

The executor's companion to `docs/adr/ADR-0029-address-law.md`. The ADR says
what is decided; this file says what to do, in what order, and what each task
must prove. Read the ADR first.

Evidence for every "today" claim below is the audit of 2026-09-10, which fetched
every canonical URL in the production sitemap. Reproduce any of it with the
`curl` line beside it.

## Status of the task list

All sixteen tasks are in Linear as `OVE-419` … `OVE-434`. They briefly lived
here only: the workspace hit its plan's issue limit after `OVE-422`
(`You've exceeded the free issue limit for this workspace`, 2026-09-11), the
owner deleted the fifty oldest completed issues that afternoon, and the rest
were created immediately after. What those fifty contained is preserved in
`docs/linear/archive/`.

This file stays as the executor's companion: the sections below carry the
production evidence, the traps and the ordering rationale that do not fit an
issue body.

| # | Linear | Phase | Task |
| --- | --- | --- | --- |
| 1 | `OVE-419` | — | The address law: record ADR-0029 |
| 2 | `OVE-420` | 0 | Every URL absolute, Open Graph finished |
| 3 | `OVE-421` | 0 | Sitemap stops submitting `noindex`; robots.txt reconciled |
| 4 | `OVE-422` | 1 | Geography stops redirecting; canonical = URL served |
| 5 | `OVE-423` | 1 | `hreflang` everywhere it belongs, nowhere it does not |
| 6 | `OVE-424` | 1 | Content language: `source_language`, `lang`, `inLanguage` |
| 7 | `OVE-425` | 2 | The address manifest and one slugifier |
| 8 | `OVE-426` | 2 | Topic tags, the community path builder, the banned-literal lint |
| 9 | `OVE-427` | 2 | Proxy-decided 404s, case 308, the two missing route halves, bounded pagination |
| 10 | `OVE-428` | 3 | Entry and passport addresses move to `/@{handle}` |
| 11 | `OVE-429` | 3 | The catalog re-slug backfill |
| 12 | `OVE-430` | 4 | The entity graph |
| 13 | `OVE-431` | 4 | A front door for the catalog |
| 14 | `OVE-432` | 4 | Photographs |
| 15 | `OVE-433` | 4 | Aggregation hubs worth indexing |
| 16 | `OVE-434` | 4 | IndexNow |

Phases are ordered so nothing moves before the layer that catches it exists.
Within a phase, tasks are independent unless a Dependencies line says otherwise.

## Migrations

Five tasks need SQL. The numbers are reserved in `docs/MIGRATION_ALLOCATION.md`
in the order the phases apply, against a `0066` high-water mark taken
2026-09-11: `0067` `OVE-424`, `0068` `OVE-425`, `0069` `OVE-426`, `0070`
`OVE-428`, `0071` `OVE-429`. Every other task in the slice holds no allocation
and may not inherit one.

## The namespace vocabulary

`OVE-425` fixes seven namespace identifiers — `species`, `form`, `journalEntry`,
`object`, `topic`, `community`, `profileHandle` — each with a script, a
uniqueness scope, a budget, reserved words and a pattern. `OVE-426`, `OVE-427`,
`OVE-428`, `OVE-429` and `OVE-434` all read them, so a rename there is breaking
for five successors. The set and its scopes are in `OVE-425`'s body.

---

## 5. `OVE-423` — `hreflang` everywhere it belongs, and nowhere it does not

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

## 6. `OVE-424` — Content language: `source_language`, `lang`, `inLanguage`

**Outcome.** Each entry declares the language it was written in, and the page
says so honestly. A Ukrainian entry stops being served inside a `lang="bg"`
document.

**Owner decisions.** ADR-0029 D11. **Server-side only: no language badge, chip
or marker on any card, and no listing filtered by content language, ever.**

**Scope.** In: `journal_entries.source_language` written at publish (it exists,
is nullable, is CHECK-constrained to `uk`/`bg`, and is written by nothing but
the deletion path); `lang` on the entry element from it;
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

**Shipped 2026-09-11, with two corrections execution forced.** The CHECK admits
`ru` as well as uk/bg — a Russian interface is a real authoring state and the
development database already held such entries — and the column is **not**
`NOT NULL`, because rows in the retired `archived` lifecycle state reject every
`UPDATE` while two `NOT VALID` constraints stand, and `SET NOT NULL` scans the
whole table. See the amendment under ADR-0029 D11. Production holds no
`archived` row; the development database holds sixteen, and they are why the
backfill is scoped to `lifecycle_state = 'active'`. **Anything later in this
runbook that writes every journal entry row must carry the same clause or it
will fail on the first `archived` row it reaches** — that is OVE-428.

**Dependencies.** Task 4.

---

## 7. `OVE-425` — The address manifest and one slugifier

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

**Shipped 2026-09-11, with four things execution decided.**

1. **The alphabet is spelled out, letter by letter.** `[[:alpha:]]` and
   `[[:lower:]]` turned out to be Unicode-correct in this database — read
   against production, they accept `ї` and `ъ` and reject `П`, an apostrophe,
   an en dash and a space — but they admit every other script's lower case
   too, and the slugifier's output set is exactly `a-z0-9` plus the
   thirty-seven Cyrillic letters uk/bg/ru write. A range like `а-я` is not an
   option: inside a bracket expression a range is read in the database's
   collation, which is `en_US.UTF-8` here, not in code-point order. Spelling
   the set out also enforces `NFC` for free — a decomposed `й` is `и` plus
   U+0306, and U+0306 is not one of the thirty-seven.

2. **The `CHECK` bound is not the budget.** The column admits ninety-six
   characters; the budget is sixty decoded and a hundred and eighty encoded. A
   `CHECK` has to admit the rows the table already holds, and every slug
   production holds was written under the old ninety-six-character rule. Task
   11 narrows the column once it has moved the rows that would then be
   refused.

3. **The disambiguating suffixes stay where uniqueness still needs them.** The
   four named generators are gone and every base is `slugify` now, but the
   Ukrainian register's `-ua-register-{applicationNumber}` and the EU-OJ
   digest remain, because both projections are written straight into the
   globally unique `catalog_items.public_slug` without passing through
   `assignCatalogSlug`. Task 11 moves the ingest onto the counter and the tails
   go with it. The journal entry's publish-id tail did **not** stay: entries
   get `assignJournalEntrySlug`, which counts `-2`, `-3` against the live
   column under an advisory lock on the base, so two simultaneous publishes of
   one title serialize instead of colliding.

4. **The banned-literal rule ships with a ledger, not an exemption.**
   `pnpm address:literals:check` fails on any path literal in a file that is
   not on the list, and the list holds the thirty-one that already existed.
   Task 8 empties it; the script fails if an entry goes stale, so the ratchet
   cannot quietly stop.

---

## 8. `OVE-426` — Topic tags, the community path builder, the banned-literal lint

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

**Shipped 2026-09-11.** The ledger the previous task left behind is empty: all
thirty-one literals now go through a builder, and `pnpm address:literals:check`
runs in CI over 651 files with nothing excused. Three findings worth keeping.

1. **The `tag-` prefix went with the hash.** It existed to keep a gardener's
   tag off a curated topic's slug, and preventing that turns out to be the
   wrong instinct: `ensureJournalTopic` looks a topic up by slug, keeps the
   curated trust state and never downgrades it, so tagging *Species* joins the
   curated Species topic rather than forking a near-duplicate beside it. The
   stable hash survives as the fallback alone, for a label made of emoji or
   written in a script the alphabet does not hold.

2. **Existing `tag-*` topics are not re-slugged, and production has none.** Its
   five topics are all curated and all ASCII — `animals`,
   `observation-and-care`, `plants`, `plant-varieties`, `species` — and all five
   pass the widened pattern unchanged. Where a provisional `tag-*` row does
   exist, in a development database, it keeps its entries and new signals go to
   the new slug; nothing 308s, because nothing moved.

3. **`0069`'s rollback refuses to run once a Cyrillic topic exists, and that is
   the design.** Transliterating a slug changes a public address and deleting
   the row takes a gardener's tag with it, so the down file re-adds the ASCII
   constraint and lets Postgres validate it. CI executes both halves: refused
   with a Cyrillic row present, accepted on an empty table.

Three path builders were added to carry the literals:
`publicCommunityDiscussionPath`, `requestedPublicCatalogPath` and the
`MISSING_ADDRESS_SLUG` the lifecycle documents render. Two of the replaced
literals were latent defects rather than style: `` `/topics/${slug}` `` in the
knowledge hub and `` `/journal/${item.publicSlug}` `` in the account community
page emitted an unencoded Cyrillic segment, and the proxy's own
`` `/@${handle}` `` did the same.

---

## 9. `OVE-427` — Proxy-decided 404s, case 308, the missing route halves, bounded pagination

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

**Shipped 2026-09-11.** Measured against production before and against a
production build after. Every row moved:

| address | before | after |
| --- | --- | --- |
| `/bg/topics/PLANTS` | 200 | 308 → `/bg/topics/plants` |
| `/bg/@YEHOR` | 200 | 308 → `/bg/@yehor` |
| `/species/Solanum-Lycopersicum` | 200 | 308 → lower case |
| `/species`, `/variety`, `/topics`, `/journal` | 200 | 404 |
| `/journal/a/b`, `/@yehor/anything`, `/species/a/b/c` | 200 | 404 |
| `/bg/support`, `/ru/erasure`, `/bg/garden/**` | 200 | 404 |
| `/topics/no-such-topic` | 200 | 404 |
| `/bg/journals?page=999` | 200 | 404 |
| `/lineage/objects/{uuid}` | **500** | 404 |
| `/communities/{slug}/discussions/{id}` | 200 + `noindex` | 200, a real page |

**The 500 was not the missing route half.** Both halves of
`/lineage/objects/{uuid}` answered 500, and had since the page existed, so the
cause could not have been the prefixed one's absence. It was three words of
SQL: `buildPublicObjectPassportRootQuery` selects `catalogSpeciesSlugSql`, a
correlated subquery reading `catalog_items.id`, and grouped by every other
`catalog_items` column but not that one. Postgres refuses the statement with
`42803` at plan time, for every object, whether or not it exists. Three and a
half thousand tests passed: a Kysely builder compiles happily and nothing in
the suite ever sent one to a database. `pnpm public:reads:prove-database` is
the gate for that class now — 23 public reads, executed against a fresh
bootstrap with identifiers nothing matches, in CI.

**The self-referencing canonical on page two could not be delivered, and the
replacement is a header.** The canonical is built in `generateMetadata`, these
listings are partially prerendered, and making their metadata depend on
`searchParams` took the canonical out of the streamed shell altogether — on a
production build, `/bg/journals?page=2` came back with no `<link
rel=canonical>` anywhere in the response, which is worse than the defect. So
page two carries `X-Robots-Tag: noindex, follow`, set by the proxy before
anything streams: not indexed, so not a duplicate; `follow`, so every entry it
lists stays reachable. The self-canonical becomes possible the day pagination
moves into the path (`/journals/page/2`), where `generateMetadata` reads it
from `params`.

**The 404-past-the-end bound is an over-estimate on purpose.** The exact page
count depends on the filters in the request, so computing it means running the
listing query in the proxy before the page runs it again. One count of the
whole public corpus bounds every filtered subset of it, because a filter can
only remove rows — and every public object has at least one public entry, so
the same count bounds both listings. It is read only when the request asks past
page one.

**Two route-shape rules landed with it**, both drift-tested against the
filesystem: `ROOT_SEGMENTS_WITHOUT_INDEX` (a section that exists with no front
door) and `LOCALE_ROUTE_SEGMENTS` (the prefixed tree is a subset of the
unprefixed one, and the gap used to answer 200). `/uk/**` is exempt from the
second: it is a legacy prefix that folds to the unprefixed path with a 308, and
a 404 there would take a mail link away from the reader.

---

## 10. `OVE-428` — Entry and passport addresses move to `/@{handle}`

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


**Shipped 2026-09-12.** Production moved: eleven entries and four object
passports, in one transaction, with twenty-two slug-history rows behind them —
eleven closed, eleven open. The four misspellings the old generator produced
are corrected in the addresses themselves: `календарноі` → `календарної`,
`сталии` → `сталий`, `зав-язуванням` → `завязуванням`, `деи-ствие` →
`действие`. No entry carries a suffix.

**The entry name stayed platform-unique; only the address moved.** Three
readers identify an entry by its slug and nothing else — the engagement target
ref a like is stored against, the Meilisearch document id, and the proxy's
bounded lookup — and making the slug ambiguous before those move to the entry
id would let two gardeners' likes land on one row. The visible outcome is the
same either way, and a collision between two different gardeners takes a `-2`
from the counter instead of being impossible. `plant_objects.public_slug` *is*
per owner: nothing reads it by slug alone, and "Томат" is what half the gardens
here call their tomato.

**The history table is load-bearing, and the first draft of the proxy did not
read it.** The move renames every published slug, so after it the live column
no longer holds the address anybody had shared. `/journal/{old-slug}` answers
308 only because `resolveJournalEntryAddress` looks in
`journal_entry_slug_history` when the live lookup finds nothing. Without that
read the move turns every published URL into a 404 — which is exactly what the
history table exists to prevent, and exactly what it would have done.

**The deploy order was wrong and cost a real window.** The migration and the
move ran before the code that reads the history table was deployed, so for the
length of one CI run an external link to an entry answered 404. Nothing inside
the site linked there — every listing rebuilds its links from the database —
but a crawler in that window saw a 404. A migration is safe in either order; a
move is not, and the code that understands it goes first.

**Two more things worth keeping.** `matchAuthorScopedPath` decodes `%40` as
well as `@`, because a browser address bar produces the encoded form and the
old profile matcher decoded the whole path to see it — decoding only the handle
keeps an encoded slash in a later segment encoded. And a rewrite is no longer
forced to `no-store`: the proxy used to stamp its cache contract on every
response it returned, which was harmless while only the profile was rewritten
and would have made every entry and passport uncacheable once they moved under
`/@`.

---

## 11. `OVE-429` — The catalog re-slug backfill

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


**Shipped 2026-09-12.** 15 914 addresses moved in production, 1 228 of them
taking a counter. Zero addresses now carry a register number, a digest or a
`-species-backbone` suffix, where 15 902 did. A hundred old addresses were
sampled at random and requested over HTTP: **100 of 100 answered 308**.

**Four species got their names back.** `speciesSlugFromScientificName` never
stripped the botanist's authority, so `Solanum lycopersicum L.` would have
become `solanum-lycopersicum-l` — worse than the `-species-backbone` suffix it
replaced. The rule that strips it is deliberately conservative: one trailing
capitalised abbreviation ending in a full stop, so `sp.`, `subsp.` and `var.`
stay and a multi-word authority is left alone rather than guessed at.

**The form name stayed platform-unique**, for the same reason the journal
entry's did. `resolvePublicCatalogAddress` finds a form by its slug alone, in
the history table, and only then compares the requested path with the canonical
one; the column and the history table are both globally unique. Per-species
names need the resolver to take the species first and both uniqueness keys to
grow a species column.

**Two things about doing a hundred thousand writes to a managed database.**
Transactions of five hundred, not one transaction — a lock held for minutes on
the table every public page reads is a worse outcome than a half-moved catalog,
and a half-moved catalog answers correctly at every address anyway. And the
plan's first draft rebuilt the taken-slug set per row: a billion and a half
string comparisons, two and a half minutes; walking it takes 1.5 seconds.

**The order was code first**, which is the correction to `OVE-428`'s mistake.
The pull request merged and deployed before a single address moved, and nothing
answered 404 at any point.

---

## 12. `OVE-430` — The entity graph

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


**Shipped 2026-09-12.** An entry's graph was three facts across two nodes: a
name, a headline and a date. It now carries `author` as a `Person` node, `about`
pointing at the organism's permalink, every photograph as an `ImageObject` with
the caption a reader sees, `inLanguage`, `publisher`, `mainEntityOfPage` and a
`BreadcrumbList`. The organism card gained `subjectOf`, the profile page
`mainEntity → Person`, and every indexable page carries `Organization` and
`WebSite`.

**The traversal closes, and a test asserts it.** An entry's `about` `@id` is
the permalink the card claims as its own `@id`; the card's `subjectOf` `@id` is
the article node's own. One assertion follows both directions.

**Three things the implementation had to get right.**

1. **An `@id` must not depend on the reader's locale.** The author's `@id` is
   the unprefixed profile address, not the locale-prefixed URL the page links
   to — otherwise one gardener is three people to a consumer that merges the
   graph across pages.
2. **`Organization` and `WebSite` are repeated on every page**, not emitted
   once on the homepage. A crawler that fetches one page has to resolve
   `publisher` from that page alone; a dangling `@id` is a reference to
   nothing.
3. **`subjectOf` carries an `@id` and a URL and no title.** The privacy
   invariant of OVE-40 says the organism card's graph holds the organism's
   bounded facts and no gardener's words, and it caught the first draft, which
   put entry titles on the card. A consumer needs no more than the `@id` to
   follow the link, and the entry's own page supplies its headline.

The card's `subjectOf` also forced the variety repository to build canonical
entry addresses rather than legacy ones: pointing `subjectOf` at
`/journal/{slug}` would name a redirect instead of the entry's own `@id`.

---

## 13. `OVE-431` — A front door for the catalog

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

**Shipped 2026-09-12.** `/species` is a page. It used to be a section root with
no index — a real 404 since task 9 — and it is now the catalog's front door:
eight kingdoms, an A–Z of initials under each, and the organisms behind an
initial. Every link on that path is an `<a href>` in the served markup, which
is what the crawl-depth proof follows: it reads HTML and never executes it, so
a link that needed hydration would not count (ADR-0024).

**The owner chose two doors, not a menu item.** Asked on 2026-09-12 where the
catalog should appear, the owner picked **inside Knowledge *and* under Living
objects** — `site-shell-navigation.ts` is unchanged. Those are two different
questions a reader is already asking ("what is this organism", "what is the
thing in my garden") and both end at the same catalog. The scope line above
said "a catalog entry in the site shell"; that half is deliberately not built.

**Four clicks, and the indexable ones are at three.** `/` → Knowledge →
`/species` → a kingdom → an organism is four. The cards with first-hand
content — the indexable ones, which is what the acceptance criterion is about
(ADR-0026 D9) — are listed on the browse root itself, so they are three.

**A kingdom and an initial are filters, not addresses.** Every browse view
carries the same canonical, `/species`, and the proxy's existing rule stamps
`noindex, follow` on anything past page one. So the filtered views are crawled
for their links and never compete with the root — which is the same decision
D10 makes everywhere else, applied to a listing.

**Migration `0072` is the index the walk needs.** `catalog_items` had no index
that answers "one kingdom, one initial, ordered by name": the browse would have
been a sequential scan of 114 669 rows plus a sort, on a public page. The
partial index over addressable rows turns it into an index-only scan —
**0.63 ms** for a page of 60, measured on production after applying it. The
kingdom summary is 175 ms and is cached for a day, because the catalog changes
when an import runs, not when a gardener writes.

**`pnpm catalog:crawl:prove-depth` is the proof, and it is a gate.** It walks
from `/` breadth-first over served HTML, reports the depth at which an organism
address first appears and the trail that reached it, and exits non-zero if that
depth is absent or greater than four.

---

## 14. `OVE-432` — Photographs

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

**Shipped 2026-09-12.** A photo has one sentence now, and it is the same
sentence everywhere: the `figcaption` a reader sees, the `alt` a screen reader
hears, the `caption` in the entry's `ImageObject`, and `<image:caption>` in the
sitemap. `publicMediaAltText` is the single rule — caption, else the stored
alt, else the entry's title — and the three fallbacks it replaced included two
that appeared on one page.

**The caption is authored in the document and projected onto the row.** It
lives on `JournalImageBlock` as an optional `caption`, additive at schema
version 1 (ADR-0028's pattern): a document written before it existed has no key
and stays byte-identical through the editor, which the adapter's round-trip
test asserts. `claimOrderedInlineMediaForEntry` — the one place that already
reconciles a document's images against their rows — writes `media_assets.caption`
and `alt_text` from it. One author, one projection, rather than two homes for
one sentence. No SQL: both columns already existed and only the launch corpus
had ever filled them.

**Proven in a browser, because the composer is where this class hides.** On
2026-09-12, signed in against the local database: the field renders under the
photo as a `<textarea>` with `tabIndex` 0, a 280-character bound, its label and
its placeholder; typing into it inside the Lexical editor keeps focus and keeps
every character; and the composer's `body` field came back holding
`Перша китиця після спеки`, which is the caption reaching the serialised
document through the node state. A unit test now pins the same facts.

**The sitemap declares the image namespace only where it uses it.** Entries are
the only chunk whose pages own their photographs, so `xmlns:image` appears on
that chunk and nowhere else; an unused namespace on every chunk is noise a
validator reads and a reader has to explain.

---

## 15. `OVE-433` — Aggregation hubs worth indexing

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

**Shipped 2026-09-12.** `/species/{species}/register` — "621 сортів Solanum
lycopersicum у реєстрах", the split between the two registers, and every
cultivar with the registration number a seed packet quotes. The owner approved
this shape on 2026-09-12, choosing it over two register-wide pages.

**The number went from the address into the page.** `advance-ua-register-09040016`
was an address carrying a state register's application number, and task 11 took
it out because an address is a name. The number itself is the most quotable
fact the catalog holds, so it belongs on a page — and this is the page. 15 177
cultivars carry a `ua_register` identifier and 721 an `eu_common_catalogue`
one; 241 species have at least one registered form, 149 have three or more.

**`register` is a reserved word in the form namespace.** Without the
reservation a cultivar named *Register* would take its own species' hub; the
same mechanism, and the same reason, as `objects` under an author. The catalog
matcher answers `null` for the hub shape so it is never read as a form address,
and `unservableAddressNamespace` calls it servable so the proxy does not 404 it.

**The graph is built from the rows the page shows.** `CollectionPage` with
`hasPart` from the cultivars listed and nothing else. A graph that claims more
than the page does is the defect this slice exists to remove.

**A species with no registered form has no hub.** `getCatalogRegisterHub`
answers `null` and the route 404s, rather than publishing a page that says
zero — the empty-listing rule, applied before a crawler ever sees it.

**The relation is `form_of`, not `parent_catalog_item_id`.** No cultivar in
production has a parent: all 15 924 of them have `parent_catalog_item_id` null,
and the link to a species is a row in `catalog_item_relations`. The first draft
of the query read the column and returned nothing for every species, which
looked exactly like "the data is not there".

---

## 16. `OVE-434` — IndexNow

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

**Shipped 2026-09-12.** One endpoint, `api.indexnow.org`, which the
participating engines share with each other — submitting to each separately is
what the protocol's own documentation asks implementers not to do. Nothing
Google-specific, because Google does not participate.

**The key is a constant in the repository, not an environment variable.**
IndexNow proves control of a host by asking it to serve the key back; anyone
may read it, and knowing it lets them submit URLs *of this host*, which is the
point of the protocol rather than a capability worth protecting. As a constant
it cannot be present in one environment and missing in another, and the file
and the submission can never disagree about what it is. It is served at
`/indexnow/{key}.txt` and the submission carries `keyLocation`, which is what
the protocol provides for a key that is not at the host root.

**The announcement rides on the call that already invalidates the tags.** A
mutation makes one call when a public page changed, and it now takes the
canonical URLs as a third argument. URLs and not tags: a tag says *something
under this name changed*, and only the caller knows whether what changed has an
address a crawler should be sent to. The entry route announces the canonical
address only — the locale-prefixed legacy spellings beside it are 308s, and
announcing a redirect asks a crawler to fetch a page that is not there.

**A failed submission cannot reach the mutation.** `announcePublicUrlsToIndexNow`
awaits nothing and swallows everything, and a test asserts it by making `fetch`
throw. An engine being down must not turn a gardener's publish into an error.

**The bounds are per process, and the code says so.** A URL is not announced
twice inside ten minutes — a gardener editing four times in a minute is one
change to a crawler — and one instance makes at most thirty submissions a
minute. That holds within a serverless instance, not across a fleet; durable
de-duplication belongs in the job queue the day the volume justifies a
queue-contract migration, and pretending otherwise in a comment would be worse
than the limitation.

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

## The `200` that was a not-found page

**Found 2026-09-12, after task 10 shipped.** Every object passport at its own
address — `/@yehor/objects/томат` and the three beside it — answered `200`,
with the object's own `<title>`, its canonical, `robots: index, follow`, and
the not-found page in the body. A reader saw "Сторінку не знайдено". It had
been that way since the addresses moved that morning.

**The cause is one encoding, twice.** `publicObjectPassportPath` encodes the
slug it is given, and a route segment arrives from the URL already encoded, so
`%D1%82…` became `%25D1%2582…`, matched no address, and the route called
`notFound()`. The entry route beside it pasted the raw segment into the path
instead of passing it through a builder, which is why entries were spared:
right by accident, not by design. `decodeRouteSegment` now decodes first in
both, which is correct in either spelling — a decoded slug holds no `%`,
because no address alphabet admits one (D12).

**The proof of task 10 could not see it.** It was `curl -sI` on all twenty-two
addresses, and every status line was right. It has to be: the proxy decides the
status from its own bounded lookup (D3), finds the address, and answers `200`;
the shell streams; the page runs afterwards and `notFound()` can no longer
change a header. A status line is not a page, and for a day nobody could tell
the difference.

**`pnpm public:addresses:prove-render` is the gate now.** It reads every
published address out of the database and fetches it, and a pass requires three
things of the body: `200`, the page's own heading, and the JSON-LD an indexable
surface carries (D13). Run against production the moment it existed it reported
`checked: 16, failed: 4` and named the four passports. Both routes also gained
the tests neither had — the reason a whole surface could be dead for a day is
that `[profileHandle]/[entrySlug]` and `[profileHandle]/objects/[objectSlug]`
had no test file at all — and each asserts both spellings a router can hand a
segment.

**`logAddressRefusal` makes the next one audible.** A route refusing an address
the proxy has already accepted is two lookups disagreeing, and it is silent
from outside: the reader gets an apology, every monitor sees a healthy `200`.
It now writes one line naming the route, the guard, and the two paths compared.
