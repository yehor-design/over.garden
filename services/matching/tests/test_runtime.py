from __future__ import annotations

import json
from typing import Any

import pytest

from app import runtime
from app.job_handlers import SUPPORTED_JOB_KINDS

COMMIT_SHA = "a" * 40
IMAGE_DIGEST = f"sha256:{'b' * 64}"
BUILD_TIMESTAMP = "2026-07-18T12:34:56Z"


def release() -> runtime.RuntimeRelease:
    return runtime.RuntimeRelease(
        commit_sha=COMMIT_SHA,
        image_digest=IMAGE_DIGEST,
        build_timestamp=BUILD_TIMESTAMP,
        schema_compatibility_class=runtime.SCHEMA_COMPATIBILITY_CLASS,
        queue_name=runtime.DEFAULT_QUEUE_NAME,
    )


def set_release_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OVERGARDEN_MATCHING_COMMIT_SHA", COMMIT_SHA)
    monkeypatch.setenv("OVERGARDEN_MATCHING_IMAGE_DIGEST", IMAGE_DIGEST)
    monkeypatch.setenv("OVERGARDEN_MATCHING_BUILD_TIMESTAMP", BUILD_TIMESTAMP)
    monkeypatch.setenv(
        "OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY",
        runtime.SCHEMA_COMPATIBILITY_CLASS,
    )
    monkeypatch.setenv("QUEUE_NAME", runtime.DEFAULT_QUEUE_NAME)


def ready_postgres_state(**overrides: Any) -> dict[str, object]:
    state: dict[str, object] = {
        "postgresStatus": "available",
        "jobQueueStatus": "available",
        "depthClass": "low",
        "lagClass": "fresh",
        "heartbeat": {
            "release_commit_sha": COMMIT_SHA,
            "image_digest": IMAGE_DIGEST,
            "schema_compatibility_class": runtime.SCHEMA_COMPATIBILITY_CLASS,
            "supported_handlers": list(SUPPORTED_JOB_KINDS),
            "is_fresh": True,
        },
        "queueRecovery": {
            "claimCompatible": "available",
            "handlerCompatible": "available",
            "unsupportedRetryingClass": "none",
            "terminalCountClass": "empty",
            "oldestDueAgeClass": "fresh",
        },
    }
    state.update(overrides)
    return state


def response_json(response: Any) -> dict[str, object]:
    return json.loads(response.body.decode("utf-8"))


def walk_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return {str(key) for key in value} | set().union(
            *(walk_keys(child) for child in value.values())
        )
    if isinstance(value, list):
        return set().union(*(walk_keys(child) for child in value))
    return set()


def test_release_environment_is_fail_closed_and_never_echoes_rejected_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_release_environment(monkeypatch)
    monkeypatch.setenv("OVERGARDEN_MATCHING_COMMIT_SHA", "private-value")

    with pytest.raises(runtime.RuntimeConfigurationError) as error:
        runtime.RuntimeRelease.from_environment()

    assert "private-value" not in str(error.value)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OVERGARDEN_MATCHING_COMMIT_SHA", "A" * 40),
        ("OVERGARDEN_MATCHING_IMAGE_DIGEST", f"sha256:{'B' * 64}"),
        ("OVERGARDEN_MATCHING_BUILD_TIMESTAMP", "not-a-timestamp"),
        ("OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY", "unknown-schema"),
        ("QUEUE_NAME", "another-queue"),
    ],
)
def test_release_environment_rejects_noncanonical_identity(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    set_release_environment(monkeypatch)
    monkeypatch.setenv(name, value)

    with pytest.raises(runtime.RuntimeConfigurationError):
        runtime.RuntimeRelease.from_environment()


def test_capabilities_are_exact_sorted_and_redacted() -> None:
    manifest = runtime.capabilities_manifest(release())

    assert manifest == {
        "schemaVersion": "ove194.matchingRuntime.v1",
        "service": "overgarden-matching",
        "status": "available",
        "release": {
            "commitSha": COMMIT_SHA,
            "imageDigest": IMAGE_DIGEST,
            "buildTimestamp": BUILD_TIMESTAMP,
            "schemaCompatibilityClass": "ove190.matching-schema.v1",
        },
        "queue": {
            "name": "matching",
            "supportedHandlers": [
                "catalog_alias_suggestions_refresh",
                "catalog_fuzzy_duplicate_qa_refresh",
                "catalog_match_suggestions_refresh",
                "catalog_typeahead_reindex",
                "journal_entry_index",
                "journal_entry_unindex",
                "stable_registry_edition_build",
                "stable_registry_extension_pack_build",
                "stable_registry_foundation_build",
            ],
        },
    }
    assert walk_keys(manifest).isdisjoint(
        {
            "databaseUrl",
            "directUrl",
            "email",
            "error",
            "exception",
            "host",
            "payload",
            "rowId",
            "secret",
            "token",
            "userId",
        }
    )


def test_readiness_distinguishes_each_dependency_without_raw_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        runtime, "_read_postgres_state", lambda _release: ready_postgres_state()
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    manifest, is_ready = runtime.readiness_manifest(release())

    assert is_ready is True
    assert manifest["status"] == "ready"
    assert manifest["dependencies"] == {
        "api": {"status": "available"},
        "postgres": {"status": "available"},
        "jobQueue": {
            "status": "available",
            "depthClass": "low",
            "lagClass": "fresh",
        },
        "meilisearch": {"status": "available"},
        # A fresh heartbeat with no recorded drain error means the projection
        # drain is converging; the readiness manifest now says so instead of
        # leaving an operator to infer it from silence.
        "worker": {"status": "available", "drainClass": "converging"},
        "queueRecovery": {
            "claimCompatible": "available",
            "handlerCompatible": "available",
            "unsupportedRetryingClass": "none",
            "terminalCountClass": "empty",
            "oldestDueAgeClass": "fresh",
        },
    }


@pytest.mark.parametrize(
    ("state_override", "expected_worker_status"),
    [
        ({"heartbeat": None}, "missing"),
        (
            {
                "heartbeat": {
                    **ready_postgres_state()["heartbeat"],
                    "is_fresh": False,
                }
            },
            "stale",
        ),
        (
            {
                "heartbeat": {
                    **ready_postgres_state()["heartbeat"],
                    "image_digest": f"sha256:{'c' * 64}",
                }
            },
            "release_mismatch",
        ),
        (
            {
                "heartbeat": {
                    **ready_postgres_state()["heartbeat"],
                    "supported_handlers": ["journal_entry_index"],
                }
            },
            "capability_mismatch",
        ),
    ],
)
def test_readiness_fails_closed_for_worker_lease_classes(
    monkeypatch: pytest.MonkeyPatch,
    state_override: dict[str, object],
    expected_worker_status: str,
) -> None:
    monkeypatch.setattr(
        runtime,
        "_read_postgres_state",
        lambda _release: ready_postgres_state(**state_override),
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    manifest, is_ready = runtime.readiness_manifest(release())

    assert is_ready is False
    assert manifest["status"] == "degraded"
    # The drain class is independent of the lease class. A stale or mismatched
    # worker still left a drain outcome behind; only a missing heartbeat leaves
    # nobody having said either way, and `unknown` is honest there rather than
    # turning missing evidence into a health claim.
    expected_drain_class = (
        "unknown" if expected_worker_status == "missing" else "converging"
    )
    assert manifest["dependencies"]["worker"] == {
        "status": expected_worker_status,
        "drainClass": expected_drain_class,
    }


def test_preflight_requires_schema_but_not_an_existing_worker_heartbeat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        runtime,
        "_read_postgres_state",
        lambda _release: ready_postgres_state(heartbeat=None),
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    manifest, is_ready = runtime.preflight_manifest(release())

    assert is_ready is True
    assert "worker" not in manifest["dependencies"]


@pytest.mark.parametrize(
    "public_media_origin",
    [
        None,
        "",
        "http://media.over.garden",
        "https://media.over.garden/",
        "https://private.invalid",
    ],
)
def test_production_preflight_rejects_missing_or_drifted_public_media_origin(
    monkeypatch: pytest.MonkeyPatch,
    public_media_origin: str | None,
) -> None:
    monkeypatch.setenv("OVERGARDEN_MATCHING_ENVIRONMENT", "production")
    if public_media_origin is None:
        monkeypatch.delenv("R2_PUBLIC_BASE_URL", raising=False)
    else:
        monkeypatch.setenv("R2_PUBLIC_BASE_URL", public_media_origin)

    with pytest.raises(runtime.RuntimeConfigurationError) as error:
        runtime.preflight_manifest(release())

    assert "public media origin is invalid" in str(error.value)
    if public_media_origin:
        assert public_media_origin not in str(error.value)


def test_production_preflight_accepts_the_canonical_public_media_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OVERGARDEN_MATCHING_ENVIRONMENT", "production")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://media.over.garden")
    monkeypatch.setattr(
        runtime, "_read_postgres_state", lambda _release: ready_postgres_state()
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    manifest, is_ready = runtime.preflight_manifest(release())

    assert is_ready is True
    assert manifest["status"] == "ready"


@pytest.mark.parametrize(
    ("depth", "expected"),
    [
        (-1, "empty"),
        (0, "empty"),
        (1, "low"),
        (10, "low"),
        (11, "medium"),
        (101, "high"),
    ],
)
def test_queue_depth_is_bounded(depth: int, expected: str) -> None:
    assert runtime._queue_depth_class(depth) == expected


@pytest.mark.parametrize(
    ("lag", "expected"),
    [
        (None, "none"),
        (0, "fresh"),
        (60, "fresh"),
        (61, "delayed"),
        (300, "delayed"),
        (301, "stale"),
    ],
)
def test_queue_lag_is_bounded(lag: float | None, expected: str) -> None:
    assert runtime._queue_lag_class(lag) == expected


def test_meilisearch_health_probe_has_a_bounded_http_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    class FakeClient:
        def health(self) -> dict[str, str]:
            return {"status": "available"}

    def fake_client(host, api_key, *, timeout):
        calls.append((host, api_key, timeout))
        return FakeClient()

    monkeypatch.setenv("MEILISEARCH_HOST", "http://example.invalid")
    monkeypatch.setenv("MEILISEARCH_API_KEY", "private-key")
    monkeypatch.setattr(runtime.meilisearch, "Client", fake_client)

    assert runtime._read_meilisearch_status() == "available"
    assert calls == [
        (
            "http://example.invalid",
            "private-key",
            runtime.MEILISEARCH_HTTP_TIMEOUT_SECONDS,
        )
    ]


def test_worker_heartbeat_writes_only_release_capabilities() -> None:
    calls: list[tuple[str, tuple[object, ...]]] = []

    class FakeConnection:
        def execute(self, sql: str, params: tuple[object, ...]) -> None:
            calls.append((sql, params))

    runtime.record_worker_heartbeat(FakeConnection(), release())  # type: ignore[arg-type]

    assert len(calls) == 1
    sql, params = calls[0]
    assert "matching_worker_heartbeats" in sql
    assert params == (
        "matching",
        COMMIT_SHA,
        IMAGE_DIGEST,
        "ove190.matching-schema.v1",
        list(SUPPORTED_JOB_KINDS),
    )
    assert "hostname" not in sql.lower()
    assert "payload" not in sql.lower()


def test_capability_and_readiness_stay_separate_without_an_http_surface(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The distinction the retired endpoints carried, kept in the manifests.

    Capability is about the release this process *is*; readiness is about the
    dependencies it needs. A missing worker heartbeat must degrade readiness
    without making the release unknowable.
    """
    set_release_environment(monkeypatch)
    monkeypatch.setattr(
        runtime,
        "_read_postgres_state",
        lambda _release: ready_postgres_state(heartbeat=None),
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    capabilities = runtime.capabilities_manifest()
    manifest, is_ready = runtime.readiness_manifest()

    assert capabilities["release"]["commitSha"] == COMMIT_SHA
    assert is_ready is False
    assert manifest["dependencies"]["worker"] == {
        "status": "missing",
        "drainClass": "unknown",
    }


def test_cli_fails_closed_without_release_identity(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for name in (
        "OVERGARDEN_MATCHING_COMMIT_SHA",
        "OVERGARDEN_MATCHING_IMAGE_DIGEST",
        "OVERGARDEN_MATCHING_BUILD_TIMESTAMP",
        "OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY",
    ):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(runtime.RuntimeConfigurationError):
        runtime.capabilities_manifest()
    exit_code = runtime.main(["capabilities"])

    assert exit_code == 1
    assert json.loads(capsys.readouterr().out) == runtime.unavailable_manifest()


def test_readiness_reports_a_failing_drain_on_an_otherwise_healthy_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The case the whole column exists for.

    Everything else is green — fresh heartbeat, matching release, full handler
    set — and the projection drain has failed on every attempt. Before this
    column that worker was indistinguishable from an idle one, and a failed
    drain is exactly what leaves erased and revoked content in the public index.
    """
    monkeypatch.setattr(
        runtime,
        "_read_postgres_state",
        lambda _release: ready_postgres_state(
            heartbeat={
                **ready_postgres_state()["heartbeat"],
                "last_drain_error_class": "os_error",
            }
        ),
    )
    monkeypatch.setattr(runtime, "_read_meilisearch_status", lambda: "available")

    manifest, _is_ready = runtime.readiness_manifest(release())

    assert manifest["dependencies"]["worker"] == {
        "status": "available",
        "drainClass": "failing",
    }
