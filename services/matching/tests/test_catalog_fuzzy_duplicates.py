import json
from uuid import UUID

import pytest

from app import catalog_fuzzy_duplicates
from app.catalog_fuzzy_duplicates import (
    DELETE_FUZZY_DUPLICATE_SUGGESTIONS_SQL,
    INSERT_FUZZY_DUPLICATE_SUGGESTION_SQL,
    SOURCE_CATALOG_ROWS_SQL,
    build_catalog_fuzzy_duplicate_suggestions,
    refresh_catalog_fuzzy_duplicate_suggestions,
)


def catalog_row(
    *,
    catalog_item_id: str,
    canonical_name: str,
    locale: str = "uk",
    catalog_kind: str = "plant_variety",
    source: str = "ua_state_register",
) -> dict[str, object]:
    return {
        "catalog_item_id": catalog_item_id,
        "canonical_name": canonical_name,
        "normalized_name": canonical_name.lower(),
        "catalog_kind": catalog_kind,
        "locale": locale,
        "source": source,
        "status": "seeded",
        "updated_at": "2026-07-15T12:00:00+00:00",
    }


LEFT = catalog_row(
    catalog_item_id="00000000-0000-4000-8000-000000162001",
    canonical_name="Red Cherry",
)
RIGHT = catalog_row(
    catalog_item_id="00000000-0000-4000-8000-000000162002",
    canonical_name="Red Chery",
    source="eu_oj_eur_lex_common_catalogue",
)


def test_rapidfuzz_reports_same_locale_near_duplicate_as_advisory_merge_review():
    suggestions = build_catalog_fuzzy_duplicate_suggestions([LEFT, RIGHT])

    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion.left_catalog_item_id == LEFT["catalog_item_id"]
    assert suggestion.right_catalog_item_id == RIGHT["catalog_item_id"]
    assert suggestion.score == 95
    assert suggestion.score_bucket == "high"
    assert suggestion.locale_relation == "same_locale"
    assert suggestion.recommended_action == "merge_review"
    assert suggestion.reason_codes == (
        "rapidfuzz_name_similarity",
        "same_catalog_kind",
        "same_locale",
    )


def test_exact_duplicates_and_different_catalog_kinds_stay_in_existing_qa_groups():
    exact = {**RIGHT, "canonical_name": "Red Cherry", "normalized_name": "red cherry"}
    species = {**RIGHT, "catalog_kind": "species"}

    assert build_catalog_fuzzy_duplicate_suggestions([LEFT, exact]) == []
    assert build_catalog_fuzzy_duplicate_suggestions([LEFT, species]) == []


def test_cross_locale_near_duplicate_is_separate_and_held_for_review():
    cross_locale = {
        **RIGHT,
        "canonical_name": "Red Cherryy",
        "normalized_name": "red cherryy",
        "locale": "bg",
    }

    suggestion = build_catalog_fuzzy_duplicate_suggestions([LEFT, cross_locale])[0]

    assert suggestion.score == 95
    assert suggestion.locale_relation == "cross_locale"
    assert suggestion.recommended_action == "hold"
    assert "cross_locale_review_only" in suggestion.reason_codes


def test_unrelated_names_do_not_create_fuzzy_evidence():
    unrelated = {
        **RIGHT,
        "canonical_name": "Kyiv Long Cucumber",
        "normalized_name": "kyiv long cucumber",
    }

    assert build_catalog_fuzzy_duplicate_suggestions([LEFT, unrelated]) == []


def test_fuzzy_evidence_is_stable_and_contains_no_input_private_fields():
    private_left = {
        **LEFT,
        "owner_user_id": "do-not-leak",
        "journal_body": "do-not-leak",
        "raw_payload": {"secret": "do-not-leak"},
    }

    forward = build_catalog_fuzzy_duplicate_suggestions([private_left, RIGHT])
    reverse = build_catalog_fuzzy_duplicate_suggestions([RIGHT, private_left])

    assert forward == reverse
    encoded = json.dumps(forward[0].__dict__, ensure_ascii=False).lower()
    for forbidden in ("owner", "journal", "raw_payload", "do-not-leak"):
        assert forbidden not in encoded


def test_psycopg_uuid_values_use_the_same_stable_pair_contract():
    uuid_left = {**LEFT, "catalog_item_id": UUID(str(LEFT["catalog_item_id"]))}
    uuid_right = {**RIGHT, "catalog_item_id": UUID(str(RIGHT["catalog_item_id"]))}

    suggestion = build_catalog_fuzzy_duplicate_suggestions([uuid_left, uuid_right])[0]

    assert suggestion.left_catalog_item_id == LEFT["catalog_item_id"]
    assert suggestion.right_catalog_item_id == RIGHT["catalog_item_id"]


class _Transaction:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Cursor:
    def __init__(self, *, many=None):
        self.many = many or []

    def fetchall(self):
        return self.many


class _Connection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def transaction(self):
        return _Transaction()

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        if sql is SOURCE_CATALOG_ROWS_SQL:
            return _Cursor(many=self.rows)
        return _Cursor()


def test_refresh_replaces_only_advisory_rows_after_bounded_safe_read():
    connection = _Connection([LEFT, RIGHT])

    count = refresh_catalog_fuzzy_duplicate_suggestions(connection)

    assert count == 1
    assert connection.calls[0] == (
        SOURCE_CATALOG_ROWS_SQL,
        (catalog_fuzzy_duplicates.MAX_SOURCE_CATALOG_ROWS + 1,),
    )
    assert connection.calls[1] == (DELETE_FUZZY_DUPLICATE_SUGGESTIONS_SQL, ())
    assert connection.calls[2][0] is INSERT_FUZZY_DUPLICATE_SUGGESTION_SQL
    assert connection.calls[2][1][0] == forward_pair_key(LEFT, RIGHT)


def test_refresh_fails_closed_before_replacing_evidence_when_input_bound_is_exceeded(
    monkeypatch,
):
    monkeypatch.setattr(catalog_fuzzy_duplicates, "MAX_SOURCE_CATALOG_ROWS", 1)
    connection = _Connection([LEFT, RIGHT])

    with pytest.raises(RuntimeError, match="source row limit exceeded"):
        refresh_catalog_fuzzy_duplicate_suggestions(connection)

    assert all(
        sql is not DELETE_FUZZY_DUPLICATE_SUGGESTIONS_SQL
        for sql, _params in connection.calls
    )


def test_source_sql_and_persisted_contract_exclude_private_and_raw_fields():
    combined = "\n".join(
        (SOURCE_CATALOG_ROWS_SQL, INSERT_FUZZY_DUPLICATE_SUGGESTION_SQL)
    ).lower()
    for forbidden in (
        "raw_payload",
        "source_record_id",
        "owner_user_id",
        "journal_entries",
        "media_assets",
        "email",
        "ip_address",
        "user_agent",
        "latitude",
        "longitude",
    ):
        assert forbidden not in combined


def forward_pair_key(left, right):
    return build_catalog_fuzzy_duplicate_suggestions([left, right])[0].pair_key
