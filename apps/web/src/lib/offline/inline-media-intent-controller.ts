"use client";

import type { OfflinePhotoIntent } from "./queue";
import { MAX_OFFLINE_PHOTO_LOGICAL_BYTES } from "./offline-media-quota";

export const MAX_INLINE_MEDIA_ITEMS = 10;

export interface InlineMediaReservation {
  readonly id: string;
  readonly size: number;
}

/**
 * Synchronous reservation boundary shared by every journal composer mode.
 * Reservations are recorded before the first await, so parallel file-picker
 * callbacks cannot all pass the same stale React snapshot.
 */
export class InlineMediaIntentController {
  private readonly reservations = new Map<string, number>();
  private readonly objectUrls = new Map<string, string>();
  private readonly committedBlocks = new Map<string, number>();

  reserve(
    file: Pick<File, "size">,
    existing: Readonly<Record<string, OfflinePhotoIntent>>,
  ): InlineMediaReservation {
    for (const blockId of this.committedBlocks.keys()) {
      if (existing[blockId]) this.committedBlocks.delete(blockId);
    }
    const committed = uniqueIntents(Object.values(existing));
    const committedBytes = committed.reduce(
      (sum, intent) => sum + intent.size,
      0,
    );
    const reservedBytes = [...this.reservations.values()].reduce(
      (sum, size) => sum + size,
      0,
    );
    if (
      committed.length + this.committedBlocks.size + this.reservations.size >=
      MAX_INLINE_MEDIA_ITEMS
    ) {
      throw new Error("A journal entry can contain up to 10 photos.");
    }
    if (
      file.size <= 0 ||
      committedBytes +
        [...this.committedBlocks.values()].reduce(
          (sum, size) => sum + size,
          0,
        ) +
        reservedBytes +
        file.size >
        MAX_OFFLINE_PHOTO_LOGICAL_BYTES
    ) {
      throw new Error("Offline photo storage limit reached.");
    }
    const reservation = { id: crypto.randomUUID(), size: file.size };
    this.reservations.set(reservation.id, reservation.size);
    return reservation;
  }

  commit(
    reservation: InlineMediaReservation,
    blockId: string,
    objectUrl: string,
  ) {
    if (this.reservations.get(reservation.id) !== reservation.size) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("Inline photo reservation is no longer current.");
    }
    this.reservations.delete(reservation.id);
    this.committedBlocks.set(blockId, reservation.size);
    this.objectUrls.set(blockId, objectUrl);
  }

  release(reservation: InlineMediaReservation) {
    this.reservations.delete(reservation.id);
    this.revoke(reservation.id);
  }

  revoke(id: string) {
    this.committedBlocks.delete(id);
    const url = this.objectUrls.get(id);
    if (!url) return;
    this.objectUrls.delete(id);
    URL.revokeObjectURL(url);
  }

  destroy() {
    this.reservations.clear();
    this.committedBlocks.clear();
    for (const id of [...this.objectUrls.keys()]) this.revoke(id);
  }

  snapshot() {
    return {
      reservedCount: this.reservations.size,
      committedCount: this.committedBlocks.size,
      objectUrlCount: this.objectUrls.size,
    };
  }
}

function uniqueIntents(
  intents: Iterable<OfflinePhotoIntent | null | undefined>,
) {
  return [...new Set([...intents].filter(Boolean))] as OfflinePhotoIntent[];
}
