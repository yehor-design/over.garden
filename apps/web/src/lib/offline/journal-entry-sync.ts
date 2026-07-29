"use client";

import type {
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import {
  remapJournalDocumentMediaAssetIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";
import {
  claimOfflineMutationForSync,
  completeOfflineMutation,
  enqueueOfflineMutation,
  getOfflineMutation,
  settleClaimedOfflineMutationFailure,
  updateOfflineMutationPayload,
  OwnerOfflineActivityPausedError,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
  type OfflinePhotoIntent,
} from "./queue";
import { runOwnerSyncAttempt } from "./owner-session-lifecycle";

interface UploadResponse {
  mediaAssetId: string;
  uploadUrl: string;
}

interface ProcessResponse {
  mediaAsset: {
    id: string;
    status: string;
  };
  publicUrl: string;
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

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
    onResolvedPayload?: (next: OfflineJournalEntryPayload) => Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<FirstPlantEntryResponse> {
  const idempotencyKey = options.idempotencyKey ?? payload.clientMutationId;
  const authReturnTo = journalEntryAuthReturnTo(payload);
  const resolved = await resolveOfflineMediaForJournalPayload(
    payload,
    authReturnTo,
    options.signal,
  );

  if (
    resolved.primaryMediaAssetId &&
    resolved.primaryMediaAssetId !== payload.processedMediaAssetId
  ) {
    await options.onProcessedMediaAsset?.(resolved.primaryMediaAssetId);
  }
  if (resolved.payloadChanged) {
    await options.onResolvedPayload?.(resolved.payload);
  }

  const requestBody = buildJournalEntryRequestBodyForSync(
    resolved.payload,
    idempotencyKey,
    resolved.primaryMediaAssetId,
  );

  const response = await fetch("/api/garden/entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTH_INTENT_RETURN_HEADER]: authReturnTo,
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
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
  } catch (error) {
    if (error instanceof OwnerOfflineActivityPausedError) throw error;
    const submitDirect = dependencies.submitDirect ?? submitJournalEntryPayload;
    return runOwnerSyncAttempt(options.ownerUserId, (signal) =>
      submitDirect(payload, {
        idempotencyKey: options.idempotencyKey,
        signal,
      }),
    );
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

  return runOwnerSyncAttempt(options.expectedOwnerUserId, async (signal) => {
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
        signal,
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
        onResolvedPayload: async (next) => {
          await updateOfflineMutationPayload(
            options.expectedOwnerUserId,
            claimed.id,
            next,
          );
        },
      });

      await completeOfflineMutation(options.expectedOwnerUserId, claimed.id, {
        payload: syncedPayloadReceipt(payload),
        syncResult: syncedResultReceipt(result),
      });

      return result;
    } catch (error) {
      // Sign-out aborts active attempts only after installing a durable
      // `preparing` fence. Settle this exact lease under that fence so the
      // inventory and Stay/Sync-first path never wait 60 seconds for expiry.
      // A settlement failure must not replace the original network/auth error.
      await settleClaimedOfflineMutationFailure(
        options.expectedOwnerUserId,
        claimed.id,
        claimed,
        { lastError: normalizeError(error) },
      ).catch(() => undefined);
      throw error;
    }
  });
}

function syncedPayloadReceipt(payload: OfflineJournalEntryPayload) {
  if (payload.target === "plant_object_entry") {
    return {
      target: payload.target,
      plantObjectId: payload.plantObjectId,
      clientMutationId: payload.clientMutationId,
    };
  }
  if (payload.target === "space_entry") {
    return {
      target: payload.target,
      spaceId: payload.spaceId,
      clientMutationId: payload.clientMutationId,
    };
  }
  return {
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
  const cover = resolveCoverClaimForSync(payload);
  if (payload.target === "plant_object_entry") {
    return {
      target: "plant_object_entry",
      plantObjectId: payload.plantObjectId,
      title: payload.title,
      body: payload.body,
      contentDocument: payload.contentDocument,
      entryDate: payload.entryDate,
      clientMutationId: idempotencyKey,
      mediaAssetId: mediaAssetId ?? "",
      cover,
      mentionSelections: payload.mentionSelections ?? [],
      topicTags: payload.topicTags ?? [],
      syncStatus:
        payload.syncStatus === "offline_queued" ? "offline_synced" : "online",
    };
  }

  if (payload.target === "space_entry") {
    return {
      target: "space_entry",
      spaceId: payload.spaceId,
      mentionedPlantObjectIds: payload.mentionedPlantObjectIds,
      title: payload.title,
      body: payload.body,
      contentDocument: payload.contentDocument,
      entryDate: payload.entryDate,
      clientMutationId: idempotencyKey,
      mediaAssetId: mediaAssetId ?? "",
      cover,
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
    contentDocument: payload.contentDocument,
    entryDate: payload.entryDate,
    locationVisibility: payload.locationVisibility ?? "hidden",
    coarseRegionCode: payload.coarseRegionCode ?? null,
    clientMutationId: idempotencyKey,
    mediaAssetId: mediaAssetId ?? "",
    cover,
    mentionSelections: payload.mentionSelections ?? [],
    topicTags: payload.topicTags ?? [],
    syncStatus:
      payload.syncStatus === "offline_queued" ? "offline_synced" : "online",
    activationSource: payload.activationSource ?? null,
  };
}

function resolveCoverClaimForSync(
  payload: OfflineJournalEntryPayload,
): FirstPlantEntryRequest["cover"] {
  const cover = payload.cover;
  if (!cover) return { mode: "automatic" };
  switch (cover.mode) {
    case "automatic":
    case "none":
      return { mode: cover.mode };
    case "explicit_inline":
    case "keep_as_cover":
      return { mode: cover.mode, mediaAssetId: cover.mediaAssetId };
    case "separate": {
      if (cover.mediaAssetId) {
        return { mode: "separate", mediaAssetId: cover.mediaAssetId };
      }
      // Upload still pending — automatic until the next sync pass.
      return { mode: "automatic" };
    }
    default: {
      const _exhaustive: never = cover;
      return _exhaustive;
    }
  }
}

async function resolveOfflineMediaForJournalPayload(
  payload: OfflineJournalEntryPayload,
  authReturnTo: string,
  signal?: AbortSignal,
): Promise<{
  payload: OfflineJournalEntryPayload;
  primaryMediaAssetId: string | null;
  payloadChanged: boolean;
}> {
  const mediaIdMap = new Map<string, string>();
  const remainingIntents: Record<string, OfflinePhotoIntent> = {
    ...(payload.photoIntentsByBlockId ?? {}),
  };

  for (const [provisionalId, intent] of Object.entries(remainingIntents)) {
    const realId = await processPhotoIntent(intent, authReturnTo, signal);
    if (!realId) continue;
    mediaIdMap.set(provisionalId, realId);
    delete remainingIntents[provisionalId];
  }

  let primaryMediaAssetId = payload.processedMediaAssetId ?? null;
  if (!primaryMediaAssetId && payload.photoIntent) {
    primaryMediaAssetId = await processPhotoIntent(
      payload.photoIntent,
      authReturnTo,
      signal,
    );
  }
  if (!primaryMediaAssetId && mediaIdMap.size > 0) {
    primaryMediaAssetId = [...mediaIdMap.values()][0] ?? null;
  }

  let nextCover = payload.cover ?? null;
  let coverChanged = false;
  if (nextCover?.mode === "separate" && !nextCover.mediaAssetId) {
    const coverMediaAssetId = await processPhotoIntent(
      nextCover.photoIntent ?? null,
      authReturnTo,
      signal,
    );
    if (coverMediaAssetId) {
      nextCover = {
        mode: "separate",
        mediaAssetId: coverMediaAssetId,
        photoIntent: null,
      };
      coverChanged = true;
    }
  } else if (
    nextCover?.mode === "explicit_inline" &&
    mediaIdMap.has(nextCover.mediaAssetId)
  ) {
    nextCover = {
      mode: "explicit_inline",
      mediaAssetId: mediaIdMap.get(nextCover.mediaAssetId)!,
    };
    coverChanged = true;
  } else if (
    nextCover?.mode === "keep_as_cover" &&
    mediaIdMap.has(nextCover.mediaAssetId)
  ) {
    nextCover = {
      mode: "keep_as_cover",
      mediaAssetId: mediaIdMap.get(nextCover.mediaAssetId)!,
    };
    coverChanged = true;
  }

  let nextDocument = payload.contentDocument;
  let documentChanged = false;
  if (
    payload.contentDocument &&
    typeof payload.contentDocument === "object" &&
    mediaIdMap.size > 0
  ) {
    nextDocument = remapJournalDocumentMediaAssetIds(
      payload.contentDocument as JournalDocumentV1,
      mediaIdMap,
    );
    documentChanged = true;
  }

  const payloadChanged =
    documentChanged ||
    coverChanged ||
    Object.keys(remainingIntents).length !==
      Object.keys(payload.photoIntentsByBlockId ?? {}).length ||
    (primaryMediaAssetId != null &&
      primaryMediaAssetId !== payload.processedMediaAssetId);

  return {
    payload: {
      ...payload,
      contentDocument: nextDocument,
      cover: nextCover,
      photoIntentsByBlockId:
        Object.keys(remainingIntents).length > 0 ? remainingIntents : undefined,
      photoIntent: primaryMediaAssetId ? null : payload.photoIntent,
      processedMediaAssetId: primaryMediaAssetId,
    },
    primaryMediaAssetId,
    payloadChanged,
  };
}

async function processPhotoIntent(
  intent: OfflinePhotoIntent | null,
  authReturnTo: string,
  signal?: AbortSignal,
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
    signal,
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
    signal,
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
    signal,
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
  if (processed.mediaAsset.status !== "processed" || !processed.publicUrl) {
    throw new Error("Photo was not processed.");
  }

  return processed.mediaAsset.id;
}

/** OVE-243 durable identity boundary for online edit composers. */
export async function uploadComposerPhotoIntent(
  intent: OfflinePhotoIntent,
  authReturnTo: string,
  signal?: AbortSignal,
) {
  return processPhotoIntent(intent, authReturnTo, signal);
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
  if (
    error instanceof OwnerOfflineActivityPausedError ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "Sync paused.";
  }
  const message = error instanceof Error ? error.message : "Sync failed.";
  return message
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
