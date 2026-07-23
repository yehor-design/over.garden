import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimOfflineMutationForSync,
  completeOfflineMutation,
  enqueueOfflineMutation,
  listOfflineMutations,
  OFFLINE_QUEUE_CHANGED_EVENT,
  offlineDb,
  OwnerOfflineActivityPausedError,
  updateOfflineMutationPayload,
  updateOfflineMutationStatus,
  type OfflineDraftRecord,
  type OfflineJournalEntryPayload,
} from "./queue";
import {
  deleteOfflineDraft,
  OFFLINE_DRAFTS_CHANGED_EVENT,
  upsertOfflineDraft,
  type FirstEntryDraftPayload,
} from "./drafts";
import {
  finalizeOwnerOfflineActivityForSignedOut,
  finalizeOwnerOfflineActivityForSessionChange,
  hydrateOwnerOfflineActivitySession,
  pauseOwnerOfflineActivity,
  purgeErasedOwnerOfflineStore,
  purgeUnsyncedOwnerData,
  registerOwnerPreviewObjectUrl,
  runOwnerSyncAttempt,
  summarizeUnsyncedOwnerData,
  type OwnerOfflineActivityPauseHandle,
} from "./owner-session-lifecycle";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";

const pauseHandles: OwnerOfflineActivityPauseHandle[] = [];

describe("owner offline session lifecycle", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
    await offlineDb?.drafts.clear();
    await offlineDb?.ownerActivity.clear();
    await hydrateOwnerOfflineActivitySession(
      OWNER_A,
      "test-session-generation-owner-a-1234",
    );
    await hydrateOwnerOfflineActivitySession(
      OWNER_B,
      "test-session-generation-owner-b-5678",
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await Promise.allSettled(
      pauseHandles.splice(0).map((handle) => handle.resume()),
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("summarizes only the active owner's unsynced status classes", async () => {
    await upsertOfflineDraft({
      ownerUserId: OWNER_A,
      id: "first-entry",
      kind: "first_entry",
      payload: firstEntryDraftPayload("Owner A private draft"),
    });
    await upsertOfflineDraft({
      ownerUserId: OWNER_B,
      id: "first-entry",
      kind: "first_entry",
      payload: firstEntryDraftPayload("Owner B private draft"),
    });

    const queued = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("queued-private"),
      idempotencyKey: "queued-a",
    });
    const syncing = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("syncing-private"),
      idempotencyKey: "syncing-a",
    });
    await updateOfflineMutationStatus(OWNER_A, syncing.id, "syncing");
    const failed = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("failed-private"),
      idempotencyKey: "failed-a",
    });
    await updateOfflineMutationStatus(OWNER_A, failed.id, "failed", {
      lastError: "private adapter failure",
    });
    const synced = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("synced-private"),
      idempotencyKey: "synced-a",
    });
    await updateOfflineMutationStatus(OWNER_A, synced.id, "synced");
    await enqueueOfflineMutation({
      ownerUserId: OWNER_B,
      kind: "journal_entry",
      payload: journalPayload("owner-b-private"),
      idempotencyKey: "queued-b",
    });

    const summary = await summarizeUnsyncedOwnerData(OWNER_A);

    expect(summary).toEqual({
      hasUnsyncedData: true,
      totalCount: 4,
      draftCount: 1,
      mutationCount: 3,
      mediaCount: 0,
      statusCounts: { queued: 1, syncing: 1, failed: 1 },
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /private|adapter|owner-b|00000000|queued-a|synced-a/i,
    );
    expect(queued.status).toBe("queued");
  });

  it("atomically purges owner A drafts, unsynced mutations, and nested media only", async () => {
    const inlineBlobs = Array.from(
      { length: 10 },
      (_, index) => new Blob([`inline-${index}`], { type: "image/jpeg" }),
    );
    const futureStructuredDraft: OfflineDraftRecord = {
      ownerUserId: OWNER_A,
      id: "structured-entry",
      kind: "first_entry",
      payload: {
        document: {
          version: 1,
          generation: 9,
          blocks: inlineBlobs.map((blob, index) => ({
            id: `block-${index}`,
            type: "image",
            data: { blob, caption: `private caption ${index}` },
          })),
        },
        cover: {
          mode: "separate",
          blob: new Blob(["cover-private"], { type: "image/webp" }),
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await offlineDb!.drafts.put(futureStructuredDraft);
    await offlineDb!.drafts.put({
      ...futureStructuredDraft,
      ownerUserId: OWNER_B,
      payload: { body: "Owner B survives" },
    });

    const queued = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: {
        ...journalPayload("A queued body"),
        photoIntent: {
          fileName: "private-a.jpg",
          contentType: "image/jpeg",
          size: 7,
          blob: new Blob(["private"], { type: "image/jpeg" }),
        },
      },
      idempotencyKey: "purge-queued-a",
    });
    const failed = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("A failed body"),
      idempotencyKey: "purge-failed-a",
    });
    await updateOfflineMutationStatus(OWNER_A, failed.id, "failed");
    const synced = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("redacted after sync"),
      idempotencyKey: "preserve-synced-a",
    });
    await updateOfflineMutationStatus(OWNER_A, synced.id, "synced", {
      syncResult: { readbackUrl: "/garden/objects/safe" },
    });
    await enqueueOfflineMutation({
      ownerUserId: OWNER_B,
      kind: "journal_entry",
      payload: journalPayload("Owner B queued body"),
      idempotencyKey: "preserve-queued-b",
    });

    const summary = await summarizeUnsyncedOwnerData(OWNER_A);
    expect(summary.mediaCount).toBe(12);
    expect(JSON.stringify(summary)).not.toMatch(
      /inline|cover|caption|private-a|\.jpg|block-/i,
    );

    vi.stubGlobal("window", new EventTarget());
    const draftsChanged = vi.fn();
    const queueChanged = vi.fn();
    window.addEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, draftsChanged);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, queueChanged);
    const draftsClear = vi.spyOn(offlineDb!.drafts, "clear");
    const mutationsClear = vi.spyOn(offlineDb!.mutations, "clear");
    const handle = await trackedPause(OWNER_A);
    await handle.waitForSyncDrain();

    const result = await purgeUnsyncedOwnerData(OWNER_A, handle);

    expect(result).toEqual({ draftCount: 1, mutationCount: 2, totalCount: 3 });
    expect(
      await offlineDb!.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).toBe(0);
    expect(
      await offlineDb!.drafts.where("ownerUserId").equals(OWNER_B).count(),
    ).toBe(1);
    expect(await listOfflineMutations(OWNER_A)).toEqual([
      expect.objectContaining({ id: synced.id, status: "synced" }),
    ]);
    expect(await listOfflineMutations(OWNER_B)).toHaveLength(1);
    expect(await offlineDb!.mutations.get(queued.id)).toBeUndefined();
    expect(draftsClear).not.toHaveBeenCalled();
    expect(mutationsClear).not.toHaveBeenCalled();
    expect(draftsChanged).toHaveBeenCalledTimes(1);
    expect(queueChanged).toHaveBeenCalledTimes(1);
  });

  it("purges all erased-owner offline rows including cover intents without a session fence", async () => {
    await upsertOfflineDraft({
      id: "erased-owner-cover-draft",
      kind: "first_entry",
      ownerUserId: OWNER_A,
      payload: {
        ...firstEntryDraftPayload("erased cover draft"),
        cover: {
          mode: "separate",
          photoIntent: {
            fileName: "cover-a.webp",
            contentType: "image/webp",
            size: 12,
            blob: new Blob(["cover-private"], { type: "image/webp" }),
          },
        },
      },
    });
    await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: {
        ...journalPayload("erased cover mutation"),
        cover: {
          mode: "separate",
          photoIntent: {
            fileName: "mutation-cover.webp",
            contentType: "image/webp",
            size: 8,
            blob: new Blob(["mutation-cover"], { type: "image/webp" }),
          },
        },
      },
      idempotencyKey: "erased-cover-mutation",
    });

    const result = await purgeErasedOwnerOfflineStore(OWNER_A);

    expect(result.totalCount).toBeGreaterThan(0);
    expect(
      await offlineDb!.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).toBe(0);
    expect(
      await offlineDb!.mutations.where("ownerUserId").equals(OWNER_A).count(),
    ).toBe(0);
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toBeUndefined();
  });

  it("rolls back every deletion and publishes no event when purge fails", async () => {
    await offlineDb!.drafts.put({
      ownerUserId: OWNER_A,
      id: "rollback-draft",
      kind: "follow_up_entry",
      payload: { body: "must survive rollback" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("must survive rollback"),
      idempotencyKey: "rollback-mutation",
    });
    vi.stubGlobal("window", new EventTarget());
    const draftsChanged = vi.fn();
    const queueChanged = vi.fn();
    window.addEventListener(OFFLINE_DRAFTS_CHANGED_EVENT, draftsChanged);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, queueChanged);
    const where = vi.spyOn(offlineDb!.mutations, "where");
    where.mockImplementationOnce(() => {
      throw new Error("forced purge failure");
    });
    const handle = await trackedPause(OWNER_A);

    await expect(purgeUnsyncedOwnerData(OWNER_A, handle)).rejects.toThrow(
      "forced purge failure",
    );
    where.mockRestore();

    expect(
      await offlineDb!.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).toBe(1);
    expect(await listOfflineMutations(OWNER_A)).toHaveLength(1);
    expect(draftsChanged).not.toHaveBeenCalled();
    expect(queueChanged).not.toHaveBeenCalled();
  });

  it("atomically rejects an old-session purge after same-owner reauthentication", async () => {
    await upsertOfflineDraft({
      ownerUserId: OWNER_A,
      id: "old-session-draft",
      kind: "first_entry",
      payload: firstEntryDraftPayload("old session draft"),
    });
    const handle = await trackedPause(OWNER_A);
    await offlineDb!.ownerActivity.put({
      ownerUserId: OWNER_A,
      sessionGeneration: "session-generation-new-login-5678",
      lifecycle: "active",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    await offlineDb!.drafts.put({
      ownerUserId: OWNER_A,
      id: "new-session-draft",
      kind: "follow_up_entry",
      payload: { body: "new session draft" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      purgeUnsyncedOwnerData(OWNER_A, handle),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
    expect(
      await offlineDb!.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).toBe(2);
  });

  it("blocks owner A autosave, enqueue, and sync claims until token-safe resume", async () => {
    const queued = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("queued before pause"),
      idempotencyKey: "claim-before-pause",
    });
    const handle = await trackedPause(OWNER_A);

    await expect(
      upsertOfflineDraft({
        ownerUserId: OWNER_A,
        id: "first-entry",
        kind: "first_entry",
        payload: firstEntryDraftPayload("must not reappear"),
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("must not send"),
        idempotencyKey: "enqueue-during-pause",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
    await expect(
      claimOfflineMutationForSync(OWNER_A, queued.id),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_B,
        kind: "journal_entry",
        payload: journalPayload("owner B remains active"),
        idempotencyKey: "owner-b-during-a-pause",
      }),
    ).resolves.toEqual(expect.objectContaining({ ownerUserId: OWNER_B }));

    await handle.resume();
    await expect(
      upsertOfflineDraft({
        ownerUserId: OWNER_A,
        id: "first-entry",
        kind: "first_entry",
        payload: firstEntryDraftPayload("allowed after resume"),
      }),
    ).resolves.toEqual(expect.objectContaining({ ownerUserId: OWNER_A }));
  });

  it("closes the check-to-registration race before invoking sync work", async () => {
    let initialCheckStarted!: () => void;
    let releaseInitialCheck!: () => void;
    const initialCheck = new Promise<void>((resolve) => {
      initialCheckStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseInitialCheck = resolve;
    });
    const get = vi.spyOn(offlineDb!.ownerActivity, "get");
    get.mockImplementationOnce((async () => {
      initialCheckStarted();
      await release;
      return undefined;
    }) as never);
    const run = vi.fn(async () => "must-not-run");
    const attempt = runOwnerSyncAttempt(OWNER_A, run);
    await initialCheck;

    const handle = await trackedPause(OWNER_A);
    releaseInitialCheck();

    await expect(attempt).rejects.toBeInstanceOf(
      OwnerOfflineActivityPausedError,
    );
    await handle.waitForSyncDrain();
    expect(run).not.toHaveBeenCalled();
  });

  it("an older pause handle cannot resume a newer owner pause", async () => {
    const first = await trackedPause(OWNER_A);
    const second = await trackedPause(OWNER_A);

    await first.resume();

    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("still blocked by second pause"),
        idempotencyKey: "newer-pause-still-active",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);

    await second.resume();
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("allowed by newest resume"),
        idempotencyKey: "newest-pause-resumed",
      }),
    ).resolves.toEqual(expect.objectContaining({ ownerUserId: OWNER_A }));
  });

  it("keeps concurrent operations isolated and lets a commit fence dominate delayed cancellation", async () => {
    await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("establish activity generation"),
      idempotencyKey: "establish-generation",
    });
    const sessionGeneration = (
      await offlineDb!.ownerActivity.get(OWNER_A)
    )?.sessionGeneration;
    expect(sessionGeneration).toBeTruthy();

    const first = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-concurrent-first-1234",
      sessionGeneration,
    });
    const second = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-concurrent-second-5678",
      sessionGeneration,
    });
    pauseHandles.push(first, second);

    await second.promoteToCommitFence();
    await first.resume();
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({
        lifecycle: "active",
        operations: [
          expect.objectContaining({
            operationId: "op-concurrent-second-5678",
            phase: "commit_pending",
          }),
        ],
      }),
    );
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("commit pending stays blocked"),
        idempotencyKey: "commit-pending-blocked",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);

    await second.finalizeForSignedOut();
    await first.resume();
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({
        lifecycle: "signed_out_fence",
        operations: [],
      }),
    );
  });

  it("recovers an orphaned commit fence only after authoritative same-session hydration and grace", async () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-07-18T20:00:00.000Z"));
    const activity = await offlineDb!.ownerActivity.get(OWNER_A);
    const handle = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-orphaned-commit-1234",
      sessionGeneration: activity!.sessionGeneration,
    });
    pauseHandles.push(handle);
    await handle.promoteToCommitFence();

    now.mockReturnValue(Date.parse("2026-07-18T20:11:00.000Z"));
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("must remain blocked before auth hydration"),
        idempotencyKey: "orphan-before-hydration",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);

    await expect(
      hydrateOwnerOfflineActivitySession(
        OWNER_A,
        activity!.sessionGeneration,
      ),
    ).resolves.toBe("ready");
    // A real crashed initiator has no surviving module-local pause token. This
    // explicit resume clears the test process's retained handle to model that
    // new-document state after the durable authoritative recovery above.
    await handle.resume();
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("allowed after authoritative recovery"),
        idempotencyKey: "orphan-after-hydration",
      }),
    ).resolves.toEqual(expect.objectContaining({ ownerUserId: OWNER_A }));
  });

  it("uses token-safe hard-reload cleanup but authoritative signed-out cleanup", async () => {
    const first = await trackedPause(OWNER_A);
    const second = await trackedPause(OWNER_A);
    const operationIdsBefore = (
      (await offlineDb!.ownerActivity.get(OWNER_A))?.operations ?? []
    ).map((operation) => operation.operationId);
    expect(operationIdsBefore).toHaveLength(2);

    await first.finalizeForHardReload();
    const operationIdsAfter = (
      (await offlineDb!.ownerActivity.get(OWNER_A))?.operations ?? []
    ).map((operation) => operation.operationId);
    expect(operationIdsAfter).toHaveLength(1);
    expect(operationIdsBefore).toEqual(
      expect.arrayContaining(operationIdsAfter),
    );

    await first.finalizeForSignedOut();
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({
        lifecycle: "signed_out_fence",
        operations: [],
      }),
    );
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("must stay frozen until hard navigation"),
        idempotencyKey: "finalized-local-freeze",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);

    await first.resume();
    await second.resume();
    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("allowed after explicit resume"),
        idempotencyKey: "finalize-then-resume",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
  });

  it("finalizes a same-generation signed-out fence idempotently without a pause handle", async () => {
    const activity = await offlineDb!.ownerActivity.get(OWNER_A);
    expect(activity?.sessionGeneration).toBeTruthy();
    await finalizeOwnerOfflineActivityForSignedOut(
      OWNER_A,
      activity!.sessionGeneration,
    );
    await expect(
      finalizeOwnerOfflineActivityForSignedOut(
        OWNER_A,
        activity!.sessionGeneration,
      ),
    ).resolves.toBe("fenced");
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({
        lifecycle: "signed_out_fence",
        operations: [],
      }),
    );
  });

  it("distinguishes a fenced session change from an already-replaced generation", async () => {
    const activity = await offlineDb!.ownerActivity.get(OWNER_A);
    const generation = activity!.sessionGeneration;
    await expect(
      finalizeOwnerOfflineActivityForSessionChange(OWNER_A, generation),
    ).resolves.toBe("fenced");

    await offlineDb!.ownerActivity.put({
      ownerUserId: OWNER_A,
      sessionGeneration: "session-generation-already-replaced-3456",
      lifecycle: "active",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    await expect(
      finalizeOwnerOfflineActivityForSessionChange(OWNER_A, generation),
    ).resolves.toBe("generation_changed");
    await expect(
      finalizeOwnerOfflineActivityForSignedOut(OWNER_A, generation),
    ).resolves.toBe("generation_changed");
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({
        sessionGeneration: "session-generation-already-replaced-3456",
        lifecycle: "active",
      }),
    );
  });

  it("releases the current tab and allows durable cleanup to be retried", async () => {
    const handle = await trackedPause(OWNER_A);
    const get = vi.spyOn(offlineDb!.ownerActivity, "get");
    get.mockRejectedValueOnce(new Error("IndexedDB cleanup failed"));

    await expect(handle.resume()).rejects.toThrow("IndexedDB cleanup failed");
    get.mockRestore();

    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("local resume override"),
        idempotencyKey: "resume-after-cleanup-error",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);

    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toBeDefined();
    await expect(handle.resume()).resolves.toBeUndefined();
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({ lifecycle: "active", operations: [] }),
    );
  });

  it("aborts and drains owner A attempts without touching owner B", async () => {
    let ownerAStarted!: () => void;
    let ownerBStarted!: () => void;
    const ownerAReady = new Promise<void>((resolve) => {
      ownerAStarted = resolve;
    });
    const ownerBReady = new Promise<void>((resolve) => {
      ownerBStarted = resolve;
    });
    const ownerAAttempt = abortableAttempt(OWNER_A, ownerAStarted);
    const ownerBAttempt = abortableAttempt(OWNER_B, ownerBStarted);
    const ownerAOutcome = ownerAAttempt.catch((error: Error) => error.name);
    const ownerBOutcome = ownerBAttempt.catch((error: Error) => error.name);
    await Promise.all([ownerAReady, ownerBReady]);

    const handle = await trackedPause(OWNER_A);
    await handle.waitForSyncDrain();

    expect(await ownerAOutcome).toBe("AbortError");
    let ownerBSettled = false;
    void ownerBOutcome.then(() => {
      ownerBSettled = true;
    });
    await Promise.resolve();
    expect(ownerBSettled).toBe(false);

    const ownerBHandle = await trackedPause(OWNER_B);
    await ownerBHandle.waitForSyncDrain();
    expect(await ownerBOutcome).toBe("AbortError");
  });

  it("expires a stale cross-tab pause instead of permanently blocking work", async () => {
    await offlineDb!.ownerActivity.put(
      {
        ownerUserId: OWNER_A,
        pauseToken: "stale-token",
        pausedAt: Date.now() - 10_000,
        expiresAt: Date.now() - 1,
      } as never,
    );

    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("allowed after ttl"),
        idempotencyKey: "after-expired-pause",
      }),
    ).resolves.toEqual(expect.objectContaining({ ownerUserId: OWNER_A }));
    expect(await offlineDb!.ownerActivity.get(OWNER_A)).toEqual(
      expect.objectContaining({ lifecycle: "active", operations: [] }),
    );
  });

  it("rejects stale-document writes after the authenticated session generation changes", async () => {
    const current = await offlineDb!.ownerActivity.get(OWNER_A);
    const currentGeneration =
      current?.sessionGeneration ?? "session-generation-current-1234";
    await hydrateOwnerOfflineActivitySession(OWNER_A, currentGeneration);

    await offlineDb!.ownerActivity.put({
      ownerUserId: OWNER_A,
      sessionGeneration: "session-generation-new-5678",
      lifecycle: "active",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });

    await expect(
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("stale generation must not persist"),
        idempotencyKey: "stale-generation-write",
      }),
    ).rejects.toBeInstanceOf(OwnerOfflineActivityPausedError);
    await expect(
      hydrateOwnerOfflineActivitySession(
        OWNER_A,
        "session-generation-new-5678",
      ),
    ).resolves.toBe("document_session_changed");
  });

  it("guards every draft and mutation write against a stale document generation", async () => {
    const mutation = await enqueueOfflineMutation({
      ownerUserId: OWNER_A,
      kind: "journal_entry",
      payload: journalPayload("old generation mutation"),
      idempotencyKey: "old-generation-mutation",
    });
    await upsertOfflineDraft({
      ownerUserId: OWNER_A,
      id: "old-generation-draft",
      kind: "first_entry",
      payload: firstEntryDraftPayload("old generation draft"),
    });
    await offlineDb!.ownerActivity.put({
      ownerUserId: OWNER_A,
      sessionGeneration: "session-generation-reauthenticated-9012",
      lifecycle: "active",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });

    const staleWrites = [
      upsertOfflineDraft({
        ownerUserId: OWNER_A,
        id: "old-generation-draft",
        kind: "first_entry",
        payload: firstEntryDraftPayload("must not replace"),
      }),
      deleteOfflineDraft(OWNER_A, "old-generation-draft"),
      enqueueOfflineMutation({
        ownerUserId: OWNER_A,
        kind: "journal_entry",
        payload: journalPayload("must not enqueue"),
        idempotencyKey: "must-not-enqueue",
      }),
      updateOfflineMutationStatus(OWNER_A, mutation.id, "failed"),
      updateOfflineMutationPayload(
        OWNER_A,
        mutation.id,
        journalPayload("must not replace payload"),
      ),
      completeOfflineMutation(OWNER_A, mutation.id, {
        payload: journalPayload("must not complete"),
        syncResult: { readbackUrl: "/must-not-persist" },
      }),
    ];
    const outcomes = await Promise.allSettled(staleWrites);
    expect(outcomes).toHaveLength(6);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(
          OwnerOfflineActivityPausedError,
        );
      }
    }
    expect(
      await offlineDb!.drafts.get([OWNER_A, "old-generation-draft"]),
    ).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          draft: expect.objectContaining({ body: "old generation draft" }),
        }),
      }),
    );
    expect(await offlineDb!.mutations.get(mutation.id)).toEqual(
      expect.objectContaining({ status: "queued" }),
    );
  });

  it("revokes only the purged owner's registered Blob preview URLs", async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL });
    registerOwnerPreviewObjectUrl(OWNER_A, "blob:https://over.garden/a");
    registerOwnerPreviewObjectUrl(OWNER_B, "blob:https://over.garden/b");
    const handle = await trackedPause(OWNER_A);

    await purgeUnsyncedOwnerData(OWNER_A, handle);

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:https://over.garden/a");
  });
});

async function trackedPause(ownerUserId: string) {
  const handle = await pauseOwnerOfflineActivity(ownerUserId);
  pauseHandles.push(handle);
  return handle;
}

function abortableAttempt(ownerUserId: string, onStarted: () => void) {
  return runOwnerSyncAttempt(
    ownerUserId,
    (signal) =>
      new Promise<void>((_resolve, reject) => {
        onStarted();
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
}

function firstEntryDraftPayload(body: string): FirstEntryDraftPayload {
  return {
    clientMutationId: crypto.randomUUID(),
    draft: {
      spaceName: "Balcony",
      plantName: "Tomato",
      objectKind: "plant",
      title: "Private draft",
      body,
      entryDate: "2026-07-18",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "",
    selectedCatalogItem: null,
    userAddedCatalogName: null,
    activationSource: "direct_garden",
    photoIntent: null,
  };
}

function journalPayload(body: string): OfflineJournalEntryPayload {
  return {
    target: "first_plant_entry",
    spaceName: "Balcony",
    plantName: "Tomato",
    title: "Private update",
    body,
    entryDate: "2026-07-18",
    clientMutationId: crypto.randomUUID(),
  };
}
