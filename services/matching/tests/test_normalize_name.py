from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import normalize_name as module

CONTRACTS = Path(__file__).resolve().parents[3] / "contracts" / "catalog"


def _read(name: str) -> dict:
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def _code_point(notation: str) -> int:
    assert notation.startswith("U+"), notation
    return int(notation[2:], 16)


FIXTURE = _read("normalize-name.fixture.json")
MAPPING = _read("normalize-name.mapping.json")


def test_fixture_holds_at_least_two_hundred_cases() -> None:
    assert len(FIXTURE["cases"]) >= 200


@pytest.mark.parametrize(
    ("note", "value", "expected"),
    [(case["note"], case["input"], case["expected"]) for case in FIXTURE["cases"]],
)
def test_fixture_case(note: str, value: str, expected: str) -> None:
    assert module.normalize_name(value) == expected, note


def test_idempotent_over_fixture() -> None:
    for case in FIXTURE["cases"]:
        assert module.normalize_name(case["expected"]) == case["expected"]


def test_tables_match_the_shared_mapping_contract() -> None:
    assert list(module.SPACE_CODE_POINTS) == [_code_point(x) for x in MAPPING["space"]]
    assert list(module.APOSTROPHE_CODE_POINTS) == [
        _code_point(x) for x in MAPPING["apostrophe"]
    ]
    assert list(module.DOUBLE_QUOTE_CODE_POINTS) == [
        _code_point(x) for x in MAPPING["doubleQuoteToSpace"]
    ]
    assert list(module.DASH_CODE_POINTS) == [_code_point(x) for x in MAPPING["dash"]]
    assert list(module.HYBRID_SIGN_CODE_POINTS) == [
        _code_point(x) for x in MAPPING["hybridSign"]
    ]
    assert {base: list(points) for base, points in module.LATIN_FOLDS.items()} == {
        base: [_code_point(x) for x in points]
        for base, points in MAPPING["latinFolds"].items()
    }
    assert module.CYRILLIC_FOLDS == {
        _code_point(source): _code_point(target)
        for source, target in MAPPING["cyrillicFolds"].items()
    }
    assert module.MULTI_CHARACTER_FOLDS == {
        _code_point(source): target
        for source, target in MAPPING["multiCharacterFolds"].items()
    }
