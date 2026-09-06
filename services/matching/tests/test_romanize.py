"""One fixture, two implementations (ADR-0026 D8).

`contracts/catalog/form-slug.fixture.json` is authored once and read by the
TypeScript slug module and by this one. A romanization that drifts between
the address a form is published at and the spelling the reconciliation ladder
matches would link the wrong organisms, and no unit test written against
either implementation alone could see it.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.romanize import (
    form_slug_from_denomination,
    romanize_bulgarian,
    romanize_ukrainian,
    species_slug_from_scientific_name,
    to_ascii_slug,
)

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "catalog"
    / "form-slug.fixture.json"
)


def load_cases() -> list[dict[str, str]]:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert document["version"] == "ove388.form-slug.v1"
    cases = document["cases"]
    assert len(cases) >= 50, "the fixture is the contract; it may not shrink"
    return cases


@pytest.mark.parametrize("case", load_cases(), ids=lambda case: case["denomination"])
def test_every_fixture_case_romanizes_to_its_published_slug(case: dict[str, str]) -> None:
    assert form_slug_from_denomination(case["denomination"], case["language"]) == case["slug"]


def test_the_positional_rules_of_resolution_55() -> None:
    # Є, Ї, Й, Ю, Я word-initially versus elsewhere.
    assert romanize_ukrainian("Єнакієве") == "Yenakiieve"
    assert romanize_ukrainian("Їжакевич") == "Yizhakevych"
    assert romanize_ukrainian("Йосипівка") == "Yosypivka"
    assert romanize_ukrainian("Юрій") == "Yurii"
    assert romanize_ukrainian("Яготин") == "Yahotyn"
    # зг is zgh, so it is never read back as ж.
    assert romanize_ukrainian("Згорани") == "Zghorany"
    # The soft sign and the apostrophe disappear.
    assert romanize_ukrainian("Русь") == "Rus"
    assert romanize_ukrainian("З'їзд") == "Zizd"


def test_the_bulgarian_law_and_its_word_final_rule() -> None:
    assert romanize_bulgarian("София") == "Sofia"
    assert romanize_bulgarian("Щъркел") == "Shtarkel"
    assert romanize_bulgarian("Ямбол") == "Yambol"


def test_ascii_slugs_fold_diacritics_and_the_hybrid_sign() -> None:
    assert species_slug_from_scientific_name("Solanum lycopersicum") == "solanum-lycopersicum"
    assert species_slug_from_scientific_name("Prunus × domestica") == "prunus-x-domestica"
    assert to_ascii_slug("Sorte № 5") == "sorte-5"
    assert to_ascii_slug("Œuf de Bœuf") == "oeuf-de-boeuf"
