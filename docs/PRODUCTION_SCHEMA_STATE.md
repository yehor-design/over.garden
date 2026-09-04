# Production schema state

Status: living record of what is applied in the production database.
Owner: whoever applies a migration updates this page in the same pull request.
Last inventory: 2026-09-03. Divergence noted 2026-09-04.

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

## The rule this produced

Production migrations are applied by hand, one command per migration, with the
owner's approval. The code that depends on a migration must tolerate the old
schema until the migration lands — the media variant columns are the worked
example: `mediaVariantColumnsAvailable` probes `information_schema`, caches a
positive result, and re-checks a negative one every minute, so the deploy is
safe in either order.

After applying anything, re-run the inventory and update this page in the same
pull request as the migration or the code that needs it.
