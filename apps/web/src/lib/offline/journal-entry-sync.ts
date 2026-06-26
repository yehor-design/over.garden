"use client";

import type {
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import {
  getOfflineMutation,
  updateOfflineMutationPayload,
  updateOfflineMutationStatus,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
  type OfflinePhotoIntent,
} from "./queue";

interface UploadResponse {
  mediaAssetId: string;
  uploadUrl: string;
}

interface ProcessResponse {
  mediaAsset: {
    id: string;
    status: string;
    derivative_key: string | null;
  };
  publicUrl: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function submitJournalEntryPayload(
  payload: OfflineJournalEntryPayload,
  options: {
    idempotencyKey?: string;
    onProcessedMediaAsset?: (mediaAssetId: string) => Promise<void>;
  } = {},
): Promise<FirstPlantEntryResponse> {
  const idempotencyKey = options.idempotencyKey ?? payload.clientMutationId;
  const mediaAssetId =
    payload.processedMediaAssetId ??
    (await processPhotoIntent(payload.photoIntent ?? null));

  if (mediaAssetId && mediaAssetId !== payload.processedMediaAssetId) {
    await options.onProcessedMediaAsset?.(mediaAssetId);
  }

  const requestBody = buildJournalEntryRequestBodyForSync(
    payload,
    idempotencyKey,
    mediaAssetId,
  );

  const response = await fetch("/api/garden/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(await readSafeError(response, "Entry sync failed."));
  }

  return (await response.json()) as FirstPlantEntryResponse;
}

export async function syncOfflineJournalEntryMutation(
  mutation: OfflineMutation,
): Promise<FirstPlantEntryResponse> {
  if (mutation.kind !== "journal_entry") {
    throw new Error("Only journal entry mutations can be synced here.");
  }

  const payload = mutation.payload as OfflineJournalEntryPayload;
  await updateOfflineMutationStatus(mutation.id, "syncing", {
    lastError: undefined,
  });

  try {
    const result = await submitJournalEntryPayload(payload, {
      idempotencyKey: mutation.idempotencyKey,
      onProcessedMediaAsset: async (mediaAssetId) => {
        const latest = await getOfflineMutation(mutation.id);
        const latestPayload =
          (latest?.payload as OfflineJournalEntryPayload | undefined) ??
          payload;

        await updateOfflineMutationPayload(mutation.id, {
          ...latestPayload,
          processedMediaAssetId: mediaAssetId,
        });
      },
    });

    await updateOfflineMutationStatus(mutation.id, "synced", {
      syncResult: result,
      lastError: undefined,
    });

    return result;
  } catch (error) {
    await updateOfflineMutationStatus(mutation.id, "failed", {
      lastError: normalizeError(error),
    });
    throw error;
  }
}

export function buildJournalEntryRequestBodyForSync(
  payload: OfflineJournalEntryPayload,
  idempotencyKey: string,
  mediaAssetId?: string | null,
): FirstPlantEntryRequest {
  return {
    spaceName: payload.spaceName,
    plantName: payload.plantName,
    catalogItemId: payload.catalogItemId ?? null,
    varietyText: payload.varietyText ?? "",
    title: payload.title,
    body: payload.body,
    entryDate: payload.entryDate,
    clientMutationId: idempotencyKey,
    mediaAssetId: mediaAssetId ?? "",
    syncStatus:
      payload.syncStatus === "offline_queued" ? "offline_synced" : "online",
  };
}

async function processPhotoIntent(intent: OfflinePhotoIntent | null) {
  if (!intent) return null;

  if (!ALLOWED_IMAGE_TYPES.has(intent.contentType)) {
    throw new Error("Photo intent must be JPEG, PNG, or WebP.");
  }

  if (!intent.blob) {
    throw new Error(
      "Photo intent is queued, but this browser no longer has the photo file.",
    );
  }

  const uploadResponse = await fetch("/api/media/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: intent.contentType }),
  });

  if (!uploadResponse.ok) {
    throw new Error(
      await readSafeError(uploadResponse, "Photo upload could not start."),
    );
  }

  const upload = (await uploadResponse.json()) as UploadResponse;
  const quarantineResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": intent.contentType },
    body: intent.blob,
  });

  if (!quarantineResponse.ok) {
    throw new Error("Photo upload failed.");
  }

  const processResponse = await fetch("/api/media/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaAssetId: upload.mediaAssetId }),
  });

  if (!processResponse.ok) {
    throw new Error(
      await readSafeError(processResponse, "Photo processing failed."),
    );
  }

  const processed = (await processResponse.json()) as ProcessResponse;
  if (
    processed.mediaAsset.status !== "processed" ||
    !processed.mediaAsset.derivative_key
  ) {
    throw new Error("Photo was not processed.");
  }

  return processed.mediaAsset.id;
}

async function readSafeError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Sync failed.";
}
