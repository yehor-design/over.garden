# Production schema state

Status: living record of what is applied in the production database.
Owner: whoever applies a migration updates this page in the same pull request.
Last inventory: 2026-09-03.

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

| Status | Meaning |
| -- | -- |
| `applied` | every object the migration creates is present |
| `no_sentinel` | the migration has no probe-able object (a drop, a data fix, a constraint change); its effect is not machine-verifiable |
| `partial` | some objects present, some absent — normal when a later migration retired part of an earlier one |
| `missing` | none of its objects exist |

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

## The rule this produced

Production migrations are applied by hand, one command per migration, with the
owner's approval. The code that depends on a migration must tolerate the old
schema until the migration lands — the media variant columns are the worked
example: `mediaVariantColumnsAvailable` probes `information_schema`, caches a
positive result, and re-checks a negative one every minute, so the deploy is
safe in either order.

After applying anything, re-run the inventory and update this page in the same
pull request as the migration or the code that needs it.
