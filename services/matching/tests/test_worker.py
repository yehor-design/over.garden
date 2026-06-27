from __future__ import annotations

import pytest

from app.worker import _handle


def test_worker_routes_journal_entry_index_job(monkeypatch):
    conn = object()
    calls = []

    def fake_index_public_journal_entry(received_conn, journal_entry_id):
        calls.append((received_conn, journal_entry_id))

    monkeypatch.setattr(
        "app.worker.index_public_journal_entry",
        fake_index_public_journal_entry,
    )

    _handle(
        conn=conn,
        payload={
            "kind": "journal_entry_index",
            "journalEntryId": "00000000-0000-0000-0000-000000000001",
        },
    )

    assert calls == [
        (conn, "00000000-0000-0000-0000-000000000001"),
    ]


def test_worker_routes_journal_entry_unindex_job(monkeypatch):
    calls = []

    def fake_unindex_public_journal_entry(journal_entry_id):
        calls.append(journal_entry_id)

    monkeypatch.setattr(
        "app.worker.unindex_public_journal_entry",
        fake_unindex_public_journal_entry,
    )

    _handle(
        conn=object(),
        payload={
            "kind": "journal_entry_unindex",
            "journalEntryId": "00000000-0000-0000-0000-000000000001",
        },
    )

    assert calls == ["00000000-0000-0000-0000-000000000001"]


def test_worker_rejects_journal_job_without_entry_id():
    with pytest.raises(ValueError, match="Missing required job payload field"):
        _handle(conn=object(), payload={"kind": "journal_entry_index"})


def test_worker_rejects_unknown_job_kind():
    with pytest.raises(ValueError, match="Unsupported job kind"):
        _handle(conn=object(), payload={"kind": "unknown_job_kind"})
