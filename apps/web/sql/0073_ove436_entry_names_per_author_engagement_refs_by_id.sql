-- OVE-436: the entry's name is the author's, and a like is stored against the
-- entry rather than against its name.
--
-- `0070` moved entries to `/@{handle}/{slug}` but left `journal_entries.public_slug`
-- unique across the platform, because three readers identified an entry by its
-- slug alone: the engagement target ref a like, a comment, a bookmark and a
-- follow are stored against (the like budgets that `0017` keyed the same way
-- were dropped by `0049`); the search document id; and the proxy's bounded
-- lookup. The search document has been keyed by the entry id since OVE-242;
-- the proxy reads `(handle, slug)` from this migration on and answers a legacy
-- `/journal/{slug}` from history; and this migration moves the engagement refs
-- onto the entry id. Nothing then knows an entry by its slug alone, so the
-- name can be the gardener's: two gardeners may both call an entry
-- `мій-перший-помідор` (ADR-0029 D6, D9).
--
-- ## 1. The engagement ref becomes the entry id
--
-- The move in `0070` renamed every published slug and did not touch the refs,
-- so every like stored before it pointed at a name nothing answered to any
-- more — measured on production 2026-09-13: both journal-entry likes referenced
-- `томат-sep-1-f66321980b32`, a slug that exists only in the history table.
-- The map below resolves a ref through the live column first and the history
-- second, and is idempotent: a ref that is already an id is left alone, which
-- is what lets every earlier migration replay on a database that has this one.
--
-- Where a unique key contains the ref — a user's like, bookmark or follow on
-- one target — two rows can resolve to the same entry (a like on the old name
-- and one on the new); the older row is kept and the newer deleted before the
-- update, so the key is never violated mid-statement.
--
-- ## 2. The unique index follows the address
--
-- `journal_entries_public_slug_uidx` (global) is replaced by
-- `journal_entries_owner_public_slug_uidx (owner_user_id, public_slug)`. The
-- history table was keyed `(author_handle, slug)` from the start.
--
-- ## 3. The five system topics get their Ukrainian names
--
-- Their labels shipped in English (`Plants`, `Animals`, …) and the code now
-- names them per locale from `system-topic-labels.ts`; the stored label is the
-- primary one and is corrected here so a fallback never says `Plants` again.

create temp table journal_entry_ref_map (
  old_ref text primary key,
  entry_id uuid not null
) on commit drop;

-- Live names first …
insert into journal_entry_ref_map (old_ref, entry_id)
select distinct refs.target_ref, entries.id
from (
  select target_ref from engagement_likes where target_kind = 'journal_entry'
  union select target_ref from engagement_comments where target_kind = 'journal_entry'
  union select target_ref from engagement_bookmarks where target_kind = 'journal_entry'
  union select target_ref from engagement_follows where target_kind = 'journal_entry'
) as refs
join journal_entries as entries on entries.public_slug = refs.target_ref
where refs.target_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (old_ref) do nothing;

-- … then every name an entry has ever had, oldest row first.
insert into journal_entry_ref_map (old_ref, entry_id)
select distinct on (refs.target_ref) refs.target_ref, history.journal_entry_id
from (
  select target_ref from engagement_likes where target_kind = 'journal_entry'
  union select target_ref from engagement_comments where target_kind = 'journal_entry'
  union select target_ref from engagement_bookmarks where target_kind = 'journal_entry'
  union select target_ref from engagement_follows where target_kind = 'journal_entry'
) as refs
join journal_entry_slug_history as history on history.slug = refs.target_ref
where refs.target_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
order by refs.target_ref, history.valid_from asc, history.id asc
on conflict (old_ref) do nothing;

-- Likes: unique per (target, user) and per (target, visitor) since `0049`.
-- Keep the oldest.
delete from engagement_likes as newer
using journal_entry_ref_map as map, engagement_likes as older
where newer.target_kind = 'journal_entry'
  and newer.target_ref = map.old_ref
  and older.target_kind = 'journal_entry'
  and older.id <> newer.id
  and (older.target_ref = map.entry_id::text
       or older.target_ref in (select m2.old_ref from journal_entry_ref_map as m2 where m2.entry_id = map.entry_id))
  and ((newer.user_id is not null and older.user_id = newer.user_id)
       or (newer.visitor_id is not null and older.visitor_id = newer.visitor_id))
  and (older.created_at < newer.created_at
       or (older.created_at = newer.created_at and older.id < newer.id));

update engagement_likes as likes
set target_ref = map.entry_id::text
from journal_entry_ref_map as map
where likes.target_kind = 'journal_entry' and likes.target_ref = map.old_ref;

-- Bookmarks: unique per (owner, target).
delete from engagement_bookmarks as newer
using journal_entry_ref_map as map, engagement_bookmarks as older
where newer.target_kind = 'journal_entry'
  and newer.target_ref = map.old_ref
  and older.target_kind = 'journal_entry'
  and older.id <> newer.id
  and older.owner_user_id = newer.owner_user_id
  and (older.target_ref = map.entry_id::text
       or older.target_ref in (select m2.old_ref from journal_entry_ref_map as m2 where m2.entry_id = map.entry_id))
  and (older.created_at < newer.created_at
       or (older.created_at = newer.created_at and older.id < newer.id));

update engagement_bookmarks as bookmarks
set target_ref = map.entry_id::text
from journal_entry_ref_map as map
where bookmarks.target_kind = 'journal_entry' and bookmarks.target_ref = map.old_ref;

-- Follows: unique per (follower, target).
delete from engagement_follows as newer
using journal_entry_ref_map as map, engagement_follows as older
where newer.target_kind = 'journal_entry'
  and newer.target_ref = map.old_ref
  and older.target_kind = 'journal_entry'
  and older.id <> newer.id
  and older.follower_user_id = newer.follower_user_id
  and (older.target_ref = map.entry_id::text
       or older.target_ref in (select m2.old_ref from journal_entry_ref_map as m2 where m2.entry_id = map.entry_id))
  and (older.created_at < newer.created_at
       or (older.created_at = newer.created_at and older.id < newer.id));

update engagement_follows as follows
set target_ref = map.entry_id::text
from journal_entry_ref_map as map
where follows.target_kind = 'journal_entry' and follows.target_ref = map.old_ref;

-- Comments carry no unique key on the target.
update engagement_comments as comments
set target_ref = map.entry_id::text
from journal_entry_ref_map as map
where comments.target_kind = 'journal_entry' and comments.target_ref = map.old_ref;


-- 2. The name is the gardener's.
drop index if exists journal_entries_public_slug_uidx;
create unique index if not exists journal_entries_owner_public_slug_uidx
  on journal_entries (owner_user_id, public_slug)
  where public_slug is not null;

-- 3. System topics, named in the product's own language.
update journal_topics set label = 'Рослини'
  where slug = 'plants' and label = 'Plants';
update journal_topics set label = 'Тварини'
  where slug = 'animals' and label = 'Animals';
update journal_topics set label = 'Види'
  where slug = 'species' and label = 'Species';
update journal_topics set label = 'Сорти рослин'
  where slug = 'plant-varieties' and label = 'Plant varieties';
update journal_topics set label = 'Породи'
  where slug = 'breeds' and label = 'Breeds';
