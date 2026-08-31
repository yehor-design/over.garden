from contextlib import nullcontext

import pytest

from app import stable_registry_edition

RELEASE_ID = "00000000-0000-4000-8000-000000000258"
PRIOR_RELEASE_ID = "00000000-0000-4000-8000-000000000255"
# The literal kind is asserted here so the job-queue producer/consumer contract
# can prove this file tests the "stable_registry_edition_build" kind.
JOB_KIND = "stable_registry_edition_build"


def test_handler_owns_the_declared_job_kind():
    assert stable_registry_edition.STABLE_REGISTRY_EDITION_BUILD_KIND == JOB_KIND


def test_only_derivable_classes_are_emitted():
    """`alias` and `split` are owner judgements, not comparison results.

    The release layer versions membership and revisions, not name sets, and a
    split is recorded through a decision. Deriving either from a guess would put
    a decision in front of the owner that no evidence supports.
    """
    assert stable_registry_edition.DERIVED_DIFF_CLASSES == (
        "unchanged",
        "addition",
        "correction",
        "supersession",
        "rights_change",
    )


class _Result:
    def __init__(self, one=None):
        self._one = one

    def fetchone(self):
        return self._one


class _Connection:
    """Records statements so a test can assert what the worker actually reads."""

    def __init__(
        self,
        *,
        state="draft",
        predecessor=PRIOR_RELEASE_ID,
        release_exists=True,
        counts=None,
        affected=0,
        completion_rejected=False,
    ):
        self.calls = []
        self.state = state
        self.predecessor = predecessor
        self.release_exists = release_exists
        self.counts = counts or {
            "unchanged_count": 128_000,
            "addition_count": 12,
            "correction_count": 3,
            "supersession_count": 1,
            "rights_change_count": 0,
        }
        self.affected = affected
        self.completion_rejected = completion_rejected
        self.started = False

    def transaction(self):
        return nullcontext()

    def execute(self, statement, parameters=()):
        normalized = " ".join(statement.split())
        self.calls.append((normalized, parameters))
        if "from catalog_registry_releases where id" in normalized:
            if not self.release_exists:
                return _Result(None)
            return _Result(
                {
                    "id": RELEASE_ID,
                    "state": self.state,
                    "policy_version": stable_registry_edition.EDITION_POLICY_VERSION,
                    "predecessor_release_id": self.predecessor,
                }
            )
        if "set state = 'building'" in normalized:
            self.started = True
            self.state = "building"
            return _Result({"id": RELEASE_ID})
        if "unchanged_count" in normalized:
            return _Result(self.counts)
        if "count(*)::int as count" in normalized:
            return _Result({"count": self.affected})
        if "set state = 'review_ready'" in normalized:
            self.state = "review_ready"
            return _Result(None if self.completion_rejected else {"id": RELEASE_ID})
        return _Result()

    def inserted_diff_classes(self):
        return [
            parameters[2]
            for statement, parameters in self.calls
            if statement.startswith("insert into catalog_registry_edition_diffs")
        ]


def test_a_draft_edition_becomes_review_ready_with_one_group_per_class():
    conn = _Connection()

    stable_registry_edition.build_edition_release(conn, RELEASE_ID)

    assert conn.started is True
    # `rights_change_count` is zero, and a group with no members is not work.
    assert conn.inserted_diff_classes() == [
        "unchanged",
        "addition",
        "correction",
        "supersession",
    ]
    assert any(
        statement.startswith("update catalog_registry_releases")
        and "set state = 'review_ready'" in statement
        for statement, _ in conn.calls
    )


def test_an_edition_without_a_predecessor_is_refused():
    """An edition succeeds something. The Foundation build owns the first one."""
    conn = _Connection(predecessor=None)

    with pytest.raises(ValueError, match="edition_predecessor_missing"):
        stable_registry_edition.build_edition_release(conn, RELEASE_ID)

    assert conn.inserted_diff_classes() == []


def test_a_terminal_edition_is_never_rebuilt():
    for state in ("review_ready", "approved", "active", "retired"):
        conn = _Connection(state=state)

        stable_registry_edition.build_edition_release(conn, RELEASE_ID)

        assert conn.inserted_diff_classes() == []
        assert conn.started is False


def test_a_missing_release_fails_loudly():
    conn = _Connection(release_exists=False)

    with pytest.raises(ValueError, match="edition_release_not_found"):
        stable_registry_edition.build_edition_release(conn, RELEASE_ID)


def test_the_comparison_never_reads_user_or_source_content():
    conn = _Connection()

    stable_registry_edition.build_edition_release(conn, RELEASE_ID)

    joined = " ".join(statement for statement, _ in conn.calls)
    for forbidden in (
        "raw_payload",
        "source_only_fields",
        "owner_user_id",
        "journal",
        "latitude",
        "longitude",
        "coordinates",
    ):
        assert forbidden not in joined
    # Garden objects are counted, never selected: an impact number is an
    # aggregate and must not become a list of someone's plants.
    for statement, _ in conn.calls:
        if "plant_objects" in statement:
            assert "count(*)::int as count" in statement


def test_group_keys_are_stable_and_distinct_per_class():
    keys = {
        diff_class: stable_registry_edition._group_key(RELEASE_ID, diff_class)
        for diff_class in stable_registry_edition.DERIVED_DIFF_CLASSES
    }
    assert len(set(keys.values())) == len(keys)
    assert keys == {
        diff_class: stable_registry_edition._group_key(RELEASE_ID, diff_class)
        for diff_class in stable_registry_edition.DERIVED_DIFF_CLASSES
    }


def test_the_release_identity_digest_is_never_rewritten():
    """`build_digest` is release identity and the OVE-255 guard holds it.

    The comparison result is an aggregate summary, not a new identity. Writing
    it back over `build_digest` would make every completion raise.
    """
    conn = _Connection()

    stable_registry_edition.build_edition_release(conn, RELEASE_ID)

    for statement, _ in conn.calls:
        if statement.startswith("update catalog_registry_releases"):
            assert "build_digest" not in statement


def test_the_summary_carries_counts_and_a_digest_without_identifiers():
    summary = stable_registry_edition._safe_summary(
        RELEASE_ID,
        {
            "unchanged": 5,
            "addition": 2,
            "correction": 0,
            "supersession": 0,
            "rights_change": 0,
        },
    )

    assert '"unchanged":5' in summary
    assert '"addition":2' in summary
    assert stable_registry_edition.EDITION_POLICY_VERSION in summary
    assert '"diffDigest":' in summary
    # Counts and a digest are the only things that leave the comparison.
    assert RELEASE_ID not in summary


def test_a_rejected_completion_fails_loudly():
    """A completion that matched no row must not look like success."""
    conn = _Connection(completion_rejected=True)

    with pytest.raises(ValueError, match="edition_release_completion_rejected"):
        stable_registry_edition.build_edition_release(conn, RELEASE_ID)
