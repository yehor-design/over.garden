import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  JOURNAL_MEDIA_USAGE_COVER_ONLY,
  JOURNAL_MEDIA_USAGE_INLINE,
  resolveEffectiveJournalCover,
  type JournalCoverCandidate,
  type ResolvedJournalCover,
} from "@/lib/garden/journal-cover-contract";
import {
  normalizeJournalDocumentOrThrow,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getPublicDerivativeUrl } from "@/lib/storage";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Shared SQL projection: one effective cover media row per journal entry.
 * Prefer explicit cover_media_asset_id when still a valid claimed processed
 * asset; otherwise first processed inline by document_position (synced to
 * JournalDocumentV1 image order on claim). Never orders by created_at.
 */
export function buildFirstProcessedMediaPerEntryQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("media_assets")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.id", "=", "media_assets.journal_entry_id")
        .onRef(
          "media_assets.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .distinctOn([
      "media_assets.journal_entry_id",
      "media_assets.owner_user_id",
    ])
    .select([
      "media_assets.id as mediaId",
      "media_assets.journal_entry_id as journalEntryId",
      "media_assets.owner_user_id as ownerUserId",
      "media_assets.derivative_key as derivativeKey",
      "media_assets.alt_text as altText",
      "media_assets.focal_x as focalX",
      "media_assets.focal_y as focalY",
      "media_assets.intrinsic_width as intrinsicWidth",
      "media_assets.intrinsic_height as intrinsicHeight",
    ])
    .where("media_assets.journal_entry_id", "is not", null)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .where("media_assets.revoked_at", "is", null)
    .where((eb) =>
      eb.or([
        eb(
          "media_assets.id",
          "=",
          eb.ref("journal_entries.cover_media_asset_id"),
        ),
        eb("media_assets.usage_role", "=", JOURNAL_MEDIA_USAGE_INLINE),
      ]),
    )
    .orderBy("media_assets.journal_entry_id", "asc")
    .orderBy("media_assets.owner_user_id", "asc")
    .orderBy(
      sql`case
        when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
          then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("media_assets.document_position", "asc")
    .orderBy("media_assets.id", "asc")
    .$narrowType<{ journalEntryId: string; derivativeKey: string }>()
    .as("first_public_media");
}

export const buildEffectiveJournalCoverMediaPerEntryQuery =
  buildFirstProcessedMediaPerEntryQuery;

export function mapEffectiveCoverRowToPublicUrl(
  derivativeKey: string | null | undefined,
): string | null {
  if (!derivativeKey) return null;
  return getPublicDerivativeUrl(derivativeKey);
}

export function resolveEffectiveJournalCoverFromRows(input: {
  document: JournalDocumentV1 | null | undefined;
  explicitCoverMediaAssetId: string | null | undefined;
  mediaRows: ReadonlyArray<{
    id: string;
    usageRole?: string | null;
    status: string;
    derivativeKey: string | null;
    originalDeletedAt?: Date | string | null;
    altText?: string | null;
    focalX?: number | null;
    focalY?: number | null;
    intrinsicWidth?: number | null;
    intrinsicHeight?: number | null;
  }>;
}): ResolvedJournalCover {
  const candidatesById = new Map<string, JournalCoverCandidate>();
  for (const row of input.mediaRows) {
    const usageRole =
      row.usageRole === JOURNAL_MEDIA_USAGE_COVER_ONLY
        ? JOURNAL_MEDIA_USAGE_COVER_ONLY
        : JOURNAL_MEDIA_USAGE_INLINE;
    candidatesById.set(row.id, {
      mediaAssetId: row.id,
      usageRole,
      status: row.status,
      derivativeKey: row.derivativeKey,
      originalDeletedAt: row.originalDeletedAt ?? null,
      altText: row.altText ?? null,
      focalX: row.focalX ?? 0.5,
      focalY: row.focalY ?? 0.5,
      intrinsicWidth: row.intrinsicWidth ?? null,
      intrinsicHeight: row.intrinsicHeight ?? null,
    });
  }
  return resolveEffectiveJournalCover({
    document: input.document,
    explicitCoverMediaAssetId: input.explicitCoverMediaAssetId,
    candidatesById,
  });
}

export function tryReadJournalDocument(
  contentDocument: unknown,
): JournalDocumentV1 | null {
  if (contentDocument == null) return null;
  try {
    return normalizeJournalDocumentOrThrow(contentDocument);
  } catch {
    return null;
  }
}
