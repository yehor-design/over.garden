-- OVE-269: a private, owner-scoped receipt for one explicit Pl@ntNet species
-- decision. This schema intentionally stores only normalized provider evidence;
-- no bytes, storage paths, URLs, raw responses, filenames or location fields.

-- A restored pre-OVE-219 local database can retain this table without the
-- defaults encoded by the current migration. Reconcile the non-destructive
-- generated-column shape before code generation; fresh databases already have
-- these defaults and are unchanged.
alter table if exists learning_attribution_outbox
  add column if not exists desired_generation integer not null default 1,
  add column if not exists applied_generation integer not null default 0,
  alter column desired_generation set default 1,
  alter column applied_generation set default 0;

create table if not exists plant_identification_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references "user"(id) on delete cascade,
  plant_object_id uuid references plant_objects(id) on delete set null,
  provider text not null default 'plantnet' check (provider = 'plantnet'),
  capability text not null default 'species_identification'
    check (capability = 'species_identification'),
  project text not null default 'all' check (project = 'all'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  media_manifest jsonb not null,
  organs text[] not null,
  policy_version text not null check (char_length(policy_version) between 1 and 80),
  state text not null default 'ready_to_submit'
    check (state in (
      'ready_to_submit', 'submitting', 'shortlist_ready',
      'provider_rejected_non_plant', 'no_species_found',
      'catalog_mapping_incomplete', 'quota_exhausted', 'rate_limited',
      'provider_timeout', 'provider_unavailable', 'invalid_media', 'canceled',
      'completed'
    )),
  error_class text,
  claim_token uuid,
  claim_expires_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  request_duration_ms integer check (
    request_duration_ms is null or request_duration_ms between 0 and 15000
  ),
  quota_remaining integer check (quota_remaining is null or quota_remaining >= 0),
  model_version text check (model_version is null or char_length(model_version) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_identification_requests_manifest_check check (
    jsonb_typeof(media_manifest) = 'array'
    and jsonb_array_length(media_manifest) between 1 and 5
    and cardinality(organs) between 1 and 5
    and jsonb_array_length(media_manifest) = cardinality(organs)
    and media_manifest::text !~* '(https?:|s3:|quarantine|derivative_key|filename|gps|latitude|longitude|exif|original)'
    and array_to_string(organs, ',') ~ '^(auto|leaf|flower|fruit|bark)(,(auto|leaf|flower|fruit|bark))*$'
  ),
  constraint plant_identification_requests_claim_check check (
    (state = 'submitting' and claim_token is not null and claim_expires_at is not null)
    or (state <> 'submitting' and claim_token is null and claim_expires_at is null)
  ),
  constraint plant_identification_requests_error_check check (
    error_class is null or error_class in (
      'invalid_media', 'provider_rejected_non_plant', 'no_species_found',
      'catalog_mapping_incomplete', 'quota_exhausted', 'rate_limited',
      'provider_timeout', 'provider_unavailable', 'provider_schema'
    )
  )
);

create unique index if not exists plant_identification_requests_owner_fingerprint_uidx
  on plant_identification_requests (owner_user_id, fingerprint);

create unique index if not exists plant_identification_requests_owner_inflight_uidx
  on plant_identification_requests (owner_user_id)
  where state = 'submitting';

create index if not exists plant_identification_requests_owner_object_created_idx
  on plant_identification_requests (owner_user_id, plant_object_id, created_at desc);

-- Four durable leases bound global fan-out across every app process. A request
-- deletion may cascade one occupied slot away; each new claim restores the
-- fixed slot set before choosing an available row.
create table if not exists plant_identification_submission_slots (
  slot smallint primary key check (slot between 1 and 4),
  request_id uuid unique references plant_identification_requests(id) on delete cascade,
  claim_token uuid,
  claim_expires_at timestamptz,
  constraint plant_identification_submission_slots_lease_check check (
    (request_id is null and claim_token is null and claim_expires_at is null)
    or (request_id is not null and claim_token is not null and claim_expires_at is not null)
  )
);

insert into plant_identification_submission_slots (slot)
values (1), (2), (3), (4)
on conflict (slot) do nothing;

create table if not exists plant_identification_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references plant_identification_requests(id) on delete cascade,
  rank smallint not null check (rank between 1 and 5),
  score numeric(6, 5) not null check (score >= 0 and score <= 1),
  scientific_name text not null check (char_length(scientific_name) between 1 and 240),
  genus text check (genus is null or char_length(genus) <= 120),
  family text check (family is null or char_length(family) <= 120),
  mapping_status text not null check (mapping_status in ('mapped', 'unmapped', 'ambiguous')),
  catalog_item_id uuid references catalog_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint plant_identification_candidates_mapping_check check (
    (mapping_status = 'mapped' and catalog_item_id is not null)
    or (mapping_status in ('unmapped', 'ambiguous') and catalog_item_id is null)
  ),
  unique (request_id, rank)
);

create index if not exists plant_identification_candidates_request_mapping_idx
  on plant_identification_candidates (request_id, mapping_status, rank);

create table if not exists plant_identification_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references plant_identification_requests(id) on delete cascade,
  owner_user_id uuid not null references "user"(id) on delete cascade,
  decision text not null check (decision in ('confirmed', 'manual', 'unknown', 'dismissed')),
  selected_candidate_rank smallint check (selected_candidate_rank between 1 and 5),
  selected_catalog_item_id uuid references catalog_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint plant_identification_decisions_selection_check check (
    (decision = 'confirmed' and selected_candidate_rank is not null and selected_catalog_item_id is not null)
    or (decision <> 'confirmed' and selected_candidate_rank is null and selected_catalog_item_id is null)
  )
);

create index if not exists plant_identification_decisions_owner_created_idx
  on plant_identification_decisions (owner_user_id, created_at desc);
