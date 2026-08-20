-- OVE-321: server-authoritative online journal draft protocol.
-- Additive and repeatable. No existing journal content is rewritten.

create table if not exists journal_entry_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
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
    (
      draft_kind = 'first_entry'
      and plant_object_id is null
      and journal_entry_id is null
    )
    or (
      draft_kind = 'follow_up'
      and space_id is null
      and plant_object_id is not null
      and journal_entry_id is null
    )
    or (
      draft_kind = 'space_entry'
      and space_id is not null
      and plant_object_id is null
      and journal_entry_id is null
    )
    or (
      draft_kind = 'edit_entry'
      and space_id is null
      and plant_object_id is null
      and journal_entry_id is not null
    )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_drafts_owner_user_id_fkey'
      and conrelid = 'journal_entry_drafts'::regclass
  ) then
    alter table journal_entry_drafts
      add constraint journal_entry_drafts_owner_user_id_fkey
      foreign key (owner_user_id) references "user"(id) on delete cascade;
  end if;
end $$;

create index if not exists journal_entry_drafts_owner_updated_idx
  on journal_entry_drafts (owner_user_id, updated_at desc);
