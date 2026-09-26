import "server-only";

import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import {
  buildPublicMediaSourceSet,
  expandDerivativeObjectKeys,
  normalizeVariantLongEdges,
} from "@/lib/media/derivative-keys";
import { getPublicDerivativeUrl } from "@/lib/storage";
import type { ClaimedOwnedPhoto } from "@/server/media/owned-photo-handoff";
import {
  buildEnqueueMediaStagingFinalizeJobQuery,
  enqueueMediaDerivativeRevokes,
} from "@/server/media/media-lifecycle-enqueue";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The one photo of a space or of a plant or animal (ADR-0036 D1, migration
 * `0082`): a `media_assets` row whose single owner is the space or the
 * object, never an entry. Replacing it takes the old one back — its stored
 * files are queued for revocation and its row goes — and removing it does the
 * same. The row is written in the owner's own transaction, with a durable
 * finalize job beside it, so a finalize that fails after the commit is retried
 * rather than lost.
 */
export type PhotoOwner = { kind: "space"; id: string } | { kind: "object"; id: string };

export interface OwnedPhotoRecord {
  mediaAssetId: string;
  generation: number;
  derivativeKey: string;
  variantLongEdges: number[];
  width: number | null;
  height: number | null;
  placeholderDataUri: string | null;
}

function ownerColumn(owner: PhotoOwner) {
  return owner.kind === "space" ? ("space_id" as const) : ("plant_object_id" as const);
}

/**
 * Queue the stored files of the owner's photo for revocation and delete its
 * row — every photo but `keepMediaAssetId`. The revoke jobs carry the object
 * keys themselves, so they need no row to find them.
 */
export async function takeBackOwnedPhotos(
  executor: QueryExecutor,
  input: { ownerUserId: string; owner: PhotoOwner; keepMediaAssetId?: string },
): Promise<number> {
  let query = executor
    .selectFrom("media_assets")
    .select(["id", "derivative_key", "variant_long_edges"])
    .where(ownerColumn(input.owner), "=", input.owner.id)
    .where("owner_user_id", "=", input.ownerUserId);
  if (input.keepMediaAssetId) query = query.where("id", "!=", input.keepMediaAssetId);
  const rows = await query.execute();
  if (rows.length === 0) return 0;
  await enqueueMediaDerivativeRevokes(executor, {
    candidates: rows.flatMap((row) =>
      expandDerivativeObjectKeys(row.derivative_key, row.variant_long_edges).map(
        (objectKey) => ({
          mediaAssetId: row.id,
          bucket: "public_derivative" as const,
          objectKey,
        }),
      ),
    ),
    reason: "photo_removed",
  });
  await executor
    .deleteFrom("media_assets")
    .where(
      "id",
      "in",
      rows.map((row) => row.id),
    )
    .execute();
  return rows.length;
}

/**
 * Make `photo` the owner's photo. A second call with the same claimed photo —
 * a retry after a lost response — finds the row and changes nothing.
 */
export async function writeOwnedPhoto(
  executor: QueryExecutor,
  input: { ownerUserId: string; owner: PhotoOwner; photo: ClaimedOwnedPhoto },
): Promise<"written" | "replayed"> {
  const media = input.photo.media;
  const existing = await executor
    .selectFrom("media_assets")
    .select(["id", "space_id", "plant_object_id", "upload_generation", "owner_user_id"])
    .where("id", "=", media.mediaAssetId)
    .executeTakeFirst();
  if (existing) {
    const ownerId =
      input.owner.kind === "space" ? existing.space_id : existing.plant_object_id;
    if (
      ownerId === input.owner.id &&
      existing.owner_user_id === input.ownerUserId &&
      Number(existing.upload_generation) === media.generation
    ) {
      return "replayed";
    }
    throw new Error("owned_photo_identity_conflict");
  }
  await takeBackOwnedPhotos(executor, {
    ownerUserId: input.ownerUserId,
    owner: input.owner,
    keepMediaAssetId: media.mediaAssetId,
  });
  await executor
    .insertInto("media_assets")
    .values({
      id: media.mediaAssetId,
      owner_user_id: input.ownerUserId,
      journal_entry_id: null,
      space_id: input.owner.kind === "space" ? input.owner.id : null,
      plant_object_id: input.owner.kind === "object" ? input.owner.id : null,
      upload_generation: media.generation,
      declared_size_bytes: String(media.sizeBytes),
      derivative_key: media.publicPath,
      intrinsic_width: media.width,
      intrinsic_height: media.height,
      focal_x: 0.5,
      focal_y: 0.5,
      // The photo is the owner's cover and appears in no document.
      usage_role: "cover_only",
      document_position: null,
      placeholder_data_uri: media.placeholderDataUri ?? null,
      variant_long_edges: (media.variants ?? []).map((variant) => variant.variant),
      updated_at: new Date(),
    })
    .execute();
  await buildEnqueueMediaStagingFinalizeJobQuery(executor, {
    publishId: input.owner.id,
    stagingSessionId: input.photo.stagingSessionId,
    receiptSetDigest: input.photo.receiptSetDigest,
  }).execute();
  return "written";
}

/** The live photo of each owner, by the owner's id. */
export async function readOwnedPhotos(
  executor: QueryExecutor,
  input: { ownerUserId: string; kind: PhotoOwner["kind"]; ids: readonly string[] },
): Promise<Map<string, OwnedPhotoRecord>> {
  if (input.ids.length === 0) return new Map();
  const column = input.kind === "space" ? ("space_id" as const) : ("plant_object_id" as const);
  const rows = await executor
    .selectFrom("media_assets")
    .select([
      "id",
      column,
      "upload_generation",
      "derivative_key",
      "variant_long_edges",
      "intrinsic_width",
      "intrinsic_height",
      "placeholder_data_uri",
    ])
    .where(column, "in", [...input.ids])
    .where("owner_user_id", "=", input.ownerUserId)
    .where("revoked_at", "is", null)
    .execute();
  const photos = new Map<string, OwnedPhotoRecord>();
  for (const row of rows) {
    const ownerId = (row as Record<string, unknown>)[column];
    if (typeof ownerId !== "string") continue;
    photos.set(ownerId, {
      mediaAssetId: row.id,
      generation: Number(row.upload_generation ?? 1),
      derivativeKey: row.derivative_key,
      variantLongEdges: normalizeVariantLongEdges(row.variant_long_edges),
      width: row.intrinsic_width,
      height: row.intrinsic_height,
      placeholderDataUri: row.placeholder_data_uri,
    });
  }
  return photos;
}

/** A stored photo as a page draws it. */
export function ownedPhotoView(record: OwnedPhotoRecord): OwnedPhotoView {
  const sourceSet = buildPublicMediaSourceSet({
    publicUrl: getPublicDerivativeUrl(record.derivativeKey),
    intrinsicWidth: record.width,
    intrinsicHeight: record.height,
    variantLongEdges: record.variantLongEdges,
  });
  return {
    src: sourceSet.src,
    srcSet: sourceSet.srcSet,
    width: record.width,
    height: record.height,
    placeholderDataUri: record.placeholderDataUri,
  };
}
