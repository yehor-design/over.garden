-- Rollback of 0069: the topic slug column goes back to ASCII.
--
-- This is the one rollback in the slice that can refuse to run, and it should.
-- A topic slug written in Cyrillic while 0069 was live cannot satisfy the old
-- pattern, and there is no honest way to convert it: transliterating changes a
-- public address, and deleting the row takes a gardener's tag and every
-- entry's membership in it with no way back.
--
-- So the constraint is re-added as written, and Postgres validates it against
-- the rows. If any Cyrillic topic exists the statement fails with 23514 and
-- the transaction rolls back, which is the correct outcome: the schema change
-- is reversible exactly while nothing has used it.

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
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$');
end $$;
