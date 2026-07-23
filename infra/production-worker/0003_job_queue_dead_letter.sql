-- OVE-194 additive job_queue dead-letter columns and status.
-- Safe to re-run. Does not delete queue history rows.

alter table job_queue
  add column if not exists terminal_error_code text;

alter table job_queue
  add column if not exists terminalized_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'job_queue_status_check'
      and conrelid = 'public.job_queue'::regclass
  ) then
    alter table job_queue drop constraint job_queue_status_check;
  end if;

  alter table job_queue
    add constraint job_queue_status_check
    check (status in ('pending', 'processing', 'done', 'failed', 'dead'));
exception
  when duplicate_object then
    null;
end $$;

alter table job_queue
  drop constraint if exists job_queue_terminal_error_code_check;

alter table job_queue
  add constraint job_queue_terminal_error_code_check check (
    terminal_error_code is null
    or terminal_error_code in (
      'unsupported_kind',
      'invalid_payload',
      'max_attempts_exceeded'
    )
  );

create index if not exists job_queue_terminal_idx
  on job_queue (queue_name, status, terminal_error_code)
  where status = 'dead';
