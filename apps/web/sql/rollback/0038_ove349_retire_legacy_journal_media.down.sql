-- OVE-349 schema-only recovery companion.
--
-- This file is deliberately outside the versioned bootstrap directory. It is
-- operator-run only after the normal migration has been reverted at the app
-- layer. It restores an empty draft table and nullable compatibility columns;
-- it cannot and does not restore the intentionally deleted test content.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table journal_entries
  drop constraint if exists journal_entries_visibility_check;

alter table journal_entries
  alter column visibility set default 'private';

alter table journal_entries
  add constraint journal_entries_visibility_check
  check (visibility in ('private', 'public'));

alter table media_assets
  alter column journal_entry_id drop not null,
  alter column derivative_key drop not null,
  add column if not exists quarantine_key text,
  add column if not exists status text default 'quarantined',
  add column if not exists original_deleted_at timestamptz,
  add column if not exists declared_media_type text,
  add column if not exists admitted_media_type text,
  add column if not exists media_readiness_state text default 'legacy_non_ready',
  add column if not exists processing_claim_token uuid,
  add column if not exists processing_claimed_at timestamptz,
  add column if not exists upload_generation_id uuid,
  add column if not exists public_object_id uuid,
  add column if not exists quality_policy_version text,
  add column if not exists quality_class text,
  add column if not exists quality_reason_codes text[],
  add column if not exists quality_metrics jsonb,
  add column if not exists quality_evaluated_at timestamptz;

update media_assets
set quarantine_key = coalesce(quarantine_key, 'retired-compat/' || id::text),
    status = coalesce(status, 'processed'),
    original_deleted_at = coalesce(original_deleted_at, updated_at),
    declared_media_type = coalesce(declared_media_type, 'image/webp'),
    admitted_media_type = coalesce(admitted_media_type, 'image/webp'),
    media_readiness_state = coalesce(media_readiness_state, 'public_ready'),
    upload_generation_id = coalesce(upload_generation_id, id),
    public_object_id = coalesce(public_object_id, id);

create unique index if not exists media_assets_quarantine_key_uidx
  on media_assets (quarantine_key)
  where quarantine_key is not null;

create unique index if not exists media_assets_upload_generation_id_uidx
  on media_assets (upload_generation_id)
  where upload_generation_id is not null;

create unique index if not exists media_assets_public_object_id_uidx
  on media_assets (public_object_id)
  where public_object_id is not null;

create table if not exists journal_entry_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references "user"(id) on delete cascade,
  draft_key text not null check (char_length(draft_key) between 1 and 240),
  draft_kind text not null
    check (draft_kind in ('first_entry', 'follow_up', 'space_entry', 'edit_entry')),
  space_id uuid references spaces(id) on delete cascade,
  plant_object_id uuid references plant_objects(id) on delete cascade,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  document_schema_version integer not null default 1
    check (document_schema_version = 1),
  draft_generation bigint not null check (draft_generation > 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  server_revision bigint not null default 1 check (server_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entry_drafts_owner_key_uidx
    unique (owner_user_id, draft_key),
  constraint journal_entry_drafts_context_check check (
    (draft_kind = 'first_entry' and plant_object_id is null and journal_entry_id is null)
    or (draft_kind = 'follow_up' and space_id is null and plant_object_id is not null and journal_entry_id is null)
    or (draft_kind = 'space_entry' and space_id is not null and plant_object_id is null and journal_entry_id is null)
    or (draft_kind = 'edit_entry' and space_id is null and plant_object_id is null and journal_entry_id is not null)
  )
);

create index if not exists journal_entry_drafts_owner_updated_idx
  on journal_entry_drafts (owner_user_id, updated_at desc);

commit;
