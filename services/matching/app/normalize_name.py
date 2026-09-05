"""The one name normalizer of the organism graph (ADR-0026 D3).

Identical to ``catalog_normalize_name`` (SQL, migration 0054) and to
``normalizeCatalogName`` in ``apps/web/src/lib/catalog/normalize-name.ts``.
All three are held to ``contracts/catalog/normalize-name.fixture.json``; the
tables below are compared with ``contracts/catalog/normalize-name.mapping.json``
by ``tests/test_normalize_name.py``.

Steps, in order:

1. Unicode NFKC.
2. Every Unicode space and control whitespace becomes an ASCII space.
3. Lower case.
4. Single-character folds: apostrophe variants to ``'``, double-quote variants
   to a space, dash variants to ``-``, the hybrid sign to ``x``, Latin letters
   with diacritics to their base letter, and the Cyrillic folds ё→е, ґ→г, ѐ→е,
   ѝ→и.
5. Multi-character folds: ß→ss, æ→ae, œ→oe, þ→th, ð→d.
6. An apostrophe survives only between two characters that are neither a
   space, a hyphen, another apostrophe nor the string boundary.
7. Space runs collapse to one; the result is trimmed.

Authorship is not stripped here; that is the scientific-name parser's job.
Nothing here truncates: callers cap the length they store.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Final

SPACE_CODE_POINTS: Final[tuple[int, ...]] = (
    0x00A0,
    0x1680,
    0x2000,
    0x2001,
    0x2002,
    0x2003,
    0x2004,
    0x2005,
    0x2006,
    0x2007,
    0x2008,
    0x2009,
    0x200A,
    0x2028,
    0x2029,
    0x202F,
    0x205F,
    0x3000,
    0x0009,
    0x000A,
    0x000D,
    0x000C,
    0x000B,
)

APOSTROPHE_CODE_POINTS: Final[tuple[int, ...]] = (
    0x2019,
    0x2018,
    0x02BC,
    0x02B9,
    0x0060,
    0x00B4,
    0x2032,
    0x201A,
)

DOUBLE_QUOTE_CODE_POINTS: Final[tuple[int, ...]] = (
    0x0022,
    0x201C,
    0x201D,
    0x201E,
    0x00AB,
    0x00BB,
    0x2033,
)

DASH_CODE_POINTS: Final[tuple[int, ...]] = (
    0x2010,
    0x2011,
    0x2012,
    0x2013,
    0x2014,
    0x2212,
)

HYBRID_SIGN_CODE_POINTS: Final[tuple[int, ...]] = (0x00D7, 0x2715)

LATIN_FOLDS: Final[dict[str, tuple[int, ...]]] = {
    "a": (0x00E0, 0x00E1, 0x00E2, 0x00E3, 0x00E4, 0x00E5, 0x0101, 0x0103, 0x0105),
    "c": (0x00E7, 0x0107, 0x0109, 0x010B, 0x010D),
    "d": (0x010F, 0x0111),
    "e": (0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x0113, 0x0115, 0x0117, 0x0119, 0x011B),
    "g": (0x011D, 0x011F, 0x0121, 0x0123),
    "h": (0x0125, 0x0127),
    "i": (0x00EC, 0x00ED, 0x00EE, 0x00EF, 0x0129, 0x012B, 0x012D, 0x012F, 0x0131),
    "j": (0x0135,),
    "k": (0x0137,),
    "l": (0x013A, 0x013C, 0x013E, 0x0140, 0x0142),
    "n": (0x00F1, 0x0144, 0x0146, 0x0148),
    "o": (0x00F2, 0x00F3, 0x00F4, 0x00F5, 0x00F6, 0x00F8, 0x014D, 0x014F, 0x0151),
    "r": (0x0155, 0x0157, 0x0159),
    "s": (0x015B, 0x015D, 0x015F, 0x0161, 0x0219),
    "t": (0x0163, 0x0165, 0x0167, 0x021B),
    "u": (
        0x00F9,
        0x00FA,
        0x00FB,
        0x00FC,
        0x0169,
        0x016B,
        0x016D,
        0x016F,
        0x0171,
        0x0173,
    ),
    "w": (0x0175,),
    "y": (0x00FD, 0x00FF, 0x0177),
    "z": (0x017A, 0x017C, 0x017E),
}

CYRILLIC_FOLDS: Final[dict[int, int]] = {
    0x0451: 0x0435,
    0x0491: 0x0433,
    0x0450: 0x0435,
    0x045D: 0x0438,
}

MULTI_CHARACTER_FOLDS: Final[dict[int, str]] = {
    0x00DF: "ss",
    0x00E6: "ae",
    0x0153: "oe",
    0x00FE: "th",
    0x00F0: "d",
}


def _build_translation_table() -> dict[int, str]:
    table: dict[int, str] = {}
    for code_point in SPACE_CODE_POINTS:
        table[code_point] = " "
    for code_point in APOSTROPHE_CODE_POINTS:
        table[code_point] = "'"
    for code_point in DOUBLE_QUOTE_CODE_POINTS:
        table[code_point] = " "
    for code_point in DASH_CODE_POINTS:
        table[code_point] = "-"
    for code_point in HYBRID_SIGN_CODE_POINTS:
        table[code_point] = "x"
    for base, code_points in LATIN_FOLDS.items():
        for code_point in code_points:
            table[code_point] = base
    for source, target in CYRILLIC_FOLDS.items():
        table[source] = chr(target)
    for code_point, replacement in MULTI_CHARACTER_FOLDS.items():
        table[code_point] = replacement
    return table


TRANSLATION_TABLE: Final[dict[int, str]] = _build_translation_table()

_LEADING_APOSTROPHES = re.compile(r"(^|[ -])'+")
_TRAILING_APOSTROPHES = re.compile(r"'+([ -]|$)")
_SPACE_RUNS = re.compile(r" +")


def normalize_name(value: str) -> str:
    """Normalize a catalog name for matching and search.

    Pure and total; identical to the SQL and TypeScript implementations.
    """
    folded = unicodedata.normalize("NFKC", value).lower().translate(TRANSLATION_TABLE)
    folded = _LEADING_APOSTROPHES.sub(r"\1", folded)
    folded = _TRAILING_APOSTROPHES.sub(r"\1", folded)
    return _SPACE_RUNS.sub(" ", folded).strip()
