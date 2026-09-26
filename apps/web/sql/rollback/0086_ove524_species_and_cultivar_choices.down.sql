-- Rollback of 0086 (OVE-524). The release being rolled back to knows three
-- states and one label, so each new state is folded into the nearest one it
-- can show:
--
--   * an own species (`species_text`) becomes the label it was before 0086:
--     `free_text` with the text in `variety_text`;
--   * an own species with an own cultivar keeps both texts in that label,
--     «species · cultivar» — the old model had one text;
--   * an object on a gardener-added entry keeps its link. The old release
--     reads gardener-created nodes as nothing (every public read filters
--     `created_by_user_id is null`) and falls back to `variety_text`, which
--     holds the entry's name, so the object shows what it showed.
--
-- The per-gardener unique index comes back only when no gardener named two
-- entries alike; otherwise the rollback refuses rather than guessing which
-- entry to retire.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1
    from catalog_items
    where created_by_user_id is not null
    group by created_by_user_id, normalized_name, locale, node_kind
    having count(*) > 1
  ) then
    raise exception '0086 rollback refused: a gardener has two entries with one name'
      using errcode = 'check_violation';
  end if;
end $$;

alter table plant_objects
  drop constraint if exists plant_objects_catalog_choice_check;

alter table plant_objects
  drop constraint if exists plant_objects_variety_state_check;

update plant_objects
set variety_text = left(species_text || ' · ' || variety_text, 120),
    species_text = null,
    variety_state = 'free_text',
    updated_at = now()
where variety_state = 'own';

update plant_objects
set variety_text = species_text,
    species_text = null,
    variety_state = 'free_text',
    updated_at = now()
where variety_state = 'unknown'
  and species_text is not null;

alter table plant_objects
  add constraint plant_objects_variety_state_check
  check (variety_state in ('selected', 'free_text', 'unknown'));

alter table plant_objects
  drop constraint if exists plant_objects_species_text_check,
  drop column if exists species_text;

drop function if exists catalog_cultivar_key(text);

create unique index if not exists catalog_items_owner_normalized_locale_node_uidx
  on catalog_items (created_by_user_id, normalized_name, locale, node_kind);
