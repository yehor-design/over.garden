/**
 * OVE-194/OVE-195 machine-readable job queue contract.
 * Mirrored by services/matching/app/job_queue_manifest.py — drift fails tests.
 */

export const JOB_QUEUE_MANIFEST_VERSION = "ove195.job-queue.v1" as const;

export const MATCHING_DEFAULT_MAX_ATTEMPTS = 8 as const;

export const TERMINAL_ERROR_CODES = [
  "unsupported_kind",
  "invalid_payload",
  "max_attempts_exceeded",
] as const;

export type TerminalErrorCode = (typeof TERMINAL_ERROR_CODES)[number];

export type JobQueuePrivacyClass =
  | "identifiers_only"
  | "catalog_ids_only"
  | "empty_payload";

export type JobQueueConsumer =
  | "matching-python-worker"
  | "web-erasure-execution"
  | "web-media-lifecycle";

export interface JobQueueManifestEntry {
  queueName: string;
  kind: string;
  consumer: JobQueueConsumer;
  maxAttempts: number;
  privacyClass: JobQueuePrivacyClass;
  /** Cover/document/publication changes enqueue these matching kinds only. */
  coversStructuredJournalCover: boolean;
  notes: string;
}

export const MEDIA_LIFECYCLE_QUEUE = "media_lifecycle" as const;
export const MEDIA_DERIVATIVE_REVOKE_KIND = "media_derivative_revoke" as const;
export const MEDIA_QUARANTINE_EXPIRE_KIND = "media_quarantine_expire" as const;

export const JOB_QUEUE_MANIFEST: readonly JobQueueManifestEntry[] = [
  {
    queueName: "matching",
    kind: "catalog_alias_suggestions_refresh",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "catalog_ids_only",
    coversStructuredJournalCover: false,
    notes: "Allowlisted catalogItemId only.",
  },
  {
    queueName: "matching",
    kind: "catalog_fuzzy_duplicate_qa_refresh",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "empty_payload",
    coversStructuredJournalCover: false,
    notes: "Kind-only payload.",
  },
  {
    queueName: "matching",
    kind: "catalog_match_suggestions_refresh",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "catalog_ids_only",
    coversStructuredJournalCover: false,
    notes: "Allowlisted sourceCatalogItemId only.",
  },
  {
    queueName: "matching",
    kind: "catalog_typeahead_reindex",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "empty_payload",
    coversStructuredJournalCover: false,
    notes: "Kind-only typeahead rebuild.",
  },
  {
    queueName: "matching",
    kind: "journal_entry_index",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    notes:
      "Structured journal create/edit, cover selection, reorder, and publication enqueue this kind with journalEntryId+userId only. Handler reads current DB cover/document; replay cannot resurrect an obsolete cover.",
  },
  {
    queueName: "matching",
    kind: "journal_entry_unindex",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    notes:
      "Archive/erasure/unpublish enqueue this kind. Cover-only and inline media revocation converge through current DB state, not payload blobs.",
  },
  {
    queueName: "erasure",
    kind: "erasure_media_object_delete",
    consumer: "web-erasure-execution",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    notes:
      "DB-first erasure outbox for quarantine/public object keys after cover refs cleared. Consumed in-process by erasure-execution via shared lifecycle revoke helper.",
  },
  {
    queueName: MEDIA_LIFECYCLE_QUEUE,
    kind: MEDIA_DERIVATIVE_REVOKE_KIND,
    consumer: "web-media-lifecycle",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    notes:
      "Archive/unpublish revoke for processed public derivatives. Completes only after canonical custom-domain URL is non-2xx.",
  },
  {
    queueName: MEDIA_LIFECYCLE_QUEUE,
    kind: MEDIA_QUARANTINE_EXPIRE_KIND,
    consumer: "web-media-lifecycle",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    notes:
      "Failed/unprocessed quarantine originals older than 7 days. Retention executor enqueues; consumer deletes originals.",
  },
] as const;

export function jobQueueManifestKey(entry: {
  queueName: string;
  kind: string;
}): string {
  return `${entry.queueName}:${entry.kind}`;
}

export function matchingSupportedKinds(): string[] {
  return JOB_QUEUE_MANIFEST.filter(
    (entry) => entry.consumer === "matching-python-worker",
  ).map((entry) => entry.kind);
}

export function maxAttemptsForKind(queueName: string, kind: string): number {
  const entry = JOB_QUEUE_MANIFEST.find(
    (candidate) =>
      candidate.queueName === queueName && candidate.kind === kind,
  );
  return entry?.maxAttempts ?? MATCHING_DEFAULT_MAX_ATTEMPTS;
}
