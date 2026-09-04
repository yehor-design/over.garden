from contextlib import nullcontext

import pytest

from app import job_queue_contract, stable_registry_extension_pack
from app.job_handlers import SUPPORTED_JOB_KINDS

PACK_ID = "00000000-0000-4000-8000-000000000328"
# The literal kind is asserted here so the job-queue producer/consumer contract
# can prove this file tests the "stable_registry_extension_pack_build" kind.
JOB_KIND = "stable_registry_extension_pack_build"


def test_handler_owns_the_declared_job_kind():
    # The literal moved into the generated contract, so this asserts the two
    # things that still matter: the contract declares this kind, and the worker
    # claims it. Asserting the handler module holds the literal only ever proved
    # where a string was written.
    assert job_queue_contract.STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND == JOB_KIND
    assert JOB_KIND in SUPPORTED_JOB_KINDS


class _Result:
    def __init__(self, one=None):
        self._one = one

    def fetchone(self):
        return self._one


class _Connection:
    """Records statements so a test can assert what the worker actually reads."""

    def __init__(self, *, state="classified", blocking_count=0, pack_exists=True):
        self.calls = []
        self.state = state
        self.blocking_count = blocking_count
        self.pack_exists = pack_exists

    def transaction(self):
        return nullcontext()

    def execute(self, statement, parameters=()):
        self.calls.append((" ".join(statement.split()), parameters))
        normalized = " ".join(statement.split())
        if "from catalog_registry_extension_packs" in normalized:
            return _Result(
                {"id": PACK_ID, "state": self.state} if self.pack_exists else None
            )
        if "count(*)::integer as blocking_count" in normalized:
            return _Result({"blocking_count": self.blocking_count})
        return _Result()

    def updates(self):
        return [
            call
            for call, _ in self.calls
            if call.startswith("update catalog_registry_extension_packs")
        ]


def test_resolved_pack_advances_to_review_ready():
    conn = _Connection(blocking_count=0)

    stable_registry_extension_pack.review_extension_pack(conn, PACK_ID)

    assert len(conn.updates()) == 1
    assert "state = 'review_ready'" in conn.updates()[0]


def test_pack_with_unresolved_exceptions_stays_where_the_owner_left_it():
    conn = _Connection(blocking_count=3)

    stable_registry_extension_pack.review_extension_pack(conn, PACK_ID)

    # Unresolved groups are the owner's work; the worker must not advance past
    # them or silently resolve them.
    assert conn.updates() == []


@pytest.mark.parametrize(
    "state",
    ["review_ready", "approved", "active", "retired", "failed", "abandoned"],
)
def test_redelivery_after_the_owner_acted_is_a_no_op(state):
    conn = _Connection(state=state)

    stable_registry_extension_pack.review_extension_pack(conn, PACK_ID)

    assert conn.updates() == []


def test_missing_pack_is_a_terminal_error():
    conn = _Connection(pack_exists=False)

    with pytest.raises(ValueError, match="extension_pack_not_found"):
        stable_registry_extension_pack.review_extension_pack(conn, PACK_ID)


def test_worker_reads_only_aggregate_row_classes():
    conn = _Connection()

    stable_registry_extension_pack.review_extension_pack(conn, PACK_ID)

    selected = " ".join(call for call, _ in conn.calls)
    for forbidden in (
        "official_denomination",
        "normalized_denomination",
        "source_record_key",
        "raw_payload",
        "owner_user_id",
    ):
        assert forbidden not in selected


def test_blocking_classes_are_the_closed_owner_decision_set():
    assert stable_registry_extension_pack.BLOCKING_ROW_CLASSES == (
        "needs_parent",
        "collision",
        "duplicate",
        "review_needed",
    )
