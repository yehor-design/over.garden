"use client";

import { commitSessionInvalidationMarker } from "./session-invalidation-marker";

export const SESSION_CONVERGENCE_CHANNEL = "overgarden:session-convergence:v2";
export const SESSION_CONVERGENCE_STORAGE_KEY =
  "overgarden:session-convergence-signal:v2";

export const SESSION_CONVERGENCE_SIGNALS = {
  preparation: "sign_out_preparation",
  received: "sign_out_preparation_received",
  ready: "sign_out_preparation_ready",
  failed: "sign_out_preparation_failed",
  cancellation: "sign_out_preparation_cancelled",
  committed: "session_invalidation_committed",
  localExitCommitted: "local_exit_committed",
} as const;

export type SessionConvergenceSignal =
  (typeof SESSION_CONVERGENCE_SIGNALS)[keyof typeof SESSION_CONVERGENCE_SIGNALS];

export const SESSION_CONVERGENCE_PHASE_RANK = {
  [SESSION_CONVERGENCE_SIGNALS.preparation]: 1,
  [SESSION_CONVERGENCE_SIGNALS.received]: 2,
  [SESSION_CONVERGENCE_SIGNALS.ready]: 2,
  [SESSION_CONVERGENCE_SIGNALS.failed]: 2,
  [SESSION_CONVERGENCE_SIGNALS.cancellation]: 3,
  [SESSION_CONVERGENCE_SIGNALS.committed]: 3,
  [SESSION_CONVERGENCE_SIGNALS.localExitCommitted]: 3,
} as const satisfies Record<SessionConvergenceSignal, 1 | 2 | 3>;

export interface SessionConvergencePayload {
  version: 2;
  operationId: string;
  messageId: string;
  tabId: string;
  preparationRoundId: string | null;
  signal: SessionConvergenceSignal;
  phaseRank: 1 | 2 | 3;
  sentAt: number;
}

export type SessionConvergenceListener = (
  payload: SessionConvergencePayload,
) => void;
const MAX_LOCAL_STAMPS = 128;
const locallyPublishedMessageIds = new Set<string>();
const AUTHENTICATED_TAB_LEASE_KEY_PREFIX =
  "overgarden:authenticated-session-tab:v1:";
// A crashed/abandoned tab may block a destructive quorum only for this bounded
// grace. Live hidden tabs refresh on visibility changes/heartbeats; BFCache
// documents preserve the lease and hard-reload on pageshow, while the durable
// owner session-generation fence prevents an expired document resurrecting A.
const AUTHENTICATED_TAB_LEASE_TTL_MS = 10 * 60_000;
const AUTHENTICATED_TAB_HEARTBEAT_MS = 15_000;
const PREPARATION_LIVENESS_ACKNOWLEDGEMENT_TIMEOUT_MS = 1_500;
const PREPARATION_ACKNOWLEDGEMENT_TIMEOUT_MS = 8_000;

interface ActiveSessionTabLease {
  tabId: string;
  references: number;
  intervalId: number;
  handlePageHide: (event: PageTransitionEvent) => void;
  handleVisibilityChange: () => void;
}

let activeSessionTabLease: ActiveSessionTabLease | null = null;

export interface AuthenticatedSessionTabLease {
  tabId: string;
  release(): void;
}

export interface PreparationAcknowledgementBarrier {
  expectedTabCount: number;
  wait(): Promise<void>;
  cancel(): void;
}

export function createSignOutOperationId() {
  return createOpaqueId("op");
}

export function createSessionTabId() {
  return createOpaqueId("tab");
}

export function createPreparationRoundId() {
  return createOpaqueId("round");
}

export function acquireAuthenticatedSessionTabLease(): AuthenticatedSessionTabLease {
  if (activeSessionTabLease) {
    activeSessionTabLease.references += 1;
    return leaseHandle(activeSessionTabLease);
  }
  if (typeof window === "undefined") {
    throw new Error("Authenticated tab presence requires a browser context.");
  }

  const tabId = createSessionTabId();
  writeAuthenticatedTabLease(tabId);
  const handlePageHide = (event: PageTransitionEvent) => {
    // A BFCache document is suspended, not closed. Keep its presence lease so
    // an initiator cannot silently omit its frozen in-memory state. The
    // authenticated boundary hard-reloads that document on persisted pageshow.
    if (!event.persisted) removeAuthenticatedTabLease(tabId);
  };
  const handleVisibilityChange = () => {
    try {
      // Refresh immediately before a background tab may be timer-throttled and
      // again when it becomes visible.
      writeAuthenticatedTabLease(tabId);
    } catch {
      // The next sign-out attempt verifies the lease and fails closed.
    }
  };
  const intervalId = window.setInterval(() => {
    try {
      writeAuthenticatedTabLease(tabId);
    } catch {
      // The next sign-out attempt verifies the lease and fails closed.
    }
  }, AUTHENTICATED_TAB_HEARTBEAT_MS);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  activeSessionTabLease = {
    tabId,
    references: 1,
    intervalId,
    handlePageHide,
    handleVisibilityChange,
  };
  return leaseHandle(activeSessionTabLease);
}

export function getCurrentAuthenticatedSessionTabId() {
  return activeSessionTabLease?.tabId ?? null;
}

export function createPreparationAcknowledgementBarrier(
  operationId: string,
  initiatingTabId: string,
  preparationRoundId: string,
): PreparationAcknowledgementBarrier {
  if (
    !isOpaqueId(operationId, "op") ||
    !isOpaqueId(initiatingTabId, "tab") ||
    !isOpaqueId(preparationRoundId, "round")
  ) {
    throw new Error("Preparation acknowledgement scope is unavailable.");
  }
  const expectedTabIds = listLiveAuthenticatedSessionTabIds(initiatingTabId);
  const expectedTabCount = expectedTabIds.size;
  const acknowledgedTabIds = new Set<string>();
  let settled = false;
  let resolveWait: (() => void) | undefined;
  let rejectWait: ((error: Error) => void) | undefined;
  let livenessTimeoutId: number | null = null;
  let preparationTimeoutId: number | null = null;
  let unsubscribe: () => void = () => undefined;
  const waitPromise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    if (livenessTimeoutId !== null) window.clearTimeout(livenessTimeoutId);
    if (preparationTimeoutId !== null) {
      window.clearTimeout(preparationTimeoutId);
    }
    unsubscribe();
    if (error) rejectWait?.(error);
    else resolveWait?.();
  };

  const startPreparationDeadline = () => {
    if (settled || expectedTabIds.size === 0) {
      finish();
      return;
    }
    preparationTimeoutId = window.setTimeout(
      () =>
        finish(new Error("Not every active tab confirmed sign-out readiness.")),
      PREPARATION_ACKNOWLEDGEMENT_TIMEOUT_MS,
    );
  };

  if (expectedTabIds.size === 0) {
    finish();
  } else {
    unsubscribe = subscribeToSessionConvergence((payload) => {
      if (payload.operationId !== operationId) return;
      if (payload.preparationRoundId !== preparationRoundId) return;
      if (!expectedTabIds.has(payload.tabId)) return;
      if (payload.signal === SESSION_CONVERGENCE_SIGNALS.received) {
        acknowledgedTabIds.add(payload.tabId);
        return;
      }
      if (!acknowledgedTabIds.has(payload.tabId)) return;
      if (payload.signal === SESSION_CONVERGENCE_SIGNALS.failed) {
        finish(new Error("Another tab could not prepare for sign-out."));
        return;
      }
      if (payload.signal !== SESSION_CONVERGENCE_SIGNALS.ready) {
        return;
      }
      expectedTabIds.delete(payload.tabId);
      if (expectedTabIds.size === 0) finish();
    });
    livenessTimeoutId = window.setTimeout(() => {
      for (const tabId of expectedTabIds) {
        if (!acknowledgedTabIds.has(tabId)) expectedTabIds.delete(tabId);
      }
      startPreparationDeadline();
    }, PREPARATION_LIVENESS_ACKNOWLEDGEMENT_TIMEOUT_MS);
  }

  return {
    expectedTabCount,
    wait: () => waitPromise,
    cancel: () => finish(new Error("Sign-out preparation was cancelled.")),
  };
}

function leaseHandle(
  lease: ActiveSessionTabLease,
): AuthenticatedSessionTabLease {
  let released = false;

  return {
    tabId: lease.tabId,
    release() {
      if (released) return;
      released = true;
      if (activeSessionTabLease !== lease) return;

      lease.references -= 1;
      if (lease.references > 0) return;

      window.clearInterval(lease.intervalId);
      window.removeEventListener("pagehide", lease.handlePageHide);
      document.removeEventListener(
        "visibilitychange",
        lease.handleVisibilityChange,
      );
      removeAuthenticatedTabLease(lease.tabId);
      activeSessionTabLease = null;
    },
  };
}

function writeAuthenticatedTabLease(tabId: string) {
  if (typeof window === "undefined") {
    throw new Error("Authenticated tab presence requires a browser context.");
  }
  const lease = {
    version: 1,
    tabId,
    expiresAt: Date.now() + AUTHENTICATED_TAB_LEASE_TTL_MS,
  };
  window.localStorage.setItem(
    `${AUTHENTICATED_TAB_LEASE_KEY_PREFIX}${tabId}`,
    JSON.stringify(lease),
  );
}

function removeAuthenticatedTabLease(tabId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(
      `${AUTHENTICATED_TAB_LEASE_KEY_PREFIX}${tabId}`,
    );
  } catch {
    // A stale bounded lease expires naturally if storage becomes unavailable.
  }
}

function listLiveAuthenticatedSessionTabIds(initiatingTabId: string) {
  if (typeof window === "undefined") {
    throw new Error("Authenticated tab presence requires a browser context.");
  }

  const now = Date.now();
  const liveTabIds = new Set<string>();
  let initiatingLeaseIsLive = false;
  const storage = window.localStorage;

  // Reading storage is part of the safety boundary. If it is unavailable, the
  // caller must fail closed rather than assume that no other tabs are active.
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const key of keys) {
    if (!key?.startsWith(AUTHENTICATED_TAB_LEASE_KEY_PREFIX)) continue;

    const serialized = storage.getItem(key);
    if (!serialized) continue;

    const lease = parseAuthenticatedTabLease(serialized);
    const keyTabId = key.slice(AUTHENTICATED_TAB_LEASE_KEY_PREFIX.length);
    if (!lease || lease.tabId !== keyTabId) {
      try {
        storage.removeItem(key);
      } catch {
        // Pruning is best effort; the invalid/expired value is never trusted.
      }
      continue;
    }
    if (lease.expiresAt <= now) {
      // Session-generation fences prevent a genuinely old document from
      // resuming prior-owner activity. Bound presence independently so an
      // abandoned/crashed tab cannot block sign-out forever.
      try {
        storage.removeItem(key);
      } catch {
        // If pruning itself is unavailable, inventory is not trustworthy.
        throw new Error("Authenticated tab presence inventory is stale.");
      }
      continue;
    }
    if (lease.tabId === initiatingTabId) {
      initiatingLeaseIsLive = true;
    } else {
      liveTabIds.add(lease.tabId);
    }
  }

  if (!initiatingLeaseIsLive) {
    throw new Error("Authenticated tab presence could not be confirmed.");
  }
  return liveTabIds;
}

function parseAuthenticatedTabLease(serialized: string) {
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (!isRecord(candidate) || candidate.version !== 1) return null;
    if (!isOpaqueId(candidate.tabId, "tab")) return null;
    if (
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt <= 0
    ) {
      return null;
    }
    return { tabId: candidate.tabId, expiresAt: candidate.expiresAt };
  } catch {
    return null;
  }
}

export function publishSignOutPreparation(
  operationId: string,
  tabId: string,
  preparationRoundId: string,
) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.preparation,
    operationId,
    tabId,
    preparationRoundId,
  );
}

export function publishSignOutPreparationReady(
  operationId: string,
  tabId: string,
  preparationRoundId: string,
) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.ready,
    operationId,
    tabId,
    preparationRoundId,
  );
}

export function publishSignOutPreparationReceived(
  operationId: string,
  tabId: string,
  preparationRoundId: string,
) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.received,
    operationId,
    tabId,
    preparationRoundId,
  );
}

export function publishSignOutPreparationFailed(
  operationId: string,
  tabId: string,
  preparationRoundId: string,
) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.failed,
    operationId,
    tabId,
    preparationRoundId,
  );
}

export function publishSignOutPreparationCancelled(
  operationId: string,
  tabId: string,
) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.cancellation,
    operationId,
    tabId,
    null,
  );
}

export function publishCommittedSessionInvalidation(
  operationId: string,
  tabId: string,
) {
  commitSessionInvalidationMarker();
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.committed,
    operationId,
    tabId,
    null,
  );
}

export function publishLocalExitCommitted(operationId: string, tabId: string) {
  return publishSessionConvergenceSignal(
    SESSION_CONVERGENCE_SIGNALS.localExitCommitted,
    operationId,
    tabId,
    null,
  );
}

export function subscribeToSessionConvergence(
  listener: SessionConvergenceListener,
) {
  const deliveredMessageIds = new Set<string>();
  const deliver = (candidate: unknown) => {
    const payload = parseSessionConvergencePayload(candidate);
    if (
      !payload ||
      locallyPublishedMessageIds.has(payload.messageId) ||
      deliveredMessageIds.has(payload.messageId)
    ) {
      return;
    }
    deliveredMessageIds.add(payload.messageId);
    listener(payload);
  };

  let channel: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && window.BroadcastChannel) {
    try {
      channel = new window.BroadcastChannel(SESSION_CONVERGENCE_CHANNEL);
      channel.addEventListener("message", (event) => deliver(event.data));
    } catch {
      channel = null;
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== SESSION_CONVERGENCE_STORAGE_KEY ||
      typeof event.newValue !== "string"
    ) {
      return;
    }

    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed same-origin storage values.
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    channel?.close();
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function parseSessionConvergencePayload(
  candidate: unknown,
): SessionConvergencePayload | null {
  if (!isRecord(candidate) || candidate.version !== 2) return null;
  if (!isSessionConvergenceSignal(candidate.signal)) return null;
  if (!isOpaqueId(candidate.operationId, "op")) return null;
  if (!isOpaqueId(candidate.messageId, "msg")) return null;
  if (!isOpaqueId(candidate.tabId, "tab")) return null;
  const preparationSignal =
    candidate.signal === SESSION_CONVERGENCE_SIGNALS.preparation ||
    candidate.signal === SESSION_CONVERGENCE_SIGNALS.received ||
    candidate.signal === SESSION_CONVERGENCE_SIGNALS.ready ||
    candidate.signal === SESSION_CONVERGENCE_SIGNALS.failed;
  if (
    preparationSignal
      ? !isOpaqueId(candidate.preparationRoundId, "round")
      : candidate.preparationRoundId !== null
  ) {
    return null;
  }
  const expectedPhaseRank = SESSION_CONVERGENCE_PHASE_RANK[candidate.signal];
  if (candidate.phaseRank !== expectedPhaseRank) return null;
  if (
    typeof candidate.sentAt !== "number" ||
    !Number.isFinite(candidate.sentAt) ||
    candidate.sentAt <= 0
  ) {
    return null;
  }
  return {
    version: 2,
    operationId: candidate.operationId,
    messageId: candidate.messageId,
    tabId: candidate.tabId,
    preparationRoundId: preparationSignal
      ? (candidate.preparationRoundId as string)
      : null,
    signal: candidate.signal,
    phaseRank: expectedPhaseRank,
    sentAt: candidate.sentAt,
  };
}

function publishSessionConvergenceSignal(
  signal: SessionConvergenceSignal,
  operationId: string,
  tabId: string,
  preparationRoundId: string | null,
): SessionConvergencePayload {
  if (!isOpaqueId(operationId, "op")) {
    throw new Error("Session convergence requires a bounded operation id.");
  }
  if (!isOpaqueId(tabId, "tab")) {
    throw new Error("Session convergence requires a bounded tab id.");
  }
  const preparationSignal =
    signal === SESSION_CONVERGENCE_SIGNALS.preparation ||
    signal === SESSION_CONVERGENCE_SIGNALS.received ||
    signal === SESSION_CONVERGENCE_SIGNALS.ready ||
    signal === SESSION_CONVERGENCE_SIGNALS.failed;
  if (
    preparationSignal
      ? !isOpaqueId(preparationRoundId, "round")
      : preparationRoundId !== null
  ) {
    throw new Error("Session convergence requires an exact preparation round.");
  }
  const payload: SessionConvergencePayload = {
    version: 2,
    operationId,
    messageId: createOpaqueId("msg"),
    tabId,
    preparationRoundId,
    signal,
    phaseRank: SESSION_CONVERGENCE_PHASE_RANK[signal],
    sentAt: Date.now(),
  };
  rememberLocallyPublishedMessageId(payload.messageId);

  if (typeof window !== "undefined" && window.BroadcastChannel) {
    try {
      const channel = new window.BroadcastChannel(SESSION_CONVERGENCE_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // localStorage below remains an independent cross-tab path.
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        SESSION_CONVERGENCE_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Storage can be unavailable in hardened/private browsing modes.
    }
  }

  return payload;
}

function rememberLocallyPublishedMessageId(messageId: string) {
  locallyPublishedMessageIds.add(messageId);
  if (locallyPublishedMessageIds.size <= MAX_LOCAL_STAMPS) return;
  const oldestMessageId = locallyPublishedMessageIds.values().next().value;
  if (oldestMessageId) locallyPublishedMessageIds.delete(oldestMessageId);
}

function createOpaqueId(prefix: "op" | "msg" | "tab" | "round") {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function isOpaqueId(
  value: unknown,
  prefix: "op" | "msg" | "tab" | "round",
): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    value.startsWith(`${prefix}-`) &&
    /^[a-z0-9-]+$/i.test(value)
  );
}

function isSessionConvergenceSignal(
  value: unknown,
): value is SessionConvergenceSignal {
  return Object.values(SESSION_CONVERGENCE_SIGNALS).includes(
    value as SessionConvergenceSignal,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
