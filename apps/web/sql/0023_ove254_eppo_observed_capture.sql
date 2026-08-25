-- OVE-254 — immutable, resumable EPPO observed captures.
--
-- This source-layer migration does not activate catalog identities, public
-- records, search documents, or user-facing product state. The captured API
-- window is OverGarden-owned evidence and must never be described as an
-- official EPPO release.

create table if not exists catalog_source_capture_runs (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null default 'eppo-codes'
    check (source_slug = 'eppo-codes'),
  source_snapshot_id uuid unique
    references catalog_source_snapshots(id) on delete restrict,
  capture_schema_version text not null
    check (char_length(capture_schema_version) between 1 and 120),
  capture_tool_revision text not null
    check (capture_tool_revision ~ '^[a-f0-9]{40}$'),
  upstream_authority_class text not null default 'observed_capture'
    check (upstream_authority_class = 'observed_capture'),
  state text not null default 'planned'
    check (
      state in (
        'planned',
        'inventorying',
        'hydrating',
        'verifying',
        'completed',
        'paused',
        'failed',
        'superseded_by_new_capture'
      )
    ),
  source_host text not null check (source_host = 'api.eppo.int'),
  endpoint_family text not null check (endpoint_family = 'gd/v2'),
  request_schema_version text not null
    check (char_length(request_schema_version) between 1 and 120),
  openapi_sha256 text not null check (openapi_sha256 ~ '^[a-f0-9]{64}$'),
  license_sha256 text not null check (license_sha256 ~ '^[a-f0-9]{64}$'),
  observed_started_at timestamptz not null,
  observed_ended_at timestamptz,
  inventory_start_total bigint check (inventory_start_total is null or inventory_start_total > 0),
  inventory_end_total bigint check (inventory_end_total is null or inventory_end_total > 0),
  inventory_unique_codes bigint check (inventory_unique_codes is null or inventory_unique_codes > 0),
  inventory_page_count integer check (inventory_page_count is null or inventory_page_count > 0),
  inventory_start_sha256 text
    check (inventory_start_sha256 is null or inventory_start_sha256 ~ '^[a-f0-9]{64}$'),
  inventory_end_sha256 text
    check (inventory_end_sha256 is null or inventory_end_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text
    check (manifest_sha256 is null or manifest_sha256 ~ '^[a-f0-9]{64}$'),
  terminal_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(terminal_counts) = 'object'),
  rights_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rights_counts) = 'object'),
  preflight_receipt jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preflight_receipt) = 'object'),
  zero_product_baseline jsonb not null default '{}'::jsonb
    check (jsonb_typeof(zero_product_baseline) = 'object'),
  zero_product_receipt jsonb
    check (zero_product_receipt is null or jsonb_typeof(zero_product_receipt) = 'object'),
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error_class text
    check (
      last_error_class is null
      or last_error_class ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    ),
  superseded_by_capture_id uuid unique
    references catalog_source_capture_runs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_capture_runs_time_order_check check (
    observed_ended_at is null or observed_ended_at >= observed_started_at
  ),
  constraint catalog_source_capture_runs_distinct_successor_check check (
    superseded_by_capture_id is null or superseded_by_capture_id <> id
  ),
  constraint catalog_source_capture_runs_terminal_shape_check check (
    (
      state = 'completed'
      and source_snapshot_id is not null
      and observed_ended_at is not null
      and inventory_start_total is not null
      and inventory_end_total is not null
      and inventory_unique_codes is not null
      and inventory_page_count is not null
      and inventory_start_sha256 is not null
      and inventory_end_sha256 is not null
      and manifest_sha256 is not null
      and zero_product_receipt is not null
      and inventory_start_total = inventory_end_total
      and inventory_start_sha256 = inventory_end_sha256
      and superseded_by_capture_id is null
    )
    or (
      state = 'superseded_by_new_capture'
      and source_snapshot_id is not null
      and observed_ended_at is not null
      and manifest_sha256 is not null
      and superseded_by_capture_id is not null
    )
    or state not in ('completed', 'superseded_by_new_capture')
  )
);

create table if not exists catalog_source_capture_units (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null
    references catalog_source_capture_runs(id) on delete restrict,
  unit_kind text not null
    check (unit_kind in ('inventory_page', 'taxon_endpoint')),
  unit_key text not null check (char_length(unit_key) between 1 and 200),
  eppo_code text
    check (eppo_code is null or eppo_code ~ '^[0-9A-Z.!:/]{1,10}$'),
  identifier_class text not null default 'not_applicable'
    check (
      identifier_class in (
        'not_applicable',
        'documented_eppo_code',
        'inactive_eppo_identifier',
        'legacy_schema_exception'
      )
    ),
  endpoint_class text not null
    check (
      endpoint_class in (
        'taxon_list',
        'taxon_overview',
        'taxon_names',
        'taxon_taxonomy'
      )
    ),
  inventory_offset integer check (inventory_offset is null or inventory_offset >= 0),
  inventory_limit integer check (inventory_limit is null or inventory_limit between 1 and 1000),
  inventory_ordinal bigint check (inventory_ordinal is null or inventory_ordinal >= 0),
  state text not null default 'pending'
    check (
      state in (
        'pending',
        'in_progress',
        'captured',
        'source_only',
        'forbidden',
        'not_applicable',
        'failed'
      )
    ),
  request_schema_version text not null
    check (char_length(request_schema_version) between 1 and 120),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  observed_at timestamptz,
  http_status_class text
    check (
      http_status_class is null
      or http_status_class in ('2xx', '4xx', '5xx', 'not_requested')
    ),
  response_sha256 text
    check (response_sha256 is null or response_sha256 ~ '^[a-f0-9]{64}$'),
  raw_payload jsonb,
  allowed_projection jsonb not null default '{}'::jsonb
    check (jsonb_typeof(allowed_projection) in ('object', 'array')),
  source_only_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_only_fields) in ('object', 'array')),
  field_rights jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(field_rights) = 'object'
      and not jsonb_path_exists(
        field_rights,
        '$.* ? (@ != "source_public" && @ != "source_only" && @ != "forbidden" && @ != "unknown")'
      )
    ),
  rights_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rights_counts) = 'object'),
  last_error_class text
    check (
      last_error_class is null
      or last_error_class ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_capture_units_code_endpoint_uidx
    unique (capture_id, eppo_code, endpoint_class),
  constraint catalog_source_capture_units_unit_key_uidx
    unique (capture_id, endpoint_class, unit_key),
  constraint catalog_source_capture_units_shape_check check (
    (
      unit_kind = 'inventory_page'
      and endpoint_class = 'taxon_list'
      and eppo_code is null
      and identifier_class = 'not_applicable'
      and inventory_offset is not null
      and inventory_limit is not null
      and inventory_ordinal is null
      and unit_key = 'page:' || inventory_offset::text
    )
    or (
      unit_kind = 'taxon_endpoint'
      and endpoint_class <> 'taxon_list'
      and eppo_code is not null
      and (
        (identifier_class = 'documented_eppo_code' and eppo_code ~ '^[0-9A-Z]{5,6}$')
        or (identifier_class = 'inactive_eppo_identifier' and eppo_code ~ '^[0-9A-Z]{5,6}$')
        or (
          identifier_class = 'legacy_schema_exception'
          and eppo_code ~ '^[0-9A-Z.!:/]{1,10}$'
          and eppo_code !~ '^[0-9A-Z]{5,6}$'
        )
      )
      and inventory_offset is null
      and inventory_limit is null
      and inventory_ordinal is not null
      and unit_key = eppo_code
    )
  ),
  constraint catalog_source_capture_units_claim_shape_check check (
    (
      state = 'in_progress'
      and claim_token is not null
      and claimed_at is not null
    )
    or (
      state <> 'in_progress'
      and claim_token is null
      and claimed_at is null
    )
  ),
  constraint catalog_source_capture_units_terminal_shape_check check (
    (
      state in ('captured', 'source_only', 'forbidden', 'not_applicable')
      and observed_at is not null
      and http_status_class is not null
      and response_sha256 is not null
      and raw_payload is not null
      and last_error_class is null
    )
    or (
      state = 'failed'
      and last_error_class is not null
    )
    or state in ('pending', 'in_progress')
  )
);

create unique index if not exists catalog_source_capture_units_page_offset_uidx
  on catalog_source_capture_units (capture_id, inventory_offset)
  where unit_kind = 'inventory_page';

create index if not exists catalog_source_capture_runs_state_created_idx
  on catalog_source_capture_runs (source_slug, state, created_at desc);

create index if not exists catalog_source_capture_units_claim_idx
  on catalog_source_capture_units (capture_id, state, inventory_ordinal, endpoint_class)
  where state in ('pending', 'in_progress', 'failed');

create index if not exists catalog_source_capture_units_code_idx
  on catalog_source_capture_units (capture_id, eppo_code)
  where eppo_code is not null;

create or replace function enforce_catalog_source_capture_run_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.state in ('failed', 'superseded_by_new_capture') then
    raise exception 'terminal observed captures are immutable'
      using errcode = '55000';
  end if;

  if new.state <> old.state and not (
    (old.state = 'planned' and new.state in ('inventorying', 'failed'))
    or (old.state = 'inventorying' and new.state in ('hydrating', 'paused', 'failed'))
    or (old.state = 'hydrating' and new.state in ('verifying', 'paused', 'failed'))
    or (old.state = 'verifying' and new.state in ('completed', 'paused', 'failed'))
    or (old.state = 'paused' and new.state in ('hydrating', 'failed'))
    or (old.state = 'completed' and new.state = 'superseded_by_new_capture')
  ) then
    raise exception 'invalid observed capture state transition: % -> %', old.state, new.state
      using errcode = '55000';
  end if;

  if old.state = 'completed' then
    if new.state <> 'superseded_by_new_capture'
      or new.superseded_by_capture_id is null
      or new.id is distinct from old.id
      or new.source_slug is distinct from old.source_slug
      or new.source_snapshot_id is distinct from old.source_snapshot_id
      or new.capture_schema_version is distinct from old.capture_schema_version
      or new.capture_tool_revision is distinct from old.capture_tool_revision
      or new.upstream_authority_class is distinct from old.upstream_authority_class
      or new.source_host is distinct from old.source_host
      or new.endpoint_family is distinct from old.endpoint_family
      or new.request_schema_version is distinct from old.request_schema_version
      or new.openapi_sha256 is distinct from old.openapi_sha256
      or new.license_sha256 is distinct from old.license_sha256
      or new.observed_started_at is distinct from old.observed_started_at
      or new.observed_ended_at is distinct from old.observed_ended_at
      or new.inventory_start_total is distinct from old.inventory_start_total
      or new.inventory_end_total is distinct from old.inventory_end_total
      or new.inventory_unique_codes is distinct from old.inventory_unique_codes
      or new.inventory_page_count is distinct from old.inventory_page_count
      or new.inventory_start_sha256 is distinct from old.inventory_start_sha256
      or new.inventory_end_sha256 is distinct from old.inventory_end_sha256
      or new.manifest_sha256 is distinct from old.manifest_sha256
      or new.terminal_counts is distinct from old.terminal_counts
      or new.rights_counts is distinct from old.rights_counts
      or new.preflight_receipt is distinct from old.preflight_receipt
      or new.zero_product_baseline is distinct from old.zero_product_baseline
      or new.zero_product_receipt is distinct from old.zero_product_receipt
      or new.retry_count is distinct from old.retry_count
      or new.last_error_class is distinct from old.last_error_class
      or new.created_at is distinct from old.created_at then
      raise exception 'completed observed captures are immutable except for successor linkage'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_source_capture_runs_immutable_terminal
  on catalog_source_capture_runs;
create trigger catalog_source_capture_runs_immutable_terminal
before update on catalog_source_capture_runs
for each row execute function enforce_catalog_source_capture_run_immutability();

create or replace function enforce_catalog_source_capture_unit_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.state in ('captured', 'source_only', 'forbidden', 'not_applicable') then
    raise exception 'terminal observed capture units are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_source_capture_units_immutable_terminal
  on catalog_source_capture_units;
create trigger catalog_source_capture_units_immutable_terminal
before update or delete on catalog_source_capture_units
for each row execute function enforce_catalog_source_capture_unit_immutability();
