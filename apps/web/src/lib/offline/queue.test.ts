import { beforeEach, describe, expect, it } from "vitest";

import {
  enqueueOfflineMutation,
  getOfflineMutation,
  listOfflineMutations,
  listQueuedMutations,
  offlineDb,
  updateOfflineMutationPayload,
  updateOfflineMutationStatus,
  type OfflineJournalEntryPayload,
} from "./queue";

describe("offline queue", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
  });

  it("stores queued mutations with idempotency keys", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Помідори чері" },
      idempotencyKey: "entry-1",
    });

    const queued = await listQueuedMutations();

    expect(mutation.status).toBe("queued");
    expect(mutation.idempotencyKey).toBe("entry-1");
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual({ body: "Помідори чері" });
  });

  it("updates queued payloads instead of duplicating the same idempotency key", async () => {
    await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Draft 1" },
      idempotencyKey: "entry-1",
    });

    const updated = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Draft 2" },
      idempotencyKey: "entry-1",
    });

    const queued = await listQueuedMutations();

    expect(updated.payload).toEqual({ body: "Draft 2" });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual({ body: "Draft 2" });
  });

  it("keeps failed entry payload and photo intent available for retry", async () => {
    const payload: OfflineJournalEntryPayload = {
      spaceName: "Balcony",
      plantName: "Cherry tomato",
      title: "First flowers",
      body: "Two new flower clusters.",
      entryDate: "2026-06-26",
      clientMutationId: "entry-1",
      photoIntent: {
        fileName: "tomato.jpg",
        contentType: "image/jpeg",
        size: 123,
        blob: new Blob(["photo"], { type: "image/jpeg" }),
      },
    };
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: "entry-1",
    });

    await updateOfflineMutationStatus(mutation.id, "syncing");
    await updateOfflineMutationStatus(mutation.id, "failed", {
      lastError: "Network failed.",
    });

    const failed = await getOfflineMutation(mutation.id);

    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toBe("Network failed.");
    expect(failed?.idempotencyKey).toBe("entry-1");
    expect(failed?.payload).toEqual(payload);
  });

  it("stores processed media asset id before the final entry sync", async () => {
    const payload: OfflineJournalEntryPayload = {
      spaceName: "Balcony",
      plantName: "Cherry tomato",
      title: "First flowers",
      body: "Two new flower clusters.",
      entryDate: "2026-06-26",
      clientMutationId: "entry-1",
      photoIntent: {
        fileName: "tomato.jpg",
        contentType: "image/jpeg",
        size: 123,
        blob: new Blob(["photo"], { type: "image/jpeg" }),
      },
    };
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: "entry-1",
    });

    await updateOfflineMutationPayload(mutation.id, {
      ...payload,
      processedMediaAssetId: "media-1",
    });
    await updateOfflineMutationStatus(mutation.id, "synced", {
      syncResult: { readbackUrl: "/garden/objects/object-1" },
    });

    const synced = await getOfflineMutation(mutation.id);
    const all = await listOfflineMutations(["synced"]);

    expect(
      (synced?.payload as OfflineJournalEntryPayload).processedMediaAssetId,
    ).toBe("media-1");
    expect(synced?.syncResult).toEqual({
      readbackUrl: "/garden/objects/object-1",
    });
    expect(all).toHaveLength(1);
  });
});
