-- Rollback of OVE-394's capture vocabulary.
--
-- Only safe while no unit carries one of the three new classes: the observed
-- captures are immutable evidence, and narrowing the CHECK under rows that
-- satisfy the wider one would refuse the table's own contents. The delete is
-- deliberately absent for that reason — a rollback that would destroy a
-- capture is not a rollback, it is a loss.

drop function if exists catalog_capture_declared_classes(uuid);

alter table catalog_source_capture_units
  drop constraint if exists catalog_source_capture_units_endpoint_class_check;

alter table catalog_source_capture_units
  add constraint catalog_source_capture_units_endpoint_class_check
  check (
    endpoint_class in (
      'taxon_list',
      'taxon_overview',
      'taxon_names',
      'taxon_taxonomy'
    )
  );
