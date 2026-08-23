"use client";

import {
  isAllowedComposerImageSize,
  MAX_COMPOSER_IMAGE_MEGABYTES,
} from "@/lib/media/image-limits";

export const COMPOSER_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const SUPPORTED_COMPOSER_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * A current-tab-only media selection. The Blob is never serialized or written
 * to browser storage; callers upload it through the canonical quarantine and
 * processing routes before a server draft can reference the resulting asset.
 */
export interface OnlineComposerPhotoIntent {
  fileName: string;
  contentType: string;
  size: number;
  lastModified?: number;
  blob?: Blob;
}

export function isSupportedComposerPhoto(
  file: Pick<File, "type" | "size"> | null | undefined,
): boolean {
  return composerPhotoSelectionError(file) === null;
}

export function composerPhotoSelectionError(
  file: Pick<File, "type" | "size"> | null | undefined,
) {
  if (!file || !SUPPORTED_COMPOSER_PHOTO_TYPES.has(file.type)) {
    return "Use a JPEG, PNG, WebP, or HEIC photo.";
  }
  if (!isAllowedComposerImageSize(file.size)) {
    return `Choose a photo up to ${MAX_COMPOSER_IMAGE_MEGABYTES} MB.`;
  }
  return null;
}

export async function createComposerPhotoIntent(
  file: File,
): Promise<OnlineComposerPhotoIntent> {
  const error = composerPhotoSelectionError(file);
  if (error) throw new Error(error);
  return {
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: file,
  };
}

export function clearComposerPhotoIntent(): OnlineComposerPhotoIntent | null {
  return null;
}
