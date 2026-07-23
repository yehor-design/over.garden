-- Walking-skeleton schema for local/dev verification.
-- SQL migrations are the schema source of truth; Kysely types are generated
-- from a live database with `pnpm db:types`.

create extension if not exists pgcrypto;

create table if not exists health (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

-- Admin control plane owner lock (OVE-108/OVE-113 sealed owner hardening).
-- This app-owned table stores the single durable owner grant for the configured
-- Better Auth user. It intentionally stores only user IDs, role enums, and
-- bounded grant metadata: never emails, cookies, tokens,
-- request metadata, IP/user-agent, journal text, media keys, env values, or
-- fine-grained place data.
create table if not exists admin_user_roles (
  user_id uuid primary key,
  role text not null check (role = 'owner'),
  granted_by_user_id uuid,
  grant_reason text not null default 'manual_bootstrap',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_user_roles
  add column if not exists role text not null default 'owner',
  add column if not exists granted_by_user_id uuid,
  add column if not exists grant_reason text not null default 'manual_bootstrap',
  add column if not exists granted_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_user_roles_role_check'
      and conrelid = 'admin_user_roles'::regclass
  ) then
    alter table admin_user_roles
      drop constraint admin_user_roles_role_check;
  end if;

  alter table admin_user_roles
    add constraint admin_user_roles_role_check
    check (role = 'owner');

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_user_roles_grant_reason_check'
      and conrelid = 'admin_user_roles'::regclass
  ) then
    alter table admin_user_roles
      add constraint admin_user_roles_grant_reason_check
      check (char_length(grant_reason) between 1 and 120);
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_user_roles_user_id_fkey'
        and conrelid = 'admin_user_roles'::regclass
    ) then
      alter table admin_user_roles
        add constraint admin_user_roles_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_user_roles_granted_by_user_id_fkey'
        and conrelid = 'admin_user_roles'::regclass
    ) then
      alter table admin_user_roles
        add constraint admin_user_roles_granted_by_user_id_fkey
        foreign key (granted_by_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists admin_user_roles_role_granted_idx
  on admin_user_roles (role, granted_at desc);

create unique index if not exists admin_user_roles_single_owner_idx
  on admin_user_roles ((true));

-- Admin role audit trail (OVE-110). Audit rows store only internal user IDs,
-- a one-way session hash, bounded role/action/reason enums, and timestamps.
-- Never store emails, cookies, raw session IDs, provider tokens, IP/user-agent,
-- private journal/media content, fine-grained place data, or env values here.
create table if not exists admin_role_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_session_id_hash text,
  target_user_id uuid,
  action text not null,
  previous_role text,
  new_role text,
  reason text not null default 'manual_owner_grant',
  created_at timestamptz not null default now()
);

alter table admin_role_audit_log
  add column if not exists actor_user_id uuid,
  add column if not exists actor_session_id_hash text,
  add column if not exists target_user_id uuid,
  add column if not exists action text not null default 'grant',
  add column if not exists previous_role text,
  add column if not exists new_role text,
  add column if not exists reason text not null default 'manual_owner_grant',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_actor_session_hash_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_actor_session_hash_check
      check (actor_session_id_hash is null or actor_session_id_hash ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_action_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_action_check
      check (action in ('grant', 'revoke'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_previous_role_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_previous_role_check
      check (previous_role is null or previous_role in ('owner', 'admin', 'moderator', 'viewer'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_new_role_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_new_role_check
      check (new_role is null or new_role in ('owner', 'admin', 'moderator', 'viewer'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_role_audit_log_reason_check'
      and conrelid = 'admin_role_audit_log'::regclass
  ) then
    alter table admin_role_audit_log
      add constraint admin_role_audit_log_reason_check
      check (reason in (
        'manual_owner_grant',
        'pilot_operator_delegation',
        'temporary_coverage',
        'role_cleanup',
        'access_revoked'
      ));
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_role_audit_log_actor_user_id_fkey'
        and conrelid = 'admin_role_audit_log'::regclass
    ) then
      alter table admin_role_audit_log
        add constraint admin_role_audit_log_actor_user_id_fkey
        foreign key (actor_user_id) references "user"(id) on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'admin_role_audit_log_target_user_id_fkey'
        and conrelid = 'admin_role_audit_log'::regclass
    ) then
      alter table admin_role_audit_log
        add constraint admin_role_audit_log_target_user_id_fkey
        foreign key (target_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists admin_role_audit_log_created_idx
  on admin_role_audit_log (created_at desc);

create index if not exists admin_role_audit_log_target_created_idx
  on admin_role_audit_log (target_user_id, created_at desc);

-- Public pseudonymous identity for lineage and cross-user mentions (OVE-133).
-- These rows intentionally store only a stable handle plus optional
-- user-controlled public presentation fields. Never store emails, auth
-- provider details, contact channels, raw session data, request metadata,
-- private journal text, media keys, invite links, or fine-grained place data.
create table if not exists user_public_profiles (
  user_id uuid primary key,
  handle text not null,
  normalized_handle text not null,
  display_name text,
  avatar_url text,
  avatar_media_asset_id uuid,
  bio text,
  languages text[] not null default array[]::text[],
  location_visibility text not null default 'hidden',
  coarse_region_code text,
  profile_visibility text not null default 'public',
  profile_lifecycle_state text not null default 'active',
  relationship_visibility text not null default 'counts',
  removed_at timestamptz,
  handle_registry_state text not null default 'current',
  handle_changed_at timestamptz,
  identity_policy_version text not null default 'legacy-unreviewed',
  display_name_policy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_public_profiles_handle_check
    check (handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
  constraint user_public_profiles_normalized_handle_check
    check (
      normalized_handle = lower(handle)
      and normalized_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'
    ),
  constraint user_public_profiles_display_name_check
    check (display_name is null or char_length(display_name) between 1 and 80),
  constraint user_public_profiles_avatar_url_check
    check (
      avatar_url is null
      or (char_length(avatar_url) between 8 and 500 and avatar_url ~ '^https://')
    ),
  constraint user_public_profiles_bio_check
    check (bio is null or char_length(btrim(bio)) between 1 and 600),
  constraint user_public_profiles_languages_check
    check (
      cardinality(languages) <= 4
      and languages <@ array['uk', 'bg', 'ru', 'en']::text[]
    ),
  constraint user_public_profiles_location_visibility_check
    check (location_visibility in ('region', 'hidden')),
  constraint user_public_profiles_coarse_region_code_check
    check (
      (location_visibility = 'hidden' and coarse_region_code is null)
      or (
        location_visibility = 'region'
        and coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'
      )
    ),
  constraint user_public_profiles_profile_visibility_check
    check (profile_visibility in ('public', 'private')),
  constraint user_public_profiles_lifecycle_check
    check (
      (profile_lifecycle_state = 'active' and removed_at is null)
      or (profile_lifecycle_state = 'removed' and removed_at is not null)
    ),
  constraint user_public_profiles_relationship_visibility_check
    check (relationship_visibility in ('counts', 'hidden')),
  constraint user_public_profiles_handle_registry_state_check
    check (handle_registry_state = 'current'),
  constraint user_public_profiles_display_name_policy_check
    check (
      (display_name is null and display_name_policy_version is null)
      or (
        display_name is not null
        and display_name_policy_version in (
          'legacy-unreviewed',
          'ove203-identity-v1'
        )
      )
    )
);

-- Remove the short-lived draft consistency trigger if an interrupted local
-- OVE-203 bootstrap installed it. The authoritative invariant below is the
-- deferrable relational FK, not a global table scan trigger.
drop trigger if exists overgarden_profile_handle_consistency
  on user_public_profiles;

alter table user_public_profiles
  add column if not exists handle text,
  add column if not exists normalized_handle text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists avatar_media_asset_id uuid,
  add column if not exists bio text,
  add column if not exists languages text[] not null default array[]::text[],
  add column if not exists location_visibility text not null default 'hidden',
  add column if not exists coarse_region_code text,
  add column if not exists profile_visibility text not null default 'public',
  add column if not exists profile_lifecycle_state text not null default 'active',
  add column if not exists relationship_visibility text not null default 'counts',
  add column if not exists removed_at timestamptz,
  add column if not exists handle_registry_state text not null default 'current',
  add column if not exists handle_changed_at timestamptz,
  add column if not exists identity_policy_version text not null default 'legacy-unreviewed',
  add column if not exists display_name_policy_version text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  update user_public_profiles
  set display_name_policy_version = 'legacy-unreviewed'
  where display_name is not null
    and display_name_policy_version is null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_handle_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_handle_check
      check (handle ~ '^[a-z0-9][a-z0-9_]{2,29}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_handle_registry_state_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_handle_registry_state_check
      check (handle_registry_state = 'current');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_display_name_policy_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_display_name_policy_check
      check (
        (display_name is null and display_name_policy_version is null)
        or (
          display_name is not null
          and display_name_policy_version in (
            'legacy-unreviewed',
            'ove203-identity-v1'
          )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_bio_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_bio_check
      check (bio is null or char_length(btrim(bio)) between 1 and 600);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_languages_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_languages_check
      check (
        cardinality(languages) <= 4
        and languages <@ array['uk', 'bg', 'ru', 'en']::text[]
      );
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_identity_policy_version_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      drop constraint user_public_profiles_identity_policy_version_check;
  end if;

  alter table user_public_profiles
    add constraint user_public_profiles_identity_policy_version_check
    check (
      identity_policy_version in ('legacy-unreviewed', 'ove203-identity-v1')
    );

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_location_visibility_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_location_visibility_check
      check (location_visibility in ('region', 'hidden'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_coarse_region_code_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_coarse_region_code_check
      check (
        (location_visibility = 'hidden' and coarse_region_code is null)
        or (
          location_visibility = 'region'
          and coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_profile_visibility_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_profile_visibility_check
      check (profile_visibility in ('public', 'private'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_lifecycle_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_lifecycle_check
      check (
        (profile_lifecycle_state = 'active' and removed_at is null)
        or (profile_lifecycle_state = 'removed' and removed_at is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_relationship_visibility_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_relationship_visibility_check
      check (relationship_visibility in ('counts', 'hidden'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_normalized_handle_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_normalized_handle_check
      check (
        normalized_handle = lower(handle)
        and normalized_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_display_name_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_display_name_check
      check (display_name is null or char_length(display_name) between 1 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_avatar_url_check'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_avatar_url_check
      check (
        avatar_url is null
        or (char_length(avatar_url) between 8 and 500 and avatar_url ~ '^https://')
      );
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'user_public_profiles_user_id_fkey'
        and conrelid = 'user_public_profiles'::regclass
    ) then
      alter table user_public_profiles
        add constraint user_public_profiles_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;
  end if;
end $$;

create unique index if not exists user_public_profiles_handle_uidx
  on user_public_profiles (handle);

create unique index if not exists user_public_profiles_normalized_handle_uidx
  on user_public_profiles (normalized_handle);

create index if not exists user_public_profiles_updated_idx
  on user_public_profiles (updated_at desc);

-- Authoritative current/retired public-handle ownership (OVE-203). A former
-- handle remains reserved, but the registry stores no email, provider name,
-- profile content, request metadata, session data, or location data.
create table if not exists user_handle_registry (
  normalized_handle text primary key,
  user_id uuid not null,
  lifecycle_state text not null default 'current',
  claim_source text not null,
  policy_version text not null default 'legacy-unreviewed',
  claimed_at timestamptz not null default now(),
  next_rename_at timestamptz not null default '-infinity',
  retired_at timestamptz,
  constraint user_handle_registry_handle_check
    check (normalized_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
  constraint user_handle_registry_lifecycle_check
    check (
      (lifecycle_state = 'current' and retired_at is null)
      or (lifecycle_state = 'retired' and retired_at is not null)
    ),
  constraint user_handle_registry_claim_source_check
    check (
      claim_source in (
        'generated',
        'legacy_generated',
        'custom',
        'legacy_custom'
      )
    ),
  constraint user_handle_registry_policy_version_check
    check (policy_version in ('legacy-unreviewed', 'ove203-identity-v1')),
  constraint user_handle_registry_user_handle_lifecycle_uidx
    unique (user_id, normalized_handle, lifecycle_state)
);

drop trigger if exists overgarden_registry_handle_consistency
  on user_handle_registry;
drop function if exists overgarden_assert_user_handle_consistency();

alter table user_handle_registry
  add column if not exists lifecycle_state text not null default 'current',
  add column if not exists claim_source text,
  add column if not exists policy_version text not null default 'legacy-unreviewed',
  add column if not exists claimed_at timestamptz not null default now(),
  add column if not exists next_rename_at timestamptz not null default '-infinity',
  add column if not exists retired_at timestamptz;

do $$
begin
  update user_handle_registry registry
  set claim_source = case
    when registry.normalized_handle ~ (
      '^gardener_' || substring(
        encode(digest(registry.user_id::text, 'sha256'), 'hex')
        from 1 for 10
      ) || '(_[1-9])?$'
    ) then 'legacy_generated'
    else 'legacy_custom'
  end
  where registry.claim_source is null;

  alter table user_handle_registry
    alter column claim_source set not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_handle_check'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      add constraint user_handle_registry_handle_check
      check (normalized_handle ~ '^[a-z0-9][a-z0-9_]{2,29}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_claim_source_check'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      add constraint user_handle_registry_claim_source_check
      check (
        claim_source in (
          'generated',
          'legacy_generated',
          'custom',
          'legacy_custom'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_user_handle_lifecycle_uidx'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      add constraint user_handle_registry_user_handle_lifecycle_uidx
      unique (user_id, normalized_handle, lifecycle_state);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_lifecycle_check'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      add constraint user_handle_registry_lifecycle_check
      check (
        (lifecycle_state = 'current' and retired_at is null)
        or (lifecycle_state = 'retired' and retired_at is not null)
      );
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_policy_version_check'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      drop constraint user_handle_registry_policy_version_check;
  end if;

  alter table user_handle_registry
    add constraint user_handle_registry_policy_version_check
    check (policy_version in ('legacy-unreviewed', 'ove203-identity-v1'));

  if to_regclass('"user"') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'user_handle_registry_user_id_fkey'
      and conrelid = 'user_handle_registry'::regclass
  ) then
    alter table user_handle_registry
      add constraint user_handle_registry_user_id_fkey
      foreign key (user_id) references "user"(id) on delete cascade;
  end if;
end $$;

create unique index if not exists user_handle_registry_one_current_per_user_uidx
  on user_handle_registry (user_id)
  where lifecycle_state = 'current';

create index if not exists user_handle_registry_user_history_idx
  on user_handle_registry (user_id, claimed_at desc);

-- Preserve every existing valid handle as the current reserved identity before
-- provisioning any missing profiles. Conflicts fail closed instead of silently
-- reassigning a handle.
insert into user_handle_registry (
  normalized_handle,
  user_id,
  lifecycle_state,
  claim_source,
  policy_version,
  claimed_at,
  next_rename_at,
  retired_at
)
select
  normalized_handle,
  user_id,
  'current',
  case
    when normalized_handle ~ (
      '^gardener_' || substring(
        encode(digest(user_id::text, 'sha256'), 'hex')
        from 1 for 10
      ) || '(_[1-9])?$'
    ) then 'legacy_generated'
    else 'legacy_custom'
  end,
  identity_policy_version,
  created_at,
  '-infinity'::timestamptz,
  null
from user_public_profiles
on conflict (normalized_handle) do nothing;

do $$
begin
  if exists (
    select 1
    from user_public_profiles profile
    left join user_handle_registry registry
      on registry.normalized_handle = profile.normalized_handle
      and registry.user_id = profile.user_id
      and registry.lifecycle_state = 'current'
    where registry.normalized_handle is null
  ) then
    raise exception 'Existing public profile handle ownership is inconsistent.';
  end if;
end $$;

-- The profile row and the registry's current row are one logical identity.
-- The deferred FK permits the canonical rename transaction to retire, claim,
-- and update atomically while rejecting direct profile-only mutations. Do not
-- cascade lifecycle updates into the profile: a current -> retired registry
-- update would otherwise violate the profile's current-only CHECK before the
-- transaction can install its replacement claim.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_current_handle_registry_fkey'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      drop constraint user_public_profiles_current_handle_registry_fkey;
  end if;

  alter table user_public_profiles
    add constraint user_public_profiles_current_handle_registry_fkey
    foreign key (user_id, normalized_handle, handle_registry_state)
    references user_handle_registry (
      user_id,
      normalized_handle,
      lifecycle_state
    )
    on update no action
    on delete no action
    deferrable initially deferred;
end $$;

-- Enforce the reverse half of the relationship as well. For every committed
-- Better Auth user there must be exactly one profile, exactly one current
-- registry claim, and both rows must identify the same handle. The constraint
-- is deferred so canonical provisioning, rename, repair, and user-cascade
-- deletion can complete atomically before evaluation.
create or replace function overgarden_assert_user_public_identity_consistency()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected_user_id uuid;
  affected_user_ids uuid[];
  profile_count integer;
  current_claim_count integer;
  matching_pair_count integer;
begin
  affected_user_ids := case tg_op
    when 'INSERT' then array[new.user_id]
    when 'DELETE' then array[old.user_id]
    else array[old.user_id, new.user_id]
  end;

  foreach affected_user_id in array affected_user_ids loop
    if affected_user_id is null or not exists (
      select 1
      from "user" auth_user
      where auth_user.id = affected_user_id
    ) then
      continue;
    end if;

    select count(*)::integer
    into profile_count
    from user_public_profiles profile
    where profile.user_id = affected_user_id;

    select count(*)::integer
    into current_claim_count
    from user_handle_registry registry
    where registry.user_id = affected_user_id
      and registry.lifecycle_state = 'current';

    select count(*)::integer
    into matching_pair_count
    from user_public_profiles profile
    join user_handle_registry registry
      on registry.user_id = profile.user_id
      and registry.normalized_handle = profile.normalized_handle
      and registry.lifecycle_state = profile.handle_registry_state
    where profile.user_id = affected_user_id;

    if profile_count <> 1
      or current_claim_count <> 1
      or matching_pair_count <> 1
    then
      raise exception 'Public identity consistency invariant failed.';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists overgarden_public_profile_identity_consistency
  on user_public_profiles;
create constraint trigger overgarden_public_profile_identity_consistency
  after insert or update or delete on user_public_profiles
  deferrable initially deferred
  for each row
  execute function overgarden_assert_user_public_identity_consistency();

drop trigger if exists overgarden_handle_registry_identity_consistency
  on user_handle_registry;
create constraint trigger overgarden_handle_registry_identity_consistency
  after insert or update or delete on user_handle_registry
  deferrable initially deferred
  for each row
  execute function overgarden_assert_user_public_identity_consistency();

-- One canonical, provider-independent generator. It derives only from the
-- internal UUID, uses an irreversible SHA-256 digest, and handles the bounded
-- collision case without reading email or OAuth profile data.
create or replace function overgarden_provision_user_public_profile(
  provision_user_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  existing_handle text;
  base_handle text;
  candidate_handle text;
  attempt integer;
begin
  if provision_user_id is null then
    raise exception 'Public profile provisioning requires a user id.';
  end if;

  perform 1
  from "user" auth_user
  where auth_user.id = provision_user_id
  for update;

  if not found then
    raise exception 'Public profile provisioning requires an existing user.';
  end if;

  select profile.handle
  into existing_handle
  from user_public_profiles profile
  where profile.user_id = provision_user_id;

  if found then
    insert into user_handle_registry (
      normalized_handle,
      user_id,
      lifecycle_state,
      claim_source,
      policy_version,
      claimed_at,
      next_rename_at,
      retired_at
    )
    select
      profile.normalized_handle,
      profile.user_id,
      'current',
      case
        when profile.normalized_handle ~ (
          '^gardener_' || substring(
            encode(digest(profile.user_id::text, 'sha256'), 'hex')
            from 1 for 10
          ) || '(_[1-9])?$'
        ) then 'legacy_generated'
        else 'legacy_custom'
      end,
      profile.identity_policy_version,
      profile.created_at,
      '-infinity'::timestamptz,
      null
    from user_public_profiles profile
    where profile.user_id = provision_user_id
    on conflict (normalized_handle) do nothing;

    if not exists (
      select 1
      from user_handle_registry registry
      where registry.normalized_handle = existing_handle
        and registry.user_id = provision_user_id
        and registry.lifecycle_state = 'current'
    ) then
      raise exception 'Public profile handle ownership is inconsistent.';
    end if;

    return existing_handle;
  end if;

  select registry.normalized_handle
  into existing_handle
  from user_handle_registry registry
  where registry.user_id = provision_user_id
    and registry.lifecycle_state = 'current'
  for update;

  if found then
    insert into user_public_profiles (
      user_id,
      handle,
      normalized_handle,
      display_name,
      identity_policy_version
    )
    select
      registry.user_id,
      registry.normalized_handle,
      registry.normalized_handle,
      null,
      registry.policy_version
    from user_handle_registry registry
    where registry.user_id = provision_user_id
      and registry.lifecycle_state = 'current';

    return existing_handle;
  end if;

  base_handle := 'gardener_' || substring(
    encode(digest(provision_user_id::text, 'sha256'), 'hex')
    from 1 for 16
  );

  for attempt in 0..99 loop
    candidate_handle := case
      when attempt = 0 then base_handle
      else base_handle || '_' || attempt::text
    end;

    begin
      insert into user_handle_registry (
        normalized_handle,
        user_id,
        lifecycle_state,
        claim_source,
        policy_version,
        claimed_at,
        next_rename_at,
        retired_at
      ) values (
        candidate_handle,
        provision_user_id,
        'current',
        'generated',
        'ove203-identity-v1',
        now(),
        now(),
        null
      );

      insert into user_public_profiles (
        user_id,
        handle,
        normalized_handle,
        display_name,
        identity_policy_version
      ) values (
        provision_user_id,
        candidate_handle,
        candidate_handle,
        null,
        'ove203-identity-v1'
      );

      return candidate_handle;
    exception
      when unique_violation then
        select profile.handle
        into existing_handle
        from user_public_profiles profile
        where profile.user_id = provision_user_id;

        if found then
          return existing_handle;
        end if;
    end;
  end loop;

  raise exception using
    errcode = '23505',
    message = 'Could not allocate a unique public handle.';
end;
$$;

-- Canonical atomic rename. Moderation is intentionally performed by the
-- versioned server policy before this function is called; this boundary owns
-- only lifecycle reservation, cooldown, concurrency and consistency.
create or replace function overgarden_claim_user_public_handle(
  claim_user_id uuid,
  candidate_handle text
)
returns table (
  status text,
  previous_handle text,
  current_handle text,
  next_eligible_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  profile_record user_public_profiles%rowtype;
  eligible_at timestamptz;
begin
  if claim_user_id is null
    or candidate_handle is null
    or candidate_handle !~ '^[a-z0-9][a-z0-9_]{2,29}$'
  then
    return query select
      'format'::text,
      null::text,
      null::text,
      null::timestamptz;
    return;
  end if;

  perform overgarden_provision_user_public_profile(claim_user_id);

  select profile.*
  into profile_record
  from user_public_profiles profile
  where profile.user_id = claim_user_id
  for update;

  select registry.next_rename_at
  into eligible_at
  from user_handle_registry registry
  where registry.user_id = claim_user_id
    and registry.lifecycle_state = 'current';

  if profile_record.normalized_handle = candidate_handle then
    return query select
      'unchanged'::text,
      profile_record.handle,
      profile_record.handle,
      eligible_at;
    return;
  end if;

  if eligible_at > now() then
    return query select
      'cooldown'::text,
      profile_record.handle,
      profile_record.handle,
      eligible_at;
    return;
  end if;

  begin
    update user_handle_registry registry
    set
      lifecycle_state = 'retired',
      retired_at = now()
    where registry.user_id = claim_user_id
      and registry.lifecycle_state = 'current';

    insert into user_handle_registry (
      normalized_handle,
      user_id,
      lifecycle_state,
      claim_source,
      policy_version,
      claimed_at,
      next_rename_at,
      retired_at
    ) values (
      candidate_handle,
      claim_user_id,
      'current',
      'custom',
      'ove203-identity-v1',
      now(),
      now() + interval '30 days',
      null
    );

    update user_public_profiles profile
    set
      handle = candidate_handle,
      normalized_handle = candidate_handle,
      handle_changed_at = now(),
      identity_policy_version = 'ove203-identity-v1',
      updated_at = now()
    where profile.user_id = claim_user_id;

    return query select
      'updated'::text,
      profile_record.handle,
      candidate_handle,
      now() + interval '30 days';
    return;
  exception
    when unique_violation then
      return query select
        'unavailable'::text,
        profile_record.handle,
        profile_record.handle,
        null::timestamptz;
      return;
  end;
end;
$$;

create or replace function overgarden_provision_user_public_profile_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform overgarden_provision_user_public_profile(new.id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('"user"') is not null then
    execute 'drop trigger if exists overgarden_user_public_profile_after_insert on "user"';
    execute 'create trigger overgarden_user_public_profile_after_insert
      after insert on "user"
      for each row
      execute function overgarden_provision_user_public_profile_trigger()';

  end if;
end $$;

-- Profile-level social controls for OVE-180. These tables store only internal
-- actor/target ids, bounded state/reason enums, and timestamps. OVE-183 extends
-- these relationships into followed-feed and notification read models.
create table if not exists profile_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null,
  target_user_id uuid not null,
  follow_state text not null default 'active' check (
    follow_state in ('active', 'removed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_follows_cross_user_check
    check (follower_user_id <> target_user_id),
  constraint profile_follows_actor_target_uidx
    unique (follower_user_id, target_user_id)
);

create table if not exists profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null,
  blocked_user_id uuid not null,
  block_state text not null default 'active' check (
    block_state in ('active', 'removed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_blocks_cross_user_check
    check (blocker_user_id <> blocked_user_id),
  constraint profile_blocks_actor_target_uidx
    unique (blocker_user_id, blocked_user_id)
);

create table if not exists profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  target_user_id uuid not null,
  report_reason text not null check (
    report_reason in ('spam', 'harassment', 'privacy', 'impersonation', 'other')
  ),
  report_state text not null default 'submitted' check (
    report_state in ('submitted', 'reviewed', 'dismissed', 'actioned')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_reports_cross_user_check
    check (reporter_user_id <> target_user_id),
  constraint profile_reports_actor_target_uidx
    unique (reporter_user_id, target_user_id)
);

do $$
begin
  if to_regclass('"user"') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_follows_follower_user_id_fkey'
        and conrelid = 'profile_follows'::regclass
    ) then
      alter table profile_follows
        add constraint profile_follows_follower_user_id_fkey
        foreign key (follower_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_follows_target_user_id_fkey'
        and conrelid = 'profile_follows'::regclass
    ) then
      alter table profile_follows
        add constraint profile_follows_target_user_id_fkey
        foreign key (target_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_blocks_blocker_user_id_fkey'
        and conrelid = 'profile_blocks'::regclass
    ) then
      alter table profile_blocks
        add constraint profile_blocks_blocker_user_id_fkey
        foreign key (blocker_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_blocks_blocked_user_id_fkey'
        and conrelid = 'profile_blocks'::regclass
    ) then
      alter table profile_blocks
        add constraint profile_blocks_blocked_user_id_fkey
        foreign key (blocked_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_reports_reporter_user_id_fkey'
        and conrelid = 'profile_reports'::regclass
    ) then
      alter table profile_reports
        add constraint profile_reports_reporter_user_id_fkey
        foreign key (reporter_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'profile_reports_target_user_id_fkey'
        and conrelid = 'profile_reports'::regclass
    ) then
      alter table profile_reports
        add constraint profile_reports_target_user_id_fkey
        foreign key (target_user_id) references "user"(id) on delete cascade;
    end if;
  end if;
end $$;

create index if not exists profile_follows_target_active_idx
  on profile_follows (target_user_id, created_at desc)
  where follow_state = 'active';

create index if not exists profile_follows_actor_active_idx
  on profile_follows (follower_user_id, created_at desc)
  where follow_state = 'active';

create index if not exists profile_blocks_blocker_active_idx
  on profile_blocks (blocker_user_id, created_at desc)
  where block_state = 'active';

create index if not exists profile_blocks_blocked_active_idx
  on profile_blocks (blocked_user_id, created_at desc)
  where block_state = 'active';

create index if not exists profile_reports_target_state_idx
  on profile_reports (target_user_id, report_state, created_at desc);

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  coarse_region_code text check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table spaces
  add column if not exists coarse_region_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spaces_coarse_region_code_check'
      and conrelid = 'spaces'::regclass
  ) then
    alter table spaces
      add constraint spaces_coarse_region_code_check
      check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$');
  end if;
end $$;

create index if not exists spaces_owner_created_idx
  on spaces (owner_user_id, created_at desc);

create index if not exists spaces_owner_coarse_region_idx
  on spaces (owner_user_id, coarse_region_code)
  where coarse_region_code is not null;

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (char_length(canonical_name) between 1 and 120),
  catalog_kind text not null default 'plant_variety' check (catalog_kind in ('plant_variety', 'species', 'breed')),
  normalized_name text check (normalized_name is null or char_length(normalized_name) between 1 and 120),
  public_slug text check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'seeded' check (status in ('seeded', 'confirmed', 'provisional', 'merged', 'rejected')),
  source text not null default 'internal_seed',
  source_id text,
  created_by_user_id uuid,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  merged_into_catalog_item_id uuid references catalog_items(id) on delete set null,
  locale text not null default 'und',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table catalog_items
  add column if not exists catalog_kind text default 'plant_variety',
  add column if not exists normalized_name text,
  add column if not exists public_slug text,
  add column if not exists created_by_user_id uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists merged_into_catalog_item_id uuid references catalog_items(id) on delete set null;

update catalog_items
set normalized_name = lower(canonical_name)
where normalized_name is null;

update catalog_items
set catalog_kind = 'plant_variety'
where catalog_kind is null;

update catalog_items
set catalog_kind = 'species'
where source = 'species_backbone'
  and catalog_kind <> 'species';

alter table catalog_items
  alter column catalog_kind set default 'plant_variety',
  alter column catalog_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_catalog_kind_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      add constraint catalog_items_catalog_kind_check
      check (catalog_kind in ('plant_variety', 'species', 'breed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_public_slug_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      add constraint catalog_items_public_slug_check
      check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end $$;

create index if not exists catalog_items_status_created_idx
  on catalog_items (status, created_at desc);

create index if not exists catalog_items_kind_status_idx
  on catalog_items (catalog_kind, status, created_at desc);

create unique index if not exists catalog_items_public_slug_uidx
  on catalog_items (public_slug)
  where public_slug is not null;

create index if not exists catalog_items_merged_into_idx
  on catalog_items (merged_into_catalog_item_id)
  where merged_into_catalog_item_id is not null;

drop index if exists catalog_items_owner_normalized_locale_uidx;

create unique index if not exists catalog_items_owner_normalized_locale_kind_uidx
  on catalog_items (created_by_user_id, normalized_name, locale, catalog_kind);

create unique index if not exists catalog_items_source_source_id_uidx
  on catalog_items (source, source_id);

create table if not exists catalog_item_names (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  locale text not null default 'und',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_item_names_item_normalized_locale_uidx
  on catalog_item_names (catalog_item_id, normalized_name, locale);

create index if not exists catalog_item_names_normalized_idx
  on catalog_item_names (normalized_name);

-- Deterministic canonical-match suggestions for provisional user names
-- (OVE-158). The Python worker owns scoring; this table is operator evidence
-- only and never changes catalog_items, plant_objects, journal entries, public
-- projections, or search documents by itself. safe_evidence has a closed key
-- set so private/request/source-ingestion fields cannot drift into the queue.
create table if not exists catalog_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  target_catalog_item_id uuid references catalog_items(id) on delete cascade,
  target_catalog_item_name_id uuid,
  candidate_key text not null check (char_length(candidate_key) between 1 and 80),
  source_updated_at_snapshot timestamptz,
  target_updated_at_snapshot timestamptz,
  source_matching_fingerprint text check (
    source_matching_fingerprint is null
    or source_matching_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  target_matching_fingerprint text check (
    target_matching_fingerprint is null
    or target_matching_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  suggestion_kind text not null default 'canonical_match' check (suggestion_kind = 'canonical_match'),
  match_type text not null check (
    match_type in ('normalized_exact', 'transliteration_exact', 'fuzzy_name', 'no_safe_match')
  ),
  score smallint not null check (score between 0 and 100),
  confidence_bucket text not null check (confidence_bucket in ('high', 'medium', 'low', 'none')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'stale')),
  reason_codes text[] not null default array[]::text[] check (
    reason_codes <@ array[
      'normalized_exact',
      'cyrtranslit_exact',
      'rapidfuzz_name_similarity',
      'cross_script_similarity',
      'same_catalog_kind',
      'below_safe_threshold',
      'no_selectable_candidates',
      'unmatchable_input'
    ]::text[]
  ),
  normalized_input text not null check (char_length(normalized_input) between 1 and 120),
  matched_name text check (matched_name is null or char_length(matched_name) between 1 and 120),
  target_canonical_name text check (
    target_canonical_name is null
    or char_length(target_canonical_name) between 1 and 120
  ),
  source_locale text not null default 'und' check (char_length(source_locale) between 2 and 16),
  target_locale text check (target_locale is null or char_length(target_locale) between 2 and 16),
  source_script text not null check (source_script in ('cyrillic', 'latin', 'mixed', 'unknown')),
  target_script text check (target_script is null or target_script in ('cyrillic', 'latin', 'mixed', 'unknown')),
  catalog_kind text not null check (catalog_kind in ('plant_variety', 'species', 'breed')),
  affected_object_count integer not null default 0 check (affected_object_count >= 0),
  safe_evidence jsonb not null,
  constraint catalog_match_suggestions_safe_evidence_check check (
    jsonb_typeof(safe_evidence) = 'object'
    and safe_evidence ?& array[
      'schemaVersion',
      'score',
      'confidenceBucket',
      'matchType',
      'normalizedInput',
      'candidateDisplayName',
      'candidateCanonicalName',
      'sourceLocale',
      'targetLocale',
      'sourceScript',
      'targetScript',
      'catalogKind',
      'affectedObjectCount',
      'reasonCodes',
      'thresholds'
    ]::text[]
    and safe_evidence - array[
      'schemaVersion',
      'score',
      'confidenceBucket',
      'matchType',
      'normalizedInput',
      'candidateDisplayName',
      'candidateCanonicalName',
      'sourceLocale',
      'targetLocale',
      'sourceScript',
      'targetScript',
      'catalogKind',
      'affectedObjectCount',
      'reasonCodes',
      'thresholds'
    ]::text[] = '{}'::jsonb
    and safe_evidence->'schemaVersion'
      = '"ove158.catalogMatchEvidence.v2"'::jsonb
    and safe_evidence->'score' = to_jsonb(score)
    and safe_evidence->'confidenceBucket' = to_jsonb(confidence_bucket)
    and safe_evidence->'matchType' = to_jsonb(match_type)
    and safe_evidence->'normalizedInput' = to_jsonb(normalized_input)
    and safe_evidence->'candidateDisplayName'
      = coalesce(to_jsonb(matched_name), 'null'::jsonb)
    and safe_evidence->'candidateCanonicalName'
      = coalesce(to_jsonb(target_canonical_name), 'null'::jsonb)
    and safe_evidence->'sourceLocale' = to_jsonb(source_locale)
    and safe_evidence->'targetLocale'
      = coalesce(to_jsonb(target_locale), 'null'::jsonb)
    and safe_evidence->'sourceScript' = to_jsonb(source_script)
    and safe_evidence->'targetScript'
      = coalesce(to_jsonb(target_script), 'null'::jsonb)
    and safe_evidence->'catalogKind' = to_jsonb(catalog_kind)
    and safe_evidence->'affectedObjectCount' = to_jsonb(affected_object_count)
    and safe_evidence->'reasonCodes' = to_jsonb(reason_codes)
    and safe_evidence->'thresholds'
      = '{"high": 95, "medium": 85, "low": 70}'::jsonb
  ),
  matcher_version text not null check (char_length(matcher_version) between 1 and 40),
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  decision_reason_code text,
  decision_result text,
  decision_affected_object_count integer check (
    decision_affected_object_count is null
    or decision_affected_object_count >= 0
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_match_suggestions_source_target_check check (
    (
      match_type = 'no_safe_match'
      and target_catalog_item_id is null
      and candidate_key = 'no-safe-match'
      and matched_name is null
      and target_canonical_name is null
      and target_locale is null
      and target_script is null
      and confidence_bucket = 'none'
    )
    or (
      match_type <> 'no_safe_match'
      and target_catalog_item_id is not null
      and candidate_key = target_catalog_item_id::text
      and matched_name is not null
      and target_canonical_name is not null
      and target_locale is not null
      and target_script is not null
      and confidence_bucket <> 'none'
    )
  ),
  constraint catalog_match_suggestions_source_not_target_check check (
    target_catalog_item_id is null or source_catalog_item_id <> target_catalog_item_id
  ),
  constraint catalog_match_suggestions_target_snapshot_check check (
    matcher_version = 'ove158-v2'
    or (
      source_updated_at_snapshot is not null
      and (
        (target_catalog_item_id is null and target_updated_at_snapshot is null)
        or (target_catalog_item_id is not null and target_updated_at_snapshot is not null)
      )
    )
  ),
  constraint catalog_match_suggestions_review_metadata_check check (
    (
      status in ('pending', 'stale')
      and reviewed_at is null
      and reviewed_by_user_id is null
      and decision_reason_code is null
      and decision_result is null
      and decision_affected_object_count is null
    )
    or (
      status = 'approved'
      and reviewed_at is not null
      and reviewed_by_user_id is not null
      and decision_reason_code = 'approved_canonical_match'
      and decision_result = 'catalog_merged'
      and decision_affected_object_count is not null
      and target_catalog_item_id is not null
    )
    or (
      status = 'rejected'
      and reviewed_at is not null
      and reviewed_by_user_id is not null
      and decision_reason_code in (
        'not_same_entity',
        'wrong_catalog_kind',
        'locale_or_script_mismatch',
        'insufficient_evidence',
        'other_review_reason',
        'legacy_review'
      )
      and decision_result = 'suggestion_rejected'
      and decision_affected_object_count = 0
    )
  ),
  constraint catalog_match_suggestions_source_candidate_kind_uidx unique (
    source_catalog_item_id,
    candidate_key,
    suggestion_kind
  )
);

alter table catalog_match_suggestions
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists target_canonical_name text,
  add column if not exists source_updated_at_snapshot timestamptz,
  add column if not exists target_updated_at_snapshot timestamptz,
  add column if not exists target_catalog_item_name_id uuid,
  add column if not exists source_matching_fingerprint text,
  add column if not exists target_matching_fingerprint text,
  add column if not exists decision_reason_code text,
  add column if not exists decision_result text,
  add column if not exists decision_affected_object_count integer;

alter table catalog_match_suggestions
  drop constraint if exists catalog_match_suggestions_safe_evidence_check,
  drop constraint if exists catalog_match_suggestions_reason_codes_check,
  drop constraint if exists catalog_match_suggestions_source_target_check,
  drop constraint if exists catalog_match_suggestions_target_canonical_name_check,
  drop constraint if exists catalog_match_suggestions_target_snapshot_check,
  drop constraint if exists catalog_match_suggestions_matching_fingerprint_check,
  drop constraint if exists catalog_match_suggestions_decision_reason_check,
  drop constraint if exists catalog_match_suggestions_decision_result_check,
  drop constraint if exists catalog_match_suggestions_decision_affected_count_check,
  drop constraint if exists catalog_match_suggestions_review_metadata_check;

update catalog_match_suggestions as suggestions
set target_canonical_name = targets.canonical_name
from catalog_items as targets
where suggestions.target_catalog_item_id = targets.id
  and suggestions.target_canonical_name is null;

update catalog_match_suggestions as suggestions
set source_updated_at_snapshot = source_items.updated_at
from catalog_items as source_items
where suggestions.source_catalog_item_id = source_items.id
  and suggestions.source_updated_at_snapshot is null;

update catalog_match_suggestions as suggestions
set target_updated_at_snapshot = target_items.updated_at
from catalog_items as target_items
where suggestions.target_catalog_item_id = target_items.id
  and suggestions.target_updated_at_snapshot is null;

-- OVE-159 decisions require alias-bound semantic fingerprints. Older pending
-- evidence cannot satisfy that contract, so it is retired rather than being
-- silently approved under weaker timestamp-only validation.
update catalog_match_suggestions
set status = 'stale',
    updated_at = now()
where status = 'pending'
  and (
    source_matching_fingerprint is null
    or (
      target_catalog_item_id is not null
      and (
        target_catalog_item_name_id is null
        or target_matching_fingerprint is null
      )
    )
  );

update catalog_match_suggestions
set
  decision_reason_code = case
    when status = 'approved' then 'approved_canonical_match'
    else 'legacy_review'
  end,
  decision_result = case
    when status = 'approved' then 'catalog_merged'
    else 'suggestion_rejected'
  end,
  decision_affected_object_count = case
    when status = 'approved' then affected_object_count
    else 0
  end
where status in ('approved', 'rejected')
  and decision_result is null;

alter table catalog_match_suggestions
  alter column source_updated_at_snapshot drop not null,
  alter column source_matching_fingerprint drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_match_suggestions_target_name_fkey'
      and conrelid = 'catalog_match_suggestions'::regclass
  ) then
    alter table catalog_match_suggestions
      add constraint catalog_match_suggestions_target_name_fkey
      foreign key (target_catalog_item_name_id)
      references catalog_item_names(id)
      on delete restrict;
  end if;
end $$;

-- Rewrite legacy v1 rows from the safe relational columns only. This removes
-- the duplicated raw gardener-entered source name before the strict v2
-- constraint is installed.
update catalog_match_suggestions
set
  safe_evidence = jsonb_build_object(
    'schemaVersion', 'ove158.catalogMatchEvidence.v2',
    'score', score,
    'confidenceBucket', confidence_bucket,
    'matchType', match_type,
    'normalizedInput', normalized_input,
    'candidateDisplayName', matched_name,
    'candidateCanonicalName', target_canonical_name,
    'sourceLocale', source_locale,
    'targetLocale', target_locale,
    'sourceScript', source_script,
    'targetScript', target_script,
    'catalogKind', catalog_kind,
    'affectedObjectCount', affected_object_count,
    'reasonCodes', reason_codes,
    'thresholds', jsonb_build_object('high', 95, 'medium', 85, 'low', 70)
  ),
  matcher_version = 'ove158-v2',
  updated_at = now()
where safe_evidence->>'schemaVersion' is distinct from 'ove158.catalogMatchEvidence.v2';

alter table catalog_match_suggestions
  add constraint catalog_match_suggestions_reason_codes_check check (
    reason_codes <@ array[
      'normalized_exact',
      'cyrtranslit_exact',
      'rapidfuzz_name_similarity',
      'cross_script_similarity',
      'same_catalog_kind',
      'below_safe_threshold',
      'no_selectable_candidates',
      'unmatchable_input'
    ]::text[]
  ),
  add constraint catalog_match_suggestions_target_canonical_name_check check (
    target_canonical_name is null
    or char_length(target_canonical_name) between 1 and 120
  ),
  add constraint catalog_match_suggestions_source_target_check check (
    (
      match_type = 'no_safe_match'
      and target_catalog_item_id is null
      and candidate_key = 'no-safe-match'
      and matched_name is null
      and target_canonical_name is null
      and target_locale is null
      and target_script is null
      and confidence_bucket = 'none'
    )
    or (
      match_type <> 'no_safe_match'
      and target_catalog_item_id is not null
      and candidate_key = target_catalog_item_id::text
      and matched_name is not null
      and target_canonical_name is not null
      and target_locale is not null
      and target_script is not null
      and confidence_bucket <> 'none'
    )
  ),
  add constraint catalog_match_suggestions_safe_evidence_check check (
    jsonb_typeof(safe_evidence) = 'object'
    and safe_evidence ?& array[
      'schemaVersion',
      'score',
      'confidenceBucket',
      'matchType',
      'normalizedInput',
      'candidateDisplayName',
      'candidateCanonicalName',
      'sourceLocale',
      'targetLocale',
      'sourceScript',
      'targetScript',
      'catalogKind',
      'affectedObjectCount',
      'reasonCodes',
      'thresholds'
    ]::text[]
    and safe_evidence - array[
      'schemaVersion',
      'score',
      'confidenceBucket',
      'matchType',
      'normalizedInput',
      'candidateDisplayName',
      'candidateCanonicalName',
      'sourceLocale',
      'targetLocale',
      'sourceScript',
      'targetScript',
      'catalogKind',
      'affectedObjectCount',
      'reasonCodes',
      'thresholds'
    ]::text[] = '{}'::jsonb
    and safe_evidence->'schemaVersion'
      = '"ove158.catalogMatchEvidence.v2"'::jsonb
    and safe_evidence->'score' = to_jsonb(score)
    and safe_evidence->'confidenceBucket' = to_jsonb(confidence_bucket)
    and safe_evidence->'matchType' = to_jsonb(match_type)
    and safe_evidence->'normalizedInput' = to_jsonb(normalized_input)
    and safe_evidence->'candidateDisplayName'
      = coalesce(to_jsonb(matched_name), 'null'::jsonb)
    and safe_evidence->'candidateCanonicalName'
      = coalesce(to_jsonb(target_canonical_name), 'null'::jsonb)
    and safe_evidence->'sourceLocale' = to_jsonb(source_locale)
    and safe_evidence->'targetLocale'
      = coalesce(to_jsonb(target_locale), 'null'::jsonb)
    and safe_evidence->'sourceScript' = to_jsonb(source_script)
    and safe_evidence->'targetScript'
      = coalesce(to_jsonb(target_script), 'null'::jsonb)
    and safe_evidence->'catalogKind' = to_jsonb(catalog_kind)
    and safe_evidence->'affectedObjectCount' = to_jsonb(affected_object_count)
    and safe_evidence->'reasonCodes' = to_jsonb(reason_codes)
    and safe_evidence->'thresholds'
      = '{"high": 95, "medium": 85, "low": 70}'::jsonb
  ),
  add constraint catalog_match_suggestions_target_snapshot_check check (
    matcher_version = 'ove158-v2'
    or (
      source_updated_at_snapshot is not null
      and (
        (target_catalog_item_id is null and target_updated_at_snapshot is null)
        or (target_catalog_item_id is not null and target_updated_at_snapshot is not null)
      )
    )
  ),
  add constraint catalog_match_suggestions_matching_fingerprint_check check (
    (
      source_matching_fingerprint is null
      or source_matching_fingerprint ~ '^[0-9a-f]{64}$'
    )
    and (
      target_matching_fingerprint is null
      or target_matching_fingerprint ~ '^[0-9a-f]{64}$'
    )
    and (
      matcher_version = 'ove158-v2'
      or (
        source_matching_fingerprint is not null
        and (
          (
            target_catalog_item_id is null
            and target_catalog_item_name_id is null
            and target_matching_fingerprint is null
          )
          or (
            target_catalog_item_id is not null
            and target_catalog_item_name_id is not null
            and target_matching_fingerprint is not null
          )
        )
      )
    )
  ),
  add constraint catalog_match_suggestions_decision_reason_check check (
    decision_reason_code is null
    or decision_reason_code in (
      'approved_canonical_match',
      'not_same_entity',
      'wrong_catalog_kind',
      'locale_or_script_mismatch',
      'insufficient_evidence',
      'other_review_reason',
      'legacy_review'
    )
  ),
  add constraint catalog_match_suggestions_decision_result_check check (
    decision_result is null
    or decision_result in ('catalog_merged', 'suggestion_rejected')
  ),
  add constraint catalog_match_suggestions_decision_affected_count_check check (
    decision_affected_object_count is null
    or decision_affected_object_count >= 0
  ),
  add constraint catalog_match_suggestions_review_metadata_check check (
    (
      status in ('pending', 'stale')
      and reviewed_at is null
      and reviewed_by_user_id is null
      and decision_reason_code is null
      and decision_result is null
      and decision_affected_object_count is null
    )
    or (
      status = 'approved'
      and reviewed_at is not null
      and reviewed_by_user_id is not null
      and decision_reason_code = 'approved_canonical_match'
      and decision_result = 'catalog_merged'
      and decision_affected_object_count is not null
      and target_catalog_item_id is not null
    )
    or (
      status = 'rejected'
      and reviewed_at is not null
      and reviewed_by_user_id is not null
      and decision_reason_code in (
        'not_same_entity',
        'wrong_catalog_kind',
        'locale_or_script_mismatch',
        'insufficient_evidence',
        'other_review_reason',
        'legacy_review'
      )
      and decision_result = 'suggestion_rejected'
      and decision_affected_object_count = 0
    )
  );

create index if not exists catalog_match_suggestions_source_status_score_idx
  on catalog_match_suggestions (source_catalog_item_id, status, score desc, generated_at desc);

create index if not exists catalog_match_suggestions_target_status_idx
  on catalog_match_suggestions (target_catalog_item_id, status)
  where target_catalog_item_id is not null;

-- Advisory fuzzy duplicate evidence (OVE-162). RapidFuzz runs off the request
-- path and stores only catalog pair identity, bounded score/reason enums, input
-- timestamps, and matcher metadata. Labels and source families are joined from
-- current catalog rows by the operator-safe report; this table never stores raw
-- source payloads, source-record keys, user data, journal text, or media data.
create table if not exists catalog_fuzzy_duplicate_suggestions (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null check (pair_key ~ '^[a-f0-9]{64}$'),
  left_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  right_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  left_updated_at_snapshot timestamptz not null,
  right_updated_at_snapshot timestamptz not null,
  score smallint not null check (score between 0 and 100),
  score_bucket text not null check (score_bucket in ('high', 'medium')),
  reason_codes text[] not null,
  locale_relation text not null,
  recommended_action text not null check (recommended_action in ('merge_review', 'hold')),
  matcher_version text not null check (matcher_version = 'ove162-v1'),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_fuzzy_duplicate_suggestions_distinct_pair_check check (
    left_catalog_item_id <> right_catalog_item_id
  ),
  constraint catalog_fuzzy_duplicate_suggestions_pair_uidx unique (
    left_catalog_item_id,
    right_catalog_item_id
  ),
  constraint catalog_fuzzy_duplicate_suggestions_reason_codes_check check (
    cardinality(reason_codes) between 3 and 4
    and reason_codes <@ array[
      'rapidfuzz_name_similarity',
      'same_catalog_kind',
      'same_locale',
      'cross_locale',
      'cross_locale_review_only'
    ]::text[]
    and reason_codes @> array[
      'rapidfuzz_name_similarity',
      'same_catalog_kind'
    ]::text[]
  ),
  constraint catalog_fuzzy_duplicate_suggestions_locale_relation_check check (
    (
      locale_relation = 'same_locale'
      and reason_codes @> array['same_locale']::text[]
      and recommended_action = 'merge_review'
    )
    or (
      locale_relation = 'cross_locale'
      and reason_codes @> array[
        'cross_locale',
        'cross_locale_review_only'
      ]::text[]
      and recommended_action = 'hold'
    )
  )
);

create unique index if not exists catalog_fuzzy_duplicate_suggestions_pair_key_uidx
  on catalog_fuzzy_duplicate_suggestions (pair_key);

create index if not exists catalog_fuzzy_duplicate_suggestions_score_generated_idx
  on catalog_fuzzy_duplicate_suggestions (score desc, generated_at desc);

-- Personal planning shelf (OVE-136). Wishlist rows intentionally store only a
-- signed-in owner, a reusable catalog item, bounded source-surface metadata,
-- and timestamps. They are not journal entries and never store garden object
-- IDs, journal text, media keys, contact data, position data, invite links,
-- IP/user-agent, or raw request metadata.
create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  source_surface text not null default 'catalog_item' check (
    source_surface in ('catalog_item', 'public_variety')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishlist_items_owner_catalog_uidx unique (owner_user_id, catalog_item_id)
);

alter table wishlist_items
  add column if not exists source_surface text not null default 'catalog_item',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_source_surface_check'
      and conrelid = 'wishlist_items'::regclass
  ) then
    alter table wishlist_items
      add constraint wishlist_items_source_surface_check
      check (source_surface in ('catalog_item', 'public_variety'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_owner_catalog_uidx'
      and conrelid = 'wishlist_items'::regclass
  ) then
    alter table wishlist_items
      add constraint wishlist_items_owner_catalog_uidx
      unique (owner_user_id, catalog_item_id);
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'wishlist_items_owner_user_id_fkey'
        and conrelid = 'wishlist_items'::regclass
    ) then
      alter table wishlist_items
        add constraint wishlist_items_owner_user_id_fkey
        foreign key (owner_user_id) references "user"(id) on delete cascade;
    end if;
  end if;
end $$;

create index if not exists wishlist_items_owner_created_idx
  on wishlist_items (owner_user_id, created_at desc);

-- Bounded public engagement (OVE-138). Engagement stores only public-safe
-- target handles, signed-in owner/comment authors, hashed anonymous like
-- device tokens, bounded comment text, and timestamps. It is intentionally
-- separate from public-surface promotion, search, sitemap, notification
-- priority, and journal/object privacy state.
create table if not exists engagement_comments (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (
    target_kind in ('journal_entry', 'lineage_object', 'variety', 'topic')
  ),
  target_ref text not null constraint engagement_comments_target_ref_check check (
    char_length(target_ref) between 1 and 160
    and target_ref !~ '[[:cntrl:][:space:]?#]'
  ),
  author_user_id uuid not null,
  parent_comment_id uuid references engagement_comments(id) on delete set null,
  client_mutation_id text not null check (
    char_length(client_mutation_id) between 16 and 160
  ),
  body text not null check (
    length(btrim(body)) between 1 and 600
  ),
  comment_state text not null default 'active' check (
    comment_state in ('active', 'deleted', 'reported', 'removed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists engagement_bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  target_kind text not null check (
    target_kind in ('journal_entry', 'lineage_object', 'variety', 'topic')
  ),
  target_ref text not null constraint engagement_bookmarks_target_ref_check check (
    char_length(target_ref) between 1 and 160
    and target_ref !~ '[[:cntrl:][:space:]?#]'
  ),
  bookmark_state text not null default 'active' check (
    bookmark_state in ('active', 'removed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_bookmarks_owner_target_uidx
    unique (owner_user_id, target_kind, target_ref)
);

create table if not exists engagement_likes (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (
    target_kind in ('journal_entry', 'lineage_object', 'variety', 'topic')
  ),
  target_ref text not null constraint engagement_likes_target_ref_check check (
    char_length(target_ref) between 1 and 160
    and target_ref !~ '[[:cntrl:][:space:]?#]'
  ),
  anonymous_device_hash text not null check (
    anonymous_device_hash ~ '^[a-f0-9]{64}$'
  ),
  like_state text not null default 'active' check (
    like_state in ('active', 'removed')
  ),
  toggle_window_started_at timestamptz not null default now(),
  toggle_count integer not null default 1 check (
    toggle_count between 1 and 50
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_likes_device_target_uidx
    unique (target_kind, target_ref, anonymous_device_hash)
);

-- Direct follows complete the OVE-183 public utility loop for living objects
-- and curated topics. Profile follows keep their existing dedicated table.
-- No copied target content or visibility state is stored here.
create table if not exists engagement_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null,
  target_kind text not null check (
    target_kind in ('lineage_object', 'topic')
  ),
  target_ref text not null constraint engagement_follows_target_ref_check check (
    char_length(target_ref) between 1 and 160
    and target_ref !~ '[[:cntrl:][:space:]?#]'
  ),
  follow_state text not null default 'active' check (
    follow_state in ('active', 'removed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_follows_actor_target_uidx
    unique (follower_user_id, target_kind, target_ref)
);

-- A report is actor-scoped intake, not a reader-controlled moderation flag.
-- Moderator removal remains an explicit engagement_comments state transition.
create table if not exists engagement_comment_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  comment_id uuid not null references engagement_comments(id) on delete cascade,
  report_reason text not null check (
    report_reason in ('spam', 'harassment', 'privacy', 'misinformation', 'other')
  ),
  report_state text not null default 'submitted' check (
    report_state in ('submitted', 'reviewed', 'dismissed', 'actioned')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_comment_reports_actor_comment_uidx
    unique (reporter_user_id, comment_id)
);

-- Notification rows are derived from canonical activity. Persist only an
-- opaque event receipt and explicit in-product category preferences; never
-- copy comment text, journal text, location, media, or delivery payloads.
create table if not exists notification_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  event_key text not null check (event_key ~ '^[a-f0-9]{32}$'),
  receipt_state text not null default 'unread' check (
    receipt_state in ('unread', 'read', 'dismissed')
  ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_receipts_owner_event_uidx
    unique (owner_user_id, event_key)
);

create table if not exists notification_preferences (
  owner_user_id uuid primary key,
  comments_enabled boolean not null default true,
  replies_enabled boolean not null default true,
  follows_enabled boolean not null default true,
  mentions_enabled boolean not null default true,
  claims_enabled boolean not null default true,
  system_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table engagement_comments
    add column if not exists client_mutation_id text;

  update engagement_comments
  set client_mutation_id = 'legacy-comment:' || id::text
  where client_mutation_id is null;

  alter table engagement_comments
    alter column client_mutation_id set not null;

  alter table engagement_comments
    drop constraint if exists engagement_comments_client_mutation_id_check;
  alter table engagement_comments
    add constraint engagement_comments_client_mutation_id_check
    check (char_length(client_mutation_id) between 16 and 160);

  alter table engagement_comments
    drop constraint if exists engagement_comments_comment_state_check;
  alter table engagement_comments
    add constraint engagement_comments_comment_state_check
    check (comment_state in ('active', 'deleted', 'reported', 'removed'));

  alter table engagement_comments
    drop constraint if exists engagement_comments_target_ref_check;
  alter table engagement_comments
    add constraint engagement_comments_target_ref_check
    check (
      char_length(target_ref) between 1 and 160
      and target_ref !~ '[[:cntrl:][:space:]?#]'
    );

  alter table engagement_bookmarks
    drop constraint if exists engagement_bookmarks_target_ref_check;
  alter table engagement_bookmarks
    add constraint engagement_bookmarks_target_ref_check
    check (
      char_length(target_ref) between 1 and 160
      and target_ref !~ '[[:cntrl:][:space:]?#]'
    );

  alter table engagement_likes
    drop constraint if exists engagement_likes_target_ref_check;
  alter table engagement_likes
    add constraint engagement_likes_target_ref_check
    check (
      char_length(target_ref) between 1 and 160
      and target_ref !~ '[[:cntrl:][:space:]?#]'
    );

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'engagement_comments_author_user_id_fkey'
        and conrelid = 'engagement_comments'::regclass
    ) then
      alter table engagement_comments
        add constraint engagement_comments_author_user_id_fkey
        foreign key (author_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'engagement_bookmarks_owner_user_id_fkey'
        and conrelid = 'engagement_bookmarks'::regclass
    ) then
      alter table engagement_bookmarks
        add constraint engagement_bookmarks_owner_user_id_fkey
        foreign key (owner_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'engagement_follows_follower_user_id_fkey'
        and conrelid = 'engagement_follows'::regclass
    ) then
      alter table engagement_follows
        add constraint engagement_follows_follower_user_id_fkey
        foreign key (follower_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'engagement_comment_reports_reporter_user_id_fkey'
        and conrelid = 'engagement_comment_reports'::regclass
    ) then
      alter table engagement_comment_reports
        add constraint engagement_comment_reports_reporter_user_id_fkey
        foreign key (reporter_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'notification_receipts_owner_user_id_fkey'
        and conrelid = 'notification_receipts'::regclass
    ) then
      alter table notification_receipts
        add constraint notification_receipts_owner_user_id_fkey
        foreign key (owner_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'notification_preferences_owner_user_id_fkey'
        and conrelid = 'notification_preferences'::regclass
    ) then
      alter table notification_preferences
        add constraint notification_preferences_owner_user_id_fkey
        foreign key (owner_user_id) references "user"(id) on delete cascade;
    end if;
  end if;
end $$;

create unique index if not exists engagement_comments_author_mutation_uidx
  on engagement_comments (author_user_id, client_mutation_id);

create index if not exists engagement_comments_target_created_idx
  on engagement_comments (target_kind, target_ref, created_at asc)
  where comment_state = 'active';

create index if not exists engagement_comments_author_created_idx
  on engagement_comments (author_user_id, created_at desc);

create index if not exists engagement_bookmarks_owner_created_idx
  on engagement_bookmarks (owner_user_id, created_at desc)
  where bookmark_state = 'active';

create index if not exists engagement_likes_target_active_idx
  on engagement_likes (target_kind, target_ref, updated_at desc)
  where like_state = 'active';

create index if not exists engagement_follows_actor_updated_idx
  on engagement_follows (follower_user_id, updated_at desc)
  where follow_state = 'active';

create index if not exists engagement_follows_target_updated_idx
  on engagement_follows (target_kind, target_ref, updated_at desc)
  where follow_state = 'active';

create index if not exists engagement_comment_reports_comment_created_idx
  on engagement_comment_reports (comment_id, created_at desc)
  where report_state = 'submitted';

create index if not exists notification_receipts_owner_state_updated_idx
  on notification_receipts (owner_user_id, receipt_state, updated_at desc);

create table if not exists catalog_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_category text not null check (char_length(source_category) between 1 and 80),
  source_version text not null check (char_length(source_version) between 1 and 120),
  source_url text not null check (char_length(source_url) between 1 and 1000),
  license text not null check (char_length(license) between 1 and 240),
  license_url text check (license_url is null or char_length(license_url) between 1 and 1000),
  attribution_required boolean not null default true,
  attribution_text text check (attribution_text is null or char_length(attribution_text) between 1 and 500),
  allowed_usage jsonb not null default '[]'::jsonb,
  parser_version text not null check (char_length(parser_version) between 1 and 120),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null,
  verified_at timestamptz not null,
  status text not null default 'imported' check (status in ('imported', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_snapshots_slug_version_checksum_uidx unique (
    source_slug,
    source_version,
    payload_sha256
  )
);

alter table catalog_source_snapshots
  add column if not exists license_url text,
  add column if not exists attribution_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_source_snapshots_license_url_check'
      and conrelid = 'catalog_source_snapshots'::regclass
  ) then
    alter table catalog_source_snapshots
      add constraint catalog_source_snapshots_license_url_check
      check (license_url is null or char_length(license_url) between 1 and 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_source_snapshots_attribution_text_check'
      and conrelid = 'catalog_source_snapshots'::regclass
  ) then
    alter table catalog_source_snapshots
      add constraint catalog_source_snapshots_attribution_text_check
      check (attribution_text is null or char_length(attribution_text) between 1 and 500);
  end if;
end $$;

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'ua-state-register'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'Catalogue of Life / ChecklistBank, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'catalogue-of-life-checklistbank'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/licenses/by/4.0/'),
  attribution_text = coalesce(
    attribution_text,
    'GBIF Backbone Taxonomy, Creative Commons Attribution 4.0 International.'
  ),
  updated_at = now()
where source_slug = 'gbif-backbone'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://data.eppo.int/documentation/opendata'),
  attribution_text = coalesce(
    attribution_text,
    'EPPO Codes, EPPO Codes Open Data Licence.'
  ),
  updated_at = now()
where source_slug = 'eppo-codes'
  and attribution_required = true
  and (license_url is null or attribution_text is null);

update catalog_source_snapshots
set
  license_url = coalesce(license_url, 'https://creativecommons.org/publicdomain/zero/1.0/'),
  updated_at = now()
where source_slug in ('world-flora-online', 'wikidata')
  and attribution_required = false
  and license_url is null;

create table if not exists catalog_source_records (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null references catalog_source_snapshots(id) on delete cascade,
  source_record_id text not null check (char_length(source_record_id) between 1 and 200),
  raw_payload jsonb not null,
  raw_payload_sha256 text not null check (raw_payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_only_fields jsonb not null default '{}'::jsonb,
  allowed_projection jsonb not null default '{}'::jsonb,
  projection_status text not null default 'projected' check (projection_status in ('projected', 'quarantined', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_records_snapshot_record_uidx unique (
    source_snapshot_id,
    source_record_id
  )
);

create table if not exists catalog_source_links (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  source_record_id uuid not null references catalog_source_records(id) on delete restrict,
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_record_key text not null check (char_length(source_record_key) between 1 and 200),
  projection_kind text not null default 'canonical_item' check (projection_kind in ('canonical_item', 'alias')),
  created_at timestamptz not null default now(),
  constraint catalog_source_links_item_record_uidx unique (
    catalog_item_id,
    source_record_id
  )
);

create index if not exists catalog_source_records_snapshot_idx
  on catalog_source_records (source_snapshot_id);

create index if not exists catalog_source_records_projection_status_idx
  on catalog_source_records (projection_status, updated_at desc);

create index if not exists catalog_source_links_catalog_item_idx
  on catalog_source_links (catalog_item_id);

create table if not exists catalog_source_refresh_events (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  previous_snapshot_id uuid not null references catalog_source_snapshots(id) on delete restrict,
  refreshed_snapshot_id uuid not null references catalog_source_snapshots(id) on delete restrict,
  refresh_label text not null check (char_length(refresh_label) between 1 and 240),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_refresh_events_source_snapshot_uidx unique (
    source_slug,
    refreshed_snapshot_id
  )
);

create table if not exists catalog_source_refresh_records (
  id uuid primary key default gen_random_uuid(),
  refresh_event_id uuid not null references catalog_source_refresh_events(id) on delete cascade,
  source_record_key text not null check (char_length(source_record_key) between 1 and 200),
  previous_source_record_id uuid references catalog_source_records(id) on delete set null,
  refreshed_source_record_id uuid references catalog_source_records(id) on delete set null,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  diff_status text not null check (
    diff_status in (
      'new',
      'unchanged',
      'changed',
      'removed_upstream',
      'parser_reject',
      'review_needed',
      'projection_blocked'
    )
  ),
  projection_action text not null check (
    projection_action in (
      'project_new',
      'link_existing',
      'project_safe_aliases',
      'retain_without_upstream',
      'reject_parser_row',
      'queue_curator_review',
      'block_projection'
    )
  ),
  safe_diff jsonb not null default '{}'::jsonb,
  review_reason text check (review_reason is null or char_length(review_reason) between 1 and 500),
  reindex_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_refresh_records_event_record_uidx unique (
    refresh_event_id,
    source_record_key
  )
);

create index if not exists catalog_source_refresh_events_source_created_idx
  on catalog_source_refresh_events (source_slug, created_at desc);

create index if not exists catalog_source_refresh_records_event_status_idx
  on catalog_source_refresh_records (refresh_event_id, diff_status);

create index if not exists catalog_source_refresh_records_catalog_item_idx
  on catalog_source_refresh_records (catalog_item_id)
  where catalog_item_id is not null;

create table if not exists catalog_alias_projections (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  catalog_item_name_id uuid references catalog_item_names(id) on delete cascade,
  generated_from_catalog_item_name_id uuid,
  display_name text not null check (char_length(display_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  locale text not null default 'und',
  script text not null default 'und' check (char_length(script) between 1 and 40),
  alias_kind text not null check (alias_kind in ('accepted_scientific_name', 'synonym', 'vernacular_alias', 'generated_variant', 'user_provisional')),
  status text not null check (status in ('accepted', 'review_needed', 'rejected', 'generated', 'stale', 'user_provisional')),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_method text not null check (source_method in ('source_backed', 'generated', 'manual_seed', 'ontology_seed', 'user_provisional', 'curator')),
  source_record_id uuid references catalog_source_records(id) on delete set null,
  source_record_key text check (source_record_key is null or char_length(source_record_key) between 1 and 200),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  license text not null check (char_length(license) between 1 and 240),
  attribution_required boolean not null default true,
  projection_notes text check (projection_notes is null or char_length(projection_notes) between 1 and 500),
  reason_codes text[] not null default array[]::text[],
  source_name_fingerprint text,
  generator_version text,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  decision_reason_code text,
  decision_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table catalog_alias_projections
  add column if not exists generated_from_catalog_item_name_id uuid,
  add column if not exists reason_codes text[] not null default array[]::text[],
  add column if not exists source_name_fingerprint text,
  add column if not exists generator_version text,
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists decision_reason_code text,
  add column if not exists decision_result text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_alias_projections_generated_from_name_fkey'
      and conrelid = 'catalog_alias_projections'::regclass
  ) then
    alter table catalog_alias_projections
      add constraint catalog_alias_projections_generated_from_name_fkey
      foreign key (generated_from_catalog_item_name_id)
      references catalog_item_names(id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'catalog_alias_projections_source_method_check'
      and conrelid = 'catalog_alias_projections'::regclass
  ) then
    alter table catalog_alias_projections
      drop constraint catalog_alias_projections_source_method_check;
  end if;

  alter table catalog_alias_projections
    add constraint catalog_alias_projections_source_method_check
    check (source_method in ('source_backed', 'generated', 'manual_seed', 'ontology_seed', 'user_provisional', 'curator'));
end $$;

alter table catalog_alias_projections
  drop constraint if exists catalog_alias_projections_status_check,
  drop constraint if exists catalog_alias_projections_generated_reason_codes_check,
  drop constraint if exists catalog_alias_projections_generated_fingerprint_check,
  drop constraint if exists catalog_alias_projections_generated_review_check;

alter table catalog_alias_projections
  add constraint catalog_alias_projections_status_check
  check (
    status in (
      'accepted',
      'review_needed',
      'rejected',
      'generated',
      'stale',
      'user_provisional'
    )
  ),
  add constraint catalog_alias_projections_generated_reason_codes_check
  check (
    reason_codes <@ array[
      'cyrtranslit_forward',
      'cyrtranslit_reverse',
      'ru_yo_fold',
      'uk_ghe_fold',
      'normalized_collision'
    ]::text[]
  ),
  add constraint catalog_alias_projections_generated_fingerprint_check
  check (
    source_name_fingerprint is null
    or source_name_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint catalog_alias_projections_generated_review_check
  check (
    source_slug <> 'overgarden-alias-generator'
    or (
      source_slug = 'overgarden-alias-generator'
      and source_method = 'generated'
      and source_record_id is null
      and source_record_key is null
      and attribution_required = false
      and generated_from_catalog_item_name_id is not null
      and source_name_fingerprint is not null
      and generator_version is not null
      and char_length(generator_version) between 1 and 40
      and cardinality(reason_codes) between 1 and 5
      and (
        (
          status in ('generated', 'review_needed', 'stale')
          and catalog_item_name_id is null
          and reviewed_at is null
          and reviewed_by_user_id is null
          and decision_reason_code is null
          and decision_result is null
        )
        or (
          status = 'accepted'
          and catalog_item_name_id is not null
          and reviewed_at is not null
          and reviewed_by_user_id is not null
          and decision_reason_code = 'approved_generated_alias'
          and decision_result in ('alias_projected', 'alias_already_projected')
        )
        or (
          status = 'rejected'
          and catalog_item_name_id is null
          and reviewed_at is not null
          and reviewed_by_user_id is not null
          and decision_reason_code in (
            'incorrect_variant',
            'locale_or_script_mismatch',
            'ambiguous_catalog_identity',
            'unsafe_generated_form',
            'other_review_reason'
          )
          and decision_result = 'alias_rejected'
        )
      )
    )
  );

create unique index if not exists catalog_alias_projections_item_alias_source_uidx
  on catalog_alias_projections (
    catalog_item_id,
    normalized_name,
    locale,
    source_slug,
    source_method
  );

create index if not exists catalog_alias_projections_item_status_idx
  on catalog_alias_projections (catalog_item_id, status, locale);

create index if not exists catalog_alias_projections_name_idx
  on catalog_alias_projections (catalog_item_name_id)
  where catalog_item_name_id is not null;

create index if not exists catalog_alias_projections_generated_review_idx
  on catalog_alias_projections (status, generated_at desc, catalog_item_id)
  where source_slug = 'overgarden-alias-generator'
    and source_method = 'generated';

create table if not exists variety_seed_proofs (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  title text not null,
  summary text not null,
  body text not null,
  source_label text,
  status text not null default 'draft',
  author_user_id uuid not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variety_seed_proofs_title_length_check
    check (char_length(title) between 1 and 120),
  constraint variety_seed_proofs_summary_length_check
    check (char_length(summary) between 1 and 280),
  constraint variety_seed_proofs_body_length_check
    check (char_length(body) between 80 and 1600),
  constraint variety_seed_proofs_source_label_length_check
    check (source_label is null or char_length(source_label) between 1 and 160),
  constraint variety_seed_proofs_status_check
    check (status in ('draft', 'published'))
);

alter table variety_seed_proofs
  add column if not exists catalog_item_id uuid,
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists body text,
  add column if not exists source_label text,
  add column if not exists status text default 'draft',
  add column if not exists author_user_id uuid,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_catalog_item_id_fkey'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_catalog_item_id_fkey
      foreign key (catalog_item_id) references catalog_items(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_title_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_title_length_check
      check (char_length(title) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_summary_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_summary_length_check
      check (char_length(summary) between 1 and 280);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_body_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_body_length_check
      check (char_length(body) between 80 and 1600);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_source_label_length_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_source_label_length_check
      check (source_label is null or char_length(source_label) between 1 and 160);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'variety_seed_proofs_status_check'
      and conrelid = 'variety_seed_proofs'::regclass
  ) then
    alter table variety_seed_proofs
      add constraint variety_seed_proofs_status_check
      check (status in ('draft', 'published'));
  end if;
end $$;

create unique index if not exists variety_seed_proofs_catalog_item_uidx
  on variety_seed_proofs (catalog_item_id);

create index if not exists variety_seed_proofs_status_updated_idx
  on variety_seed_proofs (status, updated_at desc);

insert into catalog_items (
  id,
  canonical_name,
  normalized_name,
  public_slug,
  status,
  source,
  source_id,
  locale
)
values
  ('00000000-0000-4000-8000-000000000101', 'Помідор чері', lower('Помідор чері'), 'pomidor-cheri-0000000101', 'seeded', 'internal_seed', 'ove-seed-uk-cherry-tomato', 'uk'),
  ('00000000-0000-4000-8000-000000000102', 'Огірок Ніжинський', lower('Огірок Ніжинський'), 'nizhyn-cucumber-0000000102', 'seeded', 'internal_seed', 'ove-seed-uk-nizhyn-cucumber', 'uk'),
  ('00000000-0000-4000-8000-000000000103', 'Домат чери', lower('Домат чери'), 'domat-cheri-0000000103', 'seeded', 'internal_seed', 'ove-seed-bg-cherry-tomato', 'bg')
on conflict (id) do nothing;

update catalog_items
set public_slug = seed_slugs.public_slug
from (
  values
    ('00000000-0000-4000-8000-000000000101'::uuid, 'pomidor-cheri-0000000101'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'nizhyn-cucumber-0000000102'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'domat-cheri-0000000103')
) as seed_slugs(id, public_slug)
where catalog_items.id = seed_slugs.id
  and catalog_items.public_slug is null;

insert into catalog_item_names (
  catalog_item_id,
  display_name,
  normalized_name,
  locale,
  is_primary
)
values
  ('00000000-0000-4000-8000-000000000101', 'Помідор чері', lower('Помідор чері'), 'uk', true),
  ('00000000-0000-4000-8000-000000000101', 'Томат чері', lower('Томат чері'), 'uk', false),
  ('00000000-0000-4000-8000-000000000101', 'Cherry tomato', lower('Cherry tomato'), 'en', false),
  ('00000000-0000-4000-8000-000000000102', 'Огірок Ніжинський', lower('Огірок Ніжинський'), 'uk', true),
  ('00000000-0000-4000-8000-000000000102', 'Ніжинський огірок', lower('Ніжинський огірок'), 'uk', false),
  ('00000000-0000-4000-8000-000000000103', 'Домат чери', lower('Домат чери'), 'bg', true),
  ('00000000-0000-4000-8000-000000000103', 'Чери домат', lower('Чери домат'), 'bg', false)
on conflict (catalog_item_id, normalized_name, locale) do nothing;

create table if not exists plant_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  space_id uuid not null references spaces(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  object_kind text not null default 'plant' check (object_kind in ('plant', 'bee_colony', 'animal')),
  catalog_item_id uuid references catalog_items(id) on delete set null,
  variety_text text check (variety_text is null or char_length(variety_text) between 1 and 120),
  variety_state text not null default 'unknown' check (variety_state in ('selected', 'unknown', 'user_added', 'free_text')),
  location_visibility text not null default 'hidden' check (location_visibility in ('region', 'hidden')),
  coarse_region_code text check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plant_objects
  add column if not exists object_kind text default 'plant',
  add column if not exists catalog_item_id uuid,
  add column if not exists coarse_region_code text;

update plant_objects
set object_kind = 'plant'
where object_kind is null;

alter table plant_objects
  alter column object_kind set default 'plant',
  alter column object_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_object_kind_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_object_kind_check
      check (object_kind in ('plant', 'bee_colony', 'animal'));
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_variety_state_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      drop constraint plant_objects_variety_state_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_variety_state_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_variety_state_check
      check (variety_state in ('selected', 'unknown', 'user_added', 'free_text'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_coarse_region_code_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_coarse_region_code_check
      check (coarse_region_code is null or coarse_region_code ~ '^(UA|BG)-[0-9]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_catalog_item_id_fkey'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_catalog_item_id_fkey
      foreign key (catalog_item_id) references catalog_items(id) on delete set null;
  end if;
end $$;

create index if not exists plant_objects_owner_created_idx
  on plant_objects (owner_user_id, created_at desc);

create index if not exists plant_objects_owner_space_idx
  on plant_objects (owner_user_id, space_id);

create index if not exists plant_objects_owner_coarse_region_idx
  on plant_objects (owner_user_id, coarse_region_code)
  where coarse_region_code is not null;

create index if not exists plant_objects_catalog_item_idx
  on plant_objects (catalog_item_id)
  where catalog_item_id is not null;

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  space_id uuid not null references spaces(id) on delete cascade,
  plant_object_id uuid references plant_objects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 20000),
  content_document jsonb,
  content_schema_version integer,
  journal_revision bigint not null default 1,
  entry_scope text not null default 'object' check (entry_scope in ('object', 'space')),
  entry_date date not null default current_date,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'archived')),
  public_slug text,
  public_noindex boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  public_gone_at timestamptz,
  first_publication_disclosure_version text,
  first_publication_disclosed_at timestamptz,
  client_mutation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_owner_client_mutation_uidx unique (owner_user_id, client_mutation_id),
  constraint journal_entries_scope_target_check check (
    (entry_scope = 'object' and plant_object_id is not null)
    or (entry_scope = 'space' and plant_object_id is null)
  )
);

-- Older local walking-skeleton databases had journal_entries.user_id/body only.
-- Keep bootstrap repeatable so agents can move between schema slices without a
-- manual destructive reset.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'owner_user_id'
  ) then
    alter table journal_entries rename column user_id to owner_user_id;
  end if;
end $$;

alter table journal_entries
  add column if not exists owner_user_id uuid,
  add column if not exists space_id uuid,
  add column if not exists plant_object_id uuid,
  add column if not exists title text,
  add column if not exists entry_scope text default 'object',
  add column if not exists entry_date date default current_date,
  add column if not exists lifecycle_state text default 'active',
  add column if not exists public_slug text,
  add column if not exists public_noindex boolean default true,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists public_gone_at timestamptz,
  add column if not exists first_publication_disclosure_version text,
  add column if not exists first_publication_disclosed_at timestamptz;

update journal_entries
set
  title = coalesce(title, 'Skeleton journal entry'),
  entry_scope = coalesce(entry_scope, 'object'),
  entry_date = coalesce(entry_date, current_date)
where title is null
   or entry_scope is null
   or entry_date is null;

update journal_entries
set public_noindex = true
where public_noindex is null;

update journal_entries
set lifecycle_state = 'active'
where lifecycle_state is null;

with owners as (
  select distinct owner_user_id
  from journal_entries
  where owner_user_id is not null
    and (
      space_id is null
      or (entry_scope = 'object' and plant_object_id is null)
    )
),
existing_spaces as (
  select distinct on (owner_user_id) owner_user_id, id
  from spaces
  where display_name = 'Local skeleton space'
  order by owner_user_id, created_at
),
inserted_spaces as (
  insert into spaces (owner_user_id, display_name)
  select owners.owner_user_id, 'Local skeleton space'
  from owners
  left join existing_spaces using (owner_user_id)
  where existing_spaces.id is null
  returning owner_user_id, id
),
space_map as (
  select owner_user_id, id from existing_spaces
  union all
  select owner_user_id, id from inserted_spaces
),
existing_objects as (
  select distinct on (owner_user_id, space_id) owner_user_id, space_id, id
  from plant_objects
  where display_name = 'Skeleton plant'
  order by owner_user_id, space_id, created_at
),
inserted_objects as (
  insert into plant_objects (owner_user_id, space_id, display_name)
  select space_map.owner_user_id, space_map.id, 'Skeleton plant'
  from space_map
  left join existing_objects
    on existing_objects.owner_user_id = space_map.owner_user_id
   and existing_objects.space_id = space_map.id
  where existing_objects.id is null
  returning owner_user_id, space_id, id
),
object_map as (
  select owner_user_id, space_id, id from existing_objects
  union all
  select owner_user_id, space_id, id from inserted_objects
)
update journal_entries
set
  space_id = coalesce(journal_entries.space_id, space_map.id),
  plant_object_id = case
    when journal_entries.entry_scope = 'object'
      then coalesce(journal_entries.plant_object_id, object_map.id)
    else null
  end
from space_map
inner join object_map
  on object_map.owner_user_id = space_map.owner_user_id
 and object_map.space_id = space_map.id
where journal_entries.owner_user_id = space_map.owner_user_id
  and (
    journal_entries.space_id is null
    or (
      journal_entries.entry_scope = 'object'
      and journal_entries.plant_object_id is null
    )
  );

alter table journal_entries
  alter column owner_user_id set not null,
  alter column space_id set not null,
  alter column plant_object_id drop not null,
  alter column title set not null,
  alter column entry_scope set default 'object',
  alter column entry_scope set not null,
  alter column entry_date set default current_date,
  alter column entry_date set not null,
  alter column lifecycle_state set default 'active',
  alter column lifecycle_state set not null,
  alter column public_noindex set default true,
  alter column public_noindex set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_entry_scope_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_entry_scope_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_entry_scope_check
    check (entry_scope in ('object', 'space'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_scope_target_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_scope_target_check
      check (
        (entry_scope = 'object' and plant_object_id is not null)
        or (entry_scope = 'space' and plant_object_id is null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_identity_owner_space_uidx'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_identity_owner_space_uidx
      unique (id, owner_user_id, space_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_identity_owner_space_uidx'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_identity_owner_space_uidx
      unique (id, owner_user_id, space_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_objects_identity_owner_uidx'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_identity_owner_uidx
      unique (id, owner_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_lifecycle_state_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_lifecycle_state_check
      check (lifecycle_state in ('active', 'archived'));
  end if;
end $$;

create unique index if not exists journal_entries_owner_client_mutation_uidx
  on journal_entries (owner_user_id, client_mutation_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_space_id_fkey'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_plant_object_id_fkey'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_plant_object_id_fkey
      foreign key (plant_object_id) references plant_objects(id) on delete cascade;
  end if;
end $$;

create index if not exists journal_entries_owner_object_date_idx
  on journal_entries (owner_user_id, plant_object_id, entry_date desc, created_at desc);

create index if not exists journal_entries_owner_space_date_idx
  on journal_entries (owner_user_id, space_id, entry_date desc, created_at desc)
  where entry_scope = 'space';

create index if not exists journal_entries_public_created_idx
  on journal_entries (created_at desc)
  where visibility = 'public' and lifecycle_state = 'active';

create unique index if not exists journal_entries_public_slug_uidx
  on journal_entries (public_slug)
  where public_slug is not null;

create index if not exists journal_entries_public_gone_idx
  on journal_entries (public_slug, public_gone_at)
  where public_slug is not null and public_gone_at is not null;

create table if not exists journal_entry_object_mentions (
  journal_entry_id uuid not null,
  owner_user_id uuid not null,
  space_id uuid not null,
  plant_object_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (journal_entry_id, plant_object_id),
  constraint journal_entry_object_mentions_entry_fkey
    foreign key (journal_entry_id, owner_user_id, space_id)
    references journal_entries (id, owner_user_id, space_id)
    on delete cascade,
  constraint journal_entry_object_mentions_object_fkey
    foreign key (plant_object_id, owner_user_id, space_id)
    references plant_objects (id, owner_user_id, space_id)
    on delete cascade
);

create index if not exists journal_entry_object_mentions_owner_space_idx
  on journal_entry_object_mentions (owner_user_id, space_id, journal_entry_id);

create index if not exists journal_entry_object_mentions_object_idx
  on journal_entry_object_mentions (owner_user_id, plant_object_id, journal_entry_id);

create table if not exists journal_entry_catalog_mentions (
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  owner_user_id uuid not null,
  space_id uuid not null,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (journal_entry_id, catalog_item_id),
  constraint journal_entry_catalog_mentions_entry_fkey
    foreign key (journal_entry_id, owner_user_id, space_id)
    references journal_entries (id, owner_user_id, space_id)
    on delete cascade
);

alter table journal_entry_catalog_mentions
  add column if not exists space_id uuid;

update journal_entry_catalog_mentions
set space_id = journal_entries.space_id
from journal_entries
where journal_entry_catalog_mentions.journal_entry_id = journal_entries.id
  and journal_entry_catalog_mentions.space_id is null;

alter table journal_entry_catalog_mentions
  alter column space_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_catalog_mentions_entry_fkey'
      and conrelid = 'journal_entry_catalog_mentions'::regclass
  ) then
    alter table journal_entry_catalog_mentions
      add constraint journal_entry_catalog_mentions_entry_fkey
      foreign key (journal_entry_id, owner_user_id, space_id)
      references journal_entries (id, owner_user_id, space_id)
      on delete cascade;
  end if;
end $$;

create index if not exists journal_entry_catalog_mentions_owner_entry_idx
  on journal_entry_catalog_mentions (owner_user_id, space_id, journal_entry_id);

create index if not exists journal_entry_catalog_mentions_catalog_idx
  on journal_entry_catalog_mentions (catalog_item_id, journal_entry_id);

-- Journal topic capture (OVE-139). Topic rows and entry signals are a bounded
-- public-aggregation read model: they intentionally store only topic labels,
-- entry ids, source/review enums, and timestamps. They must never store owner
-- ids, private journal text, fine-grained place data, contact details, media keys,
-- auth/session values, request metadata, or unconfirmed lineage edges.
create table if not exists journal_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  trust_state text not null default 'provisional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_topics_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint journal_topics_label_check
    check (char_length(label) between 2 and 80),
  constraint journal_topics_trust_state_check
    check (trust_state in ('curated', 'provisional', 'rejected'))
);

alter table journal_topics
  add column if not exists slug text,
  add column if not exists label text,
  add column if not exists trust_state text default 'provisional',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table journal_topics
  alter column slug set not null,
  alter column label set not null,
  alter column trust_state set default 'provisional',
  alter column trust_state set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_topics_slug_check'
      and conrelid = 'journal_topics'::regclass
  ) then
    alter table journal_topics
      add constraint journal_topics_slug_check
      check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_topics_label_check'
      and conrelid = 'journal_topics'::regclass
  ) then
    alter table journal_topics
      add constraint journal_topics_label_check
      check (char_length(label) between 2 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_topics_trust_state_check'
      and conrelid = 'journal_topics'::regclass
  ) then
    alter table journal_topics
      add constraint journal_topics_trust_state_check
      check (trust_state in ('curated', 'provisional', 'rejected'));
  end if;
end $$;

create unique index if not exists journal_topics_slug_uidx
  on journal_topics (slug);

create index if not exists journal_topics_trust_updated_idx
  on journal_topics (trust_state, updated_at desc);

create table if not exists journal_entry_topic_signals (
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  topic_id uuid not null references journal_topics(id) on delete cascade,
  signal_source text not null,
  review_state text not null default 'review_needed',
  public_membership_state text not null default 'hidden',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (journal_entry_id, topic_id, signal_source),
  constraint journal_entry_topic_signals_source_check
    check (signal_source in (
      'explicit_tag',
      'object_kind',
      'catalog_kind',
      'catalog_mention',
      'operator_curated'
    )),
  constraint journal_entry_topic_signals_review_check
    check (review_state in ('accepted', 'review_needed', 'rejected')),
  constraint journal_entry_topic_signals_public_state_check
    check (public_membership_state in ('eligible', 'hidden'))
);

alter table journal_entry_topic_signals
  add column if not exists signal_source text,
  add column if not exists review_state text default 'review_needed',
  add column if not exists public_membership_state text default 'hidden',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update journal_entry_topic_signals
set
  review_state = coalesce(review_state, 'review_needed'),
  public_membership_state = coalesce(public_membership_state, 'hidden')
where review_state is null
   or public_membership_state is null;

alter table journal_entry_topic_signals
  alter column signal_source set not null,
  alter column review_state set default 'review_needed',
  alter column review_state set not null,
  alter column public_membership_state set default 'hidden',
  alter column public_membership_state set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_topic_signals_source_check'
      and conrelid = 'journal_entry_topic_signals'::regclass
  ) then
    alter table journal_entry_topic_signals
      add constraint journal_entry_topic_signals_source_check
      check (signal_source in (
        'explicit_tag',
        'object_kind',
        'catalog_kind',
        'catalog_mention',
        'operator_curated'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_topic_signals_review_check'
      and conrelid = 'journal_entry_topic_signals'::regclass
  ) then
    alter table journal_entry_topic_signals
      add constraint journal_entry_topic_signals_review_check
      check (review_state in ('accepted', 'review_needed', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_topic_signals_public_state_check'
      and conrelid = 'journal_entry_topic_signals'::regclass
  ) then
    alter table journal_entry_topic_signals
      add constraint journal_entry_topic_signals_public_state_check
      check (public_membership_state in ('eligible', 'hidden'));
  end if;
end $$;

create index if not exists journal_entry_topic_signals_topic_public_idx
  on journal_entry_topic_signals (topic_id, public_membership_state, review_state);

create index if not exists journal_entry_topic_signals_entry_idx
  on journal_entry_topic_signals (journal_entry_id);

-- First bounded moderated community (OVE-184). Community state references the
-- canonical topic and canonical public journal rows; it never copies journal
-- text, profile presentation, location, media storage, auth, or request data.
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  content_key text not null,
  journal_topic_id uuid not null references journal_topics(id) on delete restrict,
  lifecycle_state text not null default 'draft' check (
    lifecycle_state in ('draft', 'active', 'archived')
  ),
  participation_state text not null default 'open' check (
    participation_state in ('open', 'closed')
  ),
  minimum_ready_contributions integer not null default 1 check (
    minimum_ready_contributions between 1 and 20
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communities_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint communities_content_key_check
    check (content_key ~ '^[a-z0-9][a-z0-9-]{1,63}$')
);

create table if not exists community_rules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  rule_key text not null check (rule_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  sort_order integer not null check (sort_order between 1 and 20),
  rule_state text not null default 'active' check (
    rule_state in ('active', 'retired')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_rules_key_uidx unique (community_id, rule_key),
  constraint community_rules_order_uidx unique (community_id, sort_order)
);

create table if not exists community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null,
  membership_state text not null default 'active' check (
    membership_state in ('active', 'left', 'banned')
  ),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  banned_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint community_memberships_state_check check (
    (membership_state = 'active' and left_at is null and banned_at is null)
    or (membership_state = 'left' and left_at is not null and banned_at is null)
    or (membership_state = 'banned' and banned_at is not null)
  ),
  constraint community_memberships_actor_uidx unique (community_id, user_id)
);

create table if not exists community_moderators (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null,
  assignment_state text not null default 'active' check (
    assignment_state in ('active', 'revoked')
  ),
  granted_by_user_id uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint community_moderators_state_check check (
    (assignment_state = 'active' and revoked_at is null)
    or (assignment_state = 'revoked' and revoked_at is not null)
  ),
  constraint community_moderators_actor_uidx unique (community_id, user_id)
);

create table if not exists community_contributions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  journal_entry_id uuid not null references journal_entries(id) on delete restrict,
  contributor_user_id uuid not null,
  contribution_state text not null default 'active' check (
    contribution_state in ('active', 'removed')
  ),
  discussion_state text not null default 'open' check (
    discussion_state in ('open', 'closed')
  ),
  removed_by_user_id uuid,
  removal_reason text check (
    removal_reason is null or removal_reason in (
      'rule_violation',
      'spam',
      'harassment',
      'privacy',
      'misinformation',
      'off_topic',
      'other'
    )
  ),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint community_contributions_state_check check (
    (contribution_state = 'active' and removed_at is null and removed_by_user_id is null)
    or (contribution_state = 'removed' and removed_at is not null and removed_by_user_id is not null)
  ),
  constraint community_contributions_journal_uidx
    unique (community_id, journal_entry_id)
);

create table if not exists community_contribution_reports (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references community_contributions(id) on delete cascade,
  reporter_user_id uuid not null,
  report_reason text not null check (
    report_reason in (
      'spam',
      'harassment',
      'privacy',
      'misinformation',
      'off_topic',
      'other'
    )
  ),
  report_state text not null default 'submitted' check (
    report_state in ('submitted', 'reviewed', 'dismissed', 'actioned')
  ),
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_reports_resolution_check check (
    (report_state in ('submitted', 'reviewed') and resolved_at is null and resolved_by_user_id is null)
    or (report_state in ('dismissed', 'actioned') and resolved_at is not null and resolved_by_user_id is not null)
  ),
  constraint community_reports_actor_contribution_uidx
    unique (reporter_user_id, contribution_id)
);

-- Append-only moderation evidence. Repository code exposes inserts and reads,
-- never update/delete builders, and records bounded state transitions only.
create table if not exists community_moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  actor_user_id uuid not null,
  target_kind text not null check (
    target_kind in ('community', 'contribution', 'membership', 'report')
  ),
  target_id uuid not null,
  action text not null check (
    action in (
      'remove_contribution',
      'restore_contribution',
      'close_discussion',
      'open_discussion',
      'ban_member',
      'restore_member',
      'dismiss_report',
      'action_report',
      'close_community',
      'open_community'
    )
  ),
  reason text not null check (
    reason in (
      'rule_violation',
      'spam',
      'harassment',
      'privacy',
      'misinformation',
      'off_topic',
      'other'
    )
  ),
  previous_state text not null check (char_length(previous_state) between 1 and 40),
  new_state text not null check (char_length(new_state) between 1 and 40),
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('"user"') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'community_memberships_user_id_fkey'
        and conrelid = 'community_memberships'::regclass
    ) then
      alter table community_memberships
        add constraint community_memberships_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_moderators_user_id_fkey'
        and conrelid = 'community_moderators'::regclass
    ) then
      alter table community_moderators
        add constraint community_moderators_user_id_fkey
        foreign key (user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_moderators_granted_by_user_id_fkey'
        and conrelid = 'community_moderators'::regclass
    ) then
      alter table community_moderators
        add constraint community_moderators_granted_by_user_id_fkey
        foreign key (granted_by_user_id) references "user"(id) on delete set null;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_contributions_contributor_user_id_fkey'
        and conrelid = 'community_contributions'::regclass
    ) then
      alter table community_contributions
        add constraint community_contributions_contributor_user_id_fkey
        foreign key (contributor_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_contributions_removed_by_user_id_fkey'
        and conrelid = 'community_contributions'::regclass
    ) then
      alter table community_contributions
        add constraint community_contributions_removed_by_user_id_fkey
        foreign key (removed_by_user_id) references "user"(id) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_reports_reporter_user_id_fkey'
        and conrelid = 'community_contribution_reports'::regclass
    ) then
      alter table community_contribution_reports
        add constraint community_reports_reporter_user_id_fkey
        foreign key (reporter_user_id) references "user"(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_reports_resolved_by_user_id_fkey'
        and conrelid = 'community_contribution_reports'::regclass
    ) then
      alter table community_contribution_reports
        add constraint community_reports_resolved_by_user_id_fkey
        foreign key (resolved_by_user_id) references "user"(id) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'community_moderation_audit_actor_user_id_fkey'
        and conrelid = 'community_moderation_audit_log'::regclass
    ) then
      alter table community_moderation_audit_log
        add constraint community_moderation_audit_actor_user_id_fkey
        foreign key (actor_user_id) references "user"(id) on delete restrict;
    end if;
  end if;
end $$;

create unique index if not exists communities_slug_uidx
  on communities (slug);

create index if not exists communities_lifecycle_updated_idx
  on communities (lifecycle_state, updated_at desc);

create index if not exists community_rules_active_order_idx
  on community_rules (community_id, sort_order)
  where rule_state = 'active';

create unique index if not exists community_memberships_actor_uidx
  on community_memberships (community_id, user_id);

create index if not exists community_memberships_state_joined_idx
  on community_memberships (community_id, membership_state, joined_at desc);

create unique index if not exists community_moderators_actor_uidx
  on community_moderators (community_id, user_id);

create index if not exists community_moderators_active_idx
  on community_moderators (community_id, granted_at desc)
  where assignment_state = 'active';

create unique index if not exists community_contributions_journal_uidx
  on community_contributions (community_id, journal_entry_id);

create index if not exists community_contributions_active_added_idx
  on community_contributions (community_id, added_at desc, id asc)
  where contribution_state = 'active';

create unique index if not exists community_reports_actor_contribution_uidx
  on community_contribution_reports (reporter_user_id, contribution_id);

create index if not exists community_reports_queue_idx
  on community_contribution_reports (report_state, created_at asc)
  where report_state in ('submitted', 'reviewed');

create index if not exists community_moderation_audit_created_idx
  on community_moderation_audit_log (community_id, created_at desc);

-- Canonical pilot identity and code-owned rule keys. This is real product
-- configuration, not synthetic activity; readiness still requires a real
-- public contribution and active moderator at read time.
insert into journal_topics (id, slug, label, trust_state)
values (
  '018f1840-0000-4000-8000-000000000001',
  'observation-and-care',
  'Спостереження і догляд',
  'curated'
)
on conflict (slug) do update set
  label = excluded.label,
  trust_state = 'curated',
  updated_at = now();

insert into communities (
  id,
  slug,
  content_key,
  journal_topic_id,
  lifecycle_state,
  participation_state,
  minimum_ready_contributions
)
select
  '018f1840-0000-4000-8000-000000000002',
  'observation-and-care',
  'observation-and-care',
  journal_topics.id,
  'active',
  'open',
  1
from journal_topics
where journal_topics.slug = 'observation-and-care'
on conflict (slug) do update set
  content_key = excluded.content_key,
  journal_topic_id = excluded.journal_topic_id,
  updated_at = now();

insert into community_rules (id, community_id, rule_key, sort_order, rule_state)
values
  (
    '018f1840-0000-4000-8000-000000000011',
    (select id from communities where slug = 'observation-and-care'),
    'share-observed-evidence',
    1,
    'active'
  ),
  (
    '018f1840-0000-4000-8000-000000000012',
    (select id from communities where slug = 'observation-and-care'),
    'protect-people-and-places',
    2,
    'active'
  ),
  (
    '018f1840-0000-4000-8000-000000000013',
    (select id from communities where slug = 'observation-and-care'),
    'disagree-with-care',
    3,
    'active'
  )
on conflict (community_id, rule_key) do update set
  sort_order = excluded.sort_order,
  rule_state = 'active',
  updated_at = now();

insert into community_moderators (
  community_id,
  user_id,
  assignment_state,
  granted_by_user_id
)
select
  communities.id,
  admin_user_roles.user_id,
  'active',
  admin_user_roles.user_id
from admin_user_roles
cross join communities
where admin_user_roles.role = 'owner'
  and communities.slug = 'observation-and-care'
on conflict (community_id, user_id) do update set
  assignment_state = 'active',
  revoked_at = null,
  updated_at = now();

-- Lineage pending source identities (OVE-124). These rows represent a
-- non-user provenance source before they join and claim/confirm the edge.
-- Store only internal ids, a bounded contact-free display label, enum state,
-- and timestamps. Never store invite links, raw tokens, emails, phone numbers,
-- URLs, referrers, IP/user-agent values, media keys, journal text, or precise
-- location data here.
create table if not exists lineage_pending_source_identities (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid,
  display_label text not null check (
    char_length(display_label) between 1 and 120
  ),
  invite_state text not null default 'pending' check (
    invite_state in ('pending', 'claimed', 'declined', 'anonymized')
  ),
  claimed_by_user_id uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'lineage_pending_source_identities_created_by_fkey'
        and conrelid = 'lineage_pending_source_identities'::regclass
    ) then
      alter table lineage_pending_source_identities
        add constraint lineage_pending_source_identities_created_by_fkey
        foreign key (created_by_user_id) references "user"(id) on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'lineage_pending_source_identities_claimed_by_fkey'
        and conrelid = 'lineage_pending_source_identities'::regclass
    ) then
      alter table lineage_pending_source_identities
        add constraint lineage_pending_source_identities_claimed_by_fkey
        foreign key (claimed_by_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists lineage_pending_source_identities_creator_created_idx
  on lineage_pending_source_identities (created_by_user_id, created_at desc)
  where created_by_user_id is not null;

create index if not exists lineage_pending_source_identities_claimed_created_idx
  on lineage_pending_source_identities (claimed_by_user_id, created_at desc)
  where claimed_by_user_id is not null;

create table if not exists lineage_provenance_edges (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  subject_plant_object_id uuid not null,
  source_kind text not null check (
    source_kind in ('own_object', 'source_reference', 'pending_identity')
  ),
  source_plant_object_id uuid,
  source_owner_user_id uuid,
  source_pending_identity_id uuid,
  source_reference_kind text check (
    source_reference_kind is null
    or source_reference_kind in (
      'person',
      'seed_packet',
      'nursery',
      'catalog_variety',
      'other'
    )
  ),
  source_reference_label text check (
    source_reference_label is null
    or char_length(source_reference_label) between 1 and 120
  ),
  edge_type text not null default 'provenance' check (
    edge_type in ('provenance')
  ),
  consent_state text not null default 'proposed' check (
    consent_state in ('proposed', 'confirmed', 'declined', 'anonymized')
  ),
  visibility_policy text not null default 'owner_only_until_confirmed' check (
    visibility_policy in ('owner_only_until_confirmed')
  ),
  erasure_state text not null default 'active' check (
    erasure_state in (
      'active',
      'source_tombstone',
      'subject_tombstone',
      'anonymized'
    )
  ),
  client_mutation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lineage_provenance_edges_owner_client_mutation_uidx
    unique (owner_user_id, client_mutation_id),
  constraint lineage_provenance_edges_subject_fkey
    foreign key (subject_plant_object_id, owner_user_id)
    references plant_objects (id, owner_user_id)
    on update cascade
    on delete restrict,
  constraint lineage_provenance_edges_source_object_fkey
    foreign key (source_plant_object_id, source_owner_user_id)
    references plant_objects (id, owner_user_id)
    on update cascade
    on delete restrict,
  constraint lineage_provenance_edges_source_shape_check check (
    (
      source_kind = 'own_object'
      and source_plant_object_id is not null
      and source_owner_user_id is not null
      and source_reference_kind is null
      and source_reference_label is null
      and source_plant_object_id <> subject_plant_object_id
    )
    or (
      source_kind = 'source_reference'
      and source_plant_object_id is null
      and source_reference_kind is not null
      and (
        (
          source_reference_kind = 'person'
          and source_owner_user_id is not null
          and source_reference_label is null
        )
        or (
          source_owner_user_id is null
          and source_reference_label is not null
        )
      )
    )
  )
);

alter table lineage_provenance_edges
  add column if not exists source_pending_identity_id uuid;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_source_kind_check'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      drop constraint lineage_provenance_edges_source_kind_check;
  end if;

  alter table lineage_provenance_edges
    add constraint lineage_provenance_edges_source_kind_check
    check (source_kind in ('own_object', 'source_reference', 'pending_identity'));

  if exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_source_shape_check'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      drop constraint lineage_provenance_edges_source_shape_check;
  end if;

  -- OVE-203 converts confirmed handle mentions from mutable public text to the
  -- stable internal user id. Only exact legacy rows produced by the former
  -- `handle <current-handle>` writer are migrated; unmatched external person
  -- references remain bounded labels and are never guessed.
  update lineage_provenance_edges edge
  set
    source_owner_user_id = profile.user_id,
    source_reference_label = null,
    updated_at = now()
  from user_public_profiles profile
  where edge.source_kind = 'source_reference'
    and edge.source_reference_kind = 'person'
    and edge.source_owner_user_id is null
    and lower(edge.source_reference_label) = 'handle ' || profile.normalized_handle
    and edge.client_mutation_id ~ ':mention:public_handle:[a-f0-9]{16}$'
    and right(edge.client_mutation_id, 16) = substring(
      encode(
        digest('public_handle:' || profile.normalized_handle, 'sha256'),
        'hex'
      )
      from 1 for 16
    );

  alter table lineage_provenance_edges
    add constraint lineage_provenance_edges_source_shape_check check (
      (
        source_kind = 'own_object'
        and source_plant_object_id is not null
        and source_owner_user_id is not null
        and source_pending_identity_id is null
        and source_reference_kind is null
        and source_reference_label is null
        and source_plant_object_id <> subject_plant_object_id
      )
      or (
        source_kind = 'source_reference'
        and source_plant_object_id is null
        and source_pending_identity_id is null
        and source_reference_kind is not null
        and (
          (
            source_reference_kind = 'person'
            and source_owner_user_id is not null
            and source_reference_label is null
          )
          or (
            source_owner_user_id is null
            and source_reference_label is not null
          )
        )
      )
      or (
        source_kind = 'pending_identity'
        and source_plant_object_id is null
        and source_owner_user_id is null
        and source_pending_identity_id is not null
        and source_reference_kind is null
        and source_reference_label is null
      )
    );

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_owner_client_mutation_uidx'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      add constraint lineage_provenance_edges_owner_client_mutation_uidx
      unique (owner_user_id, client_mutation_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_subject_fkey'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      add constraint lineage_provenance_edges_subject_fkey
      foreign key (subject_plant_object_id, owner_user_id)
      references plant_objects (id, owner_user_id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_source_object_fkey'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      add constraint lineage_provenance_edges_source_object_fkey
      foreign key (source_plant_object_id, source_owner_user_id)
      references plant_objects (id, owner_user_id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edges_pending_identity_fkey'
      and conrelid = 'lineage_provenance_edges'::regclass
  ) then
    alter table lineage_provenance_edges
      add constraint lineage_provenance_edges_pending_identity_fkey
      foreign key (source_pending_identity_id)
      references lineage_pending_source_identities (id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists lineage_provenance_edges_owner_subject_idx
  on lineage_provenance_edges (owner_user_id, subject_plant_object_id, created_at desc);

create index if not exists lineage_provenance_edges_owner_source_object_idx
  on lineage_provenance_edges (owner_user_id, source_plant_object_id, created_at desc)
  where source_plant_object_id is not null;

create index if not exists lineage_provenance_edges_owner_pending_identity_idx
  on lineage_provenance_edges (owner_user_id, source_pending_identity_id, created_at desc)
  where source_pending_identity_id is not null;

-- Lineage claim audit trail (OVE-123). Audit rows store only internal ids,
-- bounded action/state enums, the active visibility policy, and timestamps.
-- Never store journal text, source labels, media keys, contacts, IP/user-agent,
-- invite identity, raw request metadata, or fine-grained place data here.
create table if not exists lineage_provenance_edge_audit_events (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null,
  actor_user_id uuid,
  target_user_id uuid,
  action text not null check (action in ('confirm', 'decline')),
  previous_consent_state text not null check (
    previous_consent_state in ('proposed', 'confirmed', 'declined', 'anonymized')
  ),
  new_consent_state text not null check (
    new_consent_state in ('confirmed', 'declined')
  ),
  visibility_policy text not null check (
    visibility_policy in ('owner_only_until_confirmed')
  ),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_provenance_edge_audit_events_edge_fkey'
      and conrelid = 'lineage_provenance_edge_audit_events'::regclass
  ) then
    alter table lineage_provenance_edge_audit_events
      add constraint lineage_provenance_edge_audit_events_edge_fkey
      foreign key (edge_id)
      references lineage_provenance_edges (id)
      on update cascade
      on delete cascade;
  end if;

  if to_regclass('"user"') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'lineage_provenance_edge_audit_events_actor_fkey'
        and conrelid = 'lineage_provenance_edge_audit_events'::regclass
    ) then
      alter table lineage_provenance_edge_audit_events
        add constraint lineage_provenance_edge_audit_events_actor_fkey
        foreign key (actor_user_id) references "user"(id) on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'lineage_provenance_edge_audit_events_target_fkey'
        and conrelid = 'lineage_provenance_edge_audit_events'::regclass
    ) then
      alter table lineage_provenance_edge_audit_events
        add constraint lineage_provenance_edge_audit_events_target_fkey
        foreign key (target_user_id) references "user"(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists lineage_provenance_edge_audit_events_edge_created_idx
  on lineage_provenance_edge_audit_events (edge_id, created_at desc);

create index if not exists lineage_provenance_edge_audit_events_target_created_idx
  on lineage_provenance_edge_audit_events (target_user_id, created_at desc)
  where target_user_id is not null;

-- Lineage follows and questions (OVE-126). These rows are private interaction
-- state over already-confirmed public-safe lineage edges. They intentionally do
-- not store emails, contact handles, fine-grained place data, media keys, IPs,
-- user-agents, raw request metadata, journal text, or source labels.
create table if not exists lineage_node_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null,
  target_owner_user_id uuid not null,
  target_plant_object_id uuid not null,
  lineage_edge_id uuid not null,
  follow_state text not null default 'active' check (
    follow_state in ('active', 'anonymized')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lineage_node_follows_cross_user_check
    check (follower_user_id <> target_owner_user_id),
  constraint lineage_node_follows_follower_target_uidx
    unique (follower_user_id, target_plant_object_id)
);

create table if not exists lineage_questions (
  id uuid primary key default gen_random_uuid(),
  asker_user_id uuid not null,
  recipient_user_id uuid not null,
  lineage_edge_id uuid not null,
  subject_plant_object_id uuid not null,
  target_plant_object_id uuid not null,
  question_text text not null check (char_length(question_text) between 1 and 360),
  question_state text not null default 'delivered' check (
    question_state in ('delivered', 'anonymized')
  ),
  client_mutation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lineage_questions_cross_user_check
    check (asker_user_id <> recipient_user_id),
  constraint lineage_questions_asker_client_mutation_uidx
    unique (asker_user_id, client_mutation_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_node_follows_cross_user_check'
      and conrelid = 'lineage_node_follows'::regclass
  ) then
    alter table lineage_node_follows
      add constraint lineage_node_follows_cross_user_check
      check (follower_user_id <> target_owner_user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_questions_cross_user_check'
      and conrelid = 'lineage_questions'::regclass
  ) then
    alter table lineage_questions
      add constraint lineage_questions_cross_user_check
      check (asker_user_id <> recipient_user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_node_follows_edge_fkey'
      and conrelid = 'lineage_node_follows'::regclass
  ) then
    alter table lineage_node_follows
      add constraint lineage_node_follows_edge_fkey
      foreign key (lineage_edge_id)
      references lineage_provenance_edges (id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_node_follows_target_object_fkey'
      and conrelid = 'lineage_node_follows'::regclass
  ) then
    alter table lineage_node_follows
      add constraint lineage_node_follows_target_object_fkey
      foreign key (target_plant_object_id, target_owner_user_id)
      references plant_objects (id, owner_user_id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_questions_edge_fkey'
      and conrelid = 'lineage_questions'::regclass
  ) then
    alter table lineage_questions
      add constraint lineage_questions_edge_fkey
      foreign key (lineage_edge_id)
      references lineage_provenance_edges (id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_questions_subject_object_fkey'
      and conrelid = 'lineage_questions'::regclass
  ) then
    alter table lineage_questions
      add constraint lineage_questions_subject_object_fkey
      foreign key (subject_plant_object_id)
      references plant_objects (id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_questions_target_object_fkey'
      and conrelid = 'lineage_questions'::regclass
  ) then
    alter table lineage_questions
      add constraint lineage_questions_target_object_fkey
      foreign key (target_plant_object_id)
      references plant_objects (id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lineage_questions_target_recipient_fkey'
      and conrelid = 'lineage_questions'::regclass
  ) then
    alter table lineage_questions
      add constraint lineage_questions_target_recipient_fkey
      foreign key (target_plant_object_id, recipient_user_id)
      references plant_objects (id, owner_user_id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists lineage_node_follows_follower_created_idx
  on lineage_node_follows (follower_user_id, created_at desc)
  where follow_state = 'active';

create index if not exists lineage_node_follows_target_owner_created_idx
  on lineage_node_follows (target_owner_user_id, created_at desc)
  where follow_state = 'active';

create index if not exists lineage_node_follows_edge_idx
  on lineage_node_follows (lineage_edge_id);

create index if not exists lineage_questions_recipient_created_idx
  on lineage_questions (recipient_user_id, created_at desc)
  where question_state = 'delivered';

create index if not exists lineage_questions_asker_created_idx
  on lineage_questions (asker_user_id, created_at desc)
  where question_state = 'delivered';

create index if not exists lineage_questions_edge_created_idx
  on lineage_questions (lineage_edge_id, created_at desc)
  where question_state = 'delivered';

create table if not exists erasure_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null,
  request_scope text not null default 'account_data_erasure' check (
    request_scope in ('account_data_erasure')
  ),
  status text not null default 'submitted' check (
    status in ('submitted', 'reviewing', 'handled', 'canceled')
  ),
  submitted_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_status text check (
    handled_status is null
    or handled_status in (
      'completed',
      'declined',
      'duplicate',
      'needs_identity_verification'
    )
  ),
  handled_by_user_id uuid,
  intake_disclosure_version text not null default 'erasure-request-pilot-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erasure_requests_status_submitted_idx
  on erasure_requests (status, submitted_at desc);

create index if not exists erasure_requests_requester_submitted_idx
  on erasure_requests (requester_user_id, submitted_at desc);

create unique index if not exists erasure_requests_one_open_per_user_uidx
  on erasure_requests (requester_user_id)
  where status in ('submitted', 'reviewing');

-- OVE-47 erasure dry-run review marker. Non-destructive operator checkpoint only.
alter table erasure_requests
  add column if not exists dry_run_reviewed_at timestamptz,
  add column if not exists dry_run_reviewed_by_user_id uuid;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  session_id text,
  event_name text not null check (
    event_name in (
      'activation_started',
      'space_created',
      'object_created',
      'entry_logged',
      'entry_photo_attached',
      'offline_entry_queued',
      'offline_entry_synced',
      'progress_screen_shown',
      'own_record_revisited',
      'follow_up_value_pulse'
    )
  ),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object'),
  space_id uuid references spaces(id) on delete set null,
  plant_object_id uuid references plant_objects(id) on delete set null,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  related_event_id uuid references analytics_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      drop constraint analytics_events_event_name_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'analytics_events_event_name_check'
      and conrelid = 'analytics_events'::regclass
  ) then
    alter table analytics_events
      add constraint analytics_events_event_name_check
      check (
        event_name in (
          'activation_started',
          'space_created',
          'object_created',
          'entry_logged',
          'entry_photo_attached',
          'offline_entry_queued',
          'offline_entry_synced',
          'progress_screen_shown',
          'own_record_revisited',
          'follow_up_value_pulse'
        )
      );
  end if;
end $$;

create index if not exists analytics_events_owner_event_created_idx
  on analytics_events (owner_user_id, event_name, created_at desc);

create index if not exists analytics_events_owner_session_object_idx
  on analytics_events (owner_user_id, session_id, plant_object_id, created_at desc)
  where session_id is not null and plant_object_id is not null;

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  quarantine_key text not null unique,
  derivative_key text unique,
  alt_text text,
  caption text,
  status text not null default 'quarantined' check (status in ('quarantined', 'processed', 'failed')),
  original_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table media_assets
  add column if not exists alt_text text,
  add column if not exists caption text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_alt_text_length_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_alt_text_length_check
      check (alt_text is null or length(btrim(alt_text)) between 1 and 300);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_caption_length_check'
      and conrelid = 'media_assets'::regclass
  ) then
    alter table media_assets
      add constraint media_assets_caption_length_check
      check (caption is null or length(btrim(caption)) between 1 and 500);
  end if;
end $$;

create index if not exists media_assets_owner_created_idx
  on media_assets (owner_user_id, created_at desc);

-- OVE-202: up to ten processed non-fixture inline attachments per entry.
-- Visual-fixture namespace may still attach multiple rows for deterministic UI proof.
drop index if exists media_assets_one_per_entry_uidx;
drop index if exists media_assets_one_non_fixture_per_entry_uidx;

alter table media_assets
  add column if not exists document_position integer;

create index if not exists media_assets_entry_created_idx
  on media_assets (journal_entry_id, created_at asc, id asc)
  where journal_entry_id is not null;

create index if not exists media_assets_entry_document_position_idx
  on media_assets (journal_entry_id, document_position asc, id asc)
  where journal_entry_id is not null
    and document_position is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_public_profiles_avatar_media_asset_id_fkey'
      and conrelid = 'user_public_profiles'::regclass
  ) then
    alter table user_public_profiles
      add constraint user_public_profiles_avatar_media_asset_id_fkey
      foreign key (avatar_media_asset_id)
      references media_assets(id)
      on delete set null;
  end if;
end $$;

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  idempotency_key text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  rerun_requested boolean not null default false,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_queue
  add column if not exists rerun_requested boolean not null default false;

alter table job_queue
  drop constraint if exists job_queue_catalog_match_payload_check;

alter table job_queue
  add constraint job_queue_catalog_match_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_match_suggestions_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'sourceCatalogItemId']::text[]
      and payload - array['kind', 'sourceCatalogItemId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'sourceCatalogItemId') = 'string'
      and payload->>'kind' = 'catalog_match_suggestions_refresh'
      and payload->>'sourceCatalogItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_alias_payload_check;

alter table job_queue
  add constraint job_queue_catalog_alias_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_alias_suggestions_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'catalogItemId']::text[]
      and payload - array['kind', 'catalogItemId']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'catalogItemId') = 'string'
      and payload->>'kind' = 'catalog_alias_suggestions_refresh'
      and payload->>'catalogItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_fuzzy_duplicate_payload_check;

alter table job_queue
  add constraint job_queue_catalog_fuzzy_duplicate_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_fuzzy_duplicate_qa_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ? 'kind'
      and payload - array['kind']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'catalog_fuzzy_duplicate_qa_refresh'
    )
  );

create unique index if not exists job_queue_idempotency_key_uidx
  on job_queue (idempotency_key)
  where idempotency_key is not null;

create index if not exists job_queue_claim_idx
  on job_queue (queue_name, status, available_at, created_at);

-- Safe OVE-190 worker liveness/capability lease. This table deliberately stores
-- no hostname, process id, user identifier, queue payload, connection detail,
-- or raw operational error. The single queue-scoped row lets API readiness
-- prove that the active worker runs the exact immutable release and all six
-- supported handlers.
create table if not exists matching_worker_heartbeats (
  queue_name text primary key,
  release_commit_sha text not null,
  image_digest text not null,
  schema_compatibility_class text not null,
  supported_handlers text[] not null,
  seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matching_worker_heartbeats_commit_sha_check
    check (release_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint matching_worker_heartbeats_image_digest_check
    check (image_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint matching_worker_heartbeats_schema_compatibility_check
    check (schema_compatibility_class = 'ove190.matching-schema.v1'),
  constraint matching_worker_heartbeats_queue_name_check
    check (queue_name = 'matching'),
  constraint matching_worker_heartbeats_supported_handlers_check
    check (
      supported_handlers = array[
        'catalog_alias_suggestions_refresh',
        'catalog_fuzzy_duplicate_qa_refresh',
        'catalog_match_suggestions_refresh',
        'catalog_typeahead_reindex',
        'journal_entry_index',
        'journal_entry_unindex'
      ]::text[]
    )
);

-- Existing idempotently bootstrapped databases may have first seen an earlier
-- unnamed version of the checks. Add the stable names without dropping any
-- protection so runtime preflight can prove the exact schema contract.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_commit_sha_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_commit_sha_check
      check (release_commit_sha ~ '^[0-9a-f]{40}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_image_digest_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_image_digest_check
      check (image_digest ~ '^sha256:[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_schema_compatibility_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_schema_compatibility_check
      check (schema_compatibility_class = 'ove190.matching-schema.v1');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_queue_name_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_queue_name_check
      check (queue_name = 'matching');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matching_worker_heartbeats_supported_handlers_check'
      and conrelid = 'matching_worker_heartbeats'::regclass
  ) then
    alter table matching_worker_heartbeats
      add constraint matching_worker_heartbeats_supported_handlers_check
      check (
        supported_handlers = array[
          'catalog_alias_suggestions_refresh',
          'catalog_fuzzy_duplicate_qa_refresh',
          'catalog_match_suggestions_refresh',
          'catalog_typeahead_reindex',
          'journal_entry_index',
          'journal_entry_unindex'
        ]::text[]
      );
  end if;
end $$;

-- Closed-pilot write eligibility (OVE-42, OVE-52, OVE-54). One persistent grant per
-- user that proves invited write access. It stores ONLY the user id, enum
-- cohort, enum pilot segment, and timestamps: never the invite link, token,
-- email, phone, referrer, IP, user agent, or query string. Cohort membership
-- and segment decision support stay enum-only. Founder rehearsal grants can
-- exercise the path internally but must stay excluded from real pilot decisions.
create table if not exists pilot_invite_grants (
  user_id uuid primary key,
  cohort text not null default 'closed_pilot' check (cohort in ('closed_pilot', 'founder_rehearsal')),
  segment text not null default 'unknown_segment' check (
    segment in (
      'casual_micro_grower',
      'casual_gen_z',
      'casual_practical_beginner',
      'casual_urban_balcony',
      'casual_food_self_reliance',
      'power_burned_out_it',
      'power_collector',
      'power_experienced',
      'power_homestead',
      'supply_expert_creator',
      'supply_local_seller',
      'channel_ally',
      'unknown_segment'
    )
  ),
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pilot_invite_grants
  add column if not exists cohort text not null default 'closed_pilot';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_invite_grants_cohort_check'
      and conrelid = 'pilot_invite_grants'::regclass
  ) then
    alter table pilot_invite_grants
      drop constraint pilot_invite_grants_cohort_check;
  end if;

  alter table pilot_invite_grants
    add constraint pilot_invite_grants_cohort_check
    check (cohort in ('closed_pilot', 'founder_rehearsal'));
end $$;

alter table pilot_invite_grants
  add column if not exists segment text not null default 'unknown_segment';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_invite_grants_segment_check'
      and conrelid = 'pilot_invite_grants'::regclass
  ) then
    alter table pilot_invite_grants
      drop constraint pilot_invite_grants_segment_check;
  end if;

  alter table pilot_invite_grants
    add constraint pilot_invite_grants_segment_check
    check (
      segment in (
        'casual_micro_grower',
        'casual_gen_z',
        'casual_practical_beginner',
        'casual_urban_balcony',
        'casual_food_self_reliance',
        'power_burned_out_it',
        'power_collector',
        'power_experienced',
        'power_homestead',
        'supply_expert_creator',
        'supply_local_seller',
        'channel_ally',
        'unknown_segment'
      )
    );
end $$;

create index if not exists pilot_invite_grants_granted_idx
  on pilot_invite_grants (granted_at desc);

create index if not exists pilot_invite_grants_segment_granted_idx
  on pilot_invite_grants (segment, granted_at desc);

create index if not exists pilot_invite_grants_cohort_segment_granted_idx
  on pilot_invite_grants (cohort, segment, granted_at desc);

-- Founder interview capture (OVE-45). Operator-only structured pilot learnings.
-- Stores bounded enum fields and an optional short redacted note. Never journal
-- text, media keys, contact details, request metadata, or raw transcripts.
create table if not exists pilot_interview_learnings (
  id uuid primary key default gen_random_uuid(),
  recorded_by_user_id uuid not null,
  subject_user_id uuid,
  pilot_cohort text check (pilot_cohort is null or pilot_cohort in ('closed_pilot', 'founder_rehearsal')),
  segment text not null check (
    segment in (
      'casual_micro_grower',
      'casual_gen_z',
      'casual_practical_beginner',
      'casual_urban_balcony',
      'casual_food_self_reliance',
      'power_burned_out_it',
      'power_collector',
      'power_experienced',
      'power_homestead',
      'supply_expert_creator',
      'supply_local_seller',
      'channel_ally',
      'unknown_segment'
    )
  ),
  activation_result text not null check (
    activation_result in (
      'not_activated',
      'activated_first_entry_only',
      'activated_with_follow_up',
      'started_no_save',
      'dropped_after_first',
      'not_in_cohort',
      'unknown'
    )
  ),
  return_reason text not null check (
    return_reason in (
      'same_object_follow_up',
      'seasonal_return',
      'never_returned',
      'returned_no_save',
      'privacy_concern',
      'composer_friction',
      'not_relevant_yet',
      'unknown'
    )
  ),
  main_objection text not null check (
    main_objection in (
      'no_journal_habit',
      'too_much_effort',
      'privacy_location',
      'no_clear_value',
      'prefers_paper_or_social',
      'product_too_early',
      'not_gardener_fit',
      'none_observed',
      'unknown'
    )
  ),
  observed_value text not null check (
    observed_value in (
      'history_worth_keeping',
      'photo_safe_capture',
      'catalog_helpful',
      'offline_queue_helpful',
      'progress_moment_helpful',
      'public_variety_hook',
      'no_clear_value_yet',
      'unknown'
    )
  ),
  next_action text not null check (
    next_action in (
      'continue_pilot',
      'iterate_composer',
      'iterate_onboarding',
      'iterate_privacy_copy',
      'schedule_follow_up',
      'pause_recruiting',
      'close_track',
      'none'
    )
  ),
  redacted_note text check (
    redacted_note is null or char_length(redacted_note) between 1 and 280
  ),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pilot_interview_learnings_pilot_cohort_check'
      and conrelid = 'pilot_interview_learnings'::regclass
  ) then
    alter table pilot_interview_learnings
      drop constraint pilot_interview_learnings_pilot_cohort_check;
  end if;

  alter table pilot_interview_learnings
    add constraint pilot_interview_learnings_pilot_cohort_check
    check (pilot_cohort is null or pilot_cohort in ('closed_pilot', 'founder_rehearsal'));
end $$;

create index if not exists pilot_interview_learnings_segment_recorded_idx
  on pilot_interview_learnings (segment, recorded_at desc);

create index if not exists pilot_interview_learnings_activation_recorded_idx
  on pilot_interview_learnings (activation_result, recorded_at desc);

create index if not exists pilot_interview_learnings_subject_recorded_idx
  on pilot_interview_learnings (subject_user_id, recorded_at desc)
  where subject_user_id is not null;

-- ---------------------------------------------------------------------------
-- OVE-202: structured JournalDocumentV1 persistence, aggregate revision,
-- mutation receipts, and transactional max-10 inline media enforcement.
-- ---------------------------------------------------------------------------

alter table journal_entries
  add column if not exists content_document jsonb,
  add column if not exists content_schema_version integer,
  add column if not exists journal_revision bigint;

update journal_entries
set journal_revision = 1
where journal_revision is null;

alter table journal_entries
  alter column journal_revision set default 1,
  alter column journal_revision set not null;

do $$
declare
  body_constraint_name text;
begin
  for body_constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conrelid = 'journal_entries'::regclass
      and con.contype = 'c'
      and att.attname = 'body'
      and pg_get_constraintdef(con.oid) like '%2000%'
  loop
    execute format(
      'alter table journal_entries drop constraint %I',
      body_constraint_name
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_body_length_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_body_length_check
      check (char_length(body) between 1 and 20000);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_content_schema_version_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_content_schema_version_check
      check (
        content_schema_version is null
        or content_schema_version >= 1
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_journal_revision_positive_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_journal_revision_positive_check
      check (journal_revision >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_content_document_object_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_content_document_object_check
      check (
        content_document is null
        or jsonb_typeof(content_document) = 'object'
      );
  end if;
end $$;

create table if not exists journal_entry_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  client_mutation_id text not null,
  base_revision bigint not null check (base_revision >= 0),
  result_revision bigint not null check (result_revision >= 1),
  mutation_kind text not null check (
    mutation_kind in ('create', 'edit')
  ),
  created_at timestamptz not null default now(),
  constraint journal_entry_mutation_receipts_owner_entry_mutation_uidx
    unique (owner_user_id, journal_entry_id, client_mutation_id)
);

create index if not exists journal_entry_mutation_receipts_owner_created_idx
  on journal_entry_mutation_receipts (owner_user_id, created_at desc);

create or replace function enforce_journal_entry_inline_media_limit()
returns trigger
language plpgsql
as $$
declare
  attached_count integer;
begin
  if new.journal_entry_id is null then
    return new;
  end if;

  if new.quarantine_key like 'visual-fixtures/%' then
    return new;
  end if;

  select count(*)::integer
  into attached_count
  from media_assets
  where journal_entry_id = new.journal_entry_id
    and quarantine_key not like 'visual-fixtures/%'
    and id is distinct from new.id;

  if attached_count >= 10 then
    raise exception 'journal entry may attach at most 10 non-fixture media assets'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_inline_limit_trg on media_assets;
create trigger media_assets_inline_limit_trg
  before insert or update of journal_entry_id
  on media_assets
  for each row
  execute function enforce_journal_entry_inline_media_limit();
