/**
 * OVE-194/OVE-195 machine-readable job queue contract.
 * OVE-225 added the per-kind payload contract enforced by the TypeScript
 * producer, the Postgres CHECK constraints, and the Python worker.
 * Mirrored by services/matching/app/job_queue_manifest.py — drift fails tests.
 */

export const JOB_QUEUE_MANIFEST_VERSION = "ove255.job-queue.v4" as const;

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
  /**
   * The Postgres CHECK constraint that enforces `payloadContract` in the
   * database. Naming it here is what makes the "enforced at every layer" claim
   * checkable: `queue:contract:check` refuses a kind whose constraint no
   * migration creates, and the worker's preflight refuses a database that is
   * missing one.
   */
  payloadConstraint: string;
  notes: string;
}

export const MEDIA_LIFECYCLE_QUEUE = "media_lifecycle" as const;
export const MEDIA_DERIVATIVE_REVOKE_KIND = "media_derivative_revoke" as const;
export const MEDIA_STAGING_FINALIZE_KIND = "media_staging_finalize" as const;

export const JOB_QUEUE_MANIFEST: readonly JobQueueManifestEntry[] = [
  // The three `stable_registry_*` build kinds were retired with the release
  // model (ADR-0025). Their payload CHECK constraints leave `job_queue` with
  // the retirement migration; until then they are extra constraints the
  // worker's preflight does not require.
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
    payloadConstraint: "job_queue_catalog_alias_payload_check",
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
    payloadConstraint: "job_queue_catalog_fuzzy_duplicate_payload_check",
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
    payloadConstraint: "job_queue_catalog_match_payload_check",
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
    payloadConstraint: "job_queue_catalog_typeahead_payload_check",
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
    payloadConstraint: "job_queue_journal_entry_index_payload_check",
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
    payloadConstraint: "job_queue_journal_entry_unindex_payload_check",
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
    payloadConstraint: "job_queue_erasure_media_object_delete_payload_check",
    notes:
      "DB-first erasure outbox for final public object keys after cover refs are cleared. Consumed in-process by erasure-execution via the shared lifecycle revoke helper.",
  },
  {
    queueName: MEDIA_LIFECYCLE_QUEUE,
    kind: MEDIA_STAGING_FINALIZE_KIND,
    consumer: "web-media-lifecycle",
    maxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    privacyClass: "identifiers_only",
    coversStructuredJournalCover: true,
    payloadContract: {
      requiredKeys: [
        "kind",
        "publishId",
        "stagingSessionId",
        "receiptSetDigest",
      ],
      optionalKeys: [],
      uuidKeys: ["publishId", "stagingSessionId"],
    },
    payloadConstraint: "job_queue_media_staging_finalize_payload_check",
    notes:
      "Atomic journal create queues only publish/session identifiers plus the receipt-set digest; the consumer derives owner scope from the committed entry and idempotently finalizes OVE-346 staging.",
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
    payloadConstraint: "job_queue_media_derivative_revoke_payload_check",
    notes:
      "Archive/unpublish revoke for processed public derivatives. Completes only after canonical custom-domain URL is non-2xx.",
  },
] as const;

export function jobQueueManifestKey(entry: {
  queueName: string;
  kind: string;
}): string {
  return `${entry.queueName}:${entry.kind}`;
}

export const MATCHING_QUEUE_NAME = "matching" as const;

/**
 * The kinds the Python worker claims — one definition, not two.
 *
 * This filtered on `consumer` while the Python mirror filtered on `queueName`.
 * The two agreed by coincidence, and nothing said they had to: a matching-queue
 * kind consumed by the web app would have split them silently, and the release
 * gate compares one against the other. `assertMatchingQueueConsistency` makes
 * the coincidence an invariant instead.
 */
export function matchingSupportedKinds(): string[] {
  return JOB_QUEUE_MANIFEST.filter(isMatchingWorkerEntry).map(
    (entry) => entry.kind,
  );
}

function isMatchingWorkerEntry(entry: JobQueueManifestEntry): boolean {
  return entry.consumer === "matching-python-worker";
}

/**
 * Fails when "the matching queue" and "what the matching worker consumes" stop
 * describing the same set. Called by the contract generator, so a manifest that
 * breaks it cannot be built into the Python mirror at all.
 */
export function assertMatchingQueueConsistency(): void {
  const byConsumer = JOB_QUEUE_MANIFEST.filter(isMatchingWorkerEntry)
    .map((entry) => entry.kind)
    .sort();
  const byQueue = JOB_QUEUE_MANIFEST.filter(
    (entry) => entry.queueName === MATCHING_QUEUE_NAME,
  )
    .map((entry) => entry.kind)
    .sort();
  if (byConsumer.join(",") !== byQueue.join(",")) {
    throw new Error(
      `Job queue manifest disagrees with itself: the matching queue holds [${byQueue.join(", ")}] but the matching worker consumes [${byConsumer.join(", ")}].`,
    );
  }
}

export function maxAttemptsForKind(queueName: string, kind: string): number {
  const entry = JOB_QUEUE_MANIFEST.find(
    (candidate) => candidate.queueName === queueName && candidate.kind === kind,
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
