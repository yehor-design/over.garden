import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOfflinePhotoIntent,
  enqueueOfflineMutation,
  getOfflineMutation,
  listOfflineMutations,
  listQueuedMutations,
  OFFLINE_QUEUE_CHANGED_EVENT,
  offlineDb,
  updateOfflineMutationPayload,
  updateOfflineMutationStatus,
  type OfflineJournalEntryPayload,
} from "./queue";

describe("offline queue", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
    await offlineDb?.drafts.clear();
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

  it("notifies workspace continuity surfaces after queue changes", async () => {
    vi.stubGlobal("window", new EventTarget());
    const listener = vi.fn();
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, listener);

    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Queued update" },
      idempotencyKey: "entry-event-1",
    });
    await updateOfflineMutationStatus(mutation.id, "failed", {
      lastError: "Offline",
    });

    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, listener);
    vi.unstubAllGlobals();
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

  it("copies file bytes into an in-memory blob for the offline photo intent", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const file = new File([bytes], "tomato.jpg", {
      type: "image/jpeg",
      lastModified: 1_700_000_000_000,
    });

    const intent = await createOfflinePhotoIntent(file);
    const blob = intent.blob;
    if (!blob) throw new Error("Expected a copied photo blob.");

    expect(intent.fileName).toBe("tomato.jpg");
    expect(intent.contentType).toBe("image/jpeg");
    expect(intent.size).toBe(file.size);
    expect(intent.lastModified).toBe(1_700_000_000_000);
    expect(blob).toBeInstanceOf(Blob);
    // The persisted blob must not be the file-backed File reference itself; iOS
    // Safari/WebKit can lose that backing store across reload/tab eviction.
    expect(blob).not.toBe(file);
    expect(blob instanceof File).toBe(false);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("keeps offline photo bytes readable after an IndexedDB round-trip", async () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    const file = new File([bytes], "pepper.webp", { type: "image/webp" });
    const payload: OfflineJournalEntryPayload = {
      spaceName: "Greenhouse",
      plantName: "Pepper",
      title: "Offline with photo",
      body: "Saved while connectivity dropped in the greenhouse.",
      entryDate: "2026-06-28",
      clientMutationId: "entry-photo-roundtrip",
      photoIntent: await createOfflinePhotoIntent(file),
    };

    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: "entry-photo-roundtrip",
    });

    const stored = await getOfflineMutation(mutation.id);
    const storedIntent = (stored?.payload as OfflineJournalEntryPayload)
      .photoIntent;
    const storedBlob = storedIntent?.blob;
    if (!storedBlob) throw new Error("Expected a persisted photo blob.");

    expect(storedIntent?.fileName).toBe("pepper.webp");
    expect(storedBlob).toBeInstanceOf(Blob);
    expect(storedBlob instanceof File).toBe(false);
    expect(new Uint8Array(await storedBlob.arrayBuffer())).toEqual(bytes);
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
