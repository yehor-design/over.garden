-- Rollback of 0068: the journal entry slug column goes back to having no
-- shape at all.
--
-- There is nothing narrower to restore. `journal_entries.public_slug` carried
-- no CHECK before 0068, which is the defect 0068 closed, so the rollback is a
-- plain drop rather than a re-add of an older constraint.
--
-- No row is touched. A slug written while 0068 was live stays exactly as it
-- is, and a replay of 0068 accepts it again: the constraint only ever refused
-- shapes nothing in the table had.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_public_slug_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_public_slug_check;
  end if;
end $$;
