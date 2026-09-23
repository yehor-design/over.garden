"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { announceSessionSignal } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import { getTrustClientCopy } from "@/lib/trust-client-copy";
import { useOnDemandComponent } from "@/lib/use-on-demand-component";

type SignOutCopy = ReturnType<typeof getTrustClientCopy>["signOut"];

/**
 * The confirmation and the auth client arrive when a reader asks to sign out
 * (`OVE-468`). A guest never does, and both used to be in every page's script:
 * the dialog's focus trap and scroll lock, and Better Auth's client with its
 * fetch layer. The request is state set on the press, so a press that lands
 * before the dialog's code does is kept, not lost: the dialog opens when it
 * arrives.
 */
const loadConfirmation = () =>
  import("./sign-out-confirmation").then(
    (module) => module.SignOutConfirmation,
  );

function loadAuthClient() {
  return import("@/lib/auth-client").then((module) => module.authClient);
}

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
  const copy = getTrustClientCopy(locale).signOut;
  const [phase, setPhase] = useState<SignOutPhase>("idle");
  // Mounted from the first request on, so a cancelled dialog can close with
  // its own transition rather than vanish.
  const { Component: SignOutConfirmation, request: requestConfirmation } =
    useOnDemandComponent(loadConfirmation);
  const committedRef = useRef(false);

  const requestSignOut = useCallback(() => {
    if (committedRef.current) return;
    // The client is fetched while the reader reads the question.
    void loadAuthClient().catch(() => undefined);
    setPhase("awaiting-confirmation");
    void requestConfirmation().then((ready) => {
      // A question that could not be fetched was never asked: the control goes
      // back to how it was, and the next press asks again.
      if (!ready && !committedRef.current) setPhase("idle");
    });
  }, [requestConfirmation]);

  const cancelSignOutConfirmation = useCallback(() => {
    if (committedRef.current) return;
    setPhase("idle");
  }, []);

  const confirmSignOut = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    setPhase("committed");
    const homePath = localizedPath(locale, "/");
    void loadAuthClient()
      .then((authClient) => authClient.signOut())
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
      {SignOutConfirmation ? (
        <SignOutConfirmation
          open={phase === "awaiting-confirmation"}
          copy={copy}
          onCancel={cancelSignOutConfirmation}
          onConfirm={confirmSignOut}
        />
      ) : null}
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
