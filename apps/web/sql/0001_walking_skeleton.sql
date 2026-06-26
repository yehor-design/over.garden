-- Walking-skeleton schema for local/dev verification.
-- SQL migrations are the schema source of truth; Kysely types are generated
-- from a live database with `pnpm db:types`.

create extension if not exists pgcrypto;

create table if not exists health (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spaces_owner_created_idx
  on spaces (owner_user_id, created_at desc);

create table if not exists plant_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  space_id uuid not null references spaces(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  variety_text text check (variety_text is null or char_length(variety_text) between 1 and 120),
  variety_state text not null default 'unknown' check (variety_state in ('unknown', 'free_text')),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plant_objects_owner_created_idx
  on plant_objects (owner_user_id, created_at desc);

create index if not exists plant_objects_owner_space_idx
  on plant_objects (owner_user_id, space_id);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  space_id uuid not null references spaces(id) on delete cascade,
  plant_object_id uuid not null references plant_objects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 2000),
  entry_scope text not null default 'object' check (entry_scope = 'object'),
  entry_date date not null default current_date,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  public_slug text,
  public_noindex boolean not null default true,
  published_at timestamptz,
  first_publication_disclosure_version text,
  first_publication_disclosed_at timestamptz,
  client_mutation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_owner_client_mutation_uidx unique (owner_user_id, client_mutation_id)
);

-- Older local walking-skeleton databases had journal_entries.user_id/body only.
-- Keep bootstrap repeatable so agents can move between schema slices without a
-- manual destructive reset.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'owner_user_id'
  ) then
    alter table journal_entries rename column user_id to owner_user_id;
  end if;
end $$;

alter table journal_entries
  add column if not exists owner_user_id uuid,
  add column if not exists space_id uuid,
  add column if not exists plant_object_id uuid,
  add column if not exists title text,
  add column if not exists entry_scope text default 'object',
  add column if not exists entry_date date default current_date,
  add column if not exists public_slug text,
  add column if not exists public_noindex boolean default true,
  add column if not exists published_at timestamptz,
  add column if not exists first_publication_disclosure_version text,
  add column if not exists first_publication_disclosed_at timestamptz;

update journal_entries
set
  title = coalesce(title, 'Skeleton journal entry'),
  entry_scope = coalesce(entry_scope, 'object'),
  entry_date = coalesce(entry_date, current_date)
where title is null
   or entry_scope is null
   or entry_date is null;

update journal_entries
set public_noindex = true
where public_noindex is null;

with owners as (
  select distinct owner_user_id
  from journal_entries
  where owner_user_id is not null
    and (space_id is null or plant_object_id is null)
),
existing_spaces as (
  select distinct on (owner_user_id) owner_user_id, id
  from spaces
  where display_name = 'Local skeleton space'
  order by owner_user_id, created_at
),
inserted_spaces as (
  insert into spaces (owner_user_id, display_name)
  select owners.owner_user_id, 'Local skeleton space'
  from owners
  left join existing_spaces using (owner_user_id)
  where existing_spaces.id is null
  returning owner_user_id, id
),
space_map as (
  select owner_user_id, id from existing_spaces
  union all
  select owner_user_id, id from inserted_spaces
),
existing_objects as (
  select distinct on (owner_user_id, space_id) owner_user_id, space_id, id
  from plant_objects
  where display_name = 'Skeleton plant'
  order by owner_user_id, space_id, created_at
),
inserted_objects as (
  insert into plant_objects (owner_user_id, space_id, display_name)
  select space_map.owner_user_id, space_map.id, 'Skeleton plant'
  from space_map
  left join existing_objects
    on existing_objects.owner_user_id = space_map.owner_user_id
   and existing_objects.space_id = space_map.id
  where existing_objects.id is null
  returning owner_user_id, space_id, id
),
object_map as (
  select owner_user_id, space_id, id from existing_objects
  union all
  select owner_user_id, space_id, id from inserted_objects
)
update journal_entries
set
  space_id = coalesce(journal_entries.space_id, space_map.id),
  plant_object_id = coalesce(journal_entries.plant_object_id, object_map.id)
from space_map
inner join object_map
  on object_map.owner_user_id = space_map.owner_user_id
 and object_map.space_id = space_map.id
where journal_entries.owner_user_id = space_map.owner_user_id
  and (journal_entries.space_id is null or journal_entries.plant_object_id is null);

alter table journal_entries
  alter column owner_user_id set not null,
  alter column space_id set not null,
  alter column plant_object_id set not null,
  alter column title set not null,
  alter column entry_scope set default 'object',
  alter column entry_scope set not null,
  alter column entry_date set default current_date,
  alter column entry_date set not null,
  alter column public_noindex set default true,
  alter column public_noindex set not null;

create unique index if not exists journal_entries_owner_client_mutation_uidx
  on journal_entries (owner_user_id, client_mutation_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_space_id_fkey'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_plant_object_id_fkey'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_plant_object_id_fkey
      foreign key (plant_object_id) references plant_objects(id) on delete cascade;
  end if;
end $$;

create index if not exists journal_entries_owner_object_date_idx
  on journal_entries (owner_user_id, plant_object_id, entry_date desc, created_at desc);

create index if not exists journal_entries_public_created_idx
  on journal_entries (created_at desc)
  where visibility = 'public';

create unique index if not exists journal_entries_public_slug_uidx
  on journal_entries (public_slug)
  where public_slug is not null;

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  quarantine_key text not null unique,
  derivative_key text unique,
  status text not null default 'quarantined' check (status in ('quarantined', 'processed', 'failed')),
  original_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_owner_created_idx
  on media_assets (owner_user_id, created_at desc);

create unique index if not exists media_assets_one_per_entry_uidx
  on media_assets (journal_entry_id)
  where journal_entry_id is not null;

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  idempotency_key text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_queue_idempotency_key_uidx
  on job_queue (idempotency_key)
  where idempotency_key is not null;

create index if not exists job_queue_claim_idx
  on job_queue (queue_name, status, available_at, created_at);
