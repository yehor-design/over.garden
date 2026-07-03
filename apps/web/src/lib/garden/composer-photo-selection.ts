"use client";

import {
  createOfflinePhotoIntent,
  type OfflinePhotoIntent,
} from "@/lib/offline/queue";

export const COMPOSER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const SUPPORTED_COMPOSER_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isSupportedComposerPhoto(
  file: Pick<File, "type"> | null | undefined,
): boolean {
  return Boolean(file && SUPPORTED_COMPOSER_PHOTO_TYPES.has(file.type));
}

export async function createComposerPhotoIntent(
  file: File,
): Promise<OfflinePhotoIntent> {
  return createOfflinePhotoIntent(file);
}

export function clearComposerPhotoIntent(): OfflinePhotoIntent | null {
  return null;
}
