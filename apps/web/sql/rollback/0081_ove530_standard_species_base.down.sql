-- Rollback of 0081 (OVE-530). The base's own name changes are taken back
-- first — the rows it wrote go, the rows it changed get back their primary
-- flag, weight and spelling — and only then do the two tables go, so no name
-- a source import wrote is lost and none the base wrote is left behind. The
-- nodes the loader created and the addresses it gave stay: an address once
-- public is never taken back.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('catalog_standard_species_names') is not null then
    update catalog_item_names as name
       set is_primary = coalesce(recorded.previous_is_primary, false),
           weight = coalesce(recorded.previous_weight, 0),
           display_name = coalesce(recorded.previous_display_name, name.display_name)
      from catalog_standard_species_names as recorded
     where recorded.catalog_item_name_id = name.id
       and not recorded.created_by_base;
    delete from catalog_item_names as name
     using catalog_standard_species_names as recorded
     where recorded.catalog_item_name_id = name.id
       and recorded.created_by_base;
  end if;
end $$;

drop table if exists catalog_standard_species_names;
drop table if exists catalog_standard_species;
