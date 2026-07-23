"""OVE-194/OVE-195 machine-readable job queue contract.

Mirrored by apps/web/src/server/job-queue-manifest.ts — drift fails tests.
"""

from __future__ import annotations

from typing import Final

from app.catalog_aliases import CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND
from app.catalog_fuzzy_duplicates import CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND
from app.catalog_matching import CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND
from app.search import (
    CATALOG_TYPEAHEAD_REINDEX_KIND,
    JOURNAL_ENTRY_INDEX_KIND,
    JOURNAL_ENTRY_UNINDEX_KIND,
)

JOB_QUEUE_MANIFEST_VERSION: Final = "ove195.job-queue.v1"
MATCHING_DEFAULT_MAX_ATTEMPTS: Final = 8
TERMINAL_ERROR_CODES: Final = (
    "unsupported_kind",
    "invalid_payload",
    "max_attempts_exceeded",
)

MATCHING_MANIFEST_ENTRIES: Final = (
    {
        "queueName": "matching",
        "kind": CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
    },
    {
        "queueName": "matching",
        "kind": CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "empty_payload",
        "coversStructuredJournalCover": False,
    },
    {
        "queueName": "matching",
        "kind": CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
    },
    {
        "queueName": "matching",
        "kind": CATALOG_TYPEAHEAD_REINDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "empty_payload",
        "coversStructuredJournalCover": False,
    },
    {
        "queueName": "matching",
        "kind": JOURNAL_ENTRY_INDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
    },
    {
        "queueName": "matching",
        "kind": JOURNAL_ENTRY_UNINDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
    },
)

# Web-owned outboxes listed for cross-language drift checks.
WEB_OWNED_MANIFEST_ENTRIES: Final = (
    {
        "queueName": "erasure",
        "kind": "erasure_media_object_delete",
        "consumer": "web-erasure-execution",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
    },
    {
        "queueName": "media_lifecycle",
        "kind": "media_derivative_revoke",
        "consumer": "web-media-lifecycle",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
    },
    {
        "queueName": "media_lifecycle",
        "kind": "media_quarantine_expire",
        "consumer": "web-media-lifecycle",
        "maxAttempts": MATCHING_DEFAULT_MAX_ATTEMPTS,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
    },
)

JOB_QUEUE_MANIFEST: Final = MATCHING_MANIFEST_ENTRIES + WEB_OWNED_MANIFEST_ENTRIES

MATCHING_KIND_MAX_ATTEMPTS: Final = {
    entry["kind"]: int(entry["maxAttempts"]) for entry in MATCHING_MANIFEST_ENTRIES
}


def max_attempts_for_kind(kind: str) -> int:
    return MATCHING_KIND_MAX_ATTEMPTS.get(kind, MATCHING_DEFAULT_MAX_ATTEMPTS)
