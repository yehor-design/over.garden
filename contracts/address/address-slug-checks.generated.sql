-- Generated from apps/web/src/lib/address/address-manifest.ts. Do not edit.
--
-- Regenerate with `pnpm address:contract:build` from apps/web;
-- `pnpm address:contract:check` fails when this file and the manifest
-- disagree. A migration that installs one of these blocks copies its text
-- verbatim, and a test asserts the copy is identical.

-- catalog_items_public_slug_check — species, form
-- declared only: no migration installs this block yet, and the column keeps the narrower CHECK it already has
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_public_slug_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      drop constraint catalog_items_public_slug_check;
  end if;

  alter table catalog_items
    add constraint catalog_items_public_slug_check
    check (
      public_slug is null
      or (
        char_length(public_slug) between 1 and 96
        and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      )
    );
end $$;

-- communities_slug_check — community
-- declared only: no migration installs this block yet, and the column keeps the narrower CHECK it already has
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'communities_slug_check'
      and conrelid = 'communities'::regclass
  ) then
    alter table communities
      drop constraint communities_slug_check;
  end if;

  alter table communities
    add constraint communities_slug_check
    check (
      char_length(slug) between 1 and 64
      and slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
    );
end $$;

-- journal_entries_public_slug_check — journalEntry
-- installed by migration 0068
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

  alter table journal_entries
    add constraint journal_entries_public_slug_check
    check (
      public_slug is null
      or (
        char_length(public_slug) between 1 and 96
        and public_slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
      )
    );
end $$;

-- journal_topics_slug_check — topic
-- installed by migration 0069
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
