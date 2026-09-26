-- OVE-526 (ADR-0038 D5): the complaint procedure. Anyone, with or without an
-- account, can report a public entry, a profile, an object passport or a tag
-- page (DSA Art. 16); the owner decides, and a removal sends the author a
-- statement of reasons (DSA Art. 17).
--
-- `content_reports` is one report: what was reported (its kind, its id and
-- the address the reporter was on), why, and who reported it — a name and an
-- email, an account only when they were signed in. `reporter_fingerprint` is
-- an HMAC of the request's network address, kept to rate-limit the form and
-- never the address itself. The owner's decision is recorded on the row:
-- kept, or removed with the ground in the terms and the facts.
--
-- `moderation_messages` is the outbox of the emails the procedure owes: the
-- receipt and the decision to the reporter, the statement of reasons to the
-- author — for a content report, or for a comment the owner removed through
-- comment moderation (`comment_report_id`, no FK: a comment report goes when
-- its entry is deleted, and the message it caused must still be sent). A row
-- is written with its report, in one transaction, and sent afterwards.
--
-- Both are kept for one year after the decision, the privacy policy's figure
-- (`/api/cron/moderation-mail` purges them). On erasure, the reports an
-- account filed and the messages addressed to it go with it (cascade); a
-- report about the account's content stays as the record of the decision,
-- without the link to the author (set null).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null
    check (target_kind in ('entry', 'profile', 'object', 'topic')),
  target_id uuid not null,
  target_address text not null
    check (char_length(target_address) between 1 and 512 and target_address like '/%'),
  target_owner_user_id uuid references "user"(id) on delete set null,
  reason text not null check (
    reason in (
      'spam', 'harassment', 'personal_data', 'animal_cruelty',
      'copyright', 'illegal', 'other'
    )
  ),
  explanation text not null check (char_length(explanation) between 10 and 2000),
  reporter_name text not null check (char_length(btrim(reporter_name)) between 1 and 120),
  reporter_email text not null check (
    char_length(reporter_email) between 3 and 254
    and reporter_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  ),
  reporter_user_id uuid references "user"(id) on delete cascade,
  reporter_fingerprint text not null check (reporter_fingerprint ~ '^[A-Za-z0-9_-]{43}$'),
  locale text not null check (locale in ('uk', 'bg', 'ru')),
  good_faith_confirmed_at timestamptz not null,
  state text not null default 'received'
    check (state in ('received', 'kept', 'removed')),
  decision_ground text check (char_length(decision_ground) between 1 and 80),
  decision_facts text check (char_length(decision_facts) between 1 and 2000),
  decided_at timestamptz,
  decided_by_user_id uuid references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_reports_decision_check check (
    (state = 'received' and decided_at is null and decision_ground is null and decision_facts is null)
    or (state = 'kept' and decided_at is not null and decision_facts is not null)
    or (state = 'removed' and decided_at is not null and decision_facts is not null and decision_ground is not null)
  )
);

create index if not exists content_reports_state_created_idx
  on content_reports (state, created_at desc);
create index if not exists content_reports_fingerprint_created_idx
  on content_reports (reporter_fingerprint, created_at desc);
create index if not exists content_reports_target_idx
  on content_reports (target_kind, target_id);
create index if not exists content_reports_reporter_user_idx
  on content_reports (reporter_user_id) where reporter_user_id is not null;
create index if not exists content_reports_target_owner_idx
  on content_reports (target_owner_user_id) where target_owner_user_id is not null;
create index if not exists content_reports_decided_by_idx
  on content_reports (decided_by_user_id) where decided_by_user_id is not null;

comment on table content_reports is
  'DSA Art. 16 notices about public content: target, reason, reporter contact, and the owner decision. Kept one year after the decision.';

create table if not exists moderation_messages (
  id uuid primary key default gen_random_uuid(),
  content_report_id uuid references content_reports(id) on delete cascade,
  comment_report_id uuid,
  kind text not null check (kind in ('report_receipt', 'report_decision', 'statement_of_reasons')),
  recipient_email text not null check (char_length(recipient_email) between 3 and 254),
  recipient_user_id uuid references "user"(id) on delete cascade,
  locale text not null check (locale in ('uk', 'bg', 'ru')),
  subject text not null check (char_length(subject) between 1 and 200),
  body_text text not null check (char_length(body_text) between 1 and 8000),
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  last_error_class text check (char_length(last_error_class) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_messages_one_subject_check check (
    (content_report_id is not null) <> (comment_report_id is not null)
  ),
  constraint moderation_messages_sent_check check (
    (state = 'sent') = (sent_at is not null)
  )
);

create unique index if not exists moderation_messages_content_kind_uidx
  on moderation_messages (content_report_id, kind) where content_report_id is not null;
create unique index if not exists moderation_messages_comment_kind_uidx
  on moderation_messages (comment_report_id, kind) where comment_report_id is not null;
create index if not exists moderation_messages_pending_idx
  on moderation_messages (created_at) where state in ('pending', 'failed');
create index if not exists moderation_messages_recipient_user_idx
  on moderation_messages (recipient_user_id) where recipient_user_id is not null;

comment on table moderation_messages is
  'Outbox of the complaint procedure emails: receipt and decision to the reporter, statement of reasons to the author. Kept one year.';
