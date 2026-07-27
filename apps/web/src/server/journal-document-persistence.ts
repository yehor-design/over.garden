import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import type { Database, JournalEntry } from "@/db/schema";
import {
  MAX_JOURNAL_INLINE_IMAGES,
  MAX_JOURNAL_PLAIN_TEXT_CHARS,
  assertMeaningfulJournalDocument,
  extractJournalDocumentPlainText,
  journalDocumentImageCount,
  legacyBodyToJournalDocumentV1,
  listJournalDocumentImageMediaIds,
  normalizeJournalDocumentOrThrow,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { assertNoPreciseLocationInJournalDocument } from "@/lib/privacy/precise-location-journal-document";
import { assertNoPreciseLocationText } from "@/lib/privacy/precise-location-text";
import {
  enqueueMediaDerivativeRevokes,
  listAbandonedCoverOnlyRevokeCandidates,
  listDetachedInlineRevokeCandidates,
} from "@/server/media/media-lifecycle-enqueue";
import { attachProcessedMediaAssetToEntry } from "@/server/media/media-repository";
import type { RequestScope } from "@/server/request-scope";
import { isStructuredJournalAuthoringEnabled } from "@/server/structured-journal-authoring";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export class JournalAggregateConflictError extends Error {
  readonly code = "journal_aggregate_conflict" as const;
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super("Journal entry was updated elsewhere. Reload and retry.");
    this.name = "JournalAggregateConflictError";
    this.currentRevision = currentRevision;
  }
}

export interface ResolvedJournalContentWrite {
  document: JournalDocumentV1;
  body: string;
  contentSchemaVersion: number;
  mediaAssetIds: string[];
}

export function resolveJournalContentForWrite(input: {
  contentDocument?: unknown;
  body?: string | null;
  imageCaptionByMediaId?: ReadonlyMap<string, string | null>;
  requireStructured?: boolean;
}): ResolvedJournalContentWrite {
  const requireStructured =
    input.requireStructured ?? isStructuredJournalAuthoringEnabled();

  let document: JournalDocumentV1;
  if (input.contentDocument !== undefined && input.contentDocument !== null) {
    document = normalizeJournalDocumentOrThrow(input.contentDocument);
  } else if (requireStructured) {
    throw new Error("Structured journal document is required.");
  } else {
    const body = (input.body ?? "").toString();
    document = legacyBodyToJournalDocumentV1(body);
  }

  assertMeaningfulJournalDocument(document);
  // OVE-234: every textual block is checked before the document or its
  // derived plain-text body can reach Postgres, the outbox, or a projection.
  assertNoPreciseLocationInJournalDocument(document);
  if (journalDocumentImageCount(document) > MAX_JOURNAL_INLINE_IMAGES) {
    throw new Error(
      `Journal entry may include at most ${MAX_JOURNAL_INLINE_IMAGES} inline photos.`,
    );
  }

  const body = extractJournalDocumentPlainText(document, {
    imageCaptionByMediaId: input.imageCaptionByMediaId,
  });
  // Captions are merged in from media rows, so the derived body is rechecked
  // rather than trusted from the document traversal above.
  assertNoPreciseLocationText(body, "journal_body");
  if (!body.trim()) {
    // Image-only drafts are allowed when captions are unknown at resolve time;
    // repository claim path re-checks with captions.
    if (journalDocumentImageCount(document) === 0) {
      throw new Error("Entry body is required.");
    }
  }
  if (body.length > MAX_JOURNAL_PLAIN_TEXT_CHARS) {
    throw new Error(
      `Entry body must be at most ${MAX_JOURNAL_PLAIN_TEXT_CHARS} characters.`,
    );
  }

  return {
    document,
    body: body.trim() ? body : " ",
    contentSchemaVersion: document.schemaVersion,
    mediaAssetIds: listJournalDocumentImageMediaIds(document),
  };
}

export function readJournalDocumentFromEntry(
  entry: Pick<
    JournalEntry,
    "body" | "content_document" | "content_schema_version"
  >,
):
  | { status: "document"; document: JournalDocumentV1 }
  | { status: "legacy"; document: JournalDocumentV1 }
  | { status: "unavailable"; reason: "unsupported_version" | "invalid" } {
  if (entry.content_document != null) {
    try {
      const document = normalizeJournalDocumentOrThrow(entry.content_document);
      return { status: "document", document };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/Unsupported journal document schema version/i.test(message)) {
        return { status: "unavailable", reason: "unsupported_version" };
      }
      return { status: "unavailable", reason: "invalid" };
    }
  }

  return {
    status: "legacy",
    document: legacyBodyToJournalDocumentV1(entry.body),
  };
}

export function journalRevisionNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

export async function claimOrderedInlineMediaForEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    journalEntryId: string;
    orderedMediaAssetIds: readonly string[];
  },
): Promise<boolean> {
  const ordered = [...input.orderedMediaAssetIds];
  if (ordered.length > MAX_JOURNAL_INLINE_IMAGES) {
    throw new Error(
      `Journal entry may include at most ${MAX_JOURNAL_INLINE_IMAGES} inline photos.`,
    );
  }
  if (new Set(ordered).size !== ordered.length) {
    throw new Error("Duplicate media assets are not allowed.");
  }

  const keep = new Set(ordered);
  const detached = await listDetachedInlineRevokeCandidates(executor, {
    journalEntryId: input.journalEntryId,
    ownerUserId: scope.userId,
    keepMediaAssetIds: keep,
  });
  await enqueueMediaDerivativeRevokes(executor, {
    candidates: detached,
    reason: "orphan",
    journalEntryId: input.journalEntryId,
  });

  const existing = await executor
    .selectFrom("media_assets")
    .select(["id", "document_position", "quarantine_key", "usage_role"])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", input.journalEntryId)
    .execute();

  for (const row of existing) {
    if (row.quarantine_key.startsWith("visual-fixtures/")) continue;
    // Cover-only assets are owned by claimJournalEntryCover, not document order.
    if (row.usage_role === "cover_only") continue;
    if (!keep.has(row.id)) {
      await executor
        .updateTable("media_assets")
        .set({
          journal_entry_id: null,
          document_position: null,
          usage_role: "inline",
          updated_at: new Date(),
        })
        .where("id", "=", row.id)
        .where("owner_user_id", "=", scope.userId)
        .execute();
    }
  }

  let attached = false;
  for (let index = 0; index < ordered.length; index += 1) {
    const mediaAssetId = ordered[index]!;
    const mediaAsset = await attachProcessedMediaAssetToEntry(
      executor,
      scope,
      {
        mediaAssetId,
        journalEntryId: input.journalEntryId,
      },
    );
    if (!mediaAsset) {
      throw new Error("Processed media asset is unavailable for this entry.");
    }
    await executor
      .updateTable("media_assets")
      .set({
        document_position: index + 1,
        usage_role: "inline",
        updated_at: new Date(),
      })
      .where("id", "=", mediaAssetId)
      .where("owner_user_id", "=", scope.userId)
      .execute();
    attached = true;
  }

  return attached;
}

export type JournalCoverClaimInput =
  | { mode: "automatic" }
  | { mode: "none" }
  | { mode: "explicit_inline"; mediaAssetId: string }
  | { mode: "separate"; mediaAssetId: string }
  | { mode: "keep_as_cover"; mediaAssetId: string };

export async function claimJournalEntryCover(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    journalEntryId: string;
    cover: JournalCoverClaimInput;
    orderedInlineMediaAssetIds: readonly string[];
  },
): Promise<string | null> {
  const entryId = input.journalEntryId.trim();
  const orderedInline = new Set(
    input.orderedInlineMediaAssetIds
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  switch (input.cover.mode) {
    case "automatic":
    case "none": {
      await clearCoverOnlyAssetsForEntry(executor, scope, entryId);
      await executor
        .updateTable("journal_entries")
        .set({
          cover_media_asset_id: null,
          updated_at: new Date(),
        })
        .where("id", "=", entryId)
        .where("owner_user_id", "=", scope.userId)
        .execute();
      return null;
    }
    case "explicit_inline": {
      const mediaAssetId = input.cover.mediaAssetId.trim();
      if (!orderedInline.has(mediaAssetId)) {
        throw new Error(
          "Cover photo must be one of this entry's story photos.",
        );
      }
      await assertProcessedOwnedMediaForCover(executor, scope, {
        mediaAssetId,
        journalEntryId: entryId,
      });
      await clearCoverOnlyAssetsForEntry(executor, scope, entryId);
      await executor
        .updateTable("media_assets")
        .set({
          usage_role: "inline",
          updated_at: new Date(),
        })
        .where("id", "=", mediaAssetId)
        .where("owner_user_id", "=", scope.userId)
        .execute();
      await executor
        .updateTable("journal_entries")
        .set({
          cover_media_asset_id: mediaAssetId,
          updated_at: new Date(),
        })
        .where("id", "=", entryId)
        .where("owner_user_id", "=", scope.userId)
        .execute();
      return mediaAssetId;
    }
    case "separate":
    case "keep_as_cover": {
      const mediaAssetId = input.cover.mediaAssetId.trim();
      await assertProcessedOwnedMediaForCover(executor, scope, {
        mediaAssetId,
        journalEntryId: null,
      });
      await clearCoverOnlyAssetsForEntry(executor, scope, entryId, mediaAssetId);
      const claimed = await executor
        .updateTable("media_assets")
        .set({
          journal_entry_id: entryId,
          usage_role: "cover_only",
          document_position: null,
          updated_at: new Date(),
        })
        .where("id", "=", mediaAssetId)
        .where("owner_user_id", "=", scope.userId)
        .where("status", "=", "processed")
        .where("derivative_key", "is not", null)
        .where((eb) =>
          eb.or([
            eb("journal_entry_id", "is", null),
            eb("journal_entry_id", "=", entryId),
          ]),
        )
        .returning("id")
        .executeTakeFirst();
      if (!claimed) {
        throw new Error("Cover photo is not ready to attach yet.");
      }
      await executor
        .updateTable("journal_entries")
        .set({
          cover_media_asset_id: mediaAssetId,
          updated_at: new Date(),
        })
        .where("id", "=", entryId)
        .where("owner_user_id", "=", scope.userId)
        .execute();
      return mediaAssetId;
    }
    default: {
      const _exhaustive: never = input.cover;
      return _exhaustive;
    }
  }
}

async function clearCoverOnlyAssetsForEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
  keepMediaAssetId?: string,
): Promise<void> {
  const abandoned = await listAbandonedCoverOnlyRevokeCandidates(executor, {
    journalEntryId,
    ownerUserId: scope.userId,
    keepMediaAssetId,
  });
  await enqueueMediaDerivativeRevokes(executor, {
    candidates: abandoned,
    reason: "orphan",
    journalEntryId,
  });

  let query = executor
    .updateTable("media_assets")
    .set({
      journal_entry_id: null,
      usage_role: "inline",
      document_position: null,
      updated_at: new Date(),
    })
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", journalEntryId)
    .where("usage_role", "=", "cover_only");

  if (keepMediaAssetId) {
    query = query.where("id", "!=", keepMediaAssetId);
  }

  await query.execute();
}

async function assertProcessedOwnedMediaForCover(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    mediaAssetId: string;
    journalEntryId: string | null;
  },
): Promise<void> {
  let query = executor
    .selectFrom("media_assets")
    .select("id")
    .where("id", "=", input.mediaAssetId)
    .where("owner_user_id", "=", scope.userId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null);

  if (input.journalEntryId) {
    query = query.where("journal_entry_id", "=", input.journalEntryId);
  }

  const row = await query.executeTakeFirst();
  if (!row) {
    throw new Error("Cover photo is not ready to attach yet.");
  }
}

export async function writeJournalMutationReceipt(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    journalEntryId: string;
    clientMutationId: string;
    baseRevision: number;
    resultRevision: number;
    mutationKind: "create" | "edit";
  },
) {
  const row: Insertable<Database["journal_entry_mutation_receipts"]> = {
    owner_user_id: input.ownerUserId,
    journal_entry_id: input.journalEntryId,
    client_mutation_id: input.clientMutationId,
    base_revision: input.baseRevision,
    result_revision: input.resultRevision,
    mutation_kind: input.mutationKind,
  };

  await executor
    .insertInto("journal_entry_mutation_receipts")
    .values(row)
    .onConflict((oc) =>
      oc
        .columns(["owner_user_id", "journal_entry_id", "client_mutation_id"])
        .doNothing(),
    )
    .execute();
}

export async function findJournalMutationReceipt(
  executor: QueryExecutor,
  scope: RequestScope,
  input: { journalEntryId: string; clientMutationId: string },
) {
  return executor
    .selectFrom("journal_entry_mutation_receipts")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("client_mutation_id", "=", input.clientMutationId)
    .executeTakeFirst();
}

export interface UpdateJournalEntryAggregateInput {
  entryId: string;
  clientMutationId: string;
  expectedRevision: number;
  title: string;
  entryDate?: string | null;
  contentDocument?: unknown;
  body?: string | null;
  mentionSelections?: unknown;
  topicTags?: unknown;
}

export async function loadOwnedActiveJournalEntryForEdit(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
): Promise<JournalEntry> {
  const entry = await executor
    .selectFrom("journal_entries")
    .selectAll()
    .where("id", "=", entryId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();

  if (!entry) {
    throw new Error("Journal entry was not found.");
  }
  if (entry.lifecycle_state !== "active" || entry.public_gone_at !== null) {
    throw new Error("Archived journal entries cannot be edited.");
  }
  return entry;
}
