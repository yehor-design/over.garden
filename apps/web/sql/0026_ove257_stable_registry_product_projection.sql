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
