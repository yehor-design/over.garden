-- OVE-241 — durable, privacy-safe password-reset email outbox.
--
-- Better Auth owns the opaque reset verification. This trigger records only its
-- verification primary key; no email address, reset token, URL, or user ID is
-- duplicated into the outbox. The consumer joins the current canonical rows
-- only after it has acquired a lease.

create table if not exists auth_email_outbox (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references verification(id) on delete cascade,
  kind text not null default 'password_reset' check (kind = 'password_reset'),
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'sent', 'failed', 'dead', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  terminalized_at timestamptz,
  last_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_email_outbox_processing_lease_check check (
    (state = 'processing' and locked_at is not null and locked_by is not null)
    or (state <> 'processing' and locked_at is null and locked_by is null)
  ),
  constraint auth_email_outbox_terminal_state_check check (
    (state in ('sent', 'dead', 'cancelled') and terminalized_at is not null)
    or (state not in ('sent', 'dead', 'cancelled') and terminalized_at is null)
  )
);

create index if not exists auth_email_outbox_claim_idx
  on auth_email_outbox (state, available_at, created_at);

create index if not exists auth_email_outbox_processing_lease_idx
  on auth_email_outbox (locked_at)
  where state = 'processing';

create or replace function enqueue_password_reset_email_outbox()
returns trigger
language plpgsql
as $$
begin
  if new.identifier like 'reset-password:%'
    and new."expiresAt" > now()
    and exists (
      select 1
      from account
      where account."userId"::text = new.value
        and account."providerId" = 'credential'
    ) then
    insert into auth_email_outbox (verification_id)
    values (new.id)
    on conflict (verification_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists verification_password_reset_outbox on verification;

create trigger verification_password_reset_outbox
after insert on verification
for each row
execute function enqueue_password_reset_email_outbox();
