import re
from datetime import date, datetime, timezone

from app.search import (
    catalog_typeahead_document_from_row,
    journal_entry_search_document_from_row,
)


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
    document = journal_entry_search_document_from_row(journal_row())

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

    forbidden_fields = {
        "ownerUserId",
        "userId",
        "email",
        "plantObjectId",
        "spaceId",
        "quarantineKey",
        "originalKey",
        "signedUrl",
        "publicGoneAt",
        "lifecycleState",
        "latitude",
        "longitude",
        "coordinates",
        "ip",
        "userAgent",
    }
    assert forbidden_fields.isdisjoint(document.keys())


def test_journal_entry_document_indexes_supported_region_only_when_visible():
    document = journal_entry_search_document_from_row(
        journal_row(location_visibility="region", coarse_region_code="UA-30")
    )

    assert document is not None
    assert document["locationVisibility"] == "region"
    assert document["coarseRegionCode"] == "UA-30"


def test_journal_entry_document_refuses_private_archived_or_gone_entries():
    assert (
        journal_entry_search_document_from_row(journal_row(visibility="private"))
        is None
    )
    assert (
        journal_entry_search_document_from_row(
            journal_row(lifecycle_state="archived")
        )
        is None
    )
    assert (
        journal_entry_search_document_from_row(
            journal_row(public_gone_at=datetime(2026, 6, 27, tzinfo=timezone.utc))
        )
        is None
    )


def test_journal_entry_document_refuses_unsafe_public_shape():
    assert journal_entry_search_document_from_row(journal_row(public_slug=None)) is None
    assert (
        journal_entry_search_document_from_row(
            journal_row(location_visibility="exact", coarse_region_code="UA-30")
        )
        is None
    )
    assert (
        journal_entry_search_document_from_row(
            journal_row(location_visibility="region", coarse_region_code="UA-99")
        )
        is None
    )
    assert (
        journal_entry_search_document_from_row(
            journal_row(location_visibility="region", coarse_region_code=None)
        )
        is None
    )


def test_catalog_typeahead_document_uses_meili_safe_id_for_cyrillic_alias():
    document = catalog_typeahead_document_from_row(
        {
            "catalog_item_id": "00000000-0000-4000-8000-000000000101",
            "canonical_name": "Помідор чері",
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
    assert document["normalizedName"] == "помідор чері"
    assert re.fullmatch(r"[A-Za-z0-9_-]+", str(document["id"]))
