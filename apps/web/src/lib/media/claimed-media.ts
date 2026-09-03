import {
  ephemeralMediaPublicKey,
  type EphemeralMediaStagingReceiptClaims,
  type EphemeralMediaVariant,
} from "./ephemeral-staging-contract";

/** A smaller rendition promoted next to the primary (ADR-0022, D2). */
export interface ClaimedEphemeralPublicationVariant {
  variant: Exclude<EphemeralMediaVariant, 0>;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  publicPath: string;
}

export interface ClaimedEphemeralPublicationMedia {
  mediaAssetId: string;
  generation: number;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  publicPath: string;
  /**
   * Largest first; empty when the source was too small for any variant.
   * Absent on records written before variants existed.
   */
  variants?: ClaimedEphemeralPublicationVariant[];
  /** The 16 px placeholder the browser encoded, attached by the route. */
  placeholderDataUri?: string | null;
}

/** One photo's receipts: the primary and the variants cut from it. */
export interface EphemeralPublicationPhoto {
  primary: EphemeralMediaStagingReceiptClaims;
  variants: EphemeralMediaStagingReceiptClaims[];
}

/**
 * Turns verified receipts into the per-photo shape the database and the
 * readiness check use. Pure, so routes can call it whether or not the
 * server-only handoff module is mocked.
 */
export function claimedMediaFromPhotos(
  photos: readonly EphemeralPublicationPhoto[],
): ClaimedEphemeralPublicationMedia[] {
  return photos.map((photo) => ({
    mediaAssetId: photo.primary.mediaAssetId,
    generation: photo.primary.generation,
    sha256: photo.primary.sha256,
    sizeBytes: photo.primary.sizeBytes,
    width: photo.primary.width,
    height: photo.primary.height,
    publicPath: ephemeralMediaPublicKey({
      mediaAssetId: photo.primary.mediaAssetId,
      generation: photo.primary.generation,
      variant: 0,
    }),
    variants: photo.variants.map((receipt) => ({
      variant: receipt.variant as Exclude<EphemeralMediaVariant, 0>,
      sha256: receipt.sha256,
      sizeBytes: receipt.sizeBytes,
      width: receipt.width,
      height: receipt.height,
      publicPath: ephemeralMediaPublicKey({
        mediaAssetId: receipt.mediaAssetId,
        generation: receipt.generation,
        variant: receipt.variant ?? 0,
      }),
    })),
  }));
}

/** Every public object a claimed set promoted: primaries and variants. */
export function listClaimedPublicPaths(
  media: readonly {
    publicPath: string;
    variants?: readonly { publicPath: string }[];
  }[],
): string[] {
  return media.flatMap((item) => [
    item.publicPath,
    ...(item.variants ?? []).map((variant) => variant.publicPath),
  ]);
}
