import json

import pytest

from app import catalog_matching
from app.catalog_matching import (
    MATCH_EVIDENCE_SCHEMA_VERSION,
    MATCH_SCORE_HIGH,
    MARK_PENDING_SUGGESTIONS_STALE_SQL,
    SOURCE_CANDIDATE_SQL,
    TARGET_CANDIDATES_SQL,
    UPSERT_MATCH_SUGGESTION_SQL,
    build_catalog_match_suggestions,
    normalize_catalog_name,
    refresh_catalog_match_suggestions,
)


SOURCE = {
    "id": "00000000-0000-4000-8000-000000000201",
    "canonical_name": "Помідор чері",
    "normalized_name": "помідор чері",
    "catalog_kind": "plant_variety",
    "locale": "uk",
    "affected_object_count": 2,
    "updated_at": "2026-07-14T10:00:00+00:00",
}


def candidate(
    *,
    target_id: str = "00000000-0000-4000-8000-000000000101",
    target_name_id: str = "00000000-0000-4000-8000-000000000111",
    display_name: str = "Помідор чері",
    canonical_name: str = "Помідор чері",
    normalized_name: str = "помідор чері",
    locale: str = "uk",
) -> dict[str, object]:
    return {
        "target_catalog_item_id": target_id,
        "target_catalog_item_name_id": target_name_id,
        "display_name": display_name,
        "canonical_name": canonical_name,
        "normalized_name": normalized_name,
        "locale": locale,
        "catalog_kind": "plant_variety",
        "target_updated_at": "2026-07-14T09:00:00+00:00",
    }


def test_catalog_normalization_uses_icu_casefold_and_bounded_spacing():
    assert normalize_catalog_name("  ПОМІДОР—ЧЕРІ  ") == "помідор чері"
    assert normalize_catalog_name("ПОМІДОР\u00a0\u00a0ЧЕРІ") == "помідор чері"


def test_worker_fingerprint_matches_the_server_utf8_contract():
    assert catalog_matching._matching_fingerprint("a", "б", "uk") == (
        "9eb1dcce6971f5add2a31c28cfedccaa01e473bf6ab429a1cc896e1835caf457"
    )


def test_exact_match_is_high_confidence_and_explainable_without_private_data():
    suggestions = build_catalog_match_suggestions(SOURCE, [candidate()])

    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion.target_catalog_item_id == candidate()["target_catalog_item_id"]
    assert (
        suggestion.target_catalog_item_name_id
        == candidate()["target_catalog_item_name_id"]
    )
    assert len(suggestion.source_matching_fingerprint) == 64
    assert len(suggestion.target_matching_fingerprint or "") == 64
    assert suggestion.score == 100
    assert suggestion.confidence_bucket == "high"
    assert suggestion.match_type == "normalized_exact"
    assert suggestion.reason_codes == ("normalized_exact", "same_catalog_kind")
    assert set(suggestion.safe_evidence) == {
        "schemaVersion",
        "score",
        "confidenceBucket",
        "matchType",
        "normalizedInput",
        "candidateDisplayName",
        "candidateCanonicalName",
        "sourceLocale",
        "targetLocale",
        "sourceScript",
        "targetScript",
        "catalogKind",
        "affectedObjectCount",
        "reasonCodes",
        "thresholds",
    }
    assert suggestion.safe_evidence["schemaVersion"] == MATCH_EVIDENCE_SCHEMA_VERSION
    assert suggestion.safe_evidence["candidateDisplayName"] == "Помідор чері"
    assert suggestion.safe_evidence["candidateCanonicalName"] == "Помідор чері"
    assert suggestion.safe_evidence["normalizedInput"] == "помідор чері"
    assert "sourceDisplayName" not in suggestion.safe_evidence

    encoded = json.dumps(suggestion.safe_evidence, ensure_ascii=False).lower()
    for forbidden in (
        "owner_user_id",
        "created_by_user_id",
        "journal",
        "media",
        "email",
        "latitude",
        "longitude",
        "source_record_id",
        "raw_payload",
    ):
        assert forbidden not in encoded


def test_cyrtranslit_bridge_matches_ascii_latin_input_to_ukrainian_name():
    source = {
        **SOURCE,
        "canonical_name": "Pomidor cheri",
        "normalized_name": "pomidor cheri",
        "locale": "und",
    }

    suggestion = build_catalog_match_suggestions(source, [candidate()])[0]

    assert suggestion.score >= MATCH_SCORE_HIGH
    assert suggestion.confidence_bucket == "high"
    assert suggestion.match_type == "transliteration_exact"
    assert "cyrtranslit_exact" in suggestion.reason_codes
    assert suggestion.safe_evidence["sourceScript"] == "latin"
    assert suggestion.safe_evidence["targetScript"] == "cyrillic"


def test_fuzzy_typo_is_scored_but_never_mutates_catalog_state():
    source = {
        **SOURCE,
        "canonical_name": "Помідор чрі",
        "normalized_name": "помідор чрі",
    }

    suggestion = build_catalog_match_suggestions(source, [candidate()])[0]

    assert suggestion.target_catalog_item_id == candidate()["target_catalog_item_id"]
    assert suggestion.score >= 70
    assert suggestion.match_type == "fuzzy_name"
    assert "rapidfuzz_name_similarity" in suggestion.reason_codes


def test_unrelated_name_produces_explicit_no_safe_match_row():
    source = {
        **SOURCE,
        "canonical_name": "Фіолетова загадка",
        "normalized_name": "фіолетова загадка",
    }

    suggestion = build_catalog_match_suggestions(
        source,
        [
            candidate(
                display_name="Огірок Ніжинський",
                canonical_name="Огірок Ніжинський",
                normalized_name="огірок ніжинський",
            )
        ],
    )[0]

    assert suggestion.target_catalog_item_id is None
    assert suggestion.confidence_bucket == "none"
    assert suggestion.match_type == "no_safe_match"
    assert suggestion.reason_codes == ("below_safe_threshold",)
    assert suggestion.safe_evidence["candidateDisplayName"] is None
    assert suggestion.safe_evidence["candidateCanonicalName"] is None


def test_punctuation_only_name_is_held_instead_of_poisoning_worker_retries():
    source = {
        **SOURCE,
        "canonical_name": "---",
        "normalized_name": "---",
        "locale": "x",
    }

    suggestion = build_catalog_match_suggestions(source, [candidate()])[0]

    assert suggestion.match_type == "no_safe_match"
    assert suggestion.normalized_input == "---"
    assert suggestion.source_locale == "und"
    assert suggestion.reason_codes == ("unmatchable_input",)


def test_raw_gardener_input_is_not_duplicated_into_safe_evidence():
    source = {
        **SOURCE,
        "canonical_name": "  ПОМІДОР—ЧЕРІ  ",
        "normalized_name": "помідор чері",
    }

    suggestion = build_catalog_match_suggestions(source, [candidate()])[0]

    encoded = json.dumps(suggestion.safe_evidence, ensure_ascii=False)
    assert "  ПОМІДОР—ЧЕРІ  " not in encoded
    assert suggestion.safe_evidence["normalizedInput"] == "помідор чері"
    assert "sourceDisplayName" not in suggestion.safe_evidence


def test_equal_alias_scores_use_locale_as_a_stable_tie_breaker():
    bg_alias = candidate(locale="bg")
    uk_alias = candidate(locale="uk")

    forward = build_catalog_match_suggestions(SOURCE, [uk_alias, bg_alias])[0]
    reverse = build_catalog_match_suggestions(SOURCE, [bg_alias, uk_alias])[0]

    assert forward.target_locale == "bg"
    assert reverse.target_locale == "bg"
    assert forward.safe_evidence == reverse.safe_evidence


class _Transaction:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Cursor:
    def __init__(self, *, one=None, many=None):
        self.one = one
        self.many = many or []

    def fetchone(self):
        return self.one

    def fetchall(self):
        return self.many


class _MatchingConnection:
    def __init__(self, source=SOURCE, candidates=None):
        self.source = source
        self.candidates = candidates if candidates is not None else [candidate()]
        self.calls = []

    def transaction(self):
        return _Transaction()

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        if sql is SOURCE_CANDIDATE_SQL:
            return _Cursor(one=self.source)
        if sql is TARGET_CANDIDATES_SQL:
            return _Cursor(many=self.candidates)
        return _Cursor()


def test_refresh_fails_closed_when_candidate_bound_is_exceeded(monkeypatch):
    monkeypatch.setattr(catalog_matching, "MAX_TARGET_CANDIDATES", 1)
    connection = _MatchingConnection(candidates=[candidate(), candidate(locale="bg")])

    with pytest.raises(RuntimeError, match="candidate limit exceeded"):
        refresh_catalog_match_suggestions(connection, SOURCE["id"])

    assert all(call[0] is not UPSERT_MATCH_SUGGESTION_SQL for call in connection.calls)


def test_refresh_stales_previous_pending_rows_then_persists_safe_suggestions():
    connection = _MatchingConnection()

    count = refresh_catalog_match_suggestions(connection, SOURCE["id"])

    assert count == 1
    assert connection.calls[0] == (
        MARK_PENDING_SUGGESTIONS_STALE_SQL,
        (SOURCE["id"],),
    )
    assert connection.calls[1] == (SOURCE_CANDIDATE_SQL, (SOURCE["id"],))
    assert connection.calls[2] == (
        TARGET_CANDIDATES_SQL,
        ("plant_variety", catalog_matching.MAX_TARGET_CANDIDATES + 1),
    )
    upsert_sql, upsert_params = connection.calls[3]
    assert upsert_sql is UPSERT_MATCH_SUGGESTION_SQL
    assert upsert_params[0] == SOURCE["id"]
    assert upsert_params[1] == candidate()["target_catalog_item_id"]
    assert upsert_params[2] == candidate()["target_catalog_item_name_id"]
    assert upsert_params[5] == SOURCE["updated_at"]
    assert upsert_params[6] == candidate()["target_updated_at"]
    assert len(upsert_params[7]) == 64
    assert len(upsert_params[8]) == 64
    assert upsert_params[10] == 100
    assert upsert_params[21].obj["schemaVersion"] == MATCH_EVIDENCE_SCHEMA_VERSION


def test_refresh_preserves_rejection_until_material_matching_inputs_change():
    normalized_sql = " ".join(UPSERT_MATCH_SUGGESTION_SQL.split())

    assert "catalog_match_suggestions.status = 'rejected'" in normalized_sql
    assert "source_matching_fingerprint is distinct from" in normalized_sql
    assert "target_matching_fingerprint is distinct from" in normalized_sql
    assert "target_catalog_item_name_id is distinct from" in normalized_sql
    assert "source_updated_at_snapshot is distinct from" not in normalized_sql
    assert "target_updated_at_snapshot is distinct from" not in normalized_sql
    assert "decision_reason_code = null" in normalized_sql
    assert "decision_result = null" in normalized_sql
    assert "decision_affected_object_count = null" in normalized_sql
    assert "affected_object_count is distinct from" not in normalized_sql


def test_refresh_of_non_provisional_source_only_stales_old_pending_evidence():
    connection = _MatchingConnection(source=None)

    assert refresh_catalog_match_suggestions(connection, SOURCE["id"]) == 0
    assert connection.calls == [
        (MARK_PENDING_SUGGESTIONS_STALE_SQL, (SOURCE["id"],)),
        (SOURCE_CANDIDATE_SQL, (SOURCE["id"],)),
    ]
