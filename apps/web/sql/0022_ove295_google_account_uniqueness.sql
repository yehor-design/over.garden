-- OVE-295: explicit Google linking must not create an ambiguous provider
-- identity. This migration is additive and idempotent. It deliberately
-- refuses to choose a winner or rewrite existing account rows.

do $$
declare
  provider_subject_duplicate_groups bigint;
  user_provider_duplicate_groups bigint;
begin
  select count(*)::bigint
  into provider_subject_duplicate_groups
  from (
    select 1
    from public.account
    where "providerId" = 'google'
    group by "providerId", "accountId"
    having count(*) > 1
  ) duplicate_groups;

  select count(*)::bigint
  into user_provider_duplicate_groups
  from (
    select 1
    from public.account
    where "providerId" = 'google'
    group by "userId", "providerId"
    having count(*) > 1
  ) duplicate_groups;

  if provider_subject_duplicate_groups <> 0
    or user_provider_duplicate_groups <> 0 then
    raise exception 'Google account uniqueness preflight failed: duplicate groups detected'
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists account_google_provider_subject_unique_idx
  on public.account ("providerId", "accountId")
  where "providerId" = 'google';

create unique index if not exists account_google_user_provider_unique_idx
  on public.account ("userId", "providerId")
  where "providerId" = 'google';
