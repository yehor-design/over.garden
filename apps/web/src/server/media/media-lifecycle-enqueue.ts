import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import type { JsonValue } from "@/db/types";

/** Local literals keep the job-queue producer scanner deterministic. */
const MEDIA_LIFECYCLE_QUEUE = "media_lifecycle";
const MEDIA_DERIVATIVE_REVOKE_KIND = "media_derivative_revoke";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type MediaLifecycleBucket = "quarantine" | "public_derivative";

export interface MediaRevokeCandidate {
  mediaAssetId: string;
  bucket: MediaLifecycleBucket;
  objectKey: string;
}

/**
 * Archive/unpublish: every processed public derivative on the entry becomes
 * unreachable. Active cover/inline references do not protect derivatives once
 * the owning publication is gone — the page is 410 and direct URLs must die.
 *
 * Non-archive cleanup (cover replace/remove) must call
 * `listOrphanProcessedDerivativesForEntry` instead so still-referenced assets
 * stay reachable.
 */
export async function listArchiveDerivativeRevokeCandidates(
  executor: QueryExecutor,
  input: { journalEntryId: string; ownerUserId: string },
): Promise<MediaRevokeCandidate[]> {
  const rows = await executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key"])
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("owner_user_id", "=", input.ownerUserId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .where("revoked_at", "is", null)
    .execute();

  return rows.flatMap((row) => {
    if (!row.derivative_key) return [];
    return [
      {
        mediaAssetId: row.id,
        bucket: "public_derivative" as const,
        objectKey: row.derivative_key,
      },
    ];
  });
}

/**
 * Cover/inline mutations: only revoke processed derivatives that are no longer
 * referenced by cover_media_asset_id or an inline document_position slot.
 */
export async function listOrphanProcessedDerivativesForEntry(
  executor: QueryExecutor,
  input: { journalEntryId: string; ownerUserId: string },
): Promise<MediaRevokeCandidate[]> {
  const entry = await executor
    .selectFrom("journal_entries")
    .select(["id", "cover_media_asset_id", "content_document"])
    .where("id", "=", input.journalEntryId)
    .where("owner_user_id", "=", input.ownerUserId)
    .executeTakeFirst();

  if (!entry) return [];

  const referencedIds = new Set<string>();
  if (entry.cover_media_asset_id) {
    referencedIds.add(entry.cover_media_asset_id);
  }

  const document = entry.content_document;
  if (document && typeof document === "object" && !Array.isArray(document)) {
    const blocks = (document as { blocks?: unknown }).blocks;
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (!block || typeof block !== "object" || Array.isArray(block)) {
          continue;
        }
        const typed = block as { type?: unknown; data?: unknown };
        if (typed.type !== "image" || !typed.data || typeof typed.data !== "object") {
          continue;
        }
        const mediaAssetId = (typed.data as { mediaAssetId?: unknown })
          .mediaAssetId;
        if (typeof mediaAssetId === "string" && mediaAssetId.length > 0) {
          referencedIds.add(mediaAssetId);
        }
      }
    }
  }

  const rows = await executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key", "usage_role", "document_position"])
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("owner_user_id", "=", input.ownerUserId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .where("revoked_at", "is", null)
    .execute();

  return rows.flatMap((row) => {
    if (!row.derivative_key) return [];
    if (referencedIds.has(row.id)) return [];
    // Cover-only without cover pointer and without document reference is orphan.
    if (
      row.usage_role === "inline" &&
      row.document_position != null &&
      referencedIds.has(row.id)
    ) {
      return [];
    }
    return [
      {
        mediaAssetId: row.id,
        bucket: "public_derivative" as const,
        objectKey: row.derivative_key,
      },
    ];
  });
}

export function buildEnqueueMediaDerivativeRevokeJobQuery(
  executor: QueryExecutor,
  input: {
    mediaAssetId: string;
    bucket: MediaLifecycleBucket;
    objectKey: string;
    reason: "archive" | "orphan" | "erasure";
    journalEntryId?: string;
  },
) {
  const payload = {
    kind: MEDIA_DERIVATIVE_REVOKE_KIND,
    mediaAssetId: input.mediaAssetId,
    bucket: input.bucket,
    objectKey: input.objectKey,
    reason: input.reason,
    ...(input.journalEntryId
      ? { journalEntryId: input.journalEntryId }
      : {}),
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MEDIA_LIFECYCLE_QUEUE,
      payload,
      idempotency_key: `media_derivative_revoke:${input.bucket}:${input.objectKey}`,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          payload,
          status: "pending",
          attempts: 0,
          locked_at: null,
          locked_by: null,
          last_error: null,
          terminal_error_code: null,
          terminalized_at: null,
          available_at: sql`now()`,
          updated_at: sql`now()`,
        }),
    )
    .returning("id");
}

export async function enqueueArchiveDerivativeRevokes(
  executor: QueryExecutor,
  input: { journalEntryId: string; ownerUserId: string },
): Promise<number> {
  const candidates = await listArchiveDerivativeRevokeCandidates(executor, input);
  return enqueueMediaDerivativeRevokes(executor, {
    candidates,
    reason: "archive",
    journalEntryId: input.journalEntryId,
  });
}

export async function enqueueOrphanDerivativeRevokes(
  executor: QueryExecutor,
  input: { journalEntryId: string; ownerUserId: string },
): Promise<number> {
  const candidates = await listOrphanProcessedDerivativesForEntry(
    executor,
    input,
  );
  return enqueueMediaDerivativeRevokes(executor, {
    candidates,
    reason: "orphan",
    journalEntryId: input.journalEntryId,
  });
}

export async function enqueueMediaDerivativeRevokes(
  executor: QueryExecutor,
  input: {
    candidates: readonly MediaRevokeCandidate[];
    reason: "archive" | "orphan" | "erasure";
    journalEntryId?: string;
  },
): Promise<number> {
  for (const candidate of input.candidates) {
    await buildEnqueueMediaDerivativeRevokeJobQuery(executor, {
      ...candidate,
      reason: input.reason,
      journalEntryId: input.journalEntryId,
    }).execute();
  }
  return input.candidates.length;
}

/**
 * Cover-only assets about to be abandoned (unlinked from the entry) must be
 * revoked before `journal_entry_id` is cleared, or they become invisible to
 * orphan selection.
 */
export async function listAbandonedCoverOnlyRevokeCandidates(
  executor: QueryExecutor,
  input: {
    journalEntryId: string;
    ownerUserId: string;
    keepMediaAssetId?: string;
  },
): Promise<MediaRevokeCandidate[]> {
  let query = executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key"])
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("owner_user_id", "=", input.ownerUserId)
    .where("usage_role", "=", "cover_only")
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .where("revoked_at", "is", null);

  if (input.keepMediaAssetId) {
    query = query.where("id", "!=", input.keepMediaAssetId);
  }

  const rows = await query.execute();
  return rows.flatMap((row) => {
    if (!row.derivative_key) return [];
    return [
      {
        mediaAssetId: row.id,
        bucket: "public_derivative" as const,
        objectKey: row.derivative_key,
      },
    ];
  });
}

export async function listDetachedInlineRevokeCandidates(
  executor: QueryExecutor,
  input: {
    journalEntryId: string;
    ownerUserId: string;
    keepMediaAssetIds: ReadonlySet<string>;
  },
): Promise<MediaRevokeCandidate[]> {
  const rows = await executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key", "usage_role", "quarantine_key"])
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("owner_user_id", "=", input.ownerUserId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .where("revoked_at", "is", null)
    .execute();

  return rows.flatMap((row) => {
    if (!row.derivative_key) return [];
    if (row.quarantine_key.startsWith("visual-fixtures/")) return [];
    if (row.usage_role === "cover_only") return [];
    if (input.keepMediaAssetIds.has(row.id)) return [];
    return [
      {
        mediaAssetId: row.id,
        bucket: "public_derivative" as const,
        objectKey: row.derivative_key,
      },
    ];
  });
}
