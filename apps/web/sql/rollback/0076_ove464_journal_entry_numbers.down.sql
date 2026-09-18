-- Rollback of 0076: an entry stops having a number.
--
-- Only meaningful together with the application release that preceded it: the
-- code that ships with `0076` builds every entry address from the number, so
-- rolling the schema back under that code leaves every entry without an
-- address. Roll the release back first.
--
-- It cannot restore what it drops. The numbers are assigned in publish order
-- and the counters only ever grow, so re-applying `0076` afterwards gives the
-- entries that existed the same numbers again (same order, same rows) — but a
-- number that had belonged to an entry purged in the meantime is no longer
-- remembered as taken, and would be issued again. Links already shared at
-- `/@{handle}/post/{n}` answer 404 for as long as this rollback stands.

drop trigger if exists journal_entry_number_assign_trg on journal_entries;
drop function if exists journal_entry_number_assign();
drop function if exists assign_journal_entry_number(uuid);
drop table if exists journal_entry_number_counters;
drop index if exists journal_entries_owner_entry_number_uidx;

alter table journal_entries
  drop constraint if exists journal_entries_author_entry_number_check;

alter table journal_entries
  drop column if exists author_entry_number;
