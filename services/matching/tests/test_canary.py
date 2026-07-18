from __future__ import annotations

import json
from typing import Any

import pytest

from app import canary
from app.job_handlers import SUPPORTED_JOB_KINDS
from app.runtime import RuntimeRelease, SCHEMA_COMPATIBILITY_CLASS


def release() -> RuntimeRelease:
    return RuntimeRelease(
        commit_sha="a" * 40,
        image_digest=f"sha256:{'b' * 64}",
        build_timestamp="2026-07-18T12:34:56Z",
        schema_compatibility_class=SCHEMA_COMPATIBILITY_CLASS,
        queue_name="matching",
    )


def test_canary_is_explicitly_gated_and_redacts_failures(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv(canary.CANARY_APPROVAL_ENV, raising=False)
    assert canary.main() == 1
    assert "explicit approval gate" in capsys.readouterr().out

    monkeypatch.setenv(canary.CANARY_APPROVAL_ENV, "true")
    monkeypatch.setenv("DIRECT_URL", "postgresql://secret.invalid/private")
    monkeypatch.setattr(
        canary.RuntimeRelease,
        "from_environment",
        classmethod(lambda _cls: release()),
    )
    monkeypatch.setattr(
        canary.psycopg,
        "connect",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("private-payload")
        ),
    )

    assert canary.main() == 1
    output = capsys.readouterr().out
    assert "private-payload" not in output
    assert "secret.invalid" not in output


def test_canary_sql_is_bounded_and_preserves_processing_claims() -> None:
    normalized = " ".join(canary._ENQUEUE_SQL.split()).lower()
    assert "on conflict (idempotency_key)" in normalized
    assert "when job_queue.status = 'processing'" in normalized
    assert "rerun_requested = (job_queue.status = 'processing')" in normalized
    assert "delete from job_queue" not in normalized
    assert "truncate" not in normalized
    assert "precise" not in canary._PUBLIC_JOURNAL_SOURCE_SQL.lower()
    assert "location_visibility" in canary._PUBLIC_JOURNAL_SOURCE_SQL.lower()


def test_wait_for_done_treats_failed_as_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    statuses = iter(["failed", "pending", "processing", "done"])

    class FakeResult:
        def fetchone(self) -> dict[str, str]:
            return {"status": next(statuses)}

    class FakeConnection:
        def execute(self, _sql: str, _params: tuple[str]) -> FakeResult:
            return FakeResult()

    clock = iter([0.0, 0.1, 0.2, 0.3, 0.4])
    monkeypatch.setattr(canary.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(canary.time, "sleep", lambda _seconds: None)

    canary._wait_for_done(
        FakeConnection(),  # type: ignore[arg-type]
        "internal-job-id",
        timeout_seconds=1,
    )


def test_wait_for_done_times_out_when_failed_never_recovers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeResult:
        def fetchone(self) -> dict[str, str]:
            return {"status": "failed"}

    class FakeConnection:
        def execute(self, _sql: str, _params: tuple[str]) -> FakeResult:
            return FakeResult()

    clock = iter([0.0, 0.1, 1.1])
    monkeypatch.setattr(canary.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(canary.time, "sleep", lambda _seconds: None)

    with pytest.raises(RuntimeError, match="timed out"):
        canary._wait_for_done(
            FakeConnection(),  # type: ignore[arg-type]
            "internal-job-id",
            timeout_seconds=1,
        )


def test_enqueue_uses_release_scoped_key_without_returning_payload() -> None:
    calls: list[tuple[str, tuple[object, ...]]] = []

    class FakeResult:
        def fetchone(self) -> dict[str, str]:
            return {"id": "internal-id"}

    class FakeConnection:
        def execute(self, sql: str, params: tuple[object, ...]) -> FakeResult:
            calls.append((sql, params))
            return FakeResult()

    job_id = canary._enqueue(
        FakeConnection(),  # type: ignore[arg-type]
        release(),
        {"kind": "catalog_typeahead_reindex"},
        phase="initial",
    )

    assert job_id == "internal-id"
    assert calls[0][1][2] == (
        "ove190:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:initial:"
        "catalog_typeahead_reindex"
    )


def test_evidence_shape_covers_exactly_six_handlers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        canary,
        "readiness_manifest",
        lambda _release: ({"status": "ready"}, True),
    )
    monkeypatch.setattr(
        canary,
        "_required_source",
        lambda _conn, sql: "alias-id" if "confirmed" in sql else "source-id",
    )
    monkeypatch.setattr(
        canary,
        "_enqueue",
        lambda _conn, _release, payload, *, phase: (
            f"{phase}:{payload['kind']}"
        ),
    )
    monkeypatch.setattr(canary, "_wait_for_done", lambda *_args: None)
    journal_documents = iter(
        [
            {key: "safe" for key in canary._ALLOWED_JOURNAL_DOCUMENT_KEYS},
            None,
            {key: "safe" for key in canary._ALLOWED_JOURNAL_DOCUMENT_KEYS},
        ]
    )
    monkeypatch.setattr(
        canary,
        "_journal_document",
        lambda *_args: next(journal_documents),
    )

    class FakeResult:
        def fetchone(self) -> dict[str, str]:
            return {
                "journal_entry_id": "private-entry-id",
                "owner_user_id": "private-owner-id",
            }

    class FakeConnection:
        def execute(self, _sql: str) -> FakeResult:
            return FakeResult()

    evidence = canary.run_handler_canaries(
        FakeConnection(),  # type: ignore[arg-type]
        release(),
        meili_client=object(),  # type: ignore[arg-type]
    )

    assert [proof["kind"] for proof in evidence["handlerProofs"]] == list(
        SUPPORTED_JOB_KINDS
    )
    serialized = json.dumps(evidence)
    assert "private-entry-id" not in serialized
    assert "private-owner-id" not in serialized
    assert evidence["leakCheck"] == "passed"


def test_journal_document_maps_only_not_found_to_absence() -> None:
    class NotFound(Exception):
        status_code = 404

    class Index:
        def get_document(self, _document_id: str) -> Any:
            raise NotFound("private error")

    class Client:
        def index(self, _index_name: str) -> Index:
            return Index()

    assert canary._journal_document(Client(), "internal-id") is None  # type: ignore[arg-type]


def test_canary_restores_journal_search_even_when_unindex_proof_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        canary,
        "readiness_manifest",
        lambda _release: ({"status": "ready"}, True),
    )
    monkeypatch.setattr(canary, "_required_source", lambda *_args: "source-id")
    phases: list[str] = []

    def enqueue(_conn, _release, payload, *, phase):
        phases.append(phase)
        return f"{phase}:{payload['kind']}"

    monkeypatch.setattr(canary, "_enqueue", enqueue)
    monkeypatch.setattr(canary, "_wait_for_done", lambda *_args: None)
    documents = iter(
        [
            {key: "safe" for key in canary._ALLOWED_JOURNAL_DOCUMENT_KEYS},
            {key: "safe" for key in canary._ALLOWED_JOURNAL_DOCUMENT_KEYS},
            {key: "safe" for key in canary._ALLOWED_JOURNAL_DOCUMENT_KEYS},
        ]
    )
    monkeypatch.setattr(canary, "_journal_document", lambda *_args: next(documents))

    class FakeResult:
        def fetchone(self) -> dict[str, str]:
            return {
                "journal_entry_id": "private-entry-id",
                "owner_user_id": "private-owner-id",
            }

    class FakeConnection:
        def execute(self, _sql: str) -> FakeResult:
            return FakeResult()

    with pytest.raises(RuntimeError, match="unindex canary"):
        canary.run_handler_canaries(
            FakeConnection(),  # type: ignore[arg-type]
            release(),
            meili_client=object(),  # type: ignore[arg-type]
        )

    assert phases[-2:] == ["unindex", "restore"]
