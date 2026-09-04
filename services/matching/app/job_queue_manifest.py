"""OVE-194/OVE-195 machine-readable job queue contract, as this tier sees it.

The contract itself is generated: `app/job_queue_contract.py` is written from
`apps/web/src/server/job-queue-manifest.ts` by `pnpm queue:contract:build`, and
`pnpm queue:contract:check` fails when the two disagree. This module adds only
the lookups the worker needs on top of it.

It used to restate the whole manifest by hand, kept in step by a test that
searched the file for a handful of substrings. That test passed for a week while
the release gate refused every image, because a hand-written mirror can agree
about the strings it is asked about and still be missing an entry.
"""

from __future__ import annotations

from typing import Final

from app.job_queue_contract import (
    JOB_QUEUE_MANIFEST,
    JOB_QUEUE_MANIFEST_VERSION,
    JOB_QUEUE_PAYLOAD_CONTRACTS,
    MATCHING_DEFAULT_MAX_ATTEMPTS,
    MATCHING_MANIFEST_ENTRIES,
    MATCHING_QUEUE_NAME,
    REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS,
    SUPPORTED_JOB_KINDS,
    TERMINAL_ERROR_CODES,
    WEB_OWNED_MANIFEST_ENTRIES,
)

__all__ = [
    "JOB_QUEUE_MANIFEST",
    "JOB_QUEUE_MANIFEST_VERSION",
    "JOB_QUEUE_PAYLOAD_CONTRACTS",
    "MATCHING_DEFAULT_MAX_ATTEMPTS",
    "MATCHING_KIND_MAX_ATTEMPTS",
    "MATCHING_MANIFEST_ENTRIES",
    "MATCHING_QUEUE_NAME",
    "REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS",
    "SUPPORTED_JOB_KINDS",
    "TERMINAL_ERROR_CODES",
    "WEB_OWNED_MANIFEST_ENTRIES",
    "max_attempts_for_kind",
    "payload_contract_for_kind",
]

MATCHING_KIND_MAX_ATTEMPTS: Final = {
    entry["kind"]: int(entry["maxAttempts"]) for entry in MATCHING_MANIFEST_ENTRIES
}


def max_attempts_for_kind(kind: str) -> int:
    return MATCHING_KIND_MAX_ATTEMPTS.get(kind, MATCHING_DEFAULT_MAX_ATTEMPTS)


def payload_contract_for_kind(
    kind: str, queue_name: str = MATCHING_QUEUE_NAME
) -> dict[str, list[str]] | None:
    """Return the declared payload contract for a kind, or None when undeclared."""
    return JOB_QUEUE_PAYLOAD_CONTRACTS.get(f"{queue_name}:{kind}")
