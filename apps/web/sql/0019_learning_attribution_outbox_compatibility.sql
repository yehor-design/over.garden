-- A restored pre-OVE-219 database can retain this table without the current
-- generation defaults. Reconcile the non-destructive shape before code
-- generation; fresh databases already have these defaults and are unchanged.
alter table if exists learning_attribution_outbox
  add column if not exists desired_generation integer not null default 1,
  add column if not exists applied_generation integer not null default 0,
  alter column desired_generation set default 1,
  alter column applied_generation set default 0;
