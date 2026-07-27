"""OVE-234 — precise-location text firewall (Python worker mirror).

AGENTS.md hard rule 1 forbids precise coordinates on any OverGarden user
surface. The authoritative TypeScript policy lives in
``apps/web/src/lib/privacy/precise-location-text.ts``; this module mirrors it
for the worker so the derived Meilisearch projection cannot re-publish a
legacy coordinate-bearing row that predates the write-side firewall.

Both implementations are pinned to the shared corpus in
``contracts/privacy/precise-location-text-corpus.json``.

Findings never carry the offending text, so a refusal stays safe to log.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

POLICY_VERSION = "ove234.precise-location.v1"

UNLABELED_PAIR_MIN_FRACTION_DIGITS = 3
LABELED_MIN_FRACTION_DIGITS = 2

MAX_SCAN_CHARS = 200_000

_IGNORABLE = re.compile(
    "[­؜​-‏‪-‮⁠-⁤⁦-⁩﻿]"
)
_MINUS = re.compile("[‐-―−˗－]")
_DEGREE = re.compile("[°º˚̊∘ᵒ]")
_PRIME = re.compile("[′‵ʹʼ´‘’‛＇]")
_DOUBLE_PRIME = re.compile(
    "[″‶ʺ˝“”„＂]"
)
_COMMA = re.compile("[，、،]")
_DOT = re.compile("[．。]")
_WHITESPACE = re.compile(r"\s+")

_NORTH_SOUTH = "NSnsСЮсю"
_EAST_WEST = "EWewВЗвз"
_HEMISPHERE = f"(?:Пн|Пд|Сх|Зх|пн|пд|сх|зх|[{_NORTH_SOUTH}{_EAST_WEST}])"

_COORDINATE_LABEL = re.compile(
    r"(?:\blat(?:itude)?\b|\blong(?:itude)?\b|\blon\b|\blng\b|\bgps\b"
    r"|\bgeo(?:location|position)?\b|\bcoord(?:inate)?s?\b"
    r"|координат|широт|довгот|долгот|геолокац|геопозиц)",
    re.IGNORECASE,
)

_GEO_URI = re.compile(
    r"geo:\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)",
    re.IGNORECASE,
)
_URL_TOKEN = re.compile(r"(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)
_URL_NUMBER = re.compile(r"[-+]?\d{1,3}\.\d{2,}")
_PLUS_CODE = re.compile(
    r"(?<![0-9A-Z+])[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}"
    r"(?![0-9A-Z+])",
    re.IGNORECASE,
)
_DMS = re.compile(
    rf"({_HEMISPHERE})?\s*(\d{{1,3}})\s*°\s*(\d{{1,2}})\s*'\s*"
    rf"(?:(\d{{1,2}}(?:[.,]\d+)?)\s*\"\s*)?({_HEMISPHERE})?"
)
_HEMISPHERE_DECIMAL = re.compile(
    rf"(?:(?<![^\W\d_])({_HEMISPHERE})\s*([-+]?\d{{1,3}}\.\d+)\s*°?"
    rf"|([-+]?\d{{1,3}}\.\d+)\s*°?\s*({_HEMISPHERE}))(?![^\W\d_]|\d)"
)
_LABELED_NUMBER = re.compile(r"(?<![\d.,\-+/:])[-+]?\d{1,3}[.,]\d+(?![\d.,])")
_DECIMAL_PAIR = re.compile(
    r"(?<![\d.,\-+/:°'\"])([-+]?\d{1,3}\.\d+)\s*[,;/]\s*([-+]?\d{1,3}\.\d+)"
    r"(?![\d.,])"
)
_COMMA_DECIMAL_PAIR = re.compile(
    r"(?<![\d.,\-+/:°'\"])([-+]?\d{1,3},\d+)\s*[; ]\s*([-+]?\d{1,3},\d+)"
    r"(?![\d.,])"
)
_FRACTION = re.compile(r"[.,](\d+)")


@dataclass(frozen=True)
class PreciseLocationFinding:
    """Classification only — never the offending value."""

    kind: str
    policy_version: str = POLICY_VERSION


def _fold_glyphs(value: str) -> str:
    value = _IGNORABLE.sub("", value)
    value = _MINUS.sub("-", value)
    value = _DEGREE.sub("°", value)
    value = _DOUBLE_PRIME.sub('"', value)
    value = _PRIME.sub("'", value)
    value = _COMMA.sub(",", value)
    return _DOT.sub(".", value)


def normalize_scan_text(value: object) -> str:
    """Unicode-normalize a candidate so copy-paste variants collapse to ASCII."""
    if not isinstance(value, str) or not value:
        return ""
    bounded = value[:MAX_SCAN_CHARS]
    # Glyph folding runs before NFKC because NFKC itself decomposes some
    # coordinate punctuation into look-alike ASCII (`º`->`o`, `″`->`''`).
    folded = _fold_glyphs(unicodedata.normalize("NFKC", _fold_glyphs(bounded)))
    return _WHITESPACE.sub(" ", folded).strip()


def _fraction_digits(value: str) -> int:
    match = _FRACTION.search(value)
    return len(match.group(1)) if match else 0


def _numeric(value: str) -> float:
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return float("nan")


def _is_latitude(value: str) -> bool:
    parsed = abs(_numeric(value))
    return parsed == parsed and parsed <= 90


def _is_longitude(value: str) -> bool:
    parsed = abs(_numeric(value))
    return parsed == parsed and parsed <= 180


def _is_coordinate_pair(first: str, second: str) -> bool:
    return (_is_latitude(first) and _is_longitude(second)) or (
        _is_longitude(first) and _is_latitude(second)
    )


def _hemisphere_axis(marker: str | None) -> str | None:
    if not marker:
        return None
    if re.fullmatch(r"[Пп][нд]", marker):
        return "ns"
    if re.fullmatch(r"[СсЗз]х", marker):
        return "ew"
    head = marker[0]
    if head in _NORTH_SOUTH:
        return "ns"
    if head in _EAST_WEST:
        return "ew"
    return None


def _find_geo_uri(value: str) -> PreciseLocationFinding | None:
    for match in _GEO_URI.finditer(value):
        if _is_coordinate_pair(match.group(1), match.group(2)):
            return PreciseLocationFinding("geo_uri")
    return None


def _find_map_url(value: str) -> PreciseLocationFinding | None:
    for match in _URL_TOKEN.finditer(value):
        numbers = _URL_NUMBER.findall(match.group(0))
        for index in range(len(numbers) - 1):
            if _is_coordinate_pair(numbers[index], numbers[index + 1]):
                return PreciseLocationFinding("map_url_coordinates")
    return None


def _find_dms(value: str) -> PreciseLocationFinding | None:
    matches = []
    for match in _DMS.finditer(value):
        degrees = int(match.group(2))
        minutes = int(match.group(3))
        seconds = _numeric(match.group(4)) if match.group(4) else 0.0
        if degrees <= 180 and minutes < 60 and seconds < 60:
            matches.append(match)

    if len(matches) >= 2:
        return PreciseLocationFinding("degrees_minutes_seconds")
    if len(matches) == 1 and (matches[0].group(1) or matches[0].group(5)):
        return PreciseLocationFinding("degrees_minutes_seconds")
    return None


def _find_hemisphere_decimal(
    value: str, labeled: bool
) -> PreciseLocationFinding | None:
    axes: set[str] = set()
    for match in _HEMISPHERE_DECIMAL.finditer(value):
        marker = match.group(1) or match.group(4)
        number = match.group(2) or match.group(3)
        if _fraction_digits(number) < LABELED_MIN_FRACTION_DIGITS:
            continue
        axis = _hemisphere_axis(marker)
        if axis is None:
            continue
        if axis == "ns" and not _is_latitude(number):
            continue
        if axis == "ew" and not _is_longitude(number):
            continue
        axes.add(axis)

    # A single hemisphere-marked number is ambiguous with units (W, N, В).
    if len(axes) >= 2 or (len(axes) == 1 and labeled):
        return PreciseLocationFinding("hemisphere_decimal")
    return None


def _find_plus_code(value: str) -> PreciseLocationFinding | None:
    return PreciseLocationFinding("plus_code") if _PLUS_CODE.search(value) else None


def _find_labeled_decimal(value: str) -> PreciseLocationFinding | None:
    for label in _COORDINATE_LABEL.finditer(value):
        window = value[label.end() : label.end() + 32]
        for number in _LABELED_NUMBER.finditer(window):
            text = number.group(0)
            if _fraction_digits(text) < LABELED_MIN_FRACTION_DIGITS:
                continue
            if not _is_longitude(text):
                continue
            return PreciseLocationFinding("labeled_decimal")
    return None


def _find_decimal_pair(value: str, labeled: bool) -> PreciseLocationFinding | None:
    threshold = (
        LABELED_MIN_FRACTION_DIGITS if labeled else UNLABELED_PAIR_MIN_FRACTION_DIGITS
    )
    for pattern in (_DECIMAL_PAIR, _COMMA_DECIMAL_PAIR):
        for match in pattern.finditer(value):
            first, second = match.group(1), match.group(2)
            if _fraction_digits(first) < threshold:
                continue
            if _fraction_digits(second) < threshold:
                continue
            if not _is_coordinate_pair(first, second):
                continue
            return PreciseLocationFinding("decimal_pair")
    return None


def find_precise_location_text(value: object) -> PreciseLocationFinding | None:
    """First precise-location classification for one value, or None if safe."""
    normalized = normalize_scan_text(value)
    if not normalized:
        return None

    labeled = _COORDINATE_LABEL.search(normalized) is not None

    return (
        _find_geo_uri(normalized)
        or _find_map_url(normalized)
        or _find_dms(normalized)
        or _find_hemisphere_decimal(normalized, labeled)
        or _find_plus_code(normalized)
        or _find_labeled_decimal(normalized)
        or _find_decimal_pair(normalized, labeled)
    )


def contains_precise_location_text(value: object) -> bool:
    return find_precise_location_text(value) is not None
