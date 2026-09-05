-- Rollback of 0053: recreates every object the Stable Registry retirement
-- dropped, in the order the original migrations created them.
--
-- Nothing here is new SQL. Each section below is the verbatim text of the
-- migration that first created the objects (0024, 0026, 0027, 0028, 0040,
-- 0041 whole; 0025, 0043 and 0052 only the statements that belong to the
-- retired release model — the EPPO read model, the catalog_item_names trigram
-- index and the live payload contracts are untouched by 0053 and so need no
-- rollback). The originals are idempotent (`if not exists`, `or replace`,
-- `drop trigger if exists` before `create trigger`), which is what makes a
-- verbatim replay a correct rollback. The one shared function,
-- materialize_stable_registry_public_read_models, comes back with both its
-- catalog and its EPPO branch, exactly as 0025 wrote it.
--
-- Rolling back recreates empty tables. It cannot restore rows, because 0053
-- is applied only where every table it drops has been inventoried empty.
-- The worker does not depend on any of this: since ADR-0025 the manifest
-- declares six kinds, so the three payload constraints recreated at the end
-- describe kinds nothing produces, exactly as they did before 0053.

-- ======================================================================
-- from 0024_ove255_stable_registry_foundation.sql (whole file)
-- ======================================================================

-- OVE-255 — immutable Stable Registry Foundation release center.
--
-- This migration creates an additive release layer over `catalog_items`. It
-- never projects a captured source row into a product surface by itself:
-- source capture, identity resolution, release membership, and product
-- eligibility remain independent states.

create table if not exists catalog_item_revisions (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  canonical_name text not null check (char_length(canonical_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  catalog_kind text not null check (catalog_kind in ('plant_variety', 'species', 'breed')),
  identity_relation text not null default 'canonical'
    check (identity_relation in ('canonical', 'successor_of', 'alias_of', 'equivalent_to', 'merged_into', 'split_from')),
  source_evidence_digest text not null check (source_evidence_digest ~ '^[a-f0-9]{64}$'),
  revision_digest text not null check (revision_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (catalog_item_id, revision_number),
  unique (catalog_item_id, revision_digest)
);

create index if not exists catalog_item_revisions_catalog_item_idx
  on catalog_item_revisions (catalog_item_id, revision_number desc);

create table if not exists catalog_registry_releases (
  id uuid primary key default gen_random_uuid(),
  release_kind text not null check (release_kind in ('foundation', 'edition', 'extension')),
  state text not null default 'draft'
    check (state in ('draft', 'building', 'review_ready', 'approved', 'active', 'retired', 'failed', 'abandoned')),
  capture_id uuid references catalog_source_capture_runs(id) on delete restrict,
  source_snapshot_id uuid references catalog_source_snapshots(id) on delete restrict,
  predecessor_release_id uuid references catalog_registry_releases(id) on delete restrict,
  policy_version text not null check (char_length(policy_version) between 1 and 120),
  build_digest text not null check (build_digest ~ '^[a-f0-9]{64}$'),
  preview_digest text check (preview_digest is null or preview_digest ~ '^[a-f0-9]{64}$'),
  safe_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_summary) = 'object'),
  created_by_user_id uuid not null,
  approved_by_user_id uuid,
  activated_by_user_id uuid,
  build_started_at timestamptz,
  review_ready_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_registry_releases_foundation_capture_check check (
    release_kind <> 'foundation' or (capture_id is not null and source_snapshot_id is not null)
  ),
  constraint catalog_registry_releases_time_order_check check (
    (review_ready_at is null or build_started_at is null or review_ready_at >= build_started_at)
    and (approved_at is null or review_ready_at is null or approved_at >= review_ready_at)
    and (activated_at is null or approved_at is null or activated_at >= approved_at)
  )
);

create unique index if not exists catalog_registry_foundation_capture_policy_uidx
  on catalog_registry_releases (capture_id, policy_version)
  where release_kind = 'foundation'
    and state not in ('failed', 'abandoned');

create index if not exists catalog_registry_releases_state_created_idx
  on catalog_registry_releases (release_kind, state, created_at desc);

create table if not exists catalog_registry_release_members (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references catalog_registry_releases(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id) on delete restrict,
  catalog_item_revision_id uuid not null references catalog_item_revisions(id) on delete restrict,
  eligibility text not null
    check (eligibility in ('auto_ready', 'needs_review', 'source_only', 'blocked', 'product_eligible')),
  membership_digest text not null check (membership_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (release_id, catalog_item_id),
  unique (release_id, catalog_item_revision_id)
);

create index if not exists catalog_registry_release_members_release_eligibility_idx
  on catalog_registry_release_members (release_id, eligibility);

create table if not exists catalog_registry_exception_groups (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references catalog_registry_releases(id) on delete restrict,
  group_key text not null check (group_key ~ '^[a-f0-9]{64}$'),
  reason_class text not null check (
    reason_class in (
      'accepted_name_conflict',
      'rank_conflict',
      'ambiguous_identity',
      'merge_candidate',
      'split_candidate',
      'rights_ambiguity',
      'unsupported_field',
      'authority_corroboration_required',
      'source_only_or_ineligible'
    )
  ),
  state text not null default 'open'
    check (state in ('open', 'decided', 'deferred', 'blocked')),
  member_count integer not null check (member_count > 0),
  safe_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_summary) = 'object'),
  expected_version integer not null default 1 check (expected_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, group_key)
);

create index if not exists catalog_registry_exception_groups_release_state_idx
  on catalog_registry_exception_groups (release_id, state, created_at);

create table if not exists catalog_registry_decisions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references catalog_registry_releases(id) on delete restrict,
  exception_group_id uuid not null references catalog_registry_exception_groups(id) on delete restrict,
  action text not null check (
    action in ('same_concept', 'different_concept', 'add_alias', 'keep_current', 'create_successor', 'defer', 'block_rule')
  ),
  expected_version integer not null check (expected_version >= 1),
  decision_digest text not null check (decision_digest ~ '^[a-f0-9]{64}$'),
  decided_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (release_id, exception_group_id, expected_version)
);

create index if not exists catalog_registry_decisions_group_created_idx
  on catalog_registry_decisions (exception_group_id, created_at desc);

create table if not exists catalog_registry_active_pointers (
  release_family text primary key check (release_family in ('foundation', 'edition', 'extension')),
  active_release_id uuid references catalog_registry_releases(id) on delete restrict,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists catalog_registry_activations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references catalog_registry_releases(id) on delete restrict,
  prior_release_id uuid references catalog_registry_releases(id) on delete restrict,
  activation_digest text not null check (activation_digest ~ '^[a-f0-9]{64}$'),
  activated_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists catalog_registry_search_outbox (
  release_id uuid primary key references catalog_registry_releases(id) on delete restrict,
  desired_state text not null check (desired_state in ('present', 'absent')),
  state text not null default 'pending' check (state in ('pending', 'processing', 'applied', 'failed', 'dead')),
  intent_digest text not null check (intent_digest ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_class text check (last_error_class is null or last_error_class ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint catalog_registry_search_outbox_claim_shape_check check (
    (state = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

create index if not exists catalog_registry_search_outbox_claim_idx
  on catalog_registry_search_outbox (state, available_at)
  where state in ('pending', 'failed', 'processing');

-- The worker receives only the opaque release UUID. Source rows and raw payloads
-- must be read through its scoped query, never through a queue payload.
alter table job_queue
  drop constraint if exists job_queue_stable_registry_foundation_build_payload_check;

alter table job_queue
  add constraint job_queue_stable_registry_foundation_build_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'stable_registry_foundation_build'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload ? 'releaseId'
      and payload - array['kind', 'releaseId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'stable_registry_foundation_build'
      and jsonb_typeof(payload->'releaseId') = 'string'
      and payload->>'releaseId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;

create or replace function prevent_catalog_item_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'catalog item revisions are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_item_revisions_append_only on catalog_item_revisions;
create trigger catalog_item_revisions_append_only
before update or delete on catalog_item_revisions
for each row execute function prevent_catalog_item_revision_mutation();

create or replace function prevent_catalog_registry_release_member_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'approved release membership is append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_registry_release_members_append_only on catalog_registry_release_members;
create trigger catalog_registry_release_members_append_only
before update or delete on catalog_registry_release_members
for each row execute function prevent_catalog_registry_release_member_mutation();

create or replace function prevent_catalog_registry_decision_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Account erasure may only replace the actor attribution with the one
  -- non-human tombstone identity. The decision content and receipt stay
  -- byte-for-byte immutable, including for terminal releases.
  if tg_op = 'UPDATE' then
    if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
      and new.id is not distinct from old.id
      and new.release_id is not distinct from old.release_id
      and new.exception_group_id is not distinct from old.exception_group_id
      and new.action is not distinct from old.action
      and new.expected_version is not distinct from old.expected_version
      and new.decision_digest is not distinct from old.decision_digest
      and new.created_at is not distinct from old.created_at
      and new.decided_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
      and new.decided_by_user_id is distinct from old.decided_by_user_id then
      return new;
    end if;
  end if;

  raise exception 'registry decisions are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_registry_decisions_append_only on catalog_registry_decisions;
create trigger catalog_registry_decisions_append_only
before update or delete on catalog_registry_decisions
for each row execute function prevent_catalog_registry_decision_mutation();

create or replace function prevent_catalog_registry_activation_mutation()
returns trigger
language plpgsql
as $$
begin
  -- The activation receipt is immutable except for privacy-preserving actor
  -- rekeying during a single approved account-erasure transaction.
  if tg_op = 'UPDATE' then
    if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
      and new.id is not distinct from old.id
      and new.release_id is not distinct from old.release_id
      and new.prior_release_id is not distinct from old.prior_release_id
      and new.activation_digest is not distinct from old.activation_digest
      and new.created_at is not distinct from old.created_at
      and new.activated_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
      and new.activated_by_user_id is distinct from old.activated_by_user_id then
      return new;
    end if;
  end if;

  raise exception 'registry activations are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_registry_activations_append_only on catalog_registry_activations;
create trigger catalog_registry_activations_append_only
before update or delete on catalog_registry_activations
for each row execute function prevent_catalog_registry_activation_mutation();

create or replace function enforce_catalog_registry_release_transition()
returns trigger
language plpgsql
as $$
begin
  -- A user may exercise erasure without rewriting a release's stable identity,
  -- state, digests, timestamps, or membership. This narrow exception is only
  -- enabled transaction-locally by the erasure executor and replaces changed
  -- actor fields with the non-human tombstone identity.
  if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
    and new.id is not distinct from old.id
    and new.release_kind is not distinct from old.release_kind
    and new.state is not distinct from old.state
    and new.capture_id is not distinct from old.capture_id
    and new.source_snapshot_id is not distinct from old.source_snapshot_id
    and new.predecessor_release_id is not distinct from old.predecessor_release_id
    and new.policy_version is not distinct from old.policy_version
    and new.build_digest is not distinct from old.build_digest
    and new.preview_digest is not distinct from old.preview_digest
    and new.safe_summary is not distinct from old.safe_summary
    and new.build_started_at is not distinct from old.build_started_at
    and new.review_ready_at is not distinct from old.review_ready_at
    and new.approved_at is not distinct from old.approved_at
    and new.activated_at is not distinct from old.activated_at
    and new.retired_at is not distinct from old.retired_at
    and new.version is not distinct from old.version
    and new.created_at is not distinct from old.created_at
    and new.updated_at is not distinct from old.updated_at
    and (
      new.created_by_user_id is not distinct from old.created_by_user_id
      or new.created_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.approved_by_user_id is not distinct from old.approved_by_user_id
      or new.approved_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.activated_by_user_id is not distinct from old.activated_by_user_id
      or new.activated_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.created_by_user_id is distinct from old.created_by_user_id
      or new.approved_by_user_id is distinct from old.approved_by_user_id
      or new.activated_by_user_id is distinct from old.activated_by_user_id
    ) then
    return new;
  end if;

  if new.release_kind is distinct from old.release_kind
    or new.capture_id is distinct from old.capture_id
    or new.source_snapshot_id is distinct from old.source_snapshot_id
    or new.predecessor_release_id is distinct from old.predecessor_release_id
    or new.policy_version is distinct from old.policy_version
    or new.build_digest is distinct from old.build_digest
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'registry release identity is immutable'
      using errcode = '55000';
  end if;

  if new.state <> old.state and not (
    (old.state = 'draft' and new.state in ('building', 'failed', 'abandoned'))
    or (old.state = 'building' and new.state in ('review_ready', 'failed', 'abandoned'))
    or (old.state = 'review_ready' and new.state in ('approved', 'failed', 'abandoned'))
    or (old.state = 'approved' and new.state in ('active', 'failed'))
    or (old.state = 'active' and new.state = 'retired')
  ) then
    raise exception 'invalid registry release transition: % -> %', old.state, new.state
      using errcode = '55000';
  end if;

  if old.state in ('retired', 'failed', 'abandoned') and new is distinct from old then
    raise exception 'terminal registry releases are immutable'
      using errcode = '55000';
  end if;

  if old.state in ('approved', 'active', 'retired')
    and new.safe_summary is distinct from old.safe_summary then
    raise exception 'approved release summary is immutable'
      using errcode = '55000';
  end if;

  if old.build_started_at is not null
    and new.build_started_at is distinct from old.build_started_at then
    raise exception 'registry release build start is immutable'
      using errcode = '55000';
  end if;

  if old.review_ready_at is not null
    and new.review_ready_at is distinct from old.review_ready_at then
    raise exception 'registry release review receipt is immutable'
      using errcode = '55000';
  end if;

  if old.preview_digest is not null
    and new.preview_digest is distinct from old.preview_digest then
    raise exception 'approved registry preview digest is immutable'
      using errcode = '55000';
  end if;

  if old.approved_by_user_id is not null
    and new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'registry release approver is immutable'
      using errcode = '55000';
  end if;

  if old.approved_at is not null
    and new.approved_at is distinct from old.approved_at then
    raise exception 'registry release approval receipt is immutable'
      using errcode = '55000';
  end if;

  if old.activated_by_user_id is not null
    and new.activated_by_user_id is distinct from old.activated_by_user_id then
    raise exception 'registry release activator is immutable'
      using errcode = '55000';
  end if;

  if old.activated_at is not null
    and new.activated_at is distinct from old.activated_at then
    raise exception 'registry release activation receipt is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_registry_releases_state_transition on catalog_registry_releases;
create trigger catalog_registry_releases_state_transition
before update on catalog_registry_releases
for each row execute function enforce_catalog_registry_release_transition();

create or replace function enforce_catalog_registry_exception_group_mutation()
returns trigger
language plpgsql
as $$
declare
  release_state text;
begin
  select state into release_state
  from catalog_registry_releases
  where id = old.release_id;

  if release_state in ('approved', 'active', 'retired', 'failed', 'abandoned') then
    raise exception 'exception groups are immutable after release approval'
      using errcode = '55000';
  end if;

  if new.release_id is distinct from old.release_id
    or new.group_key is distinct from old.group_key
    or new.reason_class is distinct from old.reason_class
    or new.member_count is distinct from old.member_count
    or new.safe_summary is distinct from old.safe_summary
    or new.created_at is distinct from old.created_at then
    raise exception 'exception group identity is immutable'
      using errcode = '55000';
  end if;

  if new.state <> old.state and not (
    (old.state = 'open' and new.state in ('decided', 'deferred', 'blocked'))
    or (old.state = 'blocked' and new.state = 'deferred')
  ) then
    raise exception 'invalid exception group transition: % -> %', old.state, new.state
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_registry_exception_groups_transition on catalog_registry_exception_groups;
create trigger catalog_registry_exception_groups_transition
before update on catalog_registry_exception_groups
for each row execute function enforce_catalog_registry_exception_group_mutation();

-- ======================================================================
-- from 0025_ove256_stable_registry_public_reads.sql (public catalog records)
-- ======================================================================

create table if not exists stable_registry_public_catalog_records (
  registry_release_id uuid not null
    references catalog_registry_releases(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id) on delete restrict,
  stable_taxon text not null
    check (stable_taxon ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  object_kind text not null check (object_kind in ('plant', 'animal')),
  canonical_name text not null check (char_length(canonical_name) between 1 and 240),
  scientific_name text check (scientific_name is null or char_length(scientific_name) between 1 and 240),
  taxonomic_rank text check (taxonomic_rank is null or char_length(taxonomic_rank) between 1 and 120),
  parent_display_name text check (parent_display_name is null or char_length(parent_display_name) between 1 and 240),
  search_normalized text not null check (char_length(search_normalized) between 1 and 240),
  safe_aliases text[] not null default '{}'::text[],
  activated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (registry_release_id, stable_taxon),
  unique (registry_release_id, catalog_item_id)
);

alter table stable_registry_public_catalog_records
  add column if not exists scientific_name text,
  add column if not exists taxonomic_rank text,
  add column if not exists parent_display_name text;

create index if not exists stable_registry_public_catalog_lookup_idx
  on stable_registry_public_catalog_records (
    registry_release_id,
    object_kind,
    lower(canonical_name) text_pattern_ops,
    stable_taxon
  );

-- ======================================================================
-- from 0025_ove256_stable_registry_public_reads.sql (public catalog search terms)
-- ======================================================================

create table if not exists stable_registry_public_catalog_search_terms (
  registry_release_id uuid not null,
  stable_taxon text not null,
  object_kind text not null check (object_kind in ('plant', 'animal')),
  normalized_term text not null check (char_length(normalized_term) between 1 and 240),
  primary key (registry_release_id, stable_taxon, normalized_term),
  foreign key (registry_release_id, stable_taxon)
    references stable_registry_public_catalog_records(registry_release_id, stable_taxon)
    on delete cascade
);

create index if not exists stable_registry_public_catalog_search_terms_prefix_idx
  on stable_registry_public_catalog_search_terms (
    registry_release_id,
    object_kind,
    normalized_term text_pattern_ops,
    stable_taxon
  );

-- ======================================================================
-- from 0025_ove256_stable_registry_public_reads.sql (shared read-model trigger function and the catalog trigger)
-- ======================================================================

create or replace function materialize_stable_registry_public_read_models()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'catalog_registry_releases'
    and new.state = 'active'
    and old.state is distinct from 'active' then
    perform materialize_stable_registry_public_catalog_release(new.id);
  elsif tg_table_name = 'catalog_source_capture_runs'
    and new.state = 'completed'
    and old.state is distinct from 'completed' then
    perform materialize_stable_registry_public_eppo_capture(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_registry_public_catalog_materialize
  on catalog_registry_releases;
create trigger catalog_registry_public_catalog_materialize
after update of state on catalog_registry_releases
for each row execute function materialize_stable_registry_public_read_models();

-- ======================================================================
-- from 0026_ove257_stable_registry_product_projection.sql (whole file)
-- ======================================================================

-- OVE-257 — active Stable Registry product projection.
--
-- The product picker never reads raw capture/source rows or mutable catalog
-- eligibility directly. It reads this additive, release-scoped projection
-- instead. A row exists only after a Foundation release becomes active and the
-- immutable membership marks its stable catalog identity product_eligible.

create table if not exists stable_registry_product_catalog_records (
  registry_release_id uuid not null
    references catalog_registry_releases(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id) on delete restrict,
  catalog_item_revision_id uuid not null
    references catalog_item_revisions(id) on delete restrict,
  -- A variety is always a plant and a breed is always an animal, but `species`
  -- is legitimately either: a seeded bee species and a seeded plant species are
  -- both valid product identities. Collapsing species to one kind would make
  -- animal species unselectable, so the projection keeps the same honest
  -- three-valued scope the picker already implements.
  object_kind_scope text not null
    check (object_kind_scope in ('plant', 'animal', 'either')),
  catalog_kind text not null
    check (catalog_kind in ('plant_variety', 'species', 'breed')),
  canonical_name text not null
    check (char_length(canonical_name) between 1 and 240),
  item_locale text not null check (char_length(item_locale) between 1 and 20),
  public_slug text not null
    check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  activated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (registry_release_id, catalog_item_id),
  unique (registry_release_id, catalog_item_revision_id),
  unique (registry_release_id, public_slug),
  foreign key (registry_release_id, catalog_item_id)
    references catalog_registry_release_members(release_id, catalog_item_id)
    on delete restrict
);

create index if not exists stable_registry_product_catalog_records_lookup_idx
  on stable_registry_product_catalog_records (
    registry_release_id,
    object_kind_scope,
    catalog_item_id
  );

create table if not exists stable_registry_product_catalog_names (
  registry_release_id uuid not null,
  catalog_item_id uuid not null,
  object_kind_scope text not null
    check (object_kind_scope in ('plant', 'animal', 'either')),
  normalized_name text not null
    check (char_length(normalized_name) between 1 and 240),
  locale text not null check (char_length(locale) between 1 and 20),
  display_name text not null
    check (char_length(display_name) between 1 and 240),
  name_class text not null check (
    name_class in ('canonical', 'scientific', 'localized', 'accepted_alias')
  ),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  -- `name_class` is part of the identity, not a label on it. One spelling can
  -- legitimately be both the canonical release name and the Latin scientific
  -- name; keying without the class would let the scientific row collide with
  -- the canonical row and be dropped by `on conflict do nothing`, silently
  -- removing the first-class Latin search path this projection must guarantee.
  primary key (
    registry_release_id,
    catalog_item_id,
    name_class,
    locale,
    normalized_name
  ),
  foreign key (registry_release_id, catalog_item_id)
    references stable_registry_product_catalog_records(
      registry_release_id,
      catalog_item_id
    )
    on delete cascade
);

create index if not exists stable_registry_product_catalog_names_prefix_idx
  on stable_registry_product_catalog_names (
    registry_release_id,
    object_kind_scope,
    normalized_name text_pattern_ops,
    catalog_item_id
  );

-- This durable intent is deliberately per immutable projection identity. The
-- existing matching job queue remains the lease/CAS owner; a successful full
-- rebuild marks all due identities done without treating Meilisearch as source
-- of truth.
create table if not exists stable_registry_product_projection_outbox (
  registry_release_id uuid not null,
  catalog_item_id uuid not null,
  catalog_item_revision_id uuid not null,
  desired_state text not null default 'present'
    check (desired_state in ('present', 'absent')),
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_class text
    check (last_error_class is null or last_error_class ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id
  ),
  foreign key (registry_release_id, catalog_item_id)
    references stable_registry_product_catalog_records(
      registry_release_id,
      catalog_item_id
    )
    on delete cascade,
  foreign key (catalog_item_revision_id)
    references catalog_item_revisions(id) on delete restrict
);

create index if not exists stable_registry_product_projection_outbox_due_idx
  on stable_registry_product_projection_outbox (state, updated_at)
  where state in ('pending', 'failed', 'processing');

-- The public OVE-256 view and this product view use the same deterministic
-- opaque public identifier. Existing human-readable slugs stay unchanged;
-- rows without one receive a stable internal UUID-derived route rather than
-- being silently omitted from an active product release.
create or replace function stable_registry_product_public_slug(
  catalog_item_uuid uuid,
  candidate_slug text
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(candidate_slug), ''),
    'registry-' || replace(catalog_item_uuid::text, '-', '')
  );
$$;

create or replace function materialize_stable_registry_product_release(
  target_release_id uuid
)
returns void
language plpgsql
as $$
begin
  -- Projection rows are derived only from the frozen active membership and
  -- immutable item revision. The current catalog row is used solely for its
  -- already-public locale/slug/name aliases at activation time; no source
  -- payload, evidence, or user data is selected.
  delete from stable_registry_product_projection_outbox
  where registry_release_id = target_release_id;

  delete from stable_registry_product_catalog_records
  where registry_release_id = target_release_id;

  insert into stable_registry_product_catalog_records (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    object_kind_scope,
    catalog_kind,
    canonical_name,
    item_locale,
    public_slug,
    activated_at
  )
  select
    releases.id,
    members.catalog_item_id,
    members.catalog_item_revision_id,
    case revisions.catalog_kind
      when 'breed' then 'animal'
      when 'plant_variety' then 'plant'
      else 'either'
    end,
    revisions.catalog_kind,
    stable_registry_public_safe_label(revisions.canonical_name, 240),
    items.locale,
    stable_registry_product_public_slug(items.id, items.public_slug),
    releases.activated_at
  from catalog_registry_releases as releases
  join catalog_registry_release_members as members
    on members.release_id = releases.id
   and members.eligibility = 'product_eligible'
  join catalog_item_revisions as revisions
    on revisions.id = members.catalog_item_revision_id
   and revisions.catalog_item_id = members.catalog_item_id
  join catalog_items as items
    on items.id = members.catalog_item_id
  where releases.id = target_release_id
    and releases.release_kind = 'foundation'
    and releases.state = 'active'
    and revisions.identity_relation not in ('merged_into', 'split_from')
    and stable_registry_public_safe_label(revisions.canonical_name, 240) is not null;

  -- Canonical release name: it is always a first-class searchable name even
  -- when no current alias table row exists for the item.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(records.canonical_name),
    records.item_locale,
    records.canonical_name,
    'canonical',
    true
  from stable_registry_product_catalog_records as records
  where records.registry_release_id = target_release_id
  on conflict do nothing;

  -- Existing catalog names are already product-owned identity labels. Their
  -- text is passed through the same public-safe allowlist before projection.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(safe_name.value),
    names.locale,
    safe_name.value,
    case
      when names.is_primary then 'canonical'
      when names.locale in ('uk', 'bg', 'ru') then 'localized'
      else 'accepted_alias'
    end,
    names.is_primary
  from stable_registry_product_catalog_records as records
  join catalog_item_names as names
    on names.catalog_item_id = records.catalog_item_id
  cross join lateral (
    select stable_registry_public_safe_label(names.display_name, 240) as value
  ) as safe_name
  where records.registry_release_id = target_release_id
    and safe_name.value is not null
  on conflict do nothing;

  -- Only accepted aliases are product-searchable. Their source provenance is
  -- deliberately reduced to a bounded name class rather than exposing source
  -- references or raw evidence in the picker or search document.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(safe_alias.value),
    aliases.locale,
    safe_alias.value,
    case
      when aliases.alias_kind = 'accepted_scientific_name' then 'scientific'
      else 'accepted_alias'
    end,
    false
  from stable_registry_product_catalog_records as records
  join catalog_alias_projections as aliases
    on aliases.catalog_item_id = records.catalog_item_id
   and aliases.status = 'accepted'
  cross join lateral (
    select stable_registry_public_safe_label(aliases.display_name, 240) as value
  ) as safe_alias
  where records.registry_release_id = target_release_id
    and safe_alias.value is not null
  on conflict do nothing;

  -- A scientific-class row is always present so a Latin query is treated as a
  -- first-class identity input. If an accepted scientific alias exists above,
  -- it wins; otherwise the immutable canonical release name is the safe
  -- fallback label rather than a fabricated source value.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(records.canonical_name),
    'la',
    records.canonical_name,
    'scientific',
    false
  from stable_registry_product_catalog_records as records
  where records.registry_release_id = target_release_id
    and not exists (
      select 1
      from stable_registry_product_catalog_names as names
      where names.registry_release_id = records.registry_release_id
        and names.catalog_item_id = records.catalog_item_id
        and names.name_class = 'scientific'
    )
  on conflict do nothing;

  insert into stable_registry_product_projection_outbox (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    desired_state,
    state
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.catalog_item_revision_id,
    'present',
    'pending'
  from stable_registry_product_catalog_records as records
  where records.registry_release_id = target_release_id
  on conflict (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id
  ) do update
  set
    state = case
      when stable_registry_product_projection_outbox.state = 'processing'
        then 'processing'
      else 'pending'
    end,
    attempts = case
      when stable_registry_product_projection_outbox.state = 'processing'
        then stable_registry_product_projection_outbox.attempts
      else 0
    end,
    last_error_class = null,
    done_at = case
      when stable_registry_product_projection_outbox.state = 'processing'
        then stable_registry_product_projection_outbox.done_at
      else null
    end,
    updated_at = now();
end;
$$;

-- Replace the OVE-256 public materializer only to use the same deterministic
-- fallback slug. All its existing safe-label and source-separation rules stay
-- intact; this does not make a source record a product identity.
create or replace function materialize_stable_registry_public_catalog_release(
  target_release_id uuid
)
returns void
language plpgsql
as $$
begin
  insert into stable_registry_public_catalog_records (
    registry_release_id,
    catalog_item_id,
    stable_taxon,
    object_kind,
    canonical_name,
    scientific_name,
    taxonomic_rank,
    parent_display_name,
    search_normalized,
    safe_aliases,
    activated_at
  )
  with release_members as (
    select
      releases.id as registry_release_id,
      releases.activated_at,
      items.id as catalog_item_id,
      stable_registry_product_public_slug(items.id, items.public_slug) as stable_taxon,
      revisions.catalog_kind,
      revisions.canonical_name,
      revisions.normalized_name
    from catalog_registry_releases as releases
    join catalog_registry_release_members as members
      on members.release_id = releases.id
     and members.eligibility = 'product_eligible'
    join catalog_item_revisions as revisions
      on revisions.id = members.catalog_item_revision_id
    join catalog_items as items
      on items.id = members.catalog_item_id
    where releases.id = target_release_id
      and releases.state = 'active'
      and revisions.identity_relation not in ('merged_into', 'split_from')
  ), safe_members as (
    select
      members.*,
      stable_registry_public_safe_label(members.canonical_name, 240) as safe_canonical_name,
      coalesce(
        (
          select stable_registry_public_safe_label(aliases.display_name, 240)
          from catalog_alias_projections as aliases
          where aliases.catalog_item_id = members.catalog_item_id
            and aliases.status = 'accepted'
            and aliases.alias_kind = 'accepted_scientific_name'
          order by aliases.reviewed_at desc nulls last, aliases.display_name asc
          limit 1
        ),
        stable_registry_public_safe_label(members.canonical_name, 240)
      ) as safe_scientific_name
    from release_members as members
  )
  select
    members.registry_release_id,
    members.catalog_item_id,
    members.stable_taxon,
    case when members.catalog_kind = 'breed' then 'animal' else 'plant' end,
    members.safe_canonical_name,
    members.safe_scientific_name,
    case members.catalog_kind
      when 'species' then 'species'
      when 'breed' then 'breed'
      else 'variety'
    end,
    null,
    lower(members.safe_canonical_name),
    coalesce(
      array(
        select distinct alias_value
        from (
          select stable_registry_public_safe_label(names.display_name, 240) as alias_value
          from catalog_item_names as names
          where names.catalog_item_id = members.catalog_item_id
          union
          select stable_registry_public_safe_label(aliases.display_name, 240) as alias_value
          from catalog_alias_projections as aliases
          where aliases.catalog_item_id = members.catalog_item_id
            and aliases.status = 'accepted'
        ) as aliases
        where alias_value is not null
          and alias_value <> members.safe_canonical_name
        order by alias_value
      ),
      '{}'::text[]
    ),
    members.activated_at
  from safe_members as members
  where members.safe_canonical_name is not null
    and members.safe_scientific_name is not null
  on conflict (registry_release_id, stable_taxon) do update
  set
    catalog_item_id = excluded.catalog_item_id,
    object_kind = excluded.object_kind,
    canonical_name = excluded.canonical_name,
    scientific_name = excluded.scientific_name,
    taxonomic_rank = excluded.taxonomic_rank,
    parent_display_name = excluded.parent_display_name,
    search_normalized = excluded.search_normalized,
    safe_aliases = excluded.safe_aliases,
    activated_at = excluded.activated_at;

  delete from stable_registry_public_catalog_search_terms
  where registry_release_id = target_release_id;

  insert into stable_registry_public_catalog_search_terms (
    registry_release_id,
    stable_taxon,
    object_kind,
    normalized_term
  )
  select
    records.registry_release_id,
    records.stable_taxon,
    records.object_kind,
    lower(trim(terms.value))
  from stable_registry_public_catalog_records as records
  cross join lateral unnest(
    array_prepend(
      records.scientific_name,
      array_prepend(records.canonical_name, records.safe_aliases)
    )
  ) as terms(value)
  where records.registry_release_id = target_release_id
    and char_length(trim(terms.value)) between 1 and 240
  on conflict do nothing;
end;
$$;

create or replace function materialize_stable_registry_product_projection()
returns trigger
language plpgsql
as $$
begin
  if new.state = 'active' and old.state is distinct from 'active' then
    perform materialize_stable_registry_product_release(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_registry_product_projection_materialize
  on catalog_registry_releases;
create trigger catalog_registry_product_projection_materialize
after update of state on catalog_registry_releases
for each row execute function materialize_stable_registry_product_projection();

-- Additive one-time projection of any already-active Foundation release. This
-- neither mutates releases/memberships nor touches capture evidence.
select materialize_stable_registry_product_release(id)
from catalog_registry_releases
where release_kind = 'foundation'
  and state = 'active';

select materialize_stable_registry_public_catalog_release(id)
from catalog_registry_releases
where release_kind = 'foundation'
  and state = 'active';

-- ======================================================================
-- from 0027_ove328_stable_registry_extension_packs.sql (whole file)
-- ======================================================================

-- OVE-328 — plant-variety and animal-breed extension packs.
--
-- A pack is an immutable, source-identified batch of OVE-327 artifact rows. It
-- reuses the OVE-255 release, exception, decision, and activation tables rather
-- than creating a second release model, and it reuses the OVE-257 product
-- projection rather than creating a second picker or search owner.
--
-- Nothing here promotes a source row by itself: parent binding, name truth,
-- rights, and one explicit owner approval remain independent gates.

create table if not exists catalog_registry_extension_packs (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (char_length(source_slug) between 1 and 120),
  declared_source_version text not null
    check (char_length(declared_source_version) between 1 and 120),
  adapter_version text not null
    check (char_length(adapter_version) between 1 and 120),
  artifact_schema_version text not null
    check (char_length(artifact_schema_version) between 1 and 120),
  -- Pack identity is the source artifact, not a run. Re-importing the same
  -- bytes returns the same pack; changed bytes open a new one and can never
  -- mutate the old.
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  artifact_byte_digest text not null
    check (artifact_byte_digest ~ '^[a-f0-9]{64}$'),
  pack_kind text not null check (pack_kind in ('plant_variety', 'breed')),
  source_rights text not null check (
    source_rights in (
      'use',
      'use_with_conditions',
      'internal_validation_only',
      'declared_in_source'
    )
  ),
  state text not null default 'draft' check (
    state in (
      'draft',
      'parsing',
      'classified',
      'review_ready',
      'approved',
      'active',
      'retired',
      'failed',
      'abandoned'
    )
  ),
  release_id uuid references catalog_registry_releases(id) on delete restrict,
  preview_digest text
    check (preview_digest is null or preview_digest ~ '^[a-f0-9]{64}$'),
  safe_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_summary) = 'object'),
  created_by_user_id uuid not null,
  approved_by_user_id uuid,
  activated_by_user_id uuid,
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_slug, declared_source_version, artifact_digest),
  constraint catalog_registry_extension_packs_approval_shape_check check (
    (state in ('approved', 'active', 'retired'))
      = (preview_digest is not null and approved_at is not null)
  ),
  constraint catalog_registry_extension_packs_activation_shape_check check (
    state <> 'active'
      or (release_id is not null and activated_at is not null)
  )
);

create index if not exists catalog_registry_extension_packs_state_idx
  on catalog_registry_extension_packs (state, created_at desc);

create table if not exists catalog_registry_extension_pack_rows (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null
    references catalog_registry_extension_packs(id) on delete restrict,
  source_record_key text not null
    check (char_length(source_record_key) between 1 and 240),
  official_denomination text not null
    check (char_length(official_denomination) between 1 and 240),
  normalized_denomination text not null
    check (char_length(normalized_denomination) between 1 and 240),
  locale text not null check (char_length(locale) between 1 and 20),
  public_slug text
    check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  -- The proposed parent from the artifact, and the bound one once an owner or
  -- a deterministic rule resolves it. Binding is never inferred at read time.
  parent_scientific_name text
    check (parent_scientific_name is null
      or char_length(parent_scientific_name) between 1 and 240),
  parent_evidence_class text not null check (
    parent_evidence_class in (
      'declared_by_source',
      'derived_from_source_record',
      'absent'
    )
  ),
  parent_catalog_item_id uuid references catalog_items(id) on delete restrict,
  row_class text not null check (
    row_class in (
      'clean',
      'needs_parent',
      'collision',
      'duplicate',
      'rights_blocked',
      'review_needed',
      'rejected',
      'product_eligible'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, source_record_key),
  -- INV-02: a variety or breed is product eligible only with a bound parent.
  constraint catalog_registry_extension_pack_rows_parent_shape_check check (
    row_class <> 'product_eligible' or parent_catalog_item_id is not null
  )
);

-- One official denomination per parent, locale, and pack. A second row claiming
-- the same triple is a collision the owner resolves, not a silent second row.
create unique index if not exists catalog_registry_extension_pack_rows_candidate_uidx
  on catalog_registry_extension_pack_rows (
    pack_id,
    parent_catalog_item_id,
    locale,
    normalized_denomination
  )
  where parent_catalog_item_id is not null
    and row_class in ('clean', 'product_eligible');

create index if not exists catalog_registry_extension_pack_rows_class_idx
  on catalog_registry_extension_pack_rows (pack_id, row_class);

create table if not exists catalog_registry_extension_pack_names (
  pack_row_id uuid not null
    references catalog_registry_extension_pack_rows(id) on delete cascade,
  name_class text not null check (
    name_class in (
      'official_denomination',
      'transliteration',
      'local_name',
      'trade_name',
      'generated',
      'user_added'
    )
  ),
  locale text not null check (char_length(locale) between 1 and 20),
  display_name text not null check (char_length(display_name) between 1 and 240),
  normalized_name text not null
    check (char_length(normalized_name) between 1 and 240),
  created_at timestamptz not null default now(),
  -- `name_class` is part of the key for the same reason as the OVE-257
  -- projection: one spelling can legitimately be both the official
  -- denomination and a transliteration, and keying without the class would
  -- silently drop the second row.
  primary key (pack_row_id, name_class, locale, normalized_name)
);

create index if not exists catalog_registry_extension_pack_names_lookup_idx
  on catalog_registry_extension_pack_names (
    pack_row_id,
    name_class,
    normalized_name
  );

-- A user-added name is a candidate, never an automatic publication. It carries
-- its own closed decision state so an owner can group and defer it.
create table if not exists catalog_registry_extension_pack_user_names (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null
    references catalog_registry_extension_packs(id) on delete restrict,
  pack_row_id uuid
    references catalog_registry_extension_pack_rows(id) on delete restrict,
  normalized_name text not null
    check (char_length(normalized_name) between 1 and 240),
  locale text not null check (char_length(locale) between 1 and 20),
  state text not null default 'provisional' check (
    state in (
      'provisional',
      'grouped',
      'alias_approved',
      'new_item_approved',
      'deferred',
      'rejected'
    )
  ),
  expected_version integer not null default 1 check (expected_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, locale, normalized_name)
);

-- Immutability: an approved pack, its rows, and its names are evidence. Only
-- the pack's own lifecycle columns may advance, and only forward.
create or replace function enforce_catalog_registry_extension_pack_transition()
returns trigger
language plpgsql
as $$
declare
  ordered_states constant text[] := array[
    'draft', 'parsing', 'classified', 'review_ready', 'approved', 'active', 'retired'
  ];
  old_rank integer;
  new_rank integer;
begin
  -- A user may exercise erasure without rewriting a pack's identity, state,
  -- digests, or timestamps. This narrow exception is enabled transaction-locally
  -- by the erasure executor and only replaces actor fields with the one
  -- non-human tombstone identity.
  if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
    and new.id is not distinct from old.id
    and new.source_slug is not distinct from old.source_slug
    and new.declared_source_version is not distinct from old.declared_source_version
    and new.artifact_digest is not distinct from old.artifact_digest
    and new.artifact_byte_digest is not distinct from old.artifact_byte_digest
    and new.pack_kind is not distinct from old.pack_kind
    and new.state is not distinct from old.state
    and new.preview_digest is not distinct from old.preview_digest
    and new.approved_at is not distinct from old.approved_at
    and new.activated_at is not distinct from old.activated_at
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.source_slug is distinct from old.source_slug
    or new.declared_source_version is distinct from old.declared_source_version
    or new.artifact_digest is distinct from old.artifact_digest
    or new.artifact_byte_digest is distinct from old.artifact_byte_digest
    or new.pack_kind is distinct from old.pack_kind
    or new.created_at is distinct from old.created_at then
    raise exception 'extension pack identity is immutable'
      using errcode = '55000';
  end if;

  if old.preview_digest is not null
    and new.preview_digest is distinct from old.preview_digest then
    raise exception 'approved extension pack preview digest is immutable'
      using errcode = '55000';
  end if;

  if old.approved_at is not null
    and new.approved_at is distinct from old.approved_at then
    raise exception 'extension pack approval receipt is immutable'
      using errcode = '55000';
  end if;

  if new.state is distinct from old.state then
    if new.state in ('failed', 'abandoned') then
      return new;
    end if;
    old_rank := array_position(ordered_states, old.state);
    new_rank := array_position(ordered_states, new.state);
    if old_rank is null or new_rank is null or new_rank <= old_rank then
      raise exception 'extension pack state may only advance'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_registry_extension_packs_transition
  on catalog_registry_extension_packs;
create trigger catalog_registry_extension_packs_transition
before update on catalog_registry_extension_packs
for each row execute function enforce_catalog_registry_extension_pack_transition();

create or replace function prevent_approved_extension_pack_row_mutation()
returns trigger
language plpgsql
as $$
declare
  pack_state text;
begin
  select state into pack_state
  from catalog_registry_extension_packs
  where id = coalesce(new.pack_id, old.pack_id);

  if pack_state in ('approved', 'active', 'retired') then
    raise exception 'approved extension pack rows are immutable'
      using errcode = '55000';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists catalog_registry_extension_pack_rows_immutable
  on catalog_registry_extension_pack_rows;
create trigger catalog_registry_extension_pack_rows_immutable
before update or delete on catalog_registry_extension_pack_rows
for each row execute function prevent_approved_extension_pack_row_mutation();

-- The worker receives only the opaque pack UUID. Source rows and artifacts are
-- read through the scoped repository, never through a queue payload.
alter table job_queue
  drop constraint if exists job_queue_stable_registry_extension_pack_build_payload_check;

alter table job_queue
  add constraint job_queue_stable_registry_extension_pack_build_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'stable_registry_extension_pack_build'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload ? 'packId'
      and payload - array['kind', 'packId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'stable_registry_extension_pack_build'
      and jsonb_typeof(payload->'packId') = 'string'
      and payload->>'packId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;

/*
 * Activating an extension pack reuses the OVE-257 product projection.
 *
 * A pack row becomes a product identity only when it is `product_eligible`,
 * its parent is an active product-projection member, and its own pack is
 * active. The projection rows it contributes carry the parent's object-kind
 * scope, so a variety of a plant species stays a plant and a breed stays an
 * animal without a second kind rule.
 */
create or replace function materialize_stable_registry_extension_pack(
  target_pack_id uuid
)
returns void
language plpgsql
as $$
declare
  target_release_id uuid;
begin
  select release_id into target_release_id
  from catalog_registry_extension_packs
  where id = target_pack_id
    and state = 'active';

  if target_release_id is null then
    return;
  end if;

  insert into stable_registry_product_catalog_records (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    object_kind_scope,
    catalog_kind,
    canonical_name,
    item_locale,
    public_slug,
    activated_at
  )
  select
    target_release_id,
    members.catalog_item_id,
    members.catalog_item_revision_id,
    parents.object_kind_scope,
    revisions.catalog_kind,
    stable_registry_public_safe_label(revisions.canonical_name, 240),
    items.locale,
    stable_registry_product_public_slug(items.id, items.public_slug),
    releases.activated_at
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_registry_extension_packs as packs
    on packs.id = pack_rows.pack_id
  join catalog_registry_release_members as members
    on members.release_id = packs.release_id
   and members.catalog_item_id = pack_rows.parent_catalog_item_id
  join catalog_item_revisions as revisions
    on revisions.id = members.catalog_item_revision_id
  join catalog_items as items
    on items.id = members.catalog_item_id
  join catalog_registry_releases as releases
    on releases.id = packs.release_id
  join stable_registry_product_catalog_records as parents
    on parents.catalog_item_id = pack_rows.parent_catalog_item_id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and stable_registry_public_safe_label(revisions.canonical_name, 240) is not null
  on conflict (registry_release_id, catalog_item_id) do nothing;
end;
$$;

-- ======================================================================
-- from 0028_ove258_stable_registry_editions.sql (whole file)
-- ======================================================================

-- OVE-258 — later editions, corrections, supersessions, and rollback.
--
-- An edition is a new immutable release compared against the active one. This
-- migration adds only what a comparison needs: grouped diffs, explicit identity
-- relations, an affected-object impact snapshot, and an append-only activation
-- sequence that makes rollback a new receipt rather than a rewrite.
--
-- Nothing here rewrites history. Release membership, item revisions, decisions,
-- and activation receipts remain append-only under the OVE-255 guards, and no
-- garden object is ever reassigned to a different catalog identity.

create table if not exists catalog_registry_edition_diffs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null
    references catalog_registry_releases(id) on delete restrict,
  prior_release_id uuid
    references catalog_registry_releases(id) on delete restrict,
  diff_class text not null check (
    diff_class in (
      'unchanged',
      'addition',
      'alias',
      'correction',
      'supersession',
      'split',
      'rights_change'
    )
  ),
  group_key text not null check (group_key ~ '^[a-f0-9]{64}$'),
  member_count integer not null check (member_count > 0),
  -- How many existing garden objects reference an identity in this group. The
  -- owner sees this before approving, and a changed count invalidates the
  -- preview rather than silently widening the blast radius.
  affected_object_count integer not null default 0
    check (affected_object_count >= 0),
  affected_object_digest text not null
    check (affected_object_digest ~ '^[a-f0-9]{64}$'),
  state text not null default 'open'
    check (state in ('open', 'decided', 'deferred', 'blocked')),
  safe_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_summary) = 'object'),
  expected_version integer not null default 1 check (expected_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, group_key)
);

create index if not exists catalog_registry_edition_diffs_release_state_idx
  on catalog_registry_edition_diffs (release_id, state, diff_class);

-- `merged_into_catalog_item_id` on `catalog_items` can express only one
-- relation and cannot say which release decided it. These rows are the
-- versioned, append-only replacement; the legacy column stays readable as
-- compatibility evidence and is never rewritten by an edition.
create table if not exists catalog_registry_item_relations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null
    references catalog_registry_releases(id) on delete restrict,
  from_catalog_item_id uuid not null
    references catalog_items(id) on delete restrict,
  to_catalog_item_id uuid references catalog_items(id) on delete restrict,
  relation_kind text not null check (
    relation_kind in (
      'same_concept',
      'equivalent_to',
      'replaced_by',
      'split_into'
    )
  ),
  relation_digest text not null check (relation_digest ~ '^[a-f0-9]{64}$'),
  decided_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (release_id, from_catalog_item_id, relation_kind, to_catalog_item_id),
  -- A relation that points at nothing is only meaningful for a supersession
  -- with no successor yet; every other kind needs both endpoints.
  constraint catalog_registry_item_relations_target_shape_check check (
    to_catalog_item_id is not null or relation_kind = 'replaced_by'
  ),
  constraint catalog_registry_item_relations_distinct_check check (
    to_catalog_item_id is null
      or to_catalog_item_id <> from_catalog_item_id
  )
);

create index if not exists catalog_registry_item_relations_from_idx
  on catalog_registry_item_relations (from_catalog_item_id, relation_kind);

create index if not exists catalog_registry_item_relations_release_idx
  on catalog_registry_item_relations (release_id, relation_kind);

-- Every pointer movement, forward or backward, appends one row. Rollback is a
-- new receipt naming the prior immutable release, never a deletion or an edit
-- of the activation it reverses.
create table if not exists catalog_registry_activation_sequence (
  id uuid primary key default gen_random_uuid(),
  sequence_number integer not null check (sequence_number >= 1),
  release_family text not null
    check (release_family in ('foundation', 'edition', 'extension')),
  release_id uuid not null
    references catalog_registry_releases(id) on delete restrict,
  prior_release_id uuid
    references catalog_registry_releases(id) on delete restrict,
  transition text not null
    check (transition in ('activate', 'rollback', 'forward')),
  state text not null default 'prepared'
    check (state in ('prepared', 'applied', 'verified', 'rolled_back', 'failed')),
  preview_digest text not null check (preview_digest ~ '^[a-f0-9]{64}$'),
  receipt_digest text not null check (receipt_digest ~ '^[a-f0-9]{64}$'),
  affected_object_count integer not null default 0
    check (affected_object_count >= 0),
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (release_family, sequence_number),
  unique (receipt_digest)
);

create index if not exists catalog_registry_activation_sequence_family_idx
  on catalog_registry_activation_sequence (
    release_family,
    sequence_number desc
  );

create or replace function prevent_catalog_registry_item_relation_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Account erasure may replace only the actor attribution with the one
  -- non-human tombstone identity; the relation itself stays byte-identical.
  if tg_op = 'UPDATE' then
    if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
      and new.id is not distinct from old.id
      and new.release_id is not distinct from old.release_id
      and new.from_catalog_item_id is not distinct from old.from_catalog_item_id
      and new.to_catalog_item_id is not distinct from old.to_catalog_item_id
      and new.relation_kind is not distinct from old.relation_kind
      and new.relation_digest is not distinct from old.relation_digest
      and new.created_at is not distinct from old.created_at
      and new.decided_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
      and new.decided_by_user_id is distinct from old.decided_by_user_id then
      return new;
    end if;
  end if;

  raise exception 'registry item relations are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_registry_item_relations_append_only
  on catalog_registry_item_relations;
create trigger catalog_registry_item_relations_append_only
before update or delete on catalog_registry_item_relations
for each row execute function prevent_catalog_registry_item_relation_mutation();

create or replace function prevent_catalog_registry_activation_sequence_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- The only permitted forward edit is the verification outcome of a receipt
    -- that has not yet reached a terminal state, plus erasure actor rekeying.
    if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
      and new.id is not distinct from old.id
      and new.receipt_digest is not distinct from old.receipt_digest
      and new.state is not distinct from old.state
      and new.actor_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
      and new.actor_user_id is distinct from old.actor_user_id then
      return new;
    end if;

    if old.state in ('prepared', 'applied')
      and new.state in ('applied', 'verified', 'rolled_back', 'failed')
      and new.id is not distinct from old.id
      and new.sequence_number is not distinct from old.sequence_number
      and new.release_family is not distinct from old.release_family
      and new.release_id is not distinct from old.release_id
      and new.prior_release_id is not distinct from old.prior_release_id
      and new.transition is not distinct from old.transition
      and new.preview_digest is not distinct from old.preview_digest
      and new.receipt_digest is not distinct from old.receipt_digest
      and new.actor_user_id is not distinct from old.actor_user_id
      and new.created_at is not distinct from old.created_at then
      return new;
    end if;
  end if;

  raise exception 'registry activation receipts are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists catalog_registry_activation_sequence_append_only
  on catalog_registry_activation_sequence;
create trigger catalog_registry_activation_sequence_append_only
before update or delete on catalog_registry_activation_sequence
for each row execute function prevent_catalog_registry_activation_sequence_mutation();

create or replace function prevent_approved_edition_diff_mutation()
returns trigger
language plpgsql
as $$
declare
  release_state text;
begin
  select state into release_state
  from catalog_registry_releases
  where id = coalesce(new.release_id, old.release_id);

  if release_state in ('approved', 'active', 'retired') then
    raise exception 'approved edition diff groups are immutable'
      using errcode = '55000';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists catalog_registry_edition_diffs_immutable
  on catalog_registry_edition_diffs;
create trigger catalog_registry_edition_diffs_immutable
before update or delete on catalog_registry_edition_diffs
for each row execute function prevent_approved_edition_diff_mutation();

/*
 * The affected-object impact snapshot.
 *
 * It counts existing garden objects that reference an identity in the group.
 * The count is aggregate: no object id, owner id, or journal content is stored,
 * and the digest is over the sorted catalog identities, not over user rows.
 */
create or replace function stable_registry_edition_affected_objects(
  catalog_item_ids uuid[]
)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from plant_objects
  where plant_objects.catalog_item_id = any(catalog_item_ids);
$$;

-- Compatibility: derive one historical relation for each existing merged row so
-- an edition reads a complete relation graph. This reassigns no garden object
-- and changes no existing OverGarden UUID.
insert into catalog_registry_item_relations (
  release_id,
  from_catalog_item_id,
  to_catalog_item_id,
  relation_kind,
  relation_digest,
  decided_by_user_id
)
select
  pointers.active_release_id,
  items.id,
  items.merged_into_catalog_item_id,
  'same_concept',
  encode(
    digest(
      convert_to(
        concat_ws(
          '|',
          items.id::text,
          items.merged_into_catalog_item_id::text,
          'same_concept'
        ),
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  ),
  '00000000-0000-4000-8000-00000000ead1'::uuid
from catalog_items as items
join catalog_registry_active_pointers as pointers
  on pointers.release_family = 'foundation'
 and pointers.active_release_id is not null
where items.merged_into_catalog_item_id is not null
  and items.merged_into_catalog_item_id <> items.id
on conflict do nothing;

/*
 * Rollback needs one transition the OVE-255 guard deliberately withholds.
 *
 * `retired -> active` is otherwise forbidden, and for good reason: nothing may
 * silently resurrect a superseded release. But a rollback must genuinely
 * re-activate the prior release, because every product read — the OVE-257
 * projection included — filters on `state = 'active'`. Leaving the pointer on a
 * `retired` row would empty the picker instead of restoring it.
 *
 * The transition is therefore admitted only while the transaction-local
 * `overgarden.registry_rollback` guard is on, which the edition repository
 * enables solely for a receipted rollback or forward move.
 */
create or replace function enforce_catalog_registry_release_rollback_transition()
returns trigger
language plpgsql
as $$
begin
  -- The one admitted exception, checked before the inherited guard runs.
  if current_setting('overgarden.registry_rollback', true) = 'on'
    and old.state = 'retired'
    and new.state = 'active'
    and new.id is not distinct from old.id
    and new.release_kind is not distinct from old.release_kind
    and new.capture_id is not distinct from old.capture_id
    and new.source_snapshot_id is not distinct from old.source_snapshot_id
    and new.build_digest is not distinct from old.build_digest
    and new.preview_digest is not distinct from old.preview_digest
    and new.approved_at is not distinct from old.approved_at
    and new.approved_by_user_id is not distinct from old.approved_by_user_id
    and new.activated_at is not distinct from old.activated_at
    and new.activated_by_user_id is not distinct from old.activated_by_user_id
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- A user may exercise erasure without rewriting a release's stable identity,
  -- state, digests, timestamps, or membership. This narrow exception is only
  -- enabled transaction-locally by the erasure executor and replaces changed
  -- actor fields with the non-human tombstone identity.
  if current_setting('overgarden.registry_actor_erasure_rekey', true) = 'on'
    and new.id is not distinct from old.id
    and new.release_kind is not distinct from old.release_kind
    and new.state is not distinct from old.state
    and new.capture_id is not distinct from old.capture_id
    and new.source_snapshot_id is not distinct from old.source_snapshot_id
    and new.predecessor_release_id is not distinct from old.predecessor_release_id
    and new.policy_version is not distinct from old.policy_version
    and new.build_digest is not distinct from old.build_digest
    and new.preview_digest is not distinct from old.preview_digest
    and new.safe_summary is not distinct from old.safe_summary
    and new.build_started_at is not distinct from old.build_started_at
    and new.review_ready_at is not distinct from old.review_ready_at
    and new.approved_at is not distinct from old.approved_at
    and new.activated_at is not distinct from old.activated_at
    and new.retired_at is not distinct from old.retired_at
    and new.version is not distinct from old.version
    and new.created_at is not distinct from old.created_at
    and new.updated_at is not distinct from old.updated_at
    and (
      new.created_by_user_id is not distinct from old.created_by_user_id
      or new.created_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.approved_by_user_id is not distinct from old.approved_by_user_id
      or new.approved_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.activated_by_user_id is not distinct from old.activated_by_user_id
      or new.activated_by_user_id = '00000000-0000-4000-8000-00000000ead1'::uuid
    )
    and (
      new.created_by_user_id is distinct from old.created_by_user_id
      or new.approved_by_user_id is distinct from old.approved_by_user_id
      or new.activated_by_user_id is distinct from old.activated_by_user_id
    ) then
    return new;
  end if;

  if new.release_kind is distinct from old.release_kind
    or new.capture_id is distinct from old.capture_id
    or new.source_snapshot_id is distinct from old.source_snapshot_id
    or new.predecessor_release_id is distinct from old.predecessor_release_id
    or new.policy_version is distinct from old.policy_version
    or new.build_digest is distinct from old.build_digest
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'registry release identity is immutable'
      using errcode = '55000';
  end if;

  if new.state <> old.state and not (
    (old.state = 'draft' and new.state in ('building', 'failed', 'abandoned'))
    or (old.state = 'building' and new.state in ('review_ready', 'failed', 'abandoned'))
    or (old.state = 'review_ready' and new.state in ('approved', 'failed', 'abandoned'))
    or (old.state = 'approved' and new.state in ('active', 'failed'))
    or (old.state = 'active' and new.state = 'retired')
  ) then
    raise exception 'invalid registry release transition: % -> %', old.state, new.state
      using errcode = '55000';
  end if;

  if old.state in ('retired', 'failed', 'abandoned') and new is distinct from old then
    raise exception 'terminal registry releases are immutable'
      using errcode = '55000';
  end if;

  if old.state in ('approved', 'active', 'retired')
    and new.safe_summary is distinct from old.safe_summary then
    raise exception 'approved release summary is immutable'
      using errcode = '55000';
  end if;

  if old.build_started_at is not null
    and new.build_started_at is distinct from old.build_started_at then
    raise exception 'registry release build start is immutable'
      using errcode = '55000';
  end if;

  if old.review_ready_at is not null
    and new.review_ready_at is distinct from old.review_ready_at then
    raise exception 'registry release review receipt is immutable'
      using errcode = '55000';
  end if;

  if old.preview_digest is not null
    and new.preview_digest is distinct from old.preview_digest then
    raise exception 'approved registry preview digest is immutable'
      using errcode = '55000';
  end if;

  if old.approved_by_user_id is not null
    and new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'registry release approver is immutable'
      using errcode = '55000';
  end if;

  if old.approved_at is not null
    and new.approved_at is distinct from old.approved_at then
    raise exception 'registry release approval receipt is immutable'
      using errcode = '55000';
  end if;

  if old.activated_by_user_id is not null
    and new.activated_by_user_id is distinct from old.activated_by_user_id then
    raise exception 'registry release activator is immutable'
      using errcode = '55000';
  end if;

  if old.activated_at is not null
    and new.activated_at is distinct from old.activated_at then
    raise exception 'registry release activation receipt is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_registry_releases_state_transition
  on catalog_registry_releases;
create trigger catalog_registry_releases_state_transition
before update on catalog_registry_releases
for each row execute function enforce_catalog_registry_release_rollback_transition();

-- ======================================================================
-- from 0040_ove256_public_catalog_object_kind_evidence.sql (whole file)
-- ======================================================================

-- OVE-256 correction — the public catalog explorer stops asserting a kingdom
-- it has never established.
--
-- `0025` projected `catalog_kind = 'breed' -> animal, everything else -> plant`.
-- `catalog_kind` is one of `plant_variety`, `species`, `breed`; a species in
-- this product is legitimately either a plant or an animal, and the observed
-- EPPO corpus contains both. So every approved animal species was published to
-- guests as a plant: it was returned under the `plant` filter and was missing
-- from the `animal` filter.
--
-- `0026` already established the three-valued vocabulary for exactly these
-- rows, and reads the same release members: `breed -> animal`,
-- `plant_variety -> plant`, `species -> either`. The two projections of one
-- release disagreed, and the public one was the wrong half. This migration
-- adopts the landed vocabulary so they agree.
--
-- The source-archive side is untouched. `stable_registry_public_eppo_records`
-- derives its kind from the observed `datatype` field, which is real evidence,
-- so it stays two-valued.

alter table stable_registry_public_catalog_records
  drop constraint if exists stable_registry_public_catalog_records_object_kind_check;

alter table stable_registry_public_catalog_records
  add constraint stable_registry_public_catalog_records_object_kind_check
  check (object_kind in ('plant', 'animal', 'either'));

alter table stable_registry_public_catalog_search_terms
  drop constraint if exists stable_registry_public_catalog_search_terms_object_kind_check;

alter table stable_registry_public_catalog_search_terms
  add constraint stable_registry_public_catalog_search_terms_object_kind_check
  check (object_kind in ('plant', 'animal', 'either'));

create or replace function materialize_stable_registry_public_catalog_release(
  target_release_id uuid
)
returns void
language plpgsql
as $$
begin
  -- The immutable release membership is the sole eligibility authority. A
  -- capture or a catalog item by itself can never enter this projection.
  insert into stable_registry_public_catalog_records (
    registry_release_id,
    catalog_item_id,
    stable_taxon,
    object_kind,
    canonical_name,
    scientific_name,
    taxonomic_rank,
    parent_display_name,
    search_normalized,
    safe_aliases,
    activated_at
  )
  with release_members as (
    select
      releases.id as registry_release_id,
      releases.activated_at,
      items.id as catalog_item_id,
      items.public_slug as stable_taxon,
      revisions.catalog_kind,
      revisions.canonical_name,
      revisions.normalized_name
    from catalog_registry_releases as releases
    join catalog_registry_release_members as members
      on members.release_id = releases.id
     and members.eligibility = 'product_eligible'
    join catalog_item_revisions as revisions
      on revisions.id = members.catalog_item_revision_id
    join catalog_items as items
      on items.id = members.catalog_item_id
    where releases.id = target_release_id
      and releases.state = 'active'
      and items.public_slug is not null
      and char_length(trim(items.public_slug)) > 0
  ), safe_members as (
    select
      members.*,
      stable_registry_public_safe_label(members.canonical_name, 240) as safe_canonical_name,
      coalesce(
        (
          select stable_registry_public_safe_label(aliases.display_name, 240)
          from catalog_alias_projections as aliases
          where aliases.catalog_item_id = members.catalog_item_id
            and aliases.status = 'accepted'
            and aliases.alias_kind = 'accepted_scientific_name'
          order by aliases.reviewed_at desc nulls last, aliases.display_name asc
          limit 1
        ),
        stable_registry_public_safe_label(members.canonical_name, 240)
      ) as safe_scientific_name
    from release_members as members
  )
  select
    members.registry_release_id,
    members.catalog_item_id,
    members.stable_taxon,
    case members.catalog_kind
      when 'breed' then 'animal'
      when 'plant_variety' then 'plant'
      else 'either'
    end,
    members.safe_canonical_name,
    members.safe_scientific_name,
    case members.catalog_kind
      when 'species' then 'species'
      when 'breed' then 'breed'
      else 'variety'
    end,
    null,
    lower(members.safe_canonical_name),
    coalesce(
      array(
        select distinct alias_value
        from (
          select stable_registry_public_safe_label(names.display_name, 240) as alias_value
          from catalog_item_names as names
          where names.catalog_item_id = members.catalog_item_id
          union
          select stable_registry_public_safe_label(aliases.display_name, 240) as alias_value
          from catalog_alias_projections as aliases
          where aliases.catalog_item_id = members.catalog_item_id
            and aliases.status = 'accepted'
        ) as aliases
        where alias_value is not null
          and alias_value <> members.safe_canonical_name
        order by alias_value
      ),
      '{}'::text[]
    ),
    members.activated_at
  from safe_members as members
  where members.safe_canonical_name is not null
    and members.safe_scientific_name is not null
  on conflict (registry_release_id, stable_taxon) do update
  set
    catalog_item_id = excluded.catalog_item_id,
    object_kind = excluded.object_kind,
    canonical_name = excluded.canonical_name,
    scientific_name = excluded.scientific_name,
    taxonomic_rank = excluded.taxonomic_rank,
    parent_display_name = excluded.parent_display_name,
    search_normalized = excluded.search_normalized,
    safe_aliases = excluded.safe_aliases,
    activated_at = excluded.activated_at;

  delete from stable_registry_public_catalog_search_terms
  where registry_release_id = target_release_id;

  insert into stable_registry_public_catalog_search_terms (
    registry_release_id,
    stable_taxon,
    object_kind,
    normalized_term
  )
  select
    records.registry_release_id,
    records.stable_taxon,
    records.object_kind,
    lower(trim(terms.value))
  from stable_registry_public_catalog_records as records
  cross join lateral unnest(
    array_prepend(
      records.scientific_name,
      array_prepend(records.canonical_name, records.safe_aliases)
    )
  ) as terms(value)
  where records.registry_release_id = target_release_id
    and char_length(trim(terms.value)) between 1 and 240
  on conflict do nothing;
end;
$$;

-- Existing active releases were materialized under the guess. Re-projecting is
-- derived-only: it rewrites no release member, revision, decision, activation,
-- or product identity.
select materialize_stable_registry_public_catalog_release(id)
from catalog_registry_releases
where state = 'active';

-- ======================================================================
-- from 0041_ove328_extension_pack_product_projection.sql (whole file)
-- ======================================================================

-- OVE-328 correction — activating an extension pack actually publishes it.
--
-- `0027`'s `materialize_stable_registry_extension_pack` joined each pack row to
-- its *parent* release member and then inserted that parent into the product
-- projection. The parent is already projected — that is why the join could
-- succeed at all — so every candidate row hit `on conflict do nothing` and the
-- function was a guaranteed no-op. It also never wrote
-- `stable_registry_product_catalog_names`, so no denomination ever became
-- searchable. Activating a variety or breed pack published nothing at all.
--
-- A variety and a breed are their own selectable catalog identities: a gardener
-- records that they planted `San Marzano`, not merely `Solanum lycopersicum`.
-- Activation therefore appends one identity per product-eligible row.
--
-- Appending is legitimate here. Release membership is append-only rather than
-- frozen — `catalog_registry_release_members_append_only` fires on update and
-- delete, never on insert — and extending an active Foundation is exactly what
-- a pack is for. Nothing existing is rewritten: the parent's own member row,
-- revision, projection record, and names are untouched.

-- A denomination that cannot become a catalog identity must never be classified
-- publishable. `official_denomination` allows 240 characters while
-- `catalog_items.canonical_name` allows 120, so without this a long
-- denomination would be approved by an owner and then silently vanish at
-- activation — the same class of failure this migration exists to remove. An
-- over-long denomination now stays an exception the owner can see.
alter table catalog_registry_extension_pack_rows
  drop constraint if exists catalog_registry_extension_pack_rows_publishable_check;

alter table catalog_registry_extension_pack_rows
  add constraint catalog_registry_extension_pack_rows_publishable_check
  check (
    row_class <> 'product_eligible'
    or (
      char_length(official_denomination) between 1 and 120
      and char_length(normalized_denomination) between 1 and 120
    )
  );

create or replace function materialize_stable_registry_extension_pack(
  target_pack_id uuid
)
returns void
language plpgsql
as $$
declare
  target_release_id uuid;
  pack_kind_value text;
  pack_source_slug text;
  activated_at_value timestamptz;
begin
  select packs.release_id, packs.pack_kind, packs.source_slug
    into target_release_id, pack_kind_value, pack_source_slug
  from catalog_registry_extension_packs as packs
  where packs.id = target_pack_id
    and packs.state = 'active';

  if target_release_id is null then
    return;
  end if;

  select releases.activated_at into activated_at_value
  from catalog_registry_releases as releases
  where releases.id = target_release_id
    and releases.state = 'active';

  if activated_at_value is null then
    return;
  end if;

  -- One catalog identity per product-eligible row. `source_id` carries the pack
  -- row id, so re-running activation is idempotent without a second identity.
  insert into catalog_items (
    canonical_name,
    normalized_name,
    catalog_kind,
    public_slug,
    status,
    source,
    source_id,
    locale
  )
  select
    pack_rows.official_denomination,
    pack_rows.normalized_denomination,
    pack_kind_value,
    pack_rows.public_slug,
    'confirmed',
    pack_source_slug,
    pack_rows.id::text,
    pack_rows.locale
  from catalog_registry_extension_pack_rows as pack_rows
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and pack_rows.parent_catalog_item_id is not null
    and not exists (
      select 1
      from catalog_items as existing
      where existing.source = pack_source_slug
        and existing.source_id = pack_rows.id::text
    );

  insert into catalog_item_revisions (
    catalog_item_id,
    revision_number,
    canonical_name,
    normalized_name,
    catalog_kind,
    identity_relation,
    source_evidence_digest,
    revision_digest
  )
  select
    items.id,
    1,
    items.canonical_name,
    items.normalized_name,
    items.catalog_kind,
    'canonical',
    encode(digest(convert_to(
      concat_ws('|', packs.artifact_digest, pack_rows.source_record_key),
      'utf8'), 'sha256'), 'hex'),
    encode(digest(convert_to(
      concat_ws('|', items.id::text, items.canonical_name,
                items.normalized_name, items.catalog_kind),
      'utf8'), 'sha256'), 'hex')
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_registry_extension_packs as packs
    on packs.id = pack_rows.pack_id
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict (catalog_item_id, revision_number) do nothing;

  -- Membership is the sole eligibility authority for the projection, so the new
  -- identity has to become a member before it can be projected.
  insert into catalog_registry_release_members (
    release_id,
    catalog_item_id,
    catalog_item_revision_id,
    eligibility,
    membership_digest
  )
  select
    target_release_id,
    items.id,
    revisions.id,
    'product_eligible',
    encode(digest(convert_to(
      concat_ws('|', target_release_id::text, items.id::text,
                revisions.revision_digest, 'product_eligible'),
      'utf8'), 'sha256'), 'hex')
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join catalog_item_revisions as revisions
    on revisions.catalog_item_id = items.id
   and revisions.revision_number = 1
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict (release_id, catalog_item_id) do nothing;

  -- A variety is always a plant and a breed is always an animal, so unlike a
  -- species these identities carry a resolved kind rather than `either`.
  insert into stable_registry_product_catalog_records (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    object_kind_scope,
    catalog_kind,
    canonical_name,
    item_locale,
    public_slug,
    activated_at
  )
  select
    target_release_id,
    members.catalog_item_id,
    members.catalog_item_revision_id,
    case pack_kind_value when 'breed' then 'animal' else 'plant' end,
    pack_kind_value,
    stable_registry_public_safe_label(items.canonical_name, 240),
    items.locale,
    stable_registry_product_public_slug(items.id, items.public_slug),
    activated_at_value
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join catalog_registry_release_members as members
    on members.release_id = target_release_id
   and members.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and stable_registry_public_safe_label(items.canonical_name, 240) is not null
  on conflict (registry_release_id, catalog_item_id) do nothing;

  -- The canonical denomination, so the picker finds the variety by its own
  -- name rather than only through its parent species.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(records.canonical_name),
    records.item_locale,
    records.canonical_name,
    'canonical',
    true
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict do nothing;

  -- Trade, local, romanized, and generated names are searchable aliases. A
  -- user-added candidate is deliberately excluded: it has its own review state
  -- and nothing publishes one automatically.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(stable_registry_public_safe_label(pack_names.display_name, 240)),
    coalesce(nullif(trim(pack_names.locale), ''), records.item_locale),
    stable_registry_public_safe_label(pack_names.display_name, 240),
    'accepted_alias',
    false
  from catalog_registry_extension_pack_names as pack_names
  join catalog_registry_extension_pack_rows as pack_rows
    on pack_rows.id = pack_names.pack_row_id
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and pack_names.name_class <> 'user_added'
    and stable_registry_public_safe_label(pack_names.display_name, 240) is not null
  on conflict do nothing;

  -- The picker reads a derived index, so the new identities need a rebuild.
  insert into stable_registry_product_projection_outbox (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    desired_state,
    state
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.catalog_item_revision_id,
    'present',
    'pending'
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict do nothing;
end;
$$;

-- Packs that were already activated published nothing, so re-run each one. The
-- function is idempotent on the pack row id, so an already-published identity
-- is not duplicated.
select materialize_stable_registry_extension_pack(id)
from catalog_registry_extension_packs
where state = 'active';

-- ======================================================================
-- from 0043_ove355_catalog_trigram_typeahead.sql (the product-name trigram index)
-- ======================================================================

create index if not exists stable_registry_product_catalog_names_trgm_idx
  on stable_registry_product_catalog_names
  using gin (lower(normalized_name) gin_trgm_ops);

-- ======================================================================
-- from 0052_job_queue_declared_payload_checks.sql (the edition payload contract)
-- ======================================================================

alter table job_queue
  drop constraint if exists job_queue_stable_registry_edition_build_payload_check;

alter table job_queue
  add constraint job_queue_stable_registry_edition_build_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'stable_registry_edition_build'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'releaseId']::text[]
      and payload - array['kind', 'releaseId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'releaseId') = 'string'
      and payload->>'kind' = 'stable_registry_edition_build'
      and payload->>'releaseId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_stable_registry_edition_build_payload_check;
