"""Meilisearch helpers + the Phase-7 Cyrillic typo-tolerance proof.

Meilisearch is the self-hosted derived search index (TECH_STACK §2.7). Cyrillic
typo tolerance works out of the box (the Charabia tokenizer is Unicode-aware).

PRIVACY BOUNDARY (do not violate): only public/curated catalog identity fields
may ever be indexed for typeahead. Do not index private journal text, owner IDs,
precise location, media metadata, analytics payloads, email, IP, or user agent.

Run the proof against a live Meilisearch:
    MEILISEARCH_HOST=http://localhost:7700 MEILISEARCH_API_KEY=... \
        python -m app.search
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import date, datetime, timezone
from collections.abc import Iterable, Mapping
from typing import Any
from uuid import UUID

import meilisearch


TRACER_INDEX = "health_tracer"
CATALOG_TYPEAHEAD_INDEX = "catalog_typeahead"
PUBLIC_JOURNAL_ENTRIES_INDEX = "journal_entries"
MEILISEARCH_TASK_TIMEOUT_MS = 120_000
MEILISEARCH_TASK_POLL_INTERVAL_MS = 250
MEILISEARCH_HTTP_TIMEOUT_SECONDS = 10
SELECTABLE_CATALOG_STATUSES = {"seeded", "confirmed"}
CATALOG_SEARCHABLE_ATTRIBUTES = ["displayName", "canonicalName", "normalizedName"]
CATALOG_FILTERABLE_ATTRIBUTES = ["status", "source", "locale", "itemLocale"]
CATALOG_SORTABLE_ATTRIBUTES = ["rank"]
JOURNAL_SEARCHABLE_ATTRIBUTES = ["title", "body", "publicSlug"]
JOURNAL_FILTERABLE_ATTRIBUTES = [
    "entryScope",
    "kind",
    "locationVisibility",
    "coarseRegionCode",
    "noindex",
    "coverSource",
    "qualityClass",
]
JOURNAL_SORTABLE_ATTRIBUTES = ["entryDate", "createdAt"]
JOURNAL_COVER_SOURCES = {
    "automatic_inline",
    "explicit_inline",
    "separate",
    "none",
}
JOURNAL_PROJECTION_QUALITY_REASON_ORDER = [
    "coarse_region_unavailable",
    "media_projection_unresolved",
]
JOURNAL_ENTRY_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
SUPPORTED_COARSE_REGION_CODES = {
    "UA-05",
    "UA-07",
    "UA-09",
    "UA-12",
    "UA-14",
    "UA-18",
    "UA-21",
    "UA-23",
    "UA-26",
    "UA-30",
    "UA-32",
    "UA-35",
    "UA-40",
    "UA-43",
    "UA-46",
    "UA-48",
    "UA-51",
    "UA-53",
    "UA-56",
    "UA-59",
    "UA-61",
    "UA-63",
    "UA-65",
    "UA-68",
    "UA-71",
    "UA-74",
    "UA-77",
    "BG-01",
    "BG-02",
    "BG-03",
    "BG-04",
    "BG-05",
    "BG-06",
    "BG-07",
    "BG-08",
    "BG-09",
    "BG-10",
    "BG-11",
    "BG-12",
    "BG-13",
    "BG-14",
    "BG-15",
    "BG-16",
    "BG-17",
    "BG-18",
    "BG-19",
    "BG-20",
    "BG-21",
    "BG-22",
    "BG-23",
    "BG-24",
    "BG-25",
    "BG-26",
    "BG-27",
    "BG-28",
}

CATALOG_TYPEAHEAD_ROWS_SQL = """
select
  catalog_items.id::text as catalog_item_id,
  catalog_items.canonical_name,
  catalog_items.normalized_name as item_normalized_name,
  catalog_items.catalog_kind,
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

# OVE-257: the derived index rebuild reads the frozen active-release product
# projection, never mutable `catalog_items` eligibility. A retired release or a
# source-only row therefore cannot be revived by a reindex.
STABLE_REGISTRY_PRODUCT_TYPEAHEAD_ROWS_SQL = """
select
  records.catalog_item_id::text as catalog_item_id,
  records.canonical_name,
  lower(records.canonical_name) as item_normalized_name,
  records.catalog_kind,
  'confirmed' as status,
  'stable_registry' as source,
  null::text as created_by_user_id,
  records.item_locale,
  names.display_name,
  names.normalized_name as alias_normalized_name,
  names.locale as alias_locale,
  names.is_primary,
  'stable_registry' as eligibility_scope,
  records.object_kind_scope,
  records.public_slug,
  records.registry_release_id::text as registry_release_id,
  records.catalog_item_revision_id::text as revision_id,
  names.name_class
from stable_registry_product_catalog_names as names
inner join stable_registry_product_catalog_records as records
  on records.registry_release_id = names.registry_release_id
 and records.catalog_item_id = names.catalog_item_id
inner join catalog_registry_active_pointers as pointers
  on pointers.release_family = 'foundation'
 and pointers.active_release_id = records.registry_release_id
inner join catalog_registry_releases as releases
  on releases.id = records.registry_release_id
 and releases.release_kind = 'foundation'
 and releases.state = 'active'
order by names.is_primary desc, names.display_name asc
"""

JOURNAL_ENTRY_SEARCH_ROW_SQL = """
select
  journal_entries.id::text as id,
  journal_entries.title,
  journal_entries.body,
  journal_entries.public_slug,
  journal_entries.public_gone_at,
  journal_entries.published_at,
  journal_entries.entry_date,
  journal_entries.entry_scope,
  journal_entries.created_at,
  journal_entries.visibility,
  journal_entries.lifecycle_state,
  journal_entries.cover_media_asset_id::text as cover_media_asset_id,
  case
    when user_public_profiles.user_id is not null then true
    else false
  end as owner_profile_public_safe,
  case
    when journal_entries.entry_scope = 'space' then spaces.location_visibility
    else plant_objects.location_visibility
  end as location_visibility,
  case
    when journal_entries.entry_scope = 'space'
     and spaces.location_visibility = 'region' then spaces.coarse_region_code
    when plant_objects.location_visibility = 'region' then
      coalesce(
        plant_objects.coarse_region_code,
        case
          when spaces.location_visibility = 'region' then spaces.coarse_region_code
          else null
        end
      )
    else null
  end as coarse_region_code,
  cover_media.media_id::text as cover_media_id,
  cover_media.usage_role as cover_usage_role,
  cover_media.derivative_key as cover_derivative_key,
  cover_media.revoked_at as cover_revoked_at
from journal_entries
left join plant_objects
  on plant_objects.id = journal_entries.plant_object_id
 and plant_objects.owner_user_id = journal_entries.owner_user_id
inner join spaces
  on spaces.id = journal_entries.space_id
 and spaces.owner_user_id = journal_entries.owner_user_id
left join user_handle_registry
  on user_handle_registry.user_id = journal_entries.owner_user_id
 and user_handle_registry.lifecycle_state = 'current'
left join user_public_profiles
  on user_public_profiles.user_id = user_handle_registry.user_id
 and user_public_profiles.normalized_handle = user_handle_registry.normalized_handle
 and user_public_profiles.profile_lifecycle_state = 'active'
 and user_public_profiles.removed_at is null
left join lateral (
  select
    media_assets.id as media_id,
    media_assets.usage_role,
    media_assets.derivative_key,
    media_assets.revoked_at
  from media_assets
  where media_assets.journal_entry_id = journal_entries.id
    and media_assets.owner_user_id = journal_entries.owner_user_id
    and media_assets.derivative_key is not null
    and media_assets.revoked_at is null
    and (
      media_assets.id = journal_entries.cover_media_asset_id
      or media_assets.usage_role = 'inline'
    )
  order by
    case
      when media_assets.id = journal_entries.cover_media_asset_id then 0
      else 1
    end asc,
    media_assets.document_position asc nulls last,
    media_assets.id asc
  limit 1
) as cover_media on true
where journal_entries.id = %s
  and journal_entries.owner_user_id = %s
limit 1
"""

JOURNAL_ENTRY_OWNER_SQL = """
select journal_entries.id::text as id
from journal_entries
inner join spaces
  on spaces.id = journal_entries.space_id
 and spaces.owner_user_id = journal_entries.owner_user_id
where journal_entries.id = %s
  and journal_entries.owner_user_id = %s
limit 1
"""


def client() -> meilisearch.Client:
    host = os.environ.get("MEILISEARCH_HOST", "http://localhost:7700")
    api_key = os.environ.get("MEILISEARCH_API_KEY")
    return meilisearch.Client(
        host,
        api_key,
        timeout=MEILISEARCH_HTTP_TIMEOUT_SECONDS,
    )


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
    catalog_kind = _text(row, "catalog_kind", "catalogKind")
    alias_locale = _text(row, "alias_locale", fallback="und")
    item_locale = _text(row, "item_locale", fallback=alias_locale)
    normalized_name = _normalized_name(row)
    source = _text(row, "source", fallback="internal_seed")

    if (
        not catalog_item_id
        or not display_name
        or not canonical_name
        or catalog_kind not in {"plant_variety", "species", "breed"}
        or not normalized_name
    ):
        return None

    is_primary = bool(row.get("is_primary"))
    registry = _stable_registry_document_fields(row)
    eligibility_scope = _text(row, "eligibility_scope", fallback="compatibility")
    if eligibility_scope == "stable_registry" and (
        registry is None or source != "stable_registry" or status != "confirmed"
    ):
        return None

    return {
        "id": _catalog_typeahead_document_id(
            catalog_item_id,
            alias_locale,
            normalized_name,
            registry["registryReleaseId"] if registry else "",
        ),
        "catalogItemId": catalog_item_id,
        "displayName": display_name,
        "canonicalName": canonical_name,
        "catalogKind": catalog_kind,
        "normalizedName": normalized_name,
        "locale": alias_locale,
        "itemLocale": item_locale,
        "status": status,
        "source": source,
        "isPrimary": is_primary,
        "rank": 0 if is_primary else 10,
        "kind": "catalog_item",
        **(
            {"eligibilityScope": "stable_registry", **registry}
            if eligibility_scope == "stable_registry" and registry
            else {}
        ),
    }


_STABLE_REGISTRY_NAME_CLASSES = {
    "canonical",
    "scientific",
    "localized",
    "accepted_alias",
}
_STABLE_REGISTRY_OBJECT_KIND_SCOPES = {"plant", "animal", "either"}
_PUBLIC_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _stable_registry_document_fields(
    row: Mapping[str, Any],
) -> dict[str, object] | None:
    """Return the release-scoped facets, or None when any one is unusable.

    A partially valid set is refused rather than half-projected: the picker
    uses these fields to prove an active identity, so an incomplete document
    must not exist at all.
    """
    public_slug = _text(row, "public_slug")
    registry_release_id = _text(row, "registry_release_id")
    revision_id = _text(row, "revision_id")
    name_class = _text(row, "name_class")
    object_kind_scope = _text(row, "object_kind_scope")

    if (
        not _PUBLIC_SLUG_PATTERN.match(public_slug)
        or not _UUID_PATTERN.match(registry_release_id)
        or not _UUID_PATTERN.match(revision_id)
        or name_class not in _STABLE_REGISTRY_NAME_CLASSES
        or object_kind_scope not in _STABLE_REGISTRY_OBJECT_KIND_SCOPES
    ):
        return None

    return {
        "objectKindScope": object_kind_scope,
        "publicSlug": public_slug,
        "registryReleaseId": registry_release_id,
        "revisionId": revision_id,
        "nameClass": name_class,
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
    """Compatibility rows plus the active-release product projection.

    Both are read in one rebuild so a release activation and the pre-registry
    catalog converge to one index without a second search owner.
    """
    rows = list(conn.execute(CATALOG_TYPEAHEAD_ROWS_SQL).fetchall())
    rows.extend(fetch_stable_registry_product_typeahead_rows(conn))
    return rows


def fetch_stable_registry_product_typeahead_rows(
    conn: Any,
) -> list[Mapping[str, Any]]:
    return list(
        conn.execute(STABLE_REGISTRY_PRODUCT_TYPEAHEAD_ROWS_SQL).fetchall()
    )


def fetch_journal_entry_search_row(
    conn: Any,
    journal_entry_id: str,
    owner_user_id: str,
) -> Mapping[str, Any] | None:
    return conn.execute(
        JOURNAL_ENTRY_SEARCH_ROW_SQL,
        (journal_entry_id, owner_user_id),
    ).fetchone()


def journal_entry_belongs_to_owner(
    conn: Any,
    journal_entry_id: str,
    owner_user_id: str,
) -> bool:
    return (
        conn.execute(
            JOURNAL_ENTRY_OWNER_SQL,
            (journal_entry_id, owner_user_id),
        ).fetchone()
        is not None
    )


def journal_entry_search_document_from_row(
    row: Mapping[str, Any],
) -> dict[str, object] | None:
    """Convert one Postgres journal row into the safe public Meili document."""
    journal_entry_id = _normalize_journal_document_id(_text(row, "id"))
    if journal_entry_id is None:
        return None
    if _text(row, "visibility") != "public":
        return None
    if _text(row, "lifecycle_state") != "active":
        return None
    if row.get("public_gone_at") is not None:
        return None
    if row.get("published_at") is None:
        return None
    if not bool(row.get("owner_profile_public_safe")):
        return None

    title = _text(row, "title")
    body = _text(row, "body")
    public_slug = _text(row, "public_slug")
    entry_scope = _text(row, "entry_scope")
    requested_location_visibility = _text(row, "location_visibility")

    if not title or not body or not public_slug:
        return None
    if entry_scope not in {"object", "space"}:
        return None
    if requested_location_visibility not in {"hidden", "region"}:
        return None

    quality_reasons: list[str] = []
    coarse_region_code: str | None = None
    location_visibility = requested_location_visibility
    if requested_location_visibility == "region":
        coarse_region_code = _coarse_region_code(row)
        if coarse_region_code is None:
            location_visibility = "hidden"
            quality_reasons.append("coarse_region_unavailable")

    cover_requested = bool(
        _text(row, "cover_media_id") and _text(row, "cover_derivative_key")
    )
    cover_source, cover_public_url = _resolve_cover_presentation(row)
    if cover_requested and (
        cover_source == "none"
        or not cover_public_url
        or not _is_cover_media_verified(row)
    ):
        quality_reasons.append("media_projection_unresolved")

    quality_reasons = [
        reason
        for reason in JOURNAL_PROJECTION_QUALITY_REASON_ORDER
        if reason in quality_reasons
    ]

    document: dict[str, object] = {
        "id": journal_entry_id,
        "title": title,
        "body": body,
        "publicSlug": public_slug,
        "publicPath": f"/journal/{public_slug}",
        "locationVisibility": location_visibility,
        "noindex": False,
        "entryDate": _iso_datetime(row.get("entry_date")),
        "entryScope": entry_scope,
        "createdAt": _iso_datetime(row.get("created_at")),
        "kind": "journal_entry",
        "coverSource": cover_source,
        "qualityClass": "verified" if not quality_reasons else "partial",
        "qualityReasons": quality_reasons,
    }
    if cover_public_url:
        document["coverPublicUrl"] = cover_public_url

    if location_visibility == "region" and coarse_region_code is not None:
        document["coarseRegionCode"] = coarse_region_code

    return document


def assert_safe_journal_search_document_id(value: str) -> str:
    normalized = _normalize_journal_document_id(value)
    if normalized is None:
        raise ValueError("invalid_journal_search_document_id")
    return normalized


def _normalize_journal_document_id(value: str) -> str | None:
    if not value or not JOURNAL_ENTRY_UUID_RE.fullmatch(value):
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None


def _resolve_cover_presentation(
    row: Mapping[str, Any],
) -> tuple[str, str | None]:
    cover_media_id = _text(row, "cover_media_id")
    cover_derivative_key = _text(row, "cover_derivative_key")
    if not cover_media_id or not cover_derivative_key:
        return "none", None
    if not _is_cover_media_verified(row):
        return "none", None

    cover_public_url = _public_derivative_url(cover_derivative_key)
    if cover_public_url is None:
        return "none", None

    explicit_cover_id = _text(row, "cover_media_asset_id")
    usage_role = _text(row, "cover_usage_role")
    if explicit_cover_id and explicit_cover_id == cover_media_id:
        if usage_role == "cover_only":
            return "separate", cover_public_url
        return "explicit_inline", cover_public_url
    if usage_role == "inline":
        return "automatic_inline", cover_public_url
    return "none", None


def _is_cover_media_verified(row: Mapping[str, Any]) -> bool:
    return bool(
        _text(row, "cover_media_id")
        and _text(row, "cover_derivative_key")
        and row.get("cover_revoked_at") is None
    )


def _public_derivative_url(object_key: str) -> str | None:
    base_url = os.environ.get("R2_PUBLIC_BASE_URL", "").strip()
    if not base_url:
        return None
    normalized_base = base_url if base_url.endswith("/") else f"{base_url}/"
    key = object_key.lstrip("/")
    if not key or "://" in key or ".." in key:
        return None
    if "quarantine/" in key.lower():
        return None
    return f"{normalized_base}{key}"


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
    _wait_for_task(c, delete_task.task_uid)

    if not documents:
        return {"indexed": 0, "task_uid": None}

    add_task = index.add_documents(documents, primary_key="id")
    _wait_for_task(c, add_task.task_uid)
    return {"indexed": len(documents), "task_uid": add_task.task_uid}


def index_journal_entry(
    conn: Any,
    journal_entry_id: str,
    owner_user_id: str,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    """Index one public-safe journal document, or remove it if no longer safe."""
    safe_journal_entry_id = assert_safe_journal_search_document_id(journal_entry_id)
    safe_owner_user_id = assert_safe_journal_search_document_id(owner_user_id)
    c = meili_client or client()
    index = c.index(PUBLIC_JOURNAL_ENTRIES_INDEX)
    _ensure_public_journal_entries_settings(c, index)

    row = fetch_journal_entry_search_row(
        conn, safe_journal_entry_id, safe_owner_user_id
    )
    if row is None:
        raise ValueError("journal entry was not found for the job owner")

    document = journal_entry_search_document_from_row(row)
    if document is None:
        return unindex_journal_entry(safe_journal_entry_id, c)

    task = index.add_documents([document], primary_key="id")
    _wait_for_task(c, task.task_uid)
    return {"indexed": 1, "task_uid": task.task_uid}


def unindex_journal_entry_for_owner(
    conn: Any,
    journal_entry_id: str,
    owner_user_id: str,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    safe_journal_entry_id = assert_safe_journal_search_document_id(journal_entry_id)
    safe_owner_user_id = assert_safe_journal_search_document_id(owner_user_id)
    if not journal_entry_belongs_to_owner(
        conn, safe_journal_entry_id, safe_owner_user_id
    ):
        raise ValueError("journal entry was not found for the job owner")
    return unindex_journal_entry(safe_journal_entry_id, meili_client)


def unindex_journal_entry(
    journal_entry_id: str,
    meili_client: meilisearch.Client | None = None,
) -> dict[str, object]:
    """Remove one public journal document from the derived search boundary."""
    safe_journal_entry_id = assert_safe_journal_search_document_id(journal_entry_id)
    c = meili_client or client()
    index = c.index(PUBLIC_JOURNAL_ENTRIES_INDEX)
    task = index.delete_document(safe_journal_entry_id)
    _wait_for_task(c, task.task_uid)
    return {"deleted": 1, "task_uid": task.task_uid}


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
    _wait_for_task(c, task.task_uid)

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
                "catalog_kind": "plant_variety",
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
                "catalog_kind": "plant_variety",
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
    _wait_for_task(c, task.task_uid)

    result = index.search("помдор", {"limit": 3})
    hits = result["hits"]
    assert hits, f"catalog Cyrillic typeahead failed: {result}"
    assert hits[0]["catalogItemId"] == "00000000-0000-4000-8000-000000000101", (
        f"catalog Cyrillic typeahead failed: {result}"
    )
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
        _wait_for_task(c, task.task_uid)


def _ensure_public_journal_entries_settings(
    c: meilisearch.Client,
    index: Any,
) -> None:
    for task in [
        index.update_searchable_attributes(JOURNAL_SEARCHABLE_ATTRIBUTES),
        index.update_filterable_attributes(JOURNAL_FILTERABLE_ATTRIBUTES),
        index.update_sortable_attributes(JOURNAL_SORTABLE_ATTRIBUTES),
    ]:
        _wait_for_task(c, task.task_uid)


def _wait_for_task(c: meilisearch.Client, task_uid: int) -> Any:
    """Wait through normal production indexing latency, but remain bounded."""
    task = c.wait_for_task(
        task_uid,
        timeout_in_ms=MEILISEARCH_TASK_TIMEOUT_MS,
        interval_in_ms=MEILISEARCH_TASK_POLL_INTERVAL_MS,
    )
    status = (
        task.get("status")
        if isinstance(task, Mapping)
        else getattr(task, "status", None)
    )
    if status != "succeeded":
        raise RuntimeError("Meilisearch task did not reach the succeeded class")
    return task


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


def _coarse_region_code(row: Mapping[str, Any]) -> str | None:
    value = _text(row, "coarse_region_code").upper()
    return value if value in SUPPORTED_COARSE_REGION_CODES else None


def _iso_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return (
            normalized.astimezone(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
    if isinstance(value, date):
        return f"{value.isoformat()}T00:00:00.000Z"
    if isinstance(value, str) and value.strip():
        return value.strip()
    return ""


def _catalog_typeahead_document_id(
    catalog_item_id: str,
    locale: str,
    normalized_name: str,
    identity_scope: str = "",
) -> str:
    alias_key = (
        f"{identity_scope}\0{locale}\0{normalized_name}".encode()
        if identity_scope
        else f"{locale}\0{normalized_name}".encode()
    )
    alias_digest = hashlib.sha256(alias_key).hexdigest()[:24]
    return f"{catalog_item_id}-{alias_digest}"


if __name__ == "__main__":
    hit = prove_cyrillic_typo_tolerance()
    print("Cyrillic typo-tolerant match:", hit["name"])
    catalog_hit = prove_catalog_cyrillic_typeahead()
    print("Catalog typo-tolerant match:", catalog_hit["displayName"])
