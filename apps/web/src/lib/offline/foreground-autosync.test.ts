import { describe, expect, it, vi } from "vitest";

import type { OfflineMutation } from "./queue";
import {
  FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
  FOREGROUND_AUTOSYNC_TRIGGERS,
  createForegroundAutosyncCoordinator,
  installForegroundAutosyncEventTriggers,
  type ForegroundAutosyncDependencies,
  type ForegroundAutosyncReceipt,
  type OfflineMutationSyncCandidate,
} from "./foreground-autosync";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const DOCUMENT_GENERATION = "opaque-document-generation";

function candidate(
  id: string,
  mode: OfflineMutationSyncCandidate["mode"] = "automatic",
): OfflineMutationSyncCandidate {
  return { id, revision: 1, mode };
}

function mutation(id: string, status: OfflineMutation["status"] = "syncing") {
  return {
    id,
    ownerUserId: OWNER,
    kind: "journal_entry",
    payload: {
      plantName: "Plant",
      title: "Title",
      body: "Body",
      entryDate: "2026-08-11",
      clientMutationId: id,
    },
    idempotencyKey: id,
    status,
    createdAt: 1,
    updatedAt: 2,
    syncLeaseExpiresAt: 60_002,
    queueRevision: 1,
    automaticAttemptConsumedRevision: status === "syncing" ? 1 : null,
  } satisfies OfflineMutation;
}

function dependencies(
  overrides: Partial<
    ForegroundAutosyncDependencies<{ readbackUrl: string }>
  > = {},
): ForegroundAutosyncDependencies<{ readbackUrl: string }> {
  return {
    listAutomaticCandidates: vi.fn(async () => []),
    recoverExpiredClaims: vi.fn(async () => 0),
    getManualCandidate: vi.fn(async () => null),
    admit: vi.fn(async () => "MATCH" as const),
    markAdmissionFailure: vi.fn(async () => 0),
    claimAutomatic: vi.fn(async (_owner, item) => mutation(item.id)),
    claimManual: vi.fn(async (_owner, item) => mutation(item.id)),
    syncClaimed: vi.fn(async () => ({ readbackUrl: "/garden" })),
    withLease: vi.fn(async (_key, _signal, operation) => operation()),
    monotonicNow: vi.fn(() => 10),
    ...overrides,
  };
}

describe("foreground autosync", () => {
  it("maps mount, queue, online, focus, and visible browser events to the exact automatic triggers", () => {
    const browserWindow = new EventTarget();
    const browserDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    browserDocument.visibilityState = "visible";
    const request = vi.fn();

    const cleanup = installForegroundAutosyncEventTriggers(
      { request },
      browserWindow,
      browserDocument,
    );
    browserWindow.dispatchEvent(new Event("overgarden:offline-queue-changed"));
    browserWindow.dispatchEvent(new Event("online"));
    browserWindow.dispatchEvent(new Event("focus"));
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    browserDocument.visibilityState = "hidden";
    browserDocument.dispatchEvent(new Event("visibilitychange"));

    expect(request.mock.calls.map(([trigger]) => trigger)).toEqual([
      "initial_scan",
      "queue_changed",
      "online",
      "window_focus",
      "document_visible",
    ]);
    cleanup();
    browserWindow.dispatchEvent(new Event("online"));
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("owns exactly six triggers and coalesces all of them into one owner/document drain", async () => {
    expect(FOREGROUND_AUTOSYNC_TRIGGERS).toEqual([
      "initial_scan",
      "queue_changed",
      "online",
      "window_focus",
      "document_visible",
      "manual",
    ]);

    const automatic = candidate("automatic");
    const manual = candidate("manual", "manual");
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => [automatic]),
      getManualCandidate: vi.fn(async (_owner, id) =>
        id === manual.id ? manual : null,
      ),
    });
    const receipts: ForegroundAutosyncReceipt[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onReceipt: (receipt) => receipts.push(receipt),
    });

    coordinator.request("initial_scan");
    coordinator.request("queue_changed");
    coordinator.request("online");
    coordinator.request("window_focus");
    coordinator.request("document_visible");
    const manualResult = coordinator.runManual("manual");

    await expect(manualResult).resolves.toEqual({ readbackUrl: "/garden" });
    await coordinator.whenIdle();

    expect(deps.withLease).toHaveBeenCalledTimes(1);
    expect(deps.admit).toHaveBeenCalledTimes(1);
    expect(deps.claimAutomatic).toHaveBeenCalledTimes(1);
    expect(deps.claimManual).toHaveBeenCalledTimes(1);
    expect(deps.syncClaimed).toHaveBeenCalledTimes(2);
    expect(receipts).toEqual([
      expect.objectContaining({
        state: "synced",
        triggers: [...FOREGROUND_AUTOSYNC_TRIGGERS],
        eligibleCount: 2,
        attemptedCount: 2,
        syncedCount: 2,
      }),
    ]);
  });

  it("returns before the lease, OVE-290 admission, claim, or network for an empty local queue", async () => {
    const deps = dependencies();
    const receipts: ForegroundAutosyncReceipt[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onReceipt: (receipt) => receipts.push(receipt),
    });

    coordinator.request("initial_scan");
    await coordinator.whenIdle();

    expect(deps.listAutomaticCandidates).toHaveBeenCalledWith(OWNER);
    expect(deps.withLease).not.toHaveBeenCalled();
    expect(deps.admit).not.toHaveBeenCalled();
    expect(deps.claimAutomatic).not.toHaveBeenCalled();
    expect(deps.syncClaimed).not.toHaveBeenCalled();
    expect(receipts).toEqual([
      expect.objectContaining({
        state: "empty_without_admission",
        eligibleCount: 0,
        attemptedCount: 0,
      }),
    ]);
  });

  it("passes the canonical 3000 ms admission budget and makes admission failure manual-only", async () => {
    const item = candidate("queued");
    let eligible = true;
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => (eligible ? [item] : [])),
      admit: vi.fn(async () => "MUTATION_ADMISSION_UNAVAILABLE" as const),
      markAdmissionFailure: vi.fn(async () => {
        eligible = false;
        return 1;
      }),
    });
    const admissionResults: string[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onAdmissionResult: (result) => admissionResults.push(result),
    });

    coordinator.request("online");
    await coordinator.whenIdle();
    coordinator.request("window_focus");
    await coordinator.whenIdle();

    expect(deps.admit).toHaveBeenCalledTimes(1);
    expect(deps.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        documentMutationGeneration: DOCUMENT_GENERATION,
        deadlineMs: FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(deps.markAdmissionFailure).toHaveBeenCalledWith(
      OWNER,
      [item],
      expect.objectContaining({ lastError: expect.any(String) }),
    );
    expect(deps.claimAutomatic).not.toHaveBeenCalled();
    expect(deps.syncClaimed).not.toHaveBeenCalled();
    expect(admissionResults).toEqual(["MUTATION_ADMISSION_UNAVAILABLE"]);
  });

  it("never relabels a transport completion after the admission deadline as MATCH", async () => {
    const item = candidate("late-match");
    const clock = [0, FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS + 1];
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => [item]),
      monotonicNow: vi.fn(() => clock.shift() ?? clock.at(-1) ?? 0),
    });
    const receipts: ForegroundAutosyncReceipt[] = [];
    const admissionResults: string[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onReceipt: (receipt) => receipts.push(receipt),
      onAdmissionResult: (result) => admissionResults.push(result),
    });

    coordinator.request("online");
    await coordinator.whenIdle();

    expect(deps.claimAutomatic).not.toHaveBeenCalled();
    expect(deps.markAdmissionFailure).toHaveBeenCalledTimes(1);
    expect(admissionResults).toEqual(["MUTATION_ADMISSION_UNAVAILABLE"]);
    expect(receipts[0]?.admissionDurationMs).toBe(
      FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
    );
  });

  it("turns an unexpected admission rejection into one consumed manual-recovery revision", async () => {
    const item = candidate("rejected-admission");
    let eligible = true;
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => (eligible ? [item] : [])),
      admit: vi.fn(async () => {
        throw new TypeError("Synthetic admission transport failure.");
      }),
      markAdmissionFailure: vi.fn(async () => {
        eligible = false;
        return 1;
      }),
    });
    const admissionResults: string[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onAdmissionResult: (result) => admissionResults.push(result),
    });

    coordinator.request("initial_scan");
    await coordinator.whenIdle();
    coordinator.request("online");
    await coordinator.whenIdle();

    expect(deps.markAdmissionFailure).toHaveBeenCalledOnce();
    expect(deps.claimAutomatic).not.toHaveBeenCalled();
    expect(deps.syncClaimed).not.toHaveBeenCalled();
    expect(deps.admit).toHaveBeenCalledOnce();
    expect(admissionResults).toEqual(["MUTATION_ADMISSION_UNAVAILABLE"]);
  });

  it("never schedules another automatic attempt after a transport or Retry-After failure", async () => {
    const item = candidate("retry-after");
    let eligible = true;
    const retryAfter = Object.assign(new Error("Retry later."), {
      status: 429,
      retryAfterSeconds: 120,
    });
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => (eligible ? [item] : [])),
      claimAutomatic: vi.fn(async (_owner, current) => {
        eligible = false;
        return mutation(current.id);
      }),
      syncClaimed: vi.fn(async () => {
        throw retryAfter;
      }),
    });
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
    });

    coordinator.request("queue_changed");
    await coordinator.whenIdle();
    coordinator.request("online");
    coordinator.request("document_visible");
    await coordinator.whenIdle();

    expect(deps.syncClaimed).toHaveBeenCalledTimes(1);
    expect(deps.admit).toHaveBeenCalledTimes(1);
  });

  it("stops a bounded sequential drain after partial success and fences every remaining row", async () => {
    const items = [candidate("first"), candidate("second"), candidate("third")];
    const failure = new Error("Synthetic second-row failure.");
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => items),
      syncClaimed: vi.fn(async (claimed) => {
        if (claimed.id === "second") throw failure;
        return { readbackUrl: "/garden" };
      }),
    });
    const receipts: ForegroundAutosyncReceipt[] = [];
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
      onReceipt: (receipt) => receipts.push(receipt),
    });

    coordinator.request("initial_scan");
    await coordinator.whenIdle();

    expect(deps.claimAutomatic).toHaveBeenCalledTimes(2);
    expect(deps.syncClaimed).toHaveBeenCalledTimes(2);
    expect(deps.markAdmissionFailure).toHaveBeenCalledWith(
      OWNER,
      [items[2]],
      expect.objectContaining({ lastError: expect.any(String) }),
    );
    expect(receipts).toEqual([
      expect.objectContaining({
        attemptedCount: 2,
        eligibleCount: 3,
        state: "manual_recovery",
        syncedCount: 1,
      }),
    ]);
  });

  it("allows each explicit manual action while a stale owner/document context gets zero effect", async () => {
    const manual = candidate("failed", "manual");
    const deps = dependencies({
      getManualCandidate: vi.fn(async () => manual),
    });
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
    });

    await expect(coordinator.runManual(manual.id)).resolves.toEqual({
      readbackUrl: "/garden",
    });
    await expect(coordinator.runManual(manual.id)).resolves.toEqual({
      readbackUrl: "/garden",
    });
    expect(deps.claimManual).toHaveBeenCalledTimes(2);
    expect(deps.syncClaimed).toHaveBeenCalledTimes(2);

    const staleDeps = dependencies({
      listAutomaticCandidates: vi.fn(async () => [candidate("stale")]),
    });
    const stale = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => false,
      dependencies: staleDeps,
    });
    stale.request("initial_scan");
    await stale.whenIdle();
    expect(staleDeps.admit).not.toHaveBeenCalled();
    expect(staleDeps.claimAutomatic).not.toHaveBeenCalled();
    expect(staleDeps.syncClaimed).not.toHaveBeenCalled();
  });

  it("cancels an in-flight admission without consuming or claiming the revision", async () => {
    const item = candidate("cancelled");
    let releaseAdmission: () => void = () => undefined;
    const deps = dependencies({
      listAutomaticCandidates: vi.fn(async () => [item]),
      admit: vi.fn(
        ({ signal }) =>
          new Promise<"MUTATION_ADMISSION_UNAVAILABLE">((resolve) => {
            const release = () => resolve("MUTATION_ADMISSION_UNAVAILABLE");
            releaseAdmission = release;
            signal.addEventListener("abort", release, { once: true });
          }),
      ),
    });
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: OWNER,
      documentMutationGeneration: DOCUMENT_GENERATION,
      isCurrent: () => true,
      dependencies: deps,
    });

    coordinator.request("initial_scan");
    await vi.waitFor(() => expect(deps.admit).toHaveBeenCalledTimes(1));
    coordinator.dispose();
    releaseAdmission();
    await coordinator.whenIdle();

    expect(deps.markAdmissionFailure).not.toHaveBeenCalled();
    expect(deps.claimAutomatic).not.toHaveBeenCalled();
    expect(deps.syncClaimed).not.toHaveBeenCalled();
  });
});
