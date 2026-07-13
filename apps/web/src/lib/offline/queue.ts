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
export const OFFLINE_SYNC_LEASE_MS = 60_000;

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
  spaceId?: string | null;
  spaceName?: string;
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
  ownerUserId: string;
  kind: OfflineMutationKind;
  payload: OfflineMutationPayload;
  idempotencyKey: string;
  status: OfflineMutationStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  syncResult?: unknown;
  syncLeaseExpiresAt?: number | null;
}

export type OfflineDraftKind = "first_entry" | "follow_up_entry";

export interface OfflineDraftRecord<TPayload = unknown> {
  id: string;
  ownerUserId: string;
  kind: OfflineDraftKind;
  payload: TPayload;
  createdAt: number;
  updatedAt: number;
}

class OverGardenOfflineDb extends Dexie {
  mutations!: Table<OfflineMutation, string>;
  drafts!: Table<OfflineDraftRecord, [string, string]>;

  constructor() {
    super("overgarden-offline");
    this.version(1).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
    });
    this.version(2).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
      drafts: "id, kind, createdAt, updatedAt",
    });
    this.version(3)
      .stores({
        mutations:
          "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
        drafts:
          "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
      })
      .upgrade(async (transaction) => {
        // Legacy records had no owner boundary. They cannot be attributed safely,
        // so discard them instead of exposing one account's drafts to another.
        await Promise.all([
          transaction.table("mutations").clear(),
          transaction.table("drafts").clear(),
        ]);
      });
  }
}

export const offlineDb =
  typeof indexedDB === "undefined" ? undefined : new OverGardenOfflineDb();

export async function enqueueOfflineMutation(
  input: Pick<OfflineMutation, "ownerUserId" | "kind" | "payload"> & {
    idempotencyKey?: string;
  },
): Promise<OfflineMutation> {
  if (!offlineDb) {
    throw new Error("Offline queue is only available when IndexedDB exists.");
  }

  const ownerUserId = requireOwnerUserId(input.ownerUserId);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const result = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    async () => {
      const now = Date.now();
      const existing = await offlineDb.mutations
        .where("[ownerUserId+idempotencyKey]")
        .equals([ownerUserId, idempotencyKey])
        .first();

      if (existing) {
        if (existing.status === "queued" || existing.status === "failed") {
          const updated: OfflineMutation = {
            ...existing,
            payload: input.payload,
            status: "queued",
            updatedAt: now,
            lastError: undefined,
            syncLeaseExpiresAt: null,
          };
          await offlineDb.mutations.put(updated);
          return { mutation: updated, changed: true };
        }

        return { mutation: existing, changed: false };
      }

      const mutation: OfflineMutation = {
        id: crypto.randomUUID(),
        ownerUserId,
        kind: input.kind,
        payload: input.payload,
        idempotencyKey,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        syncLeaseExpiresAt: null,
      };

      await offlineDb.mutations.add(mutation);
      return { mutation, changed: true };
    },
  );

  if (result.changed) notifyOfflineQueueChanged();
  return result.mutation;
}

export async function listQueuedMutations(
  ownerUserId: string,
): Promise<OfflineMutation[]> {
  return listOfflineMutations(ownerUserId, ["queued"]);
}

export async function listOfflineMutations(
  ownerUserId: string,
  statuses?: OfflineMutationStatus[],
): Promise<OfflineMutation[]> {
  if (!offlineDb) return [];
  const owner = requireOwnerUserId(ownerUserId);
  const mutations = await offlineDb.mutations
    .where("ownerUserId")
    .equals(owner)
    .filter(
      (mutation) =>
        !statuses ||
        statuses.length === 0 ||
        statuses.includes(mutation.status),
    )
    .toArray();

  return mutations.sort((left, right) => left.createdAt - right.createdAt);
}

export async function getOfflineMutation(
  ownerUserId: string,
  id: string,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const mutation = await offlineDb.mutations.get(id);
  return mutation?.ownerUserId === requireOwnerUserId(ownerUserId)
    ? mutation
    : undefined;
}

export async function updateOfflineMutationStatus(
  ownerUserId: string,
  id: string,
  status: OfflineMutationStatus,
  options: {
    lastError?: string;
    syncResult?: unknown;
  } = {},
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const updated = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    async () => {
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next: OfflineMutation = {
        ...mutation,
        status,
        updatedAt: Date.now(),
        lastError: options.lastError,
        syncResult: options.syncResult,
        syncLeaseExpiresAt:
          status === "syncing" ? Date.now() + OFFLINE_SYNC_LEASE_MS : null,
      };
      await offlineDb.mutations.put(next);
      return next;
    },
  );
  if (!updated) return undefined;
  notifyOfflineQueueChanged();
  return updated;
}

export async function updateOfflineMutationPayload(
  ownerUserId: string,
  id: string,
  payload: OfflineMutationPayload,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const updated = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    async () => {
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next = { ...mutation, payload, updatedAt: Date.now() };
      await offlineDb.mutations.put(next);
      return next;
    },
  );
  if (!updated) return undefined;
  notifyOfflineQueueChanged();
  return updated;
}

export async function claimOfflineMutationForSync(
  ownerUserId: string,
  id: string,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const now = Date.now();
  const claimed = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    async () => {
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      if (mutation.status === "synced") return undefined;
      if (
        mutation.status === "syncing" &&
        (mutation.syncLeaseExpiresAt ?? 0) > now
      ) {
        return undefined;
      }

      const next: OfflineMutation = {
        ...mutation,
        status: "syncing",
        updatedAt: now,
        lastError: undefined,
        syncLeaseExpiresAt: now + OFFLINE_SYNC_LEASE_MS,
      };
      await offlineDb.mutations.put(next);
      return next;
    },
  );
  if (claimed) notifyOfflineQueueChanged();
  return claimed;
}

export async function completeOfflineMutation(
  ownerUserId: string,
  id: string,
  options: {
    payload: OfflineMutationPayload;
    syncResult: unknown;
  },
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const completed = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    async () => {
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next: OfflineMutation = {
        ...mutation,
        payload: options.payload,
        status: "synced",
        updatedAt: Date.now(),
        lastError: undefined,
        syncResult: options.syncResult,
        syncLeaseExpiresAt: null,
      };
      await offlineDb.mutations.put(next);
      return next;
    },
  );
  if (completed) notifyOfflineQueueChanged();
  return completed;
}

function requireOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) throw new Error("Offline data requires an owner user id.");
  return normalized;
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
