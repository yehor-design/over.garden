"""OVE-234 — the Python mirror must agree with the shared corpus contract."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import search
from app.precise_location import (
    POLICY_VERSION,
    contains_precise_location_text,
    find_precise_location_text,
    normalize_scan_text,
)

CORPUS_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts/privacy/precise-location-text-corpus.json"
)
CORPUS = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def test_corpus_is_pinned_to_the_current_policy_version() -> None:
    assert CORPUS["policyVersion"] == POLICY_VERSION
    assert len(CORPUS["rejected"]) >= 20
    assert len(CORPUS["accepted"]) >= 20


@pytest.mark.parametrize(
    "sample", CORPUS["rejected"], ids=[s["id"] for s in CORPUS["rejected"]]
)
def test_rejected_corpus(sample: dict) -> None:
    finding = find_precise_location_text(sample["text"])
    assert finding is not None
    assert finding.kind == sample["kind"]
    assert finding.policy_version == POLICY_VERSION


@pytest.mark.parametrize(
    "sample", CORPUS["accepted"], ids=[s["id"] for s in CORPUS["accepted"]]
)
def test_accepted_corpus(sample: dict) -> None:
    assert find_precise_location_text(sample["text"]) is None


def test_normalization_folds_unicode_variants() -> None:
    assert normalize_scan_text("５０．４５") == "50.45"
    assert normalize_scan_text("50º27′0.4″") == "50°27'0.4\""
    assert normalize_scan_text("−33.8") == "-33.8"
    assert normalize_scan_text(None) == ""
    assert normalize_scan_text(42) == ""


def test_scan_is_bounded() -> None:
    padding = "а" * 500_000
    assert contains_precise_location_text(f"{padding} 50.45010,30.52340") is False
    assert contains_precise_location_text(f"50.45010,30.52340 {padding}") is True


def _public_row(**overrides: object) -> dict:
    row = {
        "id": "11111111-1111-4111-8111-111111111111",
        "visibility": "public",
        "lifecycle_state": "active",
        "public_gone_at": None,
        "published_at": "2026-07-01T00:00:00+00:00",
        "owner_profile_public_safe": True,
        "title": "Перший урожай",
        "body": "Зібрав перші плоди у своєму саду.",
        "public_slug": "pershyi-urozhai",
        "entry_scope": "object",
        "location_visibility": "hidden",
        "entry_date": "2026-07-01",
        "created_at": "2026-07-01T00:00:00+00:00",
        "public_noindex": False,
        "cover_source": "none",
    }
    row.update(overrides)
    return row


def test_public_projection_accepts_a_safe_row() -> None:
    assert search.journal_entry_search_document_from_row(_public_row()) is not None


@pytest.mark.parametrize("field", ["title", "body"])
def test_public_projection_drops_legacy_coordinate_rows(field: str) -> None:
    row = _public_row(**{field: "Ділянка 50.45010,30.52340"})
    assert search.journal_entry_search_document_from_row(row) is None
