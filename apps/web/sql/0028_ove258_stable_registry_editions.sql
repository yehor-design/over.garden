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
