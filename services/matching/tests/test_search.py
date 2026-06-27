from __future__ import annotations

from app.search import (
    JOURNAL_ENTRY_INDEX,
    index_public_journal_entry,
    journal_entry_search_document_from_row,
    unindex_public_journal_entry,
)


def public_journal_row(**overrides):
    row = {
        "id": "00000000-0000-0000-0000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "public_slug": "first-flowers-abc123",
        "public_noindex": True,
        "public_gone_at": None,
        "entry_date": "2026-06-25",
        "created_at": "2026-06-26T00:00:00+00:00",
        "visibility": "public",
        "lifecycle_state": "active",
        "location_visibility": "hidden",
        "coarse_region_code": None,
        "owner_user_id": "must-not-leak",
        "quarantine_key": "must-not-leak",
        "email": "must-not-leak",
        "user_agent": "must-not-leak",
    }
    row.update(overrides)
    return row


class FakeResult:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class FakeConn:
    def __init__(self, row):
        self.row = row
        self.calls = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return FakeResult(self.row)


class FakeTask:
    task_uid = 123


class FakeIndex:
    def __init__(self):
        self.added = []
        self.deleted = []
        self.settings = []

    def update_searchable_attributes(self, attributes):
        self.settings.append(("searchable", attributes))
        return FakeTask()

    def update_filterable_attributes(self, attributes):
        self.settings.append(("filterable", attributes))
        return FakeTask()

    def update_sortable_attributes(self, attributes):
        self.settings.append(("sortable", attributes))
        return FakeTask()

    def add_documents(self, documents, primary_key=None):
        self.added.append((documents, primary_key))
        return FakeTask()

    def delete_document(self, document_id):
        self.deleted.append(document_id)
        return FakeTask()


class FakeMeili:
    def __init__(self):
        self.indexes = {}
        self.waited = []

    def index(self, name):
        self.indexes.setdefault(name, FakeIndex())
        return self.indexes[name]

    def wait_for_task(self, task_uid):
        self.waited.append(task_uid)


def test_journal_entry_document_contains_public_safe_fields_only():
    document = journal_entry_search_document_from_row(public_journal_row())

    assert document == {
        "id": "00000000-0000-0000-0000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "publicSlug": "first-flowers-abc123",
        "publicPath": "/journal/first-flowers-abc123",
        "locationVisibility": "hidden",
        "noindex": True,
        "entryDate": "2026-06-25",
        "createdAt": "2026-06-26T00:00:00+00:00",
        "kind": "journal_entry",
    }
    forbidden_keys = {
        "ownerUserId",
        "owner_user_id",
        "quarantineKey",
        "quarantine_key",
        "email",
        "ip",
        "userAgent",
        "user_agent",
        "referrer",
    }
    assert forbidden_keys.isdisjoint(document.keys())


def test_journal_entry_document_rejects_non_public_rows():
    assert journal_entry_search_document_from_row(
        public_journal_row(visibility="private")
    ) is None
    assert journal_entry_search_document_from_row(
        public_journal_row(lifecycle_state="archived")
    ) is None
    assert journal_entry_search_document_from_row(
        public_journal_row(public_gone_at="2026-06-26T00:00:00+00:00")
    ) is None
    assert journal_entry_search_document_from_row(
        public_journal_row(public_slug=None)
    ) is None
    assert journal_entry_search_document_from_row(
        public_journal_row(location_visibility="exact")
    ) is None


def test_index_public_journal_entry_fetches_public_row_and_indexes_safe_document():
    conn = FakeConn(public_journal_row())
    meili = FakeMeili()

    result = index_public_journal_entry(
        conn,
        "00000000-0000-0000-0000-000000000001",
        meili_client=meili,
    )

    assert result == {"indexed": 1, "task_uid": 123}
    sql, params = conn.calls[0]
    assert params == ("00000000-0000-0000-0000-000000000001",)
    assert "owner_user_id as" not in sql
    assert "journal_entries.owner_user_id" in sql
    assert "media_assets" not in sql
    assert meili.indexes[JOURNAL_ENTRY_INDEX].added == [
        (
            [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "title": "First flowers",
                    "body": "Помідори чері",
                    "publicSlug": "first-flowers-abc123",
                    "publicPath": "/journal/first-flowers-abc123",
                    "locationVisibility": "hidden",
                    "noindex": True,
                    "entryDate": "2026-06-25",
                    "createdAt": "2026-06-26T00:00:00+00:00",
                    "kind": "journal_entry",
                }
            ],
            "id",
        )
    ]
    assert meili.waited[-1] == 123


def test_index_public_journal_entry_unindexes_when_source_row_is_not_indexable():
    conn = FakeConn(public_journal_row(lifecycle_state="archived"))
    meili = FakeMeili()

    result = index_public_journal_entry(
        conn,
        "00000000-0000-0000-0000-000000000001",
        meili_client=meili,
    )

    assert result == {"deleted": 1, "task_uid": 123}
    assert meili.indexes[JOURNAL_ENTRY_INDEX].added == []
    assert meili.indexes[JOURNAL_ENTRY_INDEX].deleted == [
        "00000000-0000-0000-0000-000000000001"
    ]


def test_unindex_public_journal_entry_deletes_document_by_entry_id():
    meili = FakeMeili()

    result = unindex_public_journal_entry(
        "00000000-0000-0000-0000-000000000001",
        meili_client=meili,
    )

    assert result == {"deleted": 1, "task_uid": 123}
    assert meili.indexes[JOURNAL_ENTRY_INDEX].deleted == [
        "00000000-0000-0000-0000-000000000001"
    ]
