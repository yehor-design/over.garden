"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth-client";
import { announceSessionSignal } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

type SignOutCopy = ReturnType<typeof getTrustSurfaceCopy>["signOut"];
type SignOutPhase = "idle" | "awaiting-confirmation" | "committed";

interface SignOutContextValue {
  copy: SignOutCopy;
  phase: SignOutPhase;
  requestSignOut(): void;
}

const SignOutContext = createContext<SignOutContextValue | null>(null);

/**
 * Sign-out is one server call followed by a hard navigation to the home page;
 * every other tab of this browser follows through the session signal (D6).
 */
export function SignOutProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).signOut;
  const [phase, setPhase] = useState<SignOutPhase>("idle");
  const committedRef = useRef(false);

  const requestSignOut = useCallback(() => {
    if (committedRef.current) return;
    setPhase("awaiting-confirmation");
  }, []);

  const cancelSignOutConfirmation = useCallback(() => {
    if (committedRef.current) return;
    setPhase("idle");
  }, []);

  const confirmSignOut = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    setPhase("committed");
    const homePath = localizedPath(locale, "/");
    void authClient
      .signOut()
      .catch(() => undefined)
      .then(() => {
        announceSessionSignal({ type: "signed_out", ownerUserId: null });
        window.location.replace(homePath);
      });
  }, [locale]);

  const value = useMemo<SignOutContextValue>(
    () => ({ copy, phase, requestSignOut }),
    [copy, phase, requestSignOut],
  );

  return (
    <SignOutContext.Provider value={value}>
      {children}
      <AlertDialog
        open={phase === "awaiting-confirmation"}
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
