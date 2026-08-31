# Source payload single home

Status: executable runbook
Owner: OVE-354
Migration: `0042_ove354_source_payload_single_home.sql`
Scope: EPPO observed-capture source records only. No other source family, no
product read path, no production data.

## Why this exists

`buildMaterializeEppoSourceRecordsQuery` wrote `catalog_source_records.raw_payload`
as `jsonb_object_agg` over `catalog_source_capture_units.raw_payload`, and derived
`raw_payload_sha256` from that same aggregate. Both copies were byte-derivable
from one another, and the unit copy is already guaranteed present by
`catalog_source_capture_units_terminal_shape_check` and frozen by
`catalog_source_capture_units_immutable_terminal`.

The second copy was mandatory only because `raw_payload` was `not null` — the
column had no way to say the bytes live one join away. Measured on 2026-08-31, a
local database held 266 MB of `catalog_source_records` across 17,393 rows: 16,062
bytes per row, 72 percent of the whole database, at roughly one eighth of the
declared 129,188-record corpus. No reader consumes the aggregated body. Only its
digest is read.

## The contract

`catalog_source_records.raw_payload_home` is a closed value:

| Home | Meaning | Payload column |
| -- | -- | -- |
| `inline` | This row holds the only copy. | `not null` |
| `capture_units` | The copy lives in this record's capture units. | `null` |

`catalog_source_records_payload_home_check` enforces the agreement in both
directions, so a row can never claim a home that disagrees with what it actually
holds. `inline` is the default, which is why every non-EPPO source family — none
of which has capture units — is untouched by this whole mechanism.

`raw_payload_sha256` never changes. It is the record's identity, and every step
here is checked against it rather than recomputing it.

## The one rule

**A copy may be dropped only after the surviving copy has reproduced the digest,
in the same statement that drops it.**

`buildDeduplicateEppoSourceRecordPayloadsQuery` does the comparison and the write
together. A record whose units are missing, incomplete, or no longer reproduce
its digest simply does not appear in the CTE: it keeps its payload and is
reported as `held`. There is no path that empties a row on the strength of a
digest that was true a moment earlier.

## Running it

```bash
cd apps/web
pnpm exec tsx scripts/prove-source-payload-single-home.ts --mode plan --batch-size 500 --database
```

Modes are `plan`, `apply`, `verify`, and `rollback`. `--batch-size` is a closed
range of 1 to 1000; anything else is refused before a connection is opened.

Two entry points, for two different questions:

- `--inject-capture-unit-timeout` is hermetic and needs no database. It proves
  WAIT-01: a capture-unit read that never returns leaves every unprocessed
  record inline, reports `inconclusive`, and keeps **Abort backfill** and
  **Dedup status** answering.
- `--database` creates its own disposable database, applies migrations `0001`,
  `0023`, and `0042`, seeds the historical inline shape, runs the whole
  lifecycle, and drops the database. It never writes to the database whose
  connection string it borrows.

The `--database` run needs a loopback `.env.local`
(`assertLoopbackLocalRuntimeEnvironment`), the same gate `pnpm local:bootstrap`
uses.

## What the proof actually checks

| Claim | How |
| -- | -- |
| The units reproduce the record's digest | Compared before anything is dropped |
| Digests never change | Every row compared against its seeded value |
| The table really shrinks | `vacuum full` then `pg_total_relation_size`, before and after |
| Irreproducible records are held | Wrong digest, incomplete endpoint set, and no units at all |
| Replay does nothing | A second pass moves zero rows |
| Two runs never collide | Concurrent `for update skip locked` claims, zero overlap |
| An aborted batch leaves no trace | Rolled-back transaction, counts unchanged |
| The database refuses a disagreeing row | Both directions, plus an unknown home |
| Rollback restores the exact bytes | Restored payload re-digested against the stored value |

The synthetic payloads carry accented Latin and Cyrillic name evidence on
purpose. An ASCII-only fixture cannot detect a change to the digest's text
encoding, and that change would silently invalidate every comparison.

## Rollback

```bash
cd apps/web
pnpm exec tsx scripts/prove-source-payload-single-home.ts --mode rollback --batch-size 500 --database
```

`buildRestoreEppoSourceRecordPayloadsQuery` re-materializes `raw_payload` from
the capture units using the same aggregate expression that produced the digest,
and returns the record to `inline`.

Nothing is ever deleted, so a rollback is a rebuild rather than a data recovery.
Migration `0042` itself reverses by dropping the check, the index, and the
column, and restoring the `not null` — but only once every row is back at
`inline`, which the check will otherwise refuse.

## Boundaries

- Production application is **not** authorized here. It belongs to OVE-259 under
  its own approved plan digest.
- Payloads stay in Postgres. Moving them to object storage is a separate slice,
  to be scoped only after this one measures what remains.
- `allowed_projection`, `source_only_fields`, and `projection_status` are
  untouched.
- Raw payloads may legally carry occurrence coordinates. They stay inside the
  source tables: receipts carry classes, counts, digests, and durations, and
  never a payload body, coordinate, EPPO code, record or snapshot identifier,
  connection string, or credential.
