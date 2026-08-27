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
