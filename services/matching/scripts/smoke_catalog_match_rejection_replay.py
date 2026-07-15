"""OVE-159 local Postgres proof for rejected suggestion replay rules."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

from app.catalog_matching import refresh_catalog_match_suggestions


SOURCE_ID = "15940000-0000-4000-8000-000000000001"
TARGET_ID = "15940000-0000-4000-8000-000000000002"
OWNER_USER_ID = "15940000-0000-4000-8000-000000000003"
OPERATOR_USER_ID = "15940000-0000-4000-8000-000000000004"
SPACE_ID = "15940000-0000-4000-8000-000000000005"
OBJECT_ID = "15940000-0000-4000-8000-000000000006"
DISPLAY_NAME = "OVE-159 Replay Identity"
CHANGED_CANONICAL_NAME = "OVE-159 Replay Identity Canonical"


def main() -> None:
    dsn = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DIRECT_URL or DATABASE_URL is required")
    assert_loopback_postgres_dsn(dsn)

    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        cleanup(conn)
        try:
            seed_catalog_rows(conn)
            assert refresh_catalog_match_suggestions(conn, SOURCE_ID) >= 1
            suggestion = read_fixture_suggestion(conn)
            assert_equal(suggestion["status"], "pending", "initial status")

            reject_fixture_suggestion(conn)
            rejected = read_fixture_suggestion(conn)

            assert refresh_catalog_match_suggestions(conn, SOURCE_ID) >= 1
            assert_rejection_preserved(
                read_fixture_suggestion(conn),
                rejected,
                "unchanged evidence",
            )

            touch_matching_timestamps(conn)
            assert refresh_catalog_match_suggestions(conn, SOURCE_ID) >= 1
            assert_rejection_preserved(
                read_fixture_suggestion(conn),
                rejected,
                "timestamp-only import touch",
            )

            seed_affected_object(conn)
            assert refresh_catalog_match_suggestions(conn, SOURCE_ID) >= 1
            assert_rejection_preserved(
                read_fixture_suggestion(conn),
                rejected,
                "affected-object count only",
            )

            change_target_matching_input(conn)
            assert refresh_catalog_match_suggestions(conn, SOURCE_ID) >= 1
            reopened = read_fixture_suggestion(conn)
            assert_equal(reopened["status"], "pending", "reopened status")
            assert_equal(
                reopened["target_canonical_name"],
                CHANGED_CANONICAL_NAME,
                "reopened target canonical name",
            )
            assert_equal(reopened["affected_object_count"], 1, "reopened object count")
            for field in (
                "reviewed_at",
                "reviewed_by_user_id",
                "decision_reason_code",
                "decision_result",
                "decision_affected_object_count",
            ):
                assert_equal(reopened[field], None, f"reopened {field}")

            print(
                json.dumps(
                    {
                        "ok": True,
                        "issue": "OVE-159",
                        "unchangedEvidenceKeepsRejection": True,
                        "timestampOnlyTouchKeepsRejection": True,
                        "objectCountOnlyKeepsRejection": True,
                        "materialEvidenceChangeReopensSuggestion": True,
                        "previousDecisionClearedOnReopen": True,
                        "productionDataTouched": False,
                    },
                    indent=2,
                )
            )
        finally:
            cleanup(conn)


def seed_catalog_rows(conn: Any) -> None:
    with conn.transaction():
        conn.execute(
            """
            insert into catalog_items (
              id, canonical_name, normalized_name, catalog_kind, status,
              source, source_id, created_by_user_id, locale, created_at, updated_at
            ) values (
              %s, %s, lower(%s), 'plant_variety', 'provisional',
              'user_added', 'ove-159-replay-source', %s, 'en',
              '2026-07-15 08:00:00+00', '2026-07-15 08:00:00+00'
            ), (
              %s, %s, lower(%s), 'plant_variety', 'seeded',
              'internal_seed', 'ove-159-replay-target', null, 'en',
              '2026-07-15 08:00:00+00', '2026-07-15 08:00:00+00'
            )
            """,
            (
                SOURCE_ID,
                DISPLAY_NAME,
                DISPLAY_NAME,
                OWNER_USER_ID,
                TARGET_ID,
                DISPLAY_NAME,
                DISPLAY_NAME,
            ),
        )
        conn.execute(
            """
            insert into catalog_item_names (
              catalog_item_id, display_name, normalized_name, locale, is_primary
            ) values (%s, %s, lower(%s), 'en', true)
            """,
            (TARGET_ID, DISPLAY_NAME, DISPLAY_NAME),
        )


def reject_fixture_suggestion(conn: Any) -> None:
    conn.execute(
        """
        update catalog_match_suggestions
        set status = 'rejected',
            reviewed_at = '2026-07-15 08:10:00+00',
            reviewed_by_user_id = %s,
            decision_reason_code = 'not_same_entity',
            decision_result = 'suggestion_rejected',
            decision_affected_object_count = 0,
            updated_at = '2026-07-15 08:10:00+00'
        where source_catalog_item_id = %s
          and target_catalog_item_id = %s
          and status = 'pending'
        """,
        (OPERATOR_USER_ID, SOURCE_ID, TARGET_ID),
    )


def seed_affected_object(conn: Any) -> None:
    with conn.transaction():
        conn.execute(
            """
            insert into spaces (
              id, owner_user_id, display_name, location_visibility,
              created_at, updated_at
            ) values (%s, %s, 'OVE-159 replay space', 'hidden', now(), now())
            """,
            (SPACE_ID, OWNER_USER_ID),
        )
        conn.execute(
            """
            insert into plant_objects (
              id, owner_user_id, space_id, display_name, object_kind,
              catalog_item_id, variety_text, variety_state, location_visibility,
              created_at, updated_at
            ) values (
              %s, %s, %s, 'OVE-159 replay object', 'plant',
              %s, %s, 'user_added', 'hidden', now(), now()
            )
            """,
            (OBJECT_ID, OWNER_USER_ID, SPACE_ID, SOURCE_ID, DISPLAY_NAME),
        )


def touch_matching_timestamps(conn: Any) -> None:
    conn.execute(
        """
        update catalog_items
        set updated_at = '2026-07-15 08:15:00+00'
        where id in (%s, %s)
        """,
        (SOURCE_ID, TARGET_ID),
    )


def change_target_matching_input(conn: Any) -> None:
    conn.execute(
        """
        update catalog_items
        set canonical_name = %s,
            updated_at = '2026-07-15 08:20:00+00'
        where id = %s
        """,
        (CHANGED_CANONICAL_NAME, TARGET_ID),
    )


def read_fixture_suggestion(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        """
        select status, target_canonical_name, affected_object_count,
               reviewed_at, reviewed_by_user_id, decision_reason_code,
               decision_result, decision_affected_object_count
        from catalog_match_suggestions
        where source_catalog_item_id = %s
          and target_catalog_item_id = %s
        """,
        (SOURCE_ID, TARGET_ID),
    ).fetchone()
    if row is None:
        raise AssertionError("fixture suggestion was not persisted")
    return row


def assert_rejection_preserved(
    actual: dict[str, Any], expected: dict[str, Any], label: str
) -> None:
    for field in (
        "status",
        "target_canonical_name",
        "reviewed_at",
        "reviewed_by_user_id",
        "decision_reason_code",
        "decision_result",
        "decision_affected_object_count",
    ):
        assert_equal(actual[field], expected[field], f"{label} {field}")


def cleanup(conn: Any) -> None:
    with conn.transaction():
        conn.execute("delete from plant_objects where id = %s", (OBJECT_ID,))
        conn.execute("delete from spaces where id = %s", (SPACE_ID,))
        conn.execute(
            "delete from catalog_match_suggestions where source_catalog_item_id = %s",
            (SOURCE_ID,),
        )
        conn.execute(
            "delete from catalog_items where id in (%s, %s)",
            (SOURCE_ID, TARGET_ID),
        )


def assert_loopback_postgres_dsn(dsn: str) -> None:
    parsed = urlparse(dsn)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise RuntimeError("OVE-159 smoke requires a Postgres URL")
    if (parsed.hostname or "").lower() not in {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    }:
        raise RuntimeError(
            "OVE-159 smoke refuses non-loopback databases before any write"
        )
    if not parsed.path.strip("/"):
        raise RuntimeError("OVE-159 smoke requires a named local database")


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


if __name__ == "__main__":
    main()
