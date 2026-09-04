-- OVE-190 production-only additive migration.
--
-- `supported_handlers` is checked for shape, not for identity. It pinned an
-- exact array until 2026-09-04 — six kinds, then nine — which meant the column
-- refused to record the one state anyone needed to see: a worker whose handler
-- set differs from the manifest. That worker then had no heartbeat at all and
-- read as dead. Identity is compared in `app.runtime`, which can report
-- `capability_mismatch`. See apps/web/sql/0051_matching_handler_set_shape.sql;
-- this file only ever adds a missing constraint, so on an existing database it
-- changes nothing and 0051 is what corrects one.
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
    supported_handlers is not null
    and cardinality(supported_handlers) between 1 and 64
    and supported_handlers::text ~ '^\{[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*\}$'
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
        supported_handlers is not null
        and cardinality(supported_handlers) between 1 and 64
        and supported_handlers::text ~ '^\{[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*\}$'
      );
  end if;
end $$;
