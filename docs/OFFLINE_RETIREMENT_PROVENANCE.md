# Offline Retirement Analytics Provenance

Status: immutable historical provenance captured before OVE-326 enforcement
Issue: OVE-326
Captured at: 2026-08-21T05:31:42.563Z
Source environment: production
Source baseline: `fd9cb5cba975f227d46254e14e21f8e38bdabbfb`

This receipt preserves the only content-free aggregate needed before the
online-only analytics constraint is narrowed. It is history, not an active
product contract and not an analytics event catalogue. OVE-326 must not edit or
delete the historical rows represented by this receipt.

## Read-only aggregate

The query ran through the Vercel production environment against the registered
DigitalOcean Managed PostgreSQL production host in a `READ ONLY` transaction.
It selected only aggregate counts and database-side hashes. It did not return an
event row, user or session identifier, journal content, analytics properties,
request metadata, precise location, secret, or connection value.

| UTC month | `offline_entry_queued` | `offline_entry_synced` |
| --------- | ---------------------: | ---------------------: |
| No rows   |                      0 |                      0 |

Aggregate receipt:

- retired row count: `0`
- ordered database-side row hash: `d41d8cd98f00b204e9800998ecf8427e`
- row-hash construction: `md5(string_agg(md5(to_jsonb(row)), order by id))`,
  with `md5('')` for the empty set
- current constraint validated: `true`
- current constraint-definition hash:
  `726c61d07b57dada85d341565034f506`
- evidence class: `aggregate_counts_and_database_side_hashes_only`

The ordered row hash is a deterministic preservation witness, not a security
primitive. After migration `0035_online_only_retirement.sql`, the retired row
count and ordered row hash must remain exactly unchanged while a new insert for
either retired name is rejected.

## Measurement caveat

The historical counters understate offline intent. The former
`normalizeSyncStatus` boundary coerced the request status `offline_queued` to
`online` before analytics emission. Therefore a zero count means that no rows
were persisted under the two retired event names; it does not prove that no
gardener ever encountered an offline condition. These names are excluded from
all current and future MVP learning decisions.

## Ordering and retention

This document is committed before migration `0035` exists or is applied. The
later migration may replace only `analytics_events_event_name_check` for new
inserts by using `NOT VALID`; it must perform no `UPDATE`, `DELETE`, backfill, or
validation scan over the historical rows. This receipt, immutable migration
history, accepted ADRs, and completed task receipts remain non-operative
provenance.
