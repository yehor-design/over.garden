"""Worker restart / recovery proof for the pilot journal search path (OVE-39).

These tests prove the durability properties the first closed pilot depends on:

1. A `processing` row whose `locked_at` is older than the visibility timeout is
   reclaimed by a fresh worker run (simulated process restart / crash recovery).
2. After recovery, `journal_entry_index` and `journal_entry_unindex` jobs still
   reach `done` and enforce the same public-safe Meilisearch document contract
   proven in OVE-36 (no owner/user IDs, media keys, precise location, etc.).
3. Re-delivery (at-least-once) is idempotent: reprocessing the same job does not
   create a duplicate document or change the public-safe contract.
4. A transient search-backend failure marks the job `failed` with a future
   retry, and a later run recovers it to `done`.

The queue model below mirrors `worker.CLAIM_JOB_SQL` exactly. The real claim SQL
text is additionally asserted in `tests/test_worker.py`, so the in-memory model
cannot silently drift from the predicate it stands in for. The real
`app.search` conversion + index/unindex code runs unchanged against an in-memory
Meilisearch double, so the public-safe contract under test is the production one.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from app import search, worker

ENTRY_ID = "00000000-0000-4000-8000-000000000abc"
OWNER_ID = "00000000-0000-4000-8000-000000000def"

CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts/search/public-journal-entry-search-document.json"
)
PUBLIC_JOURNAL_CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

# The public-safe journal document contract proven in OVE-36/OVE-39 for hidden
# location documents. Region documents may additionally include coarseRegionCode.
PUBLIC_SAFE_DOCUMENT_KEYS = set(PUBLIC_JOURNAL_CONTRACT["requiredFields"])
FORBIDDEN_DOCUMENT_KEYS = set(PUBLIC_JOURNAL_CONTRACT["forbiddenFields"])


def journal_row(**overrides: Any) -> dict[str, Any]:
    row = {
        "id": ENTRY_ID,
        "title": "First flowers",
        "body": "Помідори чері",
        "public_slug": "first-flowers-abc123",
        "public_noindex": True,
        "public_gone_at": None,
        "entry_date": date(2026, 6, 25),
        "entry_scope": "object",
        "created_at": datetime(2026, 6, 26, 12, 30, tzinfo=timezone.utc),
        "visibility": "public",
        "lifecycle_state": "active",
        "location_visibility": "hidden",
        "coarse_region_code": None,
    }
    row.update(overrides)
    return row


class FakeMeiliTask:
    def __init__(self, uid: str) -> None:
        self.task_uid = uid


class FakeMeiliIndex:
    def __init__(self, name: str) -> None:
        self.name = name
        self.documents: dict[str, dict[str, Any]] = {}

    def update_searchable_attributes(self, attrs: Any) -> FakeMeiliTask:
        return FakeMeiliTask("searchable")

    def update_filterable_attributes(self, attrs: Any) -> FakeMeiliTask:
        return FakeMeiliTask("filterable")

    def update_sortable_attributes(self, attrs: Any) -> FakeMeiliTask:
        return FakeMeiliTask("sortable")

    def add_documents(
        self, documents: list[dict[str, Any]], primary_key: str = "id"
    ) -> FakeMeiliTask:
        for document in documents:
            # Upsert by primary key, exactly like Meilisearch: re-delivery of the
            # same job must not create a duplicate row.
            self.documents[document[primary_key]] = document
        return FakeMeiliTask("add")

    def delete_document(self, document_id: str) -> FakeMeiliTask:
        # Deleting an already-absent document is a no-op in Meilisearch too.
        self.documents.pop(document_id, None)
        return FakeMeiliTask("delete")

    def delete_all_documents(self) -> FakeMeiliTask:
        self.documents.clear()
        return FakeMeiliTask("delete-all")


class FakeMeiliClient:
    def __init__(self) -> None:
        self.indexes: dict[str, FakeMeiliIndex] = {}

    def index(self, name: str) -> FakeMeiliIndex:
        return self.indexes.setdefault(name, FakeMeiliIndex(name))

    def wait_for_task(self, task_uid: str) -> None:
        return None


class _FakeTransaction:
    def __enter__(self) -> "_FakeTransaction":
        return self

    def __exit__(self, *exc: Any) -> bool:
        return False


class _FakeCursor:
    def __init__(self, row: Any) -> None:
        self._row = row

    def fetchone(self) -> Any:
        return self._row


class FailingMeiliIndex(FakeMeiliIndex):
    """Models a temporarily unavailable Meilisearch on writes."""

    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.fail_writes = True

    def add_documents(
        self, documents: list[dict[str, Any]], primary_key: str = "id"
    ) -> FakeMeiliTask:
        if self.fail_writes:
            raise RuntimeError("meilisearch unavailable")
        return super().add_documents(documents, primary_key)


class FailingMeiliClient(FakeMeiliClient):
    def index(self, name: str) -> FakeMeiliIndex:
        existing = self.indexes.get(name)
        if existing is None:
            existing = FailingMeiliIndex(name)
            self.indexes[name] = existing
        return existing


class FakeQueueConnection:
    """In-memory `job_queue` faithful to `worker.CLAIM_JOB_SQL` semantics."""

    def __init__(
        self,
        clock: dict[str, datetime],
        journal_rows: dict[tuple[str, str], dict[str, Any] | None] | None = None,
        owner_rows: dict[tuple[str, str], bool] | None = None,
    ) -> None:
        self.clock = clock
        self.jobs: list[dict[str, Any]] = []
        self.journal_rows = journal_rows or {}
        self.owner_rows = owner_rows or {}
        self._seq = 0

    @property
    def now(self) -> datetime:
        return self.clock["now"]

    def enqueue(
        self,
        payload: dict[str, Any],
        *,
        queue_name: str = worker.QUEUE_NAME,
    ) -> str:
        self._seq += 1
        job_id = f"job-{self._seq}"
        self.jobs.append(
            {
                "id": job_id,
                "queue_name": queue_name,
                "payload": payload,
                "status": "pending",
                "available_at": self.now,
                "locked_at": None,
                "locked_by": None,
                "rerun_requested": False,
                "attempts": 0,
                "last_error": None,
                "created_at": self.now,
                "seq": self._seq,
            }
        )
        return job_id

    def request_rerun(self, job_id: str) -> None:
        row = self.job(job_id)
        if row["status"] == "processing":
            row["rerun_requested"] = True
        else:
            row.update(
                status="pending",
                locked_at=None,
                locked_by=None,
                rerun_requested=False,
                available_at=self.now,
            )

    def job(self, job_id: str) -> dict[str, Any]:
        for row in self.jobs:
            if row["id"] == job_id:
                return row
        raise KeyError(job_id)

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction()

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> _FakeCursor:
        if sql is worker.CLAIM_JOB_SQL:
            return _FakeCursor(self._claim_due(params))
        if sql is search.JOURNAL_ENTRY_SEARCH_ROW_SQL:
            journal_entry_id, owner_user_id = params
            return _FakeCursor(self.journal_rows.get((journal_entry_id, owner_user_id)))
        if sql is search.JOURNAL_ENTRY_OWNER_SQL:
            journal_entry_id, owner_user_id = params
            owns = self.owner_rows.get((journal_entry_id, owner_user_id), False)
            return _FakeCursor({"id": journal_entry_id} if owns else None)

        normalized = " ".join(sql.split()).lower()
        if "set status = 'processing'" in normalized:
            claim_token, job_id = params
            row = self.job(job_id)
            row.update(
                status="processing",
                locked_at=self.now,
                locked_by=claim_token,
                rerun_requested=False,
                attempts=row["attempts"] + 1,
            )
            return _FakeCursor(None)
        if "case when rerun_requested then 'pending' else 'done' end" in normalized:
            job_id, claim_token = params
            row = self.job(job_id)
            if row["status"] == "processing" and row["locked_by"] == claim_token:
                row.update(
                    status="pending" if row["rerun_requested"] else "done",
                    available_at=self.now
                    if row["rerun_requested"]
                    else row["available_at"],
                    locked_at=None,
                    locked_by=None,
                    rerun_requested=False,
                )
            return _FakeCursor(None)
        if "case when rerun_requested then 'pending' else 'failed' end" in normalized:
            vt_seconds, error, job_id, claim_token = params
            row = self.job(job_id)
            if row["status"] == "processing" and row["locked_by"] == claim_token:
                row.update(
                    status="pending" if row["rerun_requested"] else "failed",
                    locked_at=None,
                    locked_by=None,
                    rerun_requested=False,
                    last_error=error,
                    available_at=self.now
                    if row["rerun_requested"]
                    else self.now + timedelta(seconds=int(vt_seconds)),
                )
            return _FakeCursor(None)

        raise AssertionError(f"unexpected SQL in fake connection: {normalized[:80]}")

    def _claim_due(self, params: tuple[Any, ...]) -> dict[str, Any] | None:
        queue_name, catalog_vt_seconds, default_vt_seconds = params
        now = self.now

        def is_due(row: dict[str, Any]) -> bool:
            if row["queue_name"] != queue_name:
                return False
            if row["status"] in ("pending", "failed") and row["available_at"] <= now:
                return True
            if (
                row["status"] == "processing"
                and row["locked_at"] is not None
                and row["locked_at"]
                <= now
                - timedelta(
                    seconds=int(catalog_vt_seconds)
                    if row["payload"].get("kind")
                    == worker.CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND
                    else int(default_vt_seconds)
                )
            ):
                return True
            return False

        candidates = sorted(
            (row for row in self.jobs if is_due(row)),
            key=lambda row: (row["created_at"], row["seq"]),
        )
        if not candidates:
            return None
        row = candidates[0]
        return {"id": row["id"], "payload": row["payload"]}


def test_claim_sql_predicate_matches_recovery_model():
    """Guard against the in-memory model drifting from the real claim SQL."""
    normalized = " ".join(worker.CLAIM_JOB_SQL.split()).lower()

    # Due pending/failed rows are claimable.
    assert "status in ('pending', 'failed') and available_at <= now()" in normalized
    # Stale processing rows are reclaimed after the visibility timeout interval.
    assert "status = 'processing'" in normalized
    assert "catalog_match_suggestions_refresh" in normalized
    assert "else %s" in normalized
    # Concurrent workers never claim the same row.
    assert "for update skip locked" in normalized


@pytest.fixture
def clock() -> dict[str, datetime]:
    return {"now": datetime(2026, 6, 29, 12, 0, 0, tzinfo=timezone.utc)}


def test_claim_reclaims_only_stale_processing_jobs(clock):
    conn = FakeQueueConnection(clock)
    pending_due = conn.enqueue({"kind": "catalog_typeahead_reindex"})

    # A fresh worker claims the due pending job and locks it.
    claimed = worker._claim(conn)
    assert claimed is not None and claimed["id"] == pending_due
    assert conn.job(pending_due)["status"] == "processing"
    assert conn.job(pending_due)["attempts"] == 1

    # While freshly locked (inside the visibility timeout) it is not reclaimable.
    assert worker._claim(conn) is None

    # Once the visibility timeout elapses, a restarted worker reclaims it.
    clock["now"] += timedelta(seconds=worker.VISIBILITY_TIMEOUT_SECONDS + 5)
    reclaimed = worker._claim(conn)
    assert reclaimed is not None and reclaimed["id"] == pending_due
    assert conn.job(pending_due)["attempts"] == 2


def test_catalog_match_job_uses_the_longer_bounded_visibility_lease(clock):
    conn = FakeQueueConnection(clock)
    job_id = conn.enqueue(
        {
            "kind": "catalog_match_suggestions_refresh",
            "sourceCatalogItemId": "00000000-0000-4000-8000-000000000201",
        }
    )

    assert worker._claim(conn) is not None
    clock["now"] += timedelta(seconds=worker.VISIBILITY_TIMEOUT_SECONDS + 5)
    assert worker._claim(conn) is None

    clock["now"] += timedelta(
        seconds=worker.CATALOG_MATCH_VISIBILITY_TIMEOUT_SECONDS
        - worker.VISIBILITY_TIMEOUT_SECONDS
    )
    reclaimed = worker._claim(conn)
    assert reclaimed is not None and reclaimed["id"] == job_id


def test_rescan_during_processing_is_requeued_and_old_claim_cannot_finish_new_run(
    clock,
):
    conn = FakeQueueConnection(clock)
    job_id = conn.enqueue(
        {
            "kind": "catalog_match_suggestions_refresh",
            "sourceCatalogItemId": "00000000-0000-4000-8000-000000000201",
        }
    )

    first_claim = worker._claim(conn)
    assert first_claim is not None
    conn.request_rerun(job_id)

    worker._mark_done(conn, job_id, first_claim["claimToken"])
    assert conn.job(job_id)["status"] == "pending"

    second_claim = worker._claim(conn)
    assert second_claim is not None
    assert second_claim["claimToken"] != first_claim["claimToken"]

    worker._mark_done(conn, job_id, first_claim["claimToken"])
    assert conn.job(job_id)["status"] == "processing"

    worker._mark_done(conn, job_id, second_claim["claimToken"])
    assert conn.job(job_id)["status"] == "done"


def test_pending_job_not_claimed_before_available_at(clock):
    conn = FakeQueueConnection(clock)
    job_id = conn.enqueue({"kind": "catalog_typeahead_reindex"})
    conn.job(job_id)["available_at"] = conn.now + timedelta(seconds=30)

    assert worker._claim(conn) is None

    clock["now"] += timedelta(seconds=31)
    claimed = worker._claim(conn)
    assert claimed is not None and claimed["id"] == job_id


def test_journal_index_job_recovers_after_restart_and_stays_public_safe(
    clock, monkeypatch
):
    fake_meili = FakeMeiliClient()
    monkeypatch.setattr(search, "client", lambda: fake_meili)

    conn = FakeQueueConnection(
        clock,
        journal_rows={(ENTRY_ID, OWNER_ID): journal_row()},
    )
    job_id = conn.enqueue(
        {
            "kind": "journal_entry_index",
            "journalEntryId": ENTRY_ID,
            "userId": OWNER_ID,
        }
    )

    # Worker A claims the job, then the process dies before marking it done.
    claimed_a = worker._claim(conn)
    assert claimed_a is not None and claimed_a["id"] == job_id
    assert conn.job(job_id)["status"] == "processing"

    # Recovery: after the visibility timeout, a restarted worker reclaims and
    # drives the real index job to done.
    clock["now"] += timedelta(seconds=worker.VISIBILITY_TIMEOUT_SECONDS + 5)
    claimed_b = worker._claim(conn)
    assert claimed_b is not None and claimed_b["id"] == job_id
    assert conn.job(job_id)["attempts"] == 2

    worker._handle(conn, claimed_b["payload"])
    worker._mark_done(conn, claimed_b["id"], claimed_b["claimToken"])
    assert conn.job(job_id)["status"] == "done"

    index = fake_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX)
    assert set(index.documents.keys()) == {ENTRY_ID}
    document = index.documents[ENTRY_ID]
    assert set(document.keys()) == PUBLIC_SAFE_DOCUMENT_KEYS
    assert FORBIDDEN_DOCUMENT_KEYS.isdisjoint(document.keys())
    assert document["noindex"] is True
    assert document["locationVisibility"] == "hidden"
    assert document["publicPath"] == "/journal/first-flowers-abc123"


def test_journal_index_redelivery_is_idempotent(clock, monkeypatch):
    fake_meili = FakeMeiliClient()
    monkeypatch.setattr(search, "client", lambda: fake_meili)

    conn = FakeQueueConnection(
        clock,
        journal_rows={(ENTRY_ID, OWNER_ID): journal_row()},
    )
    payload = {
        "kind": "journal_entry_index",
        "journalEntryId": ENTRY_ID,
        "userId": OWNER_ID,
    }

    worker._handle(conn, payload)
    index = fake_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX)
    first = dict(index.documents[ENTRY_ID])

    # At-least-once re-delivery (e.g. the done update was lost on restart).
    worker._handle(conn, payload)

    assert set(index.documents.keys()) == {ENTRY_ID}
    assert index.documents[ENTRY_ID] == first
    assert set(index.documents[ENTRY_ID].keys()) == PUBLIC_SAFE_DOCUMENT_KEYS


def test_journal_unindex_job_recovers_after_restart_and_is_idempotent(
    clock, monkeypatch
):
    fake_meili = FakeMeiliClient()
    monkeypatch.setattr(search, "client", lambda: fake_meili)

    # Seed the index as if the entry had previously been published.
    fake_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX).add_documents(
        [{"id": ENTRY_ID, "title": "stale"}], primary_key="id"
    )

    conn = FakeQueueConnection(
        clock,
        owner_rows={(ENTRY_ID, OWNER_ID): True},
    )
    job_id = conn.enqueue(
        {
            "kind": "journal_entry_unindex",
            "journalEntryId": ENTRY_ID,
            "userId": OWNER_ID,
        }
    )

    # Crash after claim, then recover after the visibility timeout.
    assert worker._claim(conn) is not None
    clock["now"] += timedelta(seconds=worker.VISIBILITY_TIMEOUT_SECONDS + 5)
    reclaimed = worker._claim(conn)
    assert reclaimed is not None and reclaimed["id"] == job_id

    worker._handle(conn, reclaimed["payload"])
    worker._mark_done(conn, reclaimed["id"], reclaimed["claimToken"])

    index = fake_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX)
    assert ENTRY_ID not in index.documents
    assert conn.job(job_id)["status"] == "done"

    # Re-delivery of the unindex job stays a safe no-op.
    worker._handle(conn, reclaimed["payload"])
    assert ENTRY_ID not in index.documents


def test_index_job_fails_then_recovers_when_search_backend_returns(clock, monkeypatch):
    failing_meili = FailingMeiliClient()
    monkeypatch.setattr(search, "client", lambda: failing_meili)

    conn = FakeQueueConnection(
        clock,
        journal_rows={(ENTRY_ID, OWNER_ID): journal_row()},
    )
    job_id = conn.enqueue(
        {
            "kind": "journal_entry_index",
            "journalEntryId": ENTRY_ID,
            "userId": OWNER_ID,
        }
    )

    # First attempt: Meilisearch is down, so the worker marks the job failed and
    # schedules a future retry instead of losing it or marking it done.
    claimed = worker._claim(conn)
    assert claimed is not None
    try:
        worker._handle(conn, claimed["payload"])
    except Exception as error:  # mirrors run()'s try/except -> _mark_failed
        worker._mark_failed(
            conn,
            claimed["id"],
            claimed["claimToken"],
            str(error),
        )
    else:  # pragma: no cover - the backend is down on the first attempt
        worker._mark_done(conn, claimed["id"], claimed["claimToken"])

    assert conn.job(job_id)["status"] == "failed"
    assert worker._claim(conn) is None  # backoff window respected

    # Backend recovers; after the retry delay the job is reclaimed and finishes.
    failing_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX).fail_writes = False
    clock["now"] += timedelta(seconds=worker.VISIBILITY_TIMEOUT_SECONDS + 1)
    retried = worker._claim(conn)
    assert retried is not None and retried["id"] == job_id

    worker._handle(conn, retried["payload"])
    worker._mark_done(conn, retried["id"], retried["claimToken"])

    index = failing_meili.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX)
    assert set(index.documents.keys()) == {ENTRY_ID}
    assert set(index.documents[ENTRY_ID].keys()) == PUBLIC_SAFE_DOCUMENT_KEYS
    assert conn.job(job_id)["status"] == "done"
