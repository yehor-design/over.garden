# Production schema state

Status: living record of what is applied in the production database.
Owner: whoever applies a migration updates this page in the same pull request.
Last inventory: 2026-09-11. Divergences noted 2026-09-04 and 2026-09-05.

`docs/MIGRATION_ALLOCATION.md` reserves migration numbers. It says nothing about
what production actually runs. This page closes that gap, because on 2026-09-03
an inventory found production fifteen migrations behind the repository —
including the entire Stable Registry schema and the journal-deletion columns
whose absence had been failing owner deletes with a 500 for days.

## How to read the current state

```bash
cd apps/web
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file <pulled-env>
```

The command connects read-only, names the host class and database, and reports
one status per migration file. Pull the environment from the platform rather
than reading a checked-in file; nothing here needs a secret to be written down.

## Status vocabulary

| Status        | Meaning                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `applied`     | every object the migration creates is present                                                                          |
| `no_sentinel` | the migration has no probe-able object (a drop, a data fix, a constraint change); its effect is not machine-verifiable |
| `partial`     | some objects present, some absent — normal when a later migration retired part of an earlier one                       |
| `missing`     | none of its objects exist                                                                                              |

`partial` and `missing` are not automatically defects. Read the `absent` list
before acting: an object a later migration deliberately removed will always read
as absent.

## State on 2026-09-03

Applied and verified (25): `0005`, `0006`, `0008`, `0009`, `0011`, `0012`,
`0015`, `0016`, `0017`, `0018`, `0019`, `0022`, `0023`, `0024`, `0025`, `0026`,
`0027`, `0028`, `0038`, `0039`, `0042`, `0043`, `0044`, `0045`, `0047`.

Applied without a probe-able sentinel (10): `0007`, `0010`, `0020`, `0021`,
`0035`, `0036`, `0037`, `0040`, `0041`, `0046`.

Expected residue, no action:

- `0001` and `0013` report `partial`. Their absent objects — the journal draft
  table, `public_noindex`, the quarantine index, the safe-media-admission
  columns — were retired by later migrations under ADR-0017, ADR-0019, and
  ADR-0022.
- `0014` and `0029` report `missing` and stay that way. `0014` created the
  launch media-quality columns that ADR-0022 D2 removed; `0029` created the
  online journal drafts that ADR-0017 removed. Applying either would restore a
  retired concept.
- Since 2026-09-05, `0024`, `0026`, `0027` and `0028` report `missing` and
  `0025` and `0043` report `partial`: `0053` dropped the Stable Registry release
  model they created (ADR-0025). `0053` itself reads `applied`. Applying any of
  them again would restore the retired model; the EPPO half of `0025` and the
  `catalog_item_names` index of `0043` are present and stay.

## The 2026-09-03 catch-up

Applied by hand in this order under the owner's blanket approval, one
transaction each, `lock_timeout` 30 s, host class guarded:

`0039`, `0007`, `0010`, `0020`, `0021`, `0023`, `0024`, `0025`, `0026`, `0027`,
`0028`, `0035`, `0036`, `0037`, `0040`, `0041`, `0042`, `0043`, `0044`, `0046`,
`0047`.

What the gap had been costing:

- `0039` missing meant deleting a journal entry failed with a missing
  `deleted_at` column; the owner could not remove their own entry.
- `0023`–`0028`, `0040`, `0041` missing meant the Stable Registry pages threw
  `42P01` for missing relations, which the reader saw as an endless skeleton.
- `0047` missing meant photos were promoted with their variants but the variants
  were never recorded, so no `srcset` and no placeholder reached a reader.

## The 2026-09-04 application of `0049`

`0049_ove377_owned_engagement_likes.sql` was applied to production on
2026-09-04 through `scripts/apply-reviewed-migration.ts`, one transaction, host
class `digitalocean_managed`, database `defaultdb`, 307 ms. It was executed
first inside a transaction that was rolled back, to see the resulting shape and
to confirm the owner check refuses both a row with two owners and a row with
none (`23514` both ways), before being applied for real.

It is the only migration in this repository that deletes rows, and it does so by
the owner's explicit sign-off under `AGENTS.md` rule 10: `anonymous_device_hash`
is derived from a token scoped to one target and held in someone's browser, so
it names neither a person nor a device this schema can reach and no conversion
into `user_id` or `visitor_id` exists. Read before applying: 13 rows, of which 10
were still counting, and every one of them was a verification POST made earlier
the same day. The rollback file restores the columns but cannot restore rows,
and says so.

Verified against production immediately after, and re-verified on 2026-09-04
when this page was written:

```
engagement_likes columns: id, target_kind, target_ref, created_at, updated_at, user_id, visitor_id
engagement_likes indexes: engagement_likes_pkey, engagement_likes_target_idx,
  engagement_likes_user_recent_idx, engagement_likes_user_target_uidx,
  engagement_likes_visitor_target_uidx
engagement_like_target_budgets: absent
```

The deploy order was migration first, then code. Both orders leave a window in
which one half does not match the other; migration-first was chosen because
OVE-376 had already shipped the settlement boundary, so the older code degraded
into `interaction-unavailable` for the two minutes the build took rather than
into anything worse.

**This page was written after the fact, not in the pull request that applied the
migration — which is the rule at the bottom of this file, broken by the person
who wrote the rule down.** The gap lasted about two hours, during which this
page said production ran a schema it no longer ran.

## The 2026-09-05 application of `0051` and `0052`

Both were applied to production through `scripts/apply-reviewed-migration.ts`,
one transaction each, host class `digitalocean_managed`, database `defaultdb` —
`0051` in 281 ms, `0052` in 178 ms.

`0051` replaces `matching_worker_heartbeats_supported_handlers_check`. It pinned
`supported_handlers` to an exact array, which made the one state worth seeing
unrecordable: a worker whose handler set differs from the manifest could not
write a heartbeat at all, so it read as dead rather than as
`capability_mismatch` — and that row is the only liveness signal there is. It
also coupled image and schema in both directions. The replacement checks shape
(one to sixty-four lowercase snake_case names) and leaves identity to
`app.runtime`, the web classification, and the release script.

`0052` adds the four payload CHECK constraints that four kinds declared and none
had. **Its first attempt failed and rolled back**, which is what the design
intends: `validate constraint` refused
`job_queue_media_derivative_revoke_payload_check` because production holds five
`media_derivative_revoke` rows written on 2026-08-23 with no `mediaAssetId` —
the producer did not send one yet. All five are `done`; the five written on
2026-09-03 satisfy the contract exactly. The applied version therefore leaves
that one constraint `NOT VALID`: every new and updated row is checked, and five
terminal rows stay as the record of what was written, rather than being deleted
or the contract weakened to match a shape nothing emits any more.

Read back immediately after, read-only, against `digitalocean_managed` /
`defaultdb`:

```
job_queue payload checks: all twelve present
  validated: catalog_alias, catalog_fuzzy_duplicate, catalog_match,
             catalog_typeahead, erasure_media_object_delete,
             stable_registry_edition_build
  not valid: journal_entry_index, journal_entry_unindex,
             media_derivative_revoke, media_staging_finalize,
             stable_registry_extension_pack_build,
             stable_registry_foundation_build
matching_worker_heartbeats_supported_handlers_check:
  names no handler, checks cardinality, validated
matching_worker_heartbeats: handler_count 6, fresh
```

Two things that read-back settles. The deployed worker really does report six
handlers, so production has no handler for the three Stable Registry build kinds
and one enqueued there terminalises as `unsupported_kind` — the release was red
for eight days and the host installs only sealed artifacts. And five of the
pre-existing payload constraints were already `NOT VALID` before this change;
that is inherited state, not something `0052` introduced.

Also observed, and outside this change: the `media_lifecycle` outbox has
unfinished work — five `media_derivative_revoke` rows pending for about a day
and a half, and four `media_staging_finalize` rows pending for about three and a
half days. Both kinds are web-owned. Nothing here drains them.

## Landed on main, not applied to production

| Migration | Why it is not applied                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0048`    | The capture claim-ordering index. It only matters where an observed capture runs, and OVE-254 refuses production capture, so production has the table and no rows to claim. Additive and reversible — one partial index, no column, constraint, or row — so it can be applied whenever the owner wants production converged with `sql/`. |

Applied on the loopback database on 2026-09-03 through
`scripts/apply-reviewed-migration.ts` and verified by `pg_indexes`. Whoever
applies it to production updates the inventory above in the same pull request.

`0050` was superseded by `0051` before either reached production; applying it
is unnecessary. `pnpm queue:contract:prove-database` executes both `0051` and
`0052` against a disposable database on every CI run — nineteen accept and
refuse cases, including the two defects execution found in the first draft of
`0051`.

## The 2026-09-05 application of `0053`

`0053_ove385_retire_stable_registry_release_tables.sql` drops the empty Stable
Registry release tables (ADR-0025, D4 part 2): every `catalog_registry_*`
table, `stable_registry_product_*`, `stable_registry_public_catalog_*` and
`catalog_item_revisions` — twenty tables — together with their eighteen
functions, the catalog materialisation trigger, and the three payload CHECK
constraints of the retired kinds on `job_queue`. It first rewrites the shared
read-model trigger function to keep only its EPPO branch, so the retained
trigger on `catalog_source_capture_runs` keeps working.
`sql/rollback/0053_ove385_retire_stable_registry_release_tables.down.sql`
recreates every object from the verbatim text of the migrations that first
created them, and cannot restore rows — which is why the migration runs only
where the inventory found none.

Read-only inventory of production on 2026-09-05
(`pnpm schema:retirement:inventory` under the production environment; host
class `digitalocean_managed`, database `defaultdb`):

```
drop targets: 20 tables present, every one 0 rows
              18 functions present, 3 payload constraints present
retained:     catalog_source_capture_runs 0, catalog_source_capture_units 0,
              catalog_source_records 16,299, catalog_source_snapshots 34,
              catalog_source_links 15,934, catalog_source_refresh_events 0,
              catalog_source_refresh_records 0,
              stable_registry_public_eppo_records 0,
              stable_registry_public_eppo_search_terms 0,
              catalog_items 15,934, catalog_item_names 61,908
              EPPO materialise trigger present
```

Production holds no observed capture, which is why the EPPO read-model tables
are empty there; they are retained all the same. `scripts/apply-reviewed-migration.ts
--mode inventory` (which now understands `drop table` sentinels) reports `0053`
as `missing` with all twenty drop targets `stillPresent` at zero rows.

Executed proofs: `pnpm schema:retirement:prove-database` builds a fresh
bootstrap up to `0052`, applies `0053`, its rollback, and `0053` again, and
asserts every dropped object gone, every retained object present with an
identical row count, and every dropped object back after the rollback (in CI on
every run). `pnpm schema:retirement:prove-database --loopback-rollback` did the
same inside a rolled-back transaction on the owner's loopback database, where
the retained tables hold the real capture — 387,809 capture units, 121,777
public EPPO records, 1,488,204 search terms — and every count was identical
after `0053`. The loopback database then received `0053` for real.
`src/db/generated.ts` was reduced by exactly the twenty retired interfaces from
the committed baseline rather than regenerated from the loopback database,
which carries unrelated local drift (`0038` and `0046` refuse to apply there);
CI's `db:types:check` against a fresh bootstrap is the comparison that counts.

The owner approved the application in writing on 2026-09-05, for this
migration alone (`AGENTS.md` rule 10). It was applied the same day through
`scripts/apply-reviewed-migration.ts --mode apply --migration 0053` with the
production environment injected and `apps/web/.env.local` moved aside: one
transaction, `lock_timeout` 30 s, host class `digitalocean_managed`, database
`defaultdb`, 46 statements, 339 ms. The read-only inventory immediately before
matched the one above (twenty tables, zero rows).

Read back immediately after, read-only, through `pnpm schema:retirement:inventory`:

```
alreadyApplied: true
drop targets: 0 of 20 tables present, 0 functions, 0 constraints
retained:     every table present; counts identical to the inventory before
              (catalog_source_records 16,299, catalog_source_snapshots 34,
              catalog_source_links 15,934, catalog_items 15,934,
              catalog_item_names 61,908; the capture and EPPO read-model
              tables 0, as before)
              EPPO materialise trigger present; the read-model function no
              longer names the catalog release
```

`scripts/apply-reviewed-migration.ts --mode inventory` now reads `0053` as
`applied`, and `0024`, `0026`, `0027`, `0028` as `missing`, `0025` and `0043` as
`partial` — the expected residue listed above. Gap 5 in
`docs/PROJECT_STATE.md` is closed.

## The 2026-09-05 application of `0054`

`0054_ove386_organism_graph_foundation.sql` (ADR-0026, the organism graph
foundation) was applied to production on 2026-09-05 under the owner's standing
authorization for SDD Slice 24 (ADR-0026 amendment, `docs/ORGANISM_GRAPH_EXECUTION.md`
section 1), so no per-migration approval was requested. Applied through
`scripts/apply-reviewed-migration.ts --mode apply --migration 0054` with the
pulled production environment: one transaction, `lock_timeout` 30 s, host class
`digitalocean_managed`, database `defaultdb`, 143 statements, 35,721 ms.

The read-only inventory immediately before reported `0054` as `missing` with
every one of its 8 tables, 21 columns and 17 indexes absent, and `0053` as
`applied`. It also reported `0048` as `missing` (the capture claim-ordering
index): production has never held a capture, and that index is not this
migration's concern; it is noted here so the residue is not mistaken for a
defect of `0054`.

Before applying, the same file was executed forward, back and forward on a
fresh bootstrap (`pnpm schema:organism-graph:prove-database`, now a CI step),
replayed on the owner's loopback database around a fingerprint of every item,
name, object and source link plus thirty typeahead answers, and compared on a
production build: the fingerprint hashes and the warm page responses were
identical before and after; cold responses differed only in the order of
streamed RSC chunks, which varies between runs of the same build.

Read back immediately after, read-only, aggregates only:

```
0054: applied (every table, column and index present)
catalog_items:      15,924 cultivar / 5 breed / 5 taxon, all active;
                    kingdom Plantae on every cultivar and on the four species
                    of the backbone wave, Animalia on every breed
catalog_source_assertions: 15,934 = catalog_source_links 15,934,
                    no link without an assertion
catalog_item_identifiers: ua_register 15,177, eu_common_catalogue 721,
                    col / wfo / eppo / wikidata / gbif 4 each, grin 3, vbo 2
catalog_item_slug_history: 15,914 = items with a public slug 15,914
catalog_item_names: 61,908 rows, unchanged; name_type denomination 15,929,
                    scientific_accepted 8, scientific_synonym 1, the rest
                    vernacular; script Cyrl / Latn from the locale
first_hand_content_at set on 2 items (the ones with live public entries)
catalog_normalize_name of "Solanum lycopersicum 'De Barao'"
                    = "solanum lycopersicum de barao"
```

Nothing a gardener or a crawler sees changed: no row was deleted or renamed,
`catalog_kind` and `status` stay for the legacy readers until the closeout
migration `0061`. The deploy order was migration first, then code, and the code
in the same pull request reads nothing the old schema lacks.

## The 2026-09-06 application of `0056`

Executed by the OVE-390 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), from the PR branch
before the merge, with `scripts/apply-reviewed-migration.ts` and the pulled
production environment (deleted afterwards).

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0054`, `0055` and `0062` applied, `0056` missing (absent: table
`catalog_reconcile_thresholds`). Read-only counts: 24 jobs of the three
retired kinds, every one of them `done` (16 `catalog_match_suggestions_refresh`,
4 `catalog_alias_suggestions_refresh`, 4 `catalog_fuzzy_duplicate_qa_refresh`),
so retiring the kinds strands nothing; `catalog_curation_queue` and
`catalog_curation_actions` empty; 14 objects carrying a gardener's own name
with no card; 0 unlinked source records; 15,914 active, addressed, global
nodes; the heartbeat's six-handler set.

**Apply** (`--mode apply --migration 0056`): 358 ms. The applier's
`statementCount` counts semicolons and reported 150; the file holds about
twenty statements, three of them plpgsql bodies, and is sent as one.

**After** (`--mode inventory`: applied, nothing absent; read-only readback):
the functions `catalog_apply_queue_item`, `catalog_revert_action` and
`catalog_record_card_intents` exist; `catalog_reconcile_thresholds` holds six
rules at 0.9500; the payload checks are
`job_queue_catalog_reconcile_payload_check`,
`job_queue_catalog_curation_apply_payload_check`,
`job_queue_catalog_threshold_recalibrate_payload_check`,
`job_queue_catalog_source_refresh_payload_check` beside the unchanged
`job_queue_catalog_typeahead_payload_check`; the three retired kinds' checks
are gone. No row of `catalog_items`, `plant_objects` or `job_queue` was
touched: the migration adds constraints, a table, its seed and three
functions.

## The 2026-09-06 application of `0058`, the second EPPO capture vocabulary

Executed by the OVE-394 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), with
`scripts/apply-reviewed-migration.ts` and the pulled production environment
(deleted afterwards).

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0058` reports `no_sentinel`, and it always will. It creates no
table and adds no column, so the applier's sentinel scan has nothing to look
for; the state is read from the constraint and the function instead. The
database was **1,847 MB** of a 10 GiB plan, and held **no** EPPO capture: zero
rows in `catalog_source_capture_runs` and zero in
`catalog_source_capture_units`.

**Apply** (`--mode apply --migration 0058`): 4 statements, 222 ms.

**After**, read directly rather than by sentinel:

- `catalog_source_capture_units_endpoint_class_check` now admits seven values —
  `taxon_list`, `taxon_overview`, `taxon_names`, `taxon_taxonomy`, and the
  three the second capture adds: `taxon_hosts`, `taxon_distribution`,
  `taxon_categorization`.
- `catalog_capture_declared_classes(uuid) returns integer` exists.

**Why a function and not a wider constant.** Each capture declares three
classes; the vocabulary now holds six. Everything that counts units per
identifier — four completeness checks that rebuild a source record's payload
from its units, and the closure arithmetic that decides whether a capture may
finish — used to compare against the length of the constant. Widening the
constant alone would have made every one of those checks stop matching, and
since all 129,214 records of the first capture keep their payload in their
units and nowhere else, that is silent data loss rather than a failing test.
The function answers from the run itself, so both captures verify.

The migration changes no row. The rollback narrows the constraint again and
drops the function, and it deliberately refuses to delete captured rows: a
capture is an observation, and an observation is not undone by a schema change.

## The 2026-09-06 application of `0057` and the first Catalogue of Life ingest

Executed by the OVE-392 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), with
`scripts/apply-reviewed-migration.ts` and the pulled production environment
(deleted afterwards).

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0057` missing (absent: both `catalog_source_col_*` tables, the
`normalized_scientific_name` column and its index). The database was **342 MB**
of a 10 GiB plan; its largest table was `catalog_source_records` at 209 MB.

**Apply** (`--mode apply --migration 0057`): 182 statements, 375 ms.

**The ingest.** `COL_INGEST_KINGDOMS=Plantae,Fungi,Chromista` with the pinned
release: COL26.7 Base Release, dataset key 315777, doi 10.48580/dgyhw, archive
`https://download.checklistbank.org/col/monthly/2026-07-14_coldp.zip`,
sha256 `3fac0cd59be401fdd48df0e5b0dd6215cb87269ecfa066af6e9a6d9bfcd6de36`,
1,047,658,887 bytes.

**Why scoped.** The whole release is 5,413,595 usages and 3.3 GB in Postgres
with its indexes; two snapshots are kept, so the full checklist would need
about 6.6 GB of a 10 GiB disk that also carries the application's data and its
write-ahead log. The plant kingdoms are 1,976,974 usages, about 1.2 GB. The
source readiness manifest asked for exactly this ("importer must scope to plant
catalog needs first"), and each snapshot row records its scope in
`source_version`, so a row always says what it holds. Adding Animalia is one
environment variable once the plan is larger.

**After.** Snapshot `b7870919-7d61-43a9-b8f8-a0e735a7502c`, version
`COL26.7, key 315777, doi 10.48580/dgyhw, kingdoms Chromista+Fungi+Plantae`,
licence CC BY 4.0 with attribution. **1,976,977** usages (the three kingdom
rows are carried by name: Catalogue of Life leaves `kingdom` blank on a
kingdom's own row, and without them a plant's classification stops one rank
below Plantae) and **38,415** vernaculars. `catalog_source_col_usages` is
1,447 MB and the database went from 342 MB to **1,846 MB** of the 10 GiB plan.

The materialization placed every node production had on the tree: 4 species
became **29 taxon nodes**, 28 of them with a parent, all 29 carrying a `col`
identifier, and no queue item — nothing was left unmatched. The tomato resolves
Plantae → Pteridobiotina → Tracheophyta → Magnoliopsida → Solanales →
**Solanaceae** → Solanoideae → Solaneae → Solanum.

**Two corrections during the run, both now in the migration.** The first
attempt of the scoped ingest raised `unknown usage P` when a plant's chain
reached a row above kingdom that the scope had dropped; `catalog_col_ensure_node`
now ends a chain at the edge of the snapshot instead of failing. Ancestor
arrays are copied from a parent as it stands, so a node attached before its
parent gained one carried a short chain; the pass now recomputes every array
from the roots in one recursive statement.

## The 2026-09-07 application of `0060` and `0061`, the closeout

Executed by the OVE-399 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1) plus the owner's
explicit decision of 2026-09-07 to delete the legacy suggestion rows, with
`scripts/apply-reviewed-migration.ts` and the pulled production environment
(deleted afterwards). Applied after the sealed worker release of `7b0a287` was
deployed, because the incumbent worker still wrote the columns `0061` drops.

**The read-only inventory `0061` is gated on** (host class
`digitalocean_managed`, database `defaultdb`):

```
catalog_match_suggestions            37 rows   generated 2026-07-18 … 2026-08-13
catalog_fuzzy_duplicate_suggestions  2,230     generated 2026-07-23 (one pass)
plant_objects variety_state='user_added'    0
journal_entry_topic_signals 'catalog_kind'  0
job_queue catalog_typeahead_reindex, not terminal   0
catalog_items                        114,669 nodes
  distinct catalog_kind              3
  distinct status                    2
```

2,267 rows in total, none of them a gardener's: a pair of catalog identifiers
and a score, with no gardener text and no reference to a person. Every
`catalog_typeahead_reindex` job ever queued is `done`, so retiring the kind
stranded nothing. No object carried `user_added`, and no topic signal carried
`catalog_kind`, so both narrowings moved no row.

**Apply.** `0060` first, because OVE-398's pick events had never been applied:
13 statements, 320 ms. Then `0061`: 50 statements, 5,377 ms.

**After** (read-only readback):

```
catalog_items columns catalog_kind, status           0 of 2 present
catalog_match_suggestions                            absent
catalog_fuzzy_duplicate_suggestions                  absent
catalog_items_owner_normalized_locale_node_uidx      present
catalog_items_owner_normalized_locale_kind_uidx      absent
catalog_pick_events                                  present
job_queue_catalog_typeahead_payload_check            absent
plant_objects_variety_state_check   selected, free_text, unknown
journal_entry_topic_signals_source_check   explicit_tag, object_kind,
                                           catalog_node_kind, catalog_mention,
                                           operator_curated
catalog_items                                        114,669 nodes, unchanged
```

**Served state, immediately after.** A species page `200`, a pest card `200`,
a registered form's old `/variety/*` address `308`, `/eppo/LYPES` `308`, an
unknown slug `404`, and the picker answers "томат" with the tomato species
first. Nothing a gardener or a crawler sees changed.

## 2026-09-08: `pg_stat_statements` installed

Not a migration — `create extension pg_stat_statements`, run by the closeout
executor to tell database-side execution time from everything around it while
the picker's P95 flipped between runs. It answered: the picker statement's mean
is 25 ms and its maximum 273 ms with zero blocks read, so the variance is CPU
on the host, not the query. The extension stays; it costs little and it is the
first thing to read the next time a number looks wrong. Nothing in the
repository depends on it.

## The 2026-09-08 application of `0066`, the index over the trigram sets

Executed the same night as `0065`, by the same executor under the same
authorization, from the PR branch before the merge.

**Why.** The picker's fuzzy arm asked pg_trgm's `%`, whose index is lossy:
every candidate is fetched and rechecked with `similarity()`, which tokenises
the name again. For `де ба` that was 118 ms for three rows, and the arm runs
exactly when the prefix arm cannot fill the list — when a gardener is
mid-word. A name can only reach similarity 0.3 if it shares at least
⌈0.3 n⌉ of the query's n trigrams, which is the rule pg_trgm's index applies;
`catalog_trigram_query` spells it out as an `intarray` `query_int` over the
stored sets, and a GIN index (`gin__int_ops`) answers it with a microsecond
recheck. Used below seven trigrams only: the query has C(n, k) terms and the
index evaluates that tree per candidate, so at ten trigrams it is slower than
`%`. Measured beforehand in a rolled-back transaction: candidate sets identical
on every query tried; `де ба` 118 → 47 ms.

**Apply** (`--mode apply --migration 0066`): 3 statements, **10,243 ms** — the
GIN build over 246,888 sets, about 15 MB, under a `SHARE` lock (writes wait,
reads do not).

**Inventory after**: `0065` applied, `0066` applied, nothing absent.

**What depends on it.** The statement on `main` after PR #338 calls
`catalog_trigram_query` for queries of up to six trigrams; without the index it
would still be correct, only slow; without the function it does not run. The
rollback (`sql/rollback/0066_ove387_picker_trigram_set_index.down.sql`) belongs
with the code that preceded it.

## The 2026-09-08 application of `0065`, the picker's stored trigram sets

Executed by the OVE-400 closeout executor under the owner's standing
authorization of 2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1),
from the PR branch before the merge, with `scripts/apply-reviewed-migration.ts`
and the pulled production environment (deleted afterwards).

**Why.** The picker computed `similarity(n.normalized_name, <query>)` for every
name its prefix scan returned, and pg_trgm answers that by tokenising the name
again on every call — about 26 µs on Cyrillic. Measured against production for
the prefix `со`: the scan returns 3,451 names in 3 ms, and the same scan
projecting `similarity()` takes 46–99 ms. The Ukrainian register lists
thousands of sunflower hybrids, so the most common crop a gardener types was the
slowest query in the product, and every prefix of `соняшник` answered `503`
under the route's 400 ms deadline.

`0065` stores each name's trigram set once, as a stored generated column
`catalog_item_names.search_trigrams int[] not null`, in the compact form
pg_trgm compares internally (`catalog_trigram_ints(show_trgm(normalized_name))`,
hash collisions included), and installs `intarray` so the count of shared
trigrams is `icount(a & b)`. The float4 the statement derives from that count is
bit for bit what pg_trgm's `CALCSML` returns: checked against every one of
production's 246,888 names for fourteen queries, zero mismatches.

**Inventory before** (`--mode inventory`): host class `digitalocean_managed`,
database `defaultdb`; `0064` applied; `0065` **missing** — absent:
`column catalog_item_names.search_trigrams`.

**Apply** (`--mode apply --migration 0065`): 4 statements, **60,610 ms**. The
stored generated column rewrites the table under an `ACCESS EXCLUSIVE` lock —
about 47 s of that time, measured beforehand in a rolled-back transaction — so
it was applied at night, once. `catalog_item_names` grew from about 40 MB of
heap to about 55 MB.

**Inventory after**: `0065` **applied**, nothing absent.

**Re-applied** once, the same night, after the equivalence proof found a defect
in `catalog_trigram_ints`: it told a hashed trigram from a printable one by its
`0x` prefix, and a name containing the word `0x` yields the printable trigram
`0x ` — three characters — which the first version mistook for a hash. No stored
name carried such a trigram, which is why the column built; a sampled register
denomination did. The dispatch is by length now. The re-application is
idempotent — the extension and the column already existed, `create or replace`
swapped the function body — and took 1,901 ms. The stored values did not
change and did not need to: for every trigram that is not a printable `0x?`,
both versions agree, and no stored row had one.

**What depends on it.** The picker statement on `main` after PR #337 reads
`search_trigrams` and calls `icount`, so the rollback
(`sql/rollback/0065_ove387_picker_trigram_sets.down.sql`) belongs with the code
that preceded it. `catalog_trigram_ints` must never change meaning while the
column exists — a generated column is not recomputed when its function is;
change it only by dropping and re-adding the column. The picker labels proof in
CI compares the stored sets with `similarity()` on every run.

## The 2026-09-07 application of `0064`, the reconciliation's missing indexes

Executed by the OVE-399 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), from the PR branch
before the merge, with `scripts/apply-reviewed-migration.ts` and the pulled
production environment (deleted afterwards). Applied **while the second EPPO
reconciliation was running**, because it is what let that job finish.

**Why.** The reconciliation deletes an assertion nothing points at, asking with
five `not exists` subqueries — one per table that can reference an assertion —
once per source record. Three of those columns had no index at all, and the two
that appear inside a composite unique index carry `assertion_id` as the *last*
key, which a probe by `assertion_id` alone cannot use. The plan production ran:

```
Seq Scan on catalog_item_identifiers  (cost=0.00..4608.16)
Seq Scan on catalog_item_names        (cost=0.00..8137.33)
Index Scan using catalog_item_facts_uidx      (cost=0.29..292.69)
Index Scan using catalog_item_relations_uidx  (cost=0.29..258.41)
Seq Scan on catalog_source_links      (cost=0.00..4433.07)
```

About 470,000 rows read to delete one row, on a one-vCPU managed database, for
every one of 258,433 EPPO source records. Measured rate before the fix:
**roughly thirty-five assertions a minute**, with the database at full load —
which is also why the public picker was answering `503` under its own 400 ms
deadline while the job ran (20 of 50 sampled queries, P95 454 ms of server
time).

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0056`, `0057` and `0063` applied, `0058` and `0062`
`no_sentinel`, `0060` and `0061` missing, `0064` missing (absent: all five
indexes).

**Apply** (`--mode apply --migration 0064`): 10 statements, 8,585 ms — five
`create index` and five `analyze`, because a fresh index is invisible to the
planner's estimates until the table is analyzed and this migration exists to
change a plan.

**After.** The same delete plans as six index scans, `cost=2.25..17.47`, and
the measured rate went to **about 4,350 assertions a minute** — the job moved
from days to minutes. Rollback drops the five indexes; nothing depends on them
for correctness, so reverting is only slow.

## The 2026-09-06 application of `0063`

Executed by the OVE-391 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), from the PR branch
before the merge, with `scripts/apply-reviewed-migration.ts` and the pulled
production environment (deleted afterwards). `0063` is the migration the task
allowed for: the outbox `kind` CHECK of `0015` admitted `password_reset`
alone, so the weekly digest had nowhere to go.

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0054`, `0055`, `0056` and `0062` applied; `0063` missing
(absent: `auth_email_outbox.payload`, `auth_email_outbox.recipient_user_id`,
index `auth_email_outbox_pending_digest_uidx`). Read-only:
`auth_email_outbox` held **no rows at all**, `verification_id` was `NOT NULL`,
and `auth_email_outbox_kind_check` read `kind = 'password_reset'`.

**Apply** (`--mode apply --migration 0063`): 17 statements, 363 ms.

**After** (read-only): `payload`, `recipient_user_id` and `verification_id`
are all nullable; `auth_email_outbox_kind_check` admits `password_reset` and
`owner_catalog_digest`; `auth_email_outbox_kind_shape_check` requires a
password reset to carry a verification and no payload, and a digest to carry a
recipient and a JSON object and no verification; the foreign key
`auth_email_outbox_recipient_fkey` cascades from `"user"`; the partial unique
index `auth_email_outbox_pending_digest_uidx` is present beside the claim,
lease, primary-key and verification indexes. The table is still empty, so the
tightening moved no row.

## The 2026-09-06 application of `0062`

Executed by the OVE-389 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), from the PR branch
before the merge, with `scripts/apply-reviewed-migration.ts` and the pulled
production environment (deleted afterwards). `0062` takes the next free number
outside the slice's reserved block (`docs/MIGRATION_ALLOCATION.md`): `0054`
added the outbox reason `catalog_card` without an entity kind for it.

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0054` and `0055` applied, `0062` not present (no sentinel
object; the migration changes constraints and a column's nullability only);
`0048` reads missing as before. `public_projection_intents.owner_user_id` was
`NOT NULL`; the entity-kind check admitted `journal_entry` alone.

**Apply** (`--mode apply --migration 0062`): 7 statements, 259 ms.

**After** (read-only): `owner_user_id` is nullable; the checks
`public_projection_intents_entity_kind_check` (`journal_entry`,
`catalog_item`), `public_projection_intents_owner_scope_check` (an owner
exactly for journal entries) and `public_projection_intents_catalog_card_shape_check`
(a card intent is `catalog_card`, `present`, never privacy-reducing) are
present beside the unchanged status, state, reason, generation and
convergence checks. The table holds 15 `journal_entry` intents `applied` and
1 `dead` (a pre-existing dead letter of the journal drain, untouched), and no
`catalog_item` intent yet: the worker writes those from the reconciliation
task on; `/api/cron/catalog-card-revalidate` drains them daily (the Hobby
plan's cron limit; ten minutes on Pro).

## The 2026-09-06 application of `0055`

Executed by the OVE-387 executor under the owner's standing authorization of
2026-09-05 (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 1), from the PR branch
before the merge, with `scripts/apply-reviewed-migration.ts` and the pulled
production environment (deleted afterwards).

**Before** (`--mode inventory`, host class `digitalocean_managed`, database
`defaultdb`): `0054` applied, `0055` missing (absent: index
`catalog_item_names_normalized_trgm_idx`); `0048` reads missing as before.
Read-only counts: 20 provisional cards (`status = 'provisional'`), 14 objects
in `user_added` pointing at them, 158 `selected`, 9 `unknown`; 992 of 61,908
names not in the shared normalizer's form, 0 would collide; 37 pending match
suggestions on provisional cards; 0 `user_provisional` alias projections;
`catalog_search_misses` empty.

**Apply** (`--mode apply --migration 0055`): 17 statements, 11,153 ms.

**After** (`--mode inventory`): `0055` applied, nothing absent. Read-only
readback: `plant_objects` 14 `free_text` (the former `user_added`, each with
its card's name as `variety_text` and `catalog_item_id` null), 158 `selected`,
9 `unknown`, 0 `user_added`; `catalog_items` 15,914 `active`, 20 `retired`
(the provisional cards, `status` kept), 0 `merged`; 0 objects point at a
retired card; 0 names differ from `catalog_normalize_name(display_name)`; the
37 match suggestions are `stale`; `catalog_recompute_search_weight()` (run by
the migration) left 16 nodes with `search_weight > 0`, `registered_ua` on
15,177 and `registered_eu` on 721 (from the register identifiers of `0054`;
`has_registered_forms` and `is_host` stay false until the register and EPPO
tasks write relations); `pg_class.reltuples` 61,908 / 15,934 after the
migration's `analyze`; index `catalog_item_names_normalized_trgm_idx` present.

Proof before the apply: `pnpm schema:catalog-labels:prove-database` (fresh
bootstrap, seed, forward, replay, rollback, forward; the fixed picker set;
search misses), the same migration on the loopback scratch database (1.3 s),
`pnpm catalog:typeahead:latency` against a production build there (P95 26.6
ms server time over 200 queries, eight-row body 1,757 B raw / 687 B gzipped)
and `tests/catalog-picker.spec.ts` in Chromium.

## The 2026-09-11 application of `0067`, content language

`0067_ove424_journal_entry_source_language.sql` (ADR-0029 D11) was applied to
production on 2026-09-11 through `scripts/apply-reviewed-migration.ts --mode
apply --migration 0067` with the pulled production environment and
`apps/web/.env.local` moved aside: one transaction, `lock_timeout` 30 s, host
class `digitalocean_managed`, database `defaultdb`, 5 statements, 178 ms. It
falls under the owner's authorization of 2026-09-11 for the whole address-law
slice (`docs/ADDRESS_LAW_EXECUTION.md`).

`--mode inventory` reports it `no_sentinel` and always will: it creates no
table, column or index. The state is read from the constraint and the column
instead.

**Before**, read-only against `digitalocean_managed` / `defaultdb`:

```
journal_entries_source_language_check:
  CHECK (source_language IS NULL OR source_language IN ('uk','bg')), validated
journal_entries: 11 rows, every one lifecycle_state = 'active'
  source_language: uk 5, bg 5, null 1
```

**The `archived` blocker is a development-only condition.** The migration is
scoped to `lifecycle_state = 'active'` because
`journal_entries_lifecycle_state_check` and
`journal_entries_deletion_retention_check` are both `NOT VALID` and the
development database still holds sixteen rows in the retired `archived` state,
which therefore refuse every `UPDATE`. Production holds none: all eleven rows
are `active`, so the clause changes nothing there. Both constraints are still
`NOT VALID` in production — that is inherited state this migration does not
touch, and it is why the column is not `NOT NULL`.

**Rehearsed first**, in the house pattern: forward, rollback, and a final
`ROLLBACK` of the enclosing transaction against production itself. The forward
run moved exactly one row and widened the constraint; the readback after the
enclosing rollback was identical to the readback before, so production was
unchanged by the rehearsal.

The stored values were also compared against the alphabet heuristic the
migration uses before applying it: all ten non-null rows agreed with it, so the
migration neither contradicted a recorded language nor needed to. Only the null
row — the owner's own entry of 2026-09-01 — was written, to `uk`.

**After**, read back immediately, read-only:

```
journal_entries_source_language_check:
  CHECK (source_language IN ('uk','bg','ru')), validated
journal_entries: 11 active, 0 with a null source_language
  source_language: uk 6, bg 5
journal_entries_lifecycle_state_check: NOT VALID (unchanged)
journal_entries_deletion_retention_check: NOT VALID (unchanged)
```

The deploy order was code first, then migration: the render path already
treated a null as the default locale, so neither half needed the other. The
value is written at publish from OVE-424 onward; the backfill is a one-off for
rows written before the column was filled.

## The rule this produced

Production migrations are applied by hand, one command per migration, with the
owner's approval. The code that depends on a migration must tolerate the old
schema until the migration lands — the media variant columns are the worked
example: `mediaVariantColumnsAvailable` probes `information_schema`, caches a
positive result, and re-checks a negative one every minute, so the deploy is
safe in either order.

After applying anything, re-run the inventory and update this page in the same
pull request as the migration or the code that needs it.
