-- Rollback of 0055 (OVE-387). Restores the prior shape: the weight function
-- and the trigram index go; stored names return to the pre-0055 form (trim,
-- collapse whitespace, lower case, 120 characters) where that form does not
-- collide with a sibling; the retired gardener cards become active again and
-- every object whose label equals one of the owner's own retired cards is
-- re-linked to it in the `user_added` state. A label that never came from a
-- card (a pre-0055 `free_text` object) stays a label. Ranking columns keep the
-- values the recompute wrote; 0054 owns the columns and they are harmless
-- without the function.

drop function if exists catalog_recompute_search_weight();

drop index if exists catalog_item_names_normalized_trgm_idx;

with legacy as materialized (
  select n.id,
         n.catalog_item_id,
         n.locale,
         left(lower(btrim(regexp_replace(n.display_name, '\s+', ' ', 'g'))), 120) as prior_normalized
  from catalog_item_names as n
),
chosen as materialized (
  select distinct on (l.catalog_item_id, l.locale, l.prior_normalized)
         l.id, l.prior_normalized
  from legacy as l
  join catalog_item_names as n on n.id = l.id
  where n.normalized_name is distinct from l.prior_normalized
    and l.prior_normalized <> ''
  order by l.catalog_item_id, l.locale, l.prior_normalized, n.is_primary desc, n.created_at, n.id
)
update catalog_item_names as n
set normalized_name = chosen.prior_normalized
from chosen
where n.id = chosen.id
  and not exists (
    select 1
    from catalog_item_names as other
    where other.catalog_item_id = n.catalog_item_id
      and other.locale = n.locale
      and other.normalized_name = chosen.prior_normalized
      and other.id <> n.id
  );

update catalog_items
set identity_state = 'active'
where (status = 'provisional' or source = 'user_added' or created_by_user_id is not null)
  and identity_state = 'retired';

update catalog_alias_projections
set status = 'user_provisional', updated_at = now()
where alias_kind = 'user_provisional'
  and status = 'stale';

with cards as (
  select id, created_by_user_id, canonical_name
  from catalog_items
  where created_by_user_id is not null
    and (status = 'provisional' or source = 'user_added')
)
update plant_objects as po
set catalog_item_id = cards.id,
    variety_state = 'user_added',
    updated_at = now()
from cards
where po.variety_state = 'free_text'
  and po.catalog_item_id is null
  and po.owner_user_id = cards.created_by_user_id
  and btrim(po.variety_text) = cards.canonical_name;
