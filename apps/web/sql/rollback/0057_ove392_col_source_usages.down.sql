-- Rollback of OVE-392's Catalogue of Life source layer.
--
-- The usages and vernaculars are a cached copy of a public release: dropping
-- them loses no OverGarden evidence, and the next ingest rebuilds them. What
-- the release already wrote into the graph — identifiers, names, parents,
-- ancestors — belongs to the graph and stays; a rollback of the source layer
-- is not a rollback of the curation it fed.
--
-- The snapshot rows themselves belong to the source layer of `0001`. Their
-- Catalogue of Life rows go with the tables through the cascade.

drop function if exists catalog_col_refresh_diff();
drop function if exists catalog_col_materialize_existing(integer);
drop function if exists catalog_col_materialize(text);
drop function if exists catalog_col_attach_node(uuid, text, uuid);
drop function if exists catalog_col_ensure_node(text, uuid, integer);
drop function if exists catalog_col_free_slug(text);
drop function if exists catalog_col_slug(text);
drop function if exists catalog_col_rank(text);
drop function if exists catalog_col_current_snapshot();
drop function if exists catalog_col_prune_snapshots(integer);
drop table if exists catalog_source_col_vernaculars;
drop table if exists catalog_source_col_usages;
