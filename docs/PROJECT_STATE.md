# Project state

Status: living document. Update it whenever production behaviour, the direction,
or the list of known gaps changes. Read it first, then `AGENTS.md`.
Last reviewed: 2026-09-07.

This page answers four questions for anyone returning to OverGarden: what the
product is today, what is actually true in production right now, what is being
worked on next, and what is knowingly unfinished. Dated receipts live in
`docs/DELIVERY_LOG_2026-09.md`; decisions live in `docs/adr/`.

## What the product is

A public gardening journal for Ukraine and Bulgaria. A gardener keeps a
narrative journal per plant or animal; every entry is public and indexable;
public variety, topic, profile, and community pages aggregate first-hand
experience. There are no private entries, no drafts, no offline mode, and no
separate admin panel. Speed and search discovery come before defensive refusal.

The governing decisions are `docs/adr/ADR-0022-owner-mvp-reset.md` (D1–D7,
accepted 2026-09-02) and `docs/adr/ADR-0023-workspace-resilience.md` (D8,
accepted and implemented 2026-09-03). Older ADRs are immutable history and
never override them.

## What is true in production

Verified on 2026-09-07 against `https://over.garden` and the live providers.

| Area          | State                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy        | `main` at `1c8d186`, Vercel production READY, functions in `fra1` beside the database                                                                                                                       |
| Public pages  | Cache Components: shells answer `x-vercel-cache: HIT`, tags revalidate on every mutation, workspace and API stay `no-store`                                                                                 |
| Indexability  | Every live public page is `index, follow` with one canonical and one JSON-LD graph; sitemap index plus entries, profiles, communities and catalog chunks. Under ADR-0026 D9 an organism card whose content comes only from sources stays `noindex` until a gardener publishes on it or the owner marks it: one of the 114,669 nodes is marked, carries `Taxon` JSON-LD with eight `sameAs`, and is the catalog chunk's only entry |
| Media         | Browser-made WebP: 2560 primary, 1280 and 480 variants, 16 px placeholder, served as plain `<img srcset>` from `media.over.garden`, immutable and CDN-cached. No Vercel image optimizer                     |
| Media upload  | One session capability per composer, uploads straight to the Cloudflare Worker, two-hour lease renewed every five minutes, parallel promotion, weekly orphan sweep                                          |
| Sessions      | Server-authoritative. The cookie-cached session decides at the moment of the mutation; no client gate                                                                                                       |
| Admin         | Owner pages live in the account menu under the sealed owner role; `/health` is owner-only. The Release Center, editions and extension packs are gone (ADR-0025, `OVE-385`); the menu carries four owner links |
| Workspace     | Every page under `/garden/**` renders its own shell first and streams its data; failures are designed states with a class, a digest, and a retry (ADR-0023)                                                 |
| Server errors | Two JSON lines: `workspace_section_degraded` from `settleSection` for a section that failed and still rendered, and `workspace_server_error` from `src/instrumentation.ts` for anything that actually threw |
| Schema        | Migrations `0001`–`0047`, `0049`, `0051`–`0058` and `0060`–`0064` applied, minus the two deliberately skipped and the two not needed in production. Slice 24 landed `0054` (the graph foundation) through `0061` (the closeout, 2026-09-07): `catalog_items.catalog_kind` and `status` are gone, and so are `catalog_match_suggestions` and `catalog_fuzzy_duplicate_suggestions` with the 2,267 rows they held. `0064` indexes the five columns the reconciliation's cleanup reads. See `docs/PRODUCTION_SCHEMA_STATE.md` |
| Interaction   | Like, bookmark, follow and comment are Server Actions on a form with a real endpoint, so they work before hydration and with JavaScript off. A like is a permanent row owned by an account or by one signed visitor cookie, with no expiry and no ceiling |
| Sign-in       | One screen: `/auth/sign-in` and `/auth/sign-up` over one component and Server Actions. Every other page shows its own empty state and one link to it                                                        |
| Matching      | The worker on the droplet runs the sealed release of `7b0a287` since 2026-09-07 with a fresh heartbeat, declaring the manifest's six handlers exactly; the API container, its route, and `matching.over.garden` were retired on 2026-09-03. Its `MEILISEARCH_HOST` and Caddy's upstream both named a container that stopped on 2026-07-23 until the same day, so the worker could not reach Meilisearch for six and a half weeks |
| Hosting       | Decided 2026-09-03: the DigitalOcean managed database and the `fra1` droplet stay                                                                                                                           |

The seven owner requirements have one committed production receipt:
`docs/OWNER_MVP_RESET_PROOF_2026-09.md`, regenerated by
`pnpm prove:owner-mvp-reset`.

## Where the project is heading

**Just delivered.** SDD Slice 22 (`OVE-376`–`OVE-379`) — the interaction,
language and sign-in surfaces stop layering hand-written client protocols over
platform primitives. Clicking Like answered `500` with an empty body on 7 of the
8 public journal entries because the capability token embedded the slug and
overflowed its own length bound on any Cyrillic text; it is now a permanent
owned row behind a Server Action. Fourteen pages embedded the sign-in form, two
of them offering Google and four remembering where to return; there is one
screen now. Choosing a language ran a two-phase distributed commit ending in a
full document replacement; it is a link. Net for the slice: roughly 7 000 lines
removed against 2 500 added.

The rule the slice leaves behind, learned the hard way and then corrected in
public: **a control on a public page may not depend on hydration to do its job.**
A `<form action={…}>` gets a real endpoint only when the action is a Server
Action reference or the `formAction` `useActionState` derives from one; wrap it
in any client closure and React renders `action="javascript:throw …"`, which
does nothing until the bundle runs. Three source-level tests now hold that
shape for the engagement controls, the sign-in screen, and the language control.

Verifying the slice in production on 2026-09-04 found two defects the slice had
shipped, one of them reported by the owner. Pressing "sign in" in the header
landed on `/garden`, an empty state offering a second "sign in" before the form,
because the header read the navigation item's label and hard-coded its own href;
every sign-in link is built by one function now, and an intent control returns
the reader to the composer rather than to the workspace around it.

The other: merely *hovering* a language option rewrote the reader's saved language.
The proxy reads the preference from the locale prefix a request lands on, and
Next strips `Next-Router-Prefetch` before middleware runs, so the guard written
to exclude prefetches never fired. Cross-locale links now carry
`prefetch={false}`; a source test and a browser test hold it, and ADR-0024 D4
records the mechanism.

**Previously delivered.** `OVE-374` — workspace resilience. Every page under
`/garden/**` renders its own shell immediately, streams its data in sections, and
turns every failure into a designed state with a retry and a reference code. It
existed because a verified framework defect leaves a skeleton on screen forever
when a Server Component throws during a postponed resume; see ADR-0023 and the
receipt in `docs/WORKSPACE_RESILIENCE_PROOF_2026-09.md`.

**Now.** The MVP reset is delivered, so the next work is product, not
platform: real gardeners publishing, and organic discovery measured rather than
assumed. One measurement gap blocks honest prioritisation; see known gaps
below.

**Delivered 2026-09-07, OVE-399 (Slice 24, task 14 of 14).** The slice is
closed: nothing of the old shape remains to confuse the next reader. Migration
`0061` drops `catalog_items.catalog_kind` and `catalog_items.status` (the graph
answers both with `node_kind`, `identity_state` and
`merged_into_catalog_item_id`), the old matcher's `catalog_match_suggestions`
and `catalog_fuzzy_duplicate_suggestions`, the retired job kind's payload check,
and `user_added` from `plant_objects.variety_state`; it renames the topic signal
that was named after the dropped column. Every reader and writer went first; the
three words the interface uses — species, sort, breed — survive as one
derivation in `src/server/catalog-kind-sql.ts`, because that vocabulary belongs
to the reader even though it is no longer a column. Meilisearch and the
`catalog_typeahead_reindex` job kind left the pick path with `OVE-387`'s
successor commit, and the retired smoke scripts and their Python counterparts
went with them. `pnpm prove:organism-graph` is the one command that checks the
delivered slice against production. Two defects surfaced on the way: the
reconciliation's assertion cleanup asked five `not exists` questions per source
record with three of the columns unindexed, so one delete read about 470,000
rows and the job cleared roughly thirty-five assertions a minute while
saturating the one-vCPU database (migration `0064` indexes them; the same plan
costs 17,700 → 17.47 and the rate went to about 3,300 a minute); and `0061`
made six earlier migrations un-replayable, which `prove-migration-reapply.ts`
found and each site now guards. The slice's dated receipt is
`docs/DELIVERY_LOG_ORGANISM_GRAPH_2026-09.md`, and the production proof it
leaves behind is `docs/ORGANISM_GRAPH_PROOF_2026-09.json`: eleven checks pass,
one fails on the picker's P95 across cold instances, none pending.

**Delivered 2026-09-07, OVE-395 (Slice 24, task 10 of 14).** Every registered
cultivar and breed is attached to its species. The three register importers
already wrote what a register says — a source row, a catalog item, its names
and a link — but none of them wrote the one fact a gardener sees: that this
denomination is a form *of* something. One pass now turns a row from any of the
registers into the same claim (which species, under which denomination,
registered where and when) and writes a `form_of` relation, a denomination, a
register identifier, a `registration_status` fact with the market and the year,
and a form slug from the romanized denomination.

In production 15,900 register forms became 15,457 attachments and 443 queue
items, with none both and none neither. The tomato species page says it has 621
forms and lists them; a registered cultivar answers at
`/species/solanum-lycopersicum-species-backbone/suomy-ua-register-14115052`
with its registration recorded as `registered UA 2025`. The picker prefers what
is registered in the reader's market, in Ukrainian and in Bulgarian.

It never guesses: two candidate species is a decision for the owner, not a coin
toss, and a variety the Official Journal has removed gets a `withdrawn`
registration fact beside its unchanged node and relation. Nothing is deleted.

**Delivered 2026-09-07, OVE-394 (Slice 24, task 9 of 14).** EPPO is on the
graph. The 2026-09-03 observed capture holds overview, names and taxonomy for
129,214 identifiers, and a second capture takes hosts, distribution and
categorization for the same ones. Both live in the source layer; a job reads
them and calls nothing upstream.

Each identifier climbs the deterministic ladder — the EPPO code the Wikidata
crosswalk wrote, the scientific name with its authorship, the canonical name
with its rank, and then the Catalogue of Life checklist itself, which
materializes a node with the backbone's classification. Only a species the
checklist does not carry at all is created from EPPO: viruses, viroids and the
animal pests the scoped ingest leaves out. In production 108,770 of 121,777
active codes linked automatically and the graph grew from 15,959 nodes to
114,525.

Cards gained a presence badge for Ukraine and Bulgaria at country level, with
EPPO's verbatim status beside the word; the pest or disease label from the
kingdom and the host role; and the attribution line the licence requires, dated
by the day the data was downloaded. The projection guard gained its second
axis: a leaf that is source-only, forbidden, or that the capture never
classified never reaches a product surface.

**Delivered 2026-09-06, OVE-393 (Slice 24, task 8 of 14).** Every canonical
node now carries the identifiers the other sources are addressed by. An offline
worker job asks Wikidata for the Catalogue of Life, GBIF, World Flora Online
and EPPO identifiers of the nodes we hold — matched on the Catalogue of Life id
they already carry, and by taxon name for the higher taxa Wikidata does not
give one — and writes them beside a Wikidata item id. An identifier another
node already holds is never overwritten: it becomes a decision in the owner's
queue, because the uniqueness of an identifier is what makes the ladder's first
rung work at all.

The same items carry the words gardeners use. Labels and aliases in Ukrainian,
Bulgarian, Russian and English enter the alias ledger; a name in one of those
four languages, long enough to be a name, not a restatement of the scientific
one, and attached to exactly one node becomes a vernacular the card and the
picker show. Everything else waits as `review_needed` with its reason. The
card's `sameAs` gained the Wikidata link, and a card whose names changed asks
the outbox to re-render it.

In production all 29 nodes with a Catalogue of Life identifier received a
Wikidata id, with 72 identifiers and 111 vernacular names written and no
conflicts. Nothing on a gardener's request path calls Wikidata, and a test
reads the whole web source to keep it that way.

**Delivered 2026-09-06, OVE-392 (Slice 24, task 7 of 14).** Catalogue of Life
is the backbone. The July 2026 release (COL26.7, doi 10.48580/dgyhw) lives in
the source layer as `catalog_source_col_usages` and
`catalog_source_col_vernaculars`, two snapshots at a time: one to serve, one to
diff against. The worker's `catalog_source_refresh` job downloads the ColDP
archive, verifies its checksum, streams `NameUsage` and `VernacularName` into
Postgres, places every node gardeners, the registers or EPPO already touch on
the tree, diffs the release against the one it replaces and prunes what is no
longer needed.

Nodes gain their parent, rank, kingdom and ancestors from the checklist: the
tomato now resolves through Solanaceae to Plantae. A node the release does not
know becomes an owner decision rather than a guess, and two nodes claiming one
Catalogue of Life identifier become a merge in the queue. The refresh applies
ADR-0026 D4's classes: a rename renames and keeps the old spelling as a
synonym, an accepted name that became a synonym merges itself when no gardener
depends on it and waits in the queue when one does, and a usage that left the
release supersedes its assertions without deleting anything.

The picker gained its secondary path: when the canonical list is thin the
composer offers the whole checklist, and picking a row there creates the node,
its ancestors and its identifier from that moment. Picking the same organism
again reuses it.

**Scope in production.** The managed database has 10 GiB of disk, and the whole
release is 3.3 GB per snapshot. Production ingests the plant kingdoms —
Plantae, Fungi and Chromista, 1,976,974 usages — which is what the source
readiness manifest asked for. Animals keep the canonical picker, and one
environment variable adds them when the database is larger.

**Delivered 2026-09-06, OVE-391 (Slice 24, task 6 of 14).** The owner curates
from two links in the account menu. `/garden/catalog/queue` shows one decision
at a time, highest impact first: the two nodes side by side with their reasons
and confidence, Yes, No and Skip as Server Action forms, J and K walking the
stream without deciding, U undoing, and a confirmation step only for a merge
that moves more than fifty gardener objects. Under it, the week's automatic
decisions with one-click revert. `/garden/catalog/sources` shows one card per
source with its version, licence, counts and last refresh, and a Refresh button
that enqueues exactly one job per idempotency key. On a public organism card
the owner alone sees rename, pin a preferred name, set indexable, merge into
another node by its address, and the list of what has already been done to the
card with an undo beside each entry. Every action writes
`catalog_curation_actions` with its inverse and revalidates the card, and a
merge from the card travels the queue's own apply function rather than a second
implementation.
A Monday cron enqueues one digest email through the auth outbox, which
migration `0063` taught a second message kind. Applying and reverting still go
through the SQL functions of `0056`, so the worker and the owner cannot drift.

Two defects only a real browser against Postgres could show, both fixed here:
the owner forms rendered React's placeholder action and needed hydration (a
client closure around the action; `OwnerScopedProgressiveForm` passes the
reference through, and the queue, sources and card controls use it), and the
apply and revert wrappers read a row in the same statement that inserted it,
so every decision committed and then answered 500. The nineteen other call
sites of `OwnerScopedActionForm` still need hydration; that is recorded, not
fixed here.

**Delivered 2026-09-06, OVE-390 (Slice 24, task 5 of 14).** The
reconciliation ladder runs in the matching worker, off every request path.
Six rungs in order (`services/matching/app/catalog_reconcile.py`): a shared
external identifier, the same scientific name and authorship after gnparser,
the same canonical name within one kingdom and rank, a RapidFuzz match at
0.92 or better inside one genus, denominations equal after the shared
normalizer or under the official romanization, and co-usage by gardeners as a
supporting signal that never proposes on its own. A kingdom mismatch on an
otherwise exact name records `homonym_kingdom_conflict` and proposes nothing.
Each proposal carries a confidence and closed reason codes; at or above the
rule's threshold in `catalog_reconcile_thresholds` it applies itself, below it
becomes a queue item ordered by impact. Applying and reverting are two SQL
functions from migration `0056` (`catalog_apply_queue_item`,
`catalog_revert_action`), so the worker and the owner's page share one
implementation and every action carries the inverse that restores the graph.
Thresholds recalibrate from 30-day revert rates within [0.80, 0.99]. Four job
kinds join the matching queue (`catalog_reconcile`, `catalog_curation_apply`,
`catalog_threshold_recalibrate`, `catalog_source_refresh`) and the three
suggestion kinds leave it with their tables' producers; a queued job of a
retired kind terminalises as `unsupported_kind`. gnparser is a pinned,
checksummed release installed by `services/matching/scripts/install-gnparser.sh`
into the image and both CI runners. The romanization of ADR-0026 D8 now exists
in Python as well, held to the same 82-case fixture as the TypeScript module,
so the spelling a form is addressed by and the spelling the ladder matches
cannot drift.

**Delivered 2026-09-06, OVE-389 (Slice 24, task 4 of 14).** The organism
card: one cached read (`readPublicVarietyPageByCatalogItemId`, tags
`organism:{id}` and `catalog`) assembles the page from one statement over the
graph tables (`src/server/public-organism-card-query.ts`: names, identifiers,
relations, facts and the snapshots behind their assertions, public and
accepted assertions only) plus the launch-guarded gardener experience. Sections
in D9 order: a fact-only first paragraph from structured fields (kind, species,
number of forms, gardeners with public journals, oblasts; templates in uk, bg,
ru), the gardener experience with the spread by oblast, relations (forms of the
species, pests of the plant, hosts of the pest with the host class), a collapsed
native `<details>` "Names and sources" panel that lists each source's
assertions with version and observed date and names an accepted-name
disagreement neutrally, and an attribution footer with the download date, the
newest assertion date and an outbound link per source. A card whose content
comes only from sources is reachable but `noindex` and absent from the sitemap
until `first_hand_content_at` is set (the publish path sets it for the node
and its species) or the owner sets `indexable_override`
(`organism_without_first_hand_content`). Worker-side changes revalidate
through the outbox: migration `0062` admits `catalog_item` intents with reason
`catalog_card` and no owner, `/api/cron/catalog-card-revalidate` drains them
daily (Vercel's Hobby plan refuses a cron that runs more than once a day; the
ten-minute cadence needs the Pro plan, and the card read's hour-long cache
profile bounds staleness meanwhile), `scripts/prove-catalog-card-revalidate.ts`
proves the migration, its rollback and the drain in CI. Production apply of `0062` is
recorded in `docs/PRODUCTION_SCHEMA_STATE.md`.

**Delivered 2026-09-06, OVE-388 (Slice 24, task 3 of 14).** Every organism
has a permanent address: a species answers at `/species/{slug}`, a cultivar
or breed at `/species/{species}/{form}`, in every locale; `/id/{uuid}` is the
permalink, and `/eppo`, `/col`, `/gbif` and `/wikidata` resolve external
identifiers. Every slug a card ever had, every old `/variety` and `/breed`
path and every merged card answer HTTP 308 to the canonical path; an unknown
slug answers a real 404. The status is decided in `src/proxy.ts` with one
bounded lookup before any shell streams (the Cache Components soft-404 rule,
recorded in ADR-0026's consequences) and again by the page for client-side
navigations. Form slugs are romanized from the registered denomination
(resolution 55/2010 for Ukrainian, the 2009 law for Bulgarian) by
`src/lib/catalog/slugs.ts`; `assignCatalogSlug` never reuses a slug and the
`0054` trigger writes the history. A form without a linked species keeps its
legacy address until the registers task links it. One builder,
`publicCatalogEvidencePath`, spells every catalog path. Organism pages emit
`Taxon` JSON-LD (`@id` = permalink, `scientificName`, `taxonRank`,
`parentTaxon`, `sameAs`, `dateModified`) with a `BreadcrumbList` and uk/bg/ru
`hreflang`; the sitemap's catalog chunk lists canonical addresses only,
`lastmod` from the content clock or the newest entry. Proofs:
`tests/catalog-addresses.spec.ts` against `next start` (CI), the address
repository, proxy and page unit tests, the 82-case slug fixture. No SQL of
its own; the picker's statement deadline went from 150 to 400 ms in the same
change after production showed a cold 503 at ~160 ms. The statement was
rewritten on 2026-09-07 to choose its eight rows before decorating them; see
known gap 0 for what that fixed and what it did not.

**Delivered 2026-09-06, OVE-387 (Slice 24, task 2 of 14).** The catalog picker
is one Postgres statement behind the public route `/api/public/catalog/typeahead`
(prefix index, then trigram; one row per organism; ranked by match class, the
reader's market, gardener usage and the crop prior; a 100 ms P95 budget with a 400 ms deadline; 60 s
shared cache, the one exception to hard rule 5). Meilisearch, the trigram flag
and the three-way merge left the pick path. A gardener's own name is a text
label on the object (`variety_state = 'free_text'`), never a catalog card and
never shown on a public surface; migration `0055` turned every provisional
card into a label, retired the cards, re-normalized stored names with the
shared normalizer and added `catalog_recompute_search_weight()`, run daily by
`/api/cron/catalog-search-weight`. Every query that ends without a pick lands
in `catalog_search_misses`. The composer and the object page share one
WAI-ARIA combobox with three outcomes: a species, a form with its species
implied, or "add as my own name". The legacy TypeScript importers still write
the pre-0055 name form; the register task of the slice replaces them.

**Decided 2026-09-05, evening.** The organism knowledge graph, ADR-0026,
implemented as SDD Slice 24 (umbrella `OVE-400`, sub-issues `OVE-386` through
`OVE-399`): one canonical card
per organism in OverGarden's own identity space over the retained source layer;
Catalogue of Life as the classification backbone, everything else attached as
sourced assertions; a Postgres-only picker with three one-tap outcomes where a
gardener's own name is a text label and never a card; hierarchical permanent
addresses with slug history and `Taxon` JSON-LD; an exception-only curation
queue in the account menu that never blocks a gardener; sources added one full
slice at a time, Catalogue of Life first, then Wikidata, then EPPO with a second
capture for hosts, distribution and categorization. This supersedes the
sentence in ADR-0025 that no source-built catalog is planned; the release
model stays retired. Later the same evening the owner pre-authorized every
production step of the slice; `docs/ORGANISM_GRAPH_EXECUTION.md` is the
executor's runbook and records the scope.

**Decided 2026-09-05.** The Stable Registry release model and the Release
Center are retired from the product and from every plan (ADR-0025). No
Foundation release will be built; a source-fed catalog curated in place was
decided the same evening (ADR-0026); the
catalog gardeners use — `catalog_items`, matching suggestions, the trigram
typeahead, `/objects` and the species, variety and breed pages — is unchanged.
The EPPO observed capture that `OVE-375` closed on 2026-09-04 stays, with every
table that holds EPPO data, the capture tooling and the credential; the plans
for that data are ADR-0026 D11. Removing the retired code and its empty tables is one pending slice,
`OVE-385`; the destructive half waits for a read-only inventory and the owner's
approval.

**Not planned.** Private entries, drafts, offline mode, a separate admin panel,
voice dictation, server-side image processing, an ORM, and a source-built
catalog through Foundation releases, editions, extension packs or a Release
Center. Each is a positive decision in ADR-0022 or ADR-0025, not an omission.

## Known gaps, stated deliberately

0. **The picker meets its budget warm and not across cold instances.** Fixed
   far enough on 2026-09-07 to be worth stating precisely, because two earlier
   explanations of this gap were wrong. Before: P95 129–216 ms warm, about
   410 ms across fifty distinct queries, four to ten of fifty answering `503`.
   After: **P95 32–108 ms warm, 158–266 ms across distinct queries**, and the
   `503`s all but gone. D7's budget is a 100 ms P95.

   Two defects were behind it, and only production could show either. The
   statement decorated every candidate before taking eight: four lateral joins
   an index search apiece, once per row of `scored`. The Ukrainian prefix for
   sunflower matches 2,395 names — the state register lists thousands of
   hybrids — so it spent about 410 of its 442 ms building display names for
   rows the limit discarded, and **every prefix of `соняшник` answered `503` in
   three consecutive runs** while `том` answered in 10 ms. And the trigram arm
   was asked about two-character queries, where one trigram matches tens of
   thousands of names: `so` read 45,095 index entries and 4,520 heap pages to
   contribute one row, and across all twenty-eight two-character prefixes in
   the fingerprint fixture it never changed the answer. A `shortlist` CTE now
   limits before decorating, and the arm is skipped below three characters.
   Proven row-identical on all 173 fingerprint prefixes, run in both orders:
   nothing exceeds the 400 ms deadline any more, against 12–17 of 173 before.

   What is left is connection setup, which is what the tail always was — just
   not what it was mostly. `pg` was closing the pooled connection after ten
   idle seconds, so a gardener typing every few minutes paid a fresh TCP and
   TLS handshake inside the keystroke; the pool now holds it for five minutes
   with keep-alive on. After both changes, 500 samples across three probes,
   including bursts five minutes apart so instances go cold, returned **no
   `503` at all**; the proof's own spread phase, which fires a hundred requests
   back to back and makes Vercel scale out, still saw 6 of 200. The slowest
   surviving samples say where that time goes: `баз` reported 404 ms of
   database time over HTTP and explains against production in 110 ms.
   `docs/ORGANISM_GRAPH_PROOF_2026-09.json` carries the run as generated.

1. **The framework defect itself is unfixed, and unreported.** Under Cache
   Components a thrown Server Component error during a postponed resume never
   completes or errors its Suspense boundary on a hard load, so `error.tsx`
   never renders. `OVE-374` removed every workspace page's reliance on thrown
   errors, so no reader is stranded — but the defect is still there for any code
   that forgets, and the upstream report with the three-page reproduction has not
   been filed. ADR-0023 records the mechanism.
2. **The signed-in chrome can disagree with the page during an outage.** When
   the session store is unreachable, a workspace page says so, but the site
   header still renders its signed-out state ("sign in"). The page is honest;
   the chrome is not yet, and it sits outside `/garden/**`.
3. **The slice's browser proofs are partial, and one of them was overstated.**
   Like, language and sign-in each had their *endpoint* proved with a real
   no-JavaScript POST against a production build, and all three were then
   verified end to end on production in a real browser. That is not the same as
   working with JavaScript off, and the earlier wording here said it was: every
   public page renders inside streamed Suspense boundaries, so with scripts
   disabled it shows nothing at all and no control is reachable. See ADR-0024
   D3 for the measurement and for why the crawler cases are nonetheless
   covered. A *successful* sign-in was never
   walked through in a browser — only the refusal path — so the `next`
   round-trip and the ADR-0022 D6 cross-tab reload are asserted by tests rather
   than observed. CI runs `tests/public-hydration.spec.ts` against a real
   Chromium on every push; the other Playwright specs still run by hand.
4. **No denominator for reader-facing failures.** Vercel Web Analytics is not
   enabled for the project, and runtime logs are retained for about an hour, so
   there is no denominator for "how often does a reader hit a failure". Server
   errors are aggregated for seven days, and a degraded section now writes its
   own line with a bounded class and the digest the reader can see on screen.
   This gap is narrower than "no analytics": GA4 and GTM are wired in
   `root-document.tsx` behind a consent banner, and Microsoft Clarity behind an
   env flag — but only on a marketing subset of paths (`/`, `/blog`, `/privacy`,
   `/support`, `/first-publication-disclosure`, and the `/answers/`, `/blog/`,
   `/guides/`, `/markets/` prefixes). Journal entries, the feed, objects and the
   workspace send nothing, so activation and retention — how many gardeners
   journal, how often they publish, whether anyone reads back — are not measured
   anywhere today.
5. **Closed 2026-09-05: the Stable Registry is retired and gone.** ADR-0025
   took the release model and the Release Center out of the plan; `OVE-385`
   took them out of the code the same day — the pages, the Stable Catalog
   explorer at `/catalog`, the three `stable_registry_*` job kinds and
   handlers, the pack-artifact adapters, the registry search scope and the
   product-selection gate — and the worker runs with six handlers. Migration
   `0053` then dropped every `catalog_registry_*`, `stable_registry_product_*`
   and `stable_registry_public_catalog_*` table, `catalog_item_revisions`,
   their functions and the three registry payload CHECKs on `job_queue` from
   production under the owner's written approval, after a read-only inventory
   found all twenty tables empty; its rollback recreates every object, and its
   executed proofs run on every CI build (`docs/PRODUCTION_SCHEMA_STATE.md`).
   The three Release Center flags still installed in Vercel were deleted with
   the owner's permission. The EPPO observed capture — 129,214
   identifiers, closed 2026-09-04 on the owner's loopback database, with a
   `pg_dump` kept outside it — is retained on purpose, together with
   `catalog_source_*`, the public EPPO archive at `/sources/eppo`, and the
   capture tooling; none of them is ever on a drop list.
6. **One owner only.** There is no role-grant interface; the single sealed owner
   is bootstrapped by CLI (ADR-0022, D5).
7. **`matching_worker_heartbeats` has no build timestamp.** The retired API read
   it from the image environment and no column holds it, so the runtime proof
   reports the image digest instead of inventing a value.
8. **The job queue contract is generated now.** The matching image release
   refused seventy-eight correct builds between 2026-08-27 and 2026-09-04 because
   the expected handler set was a frozen literal in five places and the manifest
   had grown three Stable Registry kinds. `apps/web/src/server/job-queue-manifest.ts`
   is now the only place that says what the set is: `pnpm queue:contract:build`
   writes the JSON contract and the Python module, `queue:contract:check` fails
   on drift, and `queue:contract:prove-database` executes the database half.
   Releases are green again, and since 2026-09-05 a candidate image is
   verified on the runner before the one push to the registry, so every tag in
   GHCR is a sealed release; the seventy-eight unverified images published
   during the red window are still there and must not be installed. `0051`
   (the heartbeat handler set is checked for
   shape, not identity — an exact array made a mismatched worker unrecordable
   and therefore indistinguishable from a dead one) and `0052` (the four payload
   CHECK constraints four kinds declared and none had) were applied to
   production on 2026-09-05; `docs/PRODUCTION_SCHEMA_STATE.md` carries the
   receipts and says why one constraint is deliberately `NOT VALID`.
9. **Closed 2026-09-05: production runs the current worker.** The sealed
   release of `63ce91d` was installed and activated on the droplet after the
   eight-day red window; the heartbeat row carried all nine handlers and both
   production proofs answered ready. The six-handler release of `d5faee5`
   replaced it the same afternoon through the same `install`, `migrate`,
   `deploy`, with both proofs ready again. Getting there took two more defects, each
   found only by deploying: preflight compared the candidate's handler set
   with the incumbent worker's heartbeat, so a release that changes the set
   could never pass (PR #289), and the drain outcome wrote a bare NULL
   parameter that Postgres could not type, so the first nine-handler worker
   restarted on every loop until the release script restored the prior image
   (PR #290). The worker's SQL now executes against a real Postgres in CI and
   in the release path: `services/matching/tests/test_runtime_database.py`.
10. **The media-lifecycle cron had never run in production.** `vercel.json`
    schedules `/api/cron/media-lifecycle` daily at 03:00 UTC and Vercel Cron
    invokes a scheduled path with GET. The route exported `POST` only, so every
    invocation since the schedule was added answered 405. Observed on
    2026-09-05: `media_lifecycle_retention_runs` held zero rows ever, nine queue
    rows sat at `attempts = 0` unclaimed, and the five derivatives of five
    deleted journal entries were still served from `media.over.garden` with HTTP
    200. An unauthenticated GET returned 405 for this path and 401 for the three
    cron routes that export GET, which is the whole difference. Fixed by
    exporting GET, and `src/app/api/cron/vercel-cron-contract.test.ts` now fails
    when any scheduled path has no GET, when a cron route is unscheduled, or
    when a scheduled route does not refuse an unauthenticated caller.
    `release-health.yml` probes the same thing against the deployed build once a
    day, because a route can be right in git and still not be what production
    serves. The fix is live — an unauthenticated GET now answers 401 — and the
    nine queued jobs drain on the next 03:00 UTC pass. Nothing was triggered by
    hand: `vercel env pull` does not return the `CRON_SECRET` value, and the
    evidence that the runtime holds one is that the learning-attribution cron,
    whose only production caller is its own scheduled route, advanced an outbox
    row three and a half days ago.

## How to check any of this yourself

```bash
cd apps/web
pnpm prove:owner-mvp-reset                 # the seven requirements against production
pnpm prove:workspace-resilience -- --base-url <running next start> --cookie-file <cookie>
pnpm smoke:matching-queue-health -- --environment production --confirm-environment production
pnpm smoke:matching-runtime-capabilities   # worker liveness from the heartbeat row
pnpm queue:contract:check                  # the generated queue contract matches the manifest
pnpm queue:contract:prove-database         # the two new CHECK constraints, executed
pnpm test:public-hydration                 # real Chromium, production build: public pages hydrate
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file <pulled-env>
```

Production reads are fine without asking. Anything that changes production data,
schema, or provider state needs one explicit owner approval each, per
`AGENTS.md`.
