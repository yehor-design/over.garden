"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import {
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  confirmPreparedCurrentSession,
  localizedPublicRoot,
  prepareCurrentSessionSignOut,
  signOutCurrentSessionOnce,
  type PreparedCurrentSessionSignOut,
} from "@/lib/auth/sign-out-contract";
import {
  acquireAuthenticatedSessionTabLease,
  createPreparationAcknowledgementBarrier,
  createPreparationRoundId,
  createSignOutOperationId,
  getCurrentAuthenticatedSessionTabId,
  publishCommittedSessionInvalidation,
  publishSignOutPreparation,
  publishSignOutPreparationCancelled,
  type AuthenticatedSessionTabLease,
  type PreparationAcknowledgementBarrier,
} from "@/lib/auth/session-convergence";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  prepareOwnerComposerParticipants,
  type OwnerComposerPreparationHandle,
} from "@/lib/offline/owner-composer-participants";
import {
  abortOwnerSyncAttempts,
  finalizeOwnerOfflineActivityForSessionChange,
  pauseOwnerOfflineActivity,
  purgeUnsyncedOwnerData,
  summarizeUnsyncedOwnerData,
  type OwnerOfflineActivityPauseHandle,
  type UnsyncedOwnerDataSummary,
} from "@/lib/offline/owner-session-lifecycle";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

type SignOutCopy = ReturnType<typeof getTrustSurfaceCopy>["signOut"];
type SignOutPhase =
  | "idle"
  | "checking"
  | "waiting-for-choice"
  | "signing-out"
  | "error";
type SignOutErrorKind =
  | "local-check"
  | "purge"
  | "server-active"
  | "server-unconfirmed"
  | "server-after-purge-active"
  | "server-after-purge-unconfirmed";

interface SignOutState {
  phase: SignOutPhase;
  summary?: UnsyncedOwnerDataSummary;
  errorKind?: SignOutErrorKind;
}

interface SignOutContextValue {
  copy: SignOutCopy;
  phase: SignOutPhase;
  requestSignOut(): Promise<void>;
}

const SignOutContext = createContext<SignOutContextValue | null>(null);
const SIGN_OUT_OPERATION_HEARTBEAT_MS = 15_000;

export function SignOutProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).signOut;
  const [state, setState] = useState<SignOutState>({ phase: "idle" });
  const [authoritativeTransition, setAuthoritativeTransition] = useState(false);
  const operationLockedRef = useRef(false);
  const ownerUserIdRef = useRef<string | null>(null);
  const pauseHandleRef = useRef<OwnerOfflineActivityPauseHandle | null>(null);
  const composerPreparationRef = useRef<OwnerComposerPreparationHandle | null>(
    null,
  );
  const preparedCurrentSessionRef =
    useRef<PreparedCurrentSessionSignOut | null>(null);
  const tabLeaseRef = useRef<AuthenticatedSessionTabLease | null>(null);
  const acknowledgementBarrierRef =
    useRef<PreparationAcknowledgementBarrier | null>(null);
  const convergenceOperationIdRef = useRef<string | null>(null);
  const preparationPublishedRef = useRef(false);
  const operationHeartbeatRef = useRef<number | null>(null);
  const heartbeatInFlightRef = useRef(false);
  const canonicalRequestMayHaveCommittedRef = useRef(false);
  const authoritativeTransitionRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const hideAuthenticatedTree = useCallback(() => {
    if (authoritativeTransitionRef.current) return;
    authoritativeTransitionRef.current = true;
    // React may batch state updates across this async mutation. Force the
    // privacy gate into the committed DOM before hard navigation begins.
    flushSync(() => setAuthoritativeTransition(true));
  }, []);

  const stopOperationHeartbeat = useCallback(() => {
    if (operationHeartbeatRef.current === null) return;
    window.clearInterval(operationHeartbeatRef.current);
    operationHeartbeatRef.current = null;
  }, []);

  const publishRenewedPreparation = useCallback(
    async (operationId: string, tabId: string, preparationRoundId: string) => {
      const composerPreparation = composerPreparationRef.current;
      const pauseHandle = pauseHandleRef.current;
      if (!composerPreparation || !pauseHandle) {
        throw new Error("Sign-out preparation is unavailable.");
      }
      await composerPreparation.flushLatest();
      await pauseHandle.renewPreparationLease();
      publishSignOutPreparation(operationId, tabId, preparationRoundId);
      preparationPublishedRef.current = true;
    },
    [],
  );

  const startOperationHeartbeat = useCallback(
    (operationId: string, tabId: string) => {
      stopOperationHeartbeat();
      operationHeartbeatRef.current = window.setInterval(() => {
        if (heartbeatInFlightRef.current) return;
        heartbeatInFlightRef.current = true;
        void publishRenewedPreparation(
          operationId,
          tabId,
          createPreparationRoundId(),
        )
          .catch(() => {
            stopOperationHeartbeat();
            setState({ phase: "error", errorKind: "local-check" });
            operationLockedRef.current = false;
          })
          .finally(() => {
            heartbeatInFlightRef.current = false;
          });
      }, SIGN_OUT_OPERATION_HEARTBEAT_MS);
    },
    [publishRenewedPreparation, stopOperationHeartbeat],
  );

  const awaitRemotePreparation = useCallback(
    async (operationId: string, tabId: string) => {
      const preparationRoundId = createPreparationRoundId();
      const acknowledgementBarrier = createPreparationAcknowledgementBarrier(
        operationId,
        tabId,
        preparationRoundId,
      );
      acknowledgementBarrierRef.current = acknowledgementBarrier;
      try {
        // Observe peer failure immediately while the local durable flush runs,
        // avoiding a transient unhandled rejection on a fast failed ACK.
        await Promise.all([
          acknowledgementBarrier.wait(),
          publishRenewedPreparation(operationId, tabId, preparationRoundId),
        ]);
      } finally {
        acknowledgementBarrier.cancel();
        if (acknowledgementBarrierRef.current === acknowledgementBarrier) {
          acknowledgementBarrierRef.current = null;
        }
      }
    },
    [publishRenewedPreparation],
  );

  const resumePreparedActivity = useCallback(async () => {
    if (canonicalRequestMayHaveCommittedRef.current) {
      // Once the irreversible request may have reached the server, only an
      // authoritative same-session result may release the durable fence.
      return false;
    }
    const pauseHandle = pauseHandleRef.current;
    if (pauseHandle) {
      try {
        await pauseHandle.resume();
      } catch {
        // Keep the operation, remote-tab pause and composer freeze intact. A
        // later retry can finish deleting the durable pause token safely.
        return false;
      }
    }

    pauseHandleRef.current = null;
    const composerPreparation = composerPreparationRef.current;
    if (composerPreparation) {
      try {
        await composerPreparation.resume();
      } catch {
        return false;
      }
    }
    composerPreparationRef.current = null;
    stopOperationHeartbeat();
    const acknowledgementBarrier = acknowledgementBarrierRef.current;
    acknowledgementBarrierRef.current = null;
    acknowledgementBarrier?.cancel();

    if (preparationPublishedRef.current) {
      const operationId = convergenceOperationIdRef.current;
      const tabId =
        tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
      if (operationId && tabId) {
        publishSignOutPreparationCancelled(operationId, tabId);
      }
      preparationPublishedRef.current = false;
    }
    convergenceOperationIdRef.current = null;
    preparedCurrentSessionRef.current = null;
    return true;
  }, [stopOperationHeartbeat]);

  const redirectAfterConfirmedSignOut = useCallback(() => {
    // Server authority has already established that the old session is gone.
    // Hide the old authenticated tree before any best-effort local cleanup or
    // hard navigation can yield back to React.
    hideAuthenticatedTree();
    const operationId =
      convergenceOperationIdRef.current ?? createSignOutOperationId();
    const tabId =
      tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
    if (tabId) publishCommittedSessionInvalidation(operationId, tabId);
    convergenceOperationIdRef.current = null;
    window.location.replace(localizedPublicRoot(locale));
  }, [hideAuthenticatedTree, locale]);

  const finalizeConfirmedSignOut = useCallback(() => {
    stopOperationHeartbeat();
    hideAuthenticatedTree();
    const pauseHandle = pauseHandleRef.current;
    pauseHandleRef.current = null;
    // Successful sign-out must never resume discarded/frozen React memory.
    composerPreparationRef.current = null;
    acknowledgementBarrierRef.current?.cancel();
    acknowledgementBarrierRef.current = null;
    preparedCurrentSessionRef.current = null;
    canonicalRequestMayHaveCommittedRef.current = false;
    if (pauseHandle) {
      startBestEffort(() => pauseHandle.finalizeForSignedOut());
    }
    redirectAfterConfirmedSignOut();
    return true;
  }, [
    hideAuthenticatedTree,
    redirectAfterConfirmedSignOut,
    stopOperationHeartbeat,
  ]);

  const hardReloadChangedSession = useCallback(() => {
    stopOperationHeartbeat();
    // A fresh authoritative read proved that this document's session A has
    // become session B. Never leave A's private tree visible while IndexedDB
    // cleanup is pending or unavailable.
    hideAuthenticatedTree();
    const pauseHandle = pauseHandleRef.current;
    const ownerUserId = ownerUserIdRef.current;
    const preparedCurrentSession = preparedCurrentSessionRef.current;
    if (pauseHandle) {
      startBestEffort(() => pauseHandle.finalizeForSessionChange());
    } else if (ownerUserId && preparedCurrentSession) {
      startBestEffort(() =>
        finalizeOwnerOfflineActivityForSessionChange(
          ownerUserId,
          preparedCurrentSession.binding,
        ),
      );
    }
    pauseHandleRef.current = null;
    // Never resume state prepared under session A into session B.
    composerPreparationRef.current = null;
    acknowledgementBarrierRef.current?.cancel();
    acknowledgementBarrierRef.current = null;
    const operationId = convergenceOperationIdRef.current;
    const tabId =
      tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
    if (tabId) {
      publishCommittedSessionInvalidation(
        operationId ?? createSignOutOperationId(),
        tabId,
      );
    }
    preparationPublishedRef.current = false;
    convergenceOperationIdRef.current = null;
    preparedCurrentSessionRef.current = null;
    canonicalRequestMayHaveCommittedRef.current = false;
    window.location.replace(window.location.href);
    return true;
  }, [hideAuthenticatedTree, stopOperationHeartbeat]);

  const performCanonicalSignOut = useCallback(
    async (afterApprovedPurge: boolean) => {
      setState({ phase: "signing-out" });
      const preparedCurrentSession = preparedCurrentSessionRef.current;
      if (!preparedCurrentSession) {
        if (!afterApprovedPurge) await resumePreparedActivity();
        setState({ phase: "error", errorKind: "server-unconfirmed" });
        operationLockedRef.current = false;
        return;
      }
      const pauseHandle = pauseHandleRef.current;
      if (!pauseHandle) {
        setState({ phase: "error", errorKind: "local-check" });
        operationLockedRef.current = false;
        return;
      }
      // Mark this document irreversible before awaiting IndexedDB so unmount
      // cannot race a successful promotion with ordinary resume cleanup.
      canonicalRequestMayHaveCommittedRef.current = true;
      try {
        // This durable commit_pending fence must land before the canonical
        // auth request itself is dispatched.
        await pauseHandle.promoteToCommitFence();
      } catch {
        if (!afterApprovedPurge) {
          canonicalRequestMayHaveCommittedRef.current = false;
          await resumePreparedActivity();
        }
        setState({
          phase: "error",
          errorKind: afterApprovedPurge
            ? "server-after-purge-unconfirmed"
            : "local-check",
        });
        operationLockedRef.current = false;
        return;
      }
      const result = await signOutCurrentSessionOnce(
        preparedCurrentSession,
        authClient,
      ).catch(
        () =>
          ({
            status: "failed",
            reason: "session_confirmation_unavailable",
          }) as const,
      );

      if (result.status === "committed") {
        await finalizeConfirmedSignOut();
        return;
      }

      if (result.reason === "session_changed") {
        await hardReloadChangedSession();
        return;
      }

      if (result.reason === "session_still_active" && !afterApprovedPurge) {
        canonicalRequestMayHaveCommittedRef.current = false;
        await resumePreparedActivity();
      }

      setState({
        phase: "error",
        errorKind:
          result.reason === "session_still_active"
            ? afterApprovedPurge
              ? "server-after-purge-active"
              : "server-active"
            : afterApprovedPurge
              ? "server-after-purge-unconfirmed"
              : "server-unconfirmed",
      });
      operationLockedRef.current = false;
    },
    [
      finalizeConfirmedSignOut,
      hardReloadChangedSession,
      resumePreparedActivity,
    ],
  );

  const reconcileUnknownCanonicalAttempt = useCallback(
    async (afterApprovedPurge: boolean) => {
      const preparedCurrentSession = preparedCurrentSessionRef.current;
      if (!preparedCurrentSession) {
        setState({
          phase: "error",
          errorKind: afterApprovedPurge
            ? "server-after-purge-unconfirmed"
            : "server-unconfirmed",
        });
        operationLockedRef.current = false;
        return;
      }

      setState({ phase: "signing-out" });
      const confirmation = await confirmPreparedCurrentSession(
        preparedCurrentSession,
        authClient,
      );
      if (confirmation.status === "signed_out") {
        await finalizeConfirmedSignOut();
        return;
      }
      if (confirmation.status === "changed") {
        await hardReloadChangedSession();
        return;
      }
      if (confirmation.status === "matches") {
        // The same A session is authoritative, so a retry can safely reuse the
        // exact prepared binding and durable operation.
        await performCanonicalSignOut(afterApprovedPurge);
        return;
      }

      setState({
        phase: "error",
        errorKind: afterApprovedPurge
          ? "server-after-purge-unconfirmed"
          : "server-unconfirmed",
      });
      operationLockedRef.current = false;
    },
    [
      finalizeConfirmedSignOut,
      hardReloadChangedSession,
      performCanonicalSignOut,
    ],
  );

  const hardReloadUnknownCanonicalAttempt = useCallback(() => {
    stopOperationHeartbeat();
    // Do not remove commit_pending, resume composer memory, or publish a
    // cancellation. The new document and every peer must authoritatively
    // recheck the session while the old generation stays fenced.
    composerPreparationRef.current = null;
    acknowledgementBarrierRef.current?.cancel();
    acknowledgementBarrierRef.current = null;
    const operationId = convergenceOperationIdRef.current;
    const tabId =
      tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
    if (tabId) {
      publishCommittedSessionInvalidation(
        operationId ?? createSignOutOperationId(),
        tabId,
      );
    }
    preparationPublishedRef.current = false;
    convergenceOperationIdRef.current = null;
    preparedCurrentSessionRef.current = null;
    window.location.replace(window.location.href);
  }, [stopOperationHeartbeat]);

  const requestSignOut = useCallback(async () => {
    if (operationLockedRef.current) return;
    operationLockedRef.current = true;
    setState({ phase: "checking" });

    try {
      const sessionResult = await authClient.getSession(
        AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
      );
      const preparedCurrentSession =
        await prepareCurrentSessionSignOut(sessionResult);
      if (preparedCurrentSession === null) {
        redirectAfterConfirmedSignOut();
        return;
      }
      preparedCurrentSessionRef.current = preparedCurrentSession;
      const ownerUserId = readOwnerUserId(sessionResult);
      if (!ownerUserId) throw new Error("Session owner unavailable.");
      ownerUserIdRef.current = ownerUserId;
      const tabId =
        tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
      if (!tabId) {
        throw new Error("Authenticated tab presence unavailable.");
      }
      const composerPreparation =
        await prepareOwnerComposerParticipants(ownerUserId);
      composerPreparationRef.current = composerPreparation;
      const operationId = createSignOutOperationId();
      convergenceOperationIdRef.current = operationId;
      const pauseHandle = await pauseOwnerOfflineActivity(ownerUserId, {
        operationId,
        sessionGeneration: preparedCurrentSession.binding,
      });
      pauseHandleRef.current = pauseHandle;
      composerPreparation.bindOfflineActivityScope(pauseHandle);
      abortOwnerSyncAttempts(ownerUserId);
      await pauseHandle.waitForSyncDrain();
      await awaitRemotePreparation(operationId, tabId);
      startOperationHeartbeat(operationId, tabId);
      const summary = await summarizeUnsyncedOwnerData(
        ownerUserId,
        pauseHandle,
      );

      if (summary.hasUnsyncedData) {
        setState({ phase: "waiting-for-choice", summary });
        operationLockedRef.current = false;
        return;
      }

      await performCanonicalSignOut(false);
    } catch {
      await resumePreparedActivity();
      setState({ phase: "error", errorKind: "local-check" });
      operationLockedRef.current = false;
    }
  }, [
    awaitRemotePreparation,
    performCanonicalSignOut,
    redirectAfterConfirmedSignOut,
    resumePreparedActivity,
    startOperationHeartbeat,
  ]);

  const staySignedIn = useCallback(async () => {
    if (operationLockedRef.current) return;
    operationLockedRef.current = true;
    const resumed = await resumePreparedActivity();
    operationLockedRef.current = false;
    if (!resumed) {
      setState({ phase: "error", errorKind: "local-check" });
      return;
    }
    ownerUserIdRef.current = null;
    setState({ phase: "idle" });
  }, [resumePreparedActivity]);

  const syncFirst = useCallback(async () => {
    if (operationLockedRef.current) return;
    operationLockedRef.current = true;
    const resumed = await resumePreparedActivity();
    operationLockedRef.current = false;
    if (!resumed) {
      setState({ phase: "error", errorKind: "local-check" });
      return;
    }
    ownerUserIdRef.current = null;
    setState({ phase: "idle" });
    window.location.assign("/garden#drafts");
  }, [resumePreparedActivity]);

  const discardAndSignOut = useCallback(async () => {
    if (operationLockedRef.current) return;
    const ownerUserId = ownerUserIdRef.current;
    if (!ownerUserId) {
      await requestSignOut();
      return;
    }

    operationLockedRef.current = true;
    setState({ phase: "signing-out" });

    const preparedCurrentSession = preparedCurrentSessionRef.current;
    if (!preparedCurrentSession) {
      const resumed = await resumePreparedActivity();
      setState({
        phase: "error",
        errorKind: resumed ? "server-unconfirmed" : "local-check",
      });
      operationLockedRef.current = false;
      return;
    }

    const operationId = convergenceOperationIdRef.current;
    const tabId =
      tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
    if (!operationId || !tabId) {
      const resumed = await resumePreparedActivity();
      setState({
        phase: "error",
        errorKind: resumed ? "server-unconfirmed" : "local-check",
      });
      operationLockedRef.current = false;
      return;
    }

    try {
      // A background tab may have safely released a stale preparation. Renew
      // the full cross-tab quorum immediately before any destructive action.
      await awaitRemotePreparation(operationId, tabId);
      const pauseHandle = pauseHandleRef.current;
      if (!pauseHandle) {
        throw new Error("Sign-out owner activity scope is unavailable.");
      }
      const refreshedSummary = await summarizeUnsyncedOwnerData(
        ownerUserId,
        pauseHandle,
      );
      if (
        refreshedSummary.hasUnsyncedData &&
        !summariesMatch(refreshedSummary, state.summary)
      ) {
        setState({ phase: "waiting-for-choice", summary: refreshedSummary });
        operationLockedRef.current = false;
        return;
      }
    } catch {
      await resumePreparedActivity();
      setState({ phase: "error", errorKind: "local-check" });
      operationLockedRef.current = false;
      return;
    }

    const beforePurge = await confirmPreparedCurrentSession(
      preparedCurrentSession,
      authClient,
    );
    if (beforePurge.status === "signed_out") {
      // Skip destructive local work, but let the canonical helper perform its
      // idempotent cookie clear for a stale/no-row Better Auth cookie.
      await performCanonicalSignOut(false);
      return;
    }
    if (beforePurge.status !== "matches") {
      if (beforePurge.status === "changed") {
        await hardReloadChangedSession();
        return;
      }
      const resumed = await resumePreparedActivity();
      setState({
        phase: "error",
        errorKind: !resumed ? "local-check" : "server-unconfirmed",
      });
      operationLockedRef.current = false;
      return;
    }

    try {
      const pauseHandle = pauseHandleRef.current;
      if (!pauseHandle) {
        throw new Error("Sign-out owner activity scope is unavailable.");
      }
      await purgeUnsyncedOwnerData(ownerUserId, pauseHandle);
    } catch {
      await resumePreparedActivity();
      setState({ phase: "error", errorKind: "purge" });
      operationLockedRef.current = false;
      return;
    }

    const afterPurge = await confirmPreparedCurrentSession(
      preparedCurrentSession,
      authClient,
    );
    if (afterPurge.status === "signed_out") {
      await performCanonicalSignOut(true);
      return;
    }
    if (afterPurge.status !== "matches") {
      if (afterPurge.status === "changed") {
        await hardReloadChangedSession();
        return;
      }
      setState({
        phase: "error",
        errorKind: "server-after-purge-unconfirmed",
      });
      operationLockedRef.current = false;
      return;
    }

    await performCanonicalSignOut(true);
  }, [
    awaitRemotePreparation,
    hardReloadChangedSession,
    performCanonicalSignOut,
    requestSignOut,
    resumePreparedActivity,
    state.summary,
  ]);

  const retryAfterError = useCallback(async () => {
    if (operationLockedRef.current) return;

    if (
      state.errorKind === "server-unconfirmed" ||
      state.errorKind === "server-after-purge-unconfirmed"
    ) {
      operationLockedRef.current = true;
      await reconcileUnknownCanonicalAttempt(
        state.errorKind === "server-after-purge-unconfirmed",
      );
      return;
    }

    if (isAfterPurgeServerError(state.errorKind)) {
      operationLockedRef.current = true;
      await performCanonicalSignOut(true);
      return;
    }

    if (isBeforePurgeServerError(state.errorKind)) {
      await requestSignOut();
      return;
    }

    const resumed = await resumePreparedActivity();
    if (resumed) await requestSignOut();
  }, [
    performCanonicalSignOut,
    requestSignOut,
    reconcileUnknownCanonicalAttempt,
    resumePreparedActivity,
    state.errorKind,
  ]);

  const dismissError = useCallback(async () => {
    if (operationLockedRef.current) return;
    operationLockedRef.current = true;

    if (
      state.errorKind === "server-unconfirmed" ||
      state.errorKind === "server-after-purge-unconfirmed"
    ) {
      hardReloadUnknownCanonicalAttempt();
      return;
    }

    if (isAfterPurgeServerError(state.errorKind)) {
      const pauseHandle = pauseHandleRef.current;
      try {
        if (pauseHandle) await pauseHandle.finalizeForHardReload();
      } catch {
        operationLockedRef.current = false;
        return;
      }
      pauseHandleRef.current = null;
      composerPreparationRef.current = null;
      acknowledgementBarrierRef.current = null;
      stopOperationHeartbeat();
      if (preparationPublishedRef.current) {
        const operationId = convergenceOperationIdRef.current;
        const tabId =
          tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
        if (operationId && tabId) {
          publishSignOutPreparationCancelled(operationId, tabId);
        }
        preparationPublishedRef.current = false;
      }
      convergenceOperationIdRef.current = null;
      preparedCurrentSessionRef.current = null;
      canonicalRequestMayHaveCommittedRef.current = false;
      window.location.replace(window.location.href);
      return;
    }

    const resumed = await resumePreparedActivity();
    operationLockedRef.current = false;
    if (!resumed) return;
    ownerUserIdRef.current = null;
    setState({ phase: "idle" });
  }, [
    hardReloadUnknownCanonicalAttempt,
    resumePreparedActivity,
    state.errorKind,
    stopOperationHeartbeat,
  ]);

  useEffect(() => {
    try {
      const lease = acquireAuthenticatedSessionTabLease();
      tabLeaseRef.current = lease;
      return () => {
        stopOperationHeartbeat();
        if (tabLeaseRef.current === lease) tabLeaseRef.current = null;
        lease.release();
      };
    } catch {
      tabLeaseRef.current = null;
      return undefined;
    }
  }, [stopOperationHeartbeat]);

  useEffect(() => {
    const tabId =
      tabLeaseRef.current?.tabId ?? getCurrentAuthenticatedSessionTabId();
    return () => {
      const completeCancellation = async () => {
        if (canonicalRequestMayHaveCommittedRef.current) return;
        const composerPreparation = composerPreparationRef.current;
        if (composerPreparation) {
          try {
            await composerPreparation.resume();
          } catch {
            return;
          }
          if (composerPreparationRef.current === composerPreparation) {
            composerPreparationRef.current = null;
          }
        }
        acknowledgementBarrierRef.current?.cancel();
        acknowledgementBarrierRef.current = null;
        const operationId = convergenceOperationIdRef.current;
        if (preparationPublishedRef.current && operationId && tabId) {
          publishSignOutPreparationCancelled(operationId, tabId);
        }
        preparationPublishedRef.current = false;
        convergenceOperationIdRef.current = null;
        preparedCurrentSessionRef.current = null;
      };
      const pauseHandle = pauseHandleRef.current;
      if (canonicalRequestMayHaveCommittedRef.current) return;
      if (pauseHandle) {
        void pauseHandle.resume().then(
          () => {
            if (pauseHandleRef.current === pauseHandle) {
              pauseHandleRef.current = null;
              void completeCancellation();
            }
          },
          () => undefined,
        );
      } else {
        void completeCancellation();
      }
    };
  }, [stopOperationHeartbeat]);

  useEffect(() => {
    if (state.phase !== "error") return;
    errorRef.current?.focus();
  }, [state.phase]);

  const value = useMemo<SignOutContextValue>(
    () => ({ copy, phase: state.phase, requestSignOut }),
    [copy, requestSignOut, state.phase],
  );
  const dialogOpen =
    state.phase === "waiting-for-choice" || state.phase === "error";

  return (
    <SignOutContext.Provider value={value}>
      {authoritativeTransition ? (
        <div
          data-session-convergence-gate="authoritative-transition"
          aria-busy="true"
          className="mx-auto grid min-h-40 w-full max-w-xl content-center px-4 py-8 text-center"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {copy.signingOut}
          </p>
        </div>
      ) : (
        children
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {state.phase === "checking"
          ? copy.checking
          : state.phase === "signing-out"
            ? copy.signingOut
            : ""}
      </p>
      <Sheet
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          if (state.phase === "waiting-for-choice") void staySignedIn();
          if (state.phase === "error" && !isHardReloadError(state.errorKind)) {
            void dismissError();
          }
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-h-dvh w-full max-w-xl overflow-y-auto rounded-t-2xl p-0"
        >
          {state.phase === "waiting-for-choice" && state.summary ? (
            <>
              <SheetHeader className="gap-2 border-b border-border p-5 sm:p-6">
                <SheetTitle className="text-xl">{copy.dialogTitle}</SheetTitle>
                <SheetDescription className="leading-6">
                  {copy.dialogDescription}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-5 py-4 sm:px-6">
                <ul className="grid gap-1 text-sm text-foreground">
                  <li>
                    {formatCount(copy.draftsCount, state.summary.draftCount)}
                  </li>
                  <li>
                    {formatCount(
                      copy.mutationsCount,
                      state.summary.mutationCount,
                    )}
                  </li>
                  <li>
                    {formatCount(copy.mediaCount, state.summary.mediaCount)}
                  </li>
                </ul>
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy.acceptedMutationCaveat}
                </p>
              </div>
              <SheetFooter className="gap-2 border-t border-border p-5 sm:p-6">
                <Button type="button" onClick={() => void staySignedIn()}>
                  {copy.staySignedIn}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void syncFirst()}
                >
                  {copy.syncFirst}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void discardAndSignOut()}
                >
                  {copy.discardAndSignOut}
                </Button>
              </SheetFooter>
            </>
          ) : state.phase === "error" && state.errorKind ? (
            <>
              <SheetHeader className="gap-2 border-b border-border p-5 sm:p-6">
                <SheetTitle className="text-xl">{copy.errorTitle}</SheetTitle>
                <SheetDescription
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                  className="leading-6 outline-none"
                >
                  {errorMessage(copy, state.errorKind)}
                </SheetDescription>
              </SheetHeader>
              <SheetFooter className="gap-2 p-5 sm:p-6">
                <Button type="button" onClick={() => void retryAfterError()}>
                  {copy.retry}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void dismissError()}
                >
                  {errorDismissLabel(copy, state.errorKind)}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SignOutContext.Provider>
  );
}

export function useSignOut() {
  const value = useContext(SignOutContext);
  if (!value) {
    throw new Error("SignOutControl must be rendered inside SignOutProvider.");
  }
  return value;
}

function readOwnerUserId(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    throw new Error("Session confirmation unavailable.");
  }
  const response = result as {
    data?: null | { user?: { id?: unknown } };
    error?: unknown;
  };
  if (response.error) throw new Error("Session confirmation unavailable.");
  if (response.data === null) return null;
  const ownerUserId = response.data?.user?.id;
  if (typeof ownerUserId !== "string" || ownerUserId.trim().length === 0) {
    throw new Error("Session owner unavailable.");
  }
  return ownerUserId;
}

function formatCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

function summariesMatch(
  current: UnsyncedOwnerDataSummary,
  previous: UnsyncedOwnerDataSummary | undefined,
) {
  if (!previous) return false;
  return (
    current.hasUnsyncedData === previous.hasUnsyncedData &&
    current.totalCount === previous.totalCount &&
    current.draftCount === previous.draftCount &&
    current.mutationCount === previous.mutationCount &&
    current.mediaCount === previous.mediaCount &&
    current.statusCounts.queued === previous.statusCounts.queued &&
    current.statusCounts.syncing === previous.statusCounts.syncing &&
    current.statusCounts.failed === previous.statusCounts.failed
  );
}

function errorMessage(copy: SignOutCopy, kind: SignOutErrorKind) {
  if (kind === "local-check") return copy.localCheckError;
  if (kind === "purge") return copy.purgeError;
  if (kind === "server-active") return copy.signOutActiveError;
  if (kind === "server-unconfirmed") return copy.signOutUnconfirmedError;
  if (kind === "server-after-purge-active") {
    return copy.signOutAfterPurgeActiveError;
  }
  return copy.signOutAfterPurgeUnconfirmedError;
}

function errorDismissLabel(copy: SignOutCopy, kind: SignOutErrorKind) {
  if (kind === "server-after-purge-active") {
    return copy.reloadAndStaySignedIn;
  }
  if (
    kind === "server-unconfirmed" ||
    kind === "server-after-purge-unconfirmed"
  ) {
    return copy.reloadAndRecheck;
  }
  return copy.dismissError;
}

function isBeforePurgeServerError(kind: SignOutErrorKind | undefined) {
  return kind === "server-active" || kind === "server-unconfirmed";
}

function isAfterPurgeServerError(kind: SignOutErrorKind | undefined) {
  return (
    kind === "server-after-purge-active" ||
    kind === "server-after-purge-unconfirmed"
  );
}

function isHardReloadError(kind: SignOutErrorKind | undefined) {
  return isAfterPurgeServerError(kind) || kind === "server-unconfirmed";
}

function startBestEffort(task: () => Promise<unknown>) {
  try {
    void task().catch(() => undefined);
  } catch {
    // The authoritative hard navigation is the privacy boundary. A local
    // cleanup failure is recovered by owner/session-generation hydration in
    // the next document and must never keep the old private tree visible.
  }
}
