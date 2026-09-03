-- OVE-371 (ADR-0022, D2): the browser now encodes a 2560 primary WebP plus
-- 1280 and 480 variants and a 16 px placeholder for every journal photo. The
-- objects live next to the primary under
-- `derivatives/<media_asset_id>/<generation>-<long_edge>.webp`; the row keeps
-- only which long edges exist, so every consumer derives the keys from
-- `derivative_key` and never guesses whether a variant was staged.
--
-- The placeholder is an inline data URI (at most 400 bytes of WebP, so under
-- 600 characters once base64-encoded) that the page paints behind the
-- `<img>` until the real bytes arrive.
--
-- Both columns are nullable: rows published before this migration have
-- neither, and the web deploy probes for the columns before writing them, so
-- the deploy is safe whether it lands before or after this migration.

alter table media_assets
  add column if not exists placeholder_data_uri text;

alter table media_assets
  add column if not exists variant_long_edges integer[];

alter table media_assets
  drop constraint if exists media_assets_placeholder_data_uri_check;

alter table media_assets
  add constraint media_assets_placeholder_data_uri_check
  check (
    placeholder_data_uri is null
    or (
      left(placeholder_data_uri, 23) = 'data:image/webp;base64,'
      and octet_length(placeholder_data_uri) <= 600
    )
  );

alter table media_assets
  drop constraint if exists media_assets_variant_long_edges_check;

alter table media_assets
  add constraint media_assets_variant_long_edges_check
  check (
    variant_long_edges is null
    or variant_long_edges <@ array[1280, 480]
  );
