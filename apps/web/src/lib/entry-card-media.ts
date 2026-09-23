import type { EntryCardCover } from "@/components/ui/entry-card";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { publicCardMediaAltText } from "@/lib/public-media-alt";

/**
 * An entry's public photographs as a card draws them (`OVE-492`): each with
 * its `srcset`, its placeholder, its focal point and its intrinsic size — the
 * size is what reserves the photograph's own proportions before it arrives —
 * and the gardener's own description as `alt`, never the entry's title again
 * (OG-UX-029).
 */
export function entryCardMedia(
  media: readonly {
    publicUrl: string;
    intrinsicWidth?: number | null;
    intrinsicHeight?: number | null;
    variantLongEdges?: readonly number[] | null;
    placeholderDataUri?: string | null;
    focalX?: number | null;
    focalY?: number | null;
    caption?: string | null;
    altText?: string | null;
  }[],
): EntryCardCover[] {
  return media.map((photo) => {
    const sourceSet = buildPublicMediaSourceSet(photo);
    return {
      src: sourceSet.src,
      srcSet: sourceSet.srcSet,
      alt: publicCardMediaAltText(photo),
      placeholderDataUri: photo.placeholderDataUri ?? null,
      focalX: photo.focalX ?? null,
      focalY: photo.focalY ?? null,
      intrinsicWidth: photo.intrinsicWidth ?? null,
      intrinsicHeight: photo.intrinsicHeight ?? null,
    };
  });
}
