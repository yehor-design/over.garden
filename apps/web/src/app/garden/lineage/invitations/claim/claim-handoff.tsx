"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  LINEAGE_CLAIM_HANDOFF_PATH,
  LINEAGE_INVITATION_CLAIM_PATH,
  lineageClaimTokenFromHash,
} from "@/lib/lineage/claim-handoff";

type LineageClaimHandoffState = "preparing" | "retry" | "unavailable";

export function LineageClaimHandoff() {
  const tokenRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LineageClaimHandoffState>("preparing");

  useEffect(() => {
    const token =
      tokenRef.current ?? lineageClaimTokenFromHash(window.location.hash);
    if (!token) {
      const unavailableTimer = window.setTimeout(() => {
        setState("unavailable");
      }, 0);
      return () => window.clearTimeout(unavailableTimer);
    }
    tokenRef.current = token;

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
        } | null;
        if (cancelled) return;

        const outcome = classifyLineageClaimHandoffResponse(
          response.status,
          body?.next,
        );
        if (outcome !== "success") {
          tokenRef.current = outcome === "unavailable" ? null : token;
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
    };
  }, [attempt]);

  if (state === "unavailable") {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        This lineage invitation is unavailable, expired, or already handled.
      </p>
    );
  }

  if (state === "retry") {
    return (
      <section className="grid gap-3 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-sm font-semibold text-foreground">
            We could not prepare the invitation
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The invitation is still available on this device. Try the secure
            handoff again.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setState("preparing");
            setAttempt((current) => current + 1);
          }}
        >
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </section>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-lg border border-border p-4 text-sm text-muted-foreground"
    >
      Preparing the private invitation...
    </p>
  );
}

export function classifyLineageClaimHandoffResponse(
  status: number,
  next: unknown,
): "success" | "retry" | "unavailable" {
  if (status === 400) return "unavailable";
  if (status < 200 || status >= 300) return "retry";
  return next === LINEAGE_INVITATION_CLAIM_PATH ? "success" : "retry";
}
