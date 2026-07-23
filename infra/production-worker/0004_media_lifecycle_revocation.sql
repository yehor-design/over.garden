-- OVE-195 additive media lifecycle revocation columns and retention runs.
-- Safe to re-run. Does not delete media history rows or bucket objects.

alter table media_assets
  add column if not exists revoked_at timestamptz;

alter table media_assets
  add column if not exists public_unreachable_at timestamptz;

create index if not exists media_assets_revoked_idx
  on media_assets (revoked_at)
  where revoked_at is not null;

create index if not exists media_assets_quarantine_expire_idx
  on media_assets (status, created_at)
  where status in ('quarantined', 'failed')
    and original_deleted_at is null;

create table if not exists media_lifecycle_retention_runs (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null,
  mode text not null check (mode in ('dry_run', 'execute')),
  status text not null check (status in ('ok', 'partial', 'failed')),
  failure_class text,
  selection jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists media_lifecycle_retention_runs_started_idx
  on media_lifecycle_retention_runs (started_at desc);
