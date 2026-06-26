"use client";

import Dexie, { type Table } from "dexie";

export type OfflineMutationStatus = "queued" | "syncing" | "synced" | "failed";

export interface OfflineMutation {
  id: string;
  kind: "journal_entry" | "photo_upload";
  payload: unknown;
  idempotencyKey: string;
  status: OfflineMutationStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
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
  typeof window === "undefined" ? undefined : new OverGardenOfflineDb();

export async function enqueueOfflineMutation(
  input: Pick<OfflineMutation, "kind" | "payload"> & { idempotencyKey?: string },
): Promise<OfflineMutation> {
  if (!offlineDb) {
    throw new Error("Offline queue is only available in the browser.");
  }

  const now = Date.now();
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  await offlineDb.mutations.add(mutation);
  return mutation;
}

export async function listQueuedMutations(): Promise<OfflineMutation[]> {
  if (!offlineDb) return [];
  return offlineDb.mutations.where("status").equals("queued").sortBy("createdAt");
}
