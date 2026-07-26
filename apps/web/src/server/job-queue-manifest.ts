/**
 * OVE-194/OVE-195 machine-readable job queue contract.
 * OVE-225 added the per-kind payload contract enforced by the TypeScript
 * producer, the Postgres CHECK constraints, and the Python worker.
 * Mirrored by services/matching/app/job_queue_manifest.py — drift fails tests.
 */

export const JOB_QUEUE_MANIFEST_VERSION = "ove225.job-queue.v2" as const;

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

/**
 * OVE-225: the exact payload shape a kind accepts. `requiredKeys` always
 * includes `kind`; a payload carrying any key outside required ∪ optional is
 * refused. This is the single source of truth — the Python mirror and the
 * Postgres constraints restate it, they do not redefine it.
 */
export interface JobQueuePayloadContract {
  readonly requiredKeys: readonly string[];
  readonly optionalKeys: readonly string[];
  readonly uuidKeys: readonly string[];
}

export interface JobQueueManifestEntry {
  queueName: string;
  kind: string;
  consumer: JobQueueConsumer;
  maxAttempts: number;
  privacyClass: JobQueuePrivacyClass;
  /** Cover/document/publication changes enqueue these matching kinds only. */
  coversStructuredJournalCover: boolean;
  payloadContract: JobQueuePayloadContract;
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
    payloadContract: {
      requiredKeys: ["kind", "catalogItemId"],
      optionalKeys: [],
      uuidKeys: ["catalogItemId"],
    },
    notes: "Allowlisted catalogItemId only.",
  },
  {
    queueName: "matching",
    kind: "catalog_fuzzy_duplicate_qa_refresh",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "empty_payload",
    coversStructuredJournalCover: false,
    payloadContract: {
      requiredKeys: ["kind"],
      optionalKeys: [],
      uuidKeys: [],
    },
    notes: "Kind-only payload.",
  },
  {
    queueName: "matching",
    kind: "catalog_match_suggestions_refresh",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "catalog_ids_only",
    coversStructuredJournalCover: false,
    payloadContract: {
      requiredKeys: ["kind", "sourceCatalogItemId"],
      optionalKeys: [],
      uuidKeys: ["sourceCatalogItemId"],
    },
    notes: "Allowlisted sourceCatalogItemId only.",
  },
  {
    queueName: "matching",
    kind: "catalog_typeahead_reindex",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "empty_payload",
    coversStructuredJournalCover: false,
    payloadContract: {
      requiredKeys: ["kind"],
      optionalKeys: [],
      uuidKeys: [],
    },
    notes: "Kind-only typeahead rebuild.",
  },
  {
    queueName: "matching",
    kind: "journal_entry_index",
    consumer: "matching-python-worker",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    payloadContract: {
      requiredKeys: ["kind", "journalEntryId", "userId"],
      optionalKeys: [],
      uuidKeys: ["journalEntryId", "userId"],
    },
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
    payloadContract: {
      requiredKeys: ["kind", "journalEntryId", "userId"],
      optionalKeys: [],
      uuidKeys: ["journalEntryId", "userId"],
    },
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
    payloadContract: {
      requiredKeys: ["kind", "requestId", "bucket", "objectKey"],
      optionalKeys: [],
      uuidKeys: [],
    },
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
    payloadContract: {
      requiredKeys: ["kind", "mediaAssetId", "bucket", "objectKey", "reason"],
      optionalKeys: ["journalEntryId"],
      uuidKeys: ["mediaAssetId", "journalEntryId"],
    },
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
    payloadContract: {
      requiredKeys: ["kind", "mediaAssetId", "bucket", "objectKey"],
      optionalKeys: [],
      uuidKeys: ["mediaAssetId"],
    },
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

/** Mirrors the `~*` regex used by the job_queue payload CHECK constraints. */
export const JOB_QUEUE_PAYLOAD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JOB_QUEUE_PAYLOAD_VIOLATION_CLASSES = [
  "payload_not_object",
  "unknown_kind",
  "missing_required_key",
  "unexpected_key",
  "non_string_value",
  "non_uuid_value",
] as const;

export type JobQueuePayloadViolationClass =
  (typeof JOB_QUEUE_PAYLOAD_VIOLATION_CLASSES)[number];

export interface JobQueuePayloadViolation {
  queueName: string;
  /** Null unless the kind is a declared manifest kind — never echo attacker input. */
  kind: string | null;
  ruleClass: JobQueuePayloadViolationClass;
  /** Null unless the key name comes from the declared contract, for the same reason. */
  key: string | null;
}

export function payloadContractFor(
  queueName: string,
  kind: string,
): JobQueuePayloadContract | null {
  return (
    JOB_QUEUE_MANIFEST.find(
      (entry) => entry.queueName === queueName && entry.kind === kind,
    )?.payloadContract ?? null
  );
}

/**
 * Returns the first contract violation, or null when the payload conforms.
 * Never returns a payload value, an undeclared key name, or an undeclared kind:
 * a refusal report must stay safe to log (AGENTS.md hard rules 1 and 7).
 */
export function validateJobQueuePayload(
  queueName: string,
  payload: unknown,
): JobQueuePayloadViolation | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return {
      queueName,
      kind: null,
      ruleClass: "payload_not_object",
      key: null,
    };
  }

  const record = payload as Record<string, unknown>;
  const kind = record.kind;
  const contract =
    typeof kind === "string" ? payloadContractFor(queueName, kind) : null;

  if (contract === null) {
    return { queueName, kind: null, ruleClass: "unknown_kind", key: null };
  }

  const declaredKind = kind as string;
  const present = new Set(Object.keys(record));

  for (const required of contract.requiredKeys) {
    if (!present.has(required)) {
      return {
        queueName,
        kind: declaredKind,
        ruleClass: "missing_required_key",
        key: required,
      };
    }
  }

  const allowed = new Set([...contract.requiredKeys, ...contract.optionalKeys]);
  for (const key of present) {
    if (!allowed.has(key)) {
      return {
        queueName,
        kind: declaredKind,
        ruleClass: "unexpected_key",
        key: null,
      };
    }
  }

  for (const key of allowed) {
    if (!present.has(key)) {
      continue;
    }
    const value = record[key];
    if (typeof value !== "string" || value.trim() === "") {
      return {
        queueName,
        kind: declaredKind,
        ruleClass: "non_string_value",
        key,
      };
    }
    if (
      contract.uuidKeys.includes(key) &&
      !JOB_QUEUE_PAYLOAD_UUID_PATTERN.test(value)
    ) {
      return {
        queueName,
        kind: declaredKind,
        ruleClass: "non_uuid_value",
        key,
      };
    }
  }

  return null;
}

export function formatJobQueuePayloadViolation(
  violation: JobQueuePayloadViolation,
): string {
  const kind = violation.kind ?? "undeclared";
  const key = violation.key === null ? "" : ` (${violation.key})`;
  return `job payload rejected for ${violation.queueName}:${kind} — ${violation.ruleClass}${key}`;
}

/** Producer-side refusal. Carries the rule class only, never a payload value. */
export class JobQueuePayloadContractError extends Error {
  readonly violation: JobQueuePayloadViolation;

  constructor(violation: JobQueuePayloadViolation) {
    super(formatJobQueuePayloadViolation(violation));
    this.name = "JobQueuePayloadContractError";
    this.violation = violation;
  }
}
