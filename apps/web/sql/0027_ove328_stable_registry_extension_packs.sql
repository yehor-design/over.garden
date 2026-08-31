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
