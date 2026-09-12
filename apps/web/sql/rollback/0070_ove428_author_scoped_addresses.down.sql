-- Rollback of 0070: addresses go back to being the platform's.
--
-- The history tables are dropped with their triggers. That loses every 308 an
-- entry has answered since the move, which is why `pnpm address:entries:move`
-- prints the old-to-new mapping before it writes anything: the mapping is the
-- part a rollback cannot reconstruct.
--
-- `plant_objects.public_slug` is dropped rather than kept. Keeping it would
-- leave a column nothing reads, holding names the slugifier produced under a
-- contract this rollback removes.

drop trigger if exists journal_entry_slug_history_sync_trg on journal_entries;
drop trigger if exists plant_object_slug_history_sync_trg on plant_objects;
drop function if exists journal_entry_slug_history_sync();
drop function if exists plant_object_slug_history_sync();
drop function if exists public_author_handle(uuid);

drop table if exists journal_entry_slug_history;
drop table if exists plant_object_slug_history;

drop index if exists plant_objects_owner_public_slug_uidx;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_public_slug_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      drop constraint plant_objects_public_slug_check;
  end if;
end $$;

alter table plant_objects
  drop column if exists public_slug;
