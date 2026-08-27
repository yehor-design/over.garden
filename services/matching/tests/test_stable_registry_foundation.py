from contextlib import nullcontext

from app import stable_registry_foundation


RELEASE_ID = "00000000-0000-4000-8000-000000000255"
SNAPSHOT_ID = "00000000-0000-4000-8000-000000000254"


class _Result:
    def __init__(self, *, one=None, many=None):
        self._one = one
        self._many = many or []

    def fetchone(self):
        return self._one

    def fetchall(self):
        return self._many


class _Connection:
    def __init__(self):
        self.calls = []
        self.release_state = "building"

    def transaction(self):
        return nullcontext()

    def execute(self, statement, parameters=()):
        self.calls.append((statement, parameters))
        normalized = " ".join(statement.split())
        if "from catalog_registry_releases as releases" in normalized:
            return _Result(
                one={
                    "id": RELEASE_ID,
                    "state": self.release_state,
                    "capture_id": "00000000-0000-4000-8000-000000000253",
                    "source_snapshot_id": SNAPSHOT_ID,
                    "policy_version": "ove255.foundation.v1",
                    "build_digest": "a" * 64,
                    "manifest_sha256": "b" * 64,
                }
            )
        if "set state = 'building'" in normalized:
            self.release_state = "building"
            return _Result(one={"id": RELEASE_ID})
        if "group by reason_class" in normalized:
            return _Result(
                many=[
                    {
                        "reason_class": "authority_corroboration_required",
                        "member_count": 3,
                    },
                    {
                        "reason_class": "source_only_or_ineligible",
                        "member_count": 2,
                    },
                ]
            )
        if "source_record_count" in normalized:
            return _Result(
                one={
                    "source_record_count": 5,
                    "product_eligible_member_count": 2,
                    "exception_group_count": 2,
                }
            )
        if "returning id" in normalized:
            return _Result(one={"id": RELEASE_ID})
        return _Result()


def test_foundation_worker_reads_only_safe_aggregate_source_facts():
    conn = _Connection()

    stable_registry_foundation.build_foundation_release(conn, RELEASE_ID)

    statements = "\n".join(statement for statement, _ in conn.calls)
    assert "catalog_source_records" in statements
    assert "allowed_projection" in statements
    assert "raw_payload" not in statements
    assert "source_only_fields" not in statements
    assert "latitude" not in statements
    assert "longitude" not in statements
    assert "insert into catalog_items" not in statements
    assert "catalog_registry_exception_groups" in statements
    assert "catalog_registry_release_members" in statements


def test_foundation_worker_persists_a_resumable_draft_to_building_transition():
    conn = _Connection()
    conn.release_state = "draft"

    stable_registry_foundation.build_foundation_release(conn, RELEASE_ID)

    statements = "\n".join(statement for statement, _ in conn.calls)
    assert "set state = 'building'" in statements
    assert "build_started_at = now()" in statements


def test_foundation_worker_uses_an_opaque_release_id_and_safe_aggregate_summary():
    conn = _Connection()

    stable_registry_foundation.build_foundation_release(conn, RELEASE_ID)

    summary_statement, summary_parameters = next(
        (statement, parameters)
        for statement, parameters in conn.calls
        if "set state = 'review_ready'" in statement
    )
    assert "review_ready" in summary_statement
    safe_summary = summary_parameters[0]
    assert '"sourceRecordCount":5' in safe_summary
    assert "prefname" not in safe_summary
    assert "raw_payload" not in safe_summary


def test_terminal_failure_only_changes_a_building_foundation_release():
    conn = _Connection()

    stable_registry_foundation.mark_foundation_release_failed(conn, RELEASE_ID)

    statement, parameters = conn.calls[0]
    assert "set state = 'failed'" in statement
    assert "and state = 'building'" in statement
    assert parameters == (RELEASE_ID,)
