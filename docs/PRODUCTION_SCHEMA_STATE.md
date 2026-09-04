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

## Landed on main, not applied to production

| Migration | Why it is not applied                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0051`    | The heartbeat handler-set **shape** check, superseding `0050`. `matching_worker_heartbeats_supported_handlers_check` pins `supported_handlers` to an exact array — six kinds since `0001`, nine after `0050` — which makes the one state worth seeing unrecordable: a worker whose handler set differs from the manifest cannot write a heartbeat at all, so it reads as dead rather than as `capability_mismatch`, and the image and the schema have to be migrated together in both directions. `0051` replaces it with a shape check (one to sixty-four lowercase snake_case names) and leaves identity to `app.runtime`, the web classification, and the release script. Constraint replacement only. |
| `0052`    | The four payload CHECK constraints that `stable_registry_edition_build`, `catalog_typeahead_reindex`, `erasure_media_object_delete` and `media_derivative_revoke` declared and no migration ever created. Each is added `not valid` and validated in the same transaction, so no full-table lock is taken and a legacy row rolls the whole thing back rather than half-applying. **Apply this before deploying a matching image built after 2026-09-04**: `REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS` is generated from the manifest, so the worker's preflight reports `schema_mismatch` against a database missing one and the release refuses to activate. |
| `0050`    | Superseded by `0051` before either was applied anywhere but CI. Applying it is harmless and unnecessary; `0051` is self-sufficient. |
| `0048`    | The capture claim-ordering index. It only matters where an observed capture runs, and OVE-254 refuses production capture, so production has the table and no rows to claim. Additive and reversible — one partial index, no column, constraint, or row — so it can be applied whenever the owner wants production converged with `sql/`. |

Applied on the loopback database on 2026-09-03 through
`scripts/apply-reviewed-migration.ts` and verified by `pg_indexes`. Whoever
applies it to production updates the inventory above in the same pull request.

`0051` and `0052` were executed against Postgres 18.4 on a disposable database
on 2026-09-04, not merely reviewed. `pnpm queue:contract:prove-database` is that
proof, and it runs in CI: eighteen cases covering every accept and every refuse,
including the two defects execution found in the first draft of `0051` — a
shape check over `array_to_string(handlers, ',')` accepted the single element
`'journal_entry_index,journal_entry_unindex'`, because after joining, one
element containing a separator is indistinguishable from two, and it also
accepted a NULL element, which `array_to_string` silently drops.

Neither is applied to production yet. The commands, in order:

```bash
cd apps/web
vercel env pull /tmp/production.env --environment=production
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode apply --migration 0051 --env-file /tmp/production.env
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode apply --migration 0052 --env-file /tmp/production.env
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file /tmp/production.env
```

`0052` must land before the next matching image is deployed, for the reason in
its row above. `0051` may land at any time and removes a coupling rather than
adding one. Whoever applies them updates the inventory above in the same pull
request.

## The rule this produced

Production migrations are applied by hand, one command per migration, with the
owner's approval. The code that depends on a migration must tolerate the old
schema until the migration lands — the media variant columns are the worked
example: `mediaVariantColumnsAvailable` probes `information_schema`, caches a
positive result, and re-checks a negative one every minute, so the deploy is
safe in either order.

After applying anything, re-run the inventory and update this page in the same
pull request as the migration or the code that needs it.
