"""Deterministic, review-gated catalog alias generation for OVE-160."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any, Mapping, Sequence
from uuid import UUID

import cyrtranslit
from rapidfuzz import fuzz

from app.catalog_matching import normalize_catalog_name, script_hint

CATALOG_ALIAS_GENERATOR_VERSION = "ove160-v1"
CATALOG_ALIAS_SOURCE_SLUG = "overgarden-alias-generator"
MAX_SOURCE_NAMES = 100
MAX_EXISTING_NAMES = 100_000
MAX_ALIAS_SUGGESTIONS = 50

_CYRTRANSLIT_LANGUAGE_CODES = {
    "uk": "ua",
    "ua": "ua",
    "bg": "bg",
    "ru": "ru",
}

CATALOG_ALIAS_ITEM_SQL = """
select
  catalog_items.id,
  catalog_items.canonical_name,
  catalog_items.catalog_kind,
  catalog_items.status,
  catalog_items.created_by_user_id
from catalog_items
where catalog_items.id = %s
  and catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
for update
"""

CATALOG_ALIAS_SOURCE_NAMES_SQL = """
select
  catalog_item_names.id,
  catalog_item_names.catalog_item_id,
  catalog_item_names.display_name,
  catalog_item_names.normalized_name,
  catalog_item_names.locale,
  catalog_item_names.is_primary
from catalog_item_names
inner join catalog_items
  on catalog_items.id = catalog_item_names.catalog_item_id
where catalog_items.id = %s
  and catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
  and (
    catalog_item_names.is_primary = true
    or exists (
      select 1
      from catalog_alias_projections
      where catalog_alias_projections.catalog_item_name_id = catalog_item_names.id
        and catalog_alias_projections.status = 'accepted'
        and catalog_alias_projections.source_method <> 'generated'
    )
  )
order by
  catalog_item_names.is_primary desc,
  catalog_item_names.locale,
  catalog_item_names.normalized_name,
  catalog_item_names.display_name,
  catalog_item_names.id
limit %s
"""

EXISTING_CATALOG_NAMES_SQL = """
select
  catalog_item_names.id,
  catalog_item_names.catalog_item_id,
  catalog_item_names.display_name,
  catalog_item_names.normalized_name,
  catalog_item_names.locale,
  catalog_item_names.is_primary
from catalog_item_names
inner join catalog_items
  on catalog_items.id = catalog_item_names.catalog_item_id
where catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
order by
  catalog_item_names.normalized_name,
  catalog_item_names.locale,
  catalog_item_names.catalog_item_id,
  catalog_item_names.id
limit %s
"""

MARK_GENERATED_ALIAS_SUGGESTIONS_STALE_SQL = """
update catalog_alias_projections
set status = 'stale',
    updated_at = now()
where catalog_item_id = %s
  and source_slug = 'overgarden-alias-generator'
  and source_method = 'generated'
  and status in ('generated', 'review_needed')
"""

UPSERT_ALIAS_SUGGESTION_SQL = """
insert into catalog_alias_projections (
  catalog_item_id,
  catalog_item_name_id,
  generated_from_catalog_item_name_id,
  display_name,
  normalized_name,
  locale,
  script,
  alias_kind,
  status,
  source_slug,
  source_method,
  source_record_id,
  source_record_key,
  confidence,
  license,
  attribution_required,
  projection_notes,
  reason_codes,
  source_name_fingerprint,
  generator_version,
  generated_at,
  reviewed_at,
  reviewed_by_user_id,
  decision_reason_code,
  decision_result,
  updated_at
)
values (
  %s, null, %s, %s, %s, %s, %s, 'generated_variant', %s,
  'overgarden-alias-generator', 'generated', null, null, %s,
  'OverGarden generated variant', false,
  'Deterministic candidate; human approval required.',
  %s, %s, %s, now(), null, null, null, null, now()
)
on conflict (
  catalog_item_id,
  normalized_name,
  locale,
  source_slug,
  source_method
)
do update set
  catalog_item_name_id = null,
  generated_from_catalog_item_name_id = excluded.generated_from_catalog_item_name_id,
  display_name = excluded.display_name,
  script = excluded.script,
  alias_kind = excluded.alias_kind,
  status = excluded.status,
  confidence = excluded.confidence,
  license = excluded.license,
  attribution_required = excluded.attribution_required,
  projection_notes = excluded.projection_notes,
  reason_codes = excluded.reason_codes,
  source_name_fingerprint = excluded.source_name_fingerprint,
  generator_version = excluded.generator_version,
  generated_at = now(),
  reviewed_at = null,
  reviewed_by_user_id = null,
  decision_reason_code = null,
  decision_result = null,
  updated_at = now()
where catalog_alias_projections.status in ('generated', 'review_needed', 'stale')
   or (
     catalog_alias_projections.status = 'rejected'
     and (
       catalog_alias_projections.generated_from_catalog_item_name_id
         is distinct from excluded.generated_from_catalog_item_name_id
       or catalog_alias_projections.display_name is distinct from excluded.display_name
       or catalog_alias_projections.script is distinct from excluded.script
       or catalog_alias_projections.confidence is distinct from excluded.confidence
       or catalog_alias_projections.reason_codes is distinct from excluded.reason_codes
       or catalog_alias_projections.source_name_fingerprint
         is distinct from excluded.source_name_fingerprint
       or catalog_alias_projections.generator_version
         is distinct from excluded.generator_version
     )
   )
"""


@dataclass(frozen=True)
class CatalogAliasSuggestion:
    catalog_item_id: str
    catalog_item_name_id: None
    generated_from_catalog_item_name_id: str
    display_name: str
    normalized_name: str
    locale: str
    script: str
    alias_kind: str
    status: str
    source_method: str
    confidence: float
    reason_codes: tuple[str, ...]
    source_name_fingerprint: str
    generator_version: str


@dataclass(frozen=True)
class _Variant:
    display_name: str
    confidence: float
    reason_code: str


def build_catalog_alias_suggestions(
    catalog_item: Mapping[str, Any],
    source_names: Sequence[Mapping[str, Any]],
    existing_names: Sequence[Mapping[str, Any]],
) -> list[CatalogAliasSuggestion]:
    """Build bounded variants without making any candidate product-visible."""
    catalog_item_id = _required_identifier(catalog_item, "id")
    if catalog_item.get("status") not in {"seeded", "confirmed"}:
        return []
    if catalog_item.get("created_by_user_id") is not None:
        return []

    canonical_name = _required_text(catalog_item, "canonical_name")
    catalog_kind = _required_text(catalog_item, "catalog_kind")
    accepted_for_item = {
        (_normalized_row_name(row), _locale(row.get("locale")))
        for row in existing_names
        if _required_identifier(row, "catalog_item_id") == catalog_item_id
    }
    concepts_by_normalized_name: dict[str, set[str]] = {}
    for row in existing_names:
        normalized = _normalized_row_name(row)
        concepts_by_normalized_name.setdefault(normalized, set()).add(
            _required_identifier(row, "catalog_item_id")
        )

    suggestions_by_key: dict[tuple[str, str], CatalogAliasSuggestion] = {}
    ordered_sources = sorted(
        source_names,
        key=lambda row: (
            not bool(row.get("is_primary")),
            _locale(row.get("locale")),
            _normalized_row_name(row),
            _required_text(row, "display_name").casefold(),
            _required_identifier(row, "id"),
        ),
    )

    for source_name in ordered_sources[:MAX_SOURCE_NAMES]:
        source_name_id = _required_identifier(source_name, "id")
        source_display_name = _required_text(source_name, "display_name")
        source_normalized_name = _normalized_row_name(source_name)
        locale = _locale(source_name.get("locale"))
        fingerprint = _fingerprint(
            catalog_item_id,
            canonical_name,
            catalog_kind,
            _required_text(catalog_item, "status"),
            source_name_id,
            source_display_name,
            source_normalized_name,
            locale,
            CATALOG_ALIAS_GENERATOR_VERSION,
        )

        for variant in _variants_for_name(source_display_name, locale):
            display_name = _bounded_display_name(variant.display_name)
            if not display_name:
                continue
            normalized_name = normalize_catalog_name(display_name)
            if not normalized_name:
                continue
            key = (normalized_name, locale)
            if key in accepted_for_item:
                continue

            collision = any(
                concept_id != catalog_item_id
                for concept_id in concepts_by_normalized_name.get(
                    normalized_name, set()
                )
            )
            reason_codes = (variant.reason_code,)
            status = "generated"
            if collision:
                reason_codes = (*reason_codes, "normalized_collision")
                status = "review_needed"

            suggestion = CatalogAliasSuggestion(
                catalog_item_id=catalog_item_id,
                catalog_item_name_id=None,
                generated_from_catalog_item_name_id=source_name_id,
                display_name=display_name,
                normalized_name=normalized_name,
                locale=locale,
                script=script_hint(display_name),
                alias_kind="generated_variant",
                status=status,
                source_method="generated",
                confidence=variant.confidence,
                reason_codes=reason_codes,
                source_name_fingerprint=fingerprint,
                generator_version=CATALOG_ALIAS_GENERATOR_VERSION,
            )
            current = suggestions_by_key.get(key)
            if current is None or _suggestion_rank(suggestion) < _suggestion_rank(
                current
            ):
                suggestions_by_key[key] = suggestion

    return sorted(suggestions_by_key.values(), key=_suggestion_rank)[
        :MAX_ALIAS_SUGGESTIONS
    ]


def refresh_catalog_alias_suggestions(conn: Any, catalog_item_id: str) -> int:
    """Regenerate current review rows for one global catalog identity."""
    with conn.transaction():
        conn.execute(
            MARK_GENERATED_ALIAS_SUGGESTIONS_STALE_SQL,
            (catalog_item_id,),
        )
        catalog_item = conn.execute(
            CATALOG_ALIAS_ITEM_SQL,
            (catalog_item_id,),
        ).fetchone()
        if catalog_item is None:
            return 0

        source_names = conn.execute(
            CATALOG_ALIAS_SOURCE_NAMES_SQL,
            (catalog_item_id, MAX_SOURCE_NAMES + 1),
        ).fetchall()
        if len(source_names) > MAX_SOURCE_NAMES:
            raise RuntimeError("catalog alias source-name limit exceeded")

        existing_names = conn.execute(
            EXISTING_CATALOG_NAMES_SQL,
            (MAX_EXISTING_NAMES + 1,),
        ).fetchall()
        if len(existing_names) > MAX_EXISTING_NAMES:
            raise RuntimeError("catalog alias collision-name limit exceeded")

        suggestions = build_catalog_alias_suggestions(
            catalog_item,
            source_names,
            existing_names,
        )
        for suggestion in suggestions:
            conn.execute(
                UPSERT_ALIAS_SUGGESTION_SQL,
                (
                    suggestion.catalog_item_id,
                    suggestion.generated_from_catalog_item_name_id,
                    suggestion.display_name,
                    suggestion.normalized_name,
                    suggestion.locale,
                    suggestion.script,
                    suggestion.status,
                    suggestion.confidence,
                    list(suggestion.reason_codes),
                    suggestion.source_name_fingerprint,
                    suggestion.generator_version,
                ),
            )

    return len(suggestions)


def _variants_for_name(display_name: str, locale: str) -> list[_Variant]:
    language_code = _language_code(locale)
    if language_code is None:
        return []

    variants: list[_Variant] = []
    source_script = script_hint(display_name)
    if source_script == "cyrillic":
        try:
            transliterated = cyrtranslit.to_latin(display_name, language_code)
        except (KeyError, ValueError):
            transliterated = ""
        if transliterated and transliterated != display_name:
            variants.append(
                _Variant(
                    display_name=transliterated,
                    confidence=0.96,
                    reason_code="cyrtranslit_forward",
                )
            )

        if locale in {"ru", "ru-ru"} and any(
            character in display_name for character in ("ё", "Ё")
        ):
            variants.append(
                _Variant(
                    display_name=display_name.translate(str.maketrans("ёЁ", "еЕ")),
                    confidence=0.92,
                    reason_code="ru_yo_fold",
                )
            )
        if locale in {"uk", "uk-ua", "ua"} and any(
            character in display_name for character in ("ґ", "Ґ")
        ):
            variants.append(
                _Variant(
                    display_name=display_name.translate(str.maketrans("ґҐ", "гГ")),
                    confidence=0.88,
                    reason_code="uk_ghe_fold",
                )
            )

    if source_script == "latin":
        try:
            cyrillic = cyrtranslit.to_cyrillic(display_name, language_code)
            roundtrip = cyrtranslit.to_latin(cyrillic, language_code)
        except (KeyError, ValueError):
            return variants
        if (
            cyrillic != display_name
            and fuzz.ratio(
                normalize_catalog_name(display_name),
                normalize_catalog_name(roundtrip),
            )
            >= 95
        ):
            variants.append(
                _Variant(
                    display_name=cyrillic,
                    confidence=0.93,
                    reason_code="cyrtranslit_reverse",
                )
            )

    return variants


def _language_code(locale: str) -> str | None:
    base_locale = locale.replace("_", "-").split("-", 1)[0]
    return _CYRTRANSLIT_LANGUAGE_CODES.get(base_locale)


def _suggestion_rank(suggestion: CatalogAliasSuggestion) -> tuple[Any, ...]:
    return (
        0 if suggestion.status == "generated" else 1,
        -suggestion.confidence,
        suggestion.locale,
        suggestion.normalized_name,
        suggestion.display_name.casefold(),
        suggestion.generated_from_catalog_item_name_id,
    )


def _fingerprint(*values: str) -> str:
    payload = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _bounded_display_name(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if not 1 <= len(normalized) <= 120:
        return ""
    return normalized


def _normalized_row_name(row: Mapping[str, Any]) -> str:
    value = row.get("normalized_name")
    if isinstance(value, str) and value.strip():
        return normalize_catalog_name(value)
    return normalize_catalog_name(_required_text(row, "display_name"))


def _required_text(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required for catalog alias generation")
    return value.strip()


def _required_identifier(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise ValueError(f"{key} is required for catalog alias generation")


def _locale(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "und"
    locale = value.strip().lower()[:16]
    return locale if len(locale) >= 2 else "und"
