import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, MediaAsset } from "@/db/schema";
import { MAX_JOURNAL_INLINE_IMAGES } from "@/lib/garden/journal-document";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export async function createQuarantinedMediaAsset(
  scope: RequestScope,
  quarantineKey: string,
): Promise<MediaAsset> {
  return db
    .insertInto("media_assets")
    .values({
      owner_user_id: scope.userId,
      quarantine_key: quarantineKey,
      journal_entry_id: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getMediaAssetForOwner(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset> {
  return db
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirstOrThrow();
}

export async function markMediaAssetProcessed(
  scope: RequestScope,
  id: string,
  derivativeKey: string,
  dimensions?: {
    intrinsicWidth: number;
    intrinsicHeight: number;
  },
): Promise<MediaAsset> {
  return db
    .updateTable("media_assets")
    .set({
      derivative_key: derivativeKey,
      status: "processed",
      intrinsic_width: dimensions?.intrinsicWidth ?? null,
      intrinsic_height: dimensions?.intrinsicHeight ?? null,
      focal_x: 0.5,
      focal_y: 0.5,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateMediaAssetFocalForOwner(
  scope: RequestScope,
  input: {
    mediaAssetId: string;
    focalX: number;
    focalY: number;
    expectedRevision?: number | null;
  },
): Promise<{
  asset: MediaAsset;
  journalEntryId: string | null;
  journalRevision: number | null;
  publicSlug: string | null;
  visibility: string | null;
}> {
  const asset = await getMediaAssetForOwner(scope, input.mediaAssetId);
  if (asset.status !== "processed" || !asset.derivative_key) {
    throw new Error("Only processed media can receive a focal point.");
  }

  const focalX = input.focalX;
  const focalY = input.focalY;
  if (
    !Number.isFinite(focalX) ||
    !Number.isFinite(focalY) ||
    focalX < 0 ||
    focalX > 1 ||
    focalY < 0 ||
    focalY > 1
  ) {
    throw new Error("Focal coordinates must be between 0 and 1.");
  }

  return db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("media_assets")
      .set({
        focal_x: focalX,
        focal_y: focalY,
        updated_at: new Date(),
      })
      .where("id", "=", asset.id)
      .where("owner_user_id", "=", scope.userId)
      .where("status", "=", "processed")
      .returningAll()
      .executeTakeFirstOrThrow();

    if (!updated.journal_entry_id) {
      return {
        asset: updated,
        journalEntryId: null,
        journalRevision: null,
        publicSlug: null,
        visibility: null,
      };
    }

    const expectedRevision = input.expectedRevision;
    if (
      expectedRevision == null ||
      !Number.isFinite(expectedRevision) ||
      expectedRevision < 1
    ) {
      throw new Error("expectedRevision is required for journal-attached media.");
    }

    const bumped = await trx
      .updateTable("journal_entries")
      .set({
        journal_revision: sql`journal_revision + 1`,
        updated_at: new Date(),
      })
      .where("id", "=", updated.journal_entry_id)
      .where("owner_user_id", "=", scope.userId)
      .where("journal_revision", "=", String(Math.trunc(expectedRevision)))
      .returning([
        "id",
        "journal_revision",
        "public_slug",
        "visibility",
      ])
      .executeTakeFirst();

    if (!bumped) {
      const conflict = new Error("Journal revision conflict.");
      (conflict as Error & { statusCode?: number }).statusCode = 409;
      throw conflict;
    }

    return {
      asset: updated,
      journalEntryId: bumped.id,
      journalRevision: Number(bumped.journal_revision),
      publicSlug: bumped.public_slug,
      visibility: bumped.visibility,
    };
  });
}

export async function markMediaAssetFailed(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset | undefined> {
  return db
    .updateTable("media_assets")
    .set({
      status: "failed",
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .where("status", "!=", "processed")
    .returningAll()
    .executeTakeFirst();
}

export async function markMediaAssetOriginalDeleted(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset> {
  return db
    .updateTable("media_assets")
    .set({
      original_deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function attachProcessedMediaAssetToEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    mediaAssetId: string;
    journalEntryId: string;
  },
): Promise<MediaAsset | undefined> {
  return buildAttachProcessedMediaAssetToEntryQuery(
    executor,
    scope,
    input,
  ).executeTakeFirst();
}

export function buildAttachProcessedMediaAssetToEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  {
    mediaAssetId,
    journalEntryId,
  }: {
    mediaAssetId: string;
    journalEntryId: string;
  },
) {
  return executor
    .updateTable("media_assets")
    .set({
      journal_entry_id: journalEntryId,
      updated_at: new Date(),
    })
    .where("id", "=", mediaAssetId)
    .where("owner_user_id", "=", scope.userId)
    .where("status", "=", "processed")
    .where((eb) =>
      eb.or([
        eb("journal_entry_id", "is", null),
        eb("journal_entry_id", "=", journalEntryId),
      ]),
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("journal_entries")
          .select(sql`1`.as("one"))
          .where("journal_entries.id", "=", journalEntryId)
          .where("journal_entries.owner_user_id", "=", scope.userId),
      ),
    )
    .where((eb) =>
      eb(
        eb
          .selectFrom("media_assets as existing_entry_media")
          .select((seb) => seb.fn.countAll<number>().as("attached_count"))
          .where("existing_entry_media.journal_entry_id", "=", journalEntryId)
          .where("existing_entry_media.id", "!=", mediaAssetId)
          .where(
            "existing_entry_media.quarantine_key",
            "not like",
            "visual-fixtures/%",
          ),
        "<",
        MAX_JOURNAL_INLINE_IMAGES,
      ),
    )
    .returningAll();
}
