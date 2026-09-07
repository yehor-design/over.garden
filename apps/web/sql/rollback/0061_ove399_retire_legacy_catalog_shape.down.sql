-- Rollback for 0061 (OVE-399).
--
-- Every dropped object comes back, in the shape `0001` and `0012` gave it, so
-- a fresh bootstrap can run 0061 forward, back and forward again.
--
-- What does not come back is rows. The 2,267 suggestion rows 0061 dropped were
-- the retired matcher's output and are gone; the two tables return empty,
-- which is the honest state — nothing has generated a suggestion since the
-- curation queue replaced them. `catalog_kind` and `status` return with their
-- defaults and are backfilled from what the graph already knows, because
-- `node_kind` and `identity_state` carry the same three answers under other
-- names.

-- ----------------------------------------------------------------------
-- 1. The legacy identity columns.
-- ----------------------------------------------------------------------

alter table catalog_items
  add column if not exists catalog_kind text,
  add column if not exists status text;

-- The graph is the source: a taxon was a species, a cultivar a plant variety,
-- and a breed a breed; an active node was seeded and a merged one merged.
update catalog_items
set catalog_kind = case
      when node_kind = 'taxon' then 'species'
      when node_kind = 'cultivar' then 'plant_variety'
      else 'breed'
    end
where catalog_kind is null;

update catalog_items
set status = case
      when identity_state = 'merged' then 'merged'
      when identity_state = 'retired' then 'rejected'
      else 'seeded'
    end
where status is null;

alter table catalog_items
  alter column catalog_kind set not null,
  alter column status set not null,
  alter column status set default 'seeded';

alter table catalog_items
  add constraint catalog_items_catalog_kind_check
    check (catalog_kind in ('plant_variety', 'species', 'breed')),
  add constraint catalog_items_status_check
    check (status in ('seeded', 'confirmed', 'provisional', 'merged', 'rejected'));

drop index if exists catalog_items_owner_normalized_locale_node_uidx;
create unique index if not exists catalog_items_owner_normalized_locale_kind_uidx
  on catalog_items (created_by_user_id, normalized_name, locale, catalog_kind);
create index if not exists catalog_items_status_created_idx
  on catalog_items (status, created_at desc);
create index if not exists catalog_items_kind_status_idx
  on catalog_items (catalog_kind, status, created_at desc);

-- ----------------------------------------------------------------------
-- 2. The retired matcher's tables, empty.
-- ----------------------------------------------------------------------

create table if not exists catalog_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  target_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  target_catalog_item_name_id uuid,
  candidate_key text not null,
  source_updated_at_snapshot timestamptz,
  target_updated_at_snapshot timestamptz,
  source_matching_fingerprint text,
  target_matching_fingerprint text,
  suggestion_kind text not null default 'merge',
  match_type text,
  score numeric(6,4),
  confidence numeric(6,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog_fuzzy_duplicate_suggestions (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null,
  left_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  right_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  left_updated_at_snapshot timestamptz,
  right_updated_at_snapshot timestamptz,
  score numeric(6,4),
  score_bucket text,
  reason_codes text[] not null default array[]::text[],
  locale_relation text,
  recommended_action text,
  matcher_version text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------
-- 3. The retired job kind's payload constraint, as 0052 declared it.
-- ----------------------------------------------------------------------

alter table job_queue
  drop constraint if exists job_queue_catalog_typeahead_payload_check;

alter table job_queue
  add constraint job_queue_catalog_typeahead_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_typeahead_reindex'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload - array['kind']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'catalog_typeahead_reindex'
    )
  ) not valid;

alter table job_queue
  validate constraint job_queue_catalog_typeahead_payload_check;

-- ----------------------------------------------------------------------
-- 4. `user_added` returns to the object's vocabulary.
-- ----------------------------------------------------------------------

alter table plant_objects
  drop constraint if exists plant_objects_variety_state_check;

alter table plant_objects
  add constraint plant_objects_variety_state_check
  check (variety_state in ('selected', 'free_text', 'unknown', 'user_added'));

-- ----------------------------------------------------------------------
-- 5. The Catalogue of Life node function, writing the columns again.
-- ----------------------------------------------------------------------
--
-- The forward migration replaced this function's insert; here it is with the
-- two columns back, so a rolled-back database can ingest a release again.

create or replace function catalog_col_ensure_node(
  p_col_id text,
  p_assertion uuid,
  p_depth integer default 0
)
returns uuid
language plpgsql
as $function$
declare
  snapshot uuid := catalog_col_current_snapshot();
  usage catalog_source_col_usages%rowtype;
  existing uuid;
  parent uuid;
  parent_ancestors uuid[];
  node uuid;
  node_rank text;
  slug text;
begin
  if snapshot is null then
    raise exception 'catalog_col_ensure_node: no Catalogue of Life snapshot'
      using errcode = 'no_data_found';
  end if;
  if p_depth > 40 then
    raise exception 'catalog_col_ensure_node: classification deeper than 40'
      using errcode = 'program_limit_exceeded';
  end if;

  select * into usage
  from catalog_source_col_usages
  where source_snapshot_id = snapshot and col_id = p_col_id;
  if not found then
    raise exception 'catalog_col_ensure_node: unknown usage %', p_col_id
      using errcode = 'no_data_found';
  end if;

  if usage.status in ('synonym', 'ambiguous_synonym', 'misapplied') then
    if usage.parent_col_id is null
       or not exists (
         select 1 from catalog_source_col_usages as accepted
         where accepted.source_snapshot_id = snapshot
           and accepted.col_id = usage.parent_col_id
       ) then
      raise exception 'catalog_col_ensure_node: synonym % has no accepted usage in this snapshot', p_col_id
        using errcode = 'invalid_parameter_value';
    end if;
    node := catalog_col_ensure_node(usage.parent_col_id, p_assertion, p_depth + 1);
    insert into catalog_item_names (
      catalog_item_id, display_name, normalized_name, locale, script,
      is_primary, name_type, authorship, assertion_id, weight
    )
    values (
      node, left(usage.canonical_name, 120),
      catalog_normalize_name(left(usage.canonical_name, 120)),
      'la', 'latin', false, 'scientific_synonym',
      left(usage.authorship, 200), p_assertion, 1
    )
    on conflict do nothing;
    return node;
  end if;

  select identifier.catalog_item_id into existing
  from catalog_item_identifiers as identifier
  where identifier.scheme = 'col' and identifier.value = p_col_id;
  if existing is not null then
    return existing;
  end if;

  if usage.parent_col_id is not null
     and exists (
       select 1 from catalog_source_col_usages as ancestor
       where ancestor.source_snapshot_id = snapshot
         and ancestor.col_id = usage.parent_col_id
     ) then
    parent := catalog_col_ensure_node(usage.parent_col_id, p_assertion, p_depth + 1);
    select ancestor_ids into parent_ancestors from catalog_items where id = parent;
  end if;

  node_rank := catalog_col_rank(usage.rank);
  if node_rank in ('species', 'subspecies', 'variety', 'subvariety', 'form') then
    slug := catalog_col_free_slug(catalog_col_slug(usage.canonical_name));
  end if;

  insert into catalog_items (
    canonical_name, catalog_kind, normalized_name, public_slug, status, source,
    source_id, locale, node_kind, kingdom, rank, identity_state,
    parent_catalog_item_id, ancestor_ids
  )
  values (
    left(usage.canonical_name, 120), 'species',
    catalog_normalize_name(left(usage.canonical_name, 120)), slug, 'seeded',
    'species_backbone', 'catalogue-of-life-checklistbank:' || p_col_id, 'la',
    'taxon', usage.kingdom, node_rank, 'active',
    parent,
    case
      when parent is null then '{}'::uuid[]
      else coalesce(parent_ancestors, '{}'::uuid[]) || array[parent]
    end
  )
  returning id into node;

  insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
  values (node, 'col', p_col_id, p_assertion)
  on conflict (scheme, value) do nothing;

  insert into catalog_item_names (
    catalog_item_id, display_name, normalized_name, locale, script,
    is_primary, name_type, authorship, assertion_id, weight
  )
  values (
    node, left(usage.canonical_name, 120),
    catalog_normalize_name(left(usage.canonical_name, 120)),
    'la', 'latin', true, 'scientific_accepted',
    left(usage.authorship, 200), p_assertion, 5
  )
  on conflict do nothing;

  return node;
end;
$function$;
