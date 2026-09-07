-- 0055 (OVE-387): a gardener's own name is a label, not a card, and the
-- picker answers from Postgres alone (ADR-0026 D6, D7).
--
-- Idempotent and re-runnable: bootstrap replays every migration, so each
-- statement guards itself. Additive except for the data moves named below,
-- which the rollback beside this file reverses on the seeded proof.
--
--   1. Every object that points at a provisional (gardener-created) card
--      keeps the card's name as a text label (`variety_state = 'free_text'`)
--      and drops the link; the cards stay for history with
--      `identity_state = 'retired'`; their alias projections and pending match
--      suggestions go stale. `plant_objects.variety_state` keeps accepting
--      `user_added` for historic rows; no writer produces it after this
--      migration, and no row carries it after it either.
--   2. `catalog_item_names.normalized_name` becomes `catalog_normalize_name(
--      display_name)`, the one normalizer of ADR-0026 D3, so the prefix index
--      from 0054 and the trigram index below both see the form the picker
--      queries with. A row whose new form would collide with a sibling keeps
--      its old form (the trigram path still reaches it). The legacy TypeScript
--      importers under `src/server/catalog-source/` still write the pre-0055
--      form; they are replaced by the register and breed task of the slice
--      and are not scheduled anywhere.
--   3. A trigram index on `normalized_name` for the fuzzy half of the picker.
--   4. `catalog_recompute_search_weight()`: gardener usage, registration
--      markets, registered forms and host relations, recomputed daily by the
--      `catalog-search-weight` cron.
--   5. Fresh planner statistics for the two tables the picker reads.

-- ======================================================================
-- 1. Labels instead of provisional cards
-- ======================================================================

-- Historic rows that carried the retired state without a card (the card was
-- deleted or never linked): the text they hold is already the label. This one
-- reads no retired column, so it stays outside the guard below.
update plant_objects
set variety_state = case
      when nullif(btrim(variety_text), '') is null then 'unknown'
      else 'free_text'
    end,
    updated_at = now()
where variety_state = 'user_added';

-- Keep bootstrap repeatable: migration 0061 (OVE-399) drops `status` once
-- `identity_state` owns the answer, and a replay reaches this section with the
-- column already gone. Everything it would retire is already retired, so the
-- whole section is skipped rather than rewritten to read a column that no
-- longer says anything.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_items'
      and column_name = 'status'
  ) then
    return;
  end if;

  with retired as (
    select id, canonical_name
    from catalog_items
    where status = 'provisional'
       or source = 'user_added'
       or created_by_user_id is not null
  )
  update plant_objects as po
  set variety_text = coalesce(nullif(btrim(po.variety_text), ''), retired.canonical_name),
      variety_state = 'free_text',
      catalog_item_id = null,
      updated_at = now()
  from retired
  where po.catalog_item_id = retired.id;

  update catalog_items
  set identity_state = 'retired'
  where (status = 'provisional' or source = 'user_added' or created_by_user_id is not null)
    and identity_state <> 'retired';

  update catalog_alias_projections
  set status = 'stale', updated_at = now()
  where alias_kind = 'user_provisional'
    and status <> 'stale';

  update catalog_match_suggestions as cms
  set status = 'stale', updated_at = now()
  from catalog_items as ci
  where ci.id = cms.source_catalog_item_id
    and ci.identity_state = 'retired'
    and (ci.status = 'provisional' or ci.source = 'user_added' or ci.created_by_user_id is not null)
    and cms.status = 'pending';
end $$;

-- ======================================================================
-- 2. One normalizer for stored names
-- ======================================================================

-- The normalizer runs once per name; `materialized` keeps the planner from
-- re-evaluating it per outer row of the update.
with normalized as materialized (
  select n.id,
         n.catalog_item_id,
         n.locale,
         n.is_primary,
         n.created_at,
         n.normalized_name,
         catalog_normalize_name(n.display_name) as next_normalized
  from catalog_item_names as n
),
candidates as (
  select id, catalog_item_id, locale, is_primary, created_at, next_normalized
  from normalized
  where normalized_name is distinct from next_normalized
    and next_normalized <> ''
),
-- One row per (item, locale, new form): the primary name wins, then the
-- oldest row, so a second sibling that would land on the same form is skipped
-- rather than made to collide.
chosen as materialized (
  select distinct on (c.catalog_item_id, c.locale, c.next_normalized)
         c.id, c.next_normalized
  from candidates as c
  order by c.catalog_item_id, c.locale, c.next_normalized, c.is_primary desc, c.created_at, c.id
)
update catalog_item_names as n
set normalized_name = chosen.next_normalized
from chosen
where n.id = chosen.id
  and not exists (
    select 1
    from catalog_item_names as other
    where other.catalog_item_id = n.catalog_item_id
      and other.locale = n.locale
      and other.normalized_name = chosen.next_normalized
      and other.id <> n.id
  );

-- ======================================================================
-- 3. The fuzzy half of the picker
-- ======================================================================

create extension if not exists pg_trgm;

create index if not exists catalog_item_names_normalized_trgm_idx
  on catalog_item_names
  using gin (normalized_name gin_trgm_ops);

-- ======================================================================
-- 4. Market-aware ranking inputs
-- ======================================================================

-- search_weight = ln(1 + objects) + ln(1 + active entries on those objects);
-- registered_ua / registered_eu from registration facts (UA; BG or EU) and,
-- until the register task of the slice writes those facts, from the register
-- identifiers the 0054 backfill created (`ua_register`, `eu_common_catalogue`);
-- a taxon inherits the flags of its forms (`form_of`) and has_registered_forms
-- when any form is registered anywhere; is_host when any `pest_of` relation
-- points at the node. Only rows whose values change are written, so the daily
-- recompute never touches updated_at or the content clock of an unchanged node.
create or replace function catalog_recompute_search_weight()
returns integer
language plpgsql
as $$
declare
  touched integer;
begin
  with usage as (
    select po.catalog_item_id as id,
           count(distinct po.id)::numeric as objects,
           count(distinct je.id)::numeric as entries
    from plant_objects as po
    left join journal_entries as je
      on je.plant_object_id = po.id
     and je.lifecycle_state = 'active'
    where po.catalog_item_id is not null
    group by po.catalog_item_id
  ),
  own_registration as (
    select id,
           bool_or(ua) as ua,
           bool_or(eu) as eu
    from (
      select f.catalog_item_id as id,
             f.region_code = 'UA' as ua,
             f.region_code in ('BG', 'EU') as eu
      from catalog_item_facts as f
      where f.predicate = 'registration_status'
      union all
      select i.catalog_item_id,
             i.scheme = 'ua_register',
             i.scheme = 'eu_common_catalogue'
      from catalog_item_identifiers as i
      where i.scheme in ('ua_register', 'eu_common_catalogue')
    ) as evidence
    group by id
  ),
  forms as (
    select r.to_catalog_item_id as id,
           bool_or(coalesce(own.ua, false)) as ua,
           bool_or(coalesce(own.eu, false)) as eu,
           bool_or(own.id is not null) as has_registered_forms
    from catalog_item_relations as r
    left join own_registration as own on own.id = r.from_catalog_item_id
    where r.relation_type = 'form_of'
    group by r.to_catalog_item_id
  ),
  hosts as (
    select distinct r.to_catalog_item_id as id
    from catalog_item_relations as r
    where r.relation_type = 'pest_of'
  ),
  target as (
    select ci.id,
           round((ln(1 + coalesce(u.objects, 0)) + ln(1 + coalesce(u.entries, 0)))::numeric, 4) as search_weight,
           (coalesce(own.ua, false) or coalesce(fo.ua, false)) as registered_ua,
           (coalesce(own.eu, false) or coalesce(fo.eu, false)) as registered_eu,
           coalesce(fo.has_registered_forms, false) as has_registered_forms,
           (h.id is not null) as is_host
    from catalog_items as ci
    left join usage as u on u.id = ci.id
    left join own_registration as own on own.id = ci.id
    left join forms as fo on fo.id = ci.id
    left join hosts as h on h.id = ci.id
  ),
  written as (
    update catalog_items as ci
    set search_weight = t.search_weight,
        registered_ua = t.registered_ua,
        registered_eu = t.registered_eu,
        has_registered_forms = t.has_registered_forms,
        is_host = t.is_host
    from target as t
    where t.id = ci.id
      and (ci.search_weight, ci.registered_ua, ci.registered_eu, ci.has_registered_forms, ci.is_host)
          is distinct from
          (t.search_weight, t.registered_ua, t.registered_eu, t.has_registered_forms, t.is_host)
    returning ci.id
  )
  select count(*) into touched from written;

  return touched;
end;
$$;

comment on function catalog_recompute_search_weight() is
  'ADR-0026 D7 ranking inputs: gardener usage, registration markets, registered forms, host relations. Returns the number of nodes whose values changed.';

select catalog_recompute_search_weight();

-- ======================================================================
-- 5. Fresh planner statistics
-- ======================================================================

-- The rewrite of normalized_name and the new index leave the planner with
-- stale statistics for the name table; without this the picker statement is
-- planned as a parallel nested loop with absurd row estimates (measured at
-- 430 ms per query instead of 5 ms on the loopback database). ANALYZE runs
-- inside the transaction and is idempotent.
analyze catalog_item_names;
analyze catalog_items;
