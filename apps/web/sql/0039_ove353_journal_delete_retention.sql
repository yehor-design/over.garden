-- OVE-353 — journal deletion becomes a seven-day retention-only lifecycle.
--
-- This is the expand half only. It adds the retention timestamps, closes the
-- product lifecycle enum to `active | deleted_retention`, and indexes the purge
-- horizon. It deliberately converts no rows: pre-existing `archived` rows stay
-- readable until the separately authorized classification/apply operation runs,
-- which is why both new constraints are NOT VALID.
--
-- NOT VALID here is doing real work, not deferring it. PostgreSQL still
-- enforces both constraints on every insert and every update, so no runtime
-- writer can produce `archived` again or leave a deleted row without its
-- retention horizon; only the historic rows already on disk are exempt until
-- they are converted and the constraints are validated.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table journal_entries
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz;

-- 0001 recreates the legacy `active | archived` check whenever it is absent,
-- and bootstrap replays 0001 before this file, so the drop must run every time
-- rather than only on first application.
alter table journal_entries
  drop constraint if exists journal_entries_lifecycle_state_check;

alter table journal_entries
  add constraint journal_entries_lifecycle_state_check
  check (lifecycle_state in ('active', 'deleted_retention'))
  not valid;

-- INV-04: the retention horizon is exactly seven days of PostgreSQL time. The
-- equality is enforced here so no caller can compute its own horizon in
-- application time and drift across a daylight-saving boundary.
alter table journal_entries
  drop constraint if exists journal_entries_deletion_retention_check;

alter table journal_entries
  add constraint journal_entries_deletion_retention_check
  check (
    (
      lifecycle_state = 'active'
      and deleted_at is null
      and purge_after is null
    )
    or (
      lifecycle_state = 'deleted_retention'
      and deleted_at is not null
      and purge_after is not null
      and purge_after = deleted_at + interval '7 days'
    )
  )
  not valid;

-- The retention worker claims due tombstones by horizon only; the partial
-- predicate keeps the index to the deletion-pending rows it actually scans.
create index if not exists journal_entries_due_purge_idx
  on journal_entries (purge_after)
  where lifecycle_state = 'deleted_retention';

commit;
