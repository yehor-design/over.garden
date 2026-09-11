-- Rollback of 0067: narrow the value set back to uk/bg.
--
-- The languages written while 0067 was live stay where the old constraint can
-- still hold them. Only `ru` cannot — it is not in the old set — and those rows
-- are cleared rather than guessed at. A replay of 0067 recomputes them.
--
-- The clearing carries the same `lifecycle_state = 'active'` clause as the
-- forward migration, and for the same reason: rows in the retired `archived`
-- state cannot be written to while
-- `journal_entries_lifecycle_state_check` is NOT VALID. They cannot hold `ru`
-- either, since 0067 never wrote to them.
--
-- Nothing here drops NOT NULL, because 0067 never set it.

update journal_entries
set source_language = null
where source_language = 'ru'
  and lifecycle_state = 'active';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_source_language_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_source_language_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_source_language_check
    check (
      source_language is null
      or source_language in ('uk', 'bg')
    );
end $$;
