"""Meilisearch helpers + the Phase-7 Cyrillic typo-tolerance proof.

Meilisearch is the self-hosted derived search index (TECH_STACK §2.7). Cyrillic
typo tolerance works out of the box (the Charabia tokenizer is Unicode-aware).

PRIVACY BOUNDARY (do not violate): only public/curated catalog identity fields
and active public journal-entry derivatives may ever be indexed. Do not index
private journal text, owner IDs, precise location, media metadata, analytics
payloads, email, IP, or user agent.

Run the proof against a live Meilisearch:
    MEILISEARCH_HOST=http://localhost:7700 MEILISEARCH_API_KEY=... \
        python -m app.search
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from datetime import date, datetime
from typing import Any
from urllib.parse import quote

import meilisearch

TRACER_INDEX = "health_tracer"
CATALOG_TYPEAHEAD_INDEX = "catalog_typeahead"
JOURNAL_ENTRY_INDEX = "journal_entries"
CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex"
JOURNAL_ENTRY_INDEX_KIND = "journal_entry_index"
JOURNAL_ENTRY_UNINDEX_KIND = "journal_entry_unindex"
SELECTABLE_CATALOG_STATUSES = {"seeded", "confirmed"}
CATALOG_SEARCHABLE_ATTRIBUTES = ["displayName", "canonicalName", "normalizedName"]
CATALOG_FILTERABLE_ATTRIBUTES = ["status", "source", "locale", "itemLocale"]
CATALOG_SORTABLE_ATTRIBUTES = ["rank"]
JOURNAL_ENTRY_SEARCHABLE_ATTRIBUTES = ["title", "body"]
JOURNAL_ENTRY_FILTERABLE_ATTRIBUTES = [
    "kind",
    "locationVisibility",
    "coarseRegionCode",
    "noindex",
]
JOURNAL_ENTRY_SORTABLE_ATTRIBUTES = ["entryDate", "createdAt"]

CATALOG_TYPEAHEAD_ROWS_SQL = """
select
  catalog_items.id::text as catalog_item_id,
  catalog_items.canonical_name,
  catalog_items.normalized_name as item_normalized_name,
  catalog_items.status,
  catalog_items.source,
  catalog_items.created_by_user_id::text as created_by_user_id,
  catalog_items.locale as item_locale,
  catalog_item_names.display_name,
  catalog_item_names.normalized_name as alias_normalized_name,
  catalog_item_names.locale as alias_locale,
  catalog_item_names.is_primary
from catalog_item_names
inner join catalog_items
  on catalog_items.id = catalog_item_names.catalog_item_id
where catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
order by catalog_item_names.is_primary desc, catalog_item_names.display_name asc
"""

JOURNAL_ENTRY_ROW_SQL = """
select
  journal_entries.id::text as id,
  journal_entries.title,
  journal_entries.body,
  journal_entries.public_slug,
  journal_entries.public_noindex,
  journal_entries.public_gone_at,
  journal_entries.entry_date,
  journal_entries.created_at,
  journal_entries.visibility,
  journal_entries.lifecycle_state,
  plant_objects.location_visibility,
  plant_objects.coarse_region_code
from journal_entries
inner join plant_objects
  on plant_objects.id = journal_entries.plant_object_id
 and plant_objects.owner_user_id = journal_entries.owner_user_id
where journal_entries.id = %s
limit 1
"""


def client() -> meilisearch.Client:
    host = os.environ.get("MEILISEARCH_HOST", "http://localhost:7700")
    api_key = os.environ.get("MEILISEARCH_API_KEY")
    return meilisearch.Client(host, api_key)


def catalog_typeahead_document_from_row(
    row: Mapping[str, Any],
) -> dict[str, object] | None:
    """Convert one Postgres catalog row into the safe Meili document shape."""
    status = _text(row, "status")
    if status not in SELECTABLE_CATALOG_STATUSES:
        return None
    if row.get("created_by_user_id") is not None:
        return None

    catalog_item_id = _text(row, "catalog_item_id", "id")
    display_name = _text(row, "display_name")
    canonical_name = _text(row, "canonical_name")
    alias_locale = _text(row, "alias_locale", fallback="und")
    item_locale = _text(row, "item_locale", fallback=alias_locale)
    normalized_name = _normalized_name(row)
    source = _text(row, "source", fallback="internal_seed")

    if (
        not catalog_item_id
        or not display_name
        or not canonical_name
        or not normalized_name
    ):
        return None

    is_primary = bool(row.get("is_primary"))

    return {
        "id": _catalog_typeahead_document_id(
            catalog_item_id,
            alias_locale,
            normalized_name,
        ),
        "catalogItemId": catalog_item_id,
        "displayName": display_name,
        "canonicalName": canonical_name,
        "normalizedName": normalized_name,
        "locale": alias_locale,
        "itemLocale": item_locale,
        "status": status,
        "source": source,
        "isPrimary": is_primary,
        "rank": 0 if is_primary else 10,
        "kind": "catalog_item",
    }


def catalog_typeahead_documents_from_rows(
    rows: Iterable[Mapping[str, Any]],
) -> list[dict[str, object]]:
    documents: list[dict[str, object]] = []

    for row in rows:
        document = catalog_typeahead_document_from_row(row)
        if document is not None:
            documents.append(document)

    return documents


def fetch_catalog_typeahead_rows(conn: Any) -> list[Mapping[str, Any]]:
    return list(conn.execute(CATALOG_TYPEAHEAD_ROWS_SQL).fetchall())


def journal_entry_search_document_from_row(
    row: Mapping[str, Any],
) -> dict[str, object] | None:
    if _text(row, "visibility") != "public":
        return None
    if _text(row, "lifecycle_state") != "active":
        return None
    if row.get("public_gone_at") is not None:
        return None

    journal_entry_id = _text(row, "id")
    title = _text(row, "title")
    body = _text(row, "body")
    public_slug = _text(row, "public_slug")
    location_visibility = _text(row, "location_visibility")
    if location_visibility not in {"region", "hidden"}:
        return None
    if not journal_entry_id or not title or not body or not public_slug:
        return None

    document: dict[str, object] = {
        "id": journal_entry_id,
        "title": title,
        "body": body,
        "publicSlug": public_slug,
        "publicPath": f"/journal/{public_slug}",
        "locationVisibility": location_visibility,
        "noindex": bool(row.get("public_noindex")),
        "entryDate": _date_text(row.get("entry_date")),
        "createdAt": _date_text(row.get("created_at")),
        "kind": "journal_entry",
    }

    if location_visibility == "region":
        coarse_region_code = _supported_coarse_region_code(
            _text(row, "coarse_region_code"),
        )
        if coarse_region_code is None:
            return None
        document["coarseRegionCode"] = coarse_region_code

    return document


def fetch_journal_entry_search_row(
    conn: Any,
    journal_entry_id: str,
) -> Mapping[str, Any] | None:
    return conn.execute(JOURNAL_ENTRY_ROW_SQL, (journal_entry_id,)).fetchone()


def index_public_journal_entry(
    conn: Any,
    journal_entry_id: str,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    c = meili_client or client()
    row = fetch_journal_entry_search_row(conn, journal_entry_id)
    document = journal_entry_search_document_from_row(row) if row else None
    if document is None:
        return _delete_public_journal_entry_document(c, journal_entry_id)

    index = c.index(JOURNAL_ENTRY_INDEX)
    _ensure_journal_entry_settings(c, index)
    task = index.add_documents([document], primary_key="id")
    c.wait_for_task(task.task_uid)
    return {"indexed": 1, "task_uid": task.task_uid}


def unindex_public_journal_entry(
    journal_entry_id: str,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    c = meili_client or client()
    return _delete_public_journal_entry_document(c, journal_entry_id)


def reindex_catalog_typeahead(
    conn: Any,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    """Rebuild the derived catalog typeahead index from Postgres source rows."""
    rows = fetch_catalog_typeahead_rows(conn)
    documents = catalog_typeahead_documents_from_rows(rows)
    c = meili_client or client()
    index = c.index(CATALOG_TYPEAHEAD_INDEX)

    _ensure_catalog_typeahead_settings(c, index)

    delete_task = index.delete_all_documents()
    c.wait_for_task(delete_task.task_uid)

    if not documents:
        return {"indexed": 0, "task_uid": None}

    add_task = index.add_documents(documents, primary_key="id")
    c.wait_for_task(add_task.task_uid)
    return {"indexed": len(documents), "task_uid": add_task.task_uid}


def prove_cyrillic_typo_tolerance() -> dict[str, object]:
    """Index a Cyrillic doc, search WITH a typo, assert a tolerant match.

    Returns the matched hit. Raises AssertionError if typo tolerance fails.
    This is the Phase-7 cross-runtime proof (requires a running Meilisearch).
    """
    c = client()
    index = c.index(TRACER_INDEX)

    task = index.add_documents(
        [
            {
                "id": 1,
                "name": "Помідори чері органічні",
            },  # uk: organic cherry tomatoes
            {"id": 2, "name": "Огірки свіжі"},  # uk: fresh cucumbers
        ],
        primary_key="id",
    )
    c.wait_for_task(task.task_uid)

    # Deliberate typo: 'помдори' (missing і) instead of 'помідори'.
    result = index.search("помдори")
    hits = result["hits"]
    assert hits and hits[0]["id"] == 1, f"typo tolerance failed: {result}"
    return hits[0]


def prove_catalog_cyrillic_typeahead() -> dict[str, object]:
    """Index seeded catalog docs and assert Cyrillic typo tolerance for typeahead."""
    c = client()
    index = c.index(CATALOG_TYPEAHEAD_INDEX)
    _ensure_catalog_typeahead_settings(c, index)

    documents = catalog_typeahead_documents_from_rows(
        [
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
            },
            {
                "catalog_item_id": "00000000-0000-4000-8000-000000000102",
                "canonical_name": "Огірок Ніжинський",
                "status": "seeded",
                "source": "internal_seed",
                "created_by_user_id": None,
                "item_locale": "uk",
                "display_name": "Огірок Ніжинський",
                "alias_normalized_name": "огірок ніжинський",
                "alias_locale": "uk",
                "is_primary": True,
            },
        ],
    )

    task = index.add_documents(documents, primary_key="id")
    c.wait_for_task(task.task_uid)

    result = index.search("помдор", {"limit": 3})
    hits = result["hits"]
    assert hits, f"catalog Cyrillic typeahead failed: {result}"
    assert (
        hits[0]["catalogItemId"] == "00000000-0000-4000-8000-000000000101"
    ), f"catalog Cyrillic typeahead failed: {result}"
    return hits[0]


def _ensure_catalog_typeahead_settings(
    c: meilisearch.Client,
    index: Any,
) -> None:
    for task in [
        index.update_searchable_attributes(CATALOG_SEARCHABLE_ATTRIBUTES),
        index.update_filterable_attributes(CATALOG_FILTERABLE_ATTRIBUTES),
        index.update_sortable_attributes(CATALOG_SORTABLE_ATTRIBUTES),
    ]:
        c.wait_for_task(task.task_uid)


def _ensure_journal_entry_settings(
    c: meilisearch.Client,
    index: Any,
) -> None:
    for task in [
        index.update_searchable_attributes(JOURNAL_ENTRY_SEARCHABLE_ATTRIBUTES),
        index.update_filterable_attributes(JOURNAL_ENTRY_FILTERABLE_ATTRIBUTES),
        index.update_sortable_attributes(JOURNAL_ENTRY_SORTABLE_ATTRIBUTES),
    ]:
        c.wait_for_task(task.task_uid)


def _delete_public_journal_entry_document(
    c: meilisearch.Client,
    journal_entry_id: str,
) -> dict[str, object]:
    index = c.index(JOURNAL_ENTRY_INDEX)
    _ensure_journal_entry_settings(c, index)
    task = index.delete_document(journal_entry_id)
    c.wait_for_task(task.task_uid)
    return {"deleted": 1, "task_uid": task.task_uid}


def _text(
    row: Mapping[str, Any],
    key: str,
    *aliases: str,
    fallback: str = "",
) -> str:
    for candidate in (key, *aliases):
        value = row.get(candidate)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _normalized_name(row: Mapping[str, Any]) -> str:
    normalized = _text(row, "alias_normalized_name", "normalized_name")
    if normalized:
        return " ".join(normalized.lower().split())
    return " ".join(_text(row, "display_name").lower().split())


def _catalog_typeahead_document_id(
    catalog_item_id: str,
    locale: str,
    normalized_name: str,
) -> str:
    encoded_locale = quote(locale, safe="")
    encoded_name = quote(normalized_name, safe="")
    return f"{catalog_item_id}:{encoded_locale}:{encoded_name}"


def _date_text(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if value is None:
        return ""
    return str(value)


def _supported_coarse_region_code(value: str) -> str | None:
    if len(value) != 5:
        return None
    prefix, separator, suffix = value[:2], value[2], value[3:]
    if prefix not in {"UA", "BG"} or separator != "-" or not suffix.isdigit():
        return None
    return value


if __name__ == "__main__":
    hit = prove_cyrillic_typo_tolerance()
    print("Cyrillic typo-tolerant match:", hit["name"])
    catalog_hit = prove_catalog_cyrillic_typeahead()
    print("Catalog typo-tolerant match:", catalog_hit["displayName"])
