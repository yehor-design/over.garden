# Delivery log — the organism knowledge graph, 5 to 7 September 2026

Status: dated receipt. Immutable once written; corrections are appended, not
rewritten. Current state lives in `docs/PROJECT_STATE.md`; the decisions live in
`docs/adr/ADR-0026-organism-knowledge-graph.md`; the executor's runbook and the
owner's standing authorization live in `docs/ORGANISM_GRAPH_EXECUTION.md`.

Twenty-six pull requests landed on `main` in about forty hours, from `#301` to
`#326`, delivering SDD Slice 24 (`OVE-386`–`OVE-399` under the umbrella
`OVE-400`). This page groups them by what they had to make true, so a reader can
see why each change exists without reading twenty-six diffs.

## What the slice was for

Before it, the catalog a gardener picked from was a flat table: one row per
name per source, a `catalog_kind` decided at insert, a `status` that said
`seeded` for almost everything, and a matcher that produced pairs nobody
reviewed. A tomato could be three rows. A gardener's own name for a plant became
a permanent catalog card that then had to be merged.

After it there is one canonical node per organism in OverGarden's own identity
space, with Catalogue of Life as the classification backbone and every other
source attached as a reified assertion that says who claimed what, from which
snapshot, under which licence. A gardener's own name is a label on their object,
never a card. Curation is an exception queue that never blocks anyone.

## 5 September — the foundation and the picker

**The graph, laid under the running catalog** (`OVE-386`, PR #302, migration
`0054`). Nodes, names, identifiers, relations, facts and assertions, backfilled
from the flat catalog without deleting a row or renaming a name. `node_kind`,
`identity_state` and `merged_into_catalog_item_id` joined `catalog_items`
alongside the columns they would eventually replace, so every existing reader
kept working.

**The picker, rebuilt on Postgres** (`OVE-387`, PR #303, migration `0055`). One
statement behind `/api/public/catalog/typeahead`: prefix hits from a
`text_pattern_ops` index, fuzzy hits from `pg_trgm`, one row per organism,
ranked by match class, the reader's market, gardener usage and a crop prior.
Meilisearch, the trigram feature flag and the three-way merge left the pick
path. Every provisional card became a text label on its object, and
`catalog_recompute_search_weight()` began running daily.

Two things the local proof could not have found. A GIN index build leaves
`pg_class.reltuples` wrong until `analyze`, so the planner picked a sequential
scan on a table it thought was empty. And the picker's statement deadline had to
go from 150 ms to 400 ms after production answered a cold 503 at about 160 ms —
the deadline excludes connection setup, which is exactly what a cold request
pays.

## 6 September — addresses, the card, the ladder, curation and three sources

**One permanent address per organism** (`OVE-388`, PR #304). A species answers
at `/species/{slug}`, a cultivar or breed at `/species/{species}/{form}`. Every
slug a card ever had, every old `/variety/*` and `/breed/*`, every `/id/*`
permalink and every `/eppo/*` code answers `308` to the canonical address; an
address nothing resolves answers `404`. All three statuses are decided in the
proxy before any shell streams, because a page that streams its shell first can
only answer `200`.

**The organism card** (`OVE-389`, PR #305, migration `0062`). One
JSON-aggregating statement assembles names, identifiers, relations, facts,
regions and attributions, filtered by rights and by curator decision. An
organism whose content comes only from sources is reachable but `noindex` until
a gardener publishes on it — the rule that keeps a hundred thousand
source-built pages out of the index without a word count or a quality class.

**The reconciliation ladder** (`OVE-390`, PR #307, migration `0056`). Six rungs
in order, each either linking a source row to a node, opening a queue item, or
doing nothing — never guessing. Above a rule's threshold the worker applies
itself; below it, the owner's page decides. Apply and revert are the same two
SQL functions in both paths, so a decision made by a person and one made by the
worker are undoable the same way.

**Owner curation** (`OVE-391`, PR #309). One decision stream in the account
menu, source cards, inline edit, one-click revert and a weekly digest. Two owner
links, no CMS, no second admin surface.

**Catalogue of Life** (`OVE-392`, PR #310, migration `0057`). The release does
not fit production whole, so the source layer holds a scoped snapshot — the
plant kingdoms — and the full-catalogue path stays a command rather than a
default.

**Wikidata** (`OVE-393`, PR #311). Shared identifiers for every node it can
corroborate, and local names in four languages.

**EPPO on the graph** (`OVE-394`, PRs #312, #318, #321). Codes, names and
taxonomy from the observed capture. A checklist synonym now reaches its accepted
node instead of stopping at the name. And the capture's finalize, which had run
for eight hours doing nothing, turned out to be calling a `stable` function once
per group: `catalog_capture_declared_classes` written bare on the right of a
`having` lands in the group filter; wrapped in a scalar subquery the planner
lifts it into an InitPlan and calls it once. 129,214 records, twenty minutes.

## 7 September — registers, corroboration, health and the closeout

**Every registered form attached to its species** (`OVE-395`, PRs #313–#317).
A Ukrainian register cultivar, an EU Common Catalogue variety and a bee breed
each end with exactly one `form_of` relation, a denomination, an identifier and
a registration fact carrying the register, the market and the year. A row whose
species nothing knows becomes exactly one queue item and no relation — one or
the other, never both and never neither.

**Corroboration through WFO and GBIF** (`OVE-396`, PR #320). Two pinned
releases, checksummed and read in a stream. A tie between two candidates is a
homonym, never a guess.

**A pest chip while writing** (`OVE-397`, PR #324). What gardeners saw, by
oblast and week — the only first-hand layer on a card.

**Whether picking works, measured** (`OVE-398`, PR #325, migration `0060`).
Four outcomes per attempt, the query's length rather than the query, the time to
a pick, ninety-day retention, and the misses nobody has answered yet.

**The closeout** (`OVE-399`, PR #326, migration `0061`). `catalog_kind`,
`status`, the two matcher suggestion tables, the retired job kind's payload
check and `user_added` all leave the schema, and every line of code that served
them leaves with them. `pnpm prove:organism-graph` is what lets anyone returning
cold check the whole slice in one command.

## Three defects the slice found by running itself in production

**EPPO repeats itself, and a repeat ended the run** (`OVE-394`, fixed in the
closeout). The second capture's reconciliation failed three times, each about
85% through a two-hour run, reporting only `transient_handler_error` — the
worker's redacted constant, which says a handler raised and nothing more.
Teaching it to record `handler:<exception class>@<module>` named the fault on
the next failure: `handler:unique_violation@eppo_reconcile`.

`INSERT_FACT_SQL` had no conflict clause. One EPPO payload can name the same
region twice — a country row beside its own sub-region row, or a
categorization added and later made transient — and both reduce to the same
`(predicate, region, value)` under one assertion, which is exactly
`catalog_item_facts_uidx`. The relation insert beside it already guarded itself
that way; the fact insert was missed. A two-hour job died on the first taxon
that repeated itself, and nothing in the receipt could say why.

Worth keeping: the fix was one clause, but finding it needed a deploy, because
the only evidence the system kept was a constant.

### Two more, in the slice's own tooling

**The deploy's verification smoke read the wrong database** (PR #323). It loaded
`.env.local`, which names the loopback database, so a production run reported
the handler set of a worker nobody had deployed. `--env-file` now wins, as it
does in every other production script.

**The migration set stopped being replayable** (part of PR #326). `0061` drops
columns that five statements across `0001`, `0012`, `0054` and `0055` still
read, and `bootstrap-local.ts` re-applies every migration from `0001` on every
run. The second pass died on the first of them. Each site got the guard `0001`
already used elsewhere. A sixth failure found on the way was older than this
slice: `0001` creates a partial index on `engagement_likes.like_state`, dropped
by `0049` in the interaction slice.

**The worker had not been able to reach Meilisearch since 23 July** (found by
the closeout deploy). Both Caddy's `reverse_proxy` and the worker's
`MEILISEARCH_HOST` still named `meilisearch:7700`, the alias of the container
the OVE-198 upgrade replaced. From inside the worker container that host gave
`000` and `meilisearch-next:7700` gave `200`. Nothing reported it for six and a
half weeks: the heartbeat is honest about the worker and silent about its
dependencies, and no `journal_entry_index` job had been enqueued in that
window, so the one code path that would have failed was never taken. The
`matching-release deploy` preflight refused the release and is what found it.

## The sitemap disagreed with the page, and using the lever found it

D9 gives an organism card two ways to be indexable: a gardener publishes on it,
or the owner marks it. The page honoured both. The sitemap query said it
honoured both — the `or` is there with a comment naming the decision — and then
required an inner join to a public entry, which made the owner's half
unreachable.

So the owner marked the tomato from the controls on its own card, the page
answered `index, follow` with a `Taxon` graph carrying eight `sameAs`, and
`/sitemaps/catalog.xml` stayed empty. Two places, one rule, different answers.

The joins are what `lastmod` and the entry count need, not what admission
needs; they are left joins now and every predicate about an entry travels with
the entry. No test could have found this — it needed someone to press the
button.

## What is not finished

Recorded here so the next reader does not have to rediscover it:

* **No organism page is indexable yet.** `first_hand_content_at` is set on two
  rows, both retired pre-graph cards; every public journal entry is on an object
  whose variety is free text with no node. Under D9 that means the catalog
  sitemap is empty and no page carries `Taxon` JSON-LD. The mechanism is
  correct and live — a gardener picking an organism and publishing on it sets
  the flag — but the data condition has not happened.
* ~~Three crosswalks barely ran in production.~~ **Closed the same day, and
  the reason was different for each.** WFO and GBIF had simply never been
  repeated; Wikidata *could not* run at all, because a five-hundred-name SPARQL
  query is about nine thousand characters as a URI and the service answers
  `414 Request-URI Too Large` — not a retryable status, so no amount of
  patience helped. Queries are posted now.

  | | before | after |
  | -- | -- | -- |
  | gbif | 20 | **81,847** |
  | wfo | 17 | **54,587** |
  | wikidata | 29 | **4,900** |
  | col | 57,803 | 58,300 |

  With them came the local names the picker searches: 35,933 Ukrainian, 21,002
  Russian, 5,066 Bulgarian vernaculars.

  What this does *not* block, contrary to the note written while the run was
  in progress: typing `колорадськ` in the picker does find *Leptinotarsa
  decemlineata* today, matched through the Russian vernacular EPPO carries
  (`колорадский жук`) by the shared normalizer. `OVE-397`'s criterion is met
  without the Wikidata names.
* **The picker missed its P95 budget on the real dataset, and three
  explanations were needed before the right one.** Against production, every
  sample forced to the origin:

  | | median | P95 | 503 |
  | -- | -- | -- | -- |
  | warm, before | 69–85 ms | 129–216 ms | 0 of 50 |
  | fifty distinct queries, before | 63–98 ms | 408–419 ms | 4–9 of 50 |
  | warm, after | 17–22 ms | **32–108 ms** | 0 of 50 |
  | fifty distinct queries, after | 32–37 ms | **158–266 ms** | 0–5 of 50 |

  The 503s were never cold instances. They were **one query shape**, and it is
  the shape a Ukrainian gardener types most: walking the fingerprint prefixes
  three times, every prefix of `соняшник` failed every round, while `том`
  answered in 10 ms. Explained against production: `соняшник` 442 ms, `со`
  364 ms, `том` 10.7 ms, against a 400 ms deadline.

  Two defects, both invisible to any test on a fixture:

  1. **The statement decorated every candidate, then took eight.** Four lateral
     joins — a vernacular, a `form_of` relation, the parent, the parent's
     vernacular — ran once per row of `scored`. `соняшник` matches 2,395 names,
     because the Ukrainian state register lists thousands of sunflower hybrids,
     so the plan did about 9,600 index searches to build display names for rows
     `limit 8` discarded: roughly 410 of the 442 ms. Every column the ordering
     reads already sat in `scored`, so a `shortlist` CTE now applies the
     duplicate filter, the ordering and the limit first (`loops=8`, from 2,395).
  2. **The trigram arm was asked about queries it cannot answer.** A
     two-character query has one trigram: for `so` the `%` operator read 45,095
     index entries and 4,520 heap pages to contribute one row. Measured rather
     than assumed — across all 28 two-character prefixes in the fingerprint
     fixture, removing the arm changed nothing; at three characters and above
     it changes answers throughout, so it is skipped only below three.

  Proven against production on all 173 prefixes the fixture expands to, run in
  both orders so neither statement got the other's warm buffers: **rows
  identical 173/173**, P95 418–472 → 190–226 ms, slowest 875–908 → 262–303 ms,
  and **0 of 173 over the deadline** against 12–17 before.

  What remains is connection setup — the tail that the first explanation
  claimed was all of it. `pg` closes a pooled connection after ten idle
  seconds, so a gardener typing every few minutes paid a fresh TCP and TLS
  handshake inside the keystroke; the pool now holds it for five minutes with
  keep-alive. After both changes 500 samples across three probes, including
  bursts five minutes apart so instances go cold, returned no 503; the proof's
  own spread phase, a hundred requests back to back, still saw 6 of 200. `баз`
  reports 404 ms of database time over HTTP and explains in 110 ms, which is
  where the difference sits.

  The 26.6 ms recorded for `OVE-387` was measured against a local production
  build over about 15,900 nodes; production holds 114,669 and 246,888 names.
  That is the same trap as every other number measured on the wrong database.

  Three false starts are worth recording so nobody repeats them. The failures
  were first blamed on the reconciliation loading the database; they persisted
  with the database idle. Then the measurement itself turned out to be reading
  Vercel's edge cache — the route carries a 60 s shared cache and
  `Server-Timing` is cached with the body, so a repeated URL returns the timing
  of whenever the entry was written, and a `no-cache` request header does not
  defeat a shared cache. Then the tail was attributed to cold instances on the
  strength of one `explain` of `том` — a query that happens to be cheap. Each
  time the correction came from measuring the thing itself: which queries fail,
  not which explanation is plausible.
