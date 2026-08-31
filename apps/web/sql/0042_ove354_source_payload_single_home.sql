-- OVE-354 — raw EPPO source payloads have exactly one home.
--
-- `buildMaterializeEppoSourceRecordsQuery` writes `catalog_source_records.raw_payload`
-- as `jsonb_object_agg` over `catalog_source_capture_units.raw_payload`, and derives
-- `raw_payload_sha256` from that same aggregate. Both copies are byte-derivable from
-- one another, and `catalog_source_capture_units_terminal_shape_check` already
-- guarantees the unit copy is present and digest-covered for every terminal unit.
-- The unit rows are immutable once terminal, so the surviving copy cannot drift.
--
-- The second copy was mandatory only because `raw_payload` was `not null`: the
-- column could not express that the bytes live one join away.
--
-- Measured on 2026-09-01 against the database that actually holds the observed
-- capture (129,214 source records, 387,773 terminal capture units): the records'
-- `raw_payload` is 98 MB of live compressed bytes and the units' is 118 MB. The
-- deduplication removes the 98 MB — the copy reproducible from the units.
--
-- An earlier version of this comment claimed "266 MB across 17,393 rows, 16,062
-- bytes per row, 72 percent of the whole database". That was measured on the
-- developer database, which holds no observed capture at all, and it divided
-- relation size by row count: 172 MB of that 267 MB was TOAST free space a single
-- `vacuum full` reclaimed. See docs/SOURCE_PAYLOAD_SINGLE_HOME.md.
--
-- No reader consumes the aggregated body; only its digest is read.
--
-- This migration does not drop a single byte. It adds an explicit home so a row
-- can say where its payload lives, and it re-tightens the nullability it relaxes
-- with a check that binds the declared home to the payload's actual presence.
-- Dropping the reproducible copy is the backfill's job, one digest comparison at
-- a time, and `inline` remains the default so every non-EPPO source family —
-- which has no capture unit and therefore only one copy already — is untouched.

alter table catalog_source_records
  add column if not exists raw_payload_home text not null default 'inline';

alter table catalog_source_records
  drop constraint if exists catalog_source_records_payload_home_value_check;

alter table catalog_source_records
  add constraint catalog_source_records_payload_home_value_check
  check (raw_payload_home in ('inline', 'capture_units'));

alter table catalog_source_records
  alter column raw_payload drop not null;

alter table catalog_source_records
  drop constraint if exists catalog_source_records_payload_home_check;

alter table catalog_source_records
  add constraint catalog_source_records_payload_home_check
  check (
    (raw_payload_home = 'inline' and raw_payload is not null)
    or (raw_payload_home = 'capture_units' and raw_payload is null)
  );

-- Bounds batch selection: the predicate shrinks as records are deduplicated, so
-- a resumed run never rescans what it already moved.
create index if not exists catalog_source_records_inline_payload_idx
  on catalog_source_records (source_snapshot_id)
  where raw_payload_home = 'inline';
