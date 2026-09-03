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
 * to browser storage. The shared composer converts it into the sole final WebP
 * and sends those exact bytes directly to bounded private edge staging.
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

export type ComposerPhotoRefusal = "unsupported_type" | "too_large";

/**
 * Why a picked, pasted, or dropped file is refused before any block or codec
 * work starts, or `null` when it may proceed. The composer maps the class
 * onto its localized copy; `composerPhotoSelectionError` keeps the English
 * form for scripts and tests.
 */
export function classifyComposerPhotoRefusal(
  file: Pick<File, "type" | "size"> | null | undefined,
): ComposerPhotoRefusal | null {
  if (!file || !SUPPORTED_COMPOSER_PHOTO_TYPES.has(file.type)) {
    return "unsupported_type";
  }
  if (!isAllowedComposerImageSize(file.size)) return "too_large";
  return null;
}

export function composerPhotoSelectionError(
  file: Pick<File, "type" | "size"> | null | undefined,
) {
  const refusal = classifyComposerPhotoRefusal(file);
  if (refusal === "unsupported_type") {
    return "Use a JPEG, PNG, WebP, or HEIC photo.";
  }
  if (refusal === "too_large") {
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
