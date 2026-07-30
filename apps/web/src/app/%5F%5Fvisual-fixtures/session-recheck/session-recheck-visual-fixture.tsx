"use client";

import { useCallback, useEffect, useRef } from "react";

import { SessionConvergenceBoundary } from "@/components/auth/session-convergence-boundary";

interface SessionRecheckFixtureController {
  stallNextRead(): void;
  releaseStalledRead(): void;
}

declare global {
  interface Window {
    __ove236SessionRecheckFixture?: SessionRecheckFixtureController;
  }
}

const SYNTHETIC_SESSION = Object.freeze({
  data: {
    session: { id: "visual-session-recheck-fixture-a" },
    user: { id: "visual-session-recheck-fixture-owner" },
  },
  error: null,
});

/** Synthetic private surface used only by the guarded browser-race harness. */
export function SessionRecheckVisualFixture() {
  const stalledReadRef = useRef<(() => void) | null>(null);
  const stallNextReadRef = useRef(false);
  const readAuthoritativeSession = useCallback(() => {
    if (!stallNextReadRef.current) {
      return Promise.resolve(SYNTHETIC_SESSION);
    }
    stallNextReadRef.current = false;
    return new Promise<unknown>((resolve) => {
      stalledReadRef.current = () => {
        stalledReadRef.current = null;
        resolve(SYNTHETIC_SESSION);
      };
    });
  }, []);

  useEffect(() => {
    const controller: SessionRecheckFixtureController = {
      stallNextRead: () => {
        stallNextReadRef.current = true;
      },
      releaseStalledRead: () => {
        stalledReadRef.current?.();
      },
    };
    window.__ove236SessionRecheckFixture = controller;
    return () => {
      if (window.__ove236SessionRecheckFixture === controller) {
        delete window.__ove236SessionRecheckFixture;
      }
    };
  }, []);

  return (
    <SessionConvergenceBoundary
      locale="uk"
      authoritativeSessionRead={readAuthoritativeSession}
    >
      <main data-session-recheck-private-fixture="true">
        <h1>Synthetic session recheck fixture</h1>
        <button type="button" data-session-recheck-private-action="true">
          Synthetic private action
        </button>
      </main>
    </SessionConvergenceBoundary>
  );
}
