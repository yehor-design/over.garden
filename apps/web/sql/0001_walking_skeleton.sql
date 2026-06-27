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
  coarse_region_code text check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table spaces
  add column if not exists coarse_region_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spaces_coarse_region_code_check'
      and conrelid = 'spaces'::regclass
  ) then
    alter table spaces
      add constraint spaces_coarse_region_code_check
      check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$');
  end if;
end $$;

create index if not exists spaces_owner_created_idx
  on spaces (owner_user_id, created_at desc);

create index if not exists spaces_owner_coarse_region_idx
  on spaces (owner_user_id, coarse_region_code)
  where coarse_region_code is not null;

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (char_length(canonical_name) between 1 and 120),
  normalized_name text check (normalized_name is null or char_length(normalized_name) between 1 and 120),
  public_slug text check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'seeded' check (status in ('seeded', 'confirmed', 'provisional', 'merged', 'rejected')),
  source text not null default 'internal_seed',
  source_id text,
  created_by_user_id uuid,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  merged_into_catalog_item_id uuid references catalog_items(id) on delete set null,
  locale text not null default 'und',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table catalog_items
  add column if not exists normalized_name text,
  add column if not exists public_slug text,
  add column if not exists created_by_user_id uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists merged_into_catalog_item_id uuid references catalog_items(id) on delete set null;

update catalog_items
set normalized_name = lower(canonical_name)
where normalized_name is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_public_slug_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      add constraint catalog_items_public_slug_check
      check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end $$;

create index if not exists catalog_items_status_created_idx
  on catalog_items (status, created_at desc);

create unique index if not exists catalog_items_public_slug_uidx
  on catalog_items (public_slug)
  where public_slug is not null;

create index if not exists catalog_items_merged_into_idx
  on catalog_items (merged_into_catalog_item_id)
  where merged_into_catalog_item_id is not null;

create unique index if not exists catalog_items_owner_normalized_locale_uidx
  on catalog_items (created_by_user_id, normalized_name, locale);

create table if not exists catalog_item_names (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  locale text not null default 'und',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_item_names_item_normalized_locale_uidx
  on catalog_item_names (catalog_item_id, normalized_name, locale);

create index if not exists catalog_item_names_normalized_idx
  on catalog_item_names (normalized_name);

create table if not exists variety_seed_proofs (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  title text not null,
  summary text not null,
  body text not null,
  source_label text,
  status text not null default 'draft',
  author_user_id uuid not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variety_seed_proofs_title_length_check
    check (char_length(title) between 1 and 120),
  constraint variety_seed_proofs_summary_length_check
    check (char_length(summary) between 1 and 280),
  constraint variety_seed_proofs_body_length_check
    check (char_length(body) between 80 and 1600),
  constraint variety_seed_proofs_source_label_length_check
    check (source_label is null or char_length(source_label) between 1 and 160),
  constraint variety_seed_proofs_status_check
    check (status in ('draft', 'published'))
);

alter table variety_seed_proofs
  add column if not exists catalog_item_id uuid,
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists body text,
  add column if not exists source_label text,
  add column if not exists status text default 'draft',
  add column if not exists author_user_id uuid,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_catalog_item_id_fkey'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_catalog_item_id_fkey
      foreign key (catalog_item_id) references catalog_items(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_title_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_title_length_check
      check (char_length(title) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_summary_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_summary_length_check
      check (char_length(summary) between 1 and 280);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_body_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_body_length_check
      check (char_length(body) between 80 and 1600);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_source_label_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_source_label_length_check
      check (source_label is null or char_length(source_label) between 1 and 160);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_status_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_status_check
      check (status in ('draft', 'published'));
  end if;
end $$;

create unique index if not exists variety_seed_proofs_catalog_item_uidx
  on variety_seed_proofs (catalog_item_id);

create index if not exists variety_seed_proofs_status_updated_idx
  on variety_seed_proofs (status, updated_at desc);

insert into catalog_items (
  id,
  canonical_name,
  normalized_name,
  public_slug,
  status,
  source,
  source_id,
  locale
)
values
  ('00000000-0000-4000-8000-000000000101', 'Помідор чері', lower('Помідор чері'), 'pomidor-cheri-0000000101', 'seeded', 'internal_seed', 'ove-seed-uk-cherry-tomato', 'uk'),
  ('00000000-0000-4000-8000-000000000102', 'Огірок Ніжинський', lower('Огірок Ніжинський'), 'nizhyn-cucumber-0000000102', 'seeded', 'internal_seed', 'ove-seed-uk-nizhyn-cucumber', 'uk'),
  ('00000000-0000-4000-8000-000000000103', 'Домат чери', lower('Домат чери'), 'domat-cheri-0000000103', 'seeded', 'internal_seed', 'ove-seed-bg-cherry-tomato', 'bg')
on conflict (id) do nothing;

update catalog_items
set public_slug = seed_slugs.public_slug
from (
  values
    ('00000000-0000-4000-8000-000000000101'::uuid, 'pomidor-cheri-0000000101'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'nizhyn-cucumber-0000000102'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'domat-cheri-0000000103')
) as seed_slugs(id, public_slug)
where catalog_items.id = seed_slugs.id
  and catalog_items.public_slug is null;

insert into catalog_item_names (
  catalog_item_id,
  display_name,
  normalized_name,
  locale,
  is_primary
)
values
  ('00000000-0000-4000-8000-000000000101', 'Помідор чері', lower('Помідор чері'), 'uk', true),
  ('00000000-0000-4000-8000-000000000101', 'Томат чері', lower('Томат чері'), 'uk', false),
  ('00000000-0000-4000-8000-000000000101', 'Cherry tomato', lower('Cherry tomato'), 'en', false),
  ('00000000-0000-4000-8000-000000000102', 'Огірок Ніжинський', lower('Огірок Ніжинський'), 'uk', true),
  ('00000000-0000-4000-8000-000000000102', 'Ніжинський огірок', lower('Ніжинський огірок'), 'uk', false),
  ('00000000-0000-4000-8000-000000000103', 'Домат чери', lower('Домат чери'), 'bg', true),
  ('00000000-0000-4000-8000-000000000103', 'Чери домат', lower('Чери домат'), 'bg', false)
on conflict (catalog_item_id, normalized_name, locale) do nothing;

create table if not exists plant_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  space_id uuid not null references spaces(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  catalog_item_id uuid references catalog_items(id) on delete set null,
  variety_text text check (variety_text is null or char_length(variety_text) between 1 and 120),
  variety_state text not null default 'unknown' check (variety_state in ('selected', 'unknown', 'user_added', 'free_text')),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  coarse_region_code text check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plant_objects
  add column if not exists catalog_item_id uuid,
  add column if not exists coarse_region_code text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_variety_state_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      drop constraint plant_objects_variety_state_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_variety_state_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_variety_state_check
      check (variety_state in ('selected', 'unknown', 'user_added', 'free_text'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_coarse_region_code_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_coarse_region_code_check
      check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_catalog_item_id_fkey'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_catalog_item_id_fkey
      foreign key (catalog_item_id) references catalog_items(id) on delete set null;
  end if;
end $$;

create index if not exists plant_objects_owner_created_idx
  on plant_objects (owner_user_id, created_at desc);

create index if not exists plant_objects_owner_space_idx
  on plant_objects (owner_user_id, space_id);

create index if not exists plant_objects_owner_coarse_region_idx
  on plant_objects (owner_user_id, coarse_region_code)
  where coarse_region_code is not null;

create index if not exists plant_objects_catalog_item_idx
  on plant_objects (catalog_item_id)
  where catalog_item_id is not null;

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
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'archived')),
  public_slug text,
  public_noindex boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  public_gone_at timestamptz,
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
  add column if not exists lifecycle_state text default 'active',
  add column if not exists public_slug text,
  add column if not exists public_noindex boolean default true,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists public_gone_at timestamptz,
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

update journal_entries
set lifecycle_state = 'active'
where lifecycle_state is null;

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
  alter column lifecycle_state set default 'active',
  alter column lifecycle_state set not null,
  alter column public_noindex set default true,
  alter column public_noindex set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_lifecycle_state_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_lifecycle_state_check
      check (lifecycle_state in ('active', 'archived'));
  end if;
end $$;

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
  where visibility = 'public' and lifecycle_state = 'active';

create unique index if not exists journal_entries_public_slug_uidx
  on journal_entries (public_slug)
  where public_slug is not null;

create index if not exists journal_entries_public_gone_idx
  on journal_entries (public_slug, public_gone_at)
  where public_slug is not null and public_gone_at is not null;

create table if not exists erasure_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null,
  request_scope text not null default 'account_data_erasure' check (
    request_scope in ('account_data_erasure')
  ),
  status text not null default 'submitted' check (
    status in ('submitted', 'reviewing', 'handled', 'canceled')
  ),
  submitted_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_status text check (
    handled_status is null
    or handled_status in (
      'completed',
      'declined',
      'duplicate',
      'needs_identity_verification'
    )
  ),
  handled_by_user_id uuid,
  intake_disclosure_version text not null default 'erasure-request-pilot-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erasure_requests_status_submitted_idx
  on erasure_requests (status, submitted_at desc);

create index if not exists erasure_requests_requester_submitted_idx
  on erasure_requests (requester_user_id, submitted_at desc);

create unique index if not exists erasure_requests_one_open_per_user_uidx
  on erasure_requests (requester_user_id)
  where status in ('submitted', 'reviewing');

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  session_id text,
  event_name text not null check (
    event_name in (
      'activation_started',
      'space_created',
      'object_created',
      'entry_logged',
      'entry_photo_attached',
      'offline_entry_queued',
      'offline_entry_synced',
      'progress_screen_shown',
      'own_record_revisited'
    )
  ),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object'),
  space_id uuid references spaces(id) on delete set null,
  plant_object_id uuid references plant_objects(id) on delete set null,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  related_event_id uuid references analytics_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      drop constraint analytics_events_event_name_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      add constraint analytics_events_event_name_check
      check (
        event_name in (
          'activation_started',
          'space_created',
          'object_created',
          'entry_logged',
          'entry_photo_attached',
          'offline_entry_queued',
          'offline_entry_synced',
          'progress_screen_shown',
          'own_record_revisited'
        )
      );
  end if;
end $$;

create index if not exists analytics_events_owner_event_created_idx
  on analytics_events (owner_user_id, event_name, created_at desc);

create index if not exists analytics_events_owner_session_object_idx
  on analytics_events (owner_user_id, session_id, plant_object_id, created_at desc)
  where session_id is not null and plant_object_id is not null;

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
