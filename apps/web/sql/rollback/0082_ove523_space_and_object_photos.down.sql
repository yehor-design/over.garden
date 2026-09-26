-- Rollback of 0082 (OVE-523). Space and object photos cannot live without the
-- columns, so a rollback first needs their stored files revoked through the
-- media lifecycle queue (the release being rolled back to cannot see them);
-- this script refuses while any such row is live rather than dropping it.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1 from media_assets
    where (space_id is not null or plant_object_id is not null)
      and revoked_at is null
  ) then
    raise exception '0082 rollback refused: live space or object photos remain'
      using errcode = 'check_violation';
  end if;
end $$;

delete from media_assets where space_id is not null or plant_object_id is not null;

drop index if exists media_assets_one_photo_per_object_uidx;
drop index if exists media_assets_one_photo_per_space_uidx;

alter table media_assets
  drop constraint if exists media_assets_single_owner_check,
  drop column if exists plant_object_id,
  drop column if exists space_id;

alter table media_assets
  alter column journal_entry_id set not null;
