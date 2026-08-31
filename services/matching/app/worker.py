"""Postgres-backed matching worker skeleton.

The TypeScript app enqueues rows into `job_queue`; this worker claims due rows
with `FOR UPDATE SKIP LOCKED`. It is worker-first and off the request path: no
product feature should synchronously depend on RapidFuzz work in v0.

OVE-194: unsupported kinds and exhausted retries enter terminal `dead` and are
never reclaimable. Transient failures stay `failed` with bounded backoff.
"""

from __future__ import annotations

import os
import re
import socket
import threading
import time
from typing import Any
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from app.catalog_aliases import (
    CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
    refresh_catalog_alias_suggestions,
)
from app.catalog_matching import (
    CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
    refresh_catalog_match_suggestions,
)
from app.catalog_fuzzy_duplicates import (
    CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
    refresh_catalog_fuzzy_duplicate_suggestions,
)
from app.job_handlers import SUPPORTED_JOB_KINDS
from app.public_projection import drain_public_projection_intents
from app.job_queue_manifest import max_attempts_for_kind, payload_contract_for_kind
from app.search import (
    CATALOG_TYPEAHEAD_REINDEX_KIND,
    JOURNAL_ENTRY_INDEX_KIND,
    JOURNAL_ENTRY_UNINDEX_KIND,
    index_journal_entry,
    reindex_catalog_typeahead,
    unindex_journal_entry_for_owner,
)
from app.stable_registry_edition import (
    STABLE_REGISTRY_EDITION_BUILD_KIND,
    build_edition_release,
)
from app.stable_registry_extension_pack import (
    STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
    review_extension_pack,
)
from app.stable_registry_foundation import (
    STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
    build_foundation_release,
    mark_foundation_release_failed,
)
from app.runtime import (
    WORKER_HEARTBEAT_MAX_AGE_SECONDS,
    RuntimeRelease,
    record_drain_outcome,
    record_worker_heartbeat,
)

# `LISTEN` takes no parameters, so the channel is validated as an identifier
# rather than interpolated blindly.
_NOTIFY_CHANNEL_PATTERN = re.compile(r"[a-z_][a-z0-9_]{0,62}")

QUEUE_NAME = os.environ.get("QUEUE_NAME", "matching")
WORKER_ID = os.environ.get(
    "WORKER_ID",
    f"matching-worker-{socket.gethostname()}-{os.getpid()}",
)
# The worker is told about work now, so this bounds the *fallback* rather than
# the primary loop. At the measured rate of about five jobs a day the old
# one-second loop ran roughly 17,000 polls per unit of work; a notification and
# a 30-second backstop cover the same ground for about one query per 30 seconds
# while a lost notification still cannot delay a job by more than this bound.
POLL_INTERVAL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "30.0"))
# The heartbeat's reconnect backoff is deliberately not the fallback interval.
# Stretching this to the fallback would make readiness slower to recover from a
# dropped connection, which is the opposite of what this change is for.
HEARTBEAT_RECONNECT_BACKOFF_SECONDS = 1.0
WORKER_NOTIFY_CHANNEL = os.environ.get(
    "WORKER_NOTIFY_CHANNEL", "matching_worker_wake"
)
VISIBILITY_TIMEOUT_SECONDS = int(os.environ.get("WORKER_VT_SECONDS", "30"))
CATALOG_MATCH_VISIBILITY_TIMEOUT_SECONDS = int(
    os.environ.get("CATALOG_MATCH_WORKER_VT_SECONDS", "300")
)
MAX_BACKOFF_SECONDS = int(os.environ.get("WORKER_MAX_BACKOFF_SECONDS", "3600"))
PUBLIC_PROJECTION_DRAIN_BATCH = int(
    os.environ.get("PUBLIC_PROJECTION_DRAIN_BATCH", "25")
)
WORKER_HEARTBEAT_INTERVAL_SECONDS = 10.0
if WORKER_HEARTBEAT_INTERVAL_SECONDS * 3 > min(
    VISIBILITY_TIMEOUT_SECONDS,
    WORKER_HEARTBEAT_MAX_AGE_SECONDS,
):
    raise RuntimeError("worker heartbeat interval needs a three-times lease margin")


class TerminalJobError(ValueError):
    """Permanently invalid work that must enter `dead` without retry."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class _ActiveClaimLease:
    """Thread-safe identity of the one job currently owned by this worker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._claim: tuple[str, str] | None = None

    def set(self, job_id: str, claim_token: str) -> None:
        with self._lock:
            self._claim = (job_id, claim_token)

    def clear(self) -> None:
        with self._lock:
            self._claim = None

    def snapshot(self) -> tuple[str, str] | None:
        with self._lock:
            return self._claim


CLAIM_JOB_SQL = f"""
select id, payload, attempts
from job_queue
where queue_name = %s
  and (
    (status in ('pending', 'failed') and available_at <= now())
    or (
      status = 'processing'
      and locked_at <= now() - (
        case
          when payload->>'kind' in (
            '{CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND}',
            '{CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND}',
            '{CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND}',
            '{STABLE_REGISTRY_FOUNDATION_BUILD_KIND}',
            '{STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND}',
            '{STABLE_REGISTRY_EDITION_BUILD_KIND}'
          ) then %s
          else %s
        end || ' seconds'
      )::interval
    )
  )
order by created_at asc
for update skip locked
limit 1
"""

CLAIM_JOB_UPDATE_SQL = """
update job_queue
set status = 'processing',
    locked_at = now(),
    locked_by = %s,
    rerun_requested = false,
    attempts = attempts + 1,
    updated_at = now()
where id = %s
returning attempts
"""

RENEW_CLAIM_LEASE_SQL = """
update job_queue
set locked_at = now()
where id = %s
  and status = 'processing'
  and locked_by = %s
"""

MARK_DONE_SQL = """
update job_queue
set status = case when rerun_requested then 'pending' else 'done' end,
    available_at = case when rerun_requested then now() else available_at end,
    locked_at = null,
    locked_by = null,
    rerun_requested = false,
    last_error = null,
    terminal_error_code = null,
    terminalized_at = null,
    updated_at = now()
where id = %s
  and status = 'processing'
  and locked_by = %s
"""

MARK_FAILED_SQL = """
update job_queue
set status = case when rerun_requested then 'pending' else 'failed' end,
    available_at = case
      when rerun_requested then now()
      else now() + (%s || ' seconds')::interval
    end,
    locked_at = null,
    locked_by = null,
    rerun_requested = false,
    last_error = %s,
    terminal_error_code = null,
    terminalized_at = null,
    updated_at = now()
where id = %s
  and status = 'processing'
  and locked_by = %s
"""

MARK_DEAD_SQL = """
update job_queue
set status = 'dead',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    rerun_requested = false,
    last_error = %s,
    terminal_error_code = %s,
    terminalized_at = now(),
    updated_at = now()
where id = %s
  and status = 'processing'
  and locked_by = %s
"""


def _handle(conn: psycopg.Connection, payload: Any) -> None:
    """Process one job without making request paths depend on worker success."""
    if not isinstance(payload, dict):
        raise TerminalJobError("invalid_payload", "unsupported job payload")

    kind = payload.get("kind")
    if kind not in SUPPORTED_JOB_KINDS:
        raise TerminalJobError("unsupported_kind", "unsupported job kind")

    if kind == CATALOG_TYPEAHEAD_REINDEX_KIND:
        _require_exact_payload_shape(payload, CATALOG_TYPEAHEAD_REINDEX_KIND)
        reindex_catalog_typeahead(conn)
        return

    if kind == STABLE_REGISTRY_FOUNDATION_BUILD_KIND:
        _require_exact_payload_shape(payload, STABLE_REGISTRY_FOUNDATION_BUILD_KIND)
        build_foundation_release(
            conn,
            _payload_uuid_text(
                payload,
                "releaseId",
                STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
            ),
        )
        return

    if kind == STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND:
        _require_exact_payload_shape(
            payload,
            STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
        )
        review_extension_pack(
            conn,
            _payload_uuid_text(
                payload,
                "packId",
                STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
            ),
        )
        return

    if kind == STABLE_REGISTRY_EDITION_BUILD_KIND:
        _require_exact_payload_shape(payload, STABLE_REGISTRY_EDITION_BUILD_KIND)
        build_edition_release(
            conn,
            _payload_uuid_text(
                payload,
                "releaseId",
                STABLE_REGISTRY_EDITION_BUILD_KIND,
            ),
        )
        return

    if kind == CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND:
        _require_exact_payload_shape(
            payload,
            CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
        )
        refresh_catalog_match_suggestions(
            conn,
            _payload_uuid_text(
                payload,
                "sourceCatalogItemId",
                CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
            ),
        )
        return

    if kind == CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND:
        _require_exact_payload_shape(
            payload,
            CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
        )
        refresh_catalog_alias_suggestions(
            conn,
            _payload_uuid_text(
                payload,
                "catalogItemId",
                CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
            ),
        )
        return

    if kind == CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND:
        _require_exact_payload_shape(
            payload,
            CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
        )
        refresh_catalog_fuzzy_duplicate_suggestions(conn)
        return

    if kind == JOURNAL_ENTRY_INDEX_KIND:
        _require_exact_payload_shape(payload, JOURNAL_ENTRY_INDEX_KIND)
        index_journal_entry(
            conn,
            _payload_uuid_text(
                payload,
                "journalEntryId",
                JOURNAL_ENTRY_INDEX_KIND,
            ),
            _payload_uuid_text(payload, "userId", JOURNAL_ENTRY_INDEX_KIND),
        )
        return

    if kind == JOURNAL_ENTRY_UNINDEX_KIND:
        _require_exact_payload_shape(payload, JOURNAL_ENTRY_UNINDEX_KIND)
        unindex_journal_entry_for_owner(
            conn,
            _payload_uuid_text(
                payload,
                "journalEntryId",
                JOURNAL_ENTRY_UNINDEX_KIND,
            ),
            _payload_uuid_text(payload, "userId", JOURNAL_ENTRY_UNINDEX_KIND),
        )
        return

    raise TerminalJobError("unsupported_kind", "unsupported job kind")


def _payload_text(payload: dict[str, Any], key: str, job_kind: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise TerminalJobError(
            "invalid_payload",
            f"{key} is required for {job_kind}",
        )
    return value.strip()


def _payload_uuid_text(payload: dict[str, Any], key: str, job_kind: str) -> str:
    value = _payload_text(payload, key, job_kind)
    try:
        return str(UUID(value))
    except ValueError as error:
        raise TerminalJobError(
            "invalid_payload",
            f"{key} must be a valid UUID for {job_kind}",
        ) from error


def _require_exact_payload_shape(payload: dict[str, Any], job_kind: str) -> None:
    """Refuse any key outside the manifest contract for this kind.

    OVE-225: the expected key set is read from the shared manifest rather than
    restated at each call site, so the TypeScript producer, the Postgres CHECK
    constraints, and this consumer cannot drift apart.
    """
    contract = payload_contract_for_kind(job_kind)
    if contract is None:
        raise TerminalJobError("unsupported_kind", "unsupported job kind")

    required = set(contract["requiredKeys"])
    allowed = required | set(contract["optionalKeys"])
    present = set(payload)

    if not required <= present or not present <= allowed:
        raise TerminalJobError(
            "invalid_payload",
            f"unsupported payload shape for {job_kind}",
        )


def _claim(conn: psycopg.Connection) -> dict[str, Any] | None:
    with conn.transaction():
        row = conn.execute(
            CLAIM_JOB_SQL,
            (
                QUEUE_NAME,
                CATALOG_MATCH_VISIBILITY_TIMEOUT_SECONDS,
                VISIBILITY_TIMEOUT_SECONDS,
            ),
        ).fetchone()

        if row is None:
            return None

        claim_token = f"{WORKER_ID}:{uuid4()}"
        updated = conn.execute(
            CLAIM_JOB_UPDATE_SQL,
            (claim_token, row["id"]),
        ).fetchone()
        attempts = int(updated["attempts"]) if updated else int(row["attempts"]) + 1
        return {**row, "attempts": attempts, "claimToken": claim_token}


def _mark_done(conn: psycopg.Connection, job_id: str, claim_token: str) -> None:
    with conn.transaction():
        conn.execute(MARK_DONE_SQL, (job_id, claim_token))


def _mark_failed(
    conn: psycopg.Connection,
    job_id: str,
    claim_token: str,
    error_code: str,
    attempts: int,
) -> None:
    backoff_seconds = _backoff_seconds(attempts)
    with conn.transaction():
        conn.execute(
            MARK_FAILED_SQL,
            (
                backoff_seconds,
                error_code[:200],
                job_id,
                claim_token,
            ),
        )


def _mark_dead(
    conn: psycopg.Connection,
    job_id: str,
    claim_token: str,
    terminal_error_code: str,
) -> None:
    with conn.transaction():
        conn.execute(
            MARK_DEAD_SQL,
            (
                terminal_error_code[:200],
                terminal_error_code,
                job_id,
                claim_token,
            ),
        )


def _backoff_seconds(attempts: int) -> int:
    exponent = max(0, min(attempts - 1, 6))
    return min(VISIBILITY_TIMEOUT_SECONDS * (2**exponent), MAX_BACKOFF_SECONDS)


def run() -> None:
    dsn = os.environ["DIRECT_URL"]
    release = RuntimeRelease.from_environment()
    heartbeat_stop = threading.Event()
    active_claim = _ActiveClaimLease()
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(dsn, release, heartbeat_stop, active_claim),
        name="matching-worker-heartbeat",
        daemon=True,
    )
    with psycopg.connect(
        dsn,
        autocommit=True,
        row_factory=dict_row,
        connect_timeout=5,
    ) as conn:
        heartbeat_thread.start()
        _listen_for_wake(conn)
        try:
            while True:
                # OVE-242: the durable public-projection outbox is drained
                # first. A revocation that the request path could not converge
                # must not wait behind ordinary matching work.
                _drain_public_projections(conn, release)
                job = _claim(conn)
                if job is None:
                    # Block on the notification instead of sleeping through it.
                    # A wake is advisory: whatever arrives, the next iteration
                    # drains and claims, so a spurious or duplicate wake costs
                    # one claim attempt and nothing else.
                    _wait_for_wake(conn, POLL_INTERVAL_SECONDS)
                    continue
                _process_claimed_job(conn, job, active_claim)
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=WORKER_HEARTBEAT_INTERVAL_SECONDS + 1)


def _listen_for_wake(conn: psycopg.Connection) -> None:
    """Register interest in the wake channel.

    Registered once per connection, before the loop starts. `LISTEN` cannot be
    parameterised, so the channel is validated as an identifier rather than
    interpolated blindly.
    """
    if not _NOTIFY_CHANNEL_PATTERN.fullmatch(WORKER_NOTIFY_CHANNEL):
        raise RuntimeError("worker notify channel must be a plain identifier")
    conn.execute(f"listen {WORKER_NOTIFY_CHANNEL}")


def _wait_for_wake(conn: psycopg.Connection, timeout: float) -> bool:
    """Sleep until something gives the worker work, or until the bound expires.

    Returns whether a notification arrived. Either way the caller drains and
    claims, so a lost notification costs at most `timeout` and never a job: the
    expiry is the fallback poll the contract requires, not a failure.
    """
    try:
        for _ in conn.notifies(timeout=timeout, stop_after=1):
            return True
    except Exception:
        # A listener that cannot wait is not a reason to spin. Fall back to the
        # same bound the notification would have honoured, and let the next
        # iteration re-establish the connection through its own error path.
        time.sleep(timeout)
    return False


def _drain_public_projections(
    conn: psycopg.Connection,
    release: RuntimeRelease,
) -> None:
    """Converge outstanding revocations without ever failing the worker loop.

    The loop still never fails on a drain error — a worker that dies here would
    stop converging everything else too. What changed is that the failure is now
    written down. A drain that fails on every attempt used to be indistinguishable
    from an idle one, and a failed drain is exactly what leaves removed content
    in the public index.
    """
    try:
        drain_public_projection_intents(conn, PUBLIC_PROJECTION_DRAIN_BATCH)
    except Exception as error:
        # The intents stay durable and claimable; the next wake retries them.
        # Only the class is recorded: an exception message can carry a slug, a
        # media URL, or an owner identifier, and none of those belong here.
        record_drain_outcome(conn, release, _drain_error_class(error))
        return
    record_drain_outcome(conn, release, None)


def _drain_error_class(error: BaseException) -> str:
    """Reduce an exception to a bounded lowercase token.

    The database refuses anything else, which is the point: the column cannot
    become a place where a raw operational error is stored.
    """
    name = type(error).__name__
    # Split on case boundaries, but keep acronyms whole: a naive split turns
    # `OSError` into `o_s_error`, which is a class nobody would recognise.
    token = re.sub(
        r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "_", name
    ).lower()
    token = re.sub(r"[^a-z0-9]+", "_", token).strip("_")
    return (token or "unknown_error")[:80]


def _process_claimed_job(
    conn: psycopg.Connection,
    job: dict[str, Any],
    active_claim: _ActiveClaimLease,
) -> None:
    active_claim.set(job["id"], job["claimToken"])
    try:
        payload = job["payload"]
        kind = payload.get("kind") if isinstance(payload, dict) else None
        attempts = int(job["attempts"])

        if not isinstance(payload, dict):
            _mark_dead(conn, job["id"], job["claimToken"], "invalid_payload")
            return
        if kind not in SUPPORTED_JOB_KINDS:
            _mark_dead(conn, job["id"], job["claimToken"], "unsupported_kind")
            return

        try:
            _handle(conn, payload)
        except TerminalJobError as error:
            _mark_dead(conn, job["id"], job["claimToken"], error.code)
            _mark_foundation_release_failed(conn, payload)
        except Exception:
            max_attempts = max_attempts_for_kind(str(kind))
            if attempts >= max_attempts:
                _mark_dead(
                    conn,
                    job["id"],
                    job["claimToken"],
                    "max_attempts_exceeded",
                )
                _mark_foundation_release_failed(conn, payload)
            else:
                _mark_failed(
                    conn,
                    job["id"],
                    job["claimToken"],
                    "transient_handler_error",
                    attempts,
                )
        else:
            _mark_done(conn, job["id"], job["claimToken"])
    finally:
        active_claim.clear()


def _mark_foundation_release_failed(
    conn: psycopg.Connection, payload: dict[str, Any]
) -> None:
    """Synchronize only a terminal Foundation job failure to its safe state."""
    if payload.get("kind") != STABLE_REGISTRY_FOUNDATION_BUILD_KIND:
        return
    try:
        release_id = _payload_uuid_text(
            payload,
            "releaseId",
            STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
        )
    except TerminalJobError:
        return
    with conn.transaction():
        mark_foundation_release_failed(conn, release_id)


def _heartbeat_loop(
    dsn: str,
    release: RuntimeRelease,
    stop: threading.Event,
    active_claim: _ActiveClaimLease,
) -> None:
    """Keep readiness fresh while a handler is blocked on bounded I/O."""
    while not stop.is_set():
        try:
            with psycopg.connect(
                dsn,
                autocommit=True,
                row_factory=dict_row,
                connect_timeout=5,
            ) as conn:
                while not stop.is_set():
                    record_worker_heartbeat(conn, release)
                    _renew_active_claim(conn, active_claim)
                    if stop.wait(WORKER_HEARTBEAT_INTERVAL_SECONDS):
                        return
        except Exception:
            if stop.wait(HEARTBEAT_RECONNECT_BACKOFF_SECONDS):
                return


def _renew_active_claim(
    conn: psycopg.Connection,
    active_claim: _ActiveClaimLease,
) -> None:
    claim = active_claim.snapshot()
    if claim is not None:
        conn.execute(RENEW_CLAIM_LEASE_SQL, claim)


if __name__ == "__main__":
    run()
