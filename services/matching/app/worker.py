"""Queue worker (SKELETON — no matching logic yet).

CONSUMER side of the cross-runtime queue: the TS app enqueues via `pgmq.send`
(see apps/web/src/server/queue.ts); this worker consumes the SAME pgmq queue via
plain SQL — no Python-only framework (TECH_STACK §2.9 forbids Procrastinate).

It connects to Postgres (Supabase) DIRECTLY (psycopg v3), NOT via the Supabase
client. Use the DIRECT / session connection for a long-lived worker, not the
transaction-mode pooler.

This is a skeleton: it reads a message, does nothing, and archives it. The
matching work (RapidFuzz / Splink / PyICU / CyrTranslit + Meilisearch sync) lands
in the matching phase.
"""

from __future__ import annotations

import os
import time

import psycopg

QUEUE_NAME = os.environ.get("QUEUE_NAME", "jobs")
POLL_INTERVAL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "1.0"))
VISIBILITY_TIMEOUT_SECONDS = int(os.environ.get("WORKER_VT_SECONDS", "30"))


def _handle(message: object) -> None:
    """Process one job. TODO: real matching pipeline. No logic yet."""
    _ = message  # placeholder — intentionally does nothing in the scaffold


def run() -> None:
    # DIRECT/session connection (port 5432), NOT the transaction pooler — a
    # long-lived worker needs a real session. Named distinctly from the web
    # app's pooler `DATABASE_URL` to avoid a copy/paste footgun.
    dsn = os.environ["DIRECT_URL"]
    with psycopg.connect(dsn, autocommit=True) as conn:
        while True:
            with conn.cursor() as cur:
                # pgmq.read(queue, visibility_timeout, qty) -> rows
                cur.execute(
                    "select msg_id, message from pgmq.read(%s, %s, %s)",
                    (QUEUE_NAME, VISIBILITY_TIMEOUT_SECONDS, 1),
                )
                row = cur.fetchone()
                if row is None:
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue
                msg_id, message = row
                _handle(message)
                # Archive (audit trail) — use pgmq.delete to drop permanently.
                cur.execute("select pgmq.archive(%s, %s)", (QUEUE_NAME, msg_id))


if __name__ == "__main__":
    run()
