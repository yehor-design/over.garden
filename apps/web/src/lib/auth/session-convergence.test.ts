import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireAuthenticatedSessionTabLease,
  createPreparationAcknowledgementBarrier,
  createPreparationRoundId,
  createSignOutOperationId,
  parseSessionConvergencePayload,
  publishCommittedSessionInvalidation,
  publishLocalExitCommitted,
  publishSignOutPreparation,
  publishSignOutPreparationCancelled,
  publishSignOutPreparationFailed,
  publishSignOutPreparationReceived,
  publishSignOutPreparationReady,
  SESSION_CONVERGENCE_SIGNALS,
  SESSION_CONVERGENCE_STORAGE_KEY,
  subscribeToSessionConvergence,
} from "./session-convergence";
import { SESSION_INVALIDATION_MARKER_STORAGE_KEY } from "./session-invalidation-marker";
import {
  getUnresolvedAuthorizationServeCounts,
  resetUnresolvedAuthorizationServeCountsForTests,
} from "./unresolved-authorization";

describe("session convergence signals", () => {
  beforeEach(() => resetUnresolvedAuthorizationServeCountsForTests());

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes lifecycle states without delivering them to the sender document", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionConvergence(listener);
    const operationId = createSignOutOperationId();
    const tabId = "tab-sender-document-1234";
    const preparationRoundId = createPreparationRoundId();

    const payloads = [
      publishSignOutPreparation(operationId, tabId, preparationRoundId),
      publishSignOutPreparationReceived(operationId, tabId, preparationRoundId),
      publishSignOutPreparationReady(operationId, tabId, preparationRoundId),
      publishSignOutPreparationFailed(operationId, tabId, preparationRoundId),
      publishSignOutPreparationCancelled(operationId, tabId),
      publishCommittedSessionInvalidation(operationId, tabId),
      publishLocalExitCommitted(operationId, tabId),
    ];

    expect(listener).not.toHaveBeenCalled();
    expect(payloads.map(({ signal }) => signal)).toEqual([
      SESSION_CONVERGENCE_SIGNALS.preparation,
      SESSION_CONVERGENCE_SIGNALS.received,
      SESSION_CONVERGENCE_SIGNALS.ready,
      SESSION_CONVERGENCE_SIGNALS.failed,
      SESSION_CONVERGENCE_SIGNALS.cancellation,
      SESSION_CONVERGENCE_SIGNALS.committed,
      SESSION_CONVERGENCE_SIGNALS.localExitCommitted,
    ]);
    expect(JSON.stringify(payloads)).not.toMatch(
      /user.?id|session.?id|account.?id|email|cookie|token/i,
    );

    unsubscribe();
  });

  it("delivers and deduplicates a bounded signal simulated from another tab", () => {
    const harness = installBrowserHarness();
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionConvergence(listener);

    publishSignOutPreparation(
      "op-sender-tab-1234",
      "tab-sender-tab-1234",
      "round-sender-tab-1234",
    );
    expect(listener).not.toHaveBeenCalled();

    const externalPayload = payload(
      SESSION_CONVERGENCE_SIGNALS.preparation,
      "op-external-tab-1234",
      "tab-external-tab-1234",
      "msg-external-tab-1234",
    );
    harness.emitStorage(SESSION_CONVERGENCE_STORAGE_KEY, externalPayload);
    harness.emitBroadcast(externalPayload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(externalPayload);
    unsubscribe();
  });

  it("sanitizes an allowlisted payload before delivering stored data", () => {
    const parsed = parseSessionConvergencePayload({
      ...payload(
        SESSION_CONVERGENCE_SIGNALS.committed,
        "op-external-tab-1234",
        "tab-external-tab-5678",
        "msg-external-tab-5678",
      ),
      userId: "must-not-survive",
      sessionId: "must-not-survive",
      privateContent: "must-not-survive",
    });

    expect(parsed).toEqual(
      payload(
        SESSION_CONVERGENCE_SIGNALS.committed,
        "op-external-tab-1234",
        "tab-external-tab-5678",
        "msg-external-tab-5678",
      ),
    );
    expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
  });

  it("uses a storage-safe fallback when BroadcastChannel is unavailable", () => {
    const harness = installBrowserHarness({ broadcast: false });
    const operationId = "op-storage-tab-1234";
    const tabId = "tab-storage-tab-1234";

    const result = publishCommittedSessionInvalidation(operationId, tabId);

    expect(harness.storage.getItem(SESSION_CONVERGENCE_STORAGE_KEY)).toBe(
      JSON.stringify(result),
    );
  });

  it("publishes bounded signals through both cross-tab transports", () => {
    const harness = installBrowserHarness();
    const result = publishCommittedSessionInvalidation(
      "op-transport-tab-1234",
      "tab-transport-tab-1234",
    );

    expect(harness.posted).toContainEqual(result);
    expect(harness.storage.getItem(SESSION_CONVERGENCE_STORAGE_KEY)).toBe(
      JSON.stringify(result),
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        "messageId",
        "operationId",
        "phaseRank",
        "preparationRoundId",
        "sentAt",
        "signal",
        "tabId",
        "version",
      ].sort(),
    );
  });

  it("commits the persistent invalidation marker before terminal broadcast", () => {
    const harness = installBrowserHarness();

    publishCommittedSessionInvalidation(
      "op-marker-order-tab-1234",
      "tab-marker-order-tab-1234",
    );

    expect(harness.markerAtBroadcast).toHaveLength(1);
    expect(harness.markerAtBroadcast[0]).toMatch(
      /^\{"v":1,"g":"[A-Za-z0-9_-]{22}"\}$/,
    );
  });

  it("publishes a payload-free local-exit signal without rewriting its marker", () => {
    const harness = installBrowserHarness();

    const result = publishLocalExitCommitted(
      "op-local-exit-tab-1234",
      "tab-local-exit-tab-1234",
    );

    expect(result.signal).toBe(SESSION_CONVERGENCE_SIGNALS.localExitCommitted);
    expect(result.preparationRoundId).toBeNull();
    expect(harness.markerAtBroadcast).toEqual([null]);
    expect(JSON.stringify(result)).not.toMatch(
      /user.?id|session.?id|account.?id|email|cookie|token/i,
    );
  });

  it("waits for every live remote tab and resolves only after exact ready acknowledgements", async () => {
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const remoteTabA = "tab-remote-ready-a-1234";
    const remoteTabB = "tab-remote-ready-b-1234";
    harness.putLiveLease(remoteTabA);
    harness.putLiveLease(remoteTabB);
    const operationId = "op-ready-quorum-1234";
    const preparationRoundId = "round-ready-quorum-1234";
    const barrier = createPreparationAcknowledgementBarrier(
      operationId,
      lease.tabId,
      preparationRoundId,
    );
    let resolved = false;
    void barrier.wait().then(() => {
      resolved = true;
    });

    expect(barrier.expectedTabCount).toBe(2);
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.received,
        operationId,
        remoteTabA,
        "msg-received-remote-a-1234",
        preparationRoundId,
      ),
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.ready,
        operationId,
        remoteTabA,
        "msg-ready-remote-a-1234",
        preparationRoundId,
      ),
    );
    await Promise.resolve();
    expect(resolved).toBe(false);

    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.received,
        operationId,
        remoteTabB,
        "msg-received-remote-b-1234",
        preparationRoundId,
      ),
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.ready,
        operationId,
        remoteTabB,
        "msg-ready-remote-b-1234",
        preparationRoundId,
      ),
    );
    await barrier.wait();
    expect(resolved).toBe(true);
    lease.release();
  });

  it("rejects an acknowledged peer failure and excludes a silent stale lease", async () => {
    vi.useFakeTimers();
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const remoteTab = "tab-remote-failed-1234";
    harness.putLiveLease(remoteTab);
    const failedBarrier = createPreparationAcknowledgementBarrier(
      "op-failed-quorum-1234",
      lease.tabId,
      "round-failed-quorum-1234",
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.received,
        "op-failed-quorum-1234",
        remoteTab,
        "msg-received-failed-remote-1234",
        "round-failed-quorum-1234",
      ),
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.failed,
        "op-failed-quorum-1234",
        remoteTab,
        "msg-failed-remote-1234",
        "round-failed-quorum-1234",
      ),
    );
    await expect(failedBarrier.wait()).rejects.toThrow(/could not prepare/i);

    const timeoutBarrier = createPreparationAcknowledgementBarrier(
      "op-timeout-quorum-1234",
      lease.tabId,
      "round-timeout-quorum-1234",
    );
    const timeoutResult = timeoutBarrier.wait();
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(timeoutResult).resolves.toBeUndefined();
    lease.release();
  });

  it("keeps every liveness-confirmed peer behind the existing ready-or-failed deadline", async () => {
    vi.useFakeTimers();
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const remoteTab = "tab-liveness-confirmed-1234";
    harness.putLiveLease(remoteTab);
    const barrier = createPreparationAcknowledgementBarrier(
      "op-liveness-confirmed-1234",
      lease.tabId,
      "round-liveness-confirmed-1234",
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.received,
        "op-liveness-confirmed-1234",
        remoteTab,
        "msg-liveness-confirmed-1234",
        "round-liveness-confirmed-1234",
      ),
    );

    const result = expect(barrier.wait()).rejects.toThrow(
      /not every active tab/i,
    );
    await vi.advanceTimersByTimeAsync(1_500 + 8_000);
    await result;
    lease.release();
  });

  it("serves sign-out with zero proven peers when the initiating presence lease cannot be confirmed", async () => {
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    harness.storage.removeItem(
      `overgarden:authenticated-session-tab:v1:${lease.tabId}`,
    );

    const barrier = createPreparationAcknowledgementBarrier(
      "op-missing-presence-1234",
      lease.tabId,
      "round-missing-presence-1234",
    );

    expect(barrier.expectedTabCount).toBe(0);
    await expect(barrier.wait()).resolves.toBeUndefined();
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([
      {
        owner: "session_presence",
        unresolvedClass: "session_unresolved",
        count: 1,
      },
    ]);
    lease.release();
  });

  it("ignores malformed and unrecognized cross-tab payloads", () => {
    expect(parseSessionConvergencePayload(null)).toBeNull();
    expect(
      parseSessionConvergencePayload({
        ...payload(
          SESSION_CONVERGENCE_SIGNALS.preparation,
          "op-external-tab-1234",
          "tab-external-tab-1234",
          "msg-external-tab-1234",
        ),
        signal: "another_account",
      }),
    ).toBeNull();
    expect(
      parseSessionConvergencePayload({
        ...payload(
          SESSION_CONVERGENCE_SIGNALS.committed,
          "op-external-tab-1234",
          "tab-external-tab-1234",
          "msg-external-tab-1234",
        ),
        messageId: "msg-unsafe id with spaces",
      }),
    ).toBeNull();
    expect(
      parseSessionConvergencePayload({
        ...payload(
          SESSION_CONVERGENCE_SIGNALS.preparation,
          "op-external-tab-1234",
          "tab-external-tab-1234",
          "msg-external-tab-1234",
        ),
        phaseRank: 2,
      }),
    ).toBeNull();
    expect(
      parseSessionConvergencePayload({
        ...payload(
          SESSION_CONVERGENCE_SIGNALS.preparation,
          "op-external-tab-1234",
          "tab-external-tab-1234",
          "msg-external-tab-1234",
        ),
        preparationRoundId: null,
      }),
    ).toBeNull();
    expect(
      parseSessionConvergencePayload({
        ...payload(
          SESSION_CONVERGENCE_SIGNALS.committed,
          "op-external-tab-1234",
          "tab-external-tab-1234",
          "msg-external-tab-1234",
        ),
        preparationRoundId: "round-terminal-must-be-null-1234",
      }),
    ).toBeNull();
  });

  it("ignores delayed readiness from an earlier preparation round", async () => {
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const remoteTab = "tab-round-remote-1234";
    const operationId = "op-round-quorum-1234";
    const currentRound = "round-current-quorum-1234";
    harness.putLiveLease(remoteTab);
    const barrier = createPreparationAcknowledgementBarrier(
      operationId,
      lease.tabId,
      currentRound,
    );
    let resolved = false;
    void barrier.wait().then(() => {
      resolved = true;
    });

    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.received,
        operationId,
        remoteTab,
        "msg-round-current-received-1234",
        currentRound,
      ),
    );
    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.ready,
        operationId,
        remoteTab,
        "msg-round-old-ready-1234",
        "round-previous-quorum-1234",
      ),
    );
    await Promise.resolve();
    expect(resolved).toBe(false);

    harness.emitStorage(
      SESSION_CONVERGENCE_STORAGE_KEY,
      payload(
        SESSION_CONVERGENCE_SIGNALS.ready,
        operationId,
        remoteTab,
        "msg-round-current-ready-1234",
        currentRound,
      ),
    );
    await barrier.wait();
    expect(resolved).toBe(true);
    lease.release();
  });

  it("prunes an expired remote presence lease after its bounded lifetime", () => {
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const expiredTabId = "tab-expired-presence-1234";
    const expiredKey = `overgarden:authenticated-session-tab:v1:${expiredTabId}`;
    harness.storage.setItem(
      expiredKey,
      JSON.stringify({
        version: 1,
        tabId: expiredTabId,
        expiresAt: Date.now() - 1,
      }),
    );

    const barrier = createPreparationAcknowledgementBarrier(
      "op-expired-presence-1234",
      lease.tabId,
      "round-expired-presence-1234",
    );

    expect(barrier.expectedTabCount).toBe(0);
    expect(harness.storage.getItem(expiredKey)).toBeNull();
    lease.release();
  });

  it("preserves a BFCache tab lease but removes it on a final page hide", () => {
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const leaseKey = `overgarden:authenticated-session-tab:v1:${lease.tabId}`;

    harness.emitWindow("pagehide", { persisted: true });
    expect(harness.storage.getItem(leaseKey)).not.toBeNull();

    harness.emitWindow("pagehide", { persisted: false });
    expect(harness.storage.getItem(leaseKey)).toBeNull();
    lease.release();
  });

  it("refreshes a live hidden-tab lease on visibility transitions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    const harness = installBrowserHarness();
    const lease = acquireAuthenticatedSessionTabLease();
    const leaseKey = `overgarden:authenticated-session-tab:v1:${lease.tabId}`;
    const firstExpiry = JSON.parse(harness.storage.getItem(leaseKey) ?? "{}")
      .expiresAt as number;

    vi.setSystemTime(new Date("2026-07-18T12:01:00Z"));
    harness.emitDocument("visibilitychange", {});
    const refreshedExpiry = JSON.parse(
      harness.storage.getItem(leaseKey) ?? "{}",
    ).expiresAt as number;

    expect(refreshedExpiry).toBeGreaterThan(firstExpiry);
    lease.release();
  });
});

function payload(
  signal: (typeof SESSION_CONVERGENCE_SIGNALS)[keyof typeof SESSION_CONVERGENCE_SIGNALS],
  operationId: string,
  tabId: string,
  messageId: string,
  preparationRoundId: string | null = signal ===
    SESSION_CONVERGENCE_SIGNALS.preparation ||
  signal === SESSION_CONVERGENCE_SIGNALS.received ||
  signal === SESSION_CONVERGENCE_SIGNALS.ready ||
  signal === SESSION_CONVERGENCE_SIGNALS.failed
    ? "round-default-payload-1234"
    : null,
) {
  return {
    version: 2 as const,
    operationId,
    messageId,
    tabId,
    preparationRoundId,
    signal,
    phaseRank:
      signal === SESSION_CONVERGENCE_SIGNALS.preparation
        ? (1 as const)
        : signal === SESSION_CONVERGENCE_SIGNALS.received ||
            signal === SESSION_CONVERGENCE_SIGNALS.ready ||
            signal === SESSION_CONVERGENCE_SIGNALS.failed
          ? (2 as const)
          : (3 as const),
    sentAt: 1_800_000_000_000,
  };
}

function installBrowserHarness(options: { broadcast?: boolean } = {}) {
  const storage = new TestStorage();
  const storageListeners: Array<(event: StorageEvent) => void> = [];
  const broadcastListeners: Array<(event: MessageEvent) => void> = [];
  const windowListeners = new Map<string, Set<(event: Event) => void>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const posted: unknown[] = [];
  const markerAtBroadcast: Array<string | null> = [];

  class TestBroadcastChannel {
    postMessage(value: unknown) {
      markerAtBroadcast.push(
        storage.getItem(SESSION_INVALIDATION_MARKER_STORAGE_KEY),
      );
      posted.push(value);
      for (const listener of broadcastListeners) {
        listener({ data: value } as MessageEvent);
      }
    }
    addEventListener(_type: string, listener: (event: MessageEvent) => void) {
      broadcastListeners.push(listener);
    }
    close() {}
  }

  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener(type: string, listener: EventListener) {
      const listeners = documentListeners.get(type) ?? new Set();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: EventListener) {
      documentListeners.get(type)?.delete(listener);
    },
  });
  vi.stubGlobal("window", {
    BroadcastChannel:
      options.broadcast === false ? undefined : TestBroadcastChannel,
    localStorage: storage,
    addEventListener(type: string, listener: (event: StorageEvent) => void) {
      if (type === "storage") storageListeners.push(listener);
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener as (event: Event) => void);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      windowListeners.get(type)?.delete(listener);
    },
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  return {
    storage,
    posted,
    markerAtBroadcast,
    emitBroadcast(value: unknown) {
      for (const listener of broadcastListeners) {
        listener({ data: value } as MessageEvent);
      }
    },
    emitStorage(key: string, value: unknown) {
      for (const listener of storageListeners) {
        listener({ key, newValue: JSON.stringify(value) } as StorageEvent);
      }
    },
    emitWindow(type: string, event: Partial<PageTransitionEvent>) {
      for (const listener of windowListeners.get(type) ?? []) {
        listener(event as Event);
      }
    },
    emitDocument(type: string, event: Partial<Event>) {
      for (const listener of documentListeners.get(type) ?? []) {
        listener(event as Event);
      }
    },
    putLiveLease(tabId: string) {
      storage.setItem(
        `overgarden:authenticated-session-tab:v1:${tabId}`,
        JSON.stringify({
          version: 1,
          tabId,
          expiresAt: Date.now() + 60_000,
        }),
      );
    },
  };
}

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
