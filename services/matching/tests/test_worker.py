import pytest

from app import worker


def test_worker_handles_catalog_reindex(monkeypatch):
    calls = []
    monkeypatch.setattr(
        worker, "reindex_catalog_typeahead", lambda conn: calls.append(conn)
    )

    worker._handle("conn", {"kind": "catalog_typeahead_reindex"})

    assert calls == ["conn"]


def test_worker_handles_catalog_match_suggestion_refresh(monkeypatch):
    calls = []

    def fake_refresh(conn, source_catalog_item_id):
        calls.append((conn, source_catalog_item_id))

    monkeypatch.setattr(worker, "refresh_catalog_match_suggestions", fake_refresh)

    worker._handle(
        "conn",
        {
            "kind": "catalog_match_suggestions_refresh",
            "sourceCatalogItemId": "00000000-0000-4000-8000-000000000201",
        },
    )

    assert calls == [
        ("conn", "00000000-0000-4000-8000-000000000201"),
    ]


def test_worker_handles_catalog_alias_suggestion_refresh(monkeypatch):
    calls = []

    monkeypatch.setattr(
        worker,
        "refresh_catalog_alias_suggestions",
        lambda conn, catalog_item_id: calls.append((conn, catalog_item_id)),
        raising=False,
    )

    worker._handle(
        "conn",
        {
            "kind": "catalog_alias_suggestions_refresh",
            "catalogItemId": "00000000-0000-4000-8000-000000000101",
        },
    )

    assert calls == [
        ("conn", "00000000-0000-4000-8000-000000000101"),
    ]


def test_worker_handles_catalog_fuzzy_duplicate_qa_refresh(monkeypatch):
    calls = []
    monkeypatch.setattr(
        worker,
        "refresh_catalog_fuzzy_duplicate_suggestions",
        lambda conn: calls.append(conn),
        raising=False,
    )

    worker._handle("conn", {"kind": "catalog_fuzzy_duplicate_qa_refresh"})

    assert calls == ["conn"]


def test_worker_rejects_extra_fuzzy_qa_payload_keys_without_echoing_them():
    with pytest.raises(ValueError, match="unsupported payload shape") as error:
        worker._handle(
            "conn",
            {
                "kind": "catalog_fuzzy_duplicate_qa_refresh",
                "journalBody": "do-not-leak",
            },
        )

    assert "do-not-leak" not in str(error.value)


def test_worker_rejects_private_fields_in_catalog_alias_payload(monkeypatch):
    monkeypatch.setattr(
        worker,
        "refresh_catalog_alias_suggestions",
        lambda *_args: None,
        raising=False,
    )

    with pytest.raises(ValueError, match="unsupported payload shape") as error:
        worker._handle(
            "conn",
            {
                "kind": "catalog_alias_suggestions_refresh",
                "catalogItemId": "00000000-0000-4000-8000-000000000101",
                "journalBody": "do-not-leak",
            },
        )

    assert "do-not-leak" not in str(error.value)


def test_worker_rejects_extra_catalog_match_payload_keys_without_echoing_them():
    with pytest.raises(ValueError, match="unsupported payload shape") as error:
        worker._handle(
            "conn",
            {
                "kind": "catalog_match_suggestions_refresh",
                "sourceCatalogItemId": "00000000-0000-4000-8000-000000000201",
                "journalBody": "do-not-leak",
            },
        )

    assert "do-not-leak" not in str(error.value)


def test_worker_requires_a_uuid_catalog_match_source_id():
    with pytest.raises(ValueError, match="valid UUID"):
        worker._handle(
            "conn",
            {
                "kind": "catalog_match_suggestions_refresh",
                "sourceCatalogItemId": "not-a-uuid",
            },
        )


def test_worker_handles_journal_entry_index(monkeypatch):
    calls = []

    def fake_index(conn, journal_entry_id, owner_user_id):
        calls.append((conn, journal_entry_id, owner_user_id))

    monkeypatch.setattr(worker, "index_journal_entry", fake_index)

    worker._handle(
        "conn",
        {
            "kind": "journal_entry_index",
            "journalEntryId": "entry-id",
            "userId": "owner-id",
        },
    )

    assert calls == [("conn", "entry-id", "owner-id")]


def test_worker_handles_journal_entry_unindex(monkeypatch):
    calls = []

    def fake_unindex(conn, journal_entry_id, owner_user_id):
        calls.append((conn, journal_entry_id, owner_user_id))

    monkeypatch.setattr(worker, "unindex_journal_entry_for_owner", fake_unindex)

    worker._handle(
        "conn",
        {
            "kind": "journal_entry_unindex",
            "journalEntryId": "entry-id",
            "userId": "owner-id",
        },
    )

    assert calls == [("conn", "entry-id", "owner-id")]


def test_worker_fails_unknown_job_kind_without_echoing_payload():
    with pytest.raises(ValueError, match="unsupported job kind") as error:
        worker._handle(
            "conn",
            {
                "kind": "unknown",
                "journalEntryId": "entry-id",
                "secret": "do-not-leak",
            },
        )

    assert "do-not-leak" not in str(error.value)


def test_worker_requires_journal_payload_fields_without_echoing_values():
    with pytest.raises(ValueError, match="journalEntryId is required"):
        worker._handle(
            "conn",
            {
                "kind": "journal_entry_index",
                "journalEntryId": " ",
                "userId": "owner-id",
            },
        )

    with pytest.raises(ValueError, match="userId is required"):
        worker._handle(
            "conn",
            {
                "kind": "journal_entry_index",
                "journalEntryId": "entry-id",
                "userId": " ",
            },
        )

    with pytest.raises(ValueError, match="sourceCatalogItemId is required"):
        worker._handle(
            "conn",
            {
                "kind": "catalog_match_suggestions_refresh",
                "sourceCatalogItemId": " ",
            },
        )

    with pytest.raises(ValueError, match="userId is required"):
        worker._handle(
            "conn",
            {
                "kind": "journal_entry_unindex",
                "journalEntryId": "entry-id",
                "userId": " ",
            },
        )


def test_claim_sql_reclaims_stale_processing_jobs():
    assert "status = 'processing'" in worker.CLAIM_JOB_SQL
    assert "locked_at <= now()" in worker.CLAIM_JOB_SQL
    assert "for update skip locked" in worker.CLAIM_JOB_SQL.lower()
    assert "catalog_match_suggestions_refresh" in worker.CLAIM_JOB_SQL
    assert "catalog_fuzzy_duplicate_qa_refresh" in worker.CLAIM_JOB_SQL
    normalized_renewal = " ".join(worker.RENEW_CLAIM_LEASE_SQL.split()).lower()
    assert "set locked_at = now()" in normalized_renewal
    assert "status = 'processing'" in normalized_renewal
    assert "locked_by = %s" in normalized_renewal
    assert (
        worker.WORKER_HEARTBEAT_INTERVAL_SECONDS * 3
        <= worker.VISIBILITY_TIMEOUT_SECONDS
    )
    assert (
        worker.WORKER_HEARTBEAT_INTERVAL_SECONDS * 3
        <= worker.WORKER_HEARTBEAT_MAX_AGE_SECONDS
    )


def test_completion_updates_are_claim_scoped_and_preserve_requested_reruns():
    normalized_done = " ".join(worker.MARK_DONE_SQL.split()).lower()
    normalized_failed = " ".join(worker.MARK_FAILED_SQL.split()).lower()

    for statement in (normalized_done, normalized_failed):
        assert "status = 'processing'" in statement
        assert "locked_by = %s" in statement
        assert "rerun_requested" in statement
        assert "then 'pending'" in statement


def test_run_uses_autocommit_for_long_lived_connection(monkeypatch):
    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    calls = []
    threads = []

    class FakeThread:
        def __init__(self, **kwargs):
            threads.append(kwargs)

        def start(self):
            return None

        def join(self, *, timeout):
            assert timeout == worker.WORKER_HEARTBEAT_INTERVAL_SECONDS + 1

    def fake_connect(dsn, *, autocommit, row_factory, connect_timeout):
        calls.append(
            {
                "dsn": dsn,
                "autocommit": autocommit,
                "row_factory": row_factory,
                "connect_timeout": connect_timeout,
            },
        )
        return FakeConnection()

    monkeypatch.setenv("DIRECT_URL", "postgresql://example.invalid/app")
    monkeypatch.setenv("OVERGARDEN_MATCHING_COMMIT_SHA", "a" * 40)
    monkeypatch.setenv(
        "OVERGARDEN_MATCHING_IMAGE_DIGEST", f"sha256:{'b' * 64}"
    )
    monkeypatch.setenv(
        "OVERGARDEN_MATCHING_BUILD_TIMESTAMP", "2026-07-18T12:34:56Z"
    )
    monkeypatch.setenv(
        "OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY",
        "ove190.matching-schema.v1",
    )
    monkeypatch.setattr(worker.psycopg, "connect", fake_connect)
    monkeypatch.setattr(worker.threading, "Thread", FakeThread)
    monkeypatch.setattr(worker, "_claim", lambda conn: None)
    monkeypatch.setattr(
        worker.time, "sleep", lambda seconds: (_ for _ in ()).throw(KeyboardInterrupt)
    )

    with pytest.raises(KeyboardInterrupt):
        worker.run()

    assert calls[0]["autocommit"] is True
    assert calls[0]["connect_timeout"] == 5
    assert threads[0]["target"] is worker._heartbeat_loop
    assert threads[0]["daemon"] is True


def test_heartbeat_loop_renews_release_and_active_claim_lease(monkeypatch):
    calls = []
    heartbeats = []

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def execute(self, sql, params):
            calls.append({"sql": sql, "params": params})

    class FakeStop:
        def is_set(self):
            return False

        def wait(self, timeout):
            calls.append({"wait": timeout})
            return True

    def fake_connect(dsn, *, autocommit, row_factory, connect_timeout):
        calls.append(
            {
                "dsn": dsn,
                "autocommit": autocommit,
                "row_factory": row_factory,
                "connect_timeout": connect_timeout,
            }
        )
        return FakeConnection()

    monkeypatch.setattr(worker.psycopg, "connect", fake_connect)
    monkeypatch.setattr(
        worker,
        "record_worker_heartbeat",
        lambda conn, release: heartbeats.append((conn, release)),
    )
    runtime_release = worker.RuntimeRelease(
        commit_sha="a" * 40,
        image_digest=f"sha256:{'b' * 64}",
        build_timestamp="2026-07-18T12:34:56Z",
        schema_compatibility_class="ove190.matching-schema.v1",
        queue_name="matching",
    )
    active_claim = worker._ActiveClaimLease()
    active_claim.set("internal-job-id", "internal-claim-token")

    worker._heartbeat_loop(
        "postgresql://example.invalid/app",
        runtime_release,
        FakeStop(),  # type: ignore[arg-type]
        active_claim,
    )

    assert calls[0]["autocommit"] is True
    assert calls[0]["connect_timeout"] == 5
    assert calls[1] == {
        "sql": worker.RENEW_CLAIM_LEASE_SQL,
        "params": ("internal-job-id", "internal-claim-token"),
    }
    assert calls[2] == {"wait": worker.WORKER_HEARTBEAT_INTERVAL_SECONDS}
    assert len(heartbeats) == 1
    assert heartbeats[0][1] is runtime_release


def test_active_claim_lease_can_be_cleared() -> None:
    active_claim = worker._ActiveClaimLease()

    active_claim.set("internal-job-id", "internal-claim-token")
    assert active_claim.snapshot() == (
        "internal-job-id",
        "internal-claim-token",
    )

    active_claim.clear()
    assert active_claim.snapshot() is None


def test_stale_claim_token_cannot_renew_a_reclaimed_job() -> None:
    class FakeConnection:
        def __init__(self) -> None:
            self.locked_by = "new-claim-token"
            self.renewals = 0

        def execute(self, sql, params):
            assert sql == worker.RENEW_CLAIM_LEASE_SQL
            job_id, claim_token = params
            if job_id == "internal-job-id" and claim_token == self.locked_by:
                self.renewals += 1

    connection = FakeConnection()
    active_claim = worker._ActiveClaimLease()

    active_claim.set("internal-job-id", "old-claim-token")
    worker._renew_active_claim(connection, active_claim)  # type: ignore[arg-type]
    assert connection.renewals == 0

    active_claim.set("internal-job-id", "new-claim-token")
    worker._renew_active_claim(connection, active_claim)  # type: ignore[arg-type]
    assert connection.renewals == 1


def test_process_claimed_job_clears_lease_after_success(monkeypatch) -> None:
    active_claim = worker._ActiveClaimLease()
    events = []
    job = {
        "id": "internal-job-id",
        "claimToken": "internal-claim-token",
        "payload": {"kind": "catalog_typeahead_reindex"},
    }

    monkeypatch.setattr(
        worker,
        "_handle",
        lambda _conn, _payload: events.append(active_claim.snapshot()),
    )
    monkeypatch.setattr(
        worker,
        "_mark_done",
        lambda _conn, job_id, claim_token: events.append((job_id, claim_token)),
    )

    worker._process_claimed_job("conn", job, active_claim)  # type: ignore[arg-type]

    assert events == [
        ("internal-job-id", "internal-claim-token"),
        ("internal-job-id", "internal-claim-token"),
    ]
    assert active_claim.snapshot() is None


def test_process_claimed_job_clears_lease_after_failure(monkeypatch) -> None:
    active_claim = worker._ActiveClaimLease()
    failures = []
    job = {
        "id": "internal-job-id",
        "claimToken": "internal-claim-token",
        "payload": {"kind": "catalog_typeahead_reindex"},
    }

    def fail_handler(_conn, _payload):
        assert active_claim.snapshot() == (
            "internal-job-id",
            "internal-claim-token",
        )
        raise RuntimeError("private backend detail")

    monkeypatch.setattr(worker, "_handle", fail_handler)
    monkeypatch.setattr(
        worker,
        "_mark_failed",
        lambda _conn, job_id, claim_token, error: failures.append(
            (job_id, claim_token, "RuntimeError" in error)
        ),
    )

    worker._process_claimed_job("conn", job, active_claim)  # type: ignore[arg-type]

    assert failures == [
        ("internal-job-id", "internal-claim-token", True),
    ]
    assert active_claim.snapshot() is None
