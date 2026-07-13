"use client";

import type {
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";
import {
  claimOfflineMutationForSync,
  completeOfflineMutation,
  enqueueOfflineMutation,
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

interface SubmitOnlineJournalEntryDependencies {
  enqueueMutation?: typeof enqueueOfflineMutation;
  submitDirect?: typeof submitJournalEntryPayload;
  syncMutation?: typeof syncOfflineJournalEntryMutation;
}

export async function submitOnlineJournalEntryPayload(
  payload: OfflineJournalEntryPayload,
  options: { ownerUserId: string; idempotencyKey: string },
  dependencies: SubmitOnlineJournalEntryDependencies = {},
) {
  const enqueueMutation =
    dependencies.enqueueMutation ?? enqueueOfflineMutation;
  let mutation: OfflineMutation;

  try {
    mutation = await enqueueMutation({
      ownerUserId: options.ownerUserId,
      kind: "journal_entry",
      payload,
      idempotencyKey: options.idempotencyKey,
    });
  } catch {
    const submitDirect = dependencies.submitDirect ?? submitJournalEntryPayload;
    return submitDirect(payload, { idempotencyKey: options.idempotencyKey });
  }

  const syncMutation =
    dependencies.syncMutation ?? syncOfflineJournalEntryMutation;
  return syncMutation(mutation, {
    expectedOwnerUserId: options.ownerUserId,
  });
}

export async function syncOfflineJournalEntryMutation(
  mutation: OfflineMutation,
  options: { expectedOwnerUserId: string },
): Promise<FirstPlantEntryResponse> {
  if (mutation.kind !== "journal_entry") {
    throw new Error("Only journal entry mutations can be synced here.");
  }
  if (mutation.ownerUserId !== options.expectedOwnerUserId) {
    throw new Error("Offline mutation does not belong to the active account.");
  }

  const claimed = await claimOfflineMutationForSync(
    options.expectedOwnerUserId,
    mutation.id,
  );
  if (!claimed) {
    throw new Error("Offline mutation is already syncing or has synced.");
  }

  const payload = claimed.payload as OfflineJournalEntryPayload;

  try {
    const result = await submitJournalEntryPayload(payload, {
      idempotencyKey: claimed.idempotencyKey,
      onProcessedMediaAsset: async (mediaAssetId) => {
        const latest = await getOfflineMutation(
          options.expectedOwnerUserId,
          claimed.id,
        );
        const latestPayload =
          (latest?.payload as OfflineJournalEntryPayload | undefined) ??
          payload;

        await updateOfflineMutationPayload(
          options.expectedOwnerUserId,
          claimed.id,
          {
            ...latestPayload,
            processedMediaAssetId: mediaAssetId,
          },
        );
      },
    });

    await completeOfflineMutation(options.expectedOwnerUserId, claimed.id, {
      payload: syncedPayloadReceipt(payload),
      syncResult: syncedResultReceipt(result),
    });

    return result;
  } catch (error) {
    await updateOfflineMutationStatus(
      options.expectedOwnerUserId,
      claimed.id,
      "failed",
      {
        lastError: normalizeError(error),
      },
    );
    throw error;
  }
}

function syncedPayloadReceipt(payload: OfflineJournalEntryPayload) {
  return payload.target === "plant_object_entry"
    ? {
        target: payload.target,
        plantObjectId: payload.plantObjectId,
        clientMutationId: payload.clientMutationId,
      }
    : {
        target: "first_plant_entry" as const,
        clientMutationId: payload.clientMutationId,
      };
}

function syncedResultReceipt(result: FirstPlantEntryResponse) {
  return {
    readbackUrl: result.readbackUrl,
    entryId: result.entry.id,
    plantObjectId: result.plantObject.id,
  };
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
    spaceId: payload.spaceId ?? null,
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
  if (
    !isAllowedComposerImageSize(intent.size) ||
    (intent.blob && intent.blob.size !== intent.size)
  ) {
    throw new Error("Photo intent must be between 1 byte and 12 MB.");
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
    body: JSON.stringify({
      contentType: intent.contentType,
      sizeBytes: intent.size,
    }),
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
