import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimOfflineMutationForSync,
  createOfflinePhotoIntent,
  enqueueOfflineMutation as enqueueOwnedOfflineMutation,
  getOfflineMutation as getOwnedOfflineMutation,
  listOfflineMutations as listOwnedOfflineMutations,
  listOfflineMutationSummaries,
  listQueuedMutations as listOwnedQueuedMutations,
  OFFLINE_QUEUE_CHANGED_EVENT,
  offlineDb,
  settleClaimedOfflineMutationFailure,
  updateOfflineMutationPayload as updateOwnedOfflineMutationPayload,
  updateOfflineMutationStatus as updateOwnedOfflineMutationStatus,
  type OfflineJournalEntryPayload,
} from "./queue";
import {
  hydrateOwnerOfflineActivitySession,
  pauseOwnerOfflineActivity,
} from "./owner-session-lifecycle";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";

function enqueueOfflineMutation(
  input: Omit<
    Parameters<typeof enqueueOwnedOfflineMutation>[0],
    "ownerUserId"
  > & { ownerUserId?: string },
) {
  return enqueueOwnedOfflineMutation({
    ...input,
    ownerUserId: input.ownerUserId ?? OWNER_A,
  });
}

function getOfflineMutation(id: string) {
  return getOwnedOfflineMutation(OWNER_A, id);
}

function listOfflineMutations(
  statuses?: Parameters<typeof listOwnedOfflineMutations>[1],
) {
  return listOwnedOfflineMutations(OWNER_A, statuses);
}

function listQueuedMutations() {
  return listOwnedQueuedMutations(OWNER_A);
}

function updateOfflineMutationStatus(
  id: string,
  status: Parameters<typeof updateOwnedOfflineMutationStatus>[2],
  options?: Parameters<typeof updateOwnedOfflineMutationStatus>[3],
) {
  return updateOwnedOfflineMutationStatus(OWNER_A, id, status, options);
}

function updateOfflineMutationPayload(
  id: string,
  payload: Parameters<typeof updateOwnedOfflineMutationPayload>[2],
) {
  return updateOwnedOfflineMutationPayload(OWNER_A, id, payload);
}

describe("offline queue", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
    await offlineDb?.mutationSummaries.clear();
    await offlineDb?.drafts.clear();
    await offlineDb?.draftSummaries.clear();
    await offlineDb?.ownerActivity.clear();
    await hydrateOwnerOfflineActivitySession(
      OWNER_A,
      "test-session-generation-owner-a-1234",
    );
    await hydrateOwnerOfflineActivitySession(
      OWNER_B,
      "test-session-generation-owner-b-5678",
    );
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

  it("keeps the workspace summary paired, bounded, and free of payload fields", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: {
        target: "plant_object_entry",
        plantObjectId: "object-summary",
        title: "Private queued title",
        body: "Private queued body",
        entryDate: "2026-08-01",
        clientMutationId: "private-summary-key",
        photoIntent: {
          fileName: "private.jpg",
          contentType: "image/jpeg",
          size: 1,
          blob: new Blob(["private photo bytes"], { type: "image/jpeg" }),
        },
      },
      idempotencyKey: "private-summary-key",
    });

    const page = await listOfflineMutationSummaries(OWNER_A);
    const summary = page.items[0];

    expect(summary).toEqual({
      id: mutation.id,
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      status: "queued",
      workspaceVisible: 1,
      createdAt: mutation.createdAt,
      updatedAt: mutation.updatedAt,
      target: "plant_object_entry",
      targetObjectId: "object-summary",
      targetSpaceId: null,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /Private queued|private photo|private-summary-key|payload|blob/i,
    );

    await updateOfflineMutationStatus(mutation.id, "synced", {
      syncResult: { privateReceipt: "never projected" },
    });
    expect(await listOfflineMutationSummaries(OWNER_A)).toEqual({
      items: [],
      hasMore: false,
      page: 1,
      pageSize: 24,
    });
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

  it("isolates mutations by owner while allowing the same idempotency key", async () => {
    const ownerAMutation = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: { body: "Owner A private draft" },
      idempotencyKey: "shared-client-key",
    });
    const ownerBMutation = await enqueueOfflineMutation({
      ownerUserId: OWNER_B,
      kind: "journal_entry",
      payload: { body: "Owner B private draft" },
      idempotencyKey: "shared-client-key",
    });

    expect(await listOwnedOfflineMutations(OWNER_A)).toEqual([ownerAMutation]);
    expect(await listOwnedOfflineMutations(OWNER_B)).toEqual([ownerBMutation]);
    expect(
      await getOwnedOfflineMutation(OWNER_B, ownerAMutation.id),
    ).toBeUndefined();
  });

  it("atomically deduplicates concurrent enqueue attempts for one owner", async () => {
    const mutations = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        enqueueOfflineMutation({
          ownerUserId: OWNER_A,
          kind: "journal_entry",
          payload: { body: `Draft ${index}` },
          idempotencyKey: "concurrent-client-key",
        }),
      ),
    );
    const stored = await listOwnedOfflineMutations(OWNER_A);

    expect(new Set(mutations.map((mutation) => mutation.id))).toHaveLength(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.idempotencyKey).toBe("concurrent-client-key");
  });

  it("prevents parallel sync claims and recovers an expired sync lease", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Lease-protected update" },
      idempotencyKey: "lease-client-key",
    });

    const firstClaim = await claimOfflineMutationForSync(OWNER_A, mutation.id);
    const parallelClaim = await claimOfflineMutationForSync(
      OWNER_A,
      mutation.id,
    );

    expect(firstClaim?.status).toBe("syncing");
    expect(parallelClaim).toBeUndefined();

    await offlineDb?.mutations.update(mutation.id, {
      status: "syncing",
      syncLeaseExpiresAt: Date.now() - 1,
    });
    const recovered = await claimOfflineMutationForSync(OWNER_A, mutation.id);

    expect(recovered?.status).toBe("syncing");
    expect(recovered?.syncLeaseExpiresAt).toBeGreaterThan(Date.now());
  });

  it("settles only an already-claimed sync while the owner is preparing sign-out", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Claimed before sign-out" },
      idempotencyKey: "settle-under-pause-key",
    });
    const claimed = await claimOfflineMutationForSync(OWNER_A, mutation.id);
    if (!claimed) throw new Error("Expected a claimed mutation.");
    const pauseHandle = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-settle-sync-preparing-1234",
      sessionGeneration: "test-session-generation-owner-a-1234",
    });

    await expect(
      updateOwnedOfflineMutationStatus(OWNER_A, mutation.id, "failed"),
    ).rejects.toThrow("paused for sign-out");
    const settled = await settleClaimedOfflineMutationFailure(
      OWNER_A,
      mutation.id,
      claimed,
      {
        lastError: `Sync\u0000 aborted ${"x".repeat(300)}`,
      },
    );

    expect(settled?.status).toBe("failed");
    expect(settled?.syncLeaseExpiresAt).toBeNull();
    expect(settled?.lastError).not.toContain("\u0000");
    expect(settled?.lastError).toHaveLength(160);
    await pauseHandle.resume();
  });

  it("does not let a stale sync claim settle a newer lease or cross commit_pending", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Lease race" },
      idempotencyKey: "stale-settlement-key",
    });
    const staleClaim = await claimOfflineMutationForSync(OWNER_A, mutation.id);
    if (!staleClaim) throw new Error("Expected the first claim.");
    await offlineDb?.mutations.update(mutation.id, {
      syncLeaseExpiresAt: Date.now() - 1,
      updatedAt: staleClaim.updatedAt + 1,
    });
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
    const currentClaim = await claimOfflineMutationForSync(
      OWNER_A,
      mutation.id,
    );
    nowSpy.mockRestore();
    if (!currentClaim) throw new Error("Expected the recovered claim.");

    await expect(
      settleClaimedOfflineMutationFailure(OWNER_A, mutation.id, staleClaim, {
        lastError: "Stale abort",
      }),
    ).resolves.toBeUndefined();
    expect((await getOfflineMutation(mutation.id))?.status).toBe("syncing");

    const pauseHandle = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-settle-sync-commit-1234",
      sessionGeneration: "test-session-generation-owner-a-1234",
    });
    await pauseHandle.promoteToCommitFence();
    await expect(
      settleClaimedOfflineMutationFailure(OWNER_A, mutation.id, currentClaim, {
        lastError: "Must stay fenced",
      }),
    ).rejects.toThrow("paused for sign-out");
    expect((await getOfflineMutation(mutation.id))?.status).toBe("syncing");
    await pauseHandle.resume();
  });

  it("backfills payload-free summary rows while upgrading a version 4 local database", async () => {
    if (!offlineDb) return;

    offlineDb.close();
    await offlineDb.delete();

    const legacy = new Dexie("overgarden-offline");
    legacy.version(4).stores({
      mutations:
        "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
      drafts:
        "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
      ownerActivity: "ownerUserId, expiresAt",
    });
    await legacy.open();
    await legacy.table("drafts").add({
      id: "follow-up-entry:legacy-object",
      ownerUserId: OWNER_A,
      kind: "follow_up_entry",
      createdAt: 1,
      updatedAt: 2,
      payload: {
        clientMutationId: "legacy-private-draft",
        plantObjectId: "legacy-object",
        draft: {
          title: "Legacy private title",
          body: "Legacy private body",
          entryDate: "2026-08-01",
        },
        photoIntent: null,
      },
    });
    await legacy.table("mutations").add({
      id: "legacy-mutation",
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      idempotencyKey: "legacy-private-mutation",
      status: "failed",
      createdAt: 3,
      updatedAt: 4,
      payload: {
        target: "plant_object_entry",
        plantObjectId: "legacy-object",
        title: "Legacy private title",
        body: "Legacy private body",
        entryDate: "2026-08-01",
        clientMutationId: "legacy-private-mutation",
      },
    });
    legacy.close();

    await offlineDb.open();
    const [draft, mutation] = await Promise.all([
      offlineDb.draftSummaries.get([OWNER_A, "follow-up-entry:legacy-object"]),
      offlineDb.mutationSummaries.get([OWNER_A, "legacy-mutation"]),
    ]);

    expect(draft).toMatchObject({
      ownerUserId: OWNER_A,
      targetObjectId: "legacy-object",
      entryDate: "2026-08-01",
    });
    expect(mutation).toMatchObject({
      ownerUserId: OWNER_A,
      status: "failed",
      workspaceVisible: 1,
      targetObjectId: "legacy-object",
    });
    expect(JSON.stringify({ draft, mutation })).not.toMatch(
      /Legacy private|legacy-private|payload|body/i,
    );
  });
});
