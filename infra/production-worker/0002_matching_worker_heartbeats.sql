-- OVE-190 production-only additive migration.
--
-- The handler set here is the nine kinds the queue manifest declares. It said
-- six until 2026-09-04, three Stable Registry kinds after the manifest grew,
-- and this file only ever adds a missing constraint — so on a database that
-- already has the six-handler check it changes nothing. Correcting an existing
-- database is apps/web/sql/0050_matching_handler_set_catch_up.sql.
--
-- This is intentionally the minimal matching_worker_heartbeats excerpt of the
-- canonical apps/web/sql/0001_walking_skeleton.sql schema. Never replay the
-- full bootstrap SQL against production. CREATE TABLE IF NOT EXISTS is safe to
-- rerun; app.runtime preflight fails closed if an existing table has drifted.
-- The row stores release/capability liveness only, never host, process, user,
-- payload, connection, location, or error data.

create table if not exists matching_worker_heartbeats (
  queue_name text primary key,
  release_commit_sha text not null,
  image_digest text not null,
  schema_compatibility_class text not null,
  supported_handlers text[] not null,
  seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matching_worker_heartbeats_commit_sha_check check (
    release_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  constraint matching_worker_heartbeats_image_digest_check check (
    image_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint matching_worker_heartbeats_schema_compatibility_check check (
    schema_compatibility_class = 'ove190.matching-schema.v1'
  ),
  constraint matching_worker_heartbeats_queue_name_check check (
    queue_name = 'matching'
  ),
  constraint matching_worker_heartbeats_supported_handlers_check check (
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
  )
);

-- Repair only the stable check names if an idempotent earlier attempt created
-- the table with equivalent unnamed checks. Existing protection is preserved.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_commit_sha_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_commit_sha_check
      check (release_commit_sha ~ '^[0-9a-f]{40}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_image_digest_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_image_digest_check
      check (image_digest ~ '^sha256:[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_schema_compatibility_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_schema_compatibility_check
      check (schema_compatibility_class = 'ove190.matching-schema.v1');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_queue_name_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_queue_name_check
      check (queue_name = 'matching');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_supported_handlers_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
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
  end if;
end $$;
