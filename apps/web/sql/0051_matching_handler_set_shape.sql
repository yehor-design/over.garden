-- The heartbeat records what the worker is, so it must not be constrained to
-- what the worker is supposed to be.
--
-- `matching_worker_heartbeats_supported_handlers_check` pinned
-- `supported_handlers` to an exact array — six kinds when it was written in
-- `0001`, nine after `0050`. That is the wrong shape of control, for a reason
-- that only shows up when it fires:
--
--   * `_worker_status` in `services/matching/app/runtime.py` already compares
--     the recorded set with the manifest and answers `capability_mismatch`.
--     The constraint made that answer unreachable — a worker whose set differs
--     cannot write the row the classification would have read, so the mismatch
--     surfaced as a heartbeat that stopped, which reads as a dead worker.
--   * Since OVE-357 that row is the only liveness signal there is, so the
--     failure mode was: correct deployment, healthy worker, "worker missing".
--   * It coupled the image and the schema in both directions. Deploying a new
--     image required this migration first; rolling the image back required
--     rolling the constraint back. A liveness row is the last place that
--     coupling belongs.
--
-- What replaces it is a shape check: the column must hold at least one
-- lowercase snake_case handler name and no more than sixty-four, which is what
-- keeps the column honest. Identity is enforced where it can be reported and
-- acted on — the worker's own readiness, the web classification, and the
-- release script, which holds a running container to the exact set its sealed
-- artifact carries.
--
-- The pattern is applied to the array's own text form, not to a joined string.
-- Joining with `array_to_string` was tried first and executed against Postgres
-- 18.4 before it was believed: it accepted the single element
-- 'journal_entry_index,journal_entry_unindex', because after joining, one
-- element containing a separator is indistinguishable from two elements. The
-- array output form has no such hole — Postgres quotes any element containing a
-- comma, a space, a quote, or nothing at all, and a quote is a character this
-- pattern does not admit. A NULL element renders as an unquoted NULL and fails
-- for the same reason.
--
-- Duplicates and an unsorted order are deliberately allowed: they are wrong but
-- observable, and the point of this migration is that a wrong handler set must
-- be recordable so that `capability_mismatch` can be reported instead of
-- silence.
--
-- Constraint replacement only: no table, column, index, or row is touched.

alter table matching_worker_heartbeats
  drop constraint if exists matching_worker_heartbeats_supported_handlers_check;

alter table matching_worker_heartbeats
  add constraint matching_worker_heartbeats_supported_handlers_check
  check (
    supported_handlers is not null
    and cardinality(supported_handlers) between 1 and 64
    and supported_handlers::text ~ '^\{[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*\}$'
  );
