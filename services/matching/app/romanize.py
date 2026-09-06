"""Romanization and slugging, identical to `apps/web/src/lib/catalog/slugs.ts`.

ADR-0026 D8 fixes one spelling for a form's address: Ukrainian per the Cabinet
of Ministers resolution 55 of 2010 (with the positional rules for Є, Ї, Й, Ю,
Я, the dropped soft sign and apostrophe, and `зг` → `zgh`), Bulgarian per the
2009 transliteration law, Latin-script names folded to ASCII. The
reconciliation ladder needs the same spelling to recognise a denomination a
source published in Latin, so the table lives here as well and both
implementations are held to one fixture,
`contracts/catalog/form-slug.fixture.json` — the pattern
`catalog_normalize_name` already uses across SQL, TypeScript and Python.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Final, Literal

SlugLanguage = Literal["uk", "bg", "latin"]

UKRAINIAN: Final[dict[str, str]] = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e",
    "ж": "zh", "з": "z", "и": "y", "і": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ь": "",
    # Letters of neighbouring alphabets that reach a Ukrainian register row.
    "ы": "y", "э": "e", "ё": "yo", "ъ": "",
}

UKRAINIAN_POSITIONAL: Final[dict[str, tuple[str, str]]] = {
    "є": ("ye", "ie"),
    "ї": ("yi", "i"),
    "й": ("y", "i"),
    "ю": ("yu", "iu"),
    "я": ("ya", "ia"),
}

BULGARIAN: Final[dict[str, str]] = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sht", "ъ": "a",
    "ь": "y", "ю": "yu", "я": "ya",
    # Neighbouring alphabets.
    "і": "i", "ї": "i", "є": "e", "ґ": "g", "ы": "y", "э": "e", "ё": "yo",
}

_APOSTROPHES = re.compile(r"[’‘ʼʹ`´′']")
_CYRILLIC_LETTER = re.compile(r"[Ѐ-ӿԀ-ԯ]")
_NUMBER_SIGNS = re.compile(r"[№#]")
_MULTIPLICATION = re.compile(r"[×✕]")
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_ASCII_REPLACEMENTS: Final[tuple[tuple[str, str], ...]] = (
    ("ø", "o"), ("ł", "l"), ("ß", "ss"), ("æ", "ae"), ("œ", "oe"),
    ("ð", "d"), ("đ", "d"), ("þ", "th"),
)


def romanize_ukrainian(text: str) -> str:
    """Resolution 55 (2010), letter case preserved."""
    source = _APOSTROPHES.sub("", unicodedata.normalize("NFC", text))
    characters = list(source)
    output: list[str] = []
    previous: str | None = None
    index = 0
    while index < len(characters):
        character = characters[index]
        lower = character.lower()
        upper = character != lower
        word_initial = previous is None or not _CYRILLIC_LETTER.match(previous)
        following = characters[index + 1].lower() if index + 1 < len(characters) else None
        romanized: str | None = None
        if lower == "з" and following == "г":
            romanized = "zgh"
            index += 1
        elif lower in UKRAINIAN_POSITIONAL:
            initial, elsewhere = UKRAINIAN_POSITIONAL[lower]
            romanized = initial if word_initial else elsewhere
        elif lower in UKRAINIAN:
            romanized = UKRAINIAN[lower]
        output.append(character if romanized is None else (_capitalize(romanized) if upper else romanized))
        previous = character
        index += 1
    return "".join(output)


def romanize_bulgarian(text: str) -> str:
    """The 2009 transliteration law, case preserved; word-final `ия` is `ia`."""
    source = _APOSTROPHES.sub("", unicodedata.normalize("NFC", text))
    characters = list(source)
    output: list[str] = []
    index = 0
    while index < len(characters):
        character = characters[index]
        lower = character.lower()
        upper = character != lower
        following = characters[index + 1].lower() if index + 1 < len(characters) else None
        after = characters[index + 2] if index + 2 < len(characters) else " "
        if lower == "и" and following == "я" and not _CYRILLIC_LETTER.match(after):
            output.append("Ia" if upper else "ia")
            index += 2
            continue
        romanized = BULGARIAN.get(lower)
        output.append(character if romanized is None else (_capitalize(romanized) if upper else romanized))
        index += 1
    return "".join(output)


def to_ascii_slug(text: str) -> str:
    """Lower-case ASCII, words joined with `-`, `×` as `x`, nothing else."""
    # Compatibility decomposition would spell № as "No"; it is a separator.
    value = _NUMBER_SIGNS.sub(" ", text)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = _MULTIPLICATION.sub("x", value)
    value = value.lower()
    for source, replacement in _ASCII_REPLACEMENTS:
        value = value.replace(source, replacement)
    return _NON_SLUG.sub("-", value).strip("-")


def species_slug_from_scientific_name(scientific_name: str) -> str:
    return to_ascii_slug(scientific_name)


def form_slug_from_denomination(denomination: str, language: SlugLanguage = "uk") -> str:
    if language == "uk":
        romanized = romanize_ukrainian(denomination)
    elif language == "bg":
        romanized = romanize_bulgarian(denomination)
    else:
        romanized = denomination
    return to_ascii_slug(romanized)


def _capitalize(value: str) -> str:
    return value[:1].upper() + value[1:]
