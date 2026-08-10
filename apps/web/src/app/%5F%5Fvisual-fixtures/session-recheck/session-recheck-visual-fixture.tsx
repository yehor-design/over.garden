"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SessionConvergenceBoundary } from "@/components/auth/session-convergence-boundary";
import {
  SESSION_CONVERGENCE_CHANNEL,
  SESSION_CONVERGENCE_SIGNALS,
} from "@/lib/auth/session-convergence";
import {
  commitSessionInvalidationMarker,
  readSessionInvalidationMarker,
} from "@/lib/auth/session-invalidation-marker";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { SessionRecheckMode } from "@/lib/interface-route-policy";

type FixtureReadOutcome =
  | "exact"
  | "unknown"
  | "rejected"
  | "signed_out"
  | "different_owner";

interface SessionConvergenceFixtureSnapshot {
  loadCount: number;
  markerStatus: "absent" | "present" | "unknown" | "unavailable";
  readCount: number;
  sameOwnerPreHideObserved: boolean;
}

interface SessionConvergenceFixtureController {
  emitPeerCommittedInvalidation(): Promise<number>;
  releaseStalledRead(outcome: FixtureReadOutcome): void;
  setNextReadOutcome(outcome: FixtureReadOutcome): void;
  simulateMarkedBfCacheRestore(): void;
  snapshot(): SessionConvergenceFixtureSnapshot;
  stallNextRead(): void;
  switchToSameOwnerSession(): void;
}

declare global {
  interface Window {
    __ove286SessionConvergenceFixture?: SessionConvergenceFixtureController;
  }
}

const CURRENT_SESSION_KEY = "overgarden:fixture:ove286:session";
const LOAD_COUNT_KEY = "overgarden:fixture:ove286:load-count";
const SAME_OWNER_PRE_HIDE_KEY = "overgarden:fixture:ove286:same-owner-pre-hide";
const SYNTHETIC_OWNER_ID = "visual-session-recheck-fixture-owner";
const FIXTURE_COPY: Record<
  InterfaceLocale,
  { localeControl: string; privateAction: string; title: string }
> = {
  uk: {
    localeControl: "Синтетичний перемикач мови",
    privateAction: "Синтетична приватна дія",
    title: "Синтетичний сценарій узгодження сеансу",
  },
  bg: {
    localeControl: "Синтетичен превключвател на езика",
    privateAction: "Синтетично частно действие",
    title: "Синтетичен сценарий за съгласуване на сесията",
  },
  ru: {
    localeControl: "Синтетический переключатель языка",
    privateAction: "Синтетическое приватное действие",
    title: "Синтетический сценарий согласования сеанса",
  },
};
const SYNTHETIC_SESSION_A = Object.freeze({
  data: {
    session: { id: "visual-session-recheck-fixture-session-a" },
    user: { id: SYNTHETIC_OWNER_ID },
  },
  error: null,
});
const SYNTHETIC_SESSION_B = Object.freeze({
  data: {
    session: { id: "visual-session-recheck-fixture-session-b" },
    user: { id: SYNTHETIC_OWNER_ID },
  },
  error: null,
});
const SYNTHETIC_DIFFERENT_OWNER_SESSION = Object.freeze({
  data: {
    session: { id: "visual-session-recheck-fixture-other-session" },
    user: { id: "visual-session-recheck-fixture-other-owner" },
  },
  error: null,
});

/** Synthetic private surface used only by the guarded browser-race harness. */
export function SessionRecheckVisualFixture({
  initialRead = "exact",
  locale = "uk",
  recheckMode = "effect_closed_non_fencing",
}: {
  initialRead?: "exact" | "stall";
  locale?: InterfaceLocale;
  recheckMode?: SessionRecheckMode;
}) {
  const [actionCount, setActionCount] = useState(0);
  const [localeCount, setLocaleCount] = useState(0);
  const copy = FIXTURE_COPY[locale];
  const loadCountRef = useRef(0);
  const readCountRef = useRef(0);
  const stalledReadRef = useRef<((outcome: FixtureReadOutcome) => void) | null>(
    null,
  );
  const stallNextReadRef = useRef(initialRead === "stall");
  const nextReadOutcomeRef = useRef<FixtureReadOutcome>("exact");

  const readAuthoritativeSession = useCallback(() => {
    readCountRef.current += 1;
    if (stallNextReadRef.current) {
      stallNextReadRef.current = false;
      return new Promise<unknown>((resolve, reject) => {
        stalledReadRef.current = (outcome) => {
          stalledReadRef.current = null;
          settleFixtureRead(outcome, resolve, reject);
        };
      });
    }

    const outcome = nextReadOutcomeRef.current;
    nextReadOutcomeRef.current = "exact";
    return fixtureRead(outcome);
  }, []);

  useEffect(() => {
    const previousLoadCount = Number.parseInt(
      window.sessionStorage.getItem(LOAD_COUNT_KEY) ?? "0",
      10,
    );
    loadCountRef.current = Number.isFinite(previousLoadCount)
      ? previousLoadCount + 1
      : 1;
    window.sessionStorage.setItem(LOAD_COUNT_KEY, String(loadCountRef.current));

    const controller: SessionConvergenceFixtureController = {
      emitPeerCommittedInvalidation: () => {
        const removal = measurePrivateTreeRemoval();
        commitSessionInvalidationMarker();
        const channel = new window.BroadcastChannel(
          SESSION_CONVERGENCE_CHANNEL,
        );
        const suffix = `${Date.now().toString(36)}-ove286`;
        channel.postMessage({
          version: 2,
          operationId: `op-${suffix}`,
          messageId: `msg-${suffix}`,
          tabId: `tab-${suffix}`,
          preparationRoundId: null,
          signal: SESSION_CONVERGENCE_SIGNALS.committed,
          phaseRank: 3,
          sentAt: Date.now(),
        });
        channel.close();
        return removal;
      },
      releaseStalledRead: (outcome) => {
        stalledReadRef.current?.(outcome);
      },
      setNextReadOutcome: (outcome) => {
        nextReadOutcomeRef.current = outcome;
      },
      simulateMarkedBfCacheRestore: () => {
        commitSessionInvalidationMarker();
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        );
      },
      snapshot: () => ({
        loadCount: loadCountRef.current,
        markerStatus: readSessionInvalidationMarker().status,
        readCount: readCountRef.current,
        sameOwnerPreHideObserved:
          window.sessionStorage.getItem(SAME_OWNER_PRE_HIDE_KEY) === "true",
      }),
      stallNextRead: () => {
        stallNextReadRef.current = true;
      },
      switchToSameOwnerSession: () => {
        window.sessionStorage.setItem(SAME_OWNER_PRE_HIDE_KEY, "false");
        const observer = new MutationObserver(() => {
          if (
            !document.querySelector(
              '[data-session-recheck-private-fixture="true"]',
            )
          ) {
            window.sessionStorage.setItem(SAME_OWNER_PRE_HIDE_KEY, "true");
          }
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        window.addEventListener("pagehide", () => observer.disconnect(), {
          once: true,
        });
        window.sessionStorage.setItem(CURRENT_SESSION_KEY, "session-b");
        window.dispatchEvent(new Event("focus"));
      },
    };
    window.__ove286SessionConvergenceFixture = controller;
    return () => {
      if (window.__ove286SessionConvergenceFixture === controller) {
        delete window.__ove286SessionConvergenceFixture;
      }
    };
  }, []);

  const localeControl = (
    <button
      type="button"
      data-testid="session-recheck-locale-control"
      onClick={() => setLocaleCount((count) => count + 1)}
    >
      {copy.localeControl}
    </button>
  );

  return (
    <SessionConvergenceBoundary
      locale={locale}
      localeControlFallback={localeControl}
      authoritativeSessionRead={readAuthoritativeSession}
      recheckMode={recheckMode}
    >
      <main data-testid="session-recheck-fixture" lang={locale}>
        <section data-session-recheck-private-fixture="true">
          <h1>{copy.title}</h1>
          <form
            data-testid="session-recheck-editor-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <button
              type="button"
              data-session-recheck-private-action="true"
              data-testid="session-recheck-private-action"
              onClick={() => setActionCount((count) => count + 1)}
            >
              {copy.privateAction}
            </button>
          </form>
          {localeControl}
          <output data-testid="session-recheck-action-count">
            {actionCount}
          </output>
          <output data-testid="session-recheck-locale-count">
            {localeCount}
          </output>
        </section>
      </main>
    </SessionConvergenceBoundary>
  );
}

function fixtureRead(outcome: FixtureReadOutcome): Promise<unknown> {
  return new Promise((resolve, reject) => {
    settleFixtureRead(outcome, resolve, reject);
  });
}

function settleFixtureRead(
  outcome: FixtureReadOutcome,
  resolve: (value: unknown) => void,
  reject: (reason?: unknown) => void,
) {
  if (outcome === "rejected") {
    reject(new Error("Synthetic session read rejection"));
    return;
  }
  if (outcome === "unknown") {
    resolve({ data: undefined });
    return;
  }
  if (outcome === "signed_out") {
    resolve({ data: null });
    return;
  }
  if (outcome === "different_owner") {
    resolve(SYNTHETIC_DIFFERENT_OWNER_SESSION);
    return;
  }
  resolve(currentSyntheticSession());
}

function currentSyntheticSession() {
  return window.sessionStorage.getItem(CURRENT_SESSION_KEY) === "session-b"
    ? SYNTHETIC_SESSION_B
    : SYNTHETIC_SESSION_A;
}

function measurePrivateTreeRemoval() {
  const startedAt = performance.now();
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      if (
        document.querySelector('[data-session-recheck-private-fixture="true"]')
      ) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve(performance.now() - startedAt);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      reject(new Error("Synthetic private tree was not removed."));
    }, 1_000);
    finish();
  });
}
