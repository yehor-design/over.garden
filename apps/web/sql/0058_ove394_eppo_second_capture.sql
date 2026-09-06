-- OVE-394 (ADR-0026 D11): the second EPPO observed capture.
--
-- The first capture (2026-09-03, `df3852ea-3233-4883-8886-92d9e68f5193`) took
-- the list, overview, names and taxonomy surfaces for 129,214 documented
-- identifiers. It holds no hosts, no distribution and no categorization, which
-- are exactly the three things no taxonomic backbone carries and the reason
-- EPPO is on the graph at all: pest and host relations, and "present in
-- Ukraine" on a card.
--
-- This migration widens the capture vocabulary so a second run can take those
-- three classes for the same identifiers. It changes no row: the first
-- capture's units keep their classes, and its terminal state is immutable by
-- trigger.

alter table catalog_source_capture_units
  drop constraint if exists catalog_source_capture_units_endpoint_class_check;

alter table catalog_source_capture_units
  add constraint catalog_source_capture_units_endpoint_class_check
  check (
    endpoint_class in (
      'taxon_list',
      'taxon_overview',
      'taxon_names',
      'taxon_taxonomy',
      -- OVE-394: the three classes the second capture adds. Each is a
      -- documented EPPO API v2 operation (`getGDTaxonHosts`,
      -- `getGDTaxonDistribution`, `getGDTaxonCategorization`); nothing here
      -- reaches below the sub-national units EPPO publishes, and EPPO
      -- publishes no coordinates at this level.
      'taxon_hosts',
      'taxon_distribution',
      'taxon_categorization'
    )
  );

/**
 * How many detail classes a capture declared, read from its own units.
 *
 * The count of classes per identifier is what "this capture closed over that
 * identifier" means, and the two captures declare different sets: three each.
 * Reading it from the run rather than from a constant is what lets both remain
 * verifiable after the vocabulary widened.
 */
create or replace function catalog_capture_declared_classes(capture uuid)
returns integer
language sql
stable
as $$
  select count(distinct unit.endpoint_class)::int
  from catalog_source_capture_units as unit
  where unit.capture_id = capture
    and unit.unit_kind = 'taxon_endpoint'
$$;

comment on function catalog_capture_declared_classes(uuid) is
  'Detail classes one observed capture declared (OVE-394): the first took three, the second another three.';
