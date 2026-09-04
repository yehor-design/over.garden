-- The matching worker's handler set is nine kinds; the constraint still said six.
--
-- `matching_worker_heartbeats_supported_handlers_check` was written in `0001`
-- and re-added in `0012` while the queue manifest had six kinds, and it pins
-- the column to exactly those six values. The manifest has since grown three
-- Stable Registry build kinds — `stable_registry_foundation_build` (OVE-255),
-- `stable_registry_extension_pack_build` (OVE-328), and
-- `stable_registry_edition_build` (OVE-258) — and `record_worker_heartbeat`
-- writes `sorted(SUPPORTED_JOB_KINDS)`, all nine of them, on every beat.
--
-- Production has not seen this yet only because it still runs a worker image
-- built before those kinds existed. The first heartbeat from a current image
-- would be refused with `23514`, the heartbeat row would stop advancing, and
-- since OVE-357 retired the matching API that row is the only liveness signal
-- there is — so a healthy worker would read as missing or stale and invite a
-- rollback of a deployment that was correct.
--
-- Apply this before deploying a matching image built after 2026-08-27.
--
-- Constraint replacement only: no table, column, index, or row is touched.

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
      'journal_entry_unindex',
      'stable_registry_edition_build',
      'stable_registry_extension_pack_build',
      'stable_registry_foundation_build'
    ]::text[]
  );
