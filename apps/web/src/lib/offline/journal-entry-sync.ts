"use client";

import type {
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
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

export class JournalEntrySyncError extends Error {
  readonly status: number;
  readonly authIntentUrl: string | null;

  constructor(message: string, status: number, authIntentUrl: string | null) {
    super(message);
    this.name = "JournalEntrySyncError";
    this.status = status;
    this.authIntentUrl = authIntentUrl;
  }
}

export async function submitJournalEntryPayload(
  payload: OfflineJournalEntryPayload,
  options: {
    idempotencyKey?: string;
    onProcessedMediaAsset?: (mediaAssetId: string) => Promise<void>;
  } = {},
): Promise<FirstPlantEntryResponse> {
  const idempotencyKey = options.idempotencyKey ?? payload.clientMutationId;
  const authReturnTo = journalEntryAuthReturnTo(payload);
  const mediaAssetId =
    payload.processedMediaAssetId ??
    (await processPhotoIntent(payload.photoIntent ?? null, authReturnTo));

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
    headers: {
      "Content-Type": "application/json",
      [AUTH_INTENT_RETURN_HEADER]: authReturnTo,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await readSafeSyncError(response, "Entry sync failed.");
    throw new JournalEntrySyncError(
      error.message,
      response.status,
      error.authIntentUrl,
    );
  }

  return (await response.json()) as FirstPlantEntryResponse;
}

export function journalEntryAuthReturnTo(payload: OfflineJournalEntryPayload) {
  if (
    payload.target === "plant_object_entry" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.plantObjectId,
    )
  ) {
    return `/garden/objects/${payload.plantObjectId}`;
  }

  return "/garden";
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
  if (payload.target === "plant_object_entry") {
    return {
      target: "plant_object_entry",
      plantObjectId: payload.plantObjectId,
      title: payload.title,
      body: payload.body,
      entryDate: payload.entryDate,
      clientMutationId: idempotencyKey,
      mediaAssetId: mediaAssetId ?? "",
      mentionSelections: payload.mentionSelections ?? [],
      topicTags: payload.topicTags ?? [],
      syncStatus:
        payload.syncStatus === "offline_queued" ? "offline_synced" : "online",
    };
  }

  return {
    target: "first_plant_entry",
    spaceName: payload.spaceName,
    plantName: payload.plantName,
    objectKind: payload.objectKind ?? "plant",
    catalogItemId: payload.catalogItemId ?? null,
    userAddedCatalogName: payload.userAddedCatalogName ?? null,
    varietyText: payload.varietyText ?? "",
    title: payload.title,
    body: payload.body,
    entryDate: payload.entryDate,
    locationVisibility: payload.locationVisibility ?? "hidden",
    coarseRegionCode: payload.coarseRegionCode ?? null,
    clientMutationId: idempotencyKey,
    mediaAssetId: mediaAssetId ?? "",
    mentionSelections: payload.mentionSelections ?? [],
    topicTags: payload.topicTags ?? [],
    syncStatus:
      payload.syncStatus === "offline_queued" ? "offline_synced" : "online",
    activationSource: payload.activationSource ?? null,
  };
}

async function processPhotoIntent(
  intent: OfflinePhotoIntent | null,
  authReturnTo: string,
) {
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
    headers: {
      "Content-Type": "application/json",
      [AUTH_INTENT_RETURN_HEADER]: authReturnTo,
    },
    body: JSON.stringify({ contentType: intent.contentType }),
  });

  if (!uploadResponse.ok) {
    const error = await readSafeSyncError(
      uploadResponse,
      "Photo upload could not start.",
    );
    throw new JournalEntrySyncError(
      error.message,
      uploadResponse.status,
      error.authIntentUrl,
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
    headers: {
      "Content-Type": "application/json",
      [AUTH_INTENT_RETURN_HEADER]: authReturnTo,
    },
    body: JSON.stringify({ mediaAssetId: upload.mediaAssetId }),
  });

  if (!processResponse.ok) {
    const error = await readSafeSyncError(
      processResponse,
      "Photo processing failed.",
    );
    throw new JournalEntrySyncError(
      error.message,
      processResponse.status,
      error.authIntentUrl,
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

async function readSafeSyncError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
    authIntentUrl?: unknown;
  } | null;
  const candidate =
    typeof body?.authIntentUrl === "string" ? body.authIntentUrl : "";
  const authIntentUrl =
    candidate.length <= 2048 &&
    /^\/auth\/intent\?intent=[A-Za-z0-9._~-]+$/.test(candidate)
      ? candidate
      : null;

  return {
    message: typeof body?.error === "string" ? body.error : fallback,
    authIntentUrl,
  };
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Sync failed.";
}
