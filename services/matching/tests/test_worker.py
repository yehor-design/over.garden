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

    def fake_connect(dsn, *, autocommit, row_factory):
        calls.append(
            {
                "dsn": dsn,
                "autocommit": autocommit,
                "row_factory": row_factory,
            },
        )
        return FakeConnection()

    monkeypatch.setenv("DIRECT_URL", "postgresql://example.invalid/app")
    monkeypatch.setattr(worker.psycopg, "connect", fake_connect)
    monkeypatch.setattr(worker, "_claim", lambda conn: None)
    monkeypatch.setattr(
        worker.time, "sleep", lambda seconds: (_ for _ in ()).throw(KeyboardInterrupt)
    )

    with pytest.raises(KeyboardInterrupt):
        worker.run()

    assert calls[0]["autocommit"] is True
