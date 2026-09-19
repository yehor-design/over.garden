-- OVE-465: a topic and an object passport take Latin names.
--
-- ADR-0029 D4 kept the gardener's own alphabet in the address of a tag and of
-- a passport, because a search result renders it decoded. A browser hands the
-- clipboard the percent-encoded form, six characters for every Cyrillic
-- letter, and the address bar is how a link travels here. The owner decided on
-- 2026-09-18 that every address is ASCII; this is the schema half for the two
-- namespaces that had issued Cyrillic names. Entries went to numbers in `0076`.
--
-- ## 1. A topic gets the history an entry and a passport already have
--
-- `0070` gave `journal_entries` and `plant_objects` a slug history, so that an
-- address that moves keeps answering 308 (D8). A topic never needed one: its
-- slug was derived from its label once and nothing ever moved it. Romanizing
-- it is the first move, and without a history `/topics/помідори` would answer
-- 404 the moment it became `/topics/pomidory`.
--
-- Topics are global, so the key is the slug alone — the same reason
-- `journal_topics.slug` is `unique` by itself.
--
-- ## 2. The names themselves move in `pnpm address:names:romanize`
--
-- Romanization is TypeScript (`src/lib/address/romanize.ts`: the Cabinet of
-- Ministers resolution 55 of 2010 for Ukrainian, the 2009 transliteration law
-- for Bulgarian), and it depends on the language a name was written in, which
-- no SQL expression here knows. The script reads that language off the entries
-- and writes the names; the triggers record every move.
--
-- ## 3. The Latin `CHECK` arrives only when nothing is left for it to refuse
--
-- A `CHECK` has to admit the rows a table already holds. So each generated
-- block below runs only when its column holds no name outside the Latin
-- alphabet: on a fresh database that is immediately, and on a database with
-- Cyrillic names it is the replay of this migration *after* the romanize
-- script has run. Until then the column keeps the wider constraint `0069` or
-- `0070` gave it, which admits every Latin name too — so the code that issues
-- Latin names can deploy before, between or after the two steps.
--
-- Replaying `0069` and `0070` afterwards re-adds their wider constraints, and
-- this file, which runs after them, narrows the columns again. Order is what
-- makes the replay converge.

create table if not exists journal_topic_slug_history (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  journal_topic_id uuid not null references journal_topics(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  constraint journal_topic_slug_history_slug_uidx unique (slug),
  constraint journal_topic_slug_history_validity_check
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists journal_topic_slug_history_topic_idx
  on journal_topic_slug_history (journal_topic_id);

create or replace function journal_topic_slug_history_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    update journal_topic_slug_history
    set valid_to = now()
    where slug = old.slug
      and journal_topic_id = old.id
      and valid_to is null;
  end if;
  insert into journal_topic_slug_history (slug, journal_topic_id, valid_from, valid_to)
  values (new.slug, new.id, now(), null)
  on conflict (slug) do update
    set journal_topic_id = excluded.journal_topic_id,
        valid_from = case
          when journal_topic_slug_history.journal_topic_id = excluded.journal_topic_id
          then journal_topic_slug_history.valid_from
          else now()
        end,
        valid_to = null;
  return new;
end $$;

drop trigger if exists journal_topic_slug_history_sync_trg on journal_topics;
create trigger journal_topic_slug_history_sync_trg
  after insert or update of slug on journal_topics
  for each row execute function journal_topic_slug_history_sync();

-- Every address a topic already has becomes its first history row. The
-- romanize script then moves the slug, which the trigger records as a second
-- row and closes this one — so the old address answers 308 rather than 404.
insert into journal_topic_slug_history (slug, journal_topic_id, valid_from)
select topics.slug, topics.id, topics.created_at
from journal_topics as topics
on conflict (slug) do nothing;

-- The Latin constraint on a topic's name, once no topic holds a Cyrillic one.
do $guard$
begin
  if not exists (
    select 1 from journal_topics where slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) then
    execute $block$
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
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    );
end $$;
    $block$;
  end if;
end $guard$;

-- And on a passport's, once no object holds one.
do $guard$
begin
  if not exists (
    select 1
    from plant_objects
    where public_slug is not null
      and public_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) then
    execute $block$
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
        and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      )
    );
end $$;
    $block$;
  end if;
end $guard$;
