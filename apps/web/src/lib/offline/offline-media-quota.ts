"use client";

import type { OfflinePhotoIntent } from "./queue";

/** Logical ceiling for offline photo Blobs retained across drafts + queue. */
export const MAX_OFFLINE_PHOTO_LOGICAL_BYTES = 120 * 1024 * 1024;

export function sumOfflinePhotoIntentBytes(
  intents: Iterable<OfflinePhotoIntent | null | undefined>,
): number {
  let total = 0;
  for (const intent of intents) {
    if (!intent) continue;
    total += Math.max(0, intent.size);
  }
  return total;
}

export function canAcceptOfflinePhotoBytes(input: {
  existingBytes: number;
  nextBytes: number;
  ceilingBytes?: number;
}): boolean {
  const ceiling = input.ceilingBytes ?? MAX_OFFLINE_PHOTO_LOGICAL_BYTES;
  if (input.nextBytes <= 0) return true;
  return input.existingBytes + input.nextBytes <= ceiling;
}

export async function estimateBrowserStorageRemainingBytes(): Promise<
  number | null
> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const estimate = await navigator.storage.estimate();
    if (
      typeof estimate.quota !== "number" ||
      typeof estimate.usage !== "number"
    ) {
      return null;
    }
    return Math.max(0, estimate.quota - estimate.usage);
  } catch {
    return null;
  }
}

/**
 * Fail closed before copying a new Blob into IndexedDB when either the
 * OverGarden logical ceiling or the browser quota estimate would be exceeded.
 */
export async function assertOfflinePhotoQuotaAllows(input: {
  existingBytes: number;
  nextBytes: number;
}): Promise<void> {
  if (
    !canAcceptOfflinePhotoBytes({
      existingBytes: input.existingBytes,
      nextBytes: input.nextBytes,
    })
  ) {
    throw new Error("Offline photo storage limit reached.");
  }

  const remaining = await estimateBrowserStorageRemainingBytes();
  if (remaining !== null && input.nextBytes > remaining) {
    throw new Error("Browser storage quota is full.");
  }
}
