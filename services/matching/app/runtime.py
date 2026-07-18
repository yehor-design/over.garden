"""Redacted release capabilities and dependency-aware runtime readiness.

The public/operator contract intentionally exposes only immutable release
identity, supported queue kinds, and bounded dependency classes. It never
returns connection strings, hosts, exception text, queue payloads, row ids,
raw counts, or user data.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import json
import os
import re
import sys
from typing import Mapping, Sequence

import meilisearch
import psycopg
from psycopg.rows import dict_row

from app.job_handlers import SUPPORTED_JOB_KINDS
from app.search import MEILISEARCH_HTTP_TIMEOUT_SECONDS

RUNTIME_SCHEMA_VERSION = "ove190.matchingRuntime.v1"
SCHEMA_COMPATIBILITY_CLASS = "ove190.matching-schema.v1"
SERVICE_NAME = "overgarden-matching"
DEFAULT_QUEUE_NAME = "matching"
WORKER_HEARTBEAT_MAX_AGE_SECONDS = 30

_COMMIT_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
_IMAGE_DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
_BUILD_TIMESTAMP_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
)

_REQUIRED_JOB_QUEUE_COLUMNS = frozenset(
    {
        "id",
        "queue_name",
        "payload",
        "status",
        "available_at",
        "locked_at",
        "locked_by",
        "attempts",
        "rerun_requested",
        "updated_at",
    }
)
_REQUIRED_QUEUE_CONSTRAINTS = frozenset(
    {
        "job_queue_catalog_alias_payload_check",
        "job_queue_catalog_fuzzy_duplicate_payload_check",
        "job_queue_catalog_match_payload_check",
    }
)
_REQUIRED_HEARTBEAT_COLUMNS = frozenset(
    {
        "queue_name",
        "release_commit_sha",
        "image_digest",
        "schema_compatibility_class",
        "supported_handlers",
        "seen_at",
        "updated_at",
    }
)
_REQUIRED_HEARTBEAT_CONSTRAINTS = frozenset(
    {
        "matching_worker_heartbeats_commit_sha_check",
        "matching_worker_heartbeats_image_digest_check",
        "matching_worker_heartbeats_queue_name_check",
        "matching_worker_heartbeats_schema_compatibility_check",
        "matching_worker_heartbeats_supported_handlers_check",
    }
)


class RuntimeConfigurationError(ValueError):
    """Raised without including the rejected value or any environment secret."""


@dataclass(frozen=True)
class RuntimeRelease:
    commit_sha: str
    image_digest: str
    build_timestamp: str
    schema_compatibility_class: str
    queue_name: str

    @classmethod
    def from_environment(cls) -> "RuntimeRelease":
        commit_sha = os.environ.get("OVERGARDEN_MATCHING_COMMIT_SHA", "")
        image_digest = os.environ.get("OVERGARDEN_MATCHING_IMAGE_DIGEST", "")
        build_timestamp = os.environ.get(
            "OVERGARDEN_MATCHING_BUILD_TIMESTAMP", ""
        )
        schema_compatibility_class = os.environ.get(
            "OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY", ""
        )
        queue_name = os.environ.get("QUEUE_NAME", DEFAULT_QUEUE_NAME)

        if not _COMMIT_SHA_PATTERN.fullmatch(commit_sha):
            raise RuntimeConfigurationError("matching release commit is invalid")
        if not _IMAGE_DIGEST_PATTERN.fullmatch(image_digest):
            raise RuntimeConfigurationError("matching image digest is invalid")
        if not _BUILD_TIMESTAMP_PATTERN.fullmatch(build_timestamp):
            raise RuntimeConfigurationError("matching build timestamp is invalid")
        try:
            parsed_timestamp = datetime.fromisoformat(
                build_timestamp.removesuffix("Z") + "+00:00"
            )
        except ValueError as error:
            raise RuntimeConfigurationError(
                "matching build timestamp is invalid"
            ) from error
        if parsed_timestamp.utcoffset() is None:
            raise RuntimeConfigurationError("matching build timestamp is invalid")
        if schema_compatibility_class != SCHEMA_COMPATIBILITY_CLASS:
            raise RuntimeConfigurationError(
                "matching schema compatibility class is invalid"
            )
        if queue_name != DEFAULT_QUEUE_NAME:
            raise RuntimeConfigurationError("matching queue name is invalid")

        return cls(
            commit_sha=commit_sha,
            image_digest=image_digest,
            build_timestamp=build_timestamp,
            schema_compatibility_class=schema_compatibility_class,
            queue_name=queue_name,
        )

    def manifest(self) -> dict[str, str]:
        return {
            "commitSha": self.commit_sha,
            "imageDigest": self.image_digest,
            "buildTimestamp": self.build_timestamp,
            "schemaCompatibilityClass": self.schema_compatibility_class,
        }


def capabilities_manifest(
    release: RuntimeRelease | None = None,
) -> dict[str, object]:
    resolved_release = release or RuntimeRelease.from_environment()
    return {
        "schemaVersion": RUNTIME_SCHEMA_VERSION,
        "service": SERVICE_NAME,
        "status": "available",
        "release": resolved_release.manifest(),
        "queue": {
            "name": resolved_release.queue_name,
            "supportedHandlers": list(SUPPORTED_JOB_KINDS),
        },
    }


def unavailable_manifest() -> dict[str, str]:
    return {
        "schemaVersion": RUNTIME_SCHEMA_VERSION,
        "service": SERVICE_NAME,
        "status": "unavailable",
    }


def preflight_manifest(
    release: RuntimeRelease | None = None,
) -> tuple[dict[str, object], bool]:
    resolved_release = release or RuntimeRelease.from_environment()
    postgres_state = _read_postgres_state(resolved_release)
    meilisearch_status = _read_meilisearch_status()
    ready = (
        postgres_state["postgresStatus"] == "available"
        and postgres_state["jobQueueStatus"] == "available"
        and meilisearch_status == "available"
    )
    manifest: dict[str, object] = {
        **capabilities_manifest(resolved_release),
        "status": "ready" if ready else "degraded",
        "dependencies": {
            "api": {"status": "available"},
            "postgres": {"status": postgres_state["postgresStatus"]},
            "jobQueue": {
                "status": postgres_state["jobQueueStatus"],
                "depthClass": postgres_state["depthClass"],
                "lagClass": postgres_state["lagClass"],
            },
            "meilisearch": {"status": meilisearch_status},
        },
    }
    return manifest, ready


def readiness_manifest(
    release: RuntimeRelease | None = None,
) -> tuple[dict[str, object], bool]:
    resolved_release = release or RuntimeRelease.from_environment()
    postgres_state = _read_postgres_state(resolved_release)
    meilisearch_status = _read_meilisearch_status()
    worker_status = _worker_status(postgres_state, resolved_release)
    ready = (
        postgres_state["postgresStatus"] == "available"
        and postgres_state["jobQueueStatus"] == "available"
        and meilisearch_status == "available"
        and worker_status == "available"
    )
    manifest: dict[str, object] = {
        **capabilities_manifest(resolved_release),
        "status": "ready" if ready else "degraded",
        "dependencies": {
            "api": {"status": "available"},
            "postgres": {"status": postgres_state["postgresStatus"]},
            "jobQueue": {
                "status": postgres_state["jobQueueStatus"],
                "depthClass": postgres_state["depthClass"],
                "lagClass": postgres_state["lagClass"],
            },
            "meilisearch": {"status": meilisearch_status},
            "worker": {"status": worker_status},
        },
    }
    return manifest, ready


def record_worker_heartbeat(
    conn: psycopg.Connection,
    release: RuntimeRelease | None = None,
) -> None:
    resolved_release = release or RuntimeRelease.from_environment()
    conn.execute(
        """
        insert into matching_worker_heartbeats (
          queue_name,
          release_commit_sha,
          image_digest,
          schema_compatibility_class,
          supported_handlers,
          seen_at,
          updated_at
        )
        values (%s, %s, %s, %s, %s, now(), now())
        on conflict (queue_name)
        do update set
          release_commit_sha = excluded.release_commit_sha,
          image_digest = excluded.image_digest,
          schema_compatibility_class = excluded.schema_compatibility_class,
          supported_handlers = excluded.supported_handlers,
          seen_at = now(),
          updated_at = now()
        """,
        (
            resolved_release.queue_name,
            resolved_release.commit_sha,
            resolved_release.image_digest,
            resolved_release.schema_compatibility_class,
            list(SUPPORTED_JOB_KINDS),
        ),
    )


def _read_postgres_state(release: RuntimeRelease) -> dict[str, object]:
    unavailable = {
        "postgresStatus": "unavailable",
        "jobQueueStatus": "unavailable",
        "depthClass": "empty",
        "lagClass": "none",
        "heartbeat": None,
    }
    dsn = os.environ.get("DIRECT_URL")
    if not dsn:
        return unavailable

    try:
        with psycopg.connect(
            dsn,
            autocommit=True,
            row_factory=dict_row,
            connect_timeout=5,
        ) as conn:
            table_row = conn.execute(
                """
                select
                  to_regclass('public.job_queue') is not null as has_job_queue,
                  to_regclass('public.matching_worker_heartbeats') is not null
                    as has_worker_heartbeats
                """
            ).fetchone()
            if not table_row or not table_row["has_job_queue"]:
                return {
                    **unavailable,
                    "postgresStatus": "available",
                    "jobQueueStatus": "schema_mismatch",
                }

            columns = _table_columns(conn, "job_queue")
            constraints = _table_constraints(conn, "job_queue")
            heartbeat_columns = (
                _table_columns(conn, "matching_worker_heartbeats")
                if table_row["has_worker_heartbeats"]
                else set()
            )
            heartbeat_constraints = (
                _table_constraints(conn, "matching_worker_heartbeats")
                if table_row["has_worker_heartbeats"]
                else set()
            )
            schema_ready = (
                _REQUIRED_JOB_QUEUE_COLUMNS.issubset(columns)
                and _REQUIRED_QUEUE_CONSTRAINTS.issubset(constraints)
                and _REQUIRED_HEARTBEAT_COLUMNS.issubset(heartbeat_columns)
                and _REQUIRED_HEARTBEAT_CONSTRAINTS.issubset(
                    heartbeat_constraints
                )
            )
            if not schema_ready:
                return {
                    **unavailable,
                    "postgresStatus": "available",
                    "jobQueueStatus": "schema_mismatch",
                }

            queue_row = conn.execute(
                """
                select
                  count(*) filter (
                    where status in ('pending', 'processing', 'failed')
                  )::integer as queue_depth,
                  extract(
                    epoch from now() - min(available_at)
                      filter (
                        where status in ('pending', 'failed')
                          and available_at <= now()
                      )
                  )::double precision as oldest_due_seconds
                from job_queue
                where queue_name = %s
                """,
                (release.queue_name,),
            ).fetchone()
            heartbeat = conn.execute(
                """
                select
                  release_commit_sha,
                  image_digest,
                  schema_compatibility_class,
                  supported_handlers,
                  seen_at >= now() - (%s || ' seconds')::interval as is_fresh
                from matching_worker_heartbeats
                where queue_name = %s
                """,
                (WORKER_HEARTBEAT_MAX_AGE_SECONDS, release.queue_name),
            ).fetchone()
            depth = int(queue_row["queue_depth"]) if queue_row else 0
            lag_value = queue_row["oldest_due_seconds"] if queue_row else None
            lag_seconds = float(lag_value) if lag_value is not None else None
            return {
                "postgresStatus": "available",
                "jobQueueStatus": "available",
                "depthClass": _queue_depth_class(depth),
                "lagClass": _queue_lag_class(lag_seconds),
                "heartbeat": heartbeat,
            }
    except Exception:
        return unavailable


def _read_meilisearch_status() -> str:
    host = os.environ.get("MEILISEARCH_HOST")
    if not host:
        return "unavailable"
    try:
        response = meilisearch.Client(
            host,
            os.environ.get("MEILISEARCH_API_KEY"),
            timeout=MEILISEARCH_HTTP_TIMEOUT_SECONDS,
        ).health()
        if isinstance(response, Mapping) and response.get("status") == "available":
            return "available"
    except Exception:
        pass
    return "unavailable"


def _table_columns(conn: psycopg.Connection, table_name: str) -> set[str]:
    rows = conn.execute(
        """
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = %s
        """,
        (table_name,),
    ).fetchall()
    return {str(row["column_name"]) for row in rows}


def _table_constraints(conn: psycopg.Connection, table_name: str) -> set[str]:
    rows = conn.execute(
        """
        select conname
        from pg_constraint
        where conrelid = to_regclass('public.' || %s)
        """,
        (table_name,),
    ).fetchall()
    return {str(row["conname"]) for row in rows}


def _worker_status(
    postgres_state: Mapping[str, object], release: RuntimeRelease
) -> str:
    if postgres_state.get("postgresStatus") != "available":
        return "unavailable"
    if postgres_state.get("jobQueueStatus") != "available":
        return "unavailable"
    heartbeat = postgres_state.get("heartbeat")
    if not isinstance(heartbeat, Mapping):
        return "missing"
    if not heartbeat.get("is_fresh"):
        return "stale"
    if (
        heartbeat.get("release_commit_sha") != release.commit_sha
        or heartbeat.get("image_digest") != release.image_digest
        or heartbeat.get("schema_compatibility_class")
        != release.schema_compatibility_class
    ):
        return "release_mismatch"
    handlers = heartbeat.get("supported_handlers")
    if not isinstance(handlers, Sequence) or isinstance(handlers, (str, bytes)):
        return "capability_mismatch"
    if tuple(sorted(str(handler) for handler in handlers)) != SUPPORTED_JOB_KINDS:
        return "capability_mismatch"
    return "available"


def _queue_depth_class(depth: int) -> str:
    if depth <= 0:
        return "empty"
    if depth <= 10:
        return "low"
    if depth <= 100:
        return "medium"
    return "high"


def _queue_lag_class(oldest_due_seconds: float | None) -> str:
    if oldest_due_seconds is None:
        return "none"
    if oldest_due_seconds <= 60:
        return "fresh"
    if oldest_due_seconds <= 300:
        return "delayed"
    return "stale"


def _emit(manifest: Mapping[str, object]) -> None:
    print(json.dumps(manifest, sort_keys=True, separators=(",", ":")))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OverGarden matching runtime proof")
    parser.add_argument("command", choices=("capabilities", "preflight", "ready"))
    args = parser.parse_args(argv)
    try:
        release = RuntimeRelease.from_environment()
        if args.command == "capabilities":
            _emit(capabilities_manifest(release))
            return 0
        if args.command == "preflight":
            manifest, ready = preflight_manifest(release)
        else:
            manifest, ready = readiness_manifest(release)
        _emit(manifest)
        return 0 if ready else 1
    except RuntimeConfigurationError:
        _emit(unavailable_manifest())
        return 1


if __name__ == "__main__":
    sys.exit(main())
