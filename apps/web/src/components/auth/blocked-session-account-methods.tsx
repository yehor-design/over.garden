"use client";

import { useEffect, useRef, useState } from "react";

import { AccountMethodsPanel } from "@/app/garden/account-methods-panel";
import { Button } from "@/components/ui/button";
import {
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  prepareCurrentSessionSignOut,
} from "@/lib/auth/sign-out-contract";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import type { AccountMethodProjection } from "@/server/auth/account-methods";

import { getBlockedSessionAccountMethods } from "./blocked-session-account-method-actions";

const ACCOUNT_METHODS_REQUEST_TIMEOUT_MS = 10_000;

type AccountMethodsState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; methods: AccountMethodProjection }
  | { kind: "unavailable" };

export function BlockedSessionAccountMethods({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).signOut;
  const [state, setState] = useState<AccountMethodsState>({ kind: "idle" });
  const requestInFlightRef = useRef(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1;
    };
  }, []);

  async function requestMethods() {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setState({ kind: "pending" });

    try {
      const result = await settleWithinAccountMethodsDeadline(
        readCurrentSessionMethods(),
      );
      if (requestGenerationRef.current !== generation) return;

      setState(
        result?.status === "ready"
          ? { kind: "ready", methods: result.methods }
          : { kind: "unavailable" },
      );
    } finally {
      if (requestGenerationRef.current === generation) {
        requestInFlightRef.current = false;
      }
    }
  }

  return (
    <section
      className="grid justify-items-center gap-3"
      aria-label={copy.blockedAccountMethodsRegionLabel}
      data-session-convergence-account-methods="true"
    >
      {state.kind === "ready" ? (
        <AccountMethodsPanel
          {...state.methods}
          facebookSignInEnabled={false}
          googleSignInEnabled={false}
          locale={locale}
          onMethodsChanged={() => void requestMethods()}
        />
      ) : (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.blockedAccountMethodsDescription}
          </p>
          <Button
            type="button"
            variant="outline"
            data-session-convergence-account-methods-open="true"
            disabled={state.kind === "pending"}
            onClick={() => void requestMethods()}
          >
            {state.kind === "pending"
              ? copy.blockedAccountMethodsPending
              : copy.blockedAccountMethodsAction}
          </Button>
          {state.kind === "unavailable" ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-session-convergence-account-methods-unavailable="true"
            >
              {copy.blockedAccountMethodsUnavailable}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

async function readCurrentSessionMethods() {
  const sessionResult = await authClient.getSession(
    AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  );
  const prepared = await prepareCurrentSessionSignOut(sessionResult);
  if (!prepared) return { status: "unavailable" } as const;

  return getBlockedSessionAccountMethods(prepared.binding);
}

async function settleWithinAccountMethodsDeadline<T>(request: Promise<T>) {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race<T | null>([
      request,
      new Promise<null>((resolve) => {
        timeoutId = globalThis.setTimeout(
          () => resolve(null),
          ACCOUNT_METHODS_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}
