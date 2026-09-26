-- OVE-523 (ADR-0036 D1, ADR-0035 D1): a photograph can belong to a space or
-- to a plant or animal, not only to a journal entry.
--
-- A space gets an optional photo in its creation stepper and in its settings;
-- an object gets one in its stepper (29.14). Both are the same browser-made
-- WebP a journal photo is (ADR-0022 D2): one `media_assets` row per photo,
-- its variants named by `variant_long_edges`, promoted from staging when the
-- space or the object is created. So the row learns two more owners and
-- keeps exactly one of the three.
--
-- `journal_entry_id` stops being required; `0038` set it `not null`, and its
-- statement is guarded so a replay over a database that already holds space
-- or object photos leaves them alone. Deleting a space or an object removes
-- its photo row with it; the stored files are revoked by the code path that
-- deletes (the same queue journal photos use), never by the cascade.
--
-- Nothing is backfilled: no photo belongs to a space or an object yet.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table media_assets
  alter column journal_entry_id drop not null;

alter table media_assets
  add column if not exists space_id uuid references spaces(id) on delete cascade,
  add column if not exists plant_object_id uuid references plant_objects(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_single_owner_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_single_owner_check
      check (num_nonnulls(journal_entry_id, space_id, plant_object_id) = 1);
  end if;
end $$;

-- A space and an object each have one photo at a time; replacing it revokes
-- the old row before the new one is written.
create unique index if not exists media_assets_one_photo_per_space_uidx
  on media_assets (space_id)
  where space_id is not null and revoked_at is null;

create unique index if not exists media_assets_one_photo_per_object_uidx
  on media_assets (plant_object_id)
  where plant_object_id is not null and revoked_at is null;
