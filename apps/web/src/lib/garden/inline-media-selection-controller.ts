"use client";

import type { OnlineComposerPhotoIntent } from "./composer-photo-selection";

export const MAX_INLINE_MEDIA_ITEMS = 10;
export const MAX_INLINE_MEDIA_LOGICAL_BYTES = 48 * 1024 * 1024;

export interface InlineMediaReservation {
  readonly id: string;
  readonly size: number;
}

/**
 * In-memory reservation boundary for parallel file-picker callbacks. It owns
 * only counters and object URLs for the current tab and has no durable writer.
 */
export class InlineMediaSelectionController {
  private readonly reservations = new Map<string, number>();
  private readonly objectUrls = new Map<string, string>();
  private readonly committedBlocks = new Map<string, number>();

  reserve(
    file: Pick<File, "size">,
    existing: Readonly<Record<string, OnlineComposerPhotoIntent>>,
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
    const trackedBytes = [...this.committedBlocks.values()].reduce(
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
      committedBytes + trackedBytes + reservedBytes + file.size >
        MAX_INLINE_MEDIA_LOGICAL_BYTES
    ) {
      throw new Error("The selected photos exceed the journal media limit.");
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
  }

  revoke(blockId: string) {
    this.committedBlocks.delete(blockId);
    const url = this.objectUrls.get(blockId);
    if (!url) return;
    this.objectUrls.delete(blockId);
    URL.revokeObjectURL(url);
  }

  destroy() {
    this.reservations.clear();
    this.committedBlocks.clear();
    for (const blockId of [...this.objectUrls.keys()]) this.revoke(blockId);
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
  intents: Iterable<OnlineComposerPhotoIntent | null | undefined>,
) {
  return [
    ...new Set([...intents].filter(Boolean)),
  ] as OnlineComposerPhotoIntent[];
}
