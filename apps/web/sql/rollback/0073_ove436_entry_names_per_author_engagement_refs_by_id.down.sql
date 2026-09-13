-- Rollback of 0073: the entry's name goes back to being the platform's, and a
-- like goes back to being stored against the name.
--
-- Safe only while no two gardeners share a slug: recreating the global unique
-- index fails otherwise, and that failure is the honest answer — the names
-- that were given under the per-author rule cannot be made global by a
-- statement. Refs go back to the entry's *current* slug; a ref whose entry has
-- no slug any more has nothing to go back to and keeps the id. The topic
-- labels stay: a Ukrainian label is right under either rule.

update engagement_likes as likes
set target_ref = entries.public_slug
from journal_entries as entries
where likes.target_kind = 'journal_entry'
  and likes.target_ref = entries.id::text
  and entries.public_slug is not null;

update engagement_bookmarks as bookmarks
set target_ref = entries.public_slug
from journal_entries as entries
where bookmarks.target_kind = 'journal_entry'
  and bookmarks.target_ref = entries.id::text
  and entries.public_slug is not null;

update engagement_follows as follows
set target_ref = entries.public_slug
from journal_entries as entries
where follows.target_kind = 'journal_entry'
  and follows.target_ref = entries.id::text
  and entries.public_slug is not null;

update engagement_comments as comments
set target_ref = entries.public_slug
from journal_entries as entries
where comments.target_kind = 'journal_entry'
  and comments.target_ref = entries.id::text
  and entries.public_slug is not null;


drop index if exists journal_entries_owner_public_slug_uidx;
create unique index if not exists journal_entries_public_slug_uidx
  on journal_entries (public_slug)
  where public_slug is not null;
