"""Postgres-backed matching worker skeleton.

The TypeScript app enqueues rows into `job_queue`; this worker claims due rows
with `FOR UPDATE SKIP LOCKED`. It is worker-first and off the request path: no
product feature should synchronously depend on Splink/RapidFuzz work in v0.

OVE-194: unsupported kinds and exhausted retries enter terminal `dead` and are
never reclaimable. Transient failures stay `failed` with bounded backoff.
"""

from __future__ import annotations

import os
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
from app.stable_registry_foundation import (
    STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
    build_foundation_release,
    mark_foundation_release_failed,
)
from app.runtime import (
    WORKER_HEARTBEAT_MAX_AGE_SECONDS,
    RuntimeRelease,
    record_worker_heartbeat,
)

QUEUE_NAME = os.environ.get("QUEUE_NAME", "matching")
WORKER_ID = os.environ.get(
    "WORKER_ID",
    f"matching-worker-{socket.gethostname()}-{os.getpid()}",
)
POLL_INTERVAL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "1.0"))
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
            '{STABLE_REGISTRY_FOUNDATION_BUILD_KIND}'
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
        try:
            while True:
                # OVE-242: the durable public-projection outbox is drained
                # first. A revocation that the request path could not converge
                # must not wait behind ordinary matching work.
                _drain_public_projections(conn)
                job = _claim(conn)
                if job is None:
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue
                _process_claimed_job(conn, job, active_claim)
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=WORKER_HEARTBEAT_INTERVAL_SECONDS + 1)


def _drain_public_projections(conn: psycopg.Connection) -> None:
    """Converge outstanding revocations without ever failing the worker loop."""
    try:
        drain_public_projection_intents(conn, PUBLIC_PROJECTION_DRAIN_BATCH)
    except Exception:
        # The intents stay durable and claimable; the next poll retries them.
        return


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
            if stop.wait(POLL_INTERVAL_SECONDS):
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
