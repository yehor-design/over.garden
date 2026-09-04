-- Rollback of 0052: drops the four payload CHECK constraints it added.
--
-- Dropping them returns those kinds to being declared but unenforced in
-- Postgres, which is the state that let `stable_registry_edition_build`,
-- `catalog_typeahead_reindex`, `erasure_media_object_delete`, and
-- `media_derivative_revoke` claim database enforcement they never had. The
-- worker's preflight will then report `schema_mismatch`, because
-- `REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS` is generated from the same manifest
-- — so roll back the matching image alongside this, or the release refuses to
-- activate.
--
-- Constraint removal only: no table, column, index, or row is touched.

alter table job_queue
  drop constraint if exists job_queue_stable_registry_edition_build_payload_check;

alter table job_queue
  drop constraint if exists job_queue_catalog_typeahead_payload_check;

alter table job_queue
  drop constraint if exists job_queue_erasure_media_object_delete_payload_check;

alter table job_queue
  drop constraint if exists job_queue_media_derivative_revoke_payload_check;
