-- Rollback of 0046: restores the columns' former shape. Rows normalized to
-- 'public' by the forward migration are not reverted; the value they held
-- before is not recorded.

alter table user_public_profiles
  drop constraint if exists user_public_profiles_profile_visibility_check;

alter table user_public_profiles
  add constraint user_public_profiles_profile_visibility_check
  check (profile_visibility in ('public', 'private'));

alter table journal_entries
  add column if not exists public_noindex boolean not null default true;
