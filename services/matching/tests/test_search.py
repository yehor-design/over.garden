import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import search

CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts/search/public-journal-entry-search-document.json"
)
PUBLIC_JOURNAL_CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
PUBLIC_JOURNAL_REQUIRED_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["requiredFields"])
PUBLIC_JOURNAL_ALLOWED_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["allowedFields"])
PUBLIC_JOURNAL_FORBIDDEN_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["forbiddenFields"])


def test_meilisearch_task_wait_is_production_bounded() -> None:
    calls = []

    class FakeClient:
        def wait_for_task(self, task_uid, *, timeout_in_ms, interval_in_ms):
            calls.append((task_uid, timeout_in_ms, interval_in_ms))
            return SimpleNamespace(status="succeeded")

    result = search._wait_for_task(FakeClient(), 123)  # type: ignore[arg-type]

    assert result.status == "succeeded"
    assert calls == [
        (
            123,
            search.MEILISEARCH_TASK_TIMEOUT_MS,
            search.MEILISEARCH_TASK_POLL_INTERVAL_MS,
        )
    ]


def test_meilisearch_task_wait_rejects_failed_task_without_error_details() -> None:
    class FakeClient:
        def wait_for_task(self, *_args, **_kwargs):
            return {"status": "failed", "error": "private backend detail"}

    with pytest.raises(RuntimeError, match="succeeded class") as error:
        search._wait_for_task(FakeClient(), 123)  # type: ignore[arg-type]

    assert "private backend detail" not in str(error.value)


def test_meilisearch_client_has_a_bounded_http_timeout(monkeypatch) -> None:
    calls = []

    def fake_client(host, api_key, *, timeout):
        calls.append((host, api_key, timeout))
        return object()

    monkeypatch.setenv("MEILISEARCH_HOST", "http://example.invalid")
    monkeypatch.setenv("MEILISEARCH_API_KEY", "private-key")
    monkeypatch.setattr(search.meilisearch, "Client", fake_client)

    search.client()

    assert calls == [
        (
            "http://example.invalid",
            "private-key",
            search.MEILISEARCH_HTTP_TIMEOUT_SECONDS,
        )
    ]


def journal_row(**overrides):
    row = {
        "id": "00000000-0000-4000-8000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "public_slug": "first-flowers-abc123",
        "public_gone_at": None,
        "published_at": datetime(2026, 6, 26, 12, 0, tzinfo=timezone.utc),
        "entry_date": date(2026, 6, 25),
        "entry_scope": "object",
        "created_at": datetime(2026, 6, 26, 12, 30, tzinfo=timezone.utc),
        "visibility": "public",
        "lifecycle_state": "active",
        "location_visibility": "hidden",
        "coarse_region_code": None,
        "owner_profile_public_safe": True,
        "cover_media_asset_id": None,
        "cover_media_id": None,
        "cover_usage_role": None,
        "cover_derivative_key": None,
        "cover_revoked_at": None,
    }
    row.update(overrides)
    return row


def test_journal_entry_document_indexes_public_entry_with_safe_fields():
    document = search.journal_entry_search_document_from_row(journal_row())

    assert document == {
        "id": "00000000-0000-4000-8000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "publicSlug": "first-flowers-abc123",
        "publicPath": "/journal/first-flowers-abc123",
        "locationVisibility": "hidden",
        "noindex": False,
        "entryDate": "2026-06-25T00:00:00.000Z",
        "entryScope": "object",
        "createdAt": "2026-06-26T12:30:00.000Z",
        "kind": "journal_entry",
        "coverSource": "none",
        "qualityClass": "verified",
        "qualityReasons": [],
    }

    assert set(document.keys()) == PUBLIC_JOURNAL_REQUIRED_FIELDS
    assert PUBLIC_JOURNAL_FORBIDDEN_FIELDS.isdisjoint(document.keys())


def test_public_journal_entry_document_contract_matches_runtime_settings():
    assert PUBLIC_JOURNAL_CONTRACT["runtimeWriter"] == (
        "services/matching/app/search.py:journal_entry_search_document_from_row"
    )
    assert PUBLIC_JOURNAL_CONTRACT["typescriptContractFixture"] == (
        "apps/web/src/server/search/documents.ts:"
        "buildJournalEntrySearchDocumentContractFixture"
    )
    assert PUBLIC_JOURNAL_ALLOWED_FIELDS == (
        PUBLIC_JOURNAL_REQUIRED_FIELDS | set(PUBLIC_JOURNAL_CONTRACT["optionalFields"])
    )
    assert (
        search.JOURNAL_SEARCHABLE_ATTRIBUTES
        == PUBLIC_JOURNAL_CONTRACT["searchableAttributes"]
    )
    assert (
        search.JOURNAL_FILTERABLE_ATTRIBUTES
        == PUBLIC_JOURNAL_CONTRACT["filterableAttributes"]
    )
    assert (
        search.JOURNAL_SORTABLE_ATTRIBUTES
        == PUBLIC_JOURNAL_CONTRACT["sortableAttributes"]
    )
    assert "coarseRegionCode" in PUBLIC_JOURNAL_ALLOWED_FIELDS
    assert "coverSource" in PUBLIC_JOURNAL_REQUIRED_FIELDS
    assert "coverPublicUrl" in PUBLIC_JOURNAL_ALLOWED_FIELDS
    assert "qualityClass" in PUBLIC_JOURNAL_REQUIRED_FIELDS
    assert "qualityReasons" in PUBLIC_JOURNAL_REQUIRED_FIELDS
    assert PUBLIC_JOURNAL_CONTRACT["qualityContract"] == {
        "version": "ove331.qualityClass.v1",
        "classes": ["verified", "partial", "unverified"],
        "reasonCodes": [
            "coarse_region_unavailable",
            "media_projection_unresolved",
            "analytics_delivery_unavailable",
        ],
        "searchReasonCodes": [
            "coarse_region_unavailable",
            "media_projection_unresolved",
        ],
    }
    assert "coverMediaAssetId" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "coarse_region_code" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "ownerUserId" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "quarantineKey" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "userAgent" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "inviteToken" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS


def test_journal_entry_document_indexes_supported_region_only_when_visible(monkeypatch):
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://media.example")
    document = search.journal_entry_search_document_from_row(
        journal_row(location_visibility="region", coarse_region_code="UA-30")
    )

    assert document is not None
    assert document["locationVisibility"] == "region"
    assert document["coarseRegionCode"] == "UA-30"
    assert document["coverSource"] == "none"
    assert document["qualityClass"] == "verified"
    assert document["qualityReasons"] == []
    assert set(document.keys()) == (
        PUBLIC_JOURNAL_REQUIRED_FIELDS | {"coarseRegionCode"}
    )
    assert PUBLIC_JOURNAL_FORBIDDEN_FIELDS.isdisjoint(document.keys())


def test_journal_entry_document_indexes_effective_cover_without_media_ids(monkeypatch):
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://media.example")
    document = search.journal_entry_search_document_from_row(
        journal_row(
            cover_media_asset_id="00000000-0000-4000-8000-000000000099",
            cover_media_id="00000000-0000-4000-8000-000000000099",
            cover_usage_role="cover_only",
            cover_derivative_key="derivatives/cover.webp",
        )
    )

    assert document is not None
    assert document["coverSource"] == "separate"
    assert document["coverPublicUrl"] == "https://media.example/derivatives/cover.webp"
    assert "mediaAssetId" not in document
    assert "coverMediaAssetId" not in document
    assert "derivativeKey" not in document
    assert document["qualityClass"] == "verified"
    assert document["qualityReasons"] == []


def test_journal_entry_document_refuses_revoked_cover_as_partial(
    monkeypatch,
):
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://media.example")
    document = search.journal_entry_search_document_from_row(
        journal_row(
            cover_media_asset_id="00000000-0000-4000-8000-000000000099",
            cover_media_id="00000000-0000-4000-8000-000000000099",
            cover_usage_role="cover_only",
            cover_derivative_key="derivatives/cover.webp",
            cover_revoked_at=datetime(2026, 6, 26, tzinfo=timezone.utc),
        )
    )

    assert document is not None
    assert document["coverSource"] == "none"
    assert "coverPublicUrl" not in document
    assert document["qualityClass"] == "partial"
    assert document["qualityReasons"] == ["media_projection_unresolved"]


def test_journal_entry_document_refuses_private_archived_or_gone_entries():
    assert (
        search.journal_entry_search_document_from_row(journal_row(visibility="private"))
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(lifecycle_state="archived")
        )
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(public_gone_at=datetime(2026, 6, 27, tzinfo=timezone.utc))
        )
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(journal_row(published_at=None))
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(owner_profile_public_safe=False)
        )
        is None
    )


def test_journal_entry_document_refuses_unsafe_public_shape():
    assert (
        search.journal_entry_search_document_from_row(journal_row(public_slug=None))
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(location_visibility="exact", coarse_region_code="UA-30")
        )
        is None
    )
    for coarse_region_code in ["UA-99", None]:
        document = search.journal_entry_search_document_from_row(
            journal_row(
                location_visibility="region",
                coarse_region_code=coarse_region_code,
            )
        )
        assert document is not None
        assert document["locationVisibility"] == "hidden"
        assert document["qualityClass"] == "partial"
        assert document["qualityReasons"] == ["coarse_region_unavailable"]
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(entry_scope="raw-body-tag")
        )
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(journal_row(id="not-a-uuid"))
        is None
    )


def test_journal_entry_document_indexes_space_entry_with_bounded_scope():
    document = search.journal_entry_search_document_from_row(
        journal_row(entry_scope="space")
    )

    assert document is not None
    assert document["entryScope"] == "space"
    assert document["coverSource"] == "none"
    assert "plantObjectId" not in document
    assert "spaceId" not in document


def test_catalog_typeahead_document_uses_meili_safe_id_for_cyrillic_alias():
    document = search.catalog_typeahead_document_from_row(
        {
            "catalog_item_id": "00000000-0000-4000-8000-000000000101",
            "canonical_name": "Помідор чері",
            "catalog_kind": "plant_variety",
            "status": "seeded",
            "source": "internal_seed",
            "created_by_user_id": None,
            "item_locale": "uk",
            "display_name": "Помідор чері",
            "alias_normalized_name": "помідор чері",
            "alias_locale": "uk",
            "is_primary": True,
        }
    )

    assert document is not None
    assert document["catalogItemId"] == "00000000-0000-4000-8000-000000000101"
    assert document["displayName"] == "Помідор чері"
    assert document["catalogKind"] == "plant_variety"
    assert document["normalizedName"] == "помідор чері"
    assert re.fullmatch(r"[A-Za-z0-9_-]+", str(document["id"]))


def test_catalog_typeahead_document_carries_exactly_the_selectable_shape():
    document = search.catalog_typeahead_document_from_row(
        {
            "catalog_item_id": "00000000-0000-4000-8000-000000257010",
            "canonical_name": "Sadovo 1",
            "catalog_kind": "plant_variety",
            "status": "seeded",
            "source": "internal_seed",
            "created_by_user_id": None,
            "item_locale": "bg",
            "display_name": "Sadovo 1",
            "alias_normalized_name": "sadovo 1",
            "alias_locale": "bg",
            "is_primary": True,
        }
    )

    assert document is not None
    # The producer and the web parser describe one document. A field that only
    # one of them knows about is drift, so the key set is pinned exactly.
    assert set(document) == {
        "id",
        "catalogItemId",
        "displayName",
        "canonicalName",
        "catalogKind",
        "normalizedName",
        "locale",
        "itemLocale",
        "status",
        "source",
        "isPrimary",
        "rank",
        "kind",
    }
