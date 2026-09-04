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
