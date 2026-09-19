-- Rollback of 0077: a topic loses its name history, and the two columns go
-- back to admitting the gardener's own alphabet.
--
-- It does not un-romanize anything. The names `pnpm address:names:romanize`
-- wrote are legal under the wider constraints too, so they stay, and the
-- passports keep answering 308 from `plant_object_slug_history` of `0070`.
-- What is lost is the 308 from a topic's Cyrillic address: that history lives
-- only in the table this drops, and re-applying `0077` afterwards seeds it
-- from the names the topics have *then*, which are the Latin ones.

drop trigger if exists journal_topic_slug_history_sync_trg on journal_topics;
drop function if exists journal_topic_slug_history_sync();
drop table if exists journal_topic_slug_history;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_topics_slug_check'
      and conrelid = 'journal_topics'::regclass
  ) then
    alter table journal_topics
      drop constraint journal_topics_slug_check;
  end if;

  alter table journal_topics
    add constraint journal_topics_slug_check
    check (
      char_length(slug) between 1 and 64
      and slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
    );
end $$;

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

  alter table plant_objects
    add constraint plant_objects_public_slug_check
    check (
      public_slug is null
      or (
        char_length(public_slug) between 1 and 96
        and public_slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
      )
    );
end $$;
