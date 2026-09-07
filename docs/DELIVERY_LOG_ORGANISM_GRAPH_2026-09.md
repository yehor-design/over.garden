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

## What is not finished

Recorded here so the next reader does not have to rediscover it:

* **No organism page is indexable yet.** `first_hand_content_at` is set on two
  rows, both retired pre-graph cards; every public journal entry is on an object
  whose variety is free text with no node. Under D9 that means the catalog
  sitemap is empty and no page carries `Taxon` JSON-LD. The mechanism is
  correct and live — a gardener picking an organism and publishing on it sets
  the flag — but the data condition has not happened.
* **Three crosswalks barely ran in production.** On 114,669 nodes there are 29
  Wikidata identifiers, 20 GBIF and 17 WFO, against 109,514 EPPO and 15,177 UA
  register. The shared-identifier rung of the reconciliation ladder has almost
  nothing to work with until those runs are repeated at full scope.

  What this does *not* block, contrary to the note written while the run was
  in progress: typing `колорадськ` in the picker does find *Leptinotarsa
  decemlineata* today, matched through the Russian vernacular EPPO carries
  (`колорадский жук`) by the shared normalizer. `OVE-397`'s criterion is met
  without the Wikidata names.
* **The picker's production budget is unmeasured on the real dataset.** The
  26.6 ms P95 recorded for `OVE-387` was measured against a local production
  build over about 15,900 nodes. Production now holds more than 100,000.
