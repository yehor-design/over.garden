import "server-only";

import { sql } from "kysely";

import { db } from "@/db";
import { enqueueJob } from "@/server/queue";
import { meiliSearchClient } from "@/server/search/client";
import {
  listGloballyEligibleJournalSearchDocuments,
  type PublicJournalSearchExpectedRow,
} from "@/server/search/public-journal-eligibility";
import {
  assertSafeJournalSearchDocumentId,
  isSafeJournalSearchDocumentId,
} from "@/server/search/public-journal-document-id";
import { loadPublicProjectionOutboxGate } from "@/server/search/public-projection-outbox";
import {
  ALLOWED_JOURNAL_DOCUMENT_FIELDS,
  corpusFingerprint,
  diffJournalSearchDocumentFields,
  fingerprintJournalSearchDocument,
  validateObservedJournalSearchDocument,
  type JournalDocumentReason,
} from "@/server/search/public-journal-document-contract";

/**
 * OVE-227 supersedes the OVE-196 `v1` gate. `v1` compared identifiers, key
 * sets, and projection classes while substituting expected values for observed
 * ones, so stale content passed. `v2` compares exact full-value hashes,
 * validates the observed schema on its own merits, and refuses `zeroGap` while
 * overdue or terminal indexing work could still be hiding drift.
 */
export const PUBLIC_JOURNAL_SEARCH_PARITY_POLICY = "ove242.publicIndexParity.v3";
export const PUBLIC_JOURNAL_PARITY_ISSUE = "OVE-227";
export const PUBLIC_JOURNAL_ENTRIES_INDEX = "journal_entries";
export const DEFAULT_PUBLIC_INDEX_REPAIR_BATCH_SIZE = 100;
export const MAX_PUBLIC_INDEX_REPAIR_BATCH_SIZE = 500;
export const PUBLIC_INDEX_REPAIR_MAX_ATTEMPTS = 3;
const PUBLIC_INDEX_REPAIR_RETRY_BASE_MS = 250;

/**
 * A journal index/unindex job that has been runnable for longer than this is
 * not "in flight", it is stuck — and a stuck job can hide drift that the Meili
 * snapshot has not yet received.
 */
export const JOURNAL_SEARCH_JOB_OVERDUE_SECONDS = 300;

const MEILI_TASK_TIMEOUT_MS = 120_000;
const MEILI_TASK_POLL_INTERVAL_MS = 250;

export type PublicJournalParityClass =
  | "expected"
  | "missing"
  | "extraneous"
  | "stale"
  | "unsafe_schema"
  | "duplicate"
  | "invalid_id"
  | "pending"
  | "overdue"
  | "terminal_failure"
  | "projection_unconverged"
  | "projection_overdue"
  | "projection_dead";

export interface PublicJournalParityCounts {
  expected: number;
  missing: number;
  extraneous: number;
  stale: number;
  unsafe_schema: number;
  duplicate: number;
  invalid_id: number;
  pending: number;
  overdue: number;
  terminal_failure: number;
  /** OVE-242 outbox rows whose applied generation is behind the desired one. */
  projection_unconverged: number;
  /** OVE-242 unconverged rows past the overdue budget. Blocks `zeroGap`. */
  projection_overdue: number;
  /** OVE-242 dead-lettered rows. Blocks `zeroGap`. */
  projection_dead: number;
  meiliDocumentCount: number;
  postgresEligibleCount: number;
}

export interface PublicJournalParityReport {
  policyVersion: typeof PUBLIC_JOURNAL_SEARCH_PARITY_POLICY;
  issue: typeof PUBLIC_JOURNAL_PARITY_ISSUE;
  zeroGap: boolean;
  counts: PublicJournalParityCounts;
  /** Field names (never values) whose observed hash differs from expected. */
  driftFieldClasses: string[];
  /** Schema/value/lifecycle rejection classes observed in the index. */
  invalidReasonClasses: JournalDocumentReason[];
  /** Order-independent digests over the two corpora. Safe to publish. */
  expectedCorpusHash: string;
  observedCorpusHash: string;
  evidenceSafety: "counts_classes_and_safe_hashes";
}

export interface PublicJournalRepairPlan {
  policyVersion: typeof PUBLIC_JOURNAL_SEARCH_PARITY_POLICY;
  issue: typeof PUBLIC_JOURNAL_PARITY_ISSUE;
  actions: {
    reindex: number;
    unindexDelete: number;
    deleteInvalid: number;
  };
  evidenceSafety: "counts_classes_and_safe_hashes";
}

export interface PublicJournalQueueGate {
  pending: number;
  overdue: number;
  terminalFailure: number;
}

interface InternalParityState {
  report: PublicJournalParityReport;
  expectedById: Map<string, PublicJournalSearchExpectedRow>;
  missingIds: string[];
  staleIds: string[];
  extraneousIds: string[];
  invalidIds: string[];
}

export async function classifyPublicJournalIndexParity(): Promise<PublicJournalParityReport> {
  const state = await buildInternalParityState();
  return state.report;
}

export async function planPublicJournalIndexRepair(): Promise<PublicJournalRepairPlan> {
  const state = await buildInternalParityState();
  return buildRepairPlan(state);
}

export async function applyPublicJournalIndexRepair(input?: {
  batchSize?: number;
}): Promise<{
  plan: PublicJournalRepairPlan;
  applied: {
    reindexUpserted: number;
    deleted: number;
  };
  after: PublicJournalParityReport;
}> {
  const batchSize = Math.max(
    1,
    Math.min(
      input?.batchSize ?? DEFAULT_PUBLIC_INDEX_REPAIR_BATCH_SIZE,
      MAX_PUBLIC_INDEX_REPAIR_BATCH_SIZE,
    ),
  );
  const state = await buildInternalParityState();
  const plan = buildRepairPlan(state);

  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);

  // Reindex first: an eligible document that is both missing and stale must end
  // up present and exact, never deleted by the removal pass below.
  const reindexTargets = [...state.missingIds, ...state.staleIds].slice(
    0,
    batchSize,
  );
  const documents = reindexTargets.flatMap((id) => {
    const expected = state.expectedById.get(id);
    return expected ? [expected.document] : [];
  });
  let reindexUpserted = 0;
  if (documents.length > 0) {
    await withBoundedRetry(async () => {
      const task = await index.addDocuments(documents, { primaryKey: "id" });
      await waitForMeiliTask(task);
    });
    reindexUpserted = documents.length;
  }

  const deleteTargets = [...state.extraneousIds, ...state.invalidIds]
    .filter((id) => !state.expectedById.has(id))
    .slice(0, batchSize);
  let deleted = 0;
  if (deleteTargets.length > 0) {
    await withBoundedRetry(async () => {
      const task = await index.deleteDocuments(deleteTargets);
      await waitForMeiliTask(task);
    });
    deleted = deleteTargets.length;
  }

  const after = await classifyPublicJournalIndexParity();
  return {
    plan,
    applied: { reindexUpserted, deleted },
    after,
  };
}

export async function enqueueJournalEntryIndexJob(input: {
  journalEntryId: string;
  userId: string;
  idempotencyKey?: string;
}): Promise<string> {
  const journalEntryId = assertSafeJournalSearchDocumentId(input.journalEntryId);
  const userId = assertSafeJournalSearchDocumentId(input.userId);
  return enqueueJob(
    "matching",
    {
      kind: "journal_entry_index",
      journalEntryId,
      userId,
    },
    {
      idempotencyKey:
        input.idempotencyKey ?? `journal_entry_index:${journalEntryId}`,
    },
  );
}

export async function enqueueJournalEntryUnindexJob(input: {
  journalEntryId: string;
  userId: string;
  idempotencyKey?: string;
}): Promise<string> {
  const journalEntryId = assertSafeJournalSearchDocumentId(input.journalEntryId);
  const userId = assertSafeJournalSearchDocumentId(input.userId);
  return enqueueJob(
    "matching",
    {
      kind: "journal_entry_unindex",
      journalEntryId,
      userId,
    },
    {
      idempotencyKey:
        input.idempotencyKey ?? `journal_entry_unindex:${journalEntryId}`,
    },
  );
}

/**
 * Evidence projection. Every retained value is a count, a class name, a boolean
 * or a SHA-256 digest — never a document id, title, body, slug, or job payload.
 */
export function redactParityReportForEvidence(
  report: PublicJournalParityReport,
): PublicJournalParityReport {
  return {
    policyVersion: report.policyVersion,
    issue: PUBLIC_JOURNAL_PARITY_ISSUE,
    zeroGap: report.zeroGap,
    counts: { ...report.counts },
    driftFieldClasses: [...report.driftFieldClasses].sort(),
    invalidReasonClasses: [...report.invalidReasonClasses].sort(),
    expectedCorpusHash: report.expectedCorpusHash,
    observedCorpusHash: report.observedCorpusHash,
    evidenceSafety: "counts_classes_and_safe_hashes",
  };
}

export function assertPublicJournalParityZeroGap(
  report: PublicJournalParityReport,
): void {
  if (!report.zeroGap) {
    throw new Error(
      `${PUBLIC_JOURNAL_PARITY_ISSUE} public journal search parity is not zero-gap`,
    );
  }
}

/**
 * `zeroGap` is true only when the index matches Postgres exactly *and* no
 * overdue or terminal indexing job could still be masking drift.
 */
export function derivePublicJournalZeroGap(
  counts: PublicJournalParityCounts,
): boolean {
  return (
    counts.missing === 0 &&
    counts.extraneous === 0 &&
    counts.stale === 0 &&
    counts.unsafe_schema === 0 &&
    counts.duplicate === 0 &&
    counts.invalid_id === 0 &&
    counts.overdue === 0 &&
    counts.terminal_failure === 0 &&
    // OVE-242: an unconverged privacy-reducing intent means the index may still
    // be serving text, a region or a document the canonical write already
    // revoked. Overdue or dead-lettered projection work fails the gate closed.
    counts.projection_overdue === 0 &&
    counts.projection_dead === 0
  );
}

function buildRepairPlan(state: InternalParityState): PublicJournalRepairPlan {
  return {
    policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
    issue: PUBLIC_JOURNAL_PARITY_ISSUE,
    actions: {
      reindex: state.missingIds.length + state.staleIds.length,
      unindexDelete: state.extraneousIds.length,
      deleteInvalid: state.invalidIds.length,
    },
    evidenceSafety: "counts_classes_and_safe_hashes",
  };
}

async function buildInternalParityState(): Promise<InternalParityState> {
  const expectedRows = await listGloballyEligibleJournalSearchDocuments();
  const expectedById = new Map(expectedRows.map((row) => [row.id, row]));
  const meiliDocs = await listMeiliJournalDocuments();
  const publicDerivativeBaseUrl =
    process.env.R2_PUBLIC_BASE_URL?.trim() || null;
  const seenIds = new Map<string, number>();

  let missing = 0;
  let extraneous = 0;
  let stale = 0;
  let unsafeSchema = 0;
  let duplicate = 0;
  let invalidId = 0;

  const missingIds: string[] = [];
  const staleIds: string[] = [];
  const extraneousIds: string[] = [];
  const invalidIds: string[] = [];
  const driftFieldClasses = new Set<string>();
  const invalidReasonClasses = new Set<JournalDocumentReason>();
  const observedFingerprints: string[] = [];

  for (const doc of meiliDocs) {
    const rawId = doc.id;
    if (typeof rawId !== "string" || !isSafeJournalSearchDocumentId(rawId)) {
      invalidId += 1;
      invalidReasonClasses.add("invalid_id");
      if (typeof rawId === "string") invalidIds.push(rawId);
      continue;
    }
    const id = rawId.toLowerCase();
    seenIds.set(id, (seenIds.get(id) ?? 0) + 1);
    if ((seenIds.get(id) ?? 0) > 1) {
      duplicate += 1;
      continue;
    }

    const expected = expectedById.get(id);
    const validation = validateObservedJournalSearchDocument(doc, {
      publicDerivativeBaseUrl,
    });

    if (!validation.ok || validation.document === null) {
      unsafeSchema += 1;
      for (const reason of validation.reasons) invalidReasonClasses.add(reason);
      for (const field of validation.fields) {
        if ((ALLOWED_JOURNAL_DOCUMENT_FIELDS as readonly string[]).includes(field)) {
          driftFieldClasses.add(field);
        }
      }
      // An eligible id with an unsafe payload must be upserted, not only
      // deleted — otherwise repair would leave it missing and zeroGap false.
      if (expected) staleIds.push(id);
      else extraneousIds.push(id);
      continue;
    }

    const observedFingerprint = fingerprintJournalSearchDocument(
      validation.document,
    );
    observedFingerprints.push(observedFingerprint);

    if (!expected) {
      extraneous += 1;
      extraneousIds.push(id);
      continue;
    }

    if (observedFingerprint !== expected.fingerprint) {
      stale += 1;
      staleIds.push(id);
      for (const field of diffJournalSearchDocumentFields(
        expected.document,
        validation.document,
      )) {
        driftFieldClasses.add(field);
      }
    }
  }

  for (const expected of expectedRows) {
    if (!seenIds.has(expected.id)) {
      missing += 1;
      missingIds.push(expected.id);
    }
  }

  const queue = await loadJournalSearchQueueGate();
  const outbox = await loadPublicProjectionOutboxGate();
  const counts: PublicJournalParityCounts = {
    expected: expectedRows.length - missing - stale,
    missing,
    extraneous,
    stale,
    unsafe_schema: unsafeSchema,
    duplicate,
    invalid_id: invalidId,
    pending: queue.pending,
    overdue: queue.overdue,
    terminal_failure: queue.terminalFailure,
    projection_unconverged: outbox.unconverged,
    projection_overdue: outbox.overdue,
    projection_dead: outbox.dead,
    meiliDocumentCount: meiliDocs.length,
    postgresEligibleCount: expectedRows.length,
  };

  return {
    report: {
      policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
      issue: PUBLIC_JOURNAL_PARITY_ISSUE,
      zeroGap: derivePublicJournalZeroGap(counts),
      counts,
      driftFieldClasses: [...driftFieldClasses].sort(),
      invalidReasonClasses: [...invalidReasonClasses].sort(),
      expectedCorpusHash: corpusFingerprint(
        expectedRows.map((row) => row.fingerprint),
      ),
      observedCorpusHash: corpusFingerprint(observedFingerprints),
      evidenceSafety: "counts_classes_and_safe_hashes",
    },
    expectedById,
    missingIds,
    staleIds,
    extraneousIds,
    invalidIds,
  };
}

async function listMeiliJournalDocuments(): Promise<
  Array<Record<string, unknown> & { id?: unknown }>
> {
  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);
  const documents: Array<Record<string, unknown> & { id?: unknown }> = [];
  let offset = 0;
  const limit = 200;

  for (;;) {
    // No `fields` projection: parity must see every stored attribute, because
    // an unexpected or forbidden key is exactly what the schema gate looks for.
    const page = await index.getDocuments({ offset, limit });
    const results = (page.results ?? []) as unknown as Array<
      Record<string, unknown> & { id?: unknown }
    >;
    documents.push(...results);
    if (results.length < limit) break;
    offset += limit;
  }

  return documents;
}

/**
 * Queue classes that can hide index drift.
 *
 * - `pending`: claimable or in-flight work, informational only.
 * - `overdue`: runnable for longer than the budget, or a retry that has been
 *   waiting past it. Blocks `zeroGap`.
 * - `terminalFailure`: dead-lettered. Blocks `zeroGap`.
 */
export async function loadJournalSearchQueueGate(): Promise<PublicJournalQueueGate> {
  const overdueBefore = new Date(
    Date.now() - JOURNAL_SEARCH_JOB_OVERDUE_SECONDS * 1000,
  );

  const rows = await db
    .selectFrom("job_queue")
    .select([
      "status",
      sql<number>`count(*)::int`.as("count"),
      sql<number>`
        count(*) filter (
          where ${sql.ref("job_queue.available_at")} < ${overdueBefore}
        )::int
      `.as("overdueCount"),
    ])
    .where("queue_name", "=", "matching")
    .where((eb) =>
      eb.or([
        sql<boolean>`${eb.ref("payload")}->>'kind' = 'journal_entry_index'`,
        sql<boolean>`${eb.ref("payload")}->>'kind' = 'journal_entry_unindex'`,
      ]),
    )
    .where("status", "in", ["pending", "processing", "failed", "dead"])
    .groupBy("status")
    .execute();

  let pending = 0;
  let overdue = 0;
  let terminalFailure = 0;
  for (const row of rows) {
    const count = Number(row.count);
    if (row.status === "dead") {
      terminalFailure += count;
      continue;
    }
    pending += count;
    overdue += Number(row.overdueCount);
  }
  return { pending, overdue, terminalFailure };
}

async function waitForMeiliTask(task: unknown): Promise<void> {
  const taskUid =
    typeof task === "object" && task && "taskUid" in task
      ? Number((task as { taskUid?: unknown }).taskUid)
      : NaN;
  if (!Number.isFinite(taskUid)) return;
  await meiliSearchClient().tasks.waitForTask(taskUid, {
    timeout: MEILI_TASK_TIMEOUT_MS,
    interval: MEILI_TASK_POLL_INTERVAL_MS,
  });
}

/**
 * Bounded retry for one Meilisearch repair batch. Repair is idempotent
 * (upsert by primary key, delete by id), so a retried batch converges to the
 * same state instead of double-applying.
 */
async function withBoundedRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PUBLIC_INDEX_REPAIR_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === PUBLIC_INDEX_REPAIR_MAX_ATTEMPTS) break;
      await sleep(PUBLIC_INDEX_REPAIR_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("public journal index repair batch failed");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
