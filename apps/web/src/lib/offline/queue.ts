"use client";

import Dexie, { type Table } from "dexie";

import type { EntrySyncStatus, PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  JournalEntryTarget,
} from "@/lib/garden/entry-contracts";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";

export type OfflineMutationStatus = "queued" | "syncing" | "synced" | "failed";
export type OfflineMutationKind = "journal_entry" | "photo_upload";
export const OFFLINE_QUEUE_CHANGED_EVENT = "overgarden:offline-queue-changed";

export interface OfflinePhotoIntent {
  fileName: string;
  contentType: string;
  size: number;
  lastModified?: number;
  blob?: Blob;
}

interface OfflineJournalEntryPayloadBase {
  target?: JournalEntryTarget;
  title: string;
  body: string;
  entryDate: string;
  clientMutationId: string;
  syncStatus?: EntrySyncStatus;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: string[];
  photoIntent?: OfflinePhotoIntent | null;
  processedMediaAssetId?: string | null;
}

export interface OfflineFirstPlantEntryPayload extends OfflineJournalEntryPayloadBase {
  target?: "first_plant_entry";
  spaceName: string;
  plantName: string;
  objectKind?: PlantObjectKind | null;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  activationSource?: ActivationSource | null;
}

export interface OfflinePlantObjectEntryPayload extends OfflineJournalEntryPayloadBase {
  target: "plant_object_entry";
  plantObjectId: string;
}

export type OfflineJournalEntryPayload =
  | OfflineFirstPlantEntryPayload
  | OfflinePlantObjectEntryPayload;

export type OfflineMutationPayload = OfflineJournalEntryPayload | unknown;

export interface OfflineMutation {
  id: string;
  kind: OfflineMutationKind;
  payload: OfflineMutationPayload;
  idempotencyKey: string;
  status: OfflineMutationStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  syncResult?: unknown;
}

export type OfflineDraftKind = "first_entry" | "follow_up_entry";

export interface OfflineDraftRecord<TPayload = unknown> {
  id: string;
  kind: OfflineDraftKind;
  payload: TPayload;
  createdAt: number;
  updatedAt: number;
}

class OverGardenOfflineDb extends Dexie {
  mutations!: Table<OfflineMutation, string>;
  drafts!: Table<OfflineDraftRecord, string>;

  constructor() {
    super("overgarden-offline");
    this.version(1).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
    });
    this.version(2).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
      drafts: "id, kind, createdAt, updatedAt",
    });
  }
}

export const offlineDb =
  typeof indexedDB === "undefined" ? undefined : new OverGardenOfflineDb();

export async function enqueueOfflineMutation(
  input: Pick<OfflineMutation, "kind" | "payload"> & {
    idempotencyKey?: string;
  },
): Promise<OfflineMutation> {
  if (!offlineDb) {
    throw new Error("Offline queue is only available when IndexedDB exists.");
  }

  const now = Date.now();
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const existing = await offlineDb.mutations
    .where("idempotencyKey")
    .equals(idempotencyKey)
    .first();

  if (existing) {
    if (existing.status === "queued" || existing.status === "failed") {
      await offlineDb.mutations.update(existing.id, {
        payload: input.payload,
        status: "queued",
        updatedAt: now,
        lastError: undefined,
      });
      notifyOfflineQueueChanged();
      return {
        ...existing,
        payload: input.payload,
        status: "queued",
        updatedAt: now,
        lastError: undefined,
      };
    }

    return existing;
  }

  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    kind: input.kind,
    payload: input.payload,
    idempotencyKey,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  await offlineDb.mutations.add(mutation);
  notifyOfflineQueueChanged();
  return mutation;
}

export async function listQueuedMutations(): Promise<OfflineMutation[]> {
  if (!offlineDb) return [];
  return offlineDb.mutations
    .where("status")
    .equals("queued")
    .sortBy("createdAt");
}

export async function listOfflineMutations(
  statuses?: OfflineMutationStatus[],
): Promise<OfflineMutation[]> {
  if (!offlineDb) return [];
  if (!statuses || statuses.length === 0) {
    return offlineDb.mutations.orderBy("createdAt").toArray();
  }

  const mutations = await offlineDb.mutations
    .where("status")
    .anyOf(statuses)
    .toArray();

  return mutations.sort((left, right) => left.createdAt - right.createdAt);
}

export async function getOfflineMutation(
  id: string,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  return offlineDb.mutations.get(id);
}

export async function updateOfflineMutationStatus(
  id: string,
  status: OfflineMutationStatus,
  options: {
    lastError?: string;
    syncResult?: unknown;
  } = {},
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;

  await offlineDb.mutations.update(id, {
    status,
    updatedAt: Date.now(),
    lastError: options.lastError,
    syncResult: options.syncResult,
  });
  notifyOfflineQueueChanged();

  return offlineDb.mutations.get(id);
}

export async function updateOfflineMutationPayload(
  id: string,
  payload: OfflineMutationPayload,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;

  await offlineDb.mutations.update(id, {
    payload,
    updatedAt: Date.now(),
  });
  notifyOfflineQueueChanged();

  return offlineDb.mutations.get(id);
}

function notifyOfflineQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}

// A File from <input type="file"> is backed by the on-disk file. iOS Safari and
// other WebKit builds can drop that backing store across a reload or tab
// eviction, which is exactly the offline -> reconnect -> retry window for a
// queued photo. Copy the bytes into an in-memory Blob so the persisted intent is
// owned by IndexedDB and survives that window instead of pointing at a file that
// may no longer be readable.
export async function createOfflinePhotoIntent(
  file: File,
): Promise<OfflinePhotoIntent> {
  const bytes = await file.arrayBuffer();
  return {
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: new Blob([bytes], { type: file.type }),
  };
}
