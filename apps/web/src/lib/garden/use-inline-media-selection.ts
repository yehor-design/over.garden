"use client";

import { useEffect, useState } from "react";

import { createComposerPhotoIntent } from "./composer-photo-selection";
import { assertOfflinePhotoQuotaAllows } from "../offline/offline-media-quota";
import {
  InlineMediaIntentController,
  type InlineMediaReservation,
} from "../offline/inline-media-intent-controller";
import type { OfflinePhotoIntent } from "../offline/queue";

export function useInlineMediaSelection(ownerKey: string) {
  const [controller] = useState(() => new InlineMediaIntentController());
  useEffect(() => {
    return () => controller.destroy();
  }, [controller, ownerKey]);
  return controller;
}

export async function selectInlineMedia(input: {
  controller: InlineMediaIntentController;
  file: File;
  blockId: string;
  existing: Readonly<Record<string, OfflinePhotoIntent>>;
}): Promise<{
  intent: OfflinePhotoIntent;
  mediaAssetId: string;
  previewUrl: string;
  reservation: InlineMediaReservation;
}> {
  const reservation = input.controller.reserve(input.file, input.existing);
  try {
    await assertOfflinePhotoQuotaAllows({
      existingBytes: 0,
      nextBytes: input.file.size,
    });
    const intent = await createComposerPhotoIntent(input.file);
    const previewUrl = URL.createObjectURL(input.file);
    input.controller.commit(reservation, input.blockId, previewUrl);
    return {
      intent,
      mediaAssetId: crypto.randomUUID(),
      previewUrl,
      reservation,
    };
  } catch (error) {
    input.controller.release(reservation);
    throw error;
  }
}
