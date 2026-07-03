-- Walking-skeleton schema for local/dev verification.
-- SQL migrations are the schema source of truth; Kysely types are generated
-- from a live database with `pnpm db:types`.

create extension if not exists pgcrypto;

create table if not exists health (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

-- Admin control plane owner lock (OVE-108/OVE-113 sealed owner hardening).
-- This app-owned table stores the single durable owner grant for the configured
-- Better Auth user. It intentionally stores only user IDs, role enums, and
-- bounded grant metadata: never emails, cookies, tokens,
-- request metadata, IP/user-agent, journal text, media keys, env values, or
-- fine-grained place data.
create table if not exists admin_user_roles (
  user_id uuid primary key,
  role text not null check (role = 'owner'),
  granted_by_user_id uuid,
  grant_reason text not null default 'manual_bootstrap',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_user_roles
  add column if not exists role text not null default 'owner',
  add column if not exists granted_by_user_id uuid,
  add column if not exists grant_reason text not null default 'manual_bootstrap',
  add column if not exists granted_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_user_roles_role_check'
      and conrelid = 'admin_user_roles'::regclass
  ) then
    alter table admin_user_roles
      drop constraint admin_user_roles_role_check;
  end if;

  alter table admin_user_roles
    add constraint admin_user_roles_role_check
    check (role = 'owner');

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_user_roles_grant_reason_check'
      and conrelid = 'admin_user_roles'::regclass
  ) then
    alter table admin_user_roles
      add constraint admin_user_roles_grant_reason_check
      check (char_length(grant_reason) between 1 and 120);
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_user_roles_user_id_fkey'
        and conrelid = 'admin_user_roles'::regclass
    ) then
      alter table admin_user_roles
        add constraint admin_user_roles_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_user_roles_granted_by_user_id_fkey'
        and conrelid = 'admin_user_roles'::regclass
    ) then
      alter table admin_user_roles
        add constraint admin_user_roles_granted_by_user_id_fkey
        foreign key (granted_by_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists admin_user_roles_role_granted_idx
  on admin_user_roles (role, granted_at desc);

create unique index if not exists admin_user_roles_single_owner_idx
  on admin_user_roles ((true));

-- Admin role audit trail (OVE-110). Audit rows store only internal user IDs,
-- a one-way session hash, bounded role/action/reason enums, and timestamps.
-- Never store emails, cookies, raw session IDs, provider tokens, IP/user-agent,
-- private journal/media content, fine-grained place data, or env values here.
create table if not exists admin_role_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_session_id_hash text,
  target_user_id uuid,
  action text not null,
  previous_role text,
  new_role text,
  reason text not null default 'manual_owner_grant',
  created_at timestamptz not null default now()
);

alter table admin_role_audit_log
  add column if not exists actor_user_id uuid,
  add column if not exists actor_session_id_hash text,
  add column if not exists target_user_id uuid,
  add column if not exists action text not null default 'grant',
  add column if not exists previous_role text,
  add column if not exists new_role text,
  add column if not exists reason text not null default 'manual_owner_grant',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_actor_session_hash_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_actor_session_hash_check
      check (actor_session_id_hash is null or actor_session_id_hash ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_action_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_action_check
      check (action in ('grant', 'revoke'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_previous_role_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_previous_role_check
      check (previous_role is null or previous_role in ('owner', 'admin', 'moderator', 'viewer'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_new_role_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_new_role_check
      check (new_role is null or new_role in ('owner', 'admin', 'moderator', 'viewer'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_reason_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_reason_check
      check (reason in (
        'manual_owner_grant',
        'pilot_operator_delegation',
        'temporary_coverage',
        'role_cleanup',
        'access_revoked'
      ));
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_role_audit_log_actor_user_id_fkey'
        and conrelid = 'admin_role_audit_log'::regclass
    ) then
      alter table admin_role_audit_log
        add constraint admin_role_audit_log_actor_user_id_fkey
        foreign key (actor_user_id) references "user"(id) on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_role_audit_log_target_user_id_fkey'
        and conrelid = 'admin_role_audit_log'::regclass
    ) then
      alter table admin_role_audit_log
        add constraint admin_role_audit_log_target_user_id_fkey
        foreign key (target_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists admin_role_audit_log_created_idx
  on admin_role_audit_log (created_at desc);

create index if not exists admin_role_audit_log_target_created_idx
  on admin_role_audit_log (target_user_id, created_at desc);

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
  catalog_kind text not null default 'plant_variety' check (catalog_kind in ('plant_variety', 'species', 'breed')),
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
  add column if not exists catalog_kind text default 'plant_variety',
  add column if not exists normalized_name text,
  add column if not exists public_slug text,
  add column if not exists created_by_user_id uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists merged_into_catalog_item_id uuid references catalog_items(id) on delete set null;

update catalog_items
set normalized_name = lower(canonical_name)
where normalized_name is null;

update catalog_items
set catalog_kind = 'plant_variety'
where catalog_kind is null;

update catalog_items
set catalog_kind = 'species'
where source = 'species_backbone'
  and catalog_kind <> 'species';

alter table catalog_items
  alter column catalog_kind set default 'plant_variety',
  alter column catalog_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_catalog_kind_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      add constraint catalog_items_catalog_kind_check
      check (catalog_kind in ('plant_variety', 'species', 'breed'));
  end if;

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

create index if not exists catalog_items_kind_status_idx
  on catalog_items (catalog_kind, status, created_at desc);

create unique index if not exists catalog_items_public_slug_uidx
  on catalog_items (public_slug)
  where public_slug is not null;

create index if not exists catalog_items_merged_into_idx
  on catalog_items (merged_into_catalog_item_id)
  where merged_into_catalog_item_id is not null;

create unique index if not exists catalog_items_owner_normalized_locale_uidx
  on catalog_items (created_by_user_id, normalized_name, locale);

create unique index if not exists catalog_items_source_source_id_uidx
  on catalog_items (source, source_id);

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

create table if not exists catalog_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_category text not null check (char_length(source_category) between 1 and 80),
  source_version text not null check (char_length(source_version) between 1 and 120),
  source_url text not null check (char_length(source_url) between 1 and 1000),
  license text not null check (char_length(license) between 1 and 240),
  license_url text check (license_url is null or char_length(license_url) between 1 and 1000),
  attribution_required boolean not null default true,
  attribution_text text check (attribution_text is null or char_length(attribution_text) between 1 and 500),
  allowed_usage jsonb not null default '[]'::jsonb,
  parser_version text not null check (char_length(parser_version) between 1 and 120),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null,
  verified_at timestamptz not null,
  status text not null default 'imported' check (status in ('imported', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_snapshots_slug_version_checksum_uidx unique (
    source_slug,
    source_version,
    payload_sha256
  )
);

alter table catalog_source_snapshots
  add column if not exists license_url text,
  add column if not exists attribution_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_source_snapshots_license_url_check'
      and conrelid = 'catalog_source_snapshots'::regclass
  ) then
    alter table catalog_source_snapshots
      add constraint catalog_source_snapshots_license_url_check
      check (license_url is null or char_length(license_url) between 1 and 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_source_snapshots_attribution_text_check'
      and conrelid = 'catalog_source_snapshots'::regclass
  ) then
    alter table catalog_source_snapshots
      add constraint catalog_source_snapshots_attribution_text_check
      check (attribution_text is null or char_length(attribution_text) between 1 and 500);
  end if;
end $$;

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'ua-state-register'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'Catalogue of Life / ChecklistBank, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'catalogue-of-life-checklistbank'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'GBIF Backbone Taxonomy, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'gbif-backbone'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://data.eppo.int/documentation/opendata'),
  attribution_text = coalesce(
    attribution_text,
    'EPPO Codes, EPPO Codes Open Data Licence.'
  ),
  updated_at = now()
where source_slug = 'eppo-codes'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/publicdomain/zero/1.0/'),
  updated_at = now()
where source_slug in ('world-flora-online', 'wikidata')
  and attribution_required = false
  and license_url is null;

create table if not exists catalog_source_records (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null references catalog_source_snapshots(id) on delete cascade,
  source_record_id text not null check (char_length(source_record_id) between 1 and 200),
  raw_payload jsonb not null,
  raw_payload_sha256 text not null check (raw_payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_only_fields jsonb not null default '{}'::jsonb,
  allowed_projection jsonb not null default '{}'::jsonb,
  projection_status text not null default 'projected' check (projection_status in ('projected', 'quarantined', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_records_snapshot_record_uidx unique (
    source_snapshot_id,
    source_record_id
  )
);

create table if not exists catalog_source_links (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  source_record_id uuid not null references catalog_source_records(id) on delete restrict,
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_record_key text not null check (char_length(source_record_key) between 1 and 200),
  projection_kind text not null default 'canonical_item' check (projection_kind in ('canonical_item', 'alias')),
  created_at timestamptz not null default now(),
  constraint catalog_source_links_item_record_uidx unique (
    catalog_item_id,
    source_record_id
  )
);

create index if not exists catalog_source_records_snapshot_idx
  on catalog_source_records (source_snapshot_id);

create index if not exists catalog_source_records_projection_status_idx
  on catalog_source_records (projection_status, updated_at desc);

create index if not exists catalog_source_links_catalog_item_idx
  on catalog_source_links (catalog_item_id);

create table if not exists catalog_source_refresh_events (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  previous_snapshot_id uuid not null references catalog_source_snapshots(id) on delete restrict,
  refreshed_snapshot_id uuid not null references catalog_source_snapshots(id) on delete restrict,
  refresh_label text not null check (char_length(refresh_label) between 1 and 240),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_refresh_events_source_snapshot_uidx unique (
    source_slug,
    refreshed_snapshot_id
  )
);

create table if not exists catalog_source_refresh_records (
  id uuid primary key default gen_random_uuid(),
  refresh_event_id uuid not null references catalog_source_refresh_events(id) on delete cascade,
  source_record_key text not null check (char_length(source_record_key) between 1 and 200),
  previous_source_record_id uuid references catalog_source_records(id) on delete set null,
  refreshed_source_record_id uuid references catalog_source_records(id) on delete set null,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  diff_status text not null check (
    diff_status in (
      'new',
      'unchanged',
      'changed',
      'removed_upstream',
      'parser_reject',
      'review_needed',
      'projection_blocked'
    )
  ),
  projection_action text not null check (
    projection_action in (
      'project_new',
      'link_existing',
      'project_safe_aliases',
      'retain_without_upstream',
      'reject_parser_row',
      'queue_curator_review',
      'block_projection'
    )
  ),
  safe_diff jsonb not null default '{}'::jsonb,
  review_reason text check (review_reason is null or char_length(review_reason) between 1 and 500),
  reindex_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_refresh_records_event_record_uidx unique (
    refresh_event_id,
    source_record_key
  )
);

create index if not exists catalog_source_refresh_events_source_created_idx
  on catalog_source_refresh_events (source_slug, created_at desc);

create index if not exists catalog_source_refresh_records_event_status_idx
  on catalog_source_refresh_records (refresh_event_id, diff_status);

create index if not exists catalog_source_refresh_records_catalog_item_idx
  on catalog_source_refresh_records (catalog_item_id)
  where catalog_item_id is not null;

create table if not exists catalog_alias_projections (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  catalog_item_name_id uuid references catalog_item_names(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  locale text not null default 'und',
  script text not null default 'und' check (char_length(script) between 1 and 40),
  alias_kind text not null check (alias_kind in ('accepted_scientific_name', 'synonym', 'vernacular_alias', 'generated_variant', 'user_provisional')),
  status text not null check (status in ('accepted', 'review_needed', 'rejected', 'generated', 'user_provisional')),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_method text not null check (source_method in ('source_backed', 'generated', 'manual_seed', 'ontology_seed', 'user_provisional', 'curator')),
  source_record_id uuid references catalog_source_records(id) on delete set null,
  source_record_key text check (source_record_key is null or char_length(source_record_key) between 1 and 200),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  license text not null check (char_length(license) between 1 and 240),
  attribution_required boolean not null default true,
  projection_notes text check (projection_notes is null or char_length(projection_notes) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'catalog_alias_projections_source_method_check'
      and conrelid = 'catalog_alias_projections'::regclass
  ) then
    alter table catalog_alias_projections
      drop constraint catalog_alias_projections_source_method_check;
  end if;

  alter table catalog_alias_projections
    add constraint catalog_alias_projections_source_method_check
    check (source_method in ('source_backed', 'generated', 'manual_seed', 'ontology_seed', 'user_provisional', 'curator'));
end $$;

create unique index if not exists catalog_alias_projections_item_alias_source_uidx
  on catalog_alias_projections (
    catalog_item_id,
    normalized_name,
    locale,
    source_slug,
    source_method
  );

create index if not exists catalog_alias_projections_item_status_idx
  on catalog_alias_projections (catalog_item_id, status, locale);

create index if not exists catalog_alias_projections_name_idx
  on catalog_alias_projections (catalog_item_name_id)
  where catalog_item_name_id is not null;

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
  object_kind text not null default 'plant' check (object_kind in ('plant', 'bee_colony', 'animal')),
  catalog_item_id uuid references catalog_items(id) on delete set null,
  variety_text text check (variety_text is null or char_length(variety_text) between 1 and 120),
  variety_state text not null default 'unknown' check (variety_state in ('selected', 'unknown', 'user_added', 'free_text')),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  coarse_region_code text check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plant_objects
  add column if not exists object_kind text default 'plant',
  add column if not exists catalog_item_id uuid,
  add column if not exists coarse_region_code text;

update plant_objects
set object_kind = 'plant'
where object_kind is null;

alter table plant_objects
  alter column object_kind set default 'plant',
  alter column object_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_object_kind_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_object_kind_check
      check (object_kind in ('plant', 'bee_colony', 'animal'));
  end if;

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
  plant_object_id uuid references plant_objects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 2000),
  entry_scope text not null default 'object' check (entry_scope in ('object', 'space')),
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
  constraint journal_entries_owner_client_mutation_uidx unique (owner_user_id, client_mutation_id),
  constraint journal_entries_scope_target_check check (
    (entry_scope = 'object' and plant_object_id is not null)
    or (entry_scope = 'space' and plant_object_id is null)
  )
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
  alter column plant_object_id drop not null,
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
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_entry_scope_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_entry_scope_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_entry_scope_check
    check (entry_scope in ('object', 'space'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_scope_target_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_scope_target_check
      check (
        (entry_scope = 'object' and plant_object_id is not null)
        or (entry_scope = 'space' and plant_object_id is null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_identity_owner_space_uidx'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_identity_owner_space_uidx
      unique (id, owner_user_id, space_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_identity_owner_space_uidx'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_identity_owner_space_uidx
      unique (id, owner_user_id, space_id);
  end if;
end $$;

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

create index if not exists journal_entries_owner_space_date_idx
  on journal_entries (owner_user_id, space_id, entry_date desc, created_at desc)
  where entry_scope = 'space';

create index if not exists journal_entries_public_created_idx
  on journal_entries (created_at desc)
  where visibility = 'public' and lifecycle_state = 'active';

create unique index if not exists journal_entries_public_slug_uidx
  on journal_entries (public_slug)
  where public_slug is not null;

create index if not exists journal_entries_public_gone_idx
  on journal_entries (public_slug, public_gone_at)
  where public_slug is not null and public_gone_at is not null;

create table if not exists journal_entry_object_mentions (
  journal_entry_id uuid not null,
  owner_user_id uuid not null,
  space_id uuid not null,
  plant_object_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (journal_entry_id, plant_object_id),
  constraint journal_entry_object_mentions_entry_fkey
    foreign key (journal_entry_id, owner_user_id, space_id)
    references journal_entries (id, owner_user_id, space_id)
    on delete cascade,
  constraint journal_entry_object_mentions_object_fkey
    foreign key (plant_object_id, owner_user_id, space_id)
    references plant_objects (id, owner_user_id, space_id)
    on delete cascade
);

create index if not exists journal_entry_object_mentions_owner_space_idx
  on journal_entry_object_mentions (owner_user_id, space_id, journal_entry_id);

create index if not exists journal_entry_object_mentions_object_idx
  on journal_entry_object_mentions (owner_user_id, plant_object_id, journal_entry_id);

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

-- OVE-47 erasure dry-run review marker. Non-destructive operator checkpoint only.
alter table erasure_requests
  add column if not exists dry_run_reviewed_at timestamptz,
  add column if not exists dry_run_reviewed_by_user_id uuid;

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
      'own_record_revisited',
      'follow_up_value_pulse'
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
          'own_record_revisited',
          'follow_up_value_pulse'
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

-- Closed-pilot write eligibility (OVE-42, OVE-52, OVE-54). One persistent grant per
-- user that proves invited write access. It stores ONLY the user id, enum
-- cohort, enum pilot segment, and timestamps: never the invite link, token,
-- email, phone, referrer, IP, user agent, or query string. Cohort membership
-- and segment decision support stay enum-only. Founder rehearsal grants can
-- exercise the path internally but must stay excluded from real pilot decisions.
create table if not exists pilot_invite_grants (
  user_id uuid primary key,
  cohort text not null default 'closed_pilot' check (cohort in ('closed_pilot', 'founder_rehearsal')),
  segment text not null default 'unknown_segment' check (
    segment in (
      'casual_micro_grower',
      'casual_gen_z',
      'casual_practical_beginner',
      'casual_urban_balcony',
      'casual_food_self_reliance',
      'power_burned_out_it',
      'power_collector',
      'power_experienced',
      'power_homestead',
      'supply_expert_creator',
      'supply_local_seller',
      'channel_ally',
      'unknown_segment'
    )
  ),
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pilot_invite_grants
  add column if not exists cohort text not null default 'closed_pilot';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_invite_grants_cohort_check'
      and conrelid = 'pilot_invite_grants'::regclass
  ) then
    alter table pilot_invite_grants
      drop constraint pilot_invite_grants_cohort_check;
  end if;

  alter table pilot_invite_grants
    add constraint pilot_invite_grants_cohort_check
    check (cohort in ('closed_pilot', 'founder_rehearsal'));
end $$;

alter table pilot_invite_grants
  add column if not exists segment text not null default 'unknown_segment';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_invite_grants_segment_check'
      and conrelid = 'pilot_invite_grants'::regclass
  ) then
    alter table pilot_invite_grants
      drop constraint pilot_invite_grants_segment_check;
  end if;

  alter table pilot_invite_grants
    add constraint pilot_invite_grants_segment_check
    check (
      segment in (
        'casual_micro_grower',
        'casual_gen_z',
        'casual_practical_beginner',
        'casual_urban_balcony',
        'casual_food_self_reliance',
        'power_burned_out_it',
        'power_collector',
        'power_experienced',
        'power_homestead',
        'supply_expert_creator',
        'supply_local_seller',
        'channel_ally',
        'unknown_segment'
      )
    );
end $$;

create index if not exists pilot_invite_grants_granted_idx
  on pilot_invite_grants (granted_at desc);

create index if not exists pilot_invite_grants_segment_granted_idx
  on pilot_invite_grants (segment, granted_at desc);

create index if not exists pilot_invite_grants_cohort_segment_granted_idx
  on pilot_invite_grants (cohort, segment, granted_at desc);

-- Founder interview capture (OVE-45). Operator-only structured pilot learnings.
-- Stores bounded enum fields and an optional short redacted note. Never journal
-- text, media keys, contact details, request metadata, or raw transcripts.
create table if not exists pilot_interview_learnings (
  id uuid primary key default gen_random_uuid(),
  recorded_by_user_id uuid not null,
  subject_user_id uuid,
  pilot_cohort text check (pilot_cohort is null or pilot_cohort in ('closed_pilot', 'founder_rehearsal')),
  segment text not null check (
    segment in (
      'casual_micro_grower',
      'casual_gen_z',
      'casual_practical_beginner',
      'casual_urban_balcony',
      'casual_food_self_reliance',
      'power_burned_out_it',
      'power_collector',
      'power_experienced',
      'power_homestead',
      'supply_expert_creator',
      'supply_local_seller',
      'channel_ally',
      'unknown_segment'
    )
  ),
  activation_result text not null check (
    activation_result in (
      'not_activated',
      'activated_first_entry_only',
      'activated_with_follow_up',
      'started_no_save',
      'dropped_after_first',
      'not_in_cohort',
      'unknown'
    )
  ),
  return_reason text not null check (
    return_reason in (
      'same_object_follow_up',
      'seasonal_return',
      'never_returned',
      'returned_no_save',
      'privacy_concern',
      'composer_friction',
      'not_relevant_yet',
      'unknown'
    )
  ),
  main_objection text not null check (
    main_objection in (
      'no_journal_habit',
      'too_much_effort',
      'privacy_location',
      'no_clear_value',
      'prefers_paper_or_social',
      'product_too_early',
      'not_gardener_fit',
      'none_observed',
      'unknown'
    )
  ),
  observed_value text not null check (
    observed_value in (
      'history_worth_keeping',
      'photo_safe_capture',
      'catalog_helpful',
      'offline_queue_helpful',
      'progress_moment_helpful',
      'public_variety_hook',
      'no_clear_value_yet',
      'unknown'
    )
  ),
  next_action text not null check (
    next_action in (
      'continue_pilot',
      'iterate_composer',
      'iterate_onboarding',
      'iterate_privacy_copy',
      'schedule_follow_up',
      'pause_recruiting',
      'close_track',
      'none'
    )
  ),
  redacted_note text check (
    redacted_note is null or char_length(redacted_note) between 1 and 280
  ),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_interview_learnings_pilot_cohort_check'
      and conrelid = 'pilot_interview_learnings'::regclass
  ) then
    alter table pilot_interview_learnings
      drop constraint pilot_interview_learnings_pilot_cohort_check;
  end if;

  alter table pilot_interview_learnings
    add constraint pilot_interview_learnings_pilot_cohort_check
    check (pilot_cohort is null or pilot_cohort in ('closed_pilot', 'founder_rehearsal'));
end $$;

create index if not exists pilot_interview_learnings_segment_recorded_idx
  on pilot_interview_learnings (segment, recorded_at desc);

create index if not exists pilot_interview_learnings_activation_recorded_idx
  on pilot_interview_learnings (activation_result, recorded_at desc);

create index if not exists pilot_interview_learnings_subject_recorded_idx
  on pilot_interview_learnings (subject_user_id, recorded_at desc)
  where subject_user_id is not null;
