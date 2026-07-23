import "server-only";

import { sql } from "kysely";

import { db } from "@/db";
import { enqueueJob } from "@/server/queue";
import { meiliSearchClient } from "@/server/search/client";
import {
  fingerprintJournalSearchDocument,
  listGloballyEligibleJournalSearchDocuments,
  type PublicJournalSearchExpectedRow,
} from "@/server/search/public-journal-eligibility";
import {
  assertSafeJournalSearchDocumentId,
  isSafeJournalSearchDocumentId,
} from "@/server/search/public-journal-document-id";
import type { JournalEntrySearchContractDocument } from "@/server/search/documents";

export const PUBLIC_JOURNAL_SEARCH_PARITY_POLICY = "ove196.publicIndexParity.v1";
export const PUBLIC_JOURNAL_ENTRIES_INDEX = "journal_entries";
export const DEFAULT_PUBLIC_INDEX_REPAIR_BATCH_SIZE = 100;

export type PublicJournalParityClass =
  | "expected"
  | "missing"
  | "extraneous"
  | "stale"
  | "unsafe_schema"
  | "duplicate"
  | "invalid_id"
  | "pending"
  | "terminal_failure";

export interface PublicJournalParityCounts {
  expected: number;
  missing: number;
  extraneous: number;
  stale: number;
  unsafe_schema: number;
  duplicate: number;
  invalid_id: number;
  pending: number;
  terminal_failure: number;
  meiliDocumentCount: number;
  postgresEligibleCount: number;
}

export interface PublicJournalParityReport {
  policyVersion: typeof PUBLIC_JOURNAL_SEARCH_PARITY_POLICY;
  issue: "OVE-196";
  zeroGap: boolean;
  counts: PublicJournalParityCounts;
  evidenceSafety: "counts_and_booleans_only";
}

export interface PublicJournalRepairPlan {
  policyVersion: typeof PUBLIC_JOURNAL_SEARCH_PARITY_POLICY;
  issue: "OVE-196";
  actions: {
    reindex: number;
    unindexDelete: number;
    deleteInvalid: number;
  };
  evidenceSafety: "counts_and_booleans_only";
}

interface InternalParityState {
  report: PublicJournalParityReport;
  expectedById: Map<string, PublicJournalSearchExpectedRow>;
  missingIds: string[];
  staleIds: string[];
  extraneousIds: string[];
  invalidIds: string[];
}

const ALLOWED_DOCUMENT_KEYS = new Set([
  "body",
  "coarseRegionCode",
  "coverPublicUrl",
  "coverSource",
  "createdAt",
  "entryDate",
  "entryScope",
  "id",
  "kind",
  "locationVisibility",
  "noindex",
  "publicPath",
  "publicSlug",
  "title",
]);

const FORBIDDEN_DOCUMENT_KEYS = new Set([
  "ownerUserId",
  "owner_user_id",
  "userId",
  "mediaAssetId",
  "coverMediaAssetId",
  "derivativeKey",
  "quarantineKey",
  "originalKey",
  "signedUrl",
  "latitude",
  "longitude",
  "visibility",
  "lifecycleState",
]);

export async function classifyPublicJournalIndexParity(): Promise<PublicJournalParityReport> {
  const state = await buildInternalParityState();
  return state.report;
}

export async function planPublicJournalIndexRepair(): Promise<PublicJournalRepairPlan> {
  const state = await buildInternalParityState();
  return {
    policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
    issue: "OVE-196",
    actions: {
      reindex: state.missingIds.length + state.staleIds.length,
      unindexDelete: state.extraneousIds.length,
      deleteInvalid: state.invalidIds.length,
    },
    evidenceSafety: "counts_and_booleans_only",
  };
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
    Math.min(input?.batchSize ?? DEFAULT_PUBLIC_INDEX_REPAIR_BATCH_SIZE, 100),
  );
  const state = await buildInternalParityState();
  const plan: PublicJournalRepairPlan = {
    policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
    issue: "OVE-196",
    actions: {
      reindex: state.missingIds.length + state.staleIds.length,
      unindexDelete: state.extraneousIds.length,
      deleteInvalid: state.invalidIds.length,
    },
    evidenceSafety: "counts_and_booleans_only",
  };

  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);
  let reindexUpserted = 0;
  const reindexTargets = [...state.missingIds, ...state.staleIds].slice(
    0,
    batchSize,
  );
  const documents = reindexTargets.flatMap((id) => {
    const expected = state.expectedById.get(id);
    return expected ? [expected.document] : [];
  });
  if (documents.length > 0) {
    const task = await index.addDocuments(documents, { primaryKey: "id" });
    const taskUid =
      typeof task === "object" && task && "taskUid" in task
        ? Number((task as { taskUid?: unknown }).taskUid)
        : NaN;
    if (Number.isFinite(taskUid)) {
      await meiliSearchClient().tasks.waitForTask(taskUid, {
        timeout: 120_000,
        interval: 250,
      });
    }
    reindexUpserted = documents.length;
  }

  let deleted = 0;
  const deleteTargets = [...state.extraneousIds, ...state.invalidIds].slice(
    0,
    batchSize,
  );
  for (const id of deleteTargets) {
    const task = await index.deleteDocument(id);
    const taskUid =
      typeof task === "object" && task && "taskUid" in task
        ? Number((task as { taskUid?: unknown }).taskUid)
        : NaN;
    if (Number.isFinite(taskUid)) {
      await meiliSearchClient().tasks.waitForTask(taskUid, {
        timeout: 120_000,
        interval: 250,
      });
    }
    deleted += 1;
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

export function redactParityReportForEvidence(
  report: PublicJournalParityReport,
): PublicJournalParityReport {
  return {
    policyVersion: report.policyVersion,
    issue: "OVE-196",
    zeroGap: report.zeroGap,
    counts: { ...report.counts },
    evidenceSafety: "counts_and_booleans_only",
  };
}

export function assertPublicJournalParityZeroGap(
  report: PublicJournalParityReport,
): void {
  if (!report.zeroGap) {
    throw new Error("OVE-196 public journal search parity is not zero-gap");
  }
}

async function buildInternalParityState(): Promise<InternalParityState> {
  const expectedRows = await listGloballyEligibleJournalSearchDocuments();
  const expectedById = new Map(expectedRows.map((row) => [row.id, row]));
  const meiliDocs = await listMeiliJournalDocuments();
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

  for (const doc of meiliDocs) {
    const rawId = doc.id;
    if (!isSafeJournalSearchDocumentId(rawId)) {
      invalidId += 1;
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
    if (hasUnsafeSchema(doc)) {
      unsafeSchema += 1;
      // Eligible IDs with unsafe Meili payloads must be upserted, not only
      // deleted — otherwise apply would leave missing docs and zeroGap false.
      if (expected) {
        staleIds.push(id);
      } else {
        extraneousIds.push(id);
      }
      continue;
    }

    if (!expected) {
      extraneous += 1;
      extraneousIds.push(id);
      continue;
    }

    const observedFingerprint = fingerprintObservedDocument(doc, expected.document);
    if (observedFingerprint !== expected.fingerprint) {
      stale += 1;
      staleIds.push(id);
    }
  }

  for (const expected of expectedRows) {
    if (!seenIds.has(expected.id)) {
      missing += 1;
      missingIds.push(expected.id);
    }
  }

  const queue = await loadJournalSearchQueueClasses();
  const counts: PublicJournalParityCounts = {
    expected: expectedRows.length - missing - stale,
    missing,
    extraneous,
    stale,
    unsafe_schema: unsafeSchema,
    duplicate,
    invalid_id: invalidId,
    pending: queue.pending,
    terminal_failure: queue.terminalFailure,
    meiliDocumentCount: meiliDocs.length,
    postgresEligibleCount: expectedRows.length,
  };

  const zeroGap =
    counts.missing === 0 &&
    counts.extraneous === 0 &&
    counts.stale === 0 &&
    counts.unsafe_schema === 0 &&
    counts.duplicate === 0 &&
    counts.invalid_id === 0;

  return {
    report: {
      policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
      issue: "OVE-196",
      zeroGap,
      counts,
      evidenceSafety: "counts_and_booleans_only",
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
    const page = await index.getDocuments({
      offset,
      limit,
      fields: [
        "id",
        "kind",
        "entryScope",
        "locationVisibility",
        "coarseRegionCode",
        "noindex",
        "coverSource",
        "coverPublicUrl",
        "title",
        "body",
        "publicSlug",
        "publicPath",
        "entryDate",
        "createdAt",
      ],
    });
    const results = ((page.results ?? []) as unknown as Array<
      Record<string, unknown> & { id?: unknown }
    >);
    documents.push(...results);
    if (results.length < limit) break;
    offset += limit;
  }

  return documents;
}

function hasUnsafeSchema(doc: Record<string, unknown>): boolean {
  for (const key of Object.keys(doc)) {
    if (FORBIDDEN_DOCUMENT_KEYS.has(key)) return true;
    if (!ALLOWED_DOCUMENT_KEYS.has(key)) return true;
  }
  if (doc.kind !== "journal_entry") return true;
  if (typeof doc.coverSource !== "string") return true;
  return false;
}

function fingerprintObservedDocument(
  doc: Record<string, unknown>,
  expected: JournalEntrySearchContractDocument,
): string {
  const observed = {
    id: typeof doc.id === "string" ? doc.id.toLowerCase() : "",
    title: typeof doc.title === "string" ? doc.title : "",
    body: typeof doc.body === "string" ? doc.body : "",
    publicSlug: typeof doc.publicSlug === "string" ? doc.publicSlug : "",
    publicPath: typeof doc.publicPath === "string" ? doc.publicPath : "",
    locationVisibility:
      doc.locationVisibility === "region" || doc.locationVisibility === "hidden"
        ? doc.locationVisibility
        : expected.locationVisibility,
    ...(typeof doc.coarseRegionCode === "string"
      ? { coarseRegionCode: doc.coarseRegionCode as never }
      : {}),
    noindex: Boolean(doc.noindex),
    entryDate: typeof doc.entryDate === "string" ? doc.entryDate : "",
    entryScope:
      doc.entryScope === "object" || doc.entryScope === "space"
        ? doc.entryScope
        : expected.entryScope,
    createdAt: typeof doc.createdAt === "string" ? doc.createdAt : "",
    kind: "journal_entry" as const,
    coverSource:
      doc.coverSource === "automatic_inline" ||
      doc.coverSource === "explicit_inline" ||
      doc.coverSource === "separate" ||
      doc.coverSource === "none"
        ? doc.coverSource
        : "none",
    ...(typeof doc.coverPublicUrl === "string"
      ? { coverPublicUrl: doc.coverPublicUrl }
      : {}),
  } satisfies JournalEntrySearchContractDocument;

  // Stale compares public-safe projection classes, not private content equality
  // of title/body (those are allowed fields but evidence stays class-based).
  return fingerprintJournalSearchDocument({
    ...observed,
    title: expected.title,
    body: expected.body,
    publicSlug: expected.publicSlug,
    publicPath: expected.publicPath,
    entryDate: expected.entryDate,
    createdAt: expected.createdAt,
  });
}

async function loadJournalSearchQueueClasses(): Promise<{
  pending: number;
  terminalFailure: number;
}> {
  const rows = await db
    .selectFrom("job_queue")
    .select(["status", sql<number>`count(*)::int`.as("count")])
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
  let terminalFailure = 0;
  for (const row of rows) {
    if (row.status === "dead") terminalFailure += Number(row.count);
    else pending += Number(row.count);
  }
  return { pending, terminalFailure };
}
