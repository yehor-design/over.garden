-- OVE-368 (ADR-0022, D3): every live public page is indexable and every
-- profile is public.
--
-- `journal_entries.public_noindex` was written as `true` on every create and
-- never cleared, so all eight production entries carried `noindex`; the
-- runtime no longer reads it. `user_public_profiles.profile_visibility` loses
-- its `private` value: the editor control is gone and every read path stops
-- filtering on it, so rows are normalized to `public` and the check constraint
-- admits only that value. The column stays so the historical projection
-- outbox reason `profile_visibility` keeps a referent.

alter table journal_entries
  drop column if exists public_noindex;

update user_public_profiles
set profile_visibility = 'public',
    updated_at = now()
where profile_visibility <> 'public';

alter table user_public_profiles
  drop constraint if exists user_public_profiles_profile_visibility_check;

alter table user_public_profiles
  add constraint user_public_profiles_profile_visibility_check
  check (profile_visibility = 'public');
