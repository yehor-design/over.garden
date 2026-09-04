"""Generated from apps/web/src/server/job-queue-manifest.ts. Do not edit.

Regenerate with `pnpm queue:contract:build` from apps/web; `pnpm
queue:contract:check` fails when this file and the manifest disagree. Editing
it by hand recreates the drift that refused seventy-six correct matching image
releases between 2026-08-28 and 2026-09-04.
"""

from __future__ import annotations

from typing import Final

JOB_QUEUE_CONTRACT_SCHEMA: Final = "overgarden.jobQueueContract.v1"
JOB_QUEUE_MANIFEST_VERSION: Final = "ove255.job-queue.v4"
MATCHING_QUEUE_NAME: Final = "matching"
MATCHING_DEFAULT_MAX_ATTEMPTS: Final = 8
TERMINAL_ERROR_CODES: Final = (
    "unsupported_kind",
    "invalid_payload",
    "max_attempts_exceeded",
)

STABLE_REGISTRY_FOUNDATION_BUILD_KIND: Final = "stable_registry_foundation_build"
STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND: Final = "stable_registry_extension_pack_build"
STABLE_REGISTRY_EDITION_BUILD_KIND: Final = "stable_registry_edition_build"
CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND: Final = "catalog_alias_suggestions_refresh"
CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND: Final = "catalog_fuzzy_duplicate_qa_refresh"
CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND: Final = "catalog_match_suggestions_refresh"
CATALOG_TYPEAHEAD_REINDEX_KIND: Final = "catalog_typeahead_reindex"
JOURNAL_ENTRY_INDEX_KIND: Final = "journal_entry_index"
JOURNAL_ENTRY_UNINDEX_KIND: Final = "journal_entry_unindex"
ERASURE_MEDIA_OBJECT_DELETE_KIND: Final = "erasure_media_object_delete"
MEDIA_STAGING_FINALIZE_KIND: Final = "media_staging_finalize"
MEDIA_DERIVATIVE_REVOKE_KIND: Final = "media_derivative_revoke"

MATCHING_MANIFEST_ENTRIES: Final = (
    {
        "queueName": "matching",
        "kind": STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 3,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_stable_registry_foundation_build_payload_check",
    },
    {
        "queueName": "matching",
        "kind": STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 3,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_stable_registry_extension_pack_build_payload_check",
    },
    {
        "queueName": "matching",
        "kind": STABLE_REGISTRY_EDITION_BUILD_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 3,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_stable_registry_edition_build_payload_check",
    },
    {
        "queueName": "matching",
        "kind": CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_catalog_alias_payload_check",
    },
    {
        "queueName": "matching",
        "kind": CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "empty_payload",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_catalog_fuzzy_duplicate_payload_check",
    },
    {
        "queueName": "matching",
        "kind": CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "catalog_ids_only",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_catalog_match_payload_check",
    },
    {
        "queueName": "matching",
        "kind": CATALOG_TYPEAHEAD_REINDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "empty_payload",
        "coversStructuredJournalCover": False,
        "payloadConstraint": "job_queue_catalog_typeahead_payload_check",
    },
    {
        "queueName": "matching",
        "kind": JOURNAL_ENTRY_INDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
        "payloadConstraint": "job_queue_journal_entry_index_payload_check",
    },
    {
        "queueName": "matching",
        "kind": JOURNAL_ENTRY_UNINDEX_KIND,
        "consumer": "matching-python-worker",
        "maxAttempts": 8,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
        "payloadConstraint": "job_queue_journal_entry_unindex_payload_check",
    },
)

WEB_OWNED_MANIFEST_ENTRIES: Final = (
    {
        "queueName": "erasure",
        "kind": ERASURE_MEDIA_OBJECT_DELETE_KIND,
        "consumer": "web-erasure-execution",
        "maxAttempts": 8,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
        "payloadConstraint": "job_queue_erasure_media_object_delete_payload_check",
    },
    {
        "queueName": "media_lifecycle",
        "kind": MEDIA_STAGING_FINALIZE_KIND,
        "consumer": "web-media-lifecycle",
        "maxAttempts": 8,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
        "payloadConstraint": "job_queue_media_staging_finalize_payload_check",
    },
    {
        "queueName": "media_lifecycle",
        "kind": MEDIA_DERIVATIVE_REVOKE_KIND,
        "consumer": "web-media-lifecycle",
        "maxAttempts": 8,
        "privacyClass": "identifiers_only",
        "coversStructuredJournalCover": True,
        "payloadConstraint": "job_queue_media_derivative_revoke_payload_check",
    },
)

JOB_QUEUE_MANIFEST: Final = MATCHING_MANIFEST_ENTRIES + WEB_OWNED_MANIFEST_ENTRIES

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
    "matching:stable_registry_edition_build": {
        "requiredKeys": ["kind", "releaseId"],
        "optionalKeys": [],
        "uuidKeys": ["releaseId"],
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
    "media_lifecycle:media_staging_finalize": {
        "requiredKeys": ["kind", "publishId", "stagingSessionId", "receiptSetDigest"],
        "optionalKeys": [],
        "uuidKeys": ["publishId", "stagingSessionId"],
    },
    "media_lifecycle:media_derivative_revoke": {
        "requiredKeys": ["kind", "mediaAssetId", "bucket", "objectKey", "reason"],
        "optionalKeys": ["journalEntryId"],
        "uuidKeys": ["mediaAssetId", "journalEntryId"],
    },
}

SUPPORTED_JOB_KINDS: Final = (
    "catalog_alias_suggestions_refresh",
    "catalog_fuzzy_duplicate_qa_refresh",
    "catalog_match_suggestions_refresh",
    "catalog_typeahead_reindex",
    "journal_entry_index",
    "journal_entry_unindex",
    "stable_registry_edition_build",
    "stable_registry_extension_pack_build",
    "stable_registry_foundation_build",
)

REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS: Final = (
    "job_queue_catalog_alias_payload_check",
    "job_queue_catalog_fuzzy_duplicate_payload_check",
    "job_queue_catalog_match_payload_check",
    "job_queue_catalog_typeahead_payload_check",
    "job_queue_erasure_media_object_delete_payload_check",
    "job_queue_journal_entry_index_payload_check",
    "job_queue_journal_entry_unindex_payload_check",
    "job_queue_media_derivative_revoke_payload_check",
    "job_queue_media_staging_finalize_payload_check",
    "job_queue_stable_registry_edition_build_payload_check",
    "job_queue_stable_registry_extension_pack_build_payload_check",
    "job_queue_stable_registry_foundation_build_payload_check",
)
