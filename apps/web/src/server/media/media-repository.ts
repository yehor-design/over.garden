import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, MediaAsset } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";
import { recordPublicProjectionIntent } from "@/server/search/public-projection-outbox";
import type { ClaimedEphemeralPublicationMedia } from "@/server/media/ephemeral-publication-handoff";
import { mediaVariantColumnsAvailable } from "@/server/media/media-variant-schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The OVE-371 columns, written only once migration 0047 is live (see
 * `mediaVariantColumnsAvailable`). `variant_long_edges` records which
 * variants were promoted so revoke and delivery can derive their keys.
 */
function claimedMediaVariantColumns(
  media: ClaimedEphemeralPublicationMedia,
  variantColumns: boolean,
) {
  if (!variantColumns) return {};
  return {
    placeholder_data_uri: media.placeholderDataUri ?? null,
    variant_long_edges: (media.variants ?? []).map((item) => item.variant),
  };
}

export function buildInsertClaimedEphemeralMediaQuery(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    journalEntryId: string;
    media: ClaimedEphemeralPublicationMedia;
    documentPosition: number | null;
    usageRole: "inline" | "cover_only";
    variantColumns?: boolean;
  },
) {
  return executor
    .insertInto("media_assets")
    .values({
      id: input.media.mediaAssetId,
      owner_user_id: input.ownerUserId,
      journal_entry_id: input.journalEntryId,
      upload_generation: input.media.generation,
      declared_size_bytes: String(input.media.sizeBytes),
      derivative_key: input.media.publicPath,
      intrinsic_width: input.media.width,
      intrinsic_height: input.media.height,
      focal_x: 0.5,
      focal_y: 0.5,
      usage_role: input.usageRole,
      document_position: input.documentPosition,
      updated_at: new Date(),
      ...claimedMediaVariantColumns(input.media, input.variantColumns ?? false),
    })
    .returningAll();
}

export function buildInsertClaimedEphemeralEditMediaQuery(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    journalEntryId: string;
    media: ClaimedEphemeralPublicationMedia;
    variantColumns?: boolean;
  },
) {
  return executor
    .insertInto("media_assets")
    .values({
      id: input.media.mediaAssetId,
      owner_user_id: input.ownerUserId,
      journal_entry_id: input.journalEntryId,
      upload_generation: input.media.generation,
      declared_size_bytes: String(input.media.sizeBytes),
      derivative_key: input.media.publicPath,
      intrinsic_width: input.media.width,
      intrinsic_height: input.media.height,
      focal_x: 0.5,
      focal_y: 0.5,
      usage_role: "inline",
      document_position: null,
      updated_at: new Date(),
      ...claimedMediaVariantColumns(input.media, input.variantColumns ?? false),
    })
    .returningAll();
}

export function buildReplaceClaimedEphemeralMediaQuery(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    journalEntryId: string;
    priorGeneration: number;
    priorPublicPath: string;
    media: ClaimedEphemeralPublicationMedia;
    variantColumns?: boolean;
  },
) {
  return executor
    .updateTable("media_assets")
    .set({
      upload_generation: input.media.generation,
      declared_size_bytes: String(input.media.sizeBytes),
      derivative_key: input.media.publicPath,
      intrinsic_width: input.media.width,
      intrinsic_height: input.media.height,
      revoked_at: null,
      public_unreachable_at: null,
      updated_at: new Date(),
      ...claimedMediaVariantColumns(input.media, input.variantColumns ?? false),
    })
    .where("id", "=", input.media.mediaAssetId)
    .where("owner_user_id", "=", input.ownerUserId)
    .where("journal_entry_id", "=", input.journalEntryId)
    .where("upload_generation", "=", input.priorGeneration)
    .where("derivative_key", "=", input.priorPublicPath)
    .where("revoked_at", "is", null)
    .returningAll();
}

export async function insertClaimedEphemeralMediaForEntry(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    journalEntryId: string;
    media: readonly ClaimedEphemeralPublicationMedia[];
    orderedInlineMediaAssetIds: readonly string[];
    coverMediaAssetId: string | null;
  },
): Promise<void> {
  const expectedIds = new Set(input.orderedInlineMediaAssetIds);
  if (input.coverMediaAssetId) expectedIds.add(input.coverMediaAssetId);
  if (
    expectedIds.size !== input.media.length ||
    input.media.some((item) => !expectedIds.has(item.mediaAssetId))
  ) {
    throw new Error("claimed_media_set_mismatch");
  }
  const positionById = new Map(
    input.orderedInlineMediaAssetIds.map((id, index) => [id, index + 1]),
  );
  const variantColumns = await mediaVariantColumnsAvailable(executor);
  for (const media of input.media) {
    const documentPosition = positionById.get(media.mediaAssetId) ?? null;
    const inserted = await buildInsertClaimedEphemeralMediaQuery(executor, {
      ownerUserId: input.ownerUserId,
      journalEntryId: input.journalEntryId,
      media,
      documentPosition,
      usageRole: documentPosition === null ? "cover_only" : "inline",
      variantColumns,
    }).executeTakeFirst();
    if (!inserted) throw new Error("claimed_media_insert_failed");
  }
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

export async function findMediaAssetForOwner(
  scope: RequestScope,
  id: string,
): Promise<MediaAsset | undefined> {
  return db
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();
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
  if (
    !asset.derivative_key ||
    asset.revoked_at !== null
  ) {
    throw new Error("Only final reachable media can receive a focal point.");
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
      .where("derivative_key", "is not", null)
      .where("revoked_at", "is", null)
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
      throw new Error(
        "expectedRevision is required for journal-attached media.",
      );
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
      .returning(["id", "journal_revision", "public_slug", "visibility"])
      .executeTakeFirst();

    if (!bumped) {
      const conflict = new Error("Journal revision conflict.");
      (conflict as Error & { statusCode?: number }).statusCode = 409;
      throw conflict;
    }

    // OVE-242: a focal change rewrites how the public cover is presented, so
    // the projection intent commits with the revision bump instead of being
    // scheduled afterwards by the route.
    if (bumped.visibility === "public" && bumped.public_slug) {
      await recordPublicProjectionIntent(trx, {
        entityId: bumped.id,
        ownerUserId: scope.userId,
        desiredState: "present",
        reason: "media_presentation",
      });
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
