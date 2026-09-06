-- Rollback of 0056 (OVE-390). The reconciliation functions, the thresholds
-- and the four new payload contracts go; the three retired kinds get their
-- 0001 contracts back. Curation rows written through the functions stay:
-- they are history, and 0054 owns the tables.

drop function if exists catalog_revert_action(uuid, uuid);
drop function if exists catalog_apply_queue_item(uuid, uuid, boolean);
drop function if exists catalog_record_card_intents(uuid[]);

drop table if exists catalog_reconcile_thresholds;

alter table job_queue
  drop constraint if exists job_queue_catalog_reconcile_payload_check;
alter table job_queue
  drop constraint if exists job_queue_catalog_curation_apply_payload_check;
alter table job_queue
  drop constraint if exists job_queue_catalog_threshold_recalibrate_payload_check;
alter table job_queue
  drop constraint if exists job_queue_catalog_source_refresh_payload_check;

alter table job_queue
  drop constraint if exists job_queue_catalog_match_payload_check;

alter table job_queue
  add constraint job_queue_catalog_match_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_match_suggestions_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'sourceCatalogItemId']::text[]
      and payload - array['kind', 'sourceCatalogItemId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'sourceCatalogItemId') = 'string'
      and payload->>'kind' = 'catalog_match_suggestions_refresh'
      and payload->>'sourceCatalogItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_alias_payload_check;

alter table job_queue
  add constraint job_queue_catalog_alias_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_alias_suggestions_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'catalogItemId']::text[]
      and payload - array['kind', 'catalogItemId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'catalogItemId') = 'string'
      and payload->>'kind' = 'catalog_alias_suggestions_refresh'
      and payload->>'catalogItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_fuzzy_duplicate_payload_check;

alter table job_queue
  add constraint job_queue_catalog_fuzzy_duplicate_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_fuzzy_duplicate_qa_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload - array['kind']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'catalog_fuzzy_duplicate_qa_refresh'
    )
  );
