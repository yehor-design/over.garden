-- OVE-235 — canonical comment moderation and contribution-scoped discussion.
--
-- `community_contribution` is intentionally accepted only by
-- engagement_comments. It is not a generic engagement target and must never
-- reach anonymous likes, bookmarks, follows, or their counters.

alter table engagement_comments
  drop constraint if exists engagement_comments_target_kind_check;

alter table engagement_comments
  add constraint engagement_comments_target_kind_check
  check (
    target_kind in (
      'journal_entry',
      'lineage_object',
      'variety',
      'topic',
      'community_contribution'
    )
  );

alter table engagement_comment_reports
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_user_id uuid;

-- Historical `reviewed` rows predate reviewer metadata. Preserve their state
-- with their canonical update timestamp; no identity is invented.
update engagement_comment_reports
set reviewed_at = updated_at
where report_state = 'reviewed'
  and reviewed_at is null;

update engagement_comment_reports
set resolved_at = updated_at
where report_state in ('dismissed', 'actioned')
  and resolved_at is null;

alter table engagement_comment_reports
  drop constraint if exists engagement_comment_reports_reviewed_by_user_id_fkey,
  drop constraint if exists engagement_comment_reports_resolved_by_user_id_fkey,
  drop constraint if exists engagement_comment_reports_state_metadata_check;

alter table engagement_comment_reports
  add constraint engagement_comment_reports_reviewed_by_user_id_fkey
    foreign key (reviewed_by_user_id) references "user"(id) on delete set null,
  add constraint engagement_comment_reports_resolved_by_user_id_fkey
    foreign key (resolved_by_user_id) references "user"(id) on delete set null,
  add constraint engagement_comment_reports_state_metadata_check check (
    (report_state = 'submitted'
      and reviewed_at is null
      and reviewed_by_user_id is null
      and resolved_at is null
      and resolved_by_user_id is null)
    or (report_state = 'reviewed'
      and reviewed_at is not null
      and resolved_at is null
      and resolved_by_user_id is null)
    or (report_state in ('dismissed', 'actioned')
      and resolved_at is not null)
  );

create table if not exists engagement_moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references engagement_comments(id) on delete set null,
  report_id uuid references engagement_comment_reports(id) on delete set null,
  actor_user_id uuid references "user"(id) on delete set null,
  action text not null check (action in ('review', 'dismiss', 'remove')),
  reason text not null check (
    reason in ('spam', 'harassment', 'privacy', 'misinformation', 'other')
  ),
  previous_state text not null check (
    previous_state in ('submitted', 'reviewed', 'dismissed', 'actioned')
  ),
  next_state text not null check (
    next_state in ('reviewed', 'dismissed', 'actioned')
  ),
  created_at timestamptz not null default now(),
  constraint engagement_moderation_audit_log_action_state_check check (
    (action = 'review' and previous_state = 'submitted' and next_state = 'reviewed')
    or (action = 'dismiss' and previous_state in ('submitted', 'reviewed') and next_state = 'dismissed')
    or (action = 'remove' and previous_state in ('submitted', 'reviewed') and next_state = 'actioned')
  )
);

create index if not exists engagement_comment_reports_open_queue_idx
  on engagement_comment_reports (report_state, created_at, id)
  where report_state in ('submitted', 'reviewed');

create index if not exists engagement_moderation_audit_log_comment_idx
  on engagement_moderation_audit_log (comment_id, created_at desc);
