-- OVE-237 — bounded, atomic admission for public interaction mutations.
--
-- This stores only short-lived, server-authoritative counters and hashes. It
-- deliberately has no IP, user-agent, contact, content, coordinate, or broad
-- cross-target device-identity field.

create table if not exists interaction_quota_windows (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references "user"(id) on delete cascade,
  quota_policy text not null check (
    quota_policy in (
      'comment_root_global',
      'comment_root_target',
      'comment_reply_global',
      'comment_reply_target',
      'lineage_question_global',
      'lineage_question_edge',
      'lineage_question_recipient'
    )
  ),
  quota_scope text not null check (
    char_length(quota_scope) between 1 and 200
    and quota_scope !~ '[[:cntrl:]]'
  ),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  used_count integer not null default 1 check (used_count between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_quota_windows_expiry_check
    check (expires_at > window_started_at),
  constraint interaction_quota_windows_actor_policy_scope_window_uidx
    unique (actor_user_id, quota_policy, quota_scope, window_started_at)
);

create index if not exists interaction_quota_windows_actor_expiry_idx
  on interaction_quota_windows (actor_user_id, expires_at);

alter table engagement_likes
  add column if not exists capability_expires_at timestamptz;

-- Existing unsigned-device rows have no capability expiry. They are retained
-- only until a target's next admission cleanup and never count as active.
alter table engagement_likes
  drop constraint if exists engagement_likes_capability_expiry_check;

alter table engagement_likes
  add constraint engagement_likes_capability_expiry_check
  check (
    capability_expires_at is null
    or capability_expires_at > created_at
  );

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

create index if not exists engagement_likes_target_capability_expiry_idx
  on engagement_likes (target_kind, target_ref, capability_expires_at)
  where capability_expires_at is not null;
