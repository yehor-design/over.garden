-- Rollback of 0049: returns `engagement_likes` to the anonymous device-hash
-- shape and restores the per-target budget table.
--
-- The honest limit of this file: it restores the *columns*, never the *rows*.
-- Forward, 0049 deletes every like, because `anonymous_device_hash` cannot be
-- derived from a `user_id` or a `visitor_id` any more than it could be
-- converted into one. Running this rollback leaves an empty table with the old
-- shape, and every like cast after 0049 is gone. That was accepted by the owner
-- on 2026-09-04 with all eight public entries reading zero.
--
-- Rows are deleted before the columns come back for the same reason: any row
-- written under the new shape has no device hash, and the column is NOT NULL.

begin;

delete from engagement_likes;

drop index if exists engagement_likes_user_recent_idx;
drop index if exists engagement_likes_target_idx;
drop index if exists engagement_likes_visitor_target_uidx;
drop index if exists engagement_likes_user_target_uidx;

alter table engagement_likes
  drop constraint if exists engagement_likes_user_id_fkey;

alter table engagement_likes
  drop constraint if exists engagement_likes_single_owner_check;

alter table engagement_likes
  drop column if exists user_id,
  drop column if exists visitor_id;

alter table engagement_likes
  add column if not exists anonymous_device_hash text not null
    check (anonymous_device_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists like_state text not null default 'active'
    check (like_state in ('active', 'removed')),
  add column if not exists toggle_window_started_at timestamptz not null default now(),
  add column if not exists toggle_count integer not null default 1
    check (toggle_count between 1 and 50),
  add column if not exists capability_expires_at timestamptz;

alter table engagement_likes
  add constraint engagement_likes_device_target_uidx
  unique (target_kind, target_ref, anonymous_device_hash);

alter table engagement_likes
  add constraint engagement_likes_capability_expiry_check
  check (
    capability_expires_at is null
    or capability_expires_at > created_at
  );

create index if not exists engagement_likes_target_capability_expiry_idx
  on engagement_likes (target_kind, target_ref, capability_expires_at)
  where capability_expires_at is not null;

create table if not exists engagement_like_target_budgets (
  target_kind text not null check (
    target_kind in ('journal_entry', 'lineage_object', 'variety', 'topic')
  ),
  target_ref text not null check (
    char_length(target_ref) between 1 and 160
    and target_ref !~ '[[:cntrl:][:space:]?#]'
  ),
  active_like_count integer not null default 0 check (
    active_like_count between 0 and 64
  ),
  resident_like_count integer not null default 0 check (
    resident_like_count between 0 and 128
  ),
  updated_at timestamptz not null default now(),
  constraint engagement_like_target_budgets_active_resident_check
    check (active_like_count <= resident_like_count),
  primary key (target_kind, target_ref)
);

commit;
