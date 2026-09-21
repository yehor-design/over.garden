-- Rollback of `0078`.
--
-- The constraint and the index go. The rows do **not** go back to
-- `source_link`: `0078` did not lose anything, and putting 13,450 questions
-- that cannot be answered back in front of the owner is not a rollback, it is
-- the defect. If the item type itself has to go, the rows must be given a
-- destination first — that is a decision, not a down-migration.

alter table catalog_curation_queue
  drop constraint if exists catalog_curation_queue_open_source_link_appliable;

drop index if exists catalog_curation_queue_unmatched_source_idx;
