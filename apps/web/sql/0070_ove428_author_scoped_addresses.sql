-- OVE-428: an address belongs to the gardener who wrote it.
--
-- A journal entry has lived at `/journal/{slug}` since the walking skeleton,
-- and an object passport at `/lineage/objects/{uuid}`. Both are wrong for the
-- same reason and in opposite ways: the entry namespace is flat and global, so
-- "мій перший помідор" collides across gardeners and *forced* twelve
-- hexadecimal characters of the publish id into every published URL; the
-- passport namespace has no names in it at all, only database identifiers.
--
-- ADR-0029 D9 puts both under the author: `/@{handle}/{slug}` and
-- `/@{handle}/objects/{slug}`. A collision becomes per-person and rare, the
-- suffix goes, and the first-hand claim — the product's whole proposition — is
-- in the address where a reader and an answer engine both see it.
--
-- This migration is the schema half. The slugs themselves are recomputed by
-- `pnpm address:entries:move`, because the slugifier is TypeScript and
-- `NFC`-aware in a way no SQL expression here could be.
--
-- ## 1. The entry name stays platform-unique; the passport name does not
--
-- `journal_entries_public_slug_uidx` is global and **stays** global, even
-- though the address is now author-scoped. Three things identify an entry by
-- its slug alone and by nothing else: the engagement target ref that a like
-- and a comment are stored against, the Meilisearch document id, and the
-- proxy's bounded lookup. Making the slug ambiguous without first moving all
-- three onto the entry id would let two gardeners' likes land on one row. The
-- visible outcome is unchanged — the address is `/@{handle}/{slug}` either way
-- — and the only difference is that a collision between two *different*
-- gardeners takes a `-2` from the counter (ADR-0029 D6) instead of being
-- impossible. There are eleven public entries and eighty-one gardeners, so it
-- has never happened; moving those three identifiers to the entry id is what
-- would let the name follow the address.
--
-- `plant_objects.public_slug` has no such readers, so it is unique per owner
-- from the start — which matters more there, because "Томат" is what half the
-- gardens on this platform will call their tomato.
--
-- ## 2. A passport gets a name
--
-- `plant_objects.public_slug` is nullable because most objects are private and
-- have no public address at all. Only an object with a public entry is given
-- one, by the move script.
--
-- ## 3. Two history tables, keyed by the handle
--
-- `normalized_handle` is the primary key of `user_handle_registry`, so a handle
-- is never reused by a second person even after it is retired. That makes
-- `(author_handle, slug)` a safe key: a row can only ever name one entry, and a
-- retired handle keeps answering for the entries it used to carry.
--
-- The triggers are `catalog_item_slug_history_sync` of `0054`, with the handle
-- resolved from the registry. Assigning a slug writes history; moving one
-- closes the row it left and opens the row it arrived at, so every address an
-- entry has ever had answers 308 forever (D8).

-- A passport's public name, unique per gardener.
alter table plant_objects
  add column if not exists public_slug text;

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

create unique index if not exists plant_objects_owner_public_slug_uidx
  on plant_objects (owner_user_id, public_slug)
  where public_slug is not null;

create table if not exists journal_entry_slug_history (
  id uuid primary key default gen_random_uuid(),
  author_handle text not null
    check (author_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
  slug text not null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  constraint journal_entry_slug_history_handle_slug_uidx unique (author_handle, slug),
  constraint journal_entry_slug_history_validity_check
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists journal_entry_slug_history_entry_idx
  on journal_entry_slug_history (journal_entry_id);

create table if not exists plant_object_slug_history (
  id uuid primary key default gen_random_uuid(),
  author_handle text not null
    check (author_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
  slug text not null,
  plant_object_id uuid not null references plant_objects(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  constraint plant_object_slug_history_handle_slug_uidx unique (author_handle, slug),
  constraint plant_object_slug_history_validity_check
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists plant_object_slug_history_object_idx
  on plant_object_slug_history (plant_object_id);

-- The author's address prefix, as the registry holds it right now. `null` when
-- the person has no current handle, which is why both triggers below simply do
-- nothing in that case: there is no address to record.
create or replace function public_author_handle(owner uuid)
returns text
language sql
stable
as $$
  select normalized_handle
  from user_handle_registry
  where user_id = owner
    and lifecycle_state = 'current'
  limit 1
$$;

create or replace function journal_entry_slug_history_sync()
returns trigger
language plpgsql
as $$
declare
  new_handle text;
  old_handle text;
begin
  new_handle := public_author_handle(new.owner_user_id);
  if tg_op = 'UPDATE' then
    old_handle := public_author_handle(old.owner_user_id);
    if old.public_slug is not null
       and old_handle is not null
       and (old.public_slug is distinct from new.public_slug
            or old_handle is distinct from new_handle) then
      update journal_entry_slug_history
      set valid_to = now()
      where author_handle = old_handle
        and slug = old.public_slug
        and journal_entry_id = old.id
        and valid_to is null;
    end if;
  end if;
  if new.public_slug is not null and new_handle is not null then
    insert into journal_entry_slug_history (author_handle, slug, journal_entry_id, valid_from, valid_to)
    values (new_handle, new.public_slug, new.id, now(), null)
    on conflict (author_handle, slug) do update
      set journal_entry_id = excluded.journal_entry_id,
          valid_from = case
            when journal_entry_slug_history.journal_entry_id = excluded.journal_entry_id
            then journal_entry_slug_history.valid_from
            else now()
          end,
          valid_to = null;
  end if;
  return new;
end $$;

drop trigger if exists journal_entry_slug_history_sync_trg on journal_entries;
create trigger journal_entry_slug_history_sync_trg
  after insert or update of public_slug, owner_user_id on journal_entries
  for each row execute function journal_entry_slug_history_sync();

create or replace function plant_object_slug_history_sync()
returns trigger
language plpgsql
as $$
declare
  new_handle text;
  old_handle text;
begin
  new_handle := public_author_handle(new.owner_user_id);
  if tg_op = 'UPDATE' then
    old_handle := public_author_handle(old.owner_user_id);
    if old.public_slug is not null
       and old_handle is not null
       and (old.public_slug is distinct from new.public_slug
            or old_handle is distinct from new_handle) then
      update plant_object_slug_history
      set valid_to = now()
      where author_handle = old_handle
        and slug = old.public_slug
        and plant_object_id = old.id
        and valid_to is null;
    end if;
  end if;
  if new.public_slug is not null and new_handle is not null then
    insert into plant_object_slug_history (author_handle, slug, plant_object_id, valid_from, valid_to)
    values (new_handle, new.public_slug, new.id, now(), null)
    on conflict (author_handle, slug) do update
      set plant_object_id = excluded.plant_object_id,
          valid_from = case
            when plant_object_slug_history.plant_object_id = excluded.plant_object_id
            then plant_object_slug_history.valid_from
            else now()
          end,
          valid_to = null;
  end if;
  return new;
end $$;

drop trigger if exists plant_object_slug_history_sync_trg on plant_objects;
create trigger plant_object_slug_history_sync_trg
  after insert or update of public_slug, owner_user_id on plant_objects
  for each row execute function plant_object_slug_history_sync();

-- Every address an entry already has becomes its first history row. The move
-- script then reassigns the slug, which the trigger records as a second row and
-- closes this one — so the old address answers 308 rather than disappearing.
insert into journal_entry_slug_history (author_handle, slug, journal_entry_id, valid_from)
select
  public_author_handle(entry.owner_user_id),
  entry.public_slug,
  entry.id,
  coalesce(entry.published_at, entry.created_at)
from journal_entries as entry
where entry.public_slug is not null
  and public_author_handle(entry.owner_user_id) is not null
on conflict (author_handle, slug) do nothing;
