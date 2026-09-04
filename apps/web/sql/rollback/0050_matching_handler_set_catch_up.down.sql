-- Rollback of 0050: restores the six-handler constraint.
--
-- Roll the worker image back first. Verified against Postgres 18.4 on
-- 2026-09-04: while a heartbeat row written by a nine-handler worker is still
-- present, `add constraint` refuses with
--
--   ERROR: check constraint "matching_worker_heartbeats_supported_handlers_check"
--          of relation "matching_worker_heartbeats" is violated by some row
--
-- and the transaction aborts having changed nothing, which is the right answer:
-- the constraint would otherwise outlaw the running worker's next beat. The row
-- is liveness only and the worker rewrites it within one interval, so an
-- operator who has already stopped the new image may clear it with
-- `delete from matching_worker_heartbeats where queue_name = 'matching';`
-- before running this file.
--
-- Constraint replacement only: no table, column, index, or row is touched by
-- this file.

alter table matching_worker_heartbeats
  drop constraint if exists matching_worker_heartbeats_supported_handlers_check;

alter table matching_worker_heartbeats
  add constraint matching_worker_heartbeats_supported_handlers_check
  check (
    supported_handlers = array[
      'catalog_alias_suggestions_refresh',
      'catalog_fuzzy_duplicate_qa_refresh',
      'catalog_match_suggestions_refresh',
      'catalog_typeahead_reindex',
      'journal_entry_index',
      'journal_entry_unindex'
    ]::text[]
  );
