-- OVE-399 (ADR-0026 D15): the legacy catalog shape is retired.
--
-- `catalog_items.catalog_kind` and `catalog_items.status` were the flat
-- catalog's identity: three kinds and five statuses, decided at insert. The
-- graph replaced both — `node_kind` says what a node is, `identity_state` says
-- whether it is live, and `merged_into_catalog_item_id` says where it went.
-- Two answers to one question is how a reader ends up trusting the wrong one.
--
-- `catalog_match_suggestions` and `catalog_fuzzy_duplicate_suggestions` were
-- the old matcher's output: pairs of catalog identifiers with a score, no
-- gardener text and no reference to a person. The curation queue decides those
-- pairs now. The owner approved dropping the 2,267 rows production still held
-- (2,230 from one pass on 2026-07-22, 37 from 2026-09-04) on 2026-09-07; the
-- inventory is quoted in docs/PRODUCTION_SCHEMA_STATE.md.
--
-- `user_added` leaves `plant_objects.variety_state`: a gardener's own name is
-- a label on a node now (OVE-387), not a fourth state of an object, and no row
-- in production carries it.
--
-- Destructive and last, as D15 requires. The rollback recreates every dropped
-- object; it cannot bring back rows, and says so.

-- ----------------------------------------------------------------------
-- 1. The one function that wrote the dropped columns.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.catalog_col_ensure_node(p_col_id text, p_assertion uuid, p_depth integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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

  -- A synonym is a name on the accepted node, never a node.
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

  -- A scoped snapshot holds a branch, not the whole tree: production keeps
  -- the plant kingdoms, whose chain runs up into rows above kingdom that
  -- carry no kingdom of their own and are therefore not in it. A parent the
  -- snapshot does not have ends the chain here rather than failing the run.
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
    canonical_name, normalized_name, public_slug, source,
    source_id, locale, node_kind, kingdom, rank, identity_state,
    parent_catalog_item_id, ancestor_ids
  )
  values (
    left(usage.canonical_name, 120),
    catalog_normalize_name(left(usage.canonical_name, 120)), slug,
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

-- ----------------------------------------------------------------------
-- 2. The retired matcher's tables.
-- ----------------------------------------------------------------------

drop table if exists catalog_match_suggestions cascade;
drop table if exists catalog_fuzzy_duplicate_suggestions cascade;

-- ----------------------------------------------------------------------
-- 3. The legacy identity columns and everything that indexed them.
-- ----------------------------------------------------------------------

drop index if exists catalog_items_status_created_idx;
drop index if exists catalog_items_kind_status_idx;

-- A gardener's own items were unique per (owner, name, locale, kind). The
-- guarantee survives the column: `node_kind` is the same three values under
-- different names.
drop index if exists catalog_items_owner_normalized_locale_kind_uidx;
create unique index if not exists catalog_items_owner_normalized_locale_node_uidx
  on catalog_items (created_by_user_id, normalized_name, locale, node_kind);

alter table catalog_items
  drop constraint if exists catalog_items_catalog_kind_check,
  drop constraint if exists catalog_items_status_check;

alter table catalog_items
  drop column if exists catalog_kind,
  drop column if exists status;

-- ----------------------------------------------------------------------
-- 4. The retired job kind's payload constraint.
-- ----------------------------------------------------------------------

alter table job_queue
  drop constraint if exists job_queue_catalog_typeahead_payload_check;

-- ----------------------------------------------------------------------
-- 5. `user_added` leaves the object's vocabulary.
-- ----------------------------------------------------------------------

alter table plant_objects
  drop constraint if exists plant_objects_variety_state_check;

alter table plant_objects
  add constraint plant_objects_variety_state_check
  check (variety_state in ('selected', 'free_text', 'unknown'));

-- ----------------------------------------------------------------------
-- 6. A topic signal named after the dropped column.
-- ----------------------------------------------------------------------
--
-- `journal_entry_topic_signals.signal_source` had a value called
-- `catalog_kind`: "this entry belongs to this topic because of what kind of
-- thing its object is". The reason survives; only the column it was named
-- after is gone, so the value is renamed for the same reason the column is —
-- one name, one meaning.

alter table journal_entry_topic_signals
  drop constraint if exists journal_entry_topic_signals_source_check;

update journal_entry_topic_signals
set signal_source = 'catalog_node_kind'
where signal_source = 'catalog_kind';

alter table journal_entry_topic_signals
  add constraint journal_entry_topic_signals_source_check
  check (signal_source in (
    'explicit_tag',
    'object_kind',
    'catalog_node_kind',
    'catalog_mention',
    'operator_curated'
  ));
