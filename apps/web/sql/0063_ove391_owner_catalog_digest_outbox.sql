-- 0063 (OVE-391, ADR-0026 D10): the email outbox carries the owner's weekly
-- catalog digest.
--
-- `0015` built `auth_email_outbox` for exactly one message: a password reset,
-- keyed by the `verification` row that carries its one-time link
-- (`kind text not null default 'password_reset' check (kind = 'password_reset')`,
-- `verification_id not null unique`). The digest has no verification and no
-- link to expire; it carries counts. The task text anticipated this and asked
-- the executor to reserve a migration number before proceeding, which
-- `docs/MIGRATION_ALLOCATION.md` now records.
--
-- What changes: the kind check admits `owner_catalog_digest`, the
-- verification key becomes optional, a `payload` object holds what a digest
-- needs, and one CHECK per kind keeps each shape honest — a reset still needs
-- its verification and carries no payload; a digest carries a payload and no
-- verification. Every other column, index and lease constraint is untouched,
-- so the drain, its lease and its retry ladder are unchanged.
--
-- Idempotent: constraints are dropped and re-created by name and the column
-- additions are `if not exists`.

alter table auth_email_outbox
  add column if not exists payload jsonb;

alter table auth_email_outbox
  add column if not exists recipient_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'auth_email_outbox_recipient_fkey'
  ) then
    alter table auth_email_outbox
      add constraint auth_email_outbox_recipient_fkey
      foreign key (recipient_user_id) references "user"(id) on delete cascade;
  end if;
end $$;

alter table auth_email_outbox
  alter column verification_id drop not null;

alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_kind_check;

-- `0015` wrote the kind check inline, so it carries Postgres's generated name.
alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_kind_check1;

do $$
declare
  inline_check text;
begin
  select conname into inline_check
  from pg_constraint
  where conrelid = 'auth_email_outbox'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%=%password_reset%';
  if inline_check is not null then
    execute format('alter table auth_email_outbox drop constraint %I', inline_check);
  end if;
end $$;

alter table auth_email_outbox
  add constraint auth_email_outbox_kind_check
  check (kind in ('password_reset', 'owner_catalog_digest'));

alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_kind_shape_check;

alter table auth_email_outbox
  add constraint auth_email_outbox_kind_shape_check check (
    (
      kind = 'password_reset'
      and verification_id is not null
      and payload is null
      and recipient_user_id is null
    )
    or (
      kind = 'owner_catalog_digest'
      and verification_id is null
      and jsonb_typeof(payload) = 'object'
      and recipient_user_id is not null
    )
  );

-- One unsent digest at a time: a second weekly run before the first is
-- delivered refreshes nothing and enqueues nothing.
create unique index if not exists auth_email_outbox_pending_digest_uidx
  on auth_email_outbox (kind, recipient_user_id)
  where kind = 'owner_catalog_digest' and state in ('pending', 'processing', 'failed');
