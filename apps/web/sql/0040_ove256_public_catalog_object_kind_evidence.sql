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
