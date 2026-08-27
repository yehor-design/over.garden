import pytest

from app import worker


def test_worker_handles_stable_registry_foundation_build(monkeypatch):
    calls = []
    monkeypatch.setattr(
        worker,
        "build_foundation_release",
        lambda conn, release_id: calls.append((conn, release_id)),
    )

    worker._handle(
        "conn",
        {
            "kind": "stable_registry_foundation_build",
            "releaseId": "00000000-0000-4000-8000-000000000255",
        },
    )

    assert calls == [("conn", "00000000-0000-4000-8000-000000000255")]


def test_worker_refuses_extra_stable_registry_foundation_payload_keys(monkeypatch):
    monkeypatch.setattr(worker, "build_foundation_release", lambda *_args: None)

    with pytest.raises(ValueError, match="unsupported payload shape") as error:
        worker._handle(
            "conn",
            {
                "kind": "stable_registry_foundation_build",
                "releaseId": "00000000-0000-4000-8000-000000000255",
                "rawPayload": "do-not-leak",
            },
        )

    assert "do-not-leak" not in str(error.value)


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


JOURNAL_ENTRY_ID = "9f9a1f0c-0f1a-4a2b-8c3d-4e5f60718293"
JOURNAL_OWNER_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9"


def test_worker_handles_journal_entry_index(monkeypatch):
    calls = []

    def fake_index(conn, journal_entry_id, owner_user_id):
        calls.append((conn, journal_entry_id, owner_user_id))

    monkeypatch.setattr(worker, "index_journal_entry", fake_index)

    worker._handle(
        "conn",
        {
            "kind": "journal_entry_index",
            "journalEntryId": JOURNAL_ENTRY_ID,
            "userId": JOURNAL_OWNER_ID,
        },
    )

    assert calls == [("conn", JOURNAL_ENTRY_ID, JOURNAL_OWNER_ID)]


def test_worker_handles_journal_entry_unindex(monkeypatch):
    calls = []

    def fake_unindex(conn, journal_entry_id, owner_user_id):
        calls.append((conn, journal_entry_id, owner_user_id))

    monkeypatch.setattr(worker, "unindex_journal_entry_for_owner", fake_unindex)

    worker._handle(
        "conn",
        {
            "kind": "journal_entry_unindex",
            "journalEntryId": JOURNAL_ENTRY_ID,
            "userId": JOURNAL_OWNER_ID,
        },
    )

    assert calls == [("conn", JOURNAL_ENTRY_ID, JOURNAL_OWNER_ID)]


@pytest.mark.parametrize(
    "job_kind",
    ["journal_entry_index", "journal_entry_unindex"],
)
@pytest.mark.parametrize(
    "extra_key",
    ["title", "body", "email", "mediaUrl", "latitude"],
)
def test_worker_refuses_extra_journal_payload_keys(monkeypatch, job_kind, extra_key):
    """OVE-225: an extra key is terminal and its value never reaches the error."""

    def unreachable(*args, **kwargs):
        raise AssertionError("handler must not run for a non-conforming payload")

    monkeypatch.setattr(worker, "index_journal_entry", unreachable)
    monkeypatch.setattr(worker, "unindex_journal_entry_for_owner", unreachable)

    with pytest.raises(ValueError, match="unsupported payload shape") as error:
        worker._handle(
            "conn",
            {
                "kind": job_kind,
                "journalEntryId": JOURNAL_ENTRY_ID,
                "userId": JOURNAL_OWNER_ID,
                extra_key: "do-not-leak",
            },
        )

    assert error.value.code == "invalid_payload"
    assert "do-not-leak" not in str(error.value)
    assert extra_key not in str(error.value)


@pytest.mark.parametrize(
    "job_kind",
    ["journal_entry_index", "journal_entry_unindex"],
)
def test_worker_refuses_wrong_typed_journal_identifiers(monkeypatch, job_kind):
    """OVE-225: a non-string or non-UUID identifier is terminal, never retried."""

    def unreachable(*args, **kwargs):
        raise AssertionError("handler must not run for a non-conforming payload")

    monkeypatch.setattr(worker, "index_journal_entry", unreachable)
    monkeypatch.setattr(worker, "unindex_journal_entry_for_owner", unreachable)

    with pytest.raises(ValueError, match="journalEntryId is required") as wrong_type:
        worker._handle(
            "conn",
            {
                "kind": job_kind,
                "journalEntryId": 42,
                "userId": JOURNAL_OWNER_ID,
            },
        )
    assert wrong_type.value.code == "invalid_payload"

    with pytest.raises(ValueError, match="must be a valid UUID") as non_uuid:
        worker._handle(
            "conn",
            {
                "kind": job_kind,
                "journalEntryId": "entry-id",
                "userId": JOURNAL_OWNER_ID,
            },
        )
    assert non_uuid.value.code == "invalid_payload"

    with pytest.raises(ValueError, match="unsupported payload shape"):
        worker._handle(
            "conn",
            {
                "kind": job_kind,
                "journalEntryId": JOURNAL_ENTRY_ID,
            },
        )


def test_worker_payload_shape_check_reads_the_shared_manifest():
    """INV-03/INV-06: one contract owner, consumed rather than restated."""
    from app.job_queue_manifest import (
        JOB_QUEUE_PAYLOAD_CONTRACTS,
        payload_contract_for_kind,
    )

    contract = payload_contract_for_kind("journal_entry_index")
    assert contract == JOB_QUEUE_PAYLOAD_CONTRACTS["matching:journal_entry_index"]
    assert contract["requiredKeys"] == ["kind", "journalEntryId", "userId"]
    assert payload_contract_for_kind("not_a_declared_kind") is None

    for entry in worker.SUPPORTED_JOB_KINDS:
        assert payload_contract_for_kind(entry) is not None


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
                "userId": JOURNAL_OWNER_ID,
            },
        )

    with pytest.raises(ValueError, match="userId is required"):
        worker._handle(
            "conn",
            {
                "kind": "journal_entry_index",
                "journalEntryId": JOURNAL_ENTRY_ID,
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
                "journalEntryId": JOURNAL_ENTRY_ID,
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
    monkeypatch.setenv("OVERGARDEN_MATCHING_IMAGE_DIGEST", f"sha256:{'b' * 64}")
    monkeypatch.setenv("OVERGARDEN_MATCHING_BUILD_TIMESTAMP", "2026-07-18T12:34:56Z")
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
        "attempts": 1,
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
        "attempts": 1,
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
        lambda _conn, job_id, claim_token, error_code, attempts: failures.append(
            (job_id, claim_token, error_code, attempts)
        ),
    )

    worker._process_claimed_job("conn", job, active_claim)  # type: ignore[arg-type]

    assert failures == [
        ("internal-job-id", "internal-claim-token", "transient_handler_error", 1),
    ]
    assert active_claim.snapshot() is None


def test_process_claimed_job_terminals_unsupported_without_handler(
    monkeypatch,
) -> None:
    active_claim = worker._ActiveClaimLease()
    dead = []
    job = {
        "id": "poison-job-id",
        "claimToken": "poison-claim-token",
        "attempts": 1,
        "payload": {"kind": "unknown_catalog_kind"},
    }

    monkeypatch.setattr(
        worker,
        "_handle",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("unsupported jobs must not invoke the handler")
        ),
    )
    monkeypatch.setattr(
        worker,
        "_mark_dead",
        lambda _conn, job_id, claim_token, code: dead.append(
            (job_id, claim_token, code)
        ),
    )

    worker._process_claimed_job("conn", job, active_claim)  # type: ignore[arg-type]

    assert dead == [("poison-job-id", "poison-claim-token", "unsupported_kind")]
    assert active_claim.snapshot() is None


def test_process_claimed_job_terminals_at_max_attempts(monkeypatch) -> None:
    active_claim = worker._ActiveClaimLease()
    dead = []
    job = {
        "id": "exhausted-job-id",
        "claimToken": "exhausted-claim-token",
        "attempts": 8,
        "payload": {"kind": "catalog_typeahead_reindex"},
    }

    monkeypatch.setattr(
        worker,
        "_handle",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("still down")),
    )
    monkeypatch.setattr(
        worker,
        "_mark_dead",
        lambda _conn, job_id, claim_token, code: dead.append(
            (job_id, claim_token, code)
        ),
    )
    monkeypatch.setattr(
        worker,
        "_mark_failed",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("max attempts must terminalize")
        ),
    )

    worker._process_claimed_job("conn", job, active_claim)  # type: ignore[arg-type]

    assert dead == [
        ("exhausted-job-id", "exhausted-claim-token", "max_attempts_exceeded")
    ]
    assert active_claim.snapshot() is None


def test_completion_updates_include_dead_letter_contract():
    normalized_dead = " ".join(worker.MARK_DEAD_SQL.split()).lower()
    assert "status = 'dead'" in normalized_dead
    assert "terminal_error_code = %s" in normalized_dead
    assert "status = 'processing'" in normalized_dead
    assert "locked_by = %s" in normalized_dead
    assert "dead" not in worker.CLAIM_JOB_SQL.split("status in")[1].split(")")[0]
