-- OVE-356 — the idle matching worker costs nothing and hides nothing.
--
-- Two defects share one boundary: what the worker costs while it has nothing to
-- do, and what it reveals when its work fails.
--
-- Cost. The worker discovered work by asking, on a one-second sleep loop. At the
-- measured rate of about five jobs a day that is roughly 17,000 polls per unit
-- of work, and about 173,000 idle queries a day. A process that must ask cannot
-- be cheap and cannot scale to zero on any platform that bills for running time.
--
-- Silence. `_drain_public_projections` converged the erasure and revocation
-- outbox inside a bare `except Exception: return`, so a persistently failing
-- drain was indistinguishable from an idle one — and a failed drain is exactly
-- what leaves removed content in the public index.
--
-- ## The wake source
--
-- The saved contract authorized a `LISTEN`/`NOTIFY` wake path but authorized
-- nothing that emits the `NOTIFY`; the repository had no `pg_notify` anywhere.
-- A listener with no notifier never wakes, so the trigger is added here and the
-- correction is recorded on the issue.
--
-- Two things wake the worker, because two things give it work:
--
--   * a newly enqueued job that is already available
--   * a projection intent whose *desired* state changed
--
-- The second matters as much as the first. Without it, a revocation would wait
-- for the fallback poll, and this change would have made erasure convergence
-- slower — weakening the promise it exists to protect.
--
-- The update trigger fires only when `desired_generation` moves. The drain
-- itself writes `applied_state`, `applied_generation`, and `status`; notifying
-- on those would wake the worker for its own writes and never stop.
--
-- The payload is deliberately empty. A wake is advisory — the worker drains and
-- claims on every wake regardless — so the notification never needs to say which
-- row moved, and a payload could only leak the identity of the row that did.

alter table matching_worker_heartbeats
  add column if not exists last_drain_error_class text;

alter table matching_worker_heartbeats
  add column if not exists last_drain_error_at timestamptz;

alter table matching_worker_heartbeats
  drop constraint if exists matching_worker_heartbeats_drain_error_check;

-- A class or nothing, never a class without a time or a time without a class.
-- The pattern is the same bounded lowercase token the queue already uses for
-- `last_error_class`, which keeps a raw exception message out of the column.
alter table matching_worker_heartbeats
  add constraint matching_worker_heartbeats_drain_error_check
  check (
    (last_drain_error_class is null and last_drain_error_at is null)
    or (
      last_drain_error_at is not null
      and last_drain_error_class ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      and char_length(last_drain_error_class) between 1 and 80
    )
  );

create or replace function matching_worker_wake_notify() returns trigger
language plpgsql as $$
begin
  perform pg_notify('matching_worker_wake', '');
  return null;
end;
$$;

drop trigger if exists job_queue_wake_matching_worker on job_queue;
create trigger job_queue_wake_matching_worker
  after insert on job_queue
  for each row
  when (new.status = 'pending' and new.available_at <= now())
  execute function matching_worker_wake_notify();

drop trigger if exists public_projection_intents_wake_matching_worker
  on public_projection_intents;
create trigger public_projection_intents_wake_matching_worker
  after insert on public_projection_intents
  for each row
  execute function matching_worker_wake_notify();

drop trigger if exists public_projection_intents_desired_wake_matching_worker
  on public_projection_intents;
create trigger public_projection_intents_desired_wake_matching_worker
  after update on public_projection_intents
  for each row
  when (new.desired_generation is distinct from old.desired_generation)
  execute function matching_worker_wake_notify();
