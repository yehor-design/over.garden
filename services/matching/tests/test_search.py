import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

from app import search

CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts/search/public-journal-entry-search-document.json"
)
PUBLIC_JOURNAL_CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
PUBLIC_JOURNAL_REQUIRED_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["requiredFields"])
PUBLIC_JOURNAL_ALLOWED_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["allowedFields"])
PUBLIC_JOURNAL_FORBIDDEN_FIELDS = set(PUBLIC_JOURNAL_CONTRACT["forbiddenFields"])


def journal_row(**overrides):
    row = {
        "id": "00000000-0000-4000-8000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "public_slug": "first-flowers-abc123",
        "public_noindex": True,
        "public_gone_at": None,
        "entry_date": date(2026, 6, 25),
        "created_at": datetime(2026, 6, 26, 12, 30, tzinfo=timezone.utc),
        "visibility": "public",
        "lifecycle_state": "active",
        "location_visibility": "hidden",
        "coarse_region_code": None,
    }
    row.update(overrides)
    return row


def test_journal_entry_document_indexes_public_hidden_entry_with_safe_fields():
    document = search.journal_entry_search_document_from_row(journal_row())

    assert document == {
        "id": "00000000-0000-4000-8000-000000000001",
        "title": "First flowers",
        "body": "Помідори чері",
        "publicSlug": "first-flowers-abc123",
        "publicPath": "/journal/first-flowers-abc123",
        "locationVisibility": "hidden",
        "noindex": True,
        "entryDate": "2026-06-25T00:00:00.000Z",
        "createdAt": "2026-06-26T12:30:00.000Z",
        "kind": "journal_entry",
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
    assert search.JOURNAL_SEARCHABLE_ATTRIBUTES == PUBLIC_JOURNAL_CONTRACT[
        "searchableAttributes"
    ]
    assert search.JOURNAL_FILTERABLE_ATTRIBUTES == PUBLIC_JOURNAL_CONTRACT[
        "filterableAttributes"
    ]
    assert search.JOURNAL_SORTABLE_ATTRIBUTES == PUBLIC_JOURNAL_CONTRACT[
        "sortableAttributes"
    ]
    assert "coarseRegionCode" in PUBLIC_JOURNAL_ALLOWED_FIELDS
    assert "coarse_region_code" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "ownerUserId" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "quarantineKey" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "userAgent" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS
    assert "inviteToken" in PUBLIC_JOURNAL_FORBIDDEN_FIELDS


def test_journal_entry_document_indexes_supported_region_only_when_visible():
    document = search.journal_entry_search_document_from_row(
        journal_row(location_visibility="region", coarse_region_code="UA-30")
    )

    assert document is not None
    assert document["locationVisibility"] == "region"
    assert document["coarseRegionCode"] == "UA-30"
    assert set(document.keys()) == PUBLIC_JOURNAL_ALLOWED_FIELDS
    assert PUBLIC_JOURNAL_FORBIDDEN_FIELDS.isdisjoint(document.keys())


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


def test_journal_entry_document_refuses_unsafe_public_shape():
    assert search.journal_entry_search_document_from_row(journal_row(public_slug=None)) is None
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(location_visibility="exact", coarse_region_code="UA-30")
        )
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(location_visibility="region", coarse_region_code="UA-99")
        )
        is None
    )
    assert (
        search.journal_entry_search_document_from_row(
            journal_row(location_visibility="region", coarse_region_code=None)
        )
        is None
    )


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
