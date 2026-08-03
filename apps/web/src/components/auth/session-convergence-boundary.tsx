"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  classifySessionConfirmation,
  localizedPublicRoot,
  prepareCurrentSessionSignOut,
  signOutCurrentSessionOnce,
  type PreparedCurrentSessionSignOut,
} from "@/lib/auth/sign-out-contract";
import {
  acquireAuthenticatedSessionTabLease,
  createSessionTabId,
  createSignOutOperationId,
  publishCommittedSessionInvalidation,
  publishSignOutPreparationReceived,
  publishSignOutPreparationFailed,
  publishSignOutPreparationReady,
  SESSION_CONVERGENCE_SIGNALS,
  subscribeToSessionConvergence,
} from "@/lib/auth/session-convergence";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  prepareOwnerComposerParticipants,
  type OwnerComposerPreparationHandle,
} from "@/lib/offline/owner-composer-participants";
import {
  abortOwnerSyncAttempts,
  finalizeOwnerOfflineActivityForSignedOut,
  finalizeOwnerOfflineActivityForSessionChange,
  hydrateOwnerOfflineActivitySession,
  pauseOwnerOfflineActivity,
  type OwnerOfflineActivityPauseHandle,
} from "@/lib/offline/owner-session-lifecycle";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

import { BlockedSessionAccountMethods } from "./blocked-session-account-methods";

const REMOTE_PREPARATION_STALE_MS = 2 * 60_000;
const REMOTE_PREPARATION_WATCHDOG_MS = 15_000;
export const SESSION_CONVERGENCE_PHASE_TIMEOUT_MS = 3_000;
const AUTHORITATIVE_SESSION_READ_TIMEOUT_MS = 1_000;
export const FALLBACK_SIGN_OUT_TIMEOUT_MS = 10_000;
const HARD_RELOAD_FINALIZATION_TIMEOUT_MS =
  SESSION_CONVERGENCE_PHASE_TIMEOUT_MS;

type SessionRecheckFence = {
  epoch: number;
  ownerUserId: string;
  pauseHandle: OwnerOfflineActivityPauseHandle | null;
  composerPreparation: OwnerComposerPreparationHandle | null;
  status: "preparing" | "ready" | "failed";
  terminal: "signed_out" | "changed" | null;
  ready: Promise<void>;
};

function isVisualFixtureBrowserRequest(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  for (const key of params.keys()) {
    if (key.startsWith("visual")) return true;
  }
  return false;
}

export function SessionConvergenceBoundary({
  children,
  locale,
  localeControlFallback,
  authoritativeSessionRead,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  /** Payload-free control only; authenticated children stay hidden by the gate. */
  localeControlFallback?: React.ReactNode;
  /** Local visual-fixture seam; production callers use Better Auth directly. */
  authoritativeSessionRead?: () => Promise<unknown>;
}) {
  // Mount Better Auth's session atom so its built-in session signal and the
  // product's explicit offline-safe convergence signal are both active.
  authClient.useSession();
  const [activityGate, setActivityGate] = useState<
    "checking" | "ready" | "blocked"
  >("checking");
  const [remotePreparationPending, setRemotePreparationPending] =
    useState(false);
  const [fallbackExitState, setFallbackExitState] = useState<
    "idle" | "pending" | "failed"
  >("idle");
  useInterfaceLocaleChangeFormState({
    id: "session-convergence-lifecycle",
    dirty: false,
    pending: activityGate !== "ready" || remotePreparationPending,
  });
  const retryHydrationRef = useRef<() => void>(() => undefined);
  const reloadSessionGateRef = useRef<() => void>(() => undefined);
  const pauseHandleRef = useRef<OwnerOfflineActivityPauseHandle | null>(null);
  const composerPreparationRef = useRef<OwnerComposerPreparationHandle | null>(
    null,
  );
  const preparationPromiseRef = useRef<Promise<void> | null>(null);
  const preparationRoundTailRef = useRef<Promise<void>>(Promise.resolve());
  const preparationGenerationRef = useRef(0);
  const activeOperationIdsRef = useRef(new Set<string>());
  const operationLastSeenAtRef = useRef(new Map<string, number>());
  const operationPreparationRoundsRef = useRef(new Map<string, string>());
  const terminalOperationIdsRef = useRef(new Map<string, string>());
  const fallbackExitRef = useRef<() => void>(() => undefined);
  const fallbackExitActionRef = useRef<HTMLButtonElement | null>(null);
  const readAuthoritativeSession = useCallback(
    () =>
      authoritativeSessionRead
        ? authoritativeSessionRead()
        : authClient.getSession(AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS),
    [authoritativeSessionRead],
  );

  useEffect(() => {
    if (fallbackExitState === "failed") {
      fallbackExitActionRef.current?.focus();
    }
  }, [fallbackExitState]);

  useEffect(() => {
    let disposed = false;
    let authoritativeNavigationStarted = false;
    const hideAuthenticatedTree = () => {
      if (disposed) return;
      // A hard navigation can begin in the same microtask as the state change.
      // Commit the privacy gate first so the old private tree cannot remain
      // painted while navigation is delayed, mocked, or rejected.
      flushSync(() => setActivityGate("blocked"));
    };
    const activeOperationIds = activeOperationIdsRef.current;
    const operationLastSeenAt = operationLastSeenAtRef.current;
    const operationPreparationRounds = operationPreparationRoundsRef.current;
    const terminalOperationIds = terminalOperationIdsRef.current;
    let authoritativeRecheck: Promise<void> | null = null;
    let staleOperationRecheck: Promise<void> | null = null;
    let hardReloadInFlight: Promise<void> | null = null;
    let sessionRecheckEpoch = 0;
    const sessionRecheckFences = new Map<number, SessionRecheckFence>();
    const committedOperationsInFlight = new Set<string>();
    const beginPayloadFreeSessionCheck = () => {
      if (disposed) return;
      // The ordinary focus/visibility path is an identity boundary too. Commit
      // the payload-free checking gate before any asynchronous session or
      // owner-store work can observe the potentially changed cookie.
      flushSync(() => setActivityGate("checking"));
    };
    const updateRemotePreparationFence = () => {
      if (disposed) return;
      setRemotePreparationPending(
        activeOperationIdsRef.current.size > 0 ||
          committedOperationsInFlight.size > 0 ||
          preparationPromiseRef.current !== null ||
          pauseHandleRef.current !== null ||
          composerPreparationRef.current !== null,
      );
    };
    const fallbackUnregisteredTabId = createSessionTabId();
    let tabLease: ReturnType<
      typeof acquireAuthenticatedSessionTabLease
    > | null = null;
    try {
      tabLease = acquireAuthenticatedSessionTabLease();
    } catch {
      // A local initiating tab will fail closed if authenticated presence
      // cannot be registered or enumerated.
    }

    let baselinePreparedSession:
      | PreparedCurrentSessionSignOut
      | null
      | undefined;
    let baselineOwnerUserId: string | null = null;
    const baselineReady = (async () => {
      try {
        // Better Auth's client atom commonly starts as pending with data:null.
        // Only a no-cache authoritative read may establish this document's
        // immutable session baseline.
        const sessionResult = await readBoundedAuthoritativeSession(
          readAuthoritativeSession,
        );
        baselinePreparedSession =
          await prepareBoundedSessionSignOut(sessionResult);
        baselineOwnerUserId = readOwnerUserId(sessionResult);
      } catch {
        baselinePreparedSession = undefined;
        baselineOwnerUserId = null;
      }
      if (baselinePreparedSession === null && !disposed) {
        hideAuthenticatedTree();
        window.location.replace(localizedPublicRoot(locale));
        return;
      }
      if (baselinePreparedSession && baselineOwnerUserId && !disposed) {
        // Visual-fixture routes use synthetic owners and must not open the
        // real offline IndexedDB lane — Dexie hydration can wedge Playwright
        // Chromium and is not part of fixture evidence.
        if (isVisualFixtureBrowserRequest()) {
          setActivityGate("ready");
          return;
        }
        const hydration = await hydrateBoundedOwnerOfflineActivitySession(
          baselineOwnerUserId,
          baselinePreparedSession.binding,
        ).catch(() => "blocked" as const);
        if (disposed) return;
        if (hydration === "document_session_changed") {
          hideAuthenticatedTree();
          window.location.reload();
          return;
        }
        setActivityGate(hydration === "ready" ? "ready" : "blocked");
        return;
      }
      if (!disposed && baselinePreparedSession !== null) {
        setActivityGate("blocked");
      }
    })();

    let activityGateRefresh: Promise<boolean> | null = null;
    const refreshActivityGate = () => {
      if (activityGateRefresh) return activityGateRefresh;
      const refresh = (async () => {
        await baselineReady;
        if (disposed) {
          return false;
        }
        try {
          // Recovery may prune a bounded orphan fence, so it always requires a
          // new no-cache proof of the exact owner/session generation first.
          const sessionResult = await readBoundedAuthoritativeSession(
            readAuthoritativeSession,
          );
          const freshPreparedSession =
            await prepareBoundedSessionSignOut(sessionResult);
          const freshOwnerUserId = readOwnerUserId(sessionResult);

          if (freshPreparedSession === null) {
            beginSignedOutTransition();
            return false;
          }
          if (!freshOwnerUserId) throw new Error("Session owner unavailable.");

          if (baselinePreparedSession === undefined) {
            // No authenticated children were mounted while the initial proof was
            // unavailable. A successful retry may safely establish the immutable
            // document baseline before hydration.
            baselinePreparedSession = freshPreparedSession;
            baselineOwnerUserId = freshOwnerUserId;
          } else if (
            baselinePreparedSession === null ||
            baselinePreparedSession.binding !== freshPreparedSession.binding ||
            baselineOwnerUserId !== freshOwnerUserId
          ) {
            beginChangedSessionTransition();
            return false;
          }

          const hydration = isVisualFixtureBrowserRequest()
            ? ("ready" as const)
            : await hydrateBoundedOwnerOfflineActivitySession(
                freshOwnerUserId,
                freshPreparedSession.binding,
              );
          if (disposed) return false;
          if (hydration === "document_session_changed") {
            hideAuthenticatedTree();
            window.location.reload();
            return false;
          }
          if (sessionRecheckFences.size > 0) {
            setActivityGate("blocked");
            return false;
          }
          setActivityGate(hydration === "ready" ? "ready" : "blocked");
          return hydration === "ready";
        } catch {
          if (!disposed) setActivityGate("blocked");
          return false;
        }
      })();
      activityGateRefresh = refresh;
      const clearRefresh = () => {
        if (activityGateRefresh === refresh) activityGateRefresh = null;
      };
      void refresh.then(clearRefresh, clearRefresh);
      return refresh;
    };
    const compareFreshSessionToBaseline = async (sessionResult: unknown) => {
      await baselineReady;
      let freshPreparedSession: PreparedCurrentSessionSignOut | null;
      try {
        freshPreparedSession =
          await prepareBoundedSessionSignOut(sessionResult);
      } catch {
        return "unavailable" as const;
      }
      if (freshPreparedSession === null) return "signed_out" as const;
      if (baselinePreparedSession === undefined) {
        return "unavailable" as const;
      }
      if (baselinePreparedSession === null) return "changed" as const;
      const freshOwnerUserId = readOwnerUserId(sessionResult);
      return baselinePreparedSession.binding === freshPreparedSession.binding &&
        baselineOwnerUserId === freshOwnerUserId
        ? ("matches" as const)
        : ("changed" as const);
    };

    const publishPreparationResult = (
      signal: "ready" | "failed",
      operationId: string,
      preparationRoundId: string,
    ) => {
      const tabId = tabLease?.tabId ?? fallbackUnregisteredTabId;
      if (signal === "ready") {
        publishSignOutPreparationReady(operationId, tabId, preparationRoundId);
      } else {
        publishSignOutPreparationFailed(operationId, tabId, preparationRoundId);
      }
    };

    const resumeRemotePreparation = async () => {
      preparationGenerationRef.current += 1;
      const pauseHandle = pauseHandleRef.current;
      if (pauseHandle) {
        try {
          await pauseHandle.resume();
        } catch {
          updateRemotePreparationFence();
          return false;
        }
        if (pauseHandleRef.current === pauseHandle) {
          pauseHandleRef.current = null;
        }
      }
      pauseHandleRef.current = null;
      const composerPreparation = composerPreparationRef.current;
      if (composerPreparation) {
        try {
          await composerPreparation.resume();
        } catch {
          updateRemotePreparationFence();
          return false;
        }
        if (composerPreparationRef.current === composerPreparation) {
          composerPreparationRef.current = null;
        }
      }
      composerPreparationRef.current = null;
      await refreshActivityGate();
      updateRemotePreparationFence();
      return true;
    };

    const releaseSessionRecheckFence = async (fence: SessionRecheckFence) => {
      if (fence.status === "preparing" || fence.terminal) return false;
      const pauseHandle = fence.pauseHandle;
      if (pauseHandle) {
        await pauseHandle.resume();
        fence.pauseHandle = null;
      }
      const composerPreparation = fence.composerPreparation;
      if (composerPreparation) {
        await composerPreparation.resume();
        fence.composerPreparation = null;
      }
      sessionRecheckFences.delete(fence.epoch);
      return true;
    };

    const releaseReadySessionRecheckFences = async () => {
      const fences = [...sessionRecheckFences.values()];
      if (fences.some((fence) => fence.status === "preparing")) {
        return false;
      }
      for (const fence of fences) {
        try {
          if (!(await releaseSessionRecheckFence(fence))) return false;
        } catch {
          return false;
        }
      }
      return sessionRecheckFences.size === 0;
    };

    const finalizeSessionRecheckFence = async (
      fence: SessionRecheckFence,
      terminal: "signed_out" | "changed",
    ) => {
      fence.terminal = terminal;
      if (fence.status === "preparing") return;
      const pauseHandle = fence.pauseHandle;
      if (pauseHandle) {
        if (terminal === "signed_out") {
          await pauseHandle.finalizeForSignedOut();
        } else {
          await pauseHandle.finalizeForSessionChange();
        }
        fence.pauseHandle = null;
      }
      // A document replacement owns the terminal composer freeze. Do not
      // resume it and risk recreating an A-owned draft in this document.
      sessionRecheckFences.delete(fence.epoch);
    };

    const finalizeSessionRecheckFences = (
      terminal: "signed_out" | "changed",
    ) => {
      sessionRecheckEpoch += 1;
      for (const fence of sessionRecheckFences.values()) {
        fence.terminal = terminal;
        startBestEffort(() => finalizeSessionRecheckFence(fence, terminal));
      }
    };

    const finalizeSessionRecheckFenceForHardReload = async (
      fence: SessionRecheckFence,
    ) => {
      if (fence.status === "preparing") {
        try {
          await fence.ready;
        } catch {
          // A composer-side failure can leave the durable owner pause handle
          // available. Finalize that retained handle instead of stranding it.
        }
      }
      const pauseHandle = fence.pauseHandle;
      if (!pauseHandle) {
        throw new Error("Session recheck owner fence is unavailable.");
      }
      await pauseHandle.finalizeForHardReload();
      fence.pauseHandle = null;
      sessionRecheckFences.delete(fence.epoch);
    };

    const reloadAfterSessionRecheckFence = () => {
      if (hardReloadInFlight || authoritativeNavigationStarted) return;

      authoritativeNavigationStarted = true;
      sessionRecheckEpoch += 1;
      beginPayloadFreeSessionCheck();
      const fences = [...sessionRecheckFences.values()];
      const reload = (async () => {
        try {
          await requireSettledWithin(
            () =>
              Promise.all(
                fences.map((fence) =>
                  finalizeSessionRecheckFenceForHardReload(fence),
                ),
              ),
            HARD_RELOAD_FINALIZATION_TIMEOUT_MS,
          );
        } catch {
          // Do not replace the document while its owner-scoped durable fence
          // might still belong to this session. The payload-free UI remains
          // available for a later explicit recovery action.
          authoritativeNavigationStarted = false;
          setActivityGate("blocked");
          return;
        }
        window.location.reload();
      })();
      hardReloadInFlight = reload;
      void reload.finally(() => {
        if (hardReloadInFlight === reload) hardReloadInFlight = null;
      });
    };

    const startSessionRecheckFence = (epoch: number) => {
      if (
        !baselineOwnerUserId ||
        !baselinePreparedSession ||
        isVisualFixtureBrowserRequest()
      ) {
        return null;
      }

      const ownerUserId = baselineOwnerUserId;
      const sessionGeneration = baselinePreparedSession.binding;
      let resolveReady!: () => void;
      let rejectReady!: (error: unknown) => void;
      const fence: SessionRecheckFence = {
        epoch,
        ownerUserId,
        pauseHandle: null,
        composerPreparation: null,
        status: "preparing",
        terminal: null,
        ready: new Promise<void>((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        }),
      };
      sessionRecheckFences.set(epoch, fence);

      // Both calls acquire their in-memory safety fences before their first
      // await. Abort active sync first so no owner-A request can outlive the
      // transition into the payload-free React gate.
      abortOwnerSyncAttempts(ownerUserId);
      const composerPreparation = prepareOwnerComposerParticipants(ownerUserId);
      const pauseHandle = pauseOwnerOfflineActivity(ownerUserId, {
        operationId: createSignOutOperationId(),
        sessionGeneration,
      });
      void Promise.allSettled([composerPreparation, pauseHandle]).then(
        async ([composerResult, pauseResult]) => {
          if (
            composerResult.status !== "fulfilled" ||
            pauseResult.status !== "fulfilled"
          ) {
            // A partial owner fence is still a security boundary. Keep every
            // successful handle sealed until a later exact-A retry can release
            // it, or a signed-out/session-change finalizer makes it terminal.
            fence.composerPreparation =
              composerResult.status === "fulfilled"
                ? composerResult.value
                : null;
            fence.pauseHandle =
              pauseResult.status === "fulfilled" ? pauseResult.value : null;
            fence.status = "failed";
            rejectReady(new Error("Session recheck owner fence unavailable."));
            return;
          }

          fence.composerPreparation = composerResult.value;
          fence.pauseHandle = pauseResult.value;
          try {
            fence.composerPreparation.bindOfflineActivityScope(
              fence.pauseHandle,
            );
            abortOwnerSyncAttempts(ownerUserId);
            await fence.pauseHandle.waitForSyncDrain();
            fence.status = "ready";
            if (fence.terminal) {
              await finalizeSessionRecheckFence(fence, fence.terminal);
            }
            resolveReady();
          } catch (error) {
            // A failed drain/bind is not permission to reopen an owner-A
            // lane. The retained handles may be released only after the next
            // exact-A confirmation or made terminal by an identity change.
            fence.status = "failed";
            rejectReady(error);
          }
        },
      );
      // The active recheck consumes this promise through a bounded wait. Keep
      // a handled continuation for a stale operation whose source promise
      // settles only after that bound has elapsed.
      void fence.ready.catch(() => undefined);
      return fence;
    };

    const finalizeSignedOutActivity = async () => {
      await baselineReady;
      finalizeSessionRecheckFences("signed_out");
      const pauseHandle = pauseHandleRef.current;
      if (!pauseHandle) {
        if (!baselineOwnerUserId || !baselinePreparedSession) {
          throw new Error("Signed-out owner activity cannot be fenced.");
        }
        await finalizeOwnerOfflineActivityForSignedOut(
          baselineOwnerUserId,
          baselinePreparedSession.binding,
        );
      } else {
        await pauseHandle.finalizeForSignedOut();
      }
      pauseHandleRef.current = null;
      composerPreparationRef.current = null;
    };

    const finalizeChangedSessionActivity = async () => {
      await baselineReady;
      finalizeSessionRecheckFences("changed");
      if (!baselineOwnerUserId || !baselinePreparedSession) {
        throw new Error("Changed-session owner activity cannot be fenced.");
      }
      const pauseHandle = pauseHandleRef.current;
      if (pauseHandle) {
        await pauseHandle.finalizeForSessionChange();
      } else {
        await finalizeOwnerOfflineActivityForSessionChange(
          baselineOwnerUserId,
          baselinePreparedSession.binding,
        );
      }
      pauseHandleRef.current = null;
      composerPreparationRef.current = null;
    };

    const publishChangedSessionInvalidation = () => {
      const tabId = tabLease?.tabId ?? fallbackUnregisteredTabId;
      const operationIds = [...activeOperationIdsRef.current];
      if (operationIds.length === 0) {
        operationIds.push(createSignOutOperationId());
      }
      for (const operationId of operationIds) {
        publishCommittedSessionInvalidation(operationId, tabId);
      }
      activeOperationIds.clear();
      operationLastSeenAt.clear();
      operationPreparationRounds.clear();
      updateRemotePreparationFence();
    };

    const beginSignedOutTransition = () => {
      if (disposed || authoritativeNavigationStarted) return;
      authoritativeNavigationStarted = true;
      hideAuthenticatedTree();
      activeOperationIds.clear();
      operationLastSeenAt.clear();
      operationPreparationRounds.clear();
      updateRemotePreparationFence();
      startBestEffort(finalizeSignedOutActivity);
      window.location.replace(localizedPublicRoot(locale));
    };

    const beginChangedSessionTransition = () => {
      if (disposed || authoritativeNavigationStarted) return;
      authoritativeNavigationStarted = true;
      hideAuthenticatedTree();
      publishChangedSessionInvalidation();
      startBestEffort(finalizeChangedSessionActivity);
      window.location.reload();
    };

    const beginFallbackChangedSessionTransition = () => {
      if (disposed || authoritativeNavigationStarted) return;
      authoritativeNavigationStarted = true;
      hideAuthenticatedTree();
      activeOperationIds.clear();
      operationLastSeenAt.clear();
      operationPreparationRounds.clear();
      updateRemotePreparationFence();
      startBestEffort(finalizeChangedSessionActivity);
      window.location.reload();
    };

    let fallbackExitInFlight = false;
    let fallbackExitAttempt = 0;
    const prepareActionTimeFallbackSession = async () => {
      if (baselinePreparedSession) {
        return {
          status: "prepared" as const,
          prepared: baselinePreparedSession,
        };
      }

      const freshSessionResult = await readAuthoritativeSession();
      const freshPreparedSession = await prepareCurrentSessionSignOut(
        freshSessionResult,
      );
      if (freshPreparedSession === null) {
        return { status: "already_signed_out" as const };
      }

      const freshOwnerUserId = readOwnerUserId(freshSessionResult);
      if (!freshOwnerUserId) {
        throw new Error("Action-time current session owner unavailable.");
      }

      // The document never admits authenticated children from this recovery
      // path. Retaining the fresh pair only gives existing terminal fencing a
      // current owner/session generation after a failed initial baseline.
      baselinePreparedSession = freshPreparedSession;
      baselineOwnerUserId = freshOwnerUserId;
      return { status: "prepared" as const, prepared: freshPreparedSession };
    };
    const requestFallbackExit = () => {
      if (fallbackExitInFlight || disposed || authoritativeNavigationStarted) {
        return;
      }

      fallbackExitInFlight = true;
      const attempt = ++fallbackExitAttempt;
      setFallbackExitState("pending");
      void requireSettledWithin(
        async () => {
          const target = await prepareActionTimeFallbackSession();
          if (target.status === "already_signed_out") return target;
          return signOutCurrentSessionOnce(target.prepared, {
            getSession: () => readAuthoritativeSession(),
            signOut: (options) => authClient.signOut(options),
          });
        },
        FALLBACK_SIGN_OUT_TIMEOUT_MS,
      ).then(
        (result) => {
          if (disposed || attempt !== fallbackExitAttempt) return;
          fallbackExitInFlight = false;
          if (result.status === "already_signed_out") {
            beginSignedOutTransition();
            return;
          }
          if (result.status === "committed") {
            const tabId = tabLease?.tabId ?? fallbackUnregisteredTabId;
            publishCommittedSessionInvalidation(createSignOutOperationId(), tabId);
            beginSignedOutTransition();
            return;
          }
          if (result.reason === "session_changed") {
            beginFallbackChangedSessionTransition();
            return;
          }
          setFallbackExitState("failed");
        },
        () => {
          if (disposed || attempt !== fallbackExitAttempt) return;
          fallbackExitInFlight = false;
          setFallbackExitState("failed");
        },
      );
    };
    fallbackExitRef.current = requestFallbackExit;

    const releasePartialPreparation = async (
      pauseHandle: OwnerOfflineActivityPauseHandle | null,
      composerPreparation: OwnerComposerPreparationHandle | null,
    ) => {
      if (pauseHandle) {
        try {
          await pauseHandle.resume();
        } catch {
          pauseHandleRef.current = pauseHandle;
          composerPreparationRef.current = composerPreparation;
          updateRemotePreparationFence();
          return false;
        }
        if (pauseHandleRef.current === pauseHandle) {
          pauseHandleRef.current = null;
        }
      }
      if (composerPreparation) {
        try {
          await composerPreparation.resume();
        } catch {
          composerPreparationRef.current = composerPreparation;
          updateRemotePreparationFence();
          return false;
        }
        if (composerPreparationRef.current === composerPreparation) {
          composerPreparationRef.current = null;
        }
      }
      updateRemotePreparationFence();
      return true;
    };

    const prepareForSignOut = async () => {
      const generation = ++preparationGenerationRef.current;
      if (pauseHandleRef.current && composerPreparationRef.current) {
        return;
      }

      let composerPreparation: OwnerComposerPreparationHandle | null = null;
      let pauseHandle: OwnerOfflineActivityPauseHandle | null = null;
      try {
        const sessionResult = await readBoundedAuthoritativeSession(
          readAuthoritativeSession,
        );
        const sessionComparison =
          await compareFreshSessionToBaseline(sessionResult);
        if (sessionComparison === "signed_out") {
          beginSignedOutTransition();
          throw new Error("Cross-tab session ended during preparation.");
        }
        if (sessionComparison === "changed") {
          beginChangedSessionTransition();
          throw new Error("Cross-tab session changed during preparation.");
        }
        if (sessionComparison !== "matches") {
          throw new Error("Cross-tab session confirmation is unavailable.");
        }
        const ownerUserId = readOwnerUserId(sessionResult);
        if (
          !ownerUserId ||
          disposed ||
          activeOperationIdsRef.current.size === 0
        ) {
          throw new Error("Cross-tab owner session is unavailable.");
        }

        // Freeze and durably flush current React composer state before the
        // durable pause or readiness acknowledgement.
        composerPreparation =
          await prepareOwnerComposerParticipants(ownerUserId);
        if (!baselinePreparedSession) {
          throw new Error("Cross-tab session generation is unavailable.");
        }
        pauseHandle = await pauseOwnerOfflineActivity(ownerUserId, {
          // Remote documents own a distinct durable token. Reusing the shared
          // convergence id could let this tab delete the initiator's
          // commit_pending fence during unmount/cancellation.
          operationId: createSignOutOperationId(),
          sessionGeneration: baselinePreparedSession.binding,
        });
        composerPreparation.bindOfflineActivityScope(pauseHandle);
        abortOwnerSyncAttempts(ownerUserId);
        await pauseHandle.waitForSyncDrain();

        if (
          disposed ||
          preparationGenerationRef.current !== generation ||
          activeOperationIdsRef.current.size === 0
        ) {
          await releasePartialPreparation(pauseHandle, composerPreparation);
          return;
        }
        composerPreparationRef.current = composerPreparation;
        pauseHandleRef.current = pauseHandle;
        updateRemotePreparationFence();
      } catch (error) {
        await releasePartialPreparation(pauseHandle, composerPreparation);
        throw error;
      }
    };

    const schedulePreparationRound = (
      operationId: string,
      preparationRoundId: string,
    ) => {
      const runRound = async () => {
        if (
          disposed ||
          terminalOperationIdsRef.current.has(operationId) ||
          !activeOperationIdsRef.current.has(operationId)
        ) {
          return;
        }
        try {
          if (!pauseHandleRef.current || !composerPreparationRef.current) {
            if (!preparationPromiseRef.current) {
              const preparation = prepareForSignOut();
              preparationPromiseRef.current = preparation;
              const clearPreparation = () => {
                if (preparationPromiseRef.current === preparation) {
                  preparationPromiseRef.current = null;
                  updateRemotePreparationFence();
                }
              };
              void preparation.then(clearPreparation, clearPreparation);
            }
            await preparationPromiseRef.current;
          }

          const composerPreparation = composerPreparationRef.current;
          const pauseHandle = pauseHandleRef.current;
          if (!composerPreparation || !pauseHandle) {
            throw new Error("Cross-tab preparation is unavailable.");
          }
          await composerPreparation.flushLatest();
          await pauseHandle.renewPreparationLease();
          if (
            !disposed &&
            !terminalOperationIdsRef.current.has(operationId) &&
            activeOperationIdsRef.current.has(operationId)
          ) {
            // Echo only the captured round. A later PREP may update the latest
            // round map while this flush is in flight; it must run and ACK on
            // its own serialized turn.
            publishPreparationResult("ready", operationId, preparationRoundId);
          }
        } catch {
          if (
            !disposed &&
            !terminalOperationIdsRef.current.has(operationId) &&
            activeOperationIdsRef.current.has(operationId)
          ) {
            publishPreparationResult("failed", operationId, preparationRoundId);
          }
        }
      };

      const scheduled = preparationRoundTailRef.current.then(
        runRound,
        runRound,
      );
      preparationRoundTailRef.current = scheduled;
    };

    const cancelPreparation = async (operationId: string) => {
      if (
        terminalOperationIdsRef.current.get(operationId) ===
        SESSION_CONVERGENCE_SIGNALS.committed
      ) {
        return;
      }
      rememberTerminalOperation(
        terminalOperationIdsRef.current,
        operationId,
        SESSION_CONVERGENCE_SIGNALS.cancellation,
      );
      activeOperationIdsRef.current.delete(operationId);
      operationLastSeenAtRef.current.delete(operationId);
      operationPreparationRoundsRef.current.delete(operationId);
      updateRemotePreparationFence();
      if (
        activeOperationIdsRef.current.size > 0 ||
        committedOperationsInFlight.size > 0
      ) {
        return;
      }
      await resumeRemotePreparation();
    };

    const convergeCommittedSession = async (operationId: string) => {
      // A peer terminal signal means the cookie may already represent signed
      // out or session B. Remove session A's private React tree synchronously,
      // before waiting for an in-flight preparation or any network proof. Only
      // an authoritative exact-A confirmation plus recovery may reopen it.
      hideAuthenticatedTree();
      committedOperationsInFlight.add(operationId);
      updateRemotePreparationFence();
      rememberTerminalOperation(
        terminalOperationIdsRef.current,
        operationId,
        SESSION_CONVERGENCE_SIGNALS.committed,
      );
      activeOperationIdsRef.current.delete(operationId);
      operationLastSeenAtRef.current.delete(operationId);
      operationPreparationRoundsRef.current.delete(operationId);
      await preparationPromiseRef.current?.catch(() => undefined);

      try {
        const sessionResult = await readBoundedAuthoritativeSession(
          readAuthoritativeSession,
        );
        const confirmation = classifySessionConfirmation(sessionResult);
        if (confirmation === "signed_out") {
          beginSignedOutTransition();
          return;
        }
        if (confirmation === "authenticated") {
          const sessionComparison =
            await compareFreshSessionToBaseline(sessionResult);
          if (sessionComparison === "changed") {
            beginChangedSessionTransition();
            return;
          }
          if (sessionComparison !== "matches") return;
          if (activeOperationIdsRef.current.size === 0) {
            await resumeRemotePreparation();
          }
          return;
        }
        // Unknown after a terminal signal stays frozen until a later
        // authoritative focus/watchdog recheck establishes signed-out,
        // changed, or the exact same baseline session.
      } catch {
        // A terminal recheck failure must never release old-session memory.
      } finally {
        committedOperationsInFlight.delete(operationId);
        updateRemotePreparationFence();
      }
    };

    const recheckAuthoritativeSession = () => {
      if (disposed || authoritativeNavigationStarted || authoritativeRecheck) {
        return;
      }
      const epoch = sessionRecheckEpoch + 1;
      sessionRecheckEpoch = epoch;
      beginPayloadFreeSessionCheck();
      let fence = startSessionRecheckFence(epoch);

      const recheck = (async () => {
        const isCurrentEpoch = () =>
          !disposed &&
          !authoritativeNavigationStarted &&
          sessionRecheckEpoch === epoch;
        try {
          const sessionResult = await readBoundedAuthoritativeSession(
            readAuthoritativeSession,
          );
          if (!isCurrentEpoch()) return;
          const confirmation = classifySessionConfirmation(sessionResult);
          if (confirmation === "authenticated") {
            let sessionComparison =
              await compareFreshSessionToBaseline(sessionResult);
            if (!isCurrentEpoch()) return;
            if (
              sessionComparison === "unavailable" &&
              baselinePreparedSession === undefined
            ) {
              // The initial read may have timed out before any private tree was
              // admitted. An explicit retry may establish the first immutable
              // document baseline, but still acquires the owner fence before
              // it can render authenticated children.
              const freshPreparedSession =
                await prepareBoundedSessionSignOut(sessionResult);
              const freshOwnerUserId = readOwnerUserId(sessionResult);
              if (!isCurrentEpoch()) return;
              if (!freshPreparedSession || !freshOwnerUserId) {
                setActivityGate("blocked");
                return;
              }
              baselinePreparedSession = freshPreparedSession;
              baselineOwnerUserId = freshOwnerUserId;
              sessionComparison = "matches";
            }
            if (sessionComparison === "changed") {
              beginChangedSessionTransition();
              return;
            }
            if (sessionComparison !== "matches") {
              setActivityGate("blocked");
              return;
            }

            // A focus that lands while the initial baseline was still loading
            // had no private tree to seal. Once the exact-A baseline exists,
            // it still acquires the same owner fence before any admission.
            fence ??= startSessionRecheckFence(epoch);
            if (fence) {
              await requireSettledWithin(
                () => fence?.ready ?? Promise.resolve(),
                AUTHORITATIVE_SESSION_READ_TIMEOUT_MS,
              );
            }
            if (!isCurrentEpoch()) return;
            if (
              activeOperationIdsRef.current.size > 0 ||
              committedOperationsInFlight.size > 0 ||
              pauseHandleRef.current ||
              composerPreparationRef.current ||
              !(await releaseReadySessionRecheckFences())
            ) {
              setActivityGate("blocked");
              return;
            }

            const ownerUserId = readOwnerUserId(sessionResult);
            if (!ownerUserId || !baselinePreparedSession) {
              setActivityGate("blocked");
              return;
            }
            const hydration = isVisualFixtureBrowserRequest()
              ? ("ready" as const)
              : await hydrateBoundedOwnerOfflineActivitySession(
                  ownerUserId,
                  baselinePreparedSession.binding,
                );
            if (!isCurrentEpoch()) return;
            if (hydration === "document_session_changed") {
              beginChangedSessionTransition();
              return;
            }
            setActivityGate(hydration === "ready" ? "ready" : "blocked");
            return;
          }
          if (!isCurrentEpoch()) return;
          if (confirmation === "signed_out") {
            await preparationPromiseRef.current?.catch(() => undefined);
            if (isCurrentEpoch()) beginSignedOutTransition();
            return;
          }
          setActivityGate("blocked");
        } catch {
          // A timeout, malformed response, failed owner fence, or stale
          // continuation remains payload-free until the user explicitly
          // starts a newer epoch.
          if (isCurrentEpoch()) setActivityGate("blocked");
        } finally {
          authoritativeRecheck = null;
        }
      })();
      authoritativeRecheck = recheck;
    };

    retryHydrationRef.current = recheckAuthoritativeSession;
    reloadSessionGateRef.current = reloadAfterSessionRecheckFence;

    const recheckStaleOperations = () => {
      if (disposed || staleOperationRecheck) return;
      const staleOperationIds = [...operationLastSeenAtRef.current]
        .filter(([, lastSeenAt]) => {
          return Date.now() - lastSeenAt >= REMOTE_PREPARATION_STALE_MS;
        })
        .map(([operationId]) => operationId);
      if (staleOperationIds.length === 0) return;

      staleOperationRecheck = (async () => {
        try {
          const sessionResult = await readBoundedAuthoritativeSession(
            readAuthoritativeSession,
          );
          const confirmation = classifySessionConfirmation(sessionResult);
          if (confirmation === "signed_out") {
            for (const operationId of staleOperationIds) {
              rememberTerminalOperation(
                terminalOperationIdsRef.current,
                operationId,
                SESSION_CONVERGENCE_SIGNALS.committed,
              );
            }
            activeOperationIdsRef.current.clear();
            operationLastSeenAtRef.current.clear();
            operationPreparationRoundsRef.current.clear();
            updateRemotePreparationFence();
            await preparationPromiseRef.current?.catch(() => undefined);
            beginSignedOutTransition();
            return;
          }
          if (confirmation !== "authenticated") {
            // Unknown stays frozen and is retried by the watchdog.
            return;
          }

          const sessionComparison =
            await compareFreshSessionToBaseline(sessionResult);
          if (sessionComparison === "changed") {
            beginChangedSessionTransition();
            return;
          }
          if (sessionComparison !== "matches") return;

          for (const operationId of staleOperationIds) {
            rememberTerminalOperation(
              terminalOperationIdsRef.current,
              operationId,
              SESSION_CONVERGENCE_SIGNALS.cancellation,
            );
            activeOperationIdsRef.current.delete(operationId);
            operationLastSeenAtRef.current.delete(operationId);
            operationPreparationRoundsRef.current.delete(operationId);
          }
          updateRemotePreparationFence();
          if (
            activeOperationIdsRef.current.size === 0 &&
            committedOperationsInFlight.size === 0
          ) {
            await resumeRemotePreparation();
          }
        } catch {
          // Unknown/recheck failure stays frozen and is retried.
        } finally {
          staleOperationRecheck = null;
        }
      })();
    };

    const unsubscribe = subscribeToSessionConvergence((payload) => {
      if (payload.signal === SESSION_CONVERGENCE_SIGNALS.preparation) {
        if (terminalOperationIdsRef.current.has(payload.operationId)) return;
        if (!payload.preparationRoundId || !tabLease) {
          return;
        }
        // This is intentionally synchronous and payload-free. It proves this
        // exact peer received the round before its asynchronous composer and
        // offline preparation begins; the later ready/failed result remains
        // the strict safety gate for every acknowledged peer.
        publishSignOutPreparationReceived(
          payload.operationId,
          tabLease.tabId,
          payload.preparationRoundId,
        );
        activeOperationIdsRef.current.add(payload.operationId);
        updateRemotePreparationFence();
        operationPreparationRoundsRef.current.set(
          payload.operationId,
          payload.preparationRoundId,
        );
        operationLastSeenAtRef.current.set(payload.operationId, Date.now());
        schedulePreparationRound(
          payload.operationId,
          payload.preparationRoundId,
        );
      } else if (payload.signal === SESSION_CONVERGENCE_SIGNALS.cancellation) {
        void cancelPreparation(payload.operationId);
      } else if (payload.signal === SESSION_CONVERGENCE_SIGNALS.committed) {
        void convergeCommittedSession(payload.operationId);
      }
    });

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      reloadAfterSessionRecheckFence();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recheckAuthoritativeSession();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", recheckAuthoritativeSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const watchdogInterval = window.setInterval(
      recheckStaleOperations,
      REMOTE_PREPARATION_WATCHDOG_MS,
    );

    return () => {
      disposed = true;
      retryHydrationRef.current = () => undefined;
      reloadSessionGateRef.current = () => undefined;
      fallbackExitRef.current = () => undefined;
      unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", recheckAuthoritativeSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(watchdogInterval);
      activeOperationIds.clear();
      operationLastSeenAt.clear();
      operationPreparationRounds.clear();
      preparationGenerationRef.current += 1;
      if (
        committedOperationsInFlight.size > 0 ||
        [...terminalOperationIds.values()].includes(
          SESSION_CONVERGENCE_SIGNALS.committed,
        )
      ) {
        tabLease?.release();
        return;
      }
      const pauseHandle = pauseHandleRef.current;
      if (pauseHandle) {
        void pauseHandle.resume().then(
          () => {
            if (pauseHandleRef.current === pauseHandle) {
              pauseHandleRef.current = null;
              const composerPreparation = composerPreparationRef.current;
              if (composerPreparation) {
                void composerPreparation.resume().then(
                  () => {
                    if (
                      composerPreparationRef.current === composerPreparation
                    ) {
                      composerPreparationRef.current = null;
                    }
                  },
                  () => undefined,
                );
              }
            }
          },
          () => undefined,
        );
      } else {
        const composerPreparation = composerPreparationRef.current;
        if (composerPreparation) {
          void composerPreparation.resume().then(
            () => {
              if (composerPreparationRef.current === composerPreparation) {
                composerPreparationRef.current = null;
              }
            },
            () => undefined,
          );
        }
      }
      tabLease?.release();
    };
  }, [locale, readAuthoritativeSession]);

  if (activityGate !== "ready") {
    const trustCopy = getTrustSurfaceCopy(locale);
    const copy = trustCopy.signOut;
    return (
      <div
        data-session-convergence-gate={activityGate}
        aria-busy={activityGate === "checking"}
        className="mx-auto grid min-h-40 w-full max-w-xl content-center gap-3 px-4 py-8 text-center"
      >
        {localeControlFallback ? (
          <div
            data-session-convergence-locale-control="true"
            className="justify-self-end"
          >
            {localeControlFallback}
          </div>
        ) : null}
        {activityGate === "checking" ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {copy.checking}
            </p>
            <SessionConvergenceSafeExits
              locale={locale}
              publicHomeLabel={trustCopy.authIntent.returnToReading}
              reloadLabel={copy.reloadAndRecheck}
              onReloadAndRecheck={() => reloadSessionGateRef.current()}
            />
          </>
        ) : (
          <>
            <p role="alert" className="font-medium text-foreground">
              {copy.errorTitle}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.localCheckError}
            </p>
            <BlockedSessionAccountMethods locale={locale} />
            <div className="grid justify-items-center gap-2">
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.fallbackExitDescription}
              </p>
              <Button
                ref={fallbackExitActionRef}
                type="button"
                variant="outline"
                data-session-convergence-fallback-sign-out="true"
                disabled={fallbackExitState === "pending"}
                onClick={() => fallbackExitRef.current()}
              >
                {fallbackExitState === "pending"
                  ? copy.fallbackExitPending
                  : copy.fallbackExitAction}
              </Button>
              {fallbackExitState === "failed" ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {copy.fallbackExitUnconfirmedError}
                </p>
              ) : null}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => retryHydrationRef.current()}
              >
                {copy.retry}
              </Button>
            </div>
            <SessionConvergenceSafeExits
              locale={locale}
              publicHomeLabel={trustCopy.authIntent.returnToReading}
              reloadLabel={copy.reloadAndRecheck}
              onReloadAndRecheck={() => reloadSessionGateRef.current()}
            />
          </>
        )}
      </div>
    );
  }
  return children;
}

function SessionConvergenceSafeExits({
  locale,
  publicHomeLabel,
  reloadLabel,
  onReloadAndRecheck,
}: {
  locale: InterfaceLocale;
  publicHomeLabel: string;
  reloadLabel: string;
  onReloadAndRecheck: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <a
        href={localizedPublicRoot(locale)}
        data-session-convergence-public-home="true"
        className="inline-flex min-h-9 items-center justify-center rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {publicHomeLabel}
      </a>
      <Button
        type="button"
        variant="outline"
        data-session-convergence-reload="true"
        onClick={onReloadAndRecheck}
      >
        {reloadLabel}
      </Button>
    </div>
  );
}

const MAX_TERMINAL_OPERATIONS = 128;

function rememberTerminalOperation(
  operations: Map<string, string>,
  operationId: string,
  signal: string,
) {
  if (
    operations.get(operationId) === SESSION_CONVERGENCE_SIGNALS.committed &&
    signal !== SESSION_CONVERGENCE_SIGNALS.committed
  ) {
    return;
  }
  operations.set(operationId, signal);
  if (operations.size <= MAX_TERMINAL_OPERATIONS) return;
  const oldestOperationId = operations.keys().next().value;
  if (oldestOperationId) operations.delete(oldestOperationId);
}

function readOwnerUserId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const response = result as {
    data?: null | { user?: { id?: unknown } };
    error?: unknown;
  };
  if (response.error || response.data === null) return null;
  const ownerUserId = response.data?.user?.id;
  return typeof ownerUserId === "string" && ownerUserId.trim()
    ? ownerUserId
    : null;
}

function startBestEffort(task: () => Promise<unknown>) {
  try {
    void task().catch(() => undefined);
  } catch {
    // A fresh document rehydrates only the authoritative owner/session
    // generation. Local fence cleanup is therefore best-effort after the old
    // private tree is hidden and hard navigation has begun.
  }
}

async function readBoundedAuthoritativeSession(
  readAuthoritativeSession: () => Promise<unknown>,
) {
  return requireSettledWithin(
    readAuthoritativeSession,
    AUTHORITATIVE_SESSION_READ_TIMEOUT_MS,
  );
}

async function prepareBoundedSessionSignOut(sessionResult: unknown) {
  return requireSettledWithin(
    () => prepareCurrentSessionSignOut(sessionResult),
    AUTHORITATIVE_SESSION_READ_TIMEOUT_MS,
  );
}

async function hydrateBoundedOwnerOfflineActivitySession(
  ownerUserId: string,
  sessionGeneration: string,
) {
  return requireSettledWithin(
    () => hydrateOwnerOfflineActivitySession(ownerUserId, sessionGeneration),
    AUTHORITATIVE_SESSION_READ_TIMEOUT_MS,
  );
}

function requireSettledWithin<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(
      () => settle(() => reject(new Error("Session convergence deadline"))),
      timeoutMs,
    );
    try {
      void operation().then(
        (value) => settle(() => resolve(value)),
        () => settle(() => reject(new Error("Session convergence failed"))),
      );
    } catch {
      settle(() => reject(new Error("Session convergence failed")));
    }
  });
}
