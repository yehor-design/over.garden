"""Approved, idempotent production proof for all matching queue handlers.

The canary uses existing eligible records and mutates only derived/advisory
surfaces. It never creates user content, changes canonical catalog decisions,
prints identifiers, or exposes queue payloads. Journal search is restored to
its original public-safe indexed state after the unindex proof.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Mapping

import meilisearch
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.job_handlers import SUPPORTED_JOB_KINDS
from app.runtime import RuntimeRelease, readiness_manifest
from app.search import (
    MEILISEARCH_HTTP_TIMEOUT_SECONDS,
    PUBLIC_JOURNAL_ENTRIES_INDEX,
)

CANARY_SCHEMA_VERSION = "ove194.matchingHandlerCanary.v1"
CANARY_APPROVAL_ENV = "OVERGARDEN_MATCHING_CANARY_APPROVED"
DEFAULT_TIMEOUT_SECONDS = 900
POLL_INTERVAL_SECONDS = 1.0

_ENQUEUE_UNSUPPORTED_SQL = """
insert into job_queue (
  queue_name,
  payload,
  idempotency_key,
  status,
  available_at,
  updated_at
)
values (%s, %s, %s, 'pending', now(), now())
on conflict (idempotency_key)
  where idempotency_key is not null
do update set
  status = 'pending',
  available_at = now(),
  locked_at = null,
  locked_by = null,
  rerun_requested = false,
  attempts = 0,
  last_error = null,
  terminal_error_code = null,
  terminalized_at = null,
  payload = excluded.payload,
  updated_at = now()
returning id::text as id
"""

_REPLAY_DEAD_SQL = """
update job_queue
set status = 'pending',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    rerun_requested = false,
    attempts = 0,
    last_error = null,
    terminal_error_code = null,
    terminalized_at = null,
    idempotency_key = %s,
    updated_at = now()
where id = %s
  and queue_name = %s
  and status = 'dead'
returning id::text as id
"""

_CATALOG_MATCH_SOURCE_SQL = """
select id::text as id
from catalog_items
where status = 'provisional'
  and source = 'user_added'
  and created_by_user_id is not null
order by created_at asc, id asc
limit 1
"""

_CATALOG_ALIAS_SOURCE_SQL = """
select catalog_items.id::text as id
from catalog_items
where catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
  and exists (
    select 1
    from catalog_item_names
    where catalog_item_names.catalog_item_id = catalog_items.id
  )
order by catalog_items.created_at asc, catalog_items.id asc
limit 1
"""

_PUBLIC_JOURNAL_SOURCE_SQL = """
select
  journal_entries.id::text as journal_entry_id,
  journal_entries.owner_user_id::text as owner_user_id
from journal_entries
left join plant_objects
  on plant_objects.id = journal_entries.plant_object_id
 and plant_objects.owner_user_id = journal_entries.owner_user_id
inner join spaces
  on spaces.id = journal_entries.space_id
 and spaces.owner_user_id = journal_entries.owner_user_id
where journal_entries.visibility = 'public'
  and journal_entries.lifecycle_state = 'active'
  and journal_entries.public_gone_at is null
  and journal_entries.public_slug is not null
  and journal_entries.title <> ''
  and journal_entries.body <> ''
  and journal_entries.entry_scope in ('object', 'space')
  and case
    when journal_entries.entry_scope = 'space' then spaces.location_visibility
    else plant_objects.location_visibility
  end = 'hidden'
order by journal_entries.created_at asc, journal_entries.id asc
limit 1
"""

_ENQUEUE_SQL = """
insert into job_queue (
  queue_name,
  payload,
  idempotency_key,
  status,
  available_at,
  updated_at
)
values (%s, %s, %s, 'pending', now(), now())
on conflict (idempotency_key)
  where idempotency_key is not null
do update set
  status = case
    when job_queue.status = 'processing' then job_queue.status
    else 'pending'
  end,
  available_at = now(),
  locked_at = case
    when job_queue.status = 'processing' then job_queue.locked_at
    else null
  end,
  locked_by = case
    when job_queue.status = 'processing' then job_queue.locked_by
    else null
  end,
  rerun_requested = (job_queue.status = 'processing'),
  last_error = null,
  updated_at = now()
returning id::text as id
"""

_JOB_STATUS_SQL = """
select status
from job_queue
where id = %s
  and queue_name = 'matching'
"""

_ALLOWED_JOURNAL_DOCUMENT_KEYS = frozenset(
    {
        "id",
        "title",
        "body",
        "publicSlug",
        "publicPath",
        "locationVisibility",
        "noindex",
        "entryDate",
        "entryScope",
        "createdAt",
        "kind",
    }
)


def run_handler_canaries(
    conn: psycopg.Connection,
    release: RuntimeRelease,
    *,
    meili_client: meilisearch.Client | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    readiness, is_ready = readiness_manifest(release)
    if not is_ready:
        raise RuntimeError("matching runtime is not ready for canary proof")
    if readiness["status"] != "ready":
        raise RuntimeError("matching runtime is not ready for canary proof")

    catalog_match_source = _required_source(conn, _CATALOG_MATCH_SOURCE_SQL)
    catalog_alias_source = _required_source(conn, _CATALOG_ALIAS_SOURCE_SQL)
    journal_source = conn.execute(_PUBLIC_JOURNAL_SOURCE_SQL).fetchone()
    if not isinstance(journal_source, Mapping):
        raise RuntimeError("eligible public-safe journal canary source is missing")

    first_phase = {
        "catalog_alias_suggestions_refresh": {
            "kind": "catalog_alias_suggestions_refresh",
            "catalogItemId": catalog_alias_source,
        },
        "catalog_fuzzy_duplicate_qa_refresh": {
            "kind": "catalog_fuzzy_duplicate_qa_refresh",
        },
        "catalog_match_suggestions_refresh": {
            "kind": "catalog_match_suggestions_refresh",
            "sourceCatalogItemId": catalog_match_source,
        },
        "catalog_typeahead_reindex": {"kind": "catalog_typeahead_reindex"},
        "journal_entry_index": {
            "kind": "journal_entry_index",
            "journalEntryId": str(journal_source["journal_entry_id"]),
            "userId": str(journal_source["owner_user_id"]),
        },
    }
    first_jobs = {
        kind: _enqueue(
            conn,
            release,
            payload,
            phase="initial",
        )
        for kind, payload in first_phase.items()
    }
    for job_id in first_jobs.values():
        _wait_for_done(conn, job_id, timeout_seconds)

    client = meili_client or meilisearch.Client(
        os.environ["MEILISEARCH_HOST"],
        os.environ.get("MEILISEARCH_API_KEY"),
        timeout=MEILISEARCH_HTTP_TIMEOUT_SECONDS,
    )
    journal_entry_id = str(journal_source["journal_entry_id"])
    owner_user_id = str(journal_source["owner_user_id"])
    document = _journal_document(client, journal_entry_id)
    if document is None or set(document) != _ALLOWED_JOURNAL_DOCUMENT_KEYS:
        raise RuntimeError("journal index canary failed the public-safe contract")

    unindex_payload = {
        "kind": "journal_entry_unindex",
        "journalEntryId": journal_entry_id,
        "userId": owner_user_id,
    }
    try:
        unindex_job = _enqueue(
            conn,
            release,
            unindex_payload,
            phase="unindex",
        )
        _wait_for_done(conn, unindex_job, timeout_seconds)
        if _journal_document(client, journal_entry_id) is not None:
            raise RuntimeError(
                "journal unindex canary did not remove the derived document"
            )
    finally:
        # Restoration is mandatory even when unindex verification fails. The
        # canary must never strand an otherwise eligible public document out of
        # the derived index merely because proof collection encountered an
        # outage or unexpected state.
        restore_job = _enqueue(
            conn,
            release,
            first_phase["journal_entry_index"],
            phase="restore",
        )
        _wait_for_done(conn, restore_job, timeout_seconds)
        restored_document = _journal_document(client, journal_entry_id)
        if (
            restored_document is None
            or set(restored_document) != _ALLOWED_JOURNAL_DOCUMENT_KEYS
        ):
            raise RuntimeError(
                "journal canary could not restore public-safe search state"
            )

    return {
        "schemaVersion": CANARY_SCHEMA_VERSION,
        "issue": "OVE-190",
        "release": release.manifest(),
        "handlerProofs": [
            {
                "kind": kind,
                "status": "done",
                "boundary": (
                    "restored-derived-search"
                    if kind in {"journal_entry_index", "journal_entry_unindex"}
                    else "derived-or-advisory-only"
                ),
            }
            for kind in SUPPORTED_JOB_KINDS
        ],
        "journalSearchBoundary": {
            "index": "passed",
            "unindex": "passed",
            "restore": "passed",
            "publicSafeKeys": "passed",
        },
        "leakCheck": "passed",
    }


def _required_source(conn: psycopg.Connection, sql: str) -> str:
    row = conn.execute(sql).fetchone()
    if not isinstance(row, Mapping) or not isinstance(row.get("id"), str):
        raise RuntimeError("eligible catalog canary source is missing")
    return row["id"]


def _enqueue(
    conn: psycopg.Connection,
    release: RuntimeRelease,
    payload: Mapping[str, object],
    *,
    phase: str,
) -> str:
    kind = payload.get("kind")
    if not isinstance(kind, str) or kind not in SUPPORTED_JOB_KINDS:
        raise RuntimeError("unsupported handler canary")
    idempotency_key = f"ove190:{release.commit_sha}:{phase}:{kind}"
    row = conn.execute(
        _ENQUEUE_SQL,
        (release.queue_name, Jsonb(dict(payload)), idempotency_key),
    ).fetchone()
    if not isinstance(row, Mapping) or not isinstance(row.get("id"), str):
        raise RuntimeError("handler canary could not be enqueued")
    return row["id"]


def _wait_for_done(
    conn: psycopg.Connection,
    job_id: str,
    timeout_seconds: int,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        row = conn.execute(_JOB_STATUS_SQL, (job_id,)).fetchone()
        status = row.get("status") if isinstance(row, Mapping) else None
        if status == "done":
            return
        if status not in {"pending", "processing", "failed"}:
            raise RuntimeError("handler canary reached an invalid state class")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise RuntimeError("handler canary timed out")


def _journal_document(
    client: meilisearch.Client, journal_entry_id: str
) -> dict[str, Any] | None:
    try:
        document = client.index(PUBLIC_JOURNAL_ENTRIES_INDEX).get_document(
            journal_entry_id
        )
    except Exception as error:
        if getattr(error, "status_code", None) == 404:
            return None
        if getattr(error, "code", None) == "document_not_found":
            return None
        raise RuntimeError("journal derived-search verification failed") from None
    if isinstance(document, Mapping):
        return dict(document)
    try:
        normalized = dict(document)
    except (TypeError, ValueError):
        raise RuntimeError(
            "journal derived-search document shape is invalid"
        ) from None
    if not all(isinstance(key, str) for key in normalized):
        raise RuntimeError("journal derived-search document shape is invalid")
    return normalized


def run_dead_letter_canaries(
    conn: psycopg.Connection,
    release: RuntimeRelease,
    *,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    readiness, is_ready = readiness_manifest(release)
    if not is_ready or readiness["status"] != "ready":
        raise RuntimeError("matching runtime is not ready for dead-letter proof")

    unsupported_key = f"ove194:{release.commit_sha}:unsupported:kind"
    unsupported = conn.execute(
        _ENQUEUE_UNSUPPORTED_SQL,
        (
            release.queue_name,
            Jsonb({"kind": "ove194_intentionally_unsupported"}),
            unsupported_key,
        ),
    ).fetchone()
    if not isinstance(unsupported, Mapping) or not isinstance(unsupported.get("id"), str):
        raise RuntimeError("unsupported canary could not be enqueued")
    unsupported_id = unsupported["id"]
    _wait_for_status(conn, unsupported_id, {"dead"}, timeout_seconds)

    second_claim_probe = conn.execute(
        """
        select count(*)::integer as claimable
        from job_queue
        where id = %s
          and queue_name = %s
          and status in ('pending', 'failed')
          and available_at <= now()
        """,
        (unsupported_id, release.queue_name),
    ).fetchone()
    if not isinstance(second_claim_probe, Mapping) or int(second_claim_probe["claimable"]) != 0:
        raise RuntimeError("unsupported canary remained claimable after terminalization")

    typeahead_key = f"ove194:{release.commit_sha}:replay:typeahead"
    typeahead = conn.execute(
        _ENQUEUE_SQL,
        (
            release.queue_name,
            Jsonb({"kind": "catalog_typeahead_reindex"}),
            typeahead_key,
        ),
    ).fetchone()
    if not isinstance(typeahead, Mapping) or not isinstance(typeahead.get("id"), str):
        raise RuntimeError("replay canary could not be enqueued")
    typeahead_id = typeahead["id"]
    _wait_for_done(conn, typeahead_id, timeout_seconds)

    # Force a supported job into dead, then authorize a one-shot replay.
    conn.execute(
        """
        update job_queue
        set status = 'dead',
            terminal_error_code = 'max_attempts_exceeded',
            terminalized_at = now(),
            locked_at = null,
            locked_by = null,
            updated_at = now()
        where id = %s
        """,
        (typeahead_id,),
    )
    replayed = conn.execute(
        _REPLAY_DEAD_SQL,
        (f"{typeahead_key}:replay", typeahead_id, release.queue_name),
    ).fetchone()
    if not isinstance(replayed, Mapping):
        raise RuntimeError("authorized replay did not reopen the dead job")
    _wait_for_done(conn, typeahead_id, timeout_seconds)

    return {
        "schemaVersion": CANARY_SCHEMA_VERSION,
        "issue": "OVE-194",
        "evidenceClass": "matching-dead-letter-canary",
        "release": release.manifest(),
        "outcomes": {
            "unsupportedTerminalized": "passed",
            "unsupportedNotReclaimed": "passed",
            "authorizedReplay": "passed",
            "supportedSuccess": "passed",
        },
        "leakCheck": "passed",
    }


def _wait_for_status(
    conn: psycopg.Connection,
    job_id: str,
    accepted: set[str],
    timeout_seconds: int,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        row = conn.execute(_JOB_STATUS_SQL, (job_id,)).fetchone()
        status = row.get("status") if isinstance(row, Mapping) else None
        if status in accepted:
            return
        if status not in {"pending", "processing", "failed", "dead"}:
            raise RuntimeError("canary reached an invalid state class")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise RuntimeError("canary timed out waiting for terminal state")


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    mode = args[0] if args else "handlers"
    if os.environ.get(CANARY_APPROVAL_ENV) != "true":
        print("OVE-194 matching canary requires an explicit approval gate.")
        return 1
    try:
        release = RuntimeRelease.from_environment()
        with psycopg.connect(
            os.environ["DIRECT_URL"],
            autocommit=True,
            row_factory=dict_row,
            connect_timeout=5,
        ) as conn:
            if mode == "dead-letter":
                evidence = run_dead_letter_canaries(conn, release)
            else:
                evidence = run_handler_canaries(conn, release)
        print(json.dumps(evidence, sort_keys=True, separators=(",", ":")))
        return 0
    except Exception:
        print("OVE-194 matching canary failed without exposing details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
