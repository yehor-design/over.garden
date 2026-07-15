"""Bounded advisory fuzzy duplicate QA for source-backed catalog concepts."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import hashlib
from itertools import combinations
from typing import Any, Mapping, Sequence
from uuid import UUID

from rapidfuzz import fuzz

from app.catalog_matching import normalize_catalog_name

CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND = "catalog_fuzzy_duplicate_qa_refresh"
FUZZY_DUPLICATE_MATCHER_VERSION = "ove162-v1"
FUZZY_SCORE_HIGH = 95
FUZZY_SCORE_SAME_LOCALE = 90
FUZZY_SCORE_CROSS_LOCALE = 95
MAX_SOURCE_CATALOG_ROWS = 100_000
MAX_CANDIDATE_PAIRS = 250_000
MAX_BLOCK_PAIR_OBSERVATIONS = 2_000_000
MAX_FUZZY_DUPLICATE_SUGGESTIONS = 10_000
MAX_BLOCK_MEMBERS = 240
MAX_BLOCK_KEYS_PER_ROW = 4

SOURCE_CATALOG_ROWS_SQL = """
select
  id as catalog_item_id,
  canonical_name,
  normalized_name,
  catalog_kind,
  locale,
  source,
  status,
  updated_at
from catalog_items
where status in ('seeded', 'confirmed')
  and created_by_user_id is null
  and source in (
    'ua_state_register',
    'species_backbone',
    'ua_official_bee_breed',
    'vertebrate_breed_ontology',
    'eu_common_catalogue_bg',
    'eu_oj_eur_lex_common_catalogue',
    'grin_genebank_candidate'
  )
order by catalog_kind, id
limit %s
"""

DELETE_FUZZY_DUPLICATE_SUGGESTIONS_SQL = """
delete from catalog_fuzzy_duplicate_suggestions
"""

INSERT_FUZZY_DUPLICATE_SUGGESTION_SQL = """
insert into catalog_fuzzy_duplicate_suggestions (
  pair_key,
  left_catalog_item_id,
  right_catalog_item_id,
  left_updated_at_snapshot,
  right_updated_at_snapshot,
  score,
  score_bucket,
  reason_codes,
  locale_relation,
  recommended_action,
  matcher_version,
  generated_at,
  updated_at
)
values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
on conflict (left_catalog_item_id, right_catalog_item_id)
do update set
  pair_key = excluded.pair_key,
  left_updated_at_snapshot = excluded.left_updated_at_snapshot,
  right_updated_at_snapshot = excluded.right_updated_at_snapshot,
  score = excluded.score,
  score_bucket = excluded.score_bucket,
  reason_codes = excluded.reason_codes,
  locale_relation = excluded.locale_relation,
  recommended_action = excluded.recommended_action,
  matcher_version = excluded.matcher_version,
  generated_at = now(),
  updated_at = now()
"""


@dataclass(frozen=True)
class CatalogFuzzyDuplicateSuggestion:
    pair_key: str
    left_catalog_item_id: str
    right_catalog_item_id: str
    left_updated_at_snapshot: Any
    right_updated_at_snapshot: Any
    score: int
    score_bucket: str
    reason_codes: tuple[str, ...]
    locale_relation: str
    recommended_action: str


@dataclass(frozen=True)
class _CatalogMatchRow:
    catalog_item_id: str
    normalized_name: str
    catalog_kind: str
    locale: str
    updated_at: Any


def build_catalog_fuzzy_duplicate_suggestions(
    rows: Sequence[Mapping[str, Any]],
) -> list[CatalogFuzzyDuplicateSuggestion]:
    safe_rows = sorted((_safe_match_row(row) for row in rows), key=_row_sort_key)
    candidate_pairs = _candidate_pairs(safe_rows)
    suggestions: list[CatalogFuzzyDuplicateSuggestion] = []

    for left_index, right_index in sorted(candidate_pairs):
        left = safe_rows[left_index]
        right = safe_rows[right_index]
        if left.catalog_kind != right.catalog_kind:
            continue
        if left.normalized_name == right.normalized_name:
            continue

        locale_relation = _locale_relation(left.locale, right.locale)
        score = round(fuzz.WRatio(left.normalized_name, right.normalized_name))
        threshold = (
            FUZZY_SCORE_SAME_LOCALE
            if locale_relation == "same_locale"
            else FUZZY_SCORE_CROSS_LOCALE
        )
        if score < threshold:
            continue

        reason_codes = ["rapidfuzz_name_similarity", "same_catalog_kind"]
        recommended_action = "merge_review"
        if locale_relation == "same_locale":
            reason_codes.append("same_locale")
        else:
            reason_codes.extend(("cross_locale", "cross_locale_review_only"))
            recommended_action = "hold"

        suggestions.append(
            CatalogFuzzyDuplicateSuggestion(
                pair_key=_pair_key(
                    left.catalog_item_id,
                    right.catalog_item_id,
                ),
                left_catalog_item_id=left.catalog_item_id,
                right_catalog_item_id=right.catalog_item_id,
                left_updated_at_snapshot=left.updated_at,
                right_updated_at_snapshot=right.updated_at,
                score=score,
                score_bucket="high" if score >= FUZZY_SCORE_HIGH else "medium",
                reason_codes=tuple(reason_codes),
                locale_relation=locale_relation,
                recommended_action=recommended_action,
            )
        )

    suggestions.sort(
        key=lambda suggestion: (
            -suggestion.score,
            suggestion.left_catalog_item_id,
            suggestion.right_catalog_item_id,
        )
    )
    if len(suggestions) > MAX_FUZZY_DUPLICATE_SUGGESTIONS:
        raise RuntimeError("catalog fuzzy duplicate suggestion limit exceeded")
    return suggestions


def refresh_catalog_fuzzy_duplicate_suggestions(conn: Any) -> int:
    """Atomically replace advisory evidence without changing catalog state."""
    rows = conn.execute(
        SOURCE_CATALOG_ROWS_SQL,
        (MAX_SOURCE_CATALOG_ROWS + 1,),
    ).fetchall()
    if len(rows) > MAX_SOURCE_CATALOG_ROWS:
        raise RuntimeError("catalog fuzzy duplicate source row limit exceeded")

    suggestions = build_catalog_fuzzy_duplicate_suggestions(rows)
    with conn.transaction():
        conn.execute(DELETE_FUZZY_DUPLICATE_SUGGESTIONS_SQL)
        for suggestion in suggestions:
            conn.execute(
                INSERT_FUZZY_DUPLICATE_SUGGESTION_SQL,
                (
                    suggestion.pair_key,
                    suggestion.left_catalog_item_id,
                    suggestion.right_catalog_item_id,
                    suggestion.left_updated_at_snapshot,
                    suggestion.right_updated_at_snapshot,
                    suggestion.score,
                    suggestion.score_bucket,
                    list(suggestion.reason_codes),
                    suggestion.locale_relation,
                    suggestion.recommended_action,
                    FUZZY_DUPLICATE_MATCHER_VERSION,
                ),
            )
    return len(suggestions)


def _safe_match_row(row: Mapping[str, Any]) -> _CatalogMatchRow:
    catalog_item_id = _required_uuid(row, "catalog_item_id")
    canonical_name = _required_text(row, "canonical_name")
    normalized_name = normalize_catalog_name(canonical_name)
    if not normalized_name:
        raise ValueError("canonical_name is not matchable")
    return _CatalogMatchRow(
        catalog_item_id=catalog_item_id,
        normalized_name=normalized_name,
        catalog_kind=_required_text(row, "catalog_kind"),
        locale=_locale(row.get("locale")),
        updated_at=row.get("updated_at"),
    )


def _candidate_pairs(rows: Sequence[_CatalogMatchRow]) -> set[tuple[int, int]]:
    grams_by_row = [_blocking_grams(row.normalized_name) for row in rows]
    frequencies: dict[tuple[str, str], int] = defaultdict(int)
    for row, grams in zip(rows, grams_by_row, strict=True):
        for gram in grams:
            frequencies[(row.catalog_kind, gram)] += 1

    blocks: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, (row, grams) in enumerate(zip(rows, grams_by_row, strict=True)):
        eligible_grams = [
            gram
            for gram in grams
            if frequencies[(row.catalog_kind, gram)] <= MAX_BLOCK_MEMBERS
        ]
        selected_grams = sorted(
            eligible_grams,
            key=lambda gram: (frequencies[(row.catalog_kind, gram)], gram),
        )[:MAX_BLOCK_KEYS_PER_ROW]
        for gram in selected_grams:
            blocks[(row.catalog_kind, gram)].append(index)

    shared_blocks: dict[tuple[int, int], int] = defaultdict(int)
    for members in blocks.values():
        for pair in combinations(members, 2):
            shared_blocks[pair] += 1
            if len(shared_blocks) > MAX_BLOCK_PAIR_OBSERVATIONS:
                raise RuntimeError(
                    "catalog fuzzy duplicate block observation limit exceeded"
                )

    candidate_pairs = {
        pair for pair, shared_count in shared_blocks.items() if shared_count >= 2
    }
    if len(candidate_pairs) > MAX_CANDIDATE_PAIRS:
        raise RuntimeError("catalog fuzzy duplicate candidate pair limit exceeded")
    return candidate_pairs


def _blocking_grams(value: str) -> set[str]:
    compact = "".join(character for character in value if character.isalnum())
    if len(compact) < 3:
        return {compact} if compact else set()
    width = 2 if len(compact) < 5 else 3
    return {compact[index : index + width] for index in range(len(compact) - width + 1)}


def _locale_relation(left: str, right: str) -> str:
    if left == right and left != "und":
        return "same_locale"
    return "cross_locale"


def _pair_key(left_catalog_item_id: str, right_catalog_item_id: str) -> str:
    return hashlib.sha256(
        f"{left_catalog_item_id}|{right_catalog_item_id}".encode("utf-8")
    ).hexdigest()


def _row_sort_key(row: _CatalogMatchRow) -> tuple[str, str]:
    return row.catalog_kind, row.catalog_item_id


def _required_text(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value.strip()


def _required_uuid(row: Mapping[str, Any], key: str) -> str:
    raw_value = row.get(key)
    if isinstance(raw_value, UUID):
        return str(raw_value)
    value = _required_text(row, key)
    try:
        return str(UUID(value))
    except ValueError as error:
        raise ValueError(f"{key} must be a valid UUID") from error


def _locale(value: Any) -> str:
    if not isinstance(value, str):
        return "und"
    normalized = value.strip().lower()
    if not normalized or len(normalized) > 16:
        return "und"
    return normalized
