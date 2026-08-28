-- OVE-256 — read-only, public-safe Stable Registry projections.
--
-- These tables are deliberately separate from both product catalog tables and
-- raw source evidence. They materialize only an explicit allowlist needed by
-- the public guest explorer. No source row creates a product identity here.

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

create table if not exists stable_registry_public_eppo_records (
  capture_id uuid not null
    references catalog_source_capture_runs(id) on delete restrict,
  source_snapshot_id uuid not null
    references catalog_source_snapshots(id) on delete restrict,
  eppo_code text not null check (eppo_code ~ '^[0-9A-Z]{5,6}$'),
  object_kind text not null check (object_kind in ('plant', 'animal')),
  display_name text not null check (char_length(display_name) between 1 and 240),
  scientific_name text check (scientific_name is null or char_length(scientific_name) between 1 and 240),
  taxonomic_rank text check (taxonomic_rank is null or char_length(taxonomic_rank) between 1 and 120),
  parent_display_name text check (parent_display_name is null or char_length(parent_display_name) between 1 and 240),
  search_normalized text not null check (char_length(search_normalized) between 1 and 240),
  safe_aliases text[] not null default '{}'::text[],
  evidence_state text not null check (
    evidence_state in ('source_record_not_approved', 'superseded_source_evidence')
  ),
  observed_at timestamptz not null,
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_url text not null check (char_length(source_url) between 1 and 1000),
  license text not null check (char_length(license) between 1 and 240),
  license_url text check (license_url is null or char_length(license_url) between 1 and 1000),
  attribution_text text check (attribution_text is null or char_length(attribution_text) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (capture_id, eppo_code)
);

alter table stable_registry_public_eppo_records
  add column if not exists scientific_name text,
  add column if not exists taxonomic_rank text,
  add column if not exists parent_display_name text;

create index if not exists stable_registry_public_eppo_code_lookup_idx
  on stable_registry_public_eppo_records (capture_id, eppo_code);

create index if not exists stable_registry_public_eppo_name_lookup_idx
  on stable_registry_public_eppo_records (
    capture_id,
    object_kind,
    lower(display_name) text_pattern_ops,
    eppo_code
  );

-- Prefix-search terms are independently derived from the public records. They
-- keep alias/code lookup indexed without selecting source evidence at request
-- time or widening the catalog namespace.
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

create table if not exists stable_registry_public_eppo_search_terms (
  capture_id uuid not null,
  eppo_code text not null,
  object_kind text not null check (object_kind in ('plant', 'animal')),
  normalized_term text not null check (char_length(normalized_term) between 1 and 240),
  primary key (capture_id, eppo_code, normalized_term),
  foreign key (capture_id, eppo_code)
    references stable_registry_public_eppo_records(capture_id, eppo_code)
    on delete cascade
);

create index if not exists stable_registry_public_eppo_search_terms_prefix_idx
  on stable_registry_public_eppo_search_terms (
    capture_id,
    object_kind,
    normalized_term text_pattern_ops,
    eppo_code
  );

-- The read models are public-facing even though they are built server-side.
-- Keep their text allowlist defensive at the schema boundary: an unsafe label
-- is omitted before it can become a searchable derived value. The canonical
-- TypeScript precise-location firewall remains the final rendering boundary.
create or replace function stable_registry_public_safe_label(
  candidate text,
  max_length integer
)
returns text
language sql
immutable
strict
as $$
  select case
    when char_length(trim(regexp_replace(candidate, '\s+', ' ', 'g'))) between 1 and max_length
      and trim(regexp_replace(candidate, '\s+', ' ', 'g')) !~ '[\x00-\x1F\x7F]'
      and trim(regexp_replace(candidate, '\s+', ' ', 'g')) !~* '(https?://|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})'
      and trim(regexp_replace(candidate, '\s+', ' ', 'g')) !~* '\m(token|invite|checksum|raw[_ -]?payload|source[_ -]?only|latitude|longitude|coordinates?)\M'
      and trim(regexp_replace(candidate, '\s+', ' ', 'g')) !~ '[+-]?[0-9]{1,3}\.[0-9]{4,}\s*,\s*[+-]?[0-9]{1,3}\.[0-9]{4,}'
      then trim(regexp_replace(candidate, '\s+', ' ', 'g'))
    else null
  end;
$$;

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

create or replace function materialize_stable_registry_public_eppo_capture(
  target_capture_id uuid
)
returns void
language plpgsql
as $$
begin
  -- `allowed_projection` is the rights-filtered source-public projection from
  -- OVE-254. This function never reads the raw response or source-only fields
  -- for output. Unknown or forbidden fields in a separate evidence field do
  -- not contaminate an independently source-public projected field; they stay
  -- isolated and are never selected into this read model.
  insert into stable_registry_public_eppo_records (
    capture_id,
    source_snapshot_id,
    eppo_code,
    object_kind,
    display_name,
    scientific_name,
    taxonomic_rank,
    parent_display_name,
    search_normalized,
    safe_aliases,
    evidence_state,
    observed_at,
    source_name,
    source_url,
    license,
    license_url,
    attribution_text
  )
  select
    captures.id,
    snapshots.id,
    overview.value->>'eppocode',
    case when overview.value->>'datatype' = 'animal' then 'animal' else 'plant' end,
    stable_registry_public_safe_label(overview.value->>'prefname', 240),
    stable_registry_public_safe_label(overview.value->>'fullname', 240),
    stable_registry_public_safe_label(
      coalesce(
        current_taxonomy.value->>'type',
        current_taxonomy.value->>'rank',
        current_taxonomy.value->>'level'
      ),
      120
    ),
    stable_registry_public_safe_label(
      coalesce(
        parent_taxonomy.value->>'prefname',
        parent_taxonomy.value->>'name'
      ),
      240
    ),
    lower(stable_registry_public_safe_label(overview.value->>'prefname', 240)),
    coalesce(
      array(
        select distinct alias_value
        from (
          select stable_registry_public_safe_label(name_entry.value->>'fullname', 240) as alias_value
          from jsonb_array_elements(
            case
              when jsonb_typeof(records.allowed_projection->'taxon_names') = 'array'
                then records.allowed_projection->'taxon_names'
              else '[]'::jsonb
            end
          ) as name_entry(value)
          union
          select stable_registry_public_safe_label(taxonomy_entry.value->>'prefname', 240) as alias_value
          from jsonb_array_elements(
            case
              when jsonb_typeof(records.allowed_projection->'taxon_taxonomy') = 'array'
                then records.allowed_projection->'taxon_taxonomy'
              else '[]'::jsonb
            end
          ) as taxonomy_entry(value)
        ) as aliases
        where alias_value is not null
        order by alias_value
      ),
      '{}'::text[]
    ),
    case
      when coalesce(overview.value->>'is_active', 'false') <> 'true'
        or nullif(trim(overview.value->>'replacedby'), '') is not null
        then 'superseded_source_evidence'
      else 'source_record_not_approved'
    end,
    captures.observed_ended_at,
    snapshots.source_name,
    snapshots.source_url,
    snapshots.license,
    snapshots.license_url,
    snapshots.attribution_text
  from catalog_source_capture_runs as captures
  join catalog_source_snapshots as snapshots
    on snapshots.id = captures.source_snapshot_id
  join catalog_source_records as records
    on records.source_snapshot_id = snapshots.id
  cross join lateral (
    select records.allowed_projection->'taxon_overview' as value
  ) as overview
  left join lateral (
    select taxonomy_entry.value, taxonomy_entry.ordinality
    from jsonb_array_elements(
      case
        when jsonb_typeof(records.allowed_projection->'taxon_taxonomy') = 'array'
          then records.allowed_projection->'taxon_taxonomy'
        else '[]'::jsonb
      end
    ) with ordinality as taxonomy_entry(value, ordinality)
    where taxonomy_entry.value->>'eppocode' = overview.value->>'eppocode'
    order by taxonomy_entry.ordinality desc
    limit 1
  ) as current_taxonomy on true
  left join lateral (
    select taxonomy_entry.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(records.allowed_projection->'taxon_taxonomy') = 'array'
          then records.allowed_projection->'taxon_taxonomy'
        else '[]'::jsonb
      end
    ) with ordinality as taxonomy_entry(value, ordinality)
    where taxonomy_entry.ordinality = current_taxonomy.ordinality - 1
    limit 1
  ) as parent_taxonomy on true
  where captures.id = target_capture_id
    and captures.state in ('completed', 'superseded_by_new_capture')
    and records.projection_status = 'quarantined'
    and jsonb_typeof(records.allowed_projection->'taxon_overview') = 'object'
    and overview.value->>'eppocode' ~ '^[0-9A-Z]{5,6}$'
    and stable_registry_public_safe_label(overview.value->>'prefname', 240) is not null
  on conflict (capture_id, eppo_code) do update
  set
    source_snapshot_id = excluded.source_snapshot_id,
    object_kind = excluded.object_kind,
    display_name = excluded.display_name,
    scientific_name = excluded.scientific_name,
    taxonomic_rank = excluded.taxonomic_rank,
    parent_display_name = excluded.parent_display_name,
    search_normalized = excluded.search_normalized,
    safe_aliases = excluded.safe_aliases,
    evidence_state = excluded.evidence_state,
    observed_at = excluded.observed_at,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    license = excluded.license,
    license_url = excluded.license_url,
    attribution_text = excluded.attribution_text;

  delete from stable_registry_public_eppo_search_terms
  where capture_id = target_capture_id;

  insert into stable_registry_public_eppo_search_terms (
    capture_id,
    eppo_code,
    object_kind,
    normalized_term
  )
  select
    records.capture_id,
    records.eppo_code,
    records.object_kind,
    lower(trim(terms.value))
  from stable_registry_public_eppo_records as records
  cross join lateral unnest(
    array_prepend(
      records.eppo_code,
      array_prepend(
        records.scientific_name,
        array_prepend(records.display_name, records.safe_aliases)
      )
    )
  ) as terms(value)
  where records.capture_id = target_capture_id
    and char_length(trim(terms.value)) between 1 and 240
  on conflict do nothing;
end;
$$;

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

drop trigger if exists catalog_registry_public_eppo_materialize
  on catalog_source_capture_runs;
create trigger catalog_registry_public_eppo_materialize
after update of state on catalog_source_capture_runs
for each row execute function materialize_stable_registry_public_read_models();

-- Existing terminal records receive a one-time derived projection. This does
-- not change their immutable evidence, capture units, rights state, or product
-- identity; it only creates separate public-safe read rows.
select materialize_stable_registry_public_catalog_release(id)
from catalog_registry_releases
where state = 'active';

select materialize_stable_registry_public_eppo_capture(id)
from catalog_source_capture_runs
where state in ('completed', 'superseded_by_new_capture');
