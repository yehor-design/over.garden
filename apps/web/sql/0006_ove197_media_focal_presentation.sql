-- OVE-197: subject-aware media focal + intrinsic presentation metadata.
-- Additive only. Existing rows get safe center defaults.

alter table media_assets
  add column if not exists intrinsic_width integer,
  add column if not exists intrinsic_height integer,
  add column if not exists focal_x double precision,
  add column if not exists focal_y double precision;

update media_assets
set
  focal_x = coalesce(focal_x, 0.5),
  focal_y = coalesce(focal_y, 0.5)
where focal_x is null
   or focal_y is null;

alter table media_assets
  alter column focal_x set default 0.5,
  alter column focal_y set default 0.5;

alter table media_assets
  alter column focal_x set not null,
  alter column focal_y set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_intrinsic_width_positive_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_intrinsic_width_positive_check
      check (intrinsic_width is null or intrinsic_width >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_intrinsic_height_positive_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_intrinsic_height_positive_check
      check (intrinsic_height is null or intrinsic_height >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_focal_x_range_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_focal_x_range_check
      check (focal_x >= 0 and focal_x <= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_focal_y_range_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_focal_y_range_check
      check (focal_y >= 0 and focal_y <= 1);
  end if;
end $$;
