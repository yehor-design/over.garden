from __future__ import annotations

import importlib
from typing import Any

import pytest


CATALOG_ITEM_ID = "00000000-0000-4000-8000-000000000101"
OTHER_CATALOG_ITEM_ID = "00000000-0000-4000-8000-000000000102"


def _catalog_aliases():
    return importlib.import_module("app.catalog_aliases")


def _catalog_item() -> dict[str, Any]:
    return {
        "id": CATALOG_ITEM_ID,
        "canonical_name": "Ґрунтовий томат",
        "catalog_kind": "plant_variety",
        "status": "seeded",
        "created_by_user_id": None,
    }


def _name(
    name_id: str,
    display_name: str,
    locale: str,
    *,
    catalog_item_id: str = CATALOG_ITEM_ID,
    is_primary: bool = True,
) -> dict[str, Any]:
    return {
        "id": name_id,
        "catalog_item_id": catalog_item_id,
        "display_name": display_name,
        "normalized_name": display_name.casefold(),
        "locale": locale,
        "is_primary": is_primary,
    }


@pytest.mark.parametrize(
    ("locale", "display_name", "expected_variant"),
    [
        ("uk", "Ґрунтовий томат", "Gruntovyj tomat"),
        ("bg", "Розова градина", "Rozova gradina"),
        ("ru", "Ёлка садовая", "YOlka sadovaya"),
    ],
)
def test_generates_bounded_forward_transliterations_for_supported_locales(
    locale: str,
    display_name: str,
    expected_variant: str,
):
    module = _catalog_aliases()
    source_name = _name(
        "00000000-0000-4000-8000-000000000201",
        display_name,
        locale,
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [source_name],
        [source_name],
    )

    suggestion = next(
        row for row in suggestions if row.display_name == expected_variant
    )
    assert suggestion.catalog_item_id == CATALOG_ITEM_ID
    assert suggestion.generated_from_catalog_item_name_id == source_name["id"]
    assert suggestion.locale == locale
    assert suggestion.script == "latin"
    assert suggestion.alias_kind == "generated_variant"
    assert suggestion.status == "generated"
    assert suggestion.source_method == "generated"
    assert suggestion.catalog_item_name_id is None
    assert suggestion.confidence == pytest.approx(0.96)
    assert suggestion.reason_codes == ("cyrtranslit_forward",)
    assert len(suggestion.source_name_fingerprint) == 64


def test_generates_reverse_transliteration_only_for_an_explicit_supported_locale():
    module = _catalog_aliases()
    bg_latin = _name(
        "00000000-0000-4000-8000-000000000202",
        "Rozova gradina",
        "bg",
    )
    scientific_latin = _name(
        "00000000-0000-4000-8000-000000000203",
        "Rosa gallica",
        "la",
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [bg_latin, scientific_latin],
        [bg_latin, scientific_latin],
    )

    assert any(
        row.display_name == "Розова градина"
        and row.locale == "bg"
        and row.script == "cyrillic"
        and row.reason_codes == ("cyrtranslit_reverse",)
        for row in suggestions
    )
    assert all(row.locale != "la" for row in suggestions)


def test_adds_only_bounded_orthographic_variants():
    module = _catalog_aliases()
    russian_name = _name(
        "00000000-0000-4000-8000-000000000204",
        "Ёлка садовая",
        "ru",
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [russian_name],
        [russian_name],
    )

    assert any(
        row.display_name == "Елка садовая"
        and row.reason_codes == ("ru_yo_fold",)
        and row.confidence == pytest.approx(0.92)
        for row in suggestions
    )


def test_adds_the_bounded_ukrainian_ghe_variant():
    module = _catalog_aliases()
    ukrainian_name = _name(
        "00000000-0000-4000-8000-000000000209",
        "Ґрунтовий томат",
        "uk",
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [ukrainian_name],
        [ukrainian_name],
    )

    assert any(
        row.display_name == "Грунтовий томат"
        and row.reason_codes == ("uk_ghe_fold",)
        and row.confidence == pytest.approx(0.88)
        for row in suggestions
    )


@pytest.mark.parametrize(
    ("locale", "display_name"),
    [
        ("la", "Rosa gallica"),
        ("uk", "Rosa троянда"),
    ],
)
def test_skips_unsupported_and_mixed_script_source_names(
    locale: str,
    display_name: str,
):
    module = _catalog_aliases()
    source_name = _name(
        "00000000-0000-4000-8000-000000000210",
        display_name,
        locale,
    )

    assert (
        module.build_catalog_alias_suggestions(
            _catalog_item(),
            [source_name],
            [source_name],
        )
        == []
    )


def test_holds_a_generated_alias_when_normalized_text_belongs_to_another_concept():
    module = _catalog_aliases()
    source_name = _name(
        "00000000-0000-4000-8000-000000000205",
        "Розова градина",
        "bg",
    )
    colliding_name = _name(
        "00000000-0000-4000-8000-000000000206",
        "Rozova gradina",
        "bg",
        catalog_item_id=OTHER_CATALOG_ITEM_ID,
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [source_name],
        [source_name, colliding_name],
    )

    collision = next(
        row for row in suggestions if row.display_name == "Rozova gradina"
    )
    assert collision.status == "review_needed"
    assert collision.reason_codes == (
        "cyrtranslit_forward",
        "normalized_collision",
    )
    assert collision.catalog_item_name_id is None


def test_suppresses_variants_already_accepted_for_the_same_catalog_item():
    module = _catalog_aliases()
    source_name = _name(
        "00000000-0000-4000-8000-000000000207",
        "Розова градина",
        "bg",
    )
    existing_variant = _name(
        "00000000-0000-4000-8000-000000000208",
        "Rozova gradina",
        "bg",
        is_primary=False,
    )

    suggestions = module.build_catalog_alias_suggestions(
        _catalog_item(),
        [source_name, existing_variant],
        [source_name, existing_variant],
    )

    assert all(row.display_name != "Rozova gradina" for row in suggestions)


def test_worker_sql_is_global_identity_only_and_privacy_bounded():
    module = _catalog_aliases()
    source_sql = " ".join(module.CATALOG_ALIAS_SOURCE_NAMES_SQL.split()).lower()
    existing_sql = " ".join(module.EXISTING_CATALOG_NAMES_SQL.split()).lower()
    upsert_sql = " ".join(module.UPSERT_ALIAS_SUGGESTION_SQL.split()).lower()

    assert "catalog_items.status in ('seeded', 'confirmed')" in source_sql
    assert "catalog_items.created_by_user_id is null" in source_sql
    assert "catalog_item_names" in source_sql
    assert "catalog_alias_projections.status = 'accepted'" in source_sql
    assert "catalog_alias_projections.source_method <> 'generated'" in source_sql
    assert "catalog_item_names" in existing_sql
    assert "status = 'rejected'" in upsert_sql
    assert "source_name_fingerprint" in upsert_sql
    assert "generator_version" in upsert_sql
    assert "catalog_item_name_id" in upsert_sql
    for forbidden in (
        "journal_entries",
        "journal body",
        "owner_user_id",
        "email",
        "raw_payload",
        "source_only_fields",
        "media_assets",
        "latitude",
        "longitude",
    ):
        assert forbidden not in source_sql
        assert forbidden not in existing_sql
        assert forbidden not in upsert_sql
