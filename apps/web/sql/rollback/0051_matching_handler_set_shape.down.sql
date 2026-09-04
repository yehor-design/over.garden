-- Rollback of 0051: restores the exact-array handler constraint of 0050.
--
-- Only do this to reproduce the old behaviour deliberately. It reinstates the
-- coupling 0051 removed: the constraint then has to be migrated in step with
-- every matching image, in both directions, and a worker whose handler set
-- differs from this array cannot record a heartbeat at all — so a running
-- worker reads as missing rather than as `capability_mismatch`.
--
-- It also refuses to apply while a row that violates it is present, aborting
-- with nothing changed. Clear the liveness row first if that is intended:
-- `delete from matching_worker_heartbeats where queue_name = 'matching';` —
-- the worker rewrites it within one heartbeat interval.
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
      'journal_entry_unindex',
      'stable_registry_edition_build',
      'stable_registry_extension_pack_build',
      'stable_registry_foundation_build'
    ]::text[]
  );
