-- A like becomes a permanent row with exactly one owner.
--
-- What `engagement_likes` was, measured on 2026-09-04:
--
--   * It had no owner. The only identity was `anonymous_device_hash`, a
--     SHA-256 of a capability token scoped to one target. A signed-in
--     gardener's like was not theirs: it could not be listed on their profile,
--     it did not follow them to another device, and it could not be removed
--     from a second session.
--   * It stopped counting after 24 hours. `buildCountActiveEngagementLikesQuery`
--     required `capability_expires_at > now()`, the capability lived exactly
--     24 h, and the toggle path never refreshed it. `removeExpiredAnonymousLikeRows`
--     then deleted the row outright on the next like to the same target.
--   * It could not pass 64. `engagement_like_target_budgets.active_like_count`
--     carried `between 0 and 64` as a CHECK, and the repository raised a
--     capacity refusal at the same number. An entry could never display a 65th
--     like however many people wanted to give it one.
--
-- Owner decision of 2026-09-04 (hybrid ownership): a row belongs to exactly
-- one of `user_id` or `visitor_id`. The account half survives devices, feeds a
-- gardener's own list, and is the only half any future ranking may read; the
-- visitor half rests on one signed site-wide cookie set on first like, and is
-- claimed into the account at sign-up. Both are permanent and uncapped, and
-- both count toward the public number. Deciding trust at read time rather than
-- write time is what keeps that choice open.
--
-- Owner decision of 2026-09-04 (row deletion, AGENTS.md rule 10 sign-off given
-- explicitly): the existing rows are dropped rather than converted.
-- `anonymous_device_hash` is derived from a token scoped to one target and held
-- in someone's browser; it names neither a person nor a device this schema can
-- reach, so no function from old rows to new ones exists. Keeping them with a
-- null owner would leave permanent rows nobody could ever remove. Measured the
-- same day: all eight public journal entries displayed zero likes, and no row
-- could be older than 24 hours by construction.

begin;

-- The budget table existed only to enforce the ceilings this migration
-- removes. Its rows are derived counters, not user content.
drop table if exists engagement_like_target_budgets;

-- The old identity, the expiry, and the toggle-rate window all go together:
-- each of them exists only because a like had no owner to attribute it to.
delete from engagement_likes;

drop index if exists engagement_likes_target_capability_expiry_idx;

alter table engagement_likes
  drop constraint if exists engagement_likes_capability_expiry_check;

alter table engagement_likes
  drop constraint if exists engagement_likes_device_target_uidx;

alter table engagement_likes
  drop column if exists anonymous_device_hash,
  drop column if exists capability_expires_at,
  drop column if exists toggle_window_started_at,
  drop column if exists toggle_count,
  drop column if exists like_state;

alter table engagement_likes
  add column if not exists user_id uuid,
  add column if not exists visitor_id uuid;

-- Exactly one owner. `<>` on two booleans is XOR, which is the whole rule: a
-- row with both owners could be counted twice and removed by neither, and a row
-- with no owner could be removed by nobody at all.
alter table engagement_likes
  drop constraint if exists engagement_likes_single_owner_check;

alter table engagement_likes
  add constraint engagement_likes_single_owner_check
  check ((user_id is not null) <> (visitor_id is not null));

do $$
begin
  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'engagement_likes_user_id_fkey'
        and conrelid = 'engagement_likes'::regclass
    ) then
      alter table engagement_likes
        add constraint engagement_likes_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;
  end if;
end $$;

-- One like per owner per target, enforced per owner column. Partial indexes
-- rather than one composite: a NULL never equals a NULL in a unique index, so a
-- single index over both columns would admit unlimited duplicates.
create unique index if not exists engagement_likes_user_target_uidx
  on engagement_likes (target_kind, target_ref, user_id)
  where user_id is not null;

create unique index if not exists engagement_likes_visitor_target_uidx
  on engagement_likes (target_kind, target_ref, visitor_id)
  where visitor_id is not null;

-- The public count is `count(*)` for one target, and it runs on every render of
-- every public surface that shows a like.
create index if not exists engagement_likes_target_idx
  on engagement_likes (target_kind, target_ref);

-- A gardener's own likes, newest first. Nothing reads this yet; it is the index
-- the account half exists for, and adding it now costs one migration instead of
-- two.
create index if not exists engagement_likes_user_recent_idx
  on engagement_likes (user_id, created_at desc)
  where user_id is not null;

commit;
