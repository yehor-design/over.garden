-- OVE-211: collapse legacy third object_kind to animal (production catch-up).
-- Additive. Safe to re-run. Preserves catalog_item_id, journals, lineage, media, slugs.

-- Remediate OVE-210 visual-fixture outliers before kind collapse.
-- …028 was legacy kind + species; rebind to the sibling hive breed catalog.
update plant_objects
set
  catalog_item_id = '18700009-0000-4000-8000-000000000017',
  variety_state = 'selected'
where id = '18700003-0000-4000-8000-000000000028'
  and object_kind = 'bee_colony';

-- …030 was legacy kind + user_added with no catalog; treat as unidentified animal.
update plant_objects
set
  variety_state = 'unknown',
  catalog_item_id = null
where id = '18700003-0000-4000-8000-000000000030'
  and object_kind = 'bee_colony';

update plant_objects
set object_kind = 'animal'
where object_kind = 'bee_colony';

alter table plant_objects
  drop constraint if exists plant_objects_object_kind_check;

alter table plant_objects
  add constraint plant_objects_object_kind_check
  check (object_kind in ('plant', 'animal'));
