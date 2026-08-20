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

import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  dispatchLocalExitReconciliation,
  localizedPublicRoot,
  reconcileLocalExitSession,
} from "@/lib/auth/sign-out-contract";
import {
  acquireAuthenticatedSessionTabLease,
  createSessionTabId,
  createSignOutOperationId,
  getCurrentAuthenticatedSessionTabId,
  publishLocalExitCommitted,
  type AuthenticatedSessionTabLease,
} from "@/lib/auth/session-convergence";
import { commitLocalExitInvalidationMarker } from "@/lib/auth/session-invalidation-marker";
import { sealOnlineJournalComposerParticipantsForExit } from "@/lib/garden/online-journal-composer-participants";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { LocalExitPublicSafeSurface } from "./local-exit-public-safe-surface";

type SignOutCopy = ReturnType<typeof getTrustSurfaceCopy>["signOut"];
type SignOutPhase = "idle" | "awaiting-confirmation" | "committed";

interface SignOutContextValue {
  copy: SignOutCopy;
  phase: SignOutPhase;
  requestSignOut(): void;
}

const SignOutContext = createContext<SignOutContextValue | null>(null);

export function SignOutProvider({
  children,
  locale,
  currentSessionBinding,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  currentSessionBinding: string | null;
}) {
  const trustCopy = getTrustSurfaceCopy(locale);
  const copy = trustCopy.signOut;
  const [phase, setPhase] = useState<SignOutPhase>("idle");
  const operationLockedRef = useRef(false);
  const confirmationOpenRef = useRef(false);
  const tabLeaseRef = useRef<AuthenticatedSessionTabLease | null>(null);

  useInterfaceLocaleChangeFormState({
    id: "sign-out-lifecycle",
    dirty: false,
    pending: phase === "awaiting-confirmation",
  });

  useEffect(() => {
    try {
      const lease = acquireAuthenticatedSessionTabLease();
      tabLeaseRef.current = lease;
      return () => {
        if (tabLeaseRef.current === lease) tabLeaseRef.current = null;
        lease.release();
      };
    } catch {
      tabLeaseRef.current = null;
      return undefined;
    }
  }, []);

  const requestSignOut = useCallback(() => {
    if (operationLockedRef.current || confirmationOpenRef.current) return;
    confirmationOpenRef.current = true;
    setPhase("awaiting-confirmation");
  }, []);

  const cancelSignOutConfirmation = useCallback(() => {
    if (!confirmationOpenRef.current || operationLockedRef.current) return;
    confirmationOpenRef.current = false;
    setPhase("idle");
  }, []);

  const confirmSignOut = useCallback(() => {
    if (!confirmationOpenRef.current || operationLockedRef.current) return;
    operationLockedRef.current = true;
    confirmationOpenRef.current = false;

    // This order is the complete user-visible exit transaction. Every step is
    // synchronous and cookie/network/IndexedDB independent. The first promise
    // is created only by reconciliation after the public-safe commit and the
    // durable-navigation decision.
    const committed = commitLocalExitInvalidationMarker();
    sealOnlineJournalComposerParticipantsForExit();
    const operationId = createSignOutOperationId();
    const tabId =
      tabLeaseRef.current?.tabId ??
      getCurrentAuthenticatedSessionTabId() ??
      createSessionTabId();
    publishLocalExitCommitted(operationId, tabId);
    flushSync(() => setPhase("committed"));
    if (committed.status === "persisted") {
      window.location.replace(localizedPublicRoot(locale));
      dispatchLocalExitReconciliation(currentSessionBinding, committed.marker);
      return;
    }
    void reconcileLocalExitSession(
      currentSessionBinding,
      committed.marker,
    ).then((result) => {
      if (result === "response_observed") {
        window.location.replace(localizedPublicRoot(locale));
      }
    });
  }, [currentSessionBinding, locale]);

  const value = useMemo<SignOutContextValue>(
    () => ({ copy, phase, requestSignOut }),
    [copy, phase, requestSignOut],
  );
  const confirmationOpen = phase === "awaiting-confirmation";

  return (
    <SignOutContext.Provider value={value}>
      {phase === "committed" ? (
        <LocalExitPublicSafeSurface locale={locale} />
      ) : (
        children
      )}
      <AlertDialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (!open) cancelSignOutConfirmation();
        }}
      >
        <AlertDialogContent data-sign-out-confirmation="true">
          <AlertDialogTitle>{copy.confirmationTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {copy.confirmationDescription}
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={cancelSignOutConfirmation}
            >
              {copy.confirmationCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-sign-out-confirm-action="true"
              onClick={confirmSignOut}
            >
              {copy.confirmationAction}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
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
