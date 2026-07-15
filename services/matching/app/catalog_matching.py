"""Deterministic provisional-name matching for the operator curation queue."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
import unicodedata
from typing import Any, Mapping, Sequence
from uuid import UUID

import cyrtranslit
import icu
from psycopg.types.json import Jsonb
from rapidfuzz import fuzz

CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND = "catalog_match_suggestions_refresh"
MATCHER_VERSION = "ove159-v3"
MATCH_EVIDENCE_SCHEMA_VERSION = "ove158.catalogMatchEvidence.v2"
MATCH_SCORE_HIGH = 95
MATCH_SCORE_MEDIUM = 85
MATCH_SCORE_LOW = 70
MAX_MATCH_SUGGESTIONS = 3
MAX_TARGET_CANDIDATES = 100_000

SOURCE_CANDIDATE_SQL = """
select
  catalog_items.id,
  catalog_items.canonical_name,
  catalog_items.normalized_name,
  catalog_items.catalog_kind,
  catalog_items.locale,
  catalog_items.updated_at,
  count(plant_objects.id)::integer as affected_object_count
from catalog_items
left join plant_objects
  on plant_objects.catalog_item_id = catalog_items.id
 and plant_objects.variety_state = 'user_added'
where catalog_items.id = %s
  and catalog_items.status = 'provisional'
  and catalog_items.source = 'user_added'
  and catalog_items.created_by_user_id is not null
group by catalog_items.id
"""

TARGET_CANDIDATES_SQL = """
select
  catalog_item_names.id as target_catalog_item_name_id,
  catalog_items.id as target_catalog_item_id,
  catalog_items.canonical_name,
  catalog_items.catalog_kind,
  catalog_item_names.display_name,
  catalog_item_names.normalized_name,
  catalog_item_names.locale,
  catalog_items.updated_at as target_updated_at
from catalog_item_names
inner join catalog_items
  on catalog_items.id = catalog_item_names.catalog_item_id
where catalog_items.catalog_kind = %s
  and catalog_items.status in ('seeded', 'confirmed')
  and catalog_items.created_by_user_id is null
order by
  catalog_items.id,
  catalog_item_names.is_primary desc,
  catalog_item_names.locale,
  catalog_item_names.normalized_name,
  catalog_item_names.display_name,
  catalog_item_names.id
limit %s
"""

MARK_PENDING_SUGGESTIONS_STALE_SQL = """
update catalog_match_suggestions
set status = 'stale',
    updated_at = now()
where source_catalog_item_id = %s
  and status = 'pending'
"""

UPSERT_MATCH_SUGGESTION_SQL = """
insert into catalog_match_suggestions (
  source_catalog_item_id,
  target_catalog_item_id,
  target_catalog_item_name_id,
  candidate_key,
  target_canonical_name,
  source_updated_at_snapshot,
  target_updated_at_snapshot,
  source_matching_fingerprint,
  target_matching_fingerprint,
  suggestion_kind,
  match_type,
  score,
  confidence_bucket,
  status,
  reason_codes,
  normalized_input,
  matched_name,
  source_locale,
  target_locale,
  source_script,
  target_script,
  catalog_kind,
  affected_object_count,
  safe_evidence,
  matcher_version,
  generated_at,
  updated_at
)
values (
  %s, %s, %s, %s, %s, %s, %s, %s, %s, 'canonical_match', %s, %s, %s, 'pending', %s,
  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now()
)
on conflict (source_catalog_item_id, candidate_key, suggestion_kind)
do update set
  target_catalog_item_id = excluded.target_catalog_item_id,
  target_catalog_item_name_id = excluded.target_catalog_item_name_id,
  target_canonical_name = excluded.target_canonical_name,
  source_updated_at_snapshot = excluded.source_updated_at_snapshot,
  target_updated_at_snapshot = excluded.target_updated_at_snapshot,
  source_matching_fingerprint = excluded.source_matching_fingerprint,
  target_matching_fingerprint = excluded.target_matching_fingerprint,
  match_type = excluded.match_type,
  score = excluded.score,
  confidence_bucket = excluded.confidence_bucket,
  status = 'pending',
  reason_codes = excluded.reason_codes,
  normalized_input = excluded.normalized_input,
  matched_name = excluded.matched_name,
  source_locale = excluded.source_locale,
  target_locale = excluded.target_locale,
  source_script = excluded.source_script,
  target_script = excluded.target_script,
  catalog_kind = excluded.catalog_kind,
  affected_object_count = excluded.affected_object_count,
  safe_evidence = excluded.safe_evidence,
  matcher_version = excluded.matcher_version,
  reviewed_at = null,
  reviewed_by_user_id = null,
  decision_reason_code = null,
  decision_result = null,
  decision_affected_object_count = null,
  generated_at = now(),
  updated_at = now()
where catalog_match_suggestions.status in ('pending', 'stale')
   or (
     catalog_match_suggestions.status = 'rejected'
     and (
       catalog_match_suggestions.source_matching_fingerprint
         is distinct from excluded.source_matching_fingerprint
       or catalog_match_suggestions.target_matching_fingerprint
         is distinct from excluded.target_matching_fingerprint
       or catalog_match_suggestions.target_catalog_item_id
         is distinct from excluded.target_catalog_item_id
       or catalog_match_suggestions.target_catalog_item_name_id
         is distinct from excluded.target_catalog_item_name_id
       or catalog_match_suggestions.target_canonical_name
         is distinct from excluded.target_canonical_name
       or catalog_match_suggestions.match_type is distinct from excluded.match_type
       or catalog_match_suggestions.score is distinct from excluded.score
       or catalog_match_suggestions.confidence_bucket
         is distinct from excluded.confidence_bucket
       or catalog_match_suggestions.reason_codes is distinct from excluded.reason_codes
       or catalog_match_suggestions.normalized_input
         is distinct from excluded.normalized_input
       or catalog_match_suggestions.matched_name is distinct from excluded.matched_name
       or catalog_match_suggestions.source_locale is distinct from excluded.source_locale
       or catalog_match_suggestions.target_locale is distinct from excluded.target_locale
       or catalog_match_suggestions.source_script is distinct from excluded.source_script
       or catalog_match_suggestions.target_script is distinct from excluded.target_script
       or catalog_match_suggestions.catalog_kind is distinct from excluded.catalog_kind
       or catalog_match_suggestions.matcher_version is distinct from excluded.matcher_version
     )
   )
"""

_ICU_CASEFOLD = icu.Normalizer2.getNFKCCasefoldInstance()
_SPACE_RUN = re.compile(r"\s+")
_CYRTRANSLIT_LOCALES = {
    "uk": ("ua",),
    "ua": ("ua",),
    "bg": ("bg",),
    "ru": ("ru",),
}
_TRANSLIT_ASCII_REPLACEMENTS = str.maketrans(
    {
        "č": "ch",
        "ć": "ch",
        "š": "sh",
        "ž": "zh",
        "đ": "dj",
        "ǵ": "gj",
        "ḱ": "kj",
        "ĺ": "lj",
        "ń": "nj",
    }
)


@dataclass(frozen=True)
class CatalogMatchSuggestion:
    target_catalog_item_id: str | None
    target_catalog_item_name_id: str | None
    candidate_key: str
    target_canonical_name: str | None
    source_updated_at_snapshot: Any
    target_updated_at_snapshot: Any | None
    source_matching_fingerprint: str
    target_matching_fingerprint: str | None
    score: int
    confidence_bucket: str
    match_type: str
    reason_codes: tuple[str, ...]
    normalized_input: str
    matched_name: str | None
    source_locale: str
    target_locale: str | None
    source_script: str
    target_script: str | None
    catalog_kind: str
    affected_object_count: int
    safe_evidence: dict[str, Any]


def normalize_catalog_name(value: str) -> str:
    """ICU casefold plus punctuation/spacing normalization for matching only."""
    normalized = _ICU_CASEFOLD.normalize(value.strip())
    characters = [
        " " if unicodedata.category(character)[0] in {"P", "S", "Z"} else character
        for character in normalized
    ]
    return _SPACE_RUN.sub(" ", "".join(characters)).strip()[:120]


def build_catalog_match_suggestions(
    source: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
) -> list[CatalogMatchSuggestion]:
    source_name = _required_text(source, "canonical_name")
    normalized_name = normalize_catalog_name(source_name)
    normalized_input = normalized_name or _ICU_CASEFOLD.normalize(source_name)[:120]
    source_locale = _locale(source.get("locale"))
    source_script = script_hint(source_name)
    catalog_kind = _required_text(source, "catalog_kind")
    affected_object_count = max(int(source.get("affected_object_count") or 0), 0)
    source_matching_fingerprint = _matching_fingerprint(
        source_name,
        _required_text(source, "normalized_name"),
        source_locale,
        catalog_kind,
    )

    best_by_target: dict[str, CatalogMatchSuggestion] = {}
    evaluated_scores: list[int] = []

    for candidate in candidates:
        if not normalized_name:
            break
        if candidate.get("catalog_kind") != catalog_kind:
            continue

        target_id = _required_identifier(candidate, "target_catalog_item_id")
        target_name_id = _required_identifier(candidate, "target_catalog_item_name_id")
        matched_name = _required_text(candidate, "display_name")
        canonical_name = _required_text(candidate, "canonical_name")
        target_normalized_name = _required_text(candidate, "normalized_name")
        target_locale = _locale(candidate.get("locale"))
        target_script = script_hint(matched_name)
        candidate_normalized = normalize_catalog_name(matched_name)
        score, match_type, reason_codes = _score_names(
            normalized_name,
            source_locale,
            source_script,
            candidate_normalized,
            target_locale,
            target_script,
        )
        evaluated_scores.append(score)
        if score < MATCH_SCORE_LOW:
            continue

        reasons = (*reason_codes, "same_catalog_kind")
        suggestion = CatalogMatchSuggestion(
            target_catalog_item_id=target_id,
            target_catalog_item_name_id=target_name_id,
            candidate_key=target_id,
            target_canonical_name=canonical_name,
            source_updated_at_snapshot=source.get("updated_at"),
            target_updated_at_snapshot=candidate.get("target_updated_at"),
            source_matching_fingerprint=source_matching_fingerprint,
            target_matching_fingerprint=_matching_fingerprint(
                target_id,
                canonical_name,
                catalog_kind,
                target_name_id,
                matched_name,
                target_normalized_name,
                target_locale,
            ),
            score=score,
            confidence_bucket=_confidence_bucket(score),
            match_type=match_type,
            reason_codes=reasons,
            normalized_input=normalized_input,
            matched_name=matched_name,
            source_locale=source_locale,
            target_locale=target_locale,
            source_script=source_script,
            target_script=target_script,
            catalog_kind=catalog_kind,
            affected_object_count=affected_object_count,
            safe_evidence=_safe_evidence(
                score=score,
                confidence_bucket=_confidence_bucket(score),
                match_type=match_type,
                normalized_input=normalized_input,
                candidate_display_name=matched_name,
                candidate_canonical_name=canonical_name,
                source_locale=source_locale,
                target_locale=target_locale,
                source_script=source_script,
                target_script=target_script,
                catalog_kind=catalog_kind,
                affected_object_count=affected_object_count,
                reason_codes=reasons,
            ),
        )

        current = best_by_target.get(target_id)
        if current is None or _suggestion_rank(suggestion) < _suggestion_rank(current):
            best_by_target[target_id] = suggestion

    suggestions = sorted(best_by_target.values(), key=_suggestion_rank)
    if suggestions:
        return suggestions[:MAX_MATCH_SUGGESTIONS]

    if not normalized_name:
        reason = "unmatchable_input"
    else:
        reason = (
            "below_safe_threshold" if evaluated_scores else "no_selectable_candidates"
        )
    score = max(evaluated_scores, default=0)
    reasons = (reason,)
    return [
        CatalogMatchSuggestion(
            target_catalog_item_id=None,
            target_catalog_item_name_id=None,
            candidate_key="no-safe-match",
            target_canonical_name=None,
            source_updated_at_snapshot=source.get("updated_at"),
            target_updated_at_snapshot=None,
            source_matching_fingerprint=source_matching_fingerprint,
            target_matching_fingerprint=None,
            score=score,
            confidence_bucket="none",
            match_type="no_safe_match",
            reason_codes=reasons,
            normalized_input=normalized_input,
            matched_name=None,
            source_locale=source_locale,
            target_locale=None,
            source_script=source_script,
            target_script=None,
            catalog_kind=catalog_kind,
            affected_object_count=affected_object_count,
            safe_evidence=_safe_evidence(
                score=score,
                confidence_bucket="none",
                match_type="no_safe_match",
                normalized_input=normalized_input,
                candidate_display_name=None,
                candidate_canonical_name=None,
                source_locale=source_locale,
                target_locale=None,
                source_script=source_script,
                target_script=None,
                catalog_kind=catalog_kind,
                affected_object_count=affected_object_count,
                reason_codes=reasons,
            ),
        )
    ]


def refresh_catalog_match_suggestions(conn: Any, source_catalog_item_id: str) -> int:
    """Replace only current pending evidence for one provisional catalog row."""
    with conn.transaction():
        conn.execute(MARK_PENDING_SUGGESTIONS_STALE_SQL, (source_catalog_item_id,))
        source = conn.execute(
            SOURCE_CANDIDATE_SQL,
            (source_catalog_item_id,),
        ).fetchone()
        if source is None:
            return 0

        candidates = conn.execute(
            TARGET_CANDIDATES_SQL,
            (source["catalog_kind"], MAX_TARGET_CANDIDATES + 1),
        ).fetchall()
        if len(candidates) > MAX_TARGET_CANDIDATES:
            raise RuntimeError("catalog match candidate limit exceeded")
        suggestions = build_catalog_match_suggestions(source, candidates)
        for suggestion in suggestions:
            conn.execute(
                UPSERT_MATCH_SUGGESTION_SQL,
                (
                    source_catalog_item_id,
                    suggestion.target_catalog_item_id,
                    suggestion.target_catalog_item_name_id,
                    suggestion.candidate_key,
                    suggestion.target_canonical_name,
                    suggestion.source_updated_at_snapshot,
                    suggestion.target_updated_at_snapshot,
                    suggestion.source_matching_fingerprint,
                    suggestion.target_matching_fingerprint,
                    suggestion.match_type,
                    suggestion.score,
                    suggestion.confidence_bucket,
                    list(suggestion.reason_codes),
                    suggestion.normalized_input,
                    suggestion.matched_name,
                    suggestion.source_locale,
                    suggestion.target_locale,
                    suggestion.source_script,
                    suggestion.target_script,
                    suggestion.catalog_kind,
                    suggestion.affected_object_count,
                    Jsonb(suggestion.safe_evidence),
                    MATCHER_VERSION,
                ),
            )

    return len(suggestions)


def script_hint(value: str) -> str:
    has_cyrillic = False
    has_latin = False
    for character in value:
        if not character.isalpha():
            continue
        name = unicodedata.name(character, "")
        has_cyrillic = has_cyrillic or "CYRILLIC" in name
        has_latin = has_latin or "LATIN" in name
    if has_cyrillic and has_latin:
        return "mixed"
    if has_cyrillic:
        return "cyrillic"
    if has_latin:
        return "latin"
    return "unknown"


def _score_names(
    source: str,
    source_locale: str,
    source_script: str,
    target: str,
    target_locale: str,
    target_script: str,
) -> tuple[int, str, tuple[str, ...]]:
    if source == target:
        return 100, "normalized_exact", ("normalized_exact",)

    source_keys = _transliteration_keys(source, source_locale)
    target_keys = _transliteration_keys(target, target_locale)
    if source_keys.intersection(target_keys):
        reasons = ["cyrtranslit_exact"]
        if source_script != target_script:
            reasons.append("cross_script_similarity")
        return 98, "transliteration_exact", tuple(reasons)

    score = round(fuzz.WRatio(source, target))
    if source_keys and target_keys:
        score = max(
            score,
            round(
                max(
                    fuzz.WRatio(source_key, target_key)
                    for source_key in source_keys
                    for target_key in target_keys
                )
            ),
        )
    reasons = ["rapidfuzz_name_similarity"]
    if source_script != target_script:
        reasons.append("cross_script_similarity")
    return min(max(score, 0), 100), "fuzzy_name", tuple(reasons)


def _transliteration_keys(value: str, locale: str) -> set[str]:
    keys: set[str] = set()
    if script_hint(value) in {"latin", "mixed"}:
        keys.add(_latin_key(value))

    language_codes = _CYRTRANSLIT_LOCALES.get(locale, ("ua", "bg", "ru"))
    for language_code in language_codes:
        try:
            key = _latin_key(cyrtranslit.to_latin(value, language_code))
        except (KeyError, ValueError):
            continue
        if key:
            keys.add(key)
    return keys


def _latin_key(value: str) -> str:
    expanded = value.translate(_TRANSLIT_ASCII_REPLACEMENTS)
    decomposed = unicodedata.normalize("NFKD", expanded)
    without_marks = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return normalize_catalog_name(without_marks)


def _confidence_bucket(score: int) -> str:
    if score >= MATCH_SCORE_HIGH:
        return "high"
    if score >= MATCH_SCORE_MEDIUM:
        return "medium"
    return "low"


def _matching_fingerprint(*values: str) -> str:
    payload = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _suggestion_rank(suggestion: CatalogMatchSuggestion) -> tuple[Any, ...]:
    type_rank = {
        "normalized_exact": 0,
        "transliteration_exact": 1,
        "fuzzy_name": 2,
        "no_safe_match": 3,
    }
    return (
        -suggestion.score,
        type_rank[suggestion.match_type],
        (suggestion.matched_name or "").casefold(),
        suggestion.target_locale or "",
        (suggestion.target_canonical_name or "").casefold(),
        suggestion.candidate_key,
    )


def _safe_evidence(
    *,
    score: int,
    confidence_bucket: str,
    match_type: str,
    normalized_input: str,
    candidate_display_name: str | None,
    candidate_canonical_name: str | None,
    source_locale: str,
    target_locale: str | None,
    source_script: str,
    target_script: str | None,
    catalog_kind: str,
    affected_object_count: int,
    reason_codes: tuple[str, ...],
) -> dict[str, Any]:
    return {
        "schemaVersion": MATCH_EVIDENCE_SCHEMA_VERSION,
        "score": score,
        "confidenceBucket": confidence_bucket,
        "matchType": match_type,
        "normalizedInput": normalized_input,
        "candidateDisplayName": candidate_display_name,
        "candidateCanonicalName": candidate_canonical_name,
        "sourceLocale": source_locale,
        "targetLocale": target_locale,
        "sourceScript": source_script,
        "targetScript": target_script,
        "catalogKind": catalog_kind,
        "affectedObjectCount": affected_object_count,
        "reasonCodes": list(reason_codes),
        "thresholds": {
            "high": MATCH_SCORE_HIGH,
            "medium": MATCH_SCORE_MEDIUM,
            "low": MATCH_SCORE_LOW,
        },
    }


def _required_text(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required for catalog matching")
    return value.strip()


def _required_identifier(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise ValueError(f"{key} is required for catalog matching")


def _locale(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "und"
    locale = value.strip().lower()[:16]
    return locale if len(locale) >= 2 else "und"
