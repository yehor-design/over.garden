# Production schema state

Status: living record of what is applied in the production database.
Owner: whoever applies a migration updates this page in the same pull request.
Last inventory: 2026-09-05. Divergences noted 2026-09-04 and 2026-09-05.

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

## The rule this produced

Production migrations are applied by hand, one command per migration, with the
owner's approval. The code that depends on a migration must tolerate the old
schema until the migration lands — the media variant columns are the worked
example: `mediaVariantColumnsAvailable` probes `information_schema`, caches a
positive result, and re-checks a negative one every minute, so the deploy is
safe in either order.

After applying anything, re-run the inventory and update this page in the same
pull request as the migration or the code that needs it.
