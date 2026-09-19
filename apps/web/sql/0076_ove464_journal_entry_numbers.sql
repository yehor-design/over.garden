-- OVE-464: an entry is addressed by its number.
--
-- A journal entry lived at `/@{handle}/{slug}`, its name made from the title
-- in the gardener's own alphabet (ADR-0029 D4 as first written). A browser
-- hands the clipboard the percent-encoded form of that — six characters for
-- every Cyrillic letter — and the product has no share control, so the address
-- bar is how every link travels. One entry arrived as 181 characters of
-- `%D0%BA%D1%80…`. The owner decided on 2026-09-18 that an entry lives at
-- `/@{handle}/post/{n}` instead (ADR-0029 D9, amendment of that date).
--
-- This migration is the schema half: the number, where it comes from, and the
-- numbers of the entries that already exist. The name — `public_slug`, its
-- history table and its trigger from `0070` — is untouched: it is what every
-- link shared so far is made of, and it answers 308 for as long as the entry
-- exists.
--
-- ## 1. The number is the author's own count
--
-- `/@yehor/post/1` and `/@olena/post/1` are two entries; the handle tells them
-- apart. The pair `(owner_user_id, author_entry_number)` is unique, and the
-- column is nullable because a row that was never an address has none: the
-- development database holds rows in the retired `archived` lifecycle state
-- that no statement can write to (ADR-0029 D11, amendment of 2026-09-11).
--
-- ## 2. A durable counter, because "never reused" outlives the row
--
-- Deletion purges an entry's row once its retention window ends (ADR-0021). If
-- the purged entry was its author's newest, `max(author_entry_number) + 1`
-- would hand its number to the next publish, and a link somebody shared to the
-- deleted entry would silently start opening a different one. So the number
-- comes from `journal_entry_number_counters`, which only ever grows. One
-- upsert increments and returns; the counter row's own lock is what makes two
-- concurrent publishes by one author differ, and a publish that rolls back
-- takes its increment with it, so a failed publish leaves no gap either.
--
-- The table carries no foreign key to `"user"`, the same as
-- `journal_entries.owner_user_id` itself: fixtures, imports and proofs insert
-- entries for owners that have no account row, and a number must not be the
-- reason such an insert fails. Account erasure deletes the row explicitly.
--
-- ## 3. A trigger, because publish is not the only insert
--
-- `prepareAtomicCreateTransaction` serializes one owner's publishes, but some
-- twenty-five other places insert entries — imports, fixtures, database
-- proofs, browser specs. A `before insert` trigger is what makes the number
-- unconditional. An insert that brings its own number keeps it, and moves the
-- counter past it so the next publish cannot collide with it.
--
-- ## 4. Existing entries, oldest first
--
-- Numbered per owner by publish date, as the owner decided. Only `active`
-- rows, for the reason in section 1. Written so that a replay numbers nothing
-- twice: only rows still without a number are numbered, and they continue from
-- the owner's counter rather than restarting at 1.

alter table journal_entries
  add column if not exists author_entry_number integer;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_author_entry_number_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_author_entry_number_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_author_entry_number_check
    check (
      author_entry_number is null
      or (
        author_entry_number between 1 and 999999999
      )
    );
end $$;

create unique index if not exists journal_entries_owner_entry_number_uidx
  on journal_entries (owner_user_id, author_entry_number)
  where author_entry_number is not null;

create table if not exists journal_entry_number_counters (
  owner_user_id uuid primary key,
  last_number integer not null
    check (last_number between 0 and 999999999),
  updated_at timestamptz not null default now()
);

create or replace function assign_journal_entry_number(owner uuid)
returns integer
language sql
as $$
  insert into journal_entry_number_counters as counters (owner_user_id, last_number)
  values (owner, 1)
  on conflict (owner_user_id) do update
    set last_number = counters.last_number + 1,
        updated_at = now()
  returning last_number
$$;

create or replace function journal_entry_number_assign()
returns trigger
language plpgsql
as $$
begin
  if new.author_entry_number is null then
    new.author_entry_number := assign_journal_entry_number(new.owner_user_id);
  else
    insert into journal_entry_number_counters as counters (owner_user_id, last_number)
    values (new.owner_user_id, new.author_entry_number)
    on conflict (owner_user_id) do update
      set last_number = greatest(counters.last_number, excluded.last_number),
          updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists journal_entry_number_assign_trg on journal_entries;
create trigger journal_entry_number_assign_trg
  before insert on journal_entries
  for each row execute function journal_entry_number_assign();

with pending as (
  select
    entries.id,
    coalesce(counters.last_number, 0)
      + row_number() over (
          partition by entries.owner_user_id
          order by
            coalesce(entries.published_at, entries.created_at),
            entries.created_at,
            entries.id
        ) as entry_number
  from journal_entries as entries
  left join journal_entry_number_counters as counters
    on counters.owner_user_id = entries.owner_user_id
  where entries.lifecycle_state = 'active'
    and entries.author_entry_number is null
)
update journal_entries as entries
set author_entry_number = pending.entry_number
from pending
where entries.id = pending.id;

insert into journal_entry_number_counters as counters (owner_user_id, last_number)
select entries.owner_user_id, max(entries.author_entry_number)
from journal_entries as entries
where entries.author_entry_number is not null
group by entries.owner_user_id
on conflict (owner_user_id) do update
  set last_number = greatest(counters.last_number, excluded.last_number),
      updated_at = now();
