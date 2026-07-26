-- OVE-225 — privacy-safe job queue contract for the journal kinds.
--
-- job_queue retains rows in `done`, `failed`, and `dead` status
-- (services/matching/app/worker.py holds them rather than deleting them), so
-- both constraints are added `not valid`: enforcement applies to new rows and
-- retained history cannot block the migration. Promoting either constraint to
-- `validate constraint` is a separate maintainer-gated step that requires a
-- zero-violation reading from
-- `pnpm exec tsx scripts/inventory-job-queue-payloads.ts` first.
--
-- Shape mirrors the three catalog constraints in
-- apps/web/sql/0001_walking_skeleton.sql, and the key sets mirror
-- `payloadContract` in apps/web/src/server/job-queue-manifest.ts.

alter table job_queue
  drop constraint if exists job_queue_journal_entry_index_payload_check;

alter table job_queue
  add constraint job_queue_journal_entry_index_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'journal_entry_index'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'journalEntryId', 'userId']::text[]
      and payload - array['kind', 'journalEntryId', 'userId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'journalEntryId') = 'string'
      and jsonb_typeof(payload->'userId') = 'string'
      and payload->>'kind' = 'journal_entry_index'
      and payload->>'journalEntryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and payload->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;

alter table job_queue
  drop constraint if exists job_queue_journal_entry_unindex_payload_check;

alter table job_queue
  add constraint job_queue_journal_entry_unindex_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'journal_entry_unindex'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'journalEntryId', 'userId']::text[]
      and payload - array['kind', 'journalEntryId', 'userId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'journalEntryId') = 'string'
      and jsonb_typeof(payload->'userId') = 'string'
      and payload->>'kind' = 'journal_entry_unindex'
      and payload->>'journalEntryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and payload->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;
