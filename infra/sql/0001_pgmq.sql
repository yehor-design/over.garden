-- Cross-runtime job queue (pgmq) — TECH_STACK §2.9.
--
-- pgmq is a Postgres extension, so the enqueue contract is plain SQL: the TS app
-- enqueues (apps/web/src/server/queue.ts -> pgmq.send) and the Python worker
-- consumes (services/matching/app/worker.py -> pgmq.read/archive). No Redis, no
-- Python-only framework (Procrastinate is excluded).
--
-- This is NOT a Drizzle migration (pgmq is an extension, not app schema). Apply
-- it separately:
--   * On Supabase: prefer Dashboard -> Integrations -> Queues (it enables the
--     extension with the right privileges), OR run this as a privileged migration.
--   * Locally: run against your Postgres as a superuser-capable role.

create extension if not exists pgmq;

-- Idempotent queue creation. Creates pgmq.q_jobs (active) + pgmq.a_jobs (archive).
select pgmq.create('jobs');
