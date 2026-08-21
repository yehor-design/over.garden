import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, MediaAsset } from "@/db/schema";
import { MAX_JOURNAL_INLINE_IMAGES } from "@/lib/garden/journal-document";
import type { RequestScope } from "@/server/request-scope";
import { recordPublicProjectionIntent } from "@/server/search/public-projection-outbox";
import { SAFE_MEDIA_PROCESSING_LEASE_SECONDS } from "@/server/media/media-processing-contract";
import { buildEnqueueMediaDerivativeRevokeJobQuery } from "@/server/media/media-lifecycle-enqueue";
import {
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  type LaunchMediaQualityResult,
} from "@/lib/media/launch-media-quality";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export async function createQuarantinedMediaAsset(
  scope: RequestScope,
  input: {
    internalDeterministicId?: string;
    quarantineKey: string;
    declaredMediaType: string;
    declaredSizeBytes: number;
    uploadGenerationId: string;
    publicObjectId: string;
  },
): Promise<MediaAsset> {
  return db
    .insertInto("media_assets")
    .values({
      ...(input.internalDeterministicId
        ? { id: input.internalDeterministicId }
        : {}),
      owner_user_id: scope.userId,
      quarantine_key: input.quarantineKey,
      journal_entry_id: null,
      upload_generation_id: input.uploadGenerationId,
      public_object_id: input.publicObjectId,
      upload_generation: 1,
      declared_media_type: input.declaredMediaType,
      declared_size_bytes: String(input.declaredSizeBytes),
      media_readiness_state: "quarantined",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findMediaAssetByUploadGeneration(
  scope: RequestScope,
  uploadGenerationId: string,
): Promise<MediaAsset | undefined> {
  return db
    .selectFrom("media_assets")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("upload_generation_id", "=", uploadGenerationId)
    .executeTakeFirst();
}

export interface MediaProcessingClaim {
  asset: MediaAsset;
  claimToken: string;
  phase: "process_original" | "prove_original_absence";
}

export async function claimMediaAssetForProcessing(
  scope: RequestScope,
  id: string,
): Promise<MediaProcessingClaim | null> {
  const claimToken = randomUUID();
  const recovered = await db
    .updateTable("media_assets")
    .set({
      processing_claim_token: claimToken,
      processing_claimed_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", id)
    .where("owner_user_id", "=", scope.userId)
    .where("media_readiness_state", "=", "derivative_written")
    .where((eb) =>
      eb.or([
        eb("processing_claim_token", "is", null),
        eb(
          "processing_claimed_at",
          "<",
          sql<Date>`now() - (${SAFE_MEDIA_PROCESSING_LEASE_SECONDS} || ' seconds')::interval`,
        ),
      ]),
    )
    .returningAll()
    .executeTakeFirst();
  if (recovered) {
    return {
      asset: recovered,
      claimToken,
      phase: "prove_original_absence",
    };
  }

  // Rotate the provider identity on every fresh or reclaimed decode claim.
  // A superseded worker can still finish an in-flight PutObject, but it can
  // only write its old, unreachable key and can never overwrite the winner.
  const publicObjectId = randomUUID();
  const claimed = await db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable("media_assets")
      .set({
        media_readiness_state: "processing",
        processing_claim_token: claimToken,
        processing_claimed_at: sql<Date>`now()`,
        public_object_id: publicObjectId,
        derivative_key: null,
        admitted_media_type: null,
        quality_policy_version: null,
        quality_class: null,
        quality_reason_codes: null,
        quality_metrics: null,
        quality_evaluated_at: null,
        intrinsic_width: null,
        intrinsic_height: null,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", id)
      .where("owner_user_id", "=", scope.userId)
      .where((eb) =>
        eb.or([
          eb("media_readiness_state", "in", ["quarantined", "retryable"]),
          eb.and([
            eb("media_readiness_state", "=", "processing"),
            eb(
              "processing_claimed_at",
              "<",
              sql<Date>`now() - (${SAFE_MEDIA_PROCESSING_LEASE_SECONDS} || ' seconds')::interval`,
            ),
          ]),
        ]),
      )
      .returningAll()
      .executeTakeFirst();
    if (!row) return undefined;

    // Record cleanup before any provider write. The delay is longer than the
    // processing lease, so a successful claimant can cancel it at settlement;
    // a crashed or superseded claimant leaves a marker-less cleanup job that
    // cannot revoke the current media row.
    const derivativeKey = `derivatives/${publicObjectId}.webp`;
    await buildEnqueueMediaDerivativeRevokeJobQuery(trx, {
      bucket: "public_derivative",
      objectKey: derivativeKey,
      reason: "superseded_processing",
      availableAt: new Date(
        Date.now() + (SAFE_MEDIA_PROCESSING_LEASE_SECONDS + 30) * 1_000,
      ),
    }).execute();
    return row;
  });
  return claimed
    ? { asset: claimed, claimToken, phase: "process_original" }
    : null;
}

export async function markClaimedMediaDerivativeWritten(
  scope: RequestScope,
  claim: MediaProcessingClaim,
  input: {
    derivativeKey: string;
    admittedMediaType: string;
    intrinsicWidth: number;
    intrinsicHeight: number;
    quality: LaunchMediaQualityResult;
  },
): Promise<MediaAsset | undefined> {
  return db
    .updateTable("media_assets")
    .set({
      derivative_key: input.derivativeKey,
      admitted_media_type: input.admittedMediaType,
      intrinsic_width: input.intrinsicWidth,
      intrinsic_height: input.intrinsicHeight,
      focal_x: 0.5,
      focal_y: 0.5,
      quality_policy_version: input.quality.policyVersion,
      quality_class: input.quality.qualityClass,
      quality_reason_codes: [...input.quality.reasonCodes],
      quality_metrics: { ...input.quality.metrics },
      quality_evaluated_at: sql<Date>`now()`,
      media_readiness_state: "derivative_written",
      updated_at: new Date(),
    })
    .where("id", "=", claim.asset.id)
    .where("owner_user_id", "=", scope.userId)
    .where("upload_generation_id", "=", claim.asset.upload_generation_id)
    .where("public_object_id", "=", claim.asset.public_object_id)
    .where("processing_claim_token", "=", claim.claimToken)
    .where("media_readiness_state", "=", "processing")
    .returningAll()
    .executeTakeFirst();
}

export async function recordClaimedMediaQuality(
  scope: RequestScope,
  claim: MediaProcessingClaim,
  quality: LaunchMediaQualityResult,
): Promise<MediaAsset | undefined> {
  return db
    .updateTable("media_assets")
    .set({
      quality_policy_version: quality.policyVersion,
      quality_class: quality.qualityClass,
      quality_reason_codes: [...quality.reasonCodes],
      quality_metrics: { ...quality.metrics },
      quality_evaluated_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", claim.asset.id)
    .where("owner_user_id", "=", scope.userId)
    .where("upload_generation_id", "=", claim.asset.upload_generation_id)
    .where("public_object_id", "=", claim.asset.public_object_id)
    .where("processing_claim_token", "=", claim.claimToken)
    .where("media_readiness_state", "=", "processing")
    .returningAll()
    .executeTakeFirst();
}

export async function settleClaimedMediaPublicReady(
  scope: RequestScope,
  claim: MediaProcessingClaim,
): Promise<MediaAsset | undefined> {
  return db.transaction().execute(async (trx) => {
    const settled = await trx
      .updateTable("media_assets")
      .set({
        status: "processed",
        original_deleted_at: new Date(),
        media_readiness_state: "public_ready",
        processing_claim_token: null,
        processing_claimed_at: null,
        updated_at: new Date(),
      })
      .where("id", "=", claim.asset.id)
      .where("owner_user_id", "=", scope.userId)
      .where("upload_generation_id", "=", claim.asset.upload_generation_id)
      .where("public_object_id", "=", claim.asset.public_object_id)
      .where("processing_claim_token", "=", claim.claimToken)
      .where("media_readiness_state", "=", "derivative_written")
      .where("derivative_key", "is not", null)
      .where("quality_policy_version", "=", LAUNCH_MEDIA_QUALITY_POLICY_VERSION)
      .where("quality_class", "=", "accepted")
      .returningAll()
      .executeTakeFirst();
    if (!settled?.derivative_key) return settled;

    await trx
      .deleteFrom("job_queue")
      .where(
        "idempotency_key",
        "=",
        `media_derivative_revoke:public_derivative:${settled.derivative_key}`,
      )
      .where("status", "in", ["pending", "failed"])
      .execute();
    return settled;
  });
}

export async function releaseMediaProcessingClaim(
  scope: RequestScope,
  claim: MediaProcessingClaim,
  terminal = false,
): Promise<void> {
  await db
    .updateTable("media_assets")
    .set({
      status: terminal ? "failed" : "quarantined",
      media_readiness_state: terminal
        ? "rejected"
        : sql<string>`case
          when media_readiness_state = 'derivative_written'
            then 'derivative_written'
          else 'retryable'
        end`,
      processing_claim_token: null,
      processing_claimed_at: null,
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", claim.asset.id)
    .where("owner_user_id", "=", scope.userId)
    .where("upload_generation_id", "=", claim.asset.upload_generation_id)
    .where("public_object_id", "=", claim.asset.public_object_id)
    .where("processing_claim_token", "=", claim.claimToken)
    .where("media_readiness_state", "in", ["processing", "derivative_written"])
    .execute();
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
    asset.status !== "processed" ||
    asset.media_readiness_state !== "public_ready" ||
    !asset.derivative_key ||
    !asset.original_deleted_at
  ) {
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
