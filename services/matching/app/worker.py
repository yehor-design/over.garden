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

import psycopg
from psycopg.rows import dict_row

from app.search import (
    CATALOG_TYPEAHEAD_REINDEX_KIND,
    JOURNAL_ENTRY_INDEX_KIND,
    JOURNAL_ENTRY_UNINDEX_KIND,
    index_public_journal_entry,
    reindex_catalog_typeahead,
    unindex_public_journal_entry,
)

QUEUE_NAME = os.environ.get("QUEUE_NAME", "matching")
WORKER_ID = os.environ.get("WORKER_ID", f"matching-worker-{socket.gethostname()}")
POLL_INTERVAL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "1.0"))
VISIBILITY_TIMEOUT_SECONDS = int(os.environ.get("WORKER_VT_SECONDS", "30"))


def _handle(conn: psycopg.Connection, payload: Any) -> None:
    """Process one job without making request paths depend on worker success."""
    if not isinstance(payload, dict):
        raise ValueError("Unsupported job payload.")

    kind = payload.get("kind")
    if kind == CATALOG_TYPEAHEAD_REINDEX_KIND:
        reindex_catalog_typeahead(conn)
        return
    if kind == JOURNAL_ENTRY_INDEX_KIND:
        index_public_journal_entry(conn, _required_payload_text(payload, "journalEntryId"))
        return
    if kind == JOURNAL_ENTRY_UNINDEX_KIND:
        unindex_public_journal_entry(_required_payload_text(payload, "journalEntryId"))
        return

    raise ValueError(f"Unsupported job kind: {kind}")


def _required_payload_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing required job payload field: {key}")
    return value.strip()


def _claim(conn: psycopg.Connection) -> dict[str, Any] | None:
    with conn.transaction():
        row = conn.execute(
            """
            select id, payload
            from job_queue
            where queue_name = %s
              and status in ('pending', 'failed')
              and available_at <= now()
            order by created_at asc
            for update skip locked
            limit 1
            """,
            (QUEUE_NAME,),
        ).fetchone()

        if row is None:
            return None

        conn.execute(
            """
            update job_queue
            set status = 'processing',
                locked_at = now(),
                locked_by = %s,
                attempts = attempts + 1,
                updated_at = now()
            where id = %s
            """,
            (WORKER_ID, row["id"]),
        )
        return row


def _mark_done(conn: psycopg.Connection, job_id: str) -> None:
    with conn.transaction():
        conn.execute(
            """
            update job_queue
            set status = 'done',
                locked_at = null,
                locked_by = null,
                updated_at = now()
            where id = %s
            """,
            (job_id,),
        )


def _mark_failed(conn: psycopg.Connection, job_id: str, error: str) -> None:
    with conn.transaction():
        conn.execute(
            """
            update job_queue
            set status = 'failed',
                locked_at = null,
                locked_by = null,
                last_error = %s,
                available_at = now() + (%s || ' seconds')::interval,
                updated_at = now()
            where id = %s
            """,
            (error[:4000], VISIBILITY_TIMEOUT_SECONDS, job_id),
        )


def run() -> None:
    dsn = os.environ["DIRECT_URL"]
    with psycopg.connect(dsn, autocommit=False, row_factory=dict_row) as conn:
        while True:
            job = _claim(conn)
            if job is None:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            try:
                _handle(conn, job["payload"])
            except Exception:
                _mark_failed(conn, job["id"], traceback.format_exc())
            else:
                _mark_done(conn, job["id"])


if __name__ == "__main__":
    run()
