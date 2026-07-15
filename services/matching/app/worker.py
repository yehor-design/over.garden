"""Postgres-backed matching worker skeleton.

The TypeScript app enqueues rows into `job_queue`; this worker claims due rows
with `FOR UPDATE SKIP LOCKED`. It is worker-first and off the request path: no
product feature should synchronously depend on Splink/RapidFuzz work in v0.
"""

from __future__ import annotations

import os
import socket
import time
import traceback
from typing import Any
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from app.catalog_matching import (
    CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
    refresh_catalog_match_suggestions,
)
from app.search import (
    CATALOG_TYPEAHEAD_REINDEX_KIND,
    JOURNAL_ENTRY_INDEX_KIND,
    JOURNAL_ENTRY_UNINDEX_KIND,
    index_journal_entry,
    reindex_catalog_typeahead,
    unindex_journal_entry_for_owner,
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

CLAIM_JOB_SQL = f"""
select id, payload
from job_queue
where queue_name = %s
  and (
    (status in ('pending', 'failed') and available_at <= now())
    or (
      status = 'processing'
      and locked_at <= now() - (
        case
          when payload->>'kind' = '{CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND}' then %s
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
"""

MARK_DONE_SQL = """
update job_queue
set status = case when rerun_requested then 'pending' else 'done' end,
    available_at = case when rerun_requested then now() else available_at end,
    locked_at = null,
    locked_by = null,
    rerun_requested = false,
    last_error = null,
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
    updated_at = now()
where id = %s
  and status = 'processing'
  and locked_by = %s
"""


def _handle(conn: psycopg.Connection, payload: Any) -> None:
    """Process one job without making request paths depend on worker success."""
    if not isinstance(payload, dict):
        raise ValueError("unsupported job payload")

    kind = payload.get("kind")
    if kind == CATALOG_TYPEAHEAD_REINDEX_KIND:
        reindex_catalog_typeahead(conn)
        return

    if kind == CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND:
        _require_exact_payload_shape(
            payload,
            CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
            {"kind", "sourceCatalogItemId"},
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

    if kind == JOURNAL_ENTRY_INDEX_KIND:
        index_journal_entry(
            conn,
            _payload_text(payload, "journalEntryId", JOURNAL_ENTRY_INDEX_KIND),
            _payload_text(payload, "userId", JOURNAL_ENTRY_INDEX_KIND),
        )
        return

    if kind == JOURNAL_ENTRY_UNINDEX_KIND:
        unindex_journal_entry_for_owner(
            conn,
            _payload_text(payload, "journalEntryId", JOURNAL_ENTRY_UNINDEX_KIND),
            _payload_text(payload, "userId", JOURNAL_ENTRY_UNINDEX_KIND),
        )
        return

    raise ValueError("unsupported job kind")


def _payload_text(payload: dict[str, Any], key: str, job_kind: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required for {job_kind}")
    return value.strip()


def _payload_uuid_text(payload: dict[str, Any], key: str, job_kind: str) -> str:
    value = _payload_text(payload, key, job_kind)
    try:
        return str(UUID(value))
    except ValueError as error:
        raise ValueError(f"{key} must be a valid UUID for {job_kind}") from error


def _require_exact_payload_shape(
    payload: dict[str, Any],
    job_kind: str,
    expected_keys: set[str],
) -> None:
    if set(payload) != expected_keys:
        raise ValueError(f"unsupported payload shape for {job_kind}")


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
        conn.execute(CLAIM_JOB_UPDATE_SQL, (claim_token, row["id"]))
        return {**row, "claimToken": claim_token}


def _mark_done(conn: psycopg.Connection, job_id: str, claim_token: str) -> None:
    with conn.transaction():
        conn.execute(MARK_DONE_SQL, (job_id, claim_token))


def _mark_failed(
    conn: psycopg.Connection,
    job_id: str,
    claim_token: str,
    error: str,
) -> None:
    with conn.transaction():
        conn.execute(
            MARK_FAILED_SQL,
            (
                VISIBILITY_TIMEOUT_SECONDS,
                error[:4000],
                job_id,
                claim_token,
            ),
        )


def run() -> None:
    dsn = os.environ["DIRECT_URL"]
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        while True:
            job = _claim(conn)
            if job is None:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            try:
                _handle(conn, job["payload"])
            except Exception:
                _mark_failed(
                    conn,
                    job["id"],
                    job["claimToken"],
                    traceback.format_exc(),
                )
            else:
                _mark_done(conn, job["id"], job["claimToken"])


if __name__ == "__main__":
    run()
