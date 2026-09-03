-- Rollback of 0047: drops the variant columns and their constraints. The
-- variant objects in R2 are not touched; without the column nothing lists
-- them, so a later revoke of the primary leaves them orphaned until the
-- migration is applied again.

alter table media_assets
  drop constraint if exists media_assets_variant_long_edges_check;

alter table media_assets
  drop constraint if exists media_assets_placeholder_data_uri_check;

alter table media_assets
  drop column if exists variant_long_edges;

alter table media_assets
  drop column if exists placeholder_data_uri;
