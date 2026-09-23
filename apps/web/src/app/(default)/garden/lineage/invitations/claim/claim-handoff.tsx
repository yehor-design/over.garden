"use client";

import { ArrowCounterClockwiseIcon as RotateCcw } from "@/components/icons/ArrowCounterClockwise";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  LINEAGE_CLAIM_HANDOFF_PATH,
  LINEAGE_INVITATION_CLAIM_PATH,
  lineageClaimTokenFromHash,
} from "@/lib/lineage/claim-handoff";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";
import { InvitationStatePanel } from "./state-panel";

type LineageClaimHandoffOutcome = "success" | "retry" | "expired" | "invalid";
type LineageClaimHandoffState =
  | "idle"
  | "preparing"
  | "missing"
  | Exclude<LineageClaimHandoffOutcome, "success">;

/** The page's own invitation, which a newer link in the address replaces. */
export const LINEAGE_INVITATION_REGION_ATTRIBUTE =
  "data-lineage-invitation-region";

/**
 * Takes the token from the address's fragment — which never reaches a server
 * log — hands it to the handoff route, and removes it from the address before
 * anything else can read it. Each way this can end has its own sentence
 * (`OVE-495`, criterion 9): no link, a broken link, an expired one, or a
 * request that never came back, which keeps the token to try again.
 */
export function LineageClaimHandoff({
  locale,
  replacing = false,
}: {
  locale: InterfaceLocale;
  /**
   * The device already holds an invitation, and the page shows it. A link
   * opened now carries another one in its fragment, which the server never
   * sees: without this, a second invitation opened within the first one's
   * thirty minutes showed the first (`OVE-495`, criterion 9). With a token in
   * the address, the shown invitation is hidden and replaced; without one,
   * nothing happens.
   */
  replacing?: boolean;
}) {
  const copy = getOwnerLineageCopy(locale).invitation;
  const tokenRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LineageClaimHandoffState>(
    replacing ? "idle" : "preparing",
  );

  useEffect(() => {
    const token =
      tokenRef.current ?? lineageClaimTokenFromHash(window.location.hash);
    if (!token) {
      if (replacing) return;
      const missingTimer = window.setTimeout(() => {
        setState("missing");
      }, 0);
      return () => window.clearTimeout(missingTimer);
    }
    tokenRef.current = token;
    let preparingTimer: number | undefined;
    if (replacing) {
      // The stored invitation's controls must not be pressed for the new one.
      for (const region of document.querySelectorAll(
        `[${LINEAGE_INVITATION_REGION_ATTRIBUTE}]`,
      )) {
        region.setAttribute("hidden", "");
      }
      preparingTimer = window.setTimeout(() => {
        setState("preparing");
      }, 0);
    }

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    let cancelled = false;
    void fetch(LINEAGE_CLAIM_HANDOFF_PATH, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          next?: unknown;
          error?: unknown;
        } | null;
        if (cancelled) return;

        const outcome = classifyLineageClaimHandoffResponse(
          response.status,
          body,
        );
        if (outcome !== "success") {
          tokenRef.current = outcome === "retry" ? token : null;
          setState(outcome);
          return;
        }

        tokenRef.current = null;
        window.location.replace(LINEAGE_INVITATION_CLAIM_PATH);
      })
      .catch(() => {
        if (!cancelled) setState("retry");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(preparingTimer);
    };
  }, [attempt, replacing]);

  if (state === "idle") return null;

  if (state === "missing") {
    return (
      <InvitationStatePanel
        state="missing"
        tone="info"
        title={copy.handoff.missingTitle}
        body={copy.handoff.missingBody}
      />
    );
  }

  if (state === "expired") {
    return (
      <InvitationStatePanel
        state="expired"
        tone="warning"
        title={copy.states.expiredTitle}
        body={copy.states.expiredBody}
      />
    );
  }

  if (state === "invalid") {
    return (
      <InvitationStatePanel
        state="invalid"
        tone="warning"
        title={copy.states.invalidTitle}
        body={copy.states.invalidBody}
      />
    );
  }

  if (state === "retry") {
    return (
      <InvitationStatePanel
        state="retry"
        tone="danger"
        title={copy.handoff.errorTitle}
        body={copy.handoff.retryDescription}
        action={
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={() => {
              setState("preparing");
              setAttempt((current) => current + 1);
            }}
          >
            <RotateCcw aria-hidden="true" />
            {copy.handoff.retry}
          </Button>
        }
      />
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      data-invitation-state="preparing"
      className="rounded-lg border border-border p-4 text-body-sm text-text-muted"
    >
      {copy.handoff.preparing}
    </p>
  );
}

export function classifyLineageClaimHandoffResponse(
  status: number,
  body: { next?: unknown; error?: unknown } | null,
): LineageClaimHandoffOutcome {
  if (status === 400) {
    return body?.error === "lineage_invitation_expired" ? "expired" : "invalid";
  }
  if (status < 200 || status >= 300) return "retry";
  return body?.next === LINEAGE_INVITATION_CLAIM_PATH ? "success" : "retry";
}
