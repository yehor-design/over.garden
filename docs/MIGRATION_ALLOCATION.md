# SQL Migration Allocation

Status: binding reservation ledger
Owner: repository canon; introduced by OVE-318
Current Stable Registry authority: ADR-0016, ADR-0020, and
`docs/STABLE_REGISTRY.md`
Current highest landed migration at creation: `0022`

This file is the single reservation authority for concurrent future programs.
A reservation prevents two tasks from choosing the same number. It does not
create a migration, authorize a schema change, or allow one issue to use
another issue's number.

| Number | Owning issue | Program                | Intended boundary                                                    |
| ------ | ------------ | ---------------------- | -------------------------------------------------------------------- |
| `0023` | OVE-254      | Stable Registry        | immutable observed capture/source snapshot                           |
| `0024` | OVE-255      | Stable Registry        | Foundation release construction and activation                       |
| `0025` | OVE-256      | Stable Registry        | public source-archive versus approved-release read model             |
| `0026` | OVE-257      | Stable Registry        | active-release product selection/readback                            |
| `0027` | OVE-328      | Stable Registry        | separately versioned extension-pack foundations                      |
| `0028` | OVE-258      | Stable Registry        | editions, corrections, supersession, and rollback                    |
| `0029` | OVE-321      | Online-only retirement | server-authoritative draft protocol                                  |
| `0030` | OVE-322      | Online-only retirement | returning-device retirement bridge and cleanup state                 |
| `0031` | OVE-331      | MVP posture            | public-projection quality/admission state when required              |
| `0032` | OVE-332      | MVP posture            | authorization/session posture state when required                    |
| `0033` | OVE-333      | MVP posture            | simplified media-ingest state when required                          |
| `0034` | OVE-334      | MVP posture            | quarantine-retirement state when required                            |
| `0035` | OVE-326      | Online-only retirement | final analytics-event constraint closure                             |
| `0036` | OVE-347      | Atomic journal         | atomic journal creation state                                        |
| `0037` | OVE-351      | Online-only retirement | external photo-identification retirement                             |
| `0038` | OVE-349      | Online-only retirement | legacy journal-media schema contraction                              |
| `0039` | OVE-353      | Journal deletion       | deletion retention timestamps, closed lifecycle enum, purge index    |
| `0040` | OVE-256      | Stable Registry        | public catalog object-kind correction over its own `0025` read model |
| `0041` | OVE-328      | Stable Registry        | extension-pack activation actually publishes its rows                |
| `0042` | OVE-354      | Source layer           | explicit raw-payload home so a captured payload has exactly one copy |
| `0043` | OVE-355      | Catalog search         | trigram extensions and expression indexes for typo-tolerant typeahead |
| `0044` | OVE-356      | Matching worker        | drain-failure heartbeat columns and the worker wake notification      |
| `0045` | maintainer   | Workspace              | recent-entries index (`perf(db)`, commit `daf87ca`); no issue owner   |
| `0046` | OVE-368      | Owner MVP reset        | index every live public page: visibility normalization, noindex drop  |
| `0047` | OVE-371      | Owner MVP reset        | media placeholder and variant long-edge columns (ADR-0022, D2)        |
| `0048` | OVE-375      | Source layer           | capture claim-ordering index so one claim stops reading the whole run |
| `0049` | OVE-377      | Slice 22 interaction   | a like becomes a permanent row owned by an account or one visitor     |
| `0050` | maintainer   | Matching worker        | heartbeat handler-set catch-up: six frozen kinds become the manifest's nine |
| `0051` | maintainer   | Matching worker        | the heartbeat handler set is checked for shape; identity moves to code      |
| `0052` | maintainer   | Job queue contract     | the four declared payload contracts that no CHECK constraint enforced       |
| `0053` | OVE-385      | Stable Registry retirement | drops the empty release tables, their functions and the three retired payload contracts (ADR-0025, D4) |
| `0054` | OVE-386      | Organism graph (ADR-0026) | graph foundation: node kinds, ranks, ancestors, identity state, names, identifiers, relations, facts, assertions, queue, actions, slug history, search misses, normalizer |
| `0055` | OVE-387      | Organism graph (ADR-0026) | provisional cards become object labels; picker ranking columns and weight recompute function |
| `0056` | OVE-390      | Organism graph (ADR-0026) | reconciliation job-kind payload CHECKs, thresholds table, apply and revert SQL functions |
| `0057` | OVE-392      | Organism graph (ADR-0026) | Catalogue of Life source usages and vernaculars |
| `0058` | OVE-394      | Organism graph (ADR-0026) | EPPO second capture endpoint classes and the country-level rights reclassification |
| `0059` | —            | **released**              | reserved for a mention statistics table; not needed. Production holds 16 journal entries and 0 mentions, so the card reads them with a `use cache` query and its tags rather than a nightly table nobody would fill. Free for the next migration that needs a number. |
| `0060` | OVE-398      | Organism graph (ADR-0026) | catalog pick events with 90-day purge |
| `0061` | OVE-399      | Organism graph (ADR-0026) | destructive closeout: legacy catalog columns and tables, gated by inventory and owner approval |
| `0062` | OVE-389      | Organism graph (ADR-0026) | card revalidation through the outbox: entity kind `catalog_item` without an owner (0054 added the reason, not the kind); taken as the next free number because the slice's block was fully reserved |
| `0063` | OVE-391      | Organism graph (ADR-0026) | the auth email outbox carries the owner's weekly catalog digest: a second kind, an optional verification key, a payload and one shape CHECK per kind |
| `0064` | OVE-399      | Organism graph (ADR-0026) | five indexes on `assertion_id`: the reconciliation's cleanup asked five `not exists` questions per source record and three of them had no index, so one delete scanned about 470,000 rows |
| `0065` | OVE-387      | Organism graph (ADR-0026) | the picker's trigram sets: `intarray`, `catalog_trigram_ints` and a stored generated `int[]` on `catalog_item_names`, so similarity is an intersection count instead of a re-tokenisation of every name on every keystroke |
| `0066` | OVE-387      | Organism graph (ADR-0026) | a GIN index over the stored trigram sets and `catalog_trigram_query`, so a short query's fuzzy candidates come with a microsecond recheck instead of pg_trgm's re-tokenising one |

Compact range receipt:

- `0023-0028: Stable Registry children`
- `0029-0030: online-only retirement children`
- `0031-0034: MVP posture children`
- `0035: online-only steady-state enforcement`
- `0036-0038: atomic-journal and online-only retirement landings`
- `0039: journal deletion-retention lifecycle`
- `0040: Stable Registry public-read correction`
- `0041: Stable Registry extension-pack activation correction`
- `0042: source-layer raw-payload home`
- `0043: catalog trigram typeahead indexes`
- `0044: matching worker idle contract`
- `0049: owned engagement likes`
- `0050: matching worker heartbeat handler set`
- `0051: matching worker heartbeat handler shape`
- `0052: job queue declared payload checks`
- `0053: stable registry release tables retired`
- `0054-0061: organism knowledge graph, ADR-0026, SDD Slice 24 (0059 released unused, 0061 destructive)`
- `0064: the reconciliation's assertion-reference indexes, found by running it in production`
- `0065: the picker's stored trigram sets, found by asking which query answers 503`
- `0066: the index over those sets for the fuzzy arm's short queries`
- `0062: organism card revalidation intents (Slice 24 task 24.04, outside the reserved block)`
- `0063: the owner's weekly catalog digest in the auth email outbox (Slice 24 task 24.06, outside the reserved block)`

Rows `0036`-`0038` are reconciled after the fact under rule 4: those migrations
landed before the ledger recorded them, and renaming a landed file to restore
the appearance of a prior reservation is forbidden by rule 5.

Row `0049` is the only migration in the ledger that deletes rows. It does so
under the owner's explicit `AGENTS.md` rule 10 sign-off of 2026-09-04, because
the column it replaces — `anonymous_device_hash` — is derived from a token
scoped to one target and cannot be converted into either new owner column. Its
rollback restores the columns and states plainly that it cannot restore rows.

Rows `0050`, `0051` and `0052` have no issue owner, like `0045`. None is a
feature.

Row `0053` is the second migration in the ledger that destroys schema, and
the first that drops tables: every `catalog_registry_*` table,
`stable_registry_product_*`, `stable_registry_public_catalog_*`,
`catalog_item_revisions`, their functions and triggers, and the three payload
CHECK constraints of the retired kinds (ADR-0025, D4). It is applied to
production only after a read-only inventory shows every table it drops empty
and the owner has approved it in writing. Its rollback recreates every object
from the verbatim text of the migrations that first created them, and states
that it cannot restore rows. The retained EPPO tables of ADR-0025 D2 are absent
from it by construction; `pnpm schema:retirement:prove-database` asserts that.

`0050` was a catch-up: `matching_worker_heartbeats_supported_handlers_check`
still pinned `supported_handlers` to the six kinds the queue manifest had in
`0001`, while the manifest and the worker had moved to nine. `0051` supersedes
it hours later and is the correct fix: an exact array made a mismatched handler
set unrecordable, so the worker carrying one read as dead instead of as
`capability_mismatch`, and the image and the schema had to be migrated together
in both directions. Applying `0051` alone is enough; `0050` need not be applied
to a database that never had it.

`0052` adds the four payload CHECK constraints that four kinds declared and no
migration ever created.

Rows `0040` and `0041` are second allocations to owners that already hold `0025`
and `0027`. Rule 2 permits them: each number is used by its own owner, for that
owner's own contract, and each correction is additive over the read model that
owner created. They are new reservations at the next free numbers rather than a
reuse or rename of `0025` or `0027`, which rule 5 forbids.

## Explicit no-SQL Stable Registry owners

ADR-0020 amends only the future migration-allocation clauses of historical
ADR-0016. OVE-327 and OVE-259 have no SQL migration: they must not consume,
rename, transfer, or imply a migration number.

| Owning issue | SQL migration allocation | Intended boundary                                           |
| ------------ | ------------------------ | ----------------------------------------------------------- |
| OVE-327      | No SQL migration         | pure artifact-adapter packs and their safe runtime boundary |
| OVE-259      | No SQL migration         | production plan/apply, parity, and final program proof      |

The unused OVE-322 reservation at `0030` remains historical and
non-transferable. OVE-326 uses the next free number, `0035`; it does not inherit
or repurpose `0030`.

## SDD Slice 27 — the address law (ADR-0029)

Reserved 2026-09-11, in the order the phases apply. `0066` was the highest
number in `apps/web/sql` when these were taken.

| Migration | Owner | What it does |
| --- | --- | --- |
| `0067` | `OVE-424` | `journal_entries.source_language` widened to uk/bg/ru and backfilled on `active` rows; **not** `NOT NULL` — applied to production 2026-09-11 |
| `0068` | `OVE-425` | the generated `CHECK` on `journal_entries.public_slug` — the only slug column that has never had one; the block is `contracts/address/address-slug-checks.generated.sql` verbatim — applied to production 2026-09-11 |
| `0069` | `OVE-426` | widens the `journal_topics.slug` CHECK to the manifest's native-script `topic` shape; the block is `contracts/address/address-slug-checks.generated.sql` verbatim — applied to production 2026-09-11 |
| `0070` | `OVE-428` | `journal_entry_slug_history` and `plant_object_slug_history` with their sync triggers, modelled on `catalog_item_slug_history`, plus `plant_objects.public_slug` and its generated `CHECK` — applied to production 2026-09-12 |
| `0071` | `OVE-429` | the generated `CHECK` on `catalog_items.public_slug`, which the re-slug makes possible; the addresses themselves move in `pnpm address:catalog:reslug` — applied to production 2026-09-12 |
| `0072` | `OVE-431` | the partial index the catalog's front door walks — applied to production 2026-09-12 |
| `0073` | `OVE-436` | the entry name becomes the author's (`journal_entries` unique per `(owner_user_id, public_slug)`), engagement refs for `journal_entry` targets move from the slug to the entry id, and the five system topics get their Ukrainian labels |
| `0074` | `OVE-435` | the reconciliation ladder's rung from a gardener label to a taxon: `catalog_reconcile_thresholds` admits and seeds `label_scientific_name` and `label_scientific_synonym` |

| `0075` | `OVE-451` | the indexes the catalogue's one door walks (SDD Slice 28, not this slice); recorded here after the fact under rule 4, because it landed on 2026-09-17 without a row and the next reservation needs a true high-water mark |
| `0076` | `OVE-464` | `journal_entries.author_entry_number` with its generated range `CHECK`, its per-owner unique index, `journal_entry_number_counters`, `assign_journal_entry_number(uuid)` and the `before insert` trigger that calls it, and the backfill of `active` rows by publish date (ADR-0029 D9, amendment of 2026-09-18) — applied to production 2026-09-19, **before** the release that reads the column |
| `0077` | `OVE-465` | `journal_topic_slug_history` with its sync trigger and seed, and the generated Latin `CHECK` on `plant_objects.public_slug` and `journal_topics.slug`, each guarded on the absence of native-script rows so that it arrives on the replay after `pnpm address:names:romanize` (ADR-0029 D4, amendment of 2026-09-18). Applied to production 2026-09-19, **after** the release that issues Latin names, not before: narrowing the topic column first would have refused a Cyrillic tag from the release still live. `pnpm address:names:romanize --apply` followed and moved four passports |
| `0078` | `OVE-459` (follow-up) | `source_unmatched` as its own item type, the 13,456 open rows moved onto it, the `CHECK` that an **open** `source_link` is appliable (a subject, a source slug and a snapshot), and the partial index the sources page counts unplaced records by. Not part of the `OVE-459` contract, which put the reconciliation ladder out of scope: found while proving it, that production's queue refused every row it held, and authorised by the owner on 2026-09-20. Applied to production 2026-09-21 |

| `0079` | `OVE-476` | Account-scoped, versioned publication disclosure receipts, backfilled from surviving historical entry receipts without changing their versions; cascade on account erasure. Apply before deploying the version-aware publication reader. |

| `0080` | `OVE-512` | `drop table wishlist_items` — the wishlist is retired (ADR-0033, owner decision 2026-09-25). Destructive, with the owner's explicit sign-off; apply **after** the release that no longer reads the table. |

| `0081` | `OVE-530` | The standard species base: `catalog_standard_species` (membership, group, version) and `catalog_standard_species_names` (which name rows the base wrote or promoted, and what they were). Additive; the data is written by `scripts/load-standard-species.ts`. |
| `0082` | `OVE-523` | A photo belongs to exactly one of a journal entry, a space or a plant or animal: `media_assets.space_id` and `plant_object_id`, `journal_entry_id` nullable, a one-owner CHECK and one live photo per space and per object. Additive; apply before deploying the space stepper. `0038`'s `not null` is guarded for replays. |
| `0083` | `OVE-526` | One acceptance of the terms, the privacy policy and the cookie rules: `legal_acceptances` (account, accepted version, where it was given, when), cascading on account erasure. Additive; the release before it never reads it, so it may be applied before the deploy. |

`OVE-419` through `OVE-423`, `OVE-427` and `OVE-430` through `OVE-434` need no
SQL and therefore hold no allocation; under rule 3 none of them may inherit a
number from this block. The same holds for `OVE-463` and `OVE-466` of phase 5. `OVE-432` grows `JournalDocumentV1` additively at schema
version 1 with no migration, the pattern ADR-0028 established.

## Rules

1. The owning issue must re-read this file and the actual `apps/web/sql`
   inventory before creating its migration.
2. A number may be used only by its owner and only when that issue's validated
   vertical/bounded contract actually requires SQL.
3. An owner that needs no SQL has no migration allocation; it does not hand a
   number to another task implicitly. OVE-327 and OVE-259 are the explicit
   Stable Registry no-SQL owners under ADR-0020.
4. Any landed migration that conflicts with this ledger stops implementation.
   Reconcile the ledger in a dedicated canon change before renumbering a child.
5. Existing migration files and historical receipts are never renamed to make
   the reservation appear consistent.
6. The Stable Registry and online-only canon checkers both read this ledger;
   the MVP-posture checker does the same after OVE-329.

OVE-318 creates only these reservations. It creates no SQL migration and makes
no database or production change.
