-- Four kinds declared a payload contract that nothing in Postgres enforced.
--
-- `apps/web/src/server/job-queue-manifest.ts` says a kind's payload contract is
-- restated by "the TypeScript producer, the Postgres CHECK constraints, and the
-- Python worker". For eight kinds that was true. For these four the constraint
-- was simply never written, and nothing noticed because no check compared the
-- declared contract with the constraints that exist:
--
--   * stable_registry_edition_build  (landed with OVE-258, no constraint)
--   * catalog_typeahead_reindex      (declared in OVE-225, no constraint)
--   * erasure_media_object_delete    (web-owned outbox, no constraint)
--   * media_derivative_revoke        (web-owned outbox, no constraint)
--
-- Each entry now names its constraint in the manifest, `queue:contract:check`
-- fails when a named constraint appears in no migration, and the worker's
-- preflight reports `schema_mismatch` against a database missing one. This file
-- is what makes those three checks pass truthfully.
--
-- Each constraint is added NOT VALID and then validated in the same
-- transaction: NOT VALID takes no full-table lock while the row set is scanned,
-- and VALIDATE takes only SHARE UPDATE EXCLUSIVE, so enqueueing is never
-- blocked. If VALIDATE fails, the whole transaction rolls back having changed
-- nothing and a legacy row is the reason. Find it with:
--
--   select id, queue_name, payload
--   from job_queue
--   where payload->>'kind' = '<kind>';
--
-- Constraint additions only: no table, column, index, or row is touched.

alter table job_queue
  drop constraint if exists job_queue_stable_registry_edition_build_payload_check;

alter table job_queue
  add constraint job_queue_stable_registry_edition_build_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'stable_registry_edition_build'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'releaseId']::text[]
      and payload - array['kind', 'releaseId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'releaseId') = 'string'
      and payload->>'kind' = 'stable_registry_edition_build'
      and payload->>'releaseId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_stable_registry_edition_build_payload_check;

alter table job_queue
  drop constraint if exists job_queue_catalog_typeahead_payload_check;

alter table job_queue
  add constraint job_queue_catalog_typeahead_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_typeahead_reindex'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload - array['kind']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'catalog_typeahead_reindex'
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_catalog_typeahead_payload_check;

alter table job_queue
  drop constraint if exists job_queue_erasure_media_object_delete_payload_check;

-- `requestId` is not a UUID in this contract, so it is checked as a bounded
-- string and nothing more. Inventing a stricter pattern here than the manifest
-- declares would put the two layers back out of step in the other direction.
alter table job_queue
  add constraint job_queue_erasure_media_object_delete_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'erasure_media_object_delete'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'requestId', 'bucket', 'objectKey']::text[]
      and payload - array['kind', 'requestId', 'bucket', 'objectKey']::text[]
        = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'requestId') = 'string'
      and jsonb_typeof(payload->'bucket') = 'string'
      and jsonb_typeof(payload->'objectKey') = 'string'
      and payload->>'kind' = 'erasure_media_object_delete'
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_erasure_media_object_delete_payload_check;

alter table job_queue
  drop constraint if exists job_queue_media_derivative_revoke_payload_check;

-- The only declared contract with an optional key: `journalEntryId` may be
-- absent, and must be a UUID when present.
alter table job_queue
  add constraint job_queue_media_derivative_revoke_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'media_derivative_revoke'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array[
        'kind', 'mediaAssetId', 'bucket', 'objectKey', 'reason'
      ]::text[]
      and payload - array[
        'kind', 'mediaAssetId', 'bucket', 'objectKey', 'reason', 'journalEntryId'
      ]::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'mediaAssetId') = 'string'
      and jsonb_typeof(payload->'bucket') = 'string'
      and jsonb_typeof(payload->'objectKey') = 'string'
      and jsonb_typeof(payload->'reason') = 'string'
      and payload->>'kind' = 'media_derivative_revoke'
      and payload->>'mediaAssetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (
        not payload ? 'journalEntryId'
        or (
          jsonb_typeof(payload->'journalEntryId') = 'string'
          and payload->>'journalEntryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_media_derivative_revoke_payload_check;
