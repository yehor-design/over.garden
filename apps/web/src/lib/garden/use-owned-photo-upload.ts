"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  LocalJournalMediaCoordinator,
  type LocalJournalMediaItemSnapshot,
  type LocalJournalMediaSnapshot,
} from "@/lib/garden/local-journal-media-coordinator";
import type { OwnedPhotoPayload } from "@/lib/garden/owned-photo";
import { BrowserJournalImageEncoder } from "@/lib/media/browser-journal-image-encoder";
import { BrowserEphemeralMediaStager } from "@/lib/media/ephemeral-staging-client";

/**
 * One photo of a space or a plant or animal on its way to staging
 * (DESIGN.md §5.25): the cropped image goes through the journal's own browser
 * pipeline — WebP and its variants encoded here, uploaded straight to the
 * staging Worker under a session capability (`OVE-372`) — as soon as the crop
 * is confirmed. `payload()` hands the receipts to the request that commits
 * the photo; `committed()` releases the browser side afterwards without
 * deleting what the server now owns. Left without a commit, the staged photo
 * is deleted on unmount and would expire with the session lease anyway.
 */
export type OwnedPhotoUploadStatus = "empty" | "uploading" | "ready" | "failed";

export interface OwnedPhotoUpload {
  status: OwnedPhotoUploadStatus;
  previewUrl: string | null;
  failureCode: string | null;
  set(image: Blob): void;
  clear(): void;
  retry(): void;
  payload(): Promise<OwnedPhotoPayload | null>;
  /** The request that carried `payload()` failed: the photo may change again. */
  release(): void;
  committed(): void;
}

export interface OwnedPhotoUploadDependencies {
  createCoordinator?: (stagingSessionId: string) => LocalJournalMediaCoordinator;
  createId?: () => string;
}

const EMPTY: LocalJournalMediaSnapshot = { items: [], lease: "held" };
const BLOCK_ID = "owned-photo";

export function useOwnedPhotoUpload(
  dependencies: OwnedPhotoUploadDependencies = {},
): OwnedPhotoUpload {
  const [deps] = useState(() => dependencies);
  const createId = useCallback(
    () => (deps.createId ? deps.createId() : crypto.randomUUID()),
    [deps],
  );
  // Made at the first photo, so a gardener who skips the step asks the
  // session route for nothing.
  const [coordinator, setCoordinator] = useState<LocalJournalMediaCoordinator | null>(null);

  // A coordinator left behind is destroyed, which deletes what it staged; one
  // whose photo was committed has already let go and ignores the call.
  useEffect(() => () => coordinator?.destroy(), [coordinator]);

  const snapshot = useSyncExternalStore(
    coordinator?.subscribe ?? subscribeNothing,
    coordinator?.getSnapshot ?? (() => EMPTY),
    () => EMPTY,
  );
  const item: LocalJournalMediaItemSnapshot | undefined = snapshot.items[0];

  const set = useCallback(
    (image: Blob) => {
      let current = coordinator;
      if (!current) {
        const stagingSessionId = createId();
        current =
          deps.createCoordinator?.(stagingSessionId) ??
          new LocalJournalMediaCoordinator({
            stagingSessionId,
            encoder: new BrowserJournalImageEncoder(),
            stager: new BrowserEphemeralMediaStager({}),
            createId,
          });
        setCoordinator(current);
      }
      const previous = current.getSnapshot().items[0];
      if (previous) void current.remove(previous.mediaAssetId);
      current.add(image, { blockId: BLOCK_ID });
    },
    [coordinator, createId, deps],
  );

  const clear = useCallback(() => {
    const previous = coordinator?.getSnapshot().items[0];
    if (previous) void coordinator?.remove(previous.mediaAssetId);
  }, [coordinator]);

  const payload = useCallback(async (): Promise<OwnedPhotoPayload | null> => {
    const current = coordinator?.getSnapshot().items[0];
    if (!coordinator || !current) return null;
    const frozen = await coordinator.freeze([current.mediaAssetId]);
    return {
      stagingSessionId: frozen.stagingSessionId,
      mediaAssetId: current.mediaAssetId,
      receipts: frozen.mediaClaimReceipts,
      placeholder: frozen.mediaPlaceholders[current.mediaAssetId] ?? null,
    };
  }, [coordinator]);

  const retry = useCallback(() => {
    const current = coordinator?.getSnapshot().items[0];
    if (current?.status === "failed") coordinator?.retry(current.mediaAssetId);
  }, [coordinator]);

  const release = useCallback(() => {
    coordinator?.releasePublicationFreeze();
  }, [coordinator]);

  const committed = useCallback(() => {
    coordinator?.completePublication();
    setCoordinator(null);
  }, [coordinator]);

  return {
    status: !item
      ? "empty"
      : item.status === "ready"
        ? "ready"
        : item.status === "failed"
          ? "failed"
          : "uploading",
    previewUrl: item?.previewUrl ?? null,
    failureCode: item?.failureCode ?? null,
    set,
    clear,
    retry,
    payload,
    release,
    committed,
  };
}

function subscribeNothing() {
  return () => undefined;
}
