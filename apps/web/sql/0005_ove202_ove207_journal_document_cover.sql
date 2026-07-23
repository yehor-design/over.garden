-- Additive production catch-up for OVE-202 / OVE-207 schema that landed in
-- apps/web/sql/0001_walking_skeleton.sql but was not yet applied to managed
-- Postgres. Safe IF NOT EXISTS / create-or-replace only. No drops of user data.

-- OVE-202: up to ten processed non-fixture inline attachments per entry.
drop index if exists media_assets_one_per_entry_uidx;
drop index if exists media_assets_one_non_fixture_per_entry_uidx;

alter table media_assets
  add column if not exists document_position integer;

create index if not exists media_assets_entry_document_position_idx
  on media_assets (journal_entry_id, document_position asc, id asc)
  where journal_entry_id is not null
    and document_position is not null;

-- OVE-202: structured JournalDocumentV1 persistence + revision + receipts.
alter table journal_entries
  add column if not exists content_document jsonb,
  add column if not exists content_schema_version integer,
  add column if not exists journal_revision bigint;

update journal_entries
set journal_revision = 1
where journal_revision is null;

alter table journal_entries
  alter column journal_revision set default 1,
  alter column journal_revision set not null;

do $$
declare
  body_constraint_name text;
begin
  for body_constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conrelid = 'journal_entries'::regclass
      and con.contype = 'c'
      and att.attname = 'body'
      and pg_get_constraintdef(con.oid) like '%2000%'
  loop
    execute format(
      'alter table journal_entries drop constraint %I',
      body_constraint_name
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_body_length_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_body_length_check
      check (char_length(body) between 1 and 20000);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_content_schema_version_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_content_schema_version_check
      check (
        content_schema_version is null
        or content_schema_version >= 1
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_journal_revision_positive_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_journal_revision_positive_check
      check (journal_revision >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_content_document_object_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_content_document_object_check
      check (
        content_document is null
        or jsonb_typeof(content_document) = 'object'
      );
  end if;
end $$;

create table if not exists journal_entry_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  client_mutation_id text not null,
  base_revision bigint not null check (base_revision >= 0),
  result_revision bigint not null check (result_revision >= 1),
  mutation_kind text not null check (
    mutation_kind in ('create', 'edit')
  ),
  created_at timestamptz not null default now(),
  constraint journal_entry_mutation_receipts_owner_entry_mutation_uidx
    unique (owner_user_id, journal_entry_id, client_mutation_id)
);

create index if not exists journal_entry_mutation_receipts_owner_created_idx
  on journal_entry_mutation_receipts (owner_user_id, created_at desc);

-- OVE-207: cover selection.
alter table media_assets
  add column if not exists usage_role text;

update media_assets
set usage_role = 'inline'
where usage_role is null;

alter table media_assets
  alter column usage_role set default 'inline',
  alter column usage_role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_usage_role_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_usage_role_check
      check (usage_role in ('inline', 'cover_only'));
  end if;
end $$;

create unique index if not exists media_assets_one_cover_only_per_entry_uidx
  on media_assets (journal_entry_id)
  where journal_entry_id is not null
    and usage_role = 'cover_only'
    and quarantine_key not like 'visual-fixtures/%';

alter table journal_entries
  add column if not exists cover_media_asset_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_cover_media_asset_id_fkey'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_cover_media_asset_id_fkey
      foreign key (cover_media_asset_id)
      references media_assets(id)
      on delete set null;
  end if;
end $$;

create index if not exists journal_entries_cover_media_asset_id_idx
  on journal_entries (cover_media_asset_id)
  where cover_media_asset_id is not null;

create or replace function enforce_journal_entry_inline_media_limit()
returns trigger
language plpgsql
as $$
declare
  attached_count integer;
begin
  if new.journal_entry_id is null then
    return new;
  end if;

  if new.quarantine_key like 'visual-fixtures/%' then
    return new;
  end if;

  if coalesce(new.usage_role, 'inline') = 'cover_only' then
    return new;
  end if;

  select count(*)::integer
  into attached_count
  from media_assets
  where journal_entry_id = new.journal_entry_id
    and quarantine_key not like 'visual-fixtures/%'
    and coalesce(usage_role, 'inline') = 'inline'
    and id is distinct from new.id;

  if attached_count >= 10 then
    raise exception 'journal entry may attach at most 10 non-fixture media assets'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_inline_limit_trg on media_assets;
create trigger media_assets_inline_limit_trg
  before insert or update of journal_entry_id, usage_role
  on media_assets
  for each row
  execute function enforce_journal_entry_inline_media_limit();
