"use client";

import Dexie, { type Table } from "dexie";

import type { EntrySyncStatus } from "@/db/schema";

export type OfflineMutationStatus = "queued" | "syncing" | "synced" | "failed";
export type OfflineMutationKind = "journal_entry" | "photo_upload";

export interface OfflinePhotoIntent {
  fileName: string;
  contentType: string;
  size: number;
  lastModified?: number;
  blob?: Blob;
}

export interface OfflineJournalEntryPayload {
  spaceName: string;
  plantName: string;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  title: string;
  body: string;
  entryDate: string;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  clientMutationId: string;
  syncStatus?: EntrySyncStatus;
  photoIntent?: OfflinePhotoIntent | null;
  processedMediaAssetId?: string | null;
}

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

class OverGardenOfflineDb extends Dexie {
  mutations!: Table<OfflineMutation, string>;

  constructor() {
    super("overgarden-offline");
    this.version(1).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
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

  return offlineDb.mutations.get(id);
}
