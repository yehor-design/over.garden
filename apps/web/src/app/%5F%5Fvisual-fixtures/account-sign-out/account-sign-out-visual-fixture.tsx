"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SessionConvergenceBoundary } from "@/components/auth/session-convergence-boundary";
import { SignOutControl } from "@/components/auth/sign-out-control";
import { SignOutProvider } from "@/components/auth/sign-out-provider";
import { runBrowserAuthMutation } from "@/lib/auth/browser-auth-mutation-coordinator";
import {
  clearSessionInvalidationMarkerIfCurrent,
  commitLocalExitInvalidationMarker,
  readSessionInvalidationMarker,
} from "@/lib/auth/session-invalidation-marker";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { registerOnlineJournalComposerParticipant } from "@/lib/garden/online-journal-composer-participants";

const SYNTHETIC_OWNER_ID = "00000000-0000-4000-8000-000000000287";
const SYNTHETIC_OWNER_BINDING = "X".repeat(43);
const SYNTHETIC_SESSION_STATE_KEY =
  "overgarden:fixture:ove287:authoritative-session";
const REMOVAL_DURATION_KEY = "overgarden:fixture:ove287:removal-duration";
const ACTIVE_AT_REMOVAL_KEY = "overgarden:fixture:ove287:active-at-removal";
const PRIVATE_SELECTOR = '[data-account-sign-out-private="true"]';
let syntheticComposerLifetime = new AbortController();

interface AccountSignOutFixtureController {
  armRemovalMeasurement(): void;
  establishAuthoritativeSession(): Promise<"completed" | "stale_operation">;
  replaceLocalExitGeneration(): void;
  simulateLocalExitBfCacheRestore(): void;
}

declare global {
  interface Window {
    __ove287AccountSignOutFixture?: AccountSignOutFixtureController;
  }
}

const SESSION_A = Object.freeze({
  data: {
    session: { id: "visual-account-sign-out-session-a" },
    user: { id: SYNTHETIC_OWNER_ID },
  },
  error: null,
});
const SESSION_B = Object.freeze({
  data: {
    session: { id: "visual-account-sign-out-session-b" },
    user: { id: SYNTHETIC_OWNER_ID },
  },
  error: null,
});

export function AccountSignOutVisualFixture({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const measurementStartedAtRef = useRef<number | null>(null);
  const activeLifetimeAtConfirmationRef = useRef<AbortSignal | null>(null);
  const readAuthoritativeSession = useCallback(async () => {
    return window.sessionStorage.getItem(SYNTHETIC_SESSION_STATE_KEY) === "B"
      ? SESSION_B
      : SESSION_A;
  }, []);

  useEffect(() => {
    sessionStorage.removeItem(REMOVAL_DURATION_KEY);
    sessionStorage.removeItem(ACTIVE_AT_REMOVAL_KEY);
    const recordRemoval = () => {
      const startedAt = measurementStartedAtRef.current;
      if (startedAt === null || document.querySelector(PRIVATE_SELECTOR)) {
        return;
      }
      measurementStartedAtRef.current = null;
      sessionStorage.setItem(
        REMOVAL_DURATION_KEY,
        String(performance.now() - startedAt),
      );
      sessionStorage.setItem(
        ACTIVE_AT_REMOVAL_KEY,
        String(
          activeLifetimeAtConfirmationRef.current !== null &&
            !activeLifetimeAtConfirmationRef.current.aborted,
        ),
      );
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-sign-out-confirm-action="true"]')
      ) {
        measurementStartedAtRef.current = performance.now();
        activeLifetimeAtConfirmationRef.current =
          syntheticComposerLifetime.signal;
      }
    };
    const observer = new MutationObserver(recordRemoval);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("click", handleClick, true);

    const controller: AccountSignOutFixtureController = {
      armRemovalMeasurement: () => {
        measurementStartedAtRef.current = performance.now();
        activeLifetimeAtConfirmationRef.current =
          syntheticComposerLifetime.signal;
      },
      establishAuthoritativeSession: async () => {
        const result = await runBrowserAuthMutation({
          kind: "session_establishment",
          operation: async () => ({ established: true }),
          confirmsAuthoritativeSession: async ({ established }) => established,
        });
        if (result.status === "completed") {
          sessionStorage.setItem(SYNTHETIC_SESSION_STATE_KEY, "B");
        }
        return result.status;
      },
      replaceLocalExitGeneration: () => {
        const previous = readSessionInvalidationMarker();
        clearSessionInvalidationMarkerIfCurrent(previous);
        commitLocalExitInvalidationMarker();
      },
      simulateLocalExitBfCacheRestore: () => {
        measurementStartedAtRef.current = performance.now();
        commitLocalExitInvalidationMarker();
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        );
      },
    };
    window.__ove287AccountSignOutFixture = controller;
    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      if (window.__ove287AccountSignOutFixture === controller) {
        delete window.__ove287AccountSignOutFixture;
      }
    };
  }, []);

  return (
    <SessionConvergenceBoundary
      locale={locale}
      currentSessionBinding={SYNTHETIC_OWNER_BINDING}
      authoritativeSessionRead={readAuthoritativeSession}
      recheckMode="effect_closed_non_fencing"
    >
      <SignOutProvider
        locale={locale}
        currentSessionBinding={SYNTHETIC_OWNER_BINDING}
      >
        <SyntheticPrivateAccountSurface locale={locale} />
      </SignOutProvider>
    </SessionConvergenceBoundary>
  );
}

function SyntheticPrivateAccountSurface({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    syntheticComposerLifetime = new AbortController();
    const unregister = registerOnlineJournalComposerParticipant({
      freeze: () => undefined,
      flushLatest: async () => undefined,
      resume: () => undefined,
      abort: () => syntheticComposerLifetime.abort(),
    });
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      unregister();
      syntheticComposerLifetime.abort();
    };
  }, []);

  return (
    <main
      lang={locale}
      data-account-sign-out-private="true"
      data-account-sign-out-fixture-ready={ready ? "true" : "false"}
      className="mx-auto grid max-w-xl gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">
        OVE-287 synthetic private account
      </h1>
      <p>One synthetic in-memory online composer is active.</p>
      <SignOutControl presentation="profile" />
    </main>
  );
}
