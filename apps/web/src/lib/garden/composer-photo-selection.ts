"use client";

import {
  createOfflinePhotoIntent,
  type OfflinePhotoIntent,
} from "@/lib/offline/queue";
import {
  isAllowedComposerImageSize,
  MAX_COMPOSER_IMAGE_MEGABYTES,
} from "@/lib/media/image-limits";

export const COMPOSER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const SUPPORTED_COMPOSER_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isSupportedComposerPhoto(
  file: Pick<File, "type" | "size"> | null | undefined,
): boolean {
  return composerPhotoSelectionError(file) === null;
}

export function composerPhotoSelectionError(
  file: Pick<File, "type" | "size"> | null | undefined,
) {
  if (!file || !SUPPORTED_COMPOSER_PHOTO_TYPES.has(file.type)) {
    return "Use a JPEG, PNG, or WebP photo.";
  }
  if (!isAllowedComposerImageSize(file.size)) {
    return `Choose a photo up to ${MAX_COMPOSER_IMAGE_MEGABYTES} MB.`;
  }
  return null;
}

export async function createComposerPhotoIntent(
  file: File,
): Promise<OfflinePhotoIntent> {
  const error = composerPhotoSelectionError(file);
  if (error) throw new Error(error);
  return createOfflinePhotoIntent(file);
}

export function clearComposerPhotoIntent(): OfflinePhotoIntent | null {
  return null;
}
