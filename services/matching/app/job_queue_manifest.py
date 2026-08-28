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
from app.stable_registry_extension_pack import (
    STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
)
from app.stable_registry_foundation import STABLE_REGISTRY_FOUNDATION_BUILD_KIND

JOB_QUEUE_MANIFEST_VERSION: Final = "ove255.job-queue.v4"
MATCHING_DEFAULT_MAX_ATTEMPTS: Final = 8
TERMINAL_ERROR_CODES: Final = (
    "unsupported_kind",
    "invalid_payload",
    "max_attempts_exceeded",
)

# OVE-225: mirror of the `payloadContract` field in
# apps/web/src/server/job-queue-manifest.ts, keyed by "<queueName>:<kind>".
# The TypeScript owner is authoritative; drift fails job-queue-manifest.test.ts.
JOB_QUEUE_PAYLOAD_CONTRACTS: Final = {
    "matching:stable_registry_foundation_build": {
        "requiredKeys": ["kind", "releaseId"],
        "optionalKeys": [],
        "uuidKeys": ["releaseId"],
    },
    "matching:stable_registry_extension_pack_build": {
        "requiredKeys": ["kind", "packId"],
        "optionalKeys": [],
        "uuidKeys": ["packId"],
    },
    "matching:catalog_alias_suggestions_refresh": {
        "requiredKeys": ["kind", "catalogItemId"],
        "optionalKeys": [],
        "uuidKeys": ["catalogItemId"],
    },
    "matching:catalog_fuzzy_duplicate_qa_refresh": {
        "requiredKeys": ["kind"],
        "optionalKeys": [],
        "uuidKeys": [],
    },
    "matching:catalog_match_suggestions_refresh": {
        "requiredKeys": ["kind", "sourceCatalogItemId"],
        "optionalKeys": [],
        "uuidKeys": ["sourceCatalogItemId"],
    },
    "matching:catalog_typeahead_reindex": {
        "requiredKeys": ["kind"],
        "optionalKeys": [],
        "uuidKeys": [],
    },
    "matching:journal_entry_index": {
        "requiredKeys": ["kind", "journalEntryId", "userId"],
        "optionalKeys": [],
        "uuidKeys": ["journalEntryId", "userId"],
    },
    "matching:journal_entry_unindex": {
        "requiredKeys": ["kind", "journalEntryId", "userId"],
        "optionalKeys": [],
        "uuidKeys": ["journalEntryId", "userId"],
    },
    "erasure:erasure_media_object_delete": {
        "requiredKeys": ["kind", "requestId", "bucket", "objectKey"],
        "optionalKeys": [],
        "uuidKeys": [],
    },
    "media_lifecycle:media_derivative_revoke": {
        "requiredKeys": ["kind", "mediaAssetId", "bucket", "objectKey", "reason"],
        "optionalKeys": ["journalEntryId"],
        "uuidKeys": ["mediaAssetId", "journalEntryId"],
    },
    "media_lifecycle:media_staging_finalize": {
        "requiredKeys": [
            "kind",
            "publishId",
            "stagingSessionId",
            "receiptSetDigest",
        ],
        "optionalKeys": [],
        "uuidKeys": ["publishId", "stagingSessionId"],
    },
}

MATCHING_MANIFEST_ENTRIES: Final = (
    {
        "queueName": "matching",
        "kind": STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 3,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
    },
    {
        "queueName": "matching",
        "kind": STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 3,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
    },
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
        "kind": "media_staging_finalize",
        "consumer": "web-media-lifecycle",
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
)

JOB_QUEUE_MANIFEST: Final = MATCHING_MANIFEST_ENTRIES + WEB_OWNED_MANIFEST_ENTRIES

MATCHING_KIND_MAX_ATTEMPTS: Final = {
    entry["kind"]: int(entry["maxAttempts"]) for entry in MATCHING_MANIFEST_ENTRIES
}


def max_attempts_for_kind(kind: str) -> int:
    return MATCHING_KIND_MAX_ATTEMPTS.get(kind, MATCHING_DEFAULT_MAX_ATTEMPTS)


def payload_contract_for_kind(
    kind: str,
    queue_name: str = "matching",
) -> dict[str, list[str]] | None:
    """Return the declared payload contract for a kind, or None when undeclared."""
    return JOB_QUEUE_PAYLOAD_CONTRACTS.get(f"{queue_name}:{kind}")
