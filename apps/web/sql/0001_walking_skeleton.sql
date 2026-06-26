-- Walking-skeleton schema for local/dev verification.
-- SQL migrations are the schema source of truth; Kysely types are generated
-- from a live database with `pnpm db:types`.

create extension if not exists pgcrypto;

create table if not exists health (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  client_mutation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_mutation_id)
);

create index if not exists journal_entries_user_created_idx
  on journal_entries (user_id, created_at desc);

create index if not exists journal_entries_public_created_idx
  on journal_entries (created_at desc)
  where visibility = 'public';

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  quarantine_key text not null unique,
  derivative_key text unique,
  status text not null default 'quarantined' check (status in ('quarantined', 'processed', 'failed')),
  original_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_owner_created_idx
  on media_assets (owner_user_id, created_at desc);

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  idempotency_key text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_queue_idempotency_key_uidx
  on job_queue (idempotency_key)
  where idempotency_key is not null;

create index if not exists job_queue_claim_idx
  on job_queue (queue_name, status, available_at, created_at);
