"""OVE-242 — worker-side public-projection outbox contract.

These tests pin the properties that make a revocation safe: a claimed intent is
applied and then *verified* against the real index, convergence is recorded only
under a generation-fenced compare-and-set, and a failure is retried with bounded
backoff before it is dead-lettered.
"""

from __future__ import annotations

import pytest

from app import public_projection


class FakeCursor:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class FakeConnection:
    """Records executed statements and replays scripted rows."""

    def __init__(self, rows=None):
        self.statements: list[tuple[str, tuple]] = []
        self._rows = list(rows or [])

    def execute(self, sql, params=()):
        self.statements.append((sql, params))
        row = self._rows.pop(0) if self._rows else None
        return FakeCursor(row)


CLAIM_ROW = {
    "entity_id": "00000000-0000-4000-8000-000000000501",
    "owner_user_id": "00000000-0000-4000-8000-000000000101",
    "desired_state": "absent",
    "desired_generation": "42",
    "attempts": 1,
    "lease_owner": "applier:lease-1",
}


def test_claim_orders_privacy_reducing_work_first():
    conn = FakeConnection([dict(CLAIM_ROW)])

    claim = public_projection.claim_public_projection_intent(conn)

    sql, params = conn.statements[0]
    assert "order by privacy_reducing desc, desired_generation asc" in sql
    assert "for update skip locked" in sql
    assert params[1] == public_projection.LEASE_SECONDS
    assert claim is not None
    # The lease token identifies this applier and gates the later CAS.
    assert claim["lease_owner"].startswith(public_projection.APPLIER_ID)


def test_claim_includes_new_intent_without_applied_generation():
    conn = FakeConnection([dict(CLAIM_ROW)])

    claim = public_projection.claim_public_projection_intent(conn)

    sql, _ = conn.statements[0]
    assert "applied_generation is null" in sql
    assert "or applied_generation < desired_generation" in sql
    assert claim is not None


def test_unconverged_count_includes_new_intent_without_applied_generation():
    conn = FakeConnection([{"unconverged": 1}])

    count = public_projection.count_unconverged_public_projections(conn)

    sql, _ = conn.statements[0]
    assert "applied_generation is null" in sql
    assert "or applied_generation < desired_generation" in sql
    assert count == 1


def test_absent_intent_is_verified_before_convergence_is_recorded(monkeypatch):
    deleted: list[str] = []
    monkeypatch.setattr(
        public_projection,
        "unindex_journal_entry",
        lambda entity_id, client: deleted.append(entity_id),
    )
    monkeypatch.setattr(
        public_projection,
        "observe_public_projection",
        lambda entity_id, client=None: "absent",
    )
    monkeypatch.setattr(public_projection, "meili_client", lambda: object())
    conn = FakeConnection([{"entity_id": CLAIM_ROW["entity_id"]}])

    outcome = public_projection.apply_public_projection_intent(
        conn, dict(CLAIM_ROW)
    )

    assert outcome == "converged"
    assert deleted == [CLAIM_ROW["entity_id"]]
    settle_sql, settle_params = conn.statements[0]
    assert "set status = 'applied'" in settle_sql
    assert "applied_generation = desired_generation" in settle_sql
    # Generation and lease fence the write: an older applier cannot settle it.
    assert "and desired_generation = %s::bigint" in settle_sql
    assert "and lease_owner = %s" in settle_sql
    assert settle_params[2] == "42"


def test_index_that_still_holds_the_document_is_not_reported_converged(
    monkeypatch,
):
    monkeypatch.setattr(
        public_projection,
        "unindex_journal_entry",
        lambda entity_id, client: None,
    )
    # The delete "succeeded" but the document is still there. This is exactly
    # the state the old queue-status proof could not see.
    monkeypatch.setattr(
        public_projection,
        "observe_public_projection",
        lambda entity_id, client=None: "present",
    )
    monkeypatch.setattr(public_projection, "meili_client", lambda: object())
    conn = FakeConnection()

    outcome = public_projection.apply_public_projection_intent(
        conn, dict(CLAIM_ROW)
    )

    assert outcome == "retry_scheduled"
    sql, params = conn.statements[0]
    assert "set status = %s" in sql
    assert params[0] == "failed"
    assert params[2] == "verification_mismatch"


def test_superseded_generation_is_left_for_the_newer_intent(monkeypatch):
    monkeypatch.setattr(
        public_projection,
        "unindex_journal_entry",
        lambda entity_id, client: None,
    )
    monkeypatch.setattr(
        public_projection,
        "observe_public_projection",
        lambda entity_id, client=None: "absent",
    )
    monkeypatch.setattr(public_projection, "meili_client", lambda: object())
    # The CAS matches nothing: a newer canonical write bumped the generation.
    conn = FakeConnection([None])

    outcome = public_projection.apply_public_projection_intent(
        conn, dict(CLAIM_ROW)
    )

    assert outcome == "superseded"


def test_exhausted_attempts_are_dead_lettered(monkeypatch):
    def explode(entity_id, client):
        raise RuntimeError("meili down")

    monkeypatch.setattr(public_projection, "unindex_journal_entry", explode)
    monkeypatch.setattr(public_projection, "meili_client", lambda: object())
    conn = FakeConnection()

    claim = dict(CLAIM_ROW, attempts=public_projection.MAX_ATTEMPTS)
    outcome = public_projection.apply_public_projection_intent(conn, claim)

    assert outcome == "dead_lettered"
    _, params = conn.statements[0]
    assert params[0] == "dead"
    assert params[2] == "apply_failed"


@pytest.mark.parametrize(
    ("attempts", "expected"),
    [(1, 5), (2, 10), (3, 20), (99, 320)],
)
def test_backoff_is_bounded_and_exponential(attempts, expected):
    assert public_projection._backoff_seconds(attempts) == expected


def test_present_intent_uses_the_shared_index_helper(monkeypatch):
    indexed: list[tuple[str, str]] = []
    monkeypatch.setattr(
        public_projection,
        "index_journal_entry",
        lambda conn, entity_id, owner_id, client: indexed.append(
            (entity_id, owner_id)
        ),
    )
    monkeypatch.setattr(
        public_projection,
        "observe_public_projection",
        lambda entity_id, client=None: "present",
    )
    monkeypatch.setattr(public_projection, "meili_client", lambda: object())
    conn = FakeConnection([{"entity_id": CLAIM_ROW["entity_id"]}])

    outcome = public_projection.apply_public_projection_intent(
        conn, dict(CLAIM_ROW, desired_state="present")
    )

    assert outcome == "converged"
    # Reuses the one eligibility/document owner rather than a second projection.
    assert indexed == [
        (CLAIM_ROW["entity_id"], CLAIM_ROW["owner_user_id"]),
    ]


def test_drain_stops_when_no_intent_is_claimable(monkeypatch):
    monkeypatch.setattr(
        public_projection,
        "claim_public_projection_intent",
        lambda conn: None,
    )

    assert public_projection.drain_public_projection_intents(object()) == {}


def test_evidence_is_outcome_names_and_counts_only(monkeypatch):
    claims = [dict(CLAIM_ROW), None]
    monkeypatch.setattr(
        public_projection,
        "claim_public_projection_intent",
        lambda conn: claims.pop(0),
    )
    monkeypatch.setattr(
        public_projection,
        "apply_public_projection_intent",
        lambda conn, claim, client=None: "converged",
    )

    outcomes = public_projection.drain_public_projection_intents(object())

    assert outcomes == {"converged": 1}
    assert all(isinstance(value, int) for value in outcomes.values())
