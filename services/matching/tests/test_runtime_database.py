"""The worker's SQL, executed against a real database.

Every other test in this directory mocks the connection. That is why the first
deploy of ``record_drain_outcome`` to production died on its first successful
drain: psycopg binds parameters server-side, a bare NULL inside
``case when $2 is null`` has no type for Postgres to infer, the statement was
refused, and the worker restarted until the release script restored the prior
image. A mocked connection returns whatever the test tells it to.

These tests build a disposable database the way the web bootstrap does in CI —
the four Better Auth tables the migrations reference, then every versioned
migration in ``apps/web/sql`` in order — and run the worker's own functions
against it. They skip without ``OVERGARDEN_TEST_DATABASE_URL``; CI provides a
loopback Postgres.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg.rows import dict_row

from app import runtime, worker
from app.job_handlers import SUPPORTED_JOB_KINDS

DATABASE_URL = os.environ.get("OVERGARDEN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="OVERGARDEN_TEST_DATABASE_URL names no disposable Postgres",
)

SQL_DIRECTORY = Path(__file__).resolve().parents[3] / "apps" / "web" / "sql"
COMMIT_SHA = "a" * 40
IMAGE_DIGEST = f"sha256:{'b' * 64}"
BUILD_TIMESTAMP = "2026-09-05T09:05:39Z"

# Better Auth owns these four tables and creates them outside apps/web/sql.
# Seven migrations add foreign keys to "user"(id) without a guard and one
# alters "verification", so the versioned SQL only applies on top of them.
# These are the tables as the bootstrap creates them, read back from a
# bootstrapped database: uuid ids, camel-case columns.
BETTER_AUTH_SCHEMA = """
create table "user" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null,
  image text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create table "session" (
  id uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references "user"(id) on delete cascade
);

create table "account" (
  id uuid primary key default gen_random_uuid(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null
);

create table "verification" (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);
"""


def release() -> runtime.RuntimeRelease:
    return runtime.RuntimeRelease(
        commit_sha=COMMIT_SHA,
        image_digest=IMAGE_DIGEST,
        build_timestamp=BUILD_TIMESTAMP,
        schema_compatibility_class=runtime.SCHEMA_COMPATIBILITY_CLASS,
        queue_name=runtime.DEFAULT_QUEUE_NAME,
    )


def versioned_migrations() -> list[Path]:
    files = sorted(SQL_DIRECTORY.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    assert files and files[0].name == "0001_walking_skeleton.sql"
    return files


def database_url(name: str) -> str:
    assert DATABASE_URL
    parts = urlsplit(DATABASE_URL)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def database(monkeypatch: pytest.MonkeyPatch):
    name = f"overgarden_matching_{uuid.uuid4().hex}"
    admin_url = database_url("postgres")
    url = database_url(name)
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(f'create database "{name}"')
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute(BETTER_AUTH_SCHEMA)
            for migration in versioned_migrations():
                conn.execute(migration.read_text(encoding="utf-8"))
        monkeypatch.setenv("DIRECT_URL", url)
        monkeypatch.delenv("MEILISEARCH_HOST", raising=False)
        yield url
    finally:
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(f'drop database "{name}" with (force)')


def heartbeat_row(conn: psycopg.Connection) -> dict[str, object]:
    row = conn.execute(
        """
        select supported_handlers, last_drain_error_class, last_drain_error_at
        from matching_worker_heartbeats
        where queue_name = %s
        """,
        (runtime.DEFAULT_QUEUE_NAME,),
    ).fetchone()
    assert row is not None
    return row


def test_drain_outcome_executes_with_and_without_an_error_class(
    database: str,
) -> None:
    with psycopg.connect(database, autocommit=True, row_factory=dict_row) as conn:
        runtime.record_worker_heartbeat(conn, release())

        # The statement that refused every loop of the first nine-handler
        # worker in production: a successful drain has no error class.
        runtime.record_drain_outcome(conn, release(), None)
        row = heartbeat_row(conn)
        assert row["supported_handlers"] == list(SUPPORTED_JOB_KINDS)
        assert row["last_drain_error_class"] is None
        assert row["last_drain_error_at"] is None

        runtime.record_drain_outcome(conn, release(), "meilisearch_unavailable")
        row = heartbeat_row(conn)
        assert row["last_drain_error_class"] == "meilisearch_unavailable"
        assert row["last_drain_error_at"] is not None

        runtime.record_drain_outcome(conn, release(), None)
        row = heartbeat_row(conn)
        assert row["last_drain_error_class"] is None
        assert row["last_drain_error_at"] is None


def test_state_read_preflight_and_readiness_execute(
    database: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")
    with psycopg.connect(database, autocommit=True, row_factory=dict_row) as conn:
        runtime.record_worker_heartbeat(conn, release())
        runtime.record_drain_outcome(conn, release(), None)

    state = runtime._read_postgres_state(release())
    assert state["postgresStatus"] == "available"
    assert state["jobQueueStatus"] == "available"
    assert state["queueRecovery"] == {
        "claimCompatible": "available",
        "handlerCompatible": "available",
        "unsupportedRetryingClass": "none",
        "terminalCountClass": "empty",
        "oldestDueAgeClass": "none",
    }

    preflight, preflight_ready = runtime.preflight_manifest(release())
    assert preflight_ready, preflight
    readiness, ready = runtime.readiness_manifest(release())
    assert ready, readiness
    assert readiness["dependencies"]["worker"] == {
        "status": "available",
        "drainClass": "converging",
    }


def test_worker_loop_statements_execute_on_an_empty_queue(database: str) -> None:
    with psycopg.connect(database, autocommit=True, row_factory=dict_row) as conn:
        runtime.record_worker_heartbeat(conn, release())
        worker._listen_for_wake(conn)
        assert worker._claim(conn) is None
        assert worker._wait_for_wake(conn, 0.05) is False

        # One full pass of what the loop does before it can claim anything. A
        # drain that raised would have recorded its class; this one converged
        # nothing and wrote down that it succeeded.
        worker._drain_public_projections(conn, release())
        row = heartbeat_row(conn)
        assert row["last_drain_error_class"] is None
        assert row["last_drain_error_at"] is None
