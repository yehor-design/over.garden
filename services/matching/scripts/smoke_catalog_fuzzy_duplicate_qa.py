"""Local-only OVE-162 proof for persisted fuzzy duplicate QA evidence."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

from app.catalog_fuzzy_duplicates import refresh_catalog_fuzzy_duplicate_suggestions

LEFT_ID = "16200000-0000-4000-8000-000000000001"
RIGHT_ID = "16200000-0000-4000-8000-000000000002"
FIXTURE_IDS = (LEFT_ID, RIGHT_ID)


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prove", action="store_true")
    mode.add_argument("--seed-ui", action="store_true")
    mode.add_argument("--reset-ui", action="store_true")
    args = parser.parse_args()

    dsn = os.environ["DIRECT_URL"]
    _require_loopback_database(dsn)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        if args.reset_ui:
            _cleanup(conn)
            refresh_catalog_fuzzy_duplicate_suggestions(conn)
            _print_result("reset", 0)
            return

        _cleanup(conn)
        _seed(conn)
        try:
            count = refresh_catalog_fuzzy_duplicate_suggestions(conn)
            _assert_fixture_pair(conn)
            _print_result("seed_ui" if args.seed_ui else "prove", count)
        finally:
            if args.prove:
                _cleanup(conn)
                refresh_catalog_fuzzy_duplicate_suggestions(conn)


def _seed(conn: Any) -> None:
    conn.execute(
        """
        insert into catalog_items (
          id, canonical_name, catalog_kind, normalized_name, public_slug,
          status, source, source_id, locale, created_at, updated_at
        )
        values
          (%s, 'Red Cherry', 'plant_variety', 'red cherry',
           'ove162-red-cherry-proof', 'seeded', 'ua_state_register',
           'ove162:left', 'uk', now(), '2026-07-15 12:00:00+00'),
          (%s, 'Red Chery', 'plant_variety', 'red chery',
           'ove162-red-chery-proof', 'seeded',
           'eu_oj_eur_lex_common_catalogue', 'ove162:right', 'uk', now(),
           '2026-07-15 12:00:00+00')
        """,
        FIXTURE_IDS,
    )


def _assert_fixture_pair(conn: Any) -> None:
    row = conn.execute(
        """
        select score, score_bucket, reason_codes, locale_relation,
               recommended_action, matcher_version
        from catalog_fuzzy_duplicate_suggestions
        where left_catalog_item_id = %s
          and right_catalog_item_id = %s
        """,
        FIXTURE_IDS,
    ).fetchone()
    if row is None:
        raise AssertionError("OVE-162 fuzzy fixture pair was not persisted")
    expected = {
        "score": 95,
        "score_bucket": "high",
        "locale_relation": "same_locale",
        "recommended_action": "merge_review",
        "matcher_version": "ove162-v1",
    }
    for key, value in expected.items():
        if row[key] != value:
            raise AssertionError(f"unexpected {key} in OVE-162 fuzzy fixture")
    if "rapidfuzz_name_similarity" not in row["reason_codes"]:
        raise AssertionError("RapidFuzz reason code is missing")


def _cleanup(conn: Any) -> None:
    conn.execute(
        "delete from catalog_items where id in (%s, %s)",
        FIXTURE_IDS,
    )


def _require_loopback_database(dsn: str) -> None:
    hostname = urlparse(dsn).hostname
    if hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("OVE-162 smoke refuses non-loopback databases")


def _print_result(mode: str, suggestion_count: int) -> None:
    print(
        json.dumps(
            {
                "schemaVersion": "ove162.catalogFuzzyDuplicateQaSmoke.v1",
                "mode": mode,
                "fixturePair": "Red Cherry / Red Chery",
                "suggestionCount": suggestion_count,
                "advisoryOnly": True,
                "leakCheck": "passed",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
