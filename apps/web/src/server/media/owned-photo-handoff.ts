import "server-only";

import type { OwnedPhotoPayload } from "@/lib/garden/owned-photo";
import {
  claimEphemeralPublicationMedia,
  finalizeEphemeralPublicationMedia,
  type ClaimedEphemeralPublicationMedia,
} from "@/server/media/ephemeral-publication-handoff";

/**
 * The staging handoff for the one photo of a space or a plant or animal
 * (ADR-0036 D1), on the journal's own contract (ADR-0019, `OVE-372`): claim
 * the staged WebP and its variants under a publish id, commit the row, then
 * finalize. The publish id is the space's or the object's id — the Worker's
 * commit-status read finds the committed row by it
 * (`ephemeral-staging-commit-status.ts`).
 */
export interface ClaimedOwnedPhoto {
  media: ClaimedEphemeralPublicationMedia;
  stagingSessionId: string;
  receiptSetDigest: string;
}

export async function claimOwnedPhoto(input: {
  ownerUserId: string;
  publishId: string;
  photo: OwnedPhotoPayload;
}): Promise<ClaimedOwnedPhoto> {
  const handoff = await claimEphemeralPublicationMedia({
    ownerUserId: input.ownerUserId,
    publishId: input.publishId,
    stagingSessionId: input.photo.stagingSessionId,
    stagingReceipts: input.photo.receipts,
    orderedMediaAssetIds: [input.photo.mediaAssetId],
  });
  const media = handoff.publicMedia[0];
  if (!media || handoff.publicMedia.length !== 1) {
    throw new Error("owned_photo_claim_mismatch");
  }
  media.placeholderDataUri = input.photo.placeholder;
  return {
    media,
    stagingSessionId: handoff.stagingSessionId,
    receiptSetDigest: handoff.receiptSetDigest,
  };
}

/**
 * Finalize now, and say whether it worked. A failure is not the gardener's
 * problem: the row is committed with a durable finalize job beside it, and the
 * Worker's own alarm reads the commit back, so the photo is promoted either
 * way.
 */
export async function finalizeOwnedPhoto(input: {
  ownerUserId: string;
  publishId: string;
  stagingSessionId: string;
  receiptSetDigest: string;
}): Promise<boolean> {
  try {
    await finalizeEphemeralPublicationMedia(input);
    return true;
  } catch {
    return false;
  }
}
