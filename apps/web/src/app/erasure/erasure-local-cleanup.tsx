"use client";

import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  confirmPreparedCurrentSession,
  prepareCurrentSessionSignOut,
} from "@/lib/auth/sign-out-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { eraseCurrentDeviceOwnerOfflineStore } from "@/lib/offline/owner-session-lifecycle";
import { fetchAuthenticatedOwnerVaultBinding } from "@/lib/offline/owner-vault";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

type CleanupState =
  | "idle"
  | "confirming"
  | "pending"
  | "confirmed"
  | "unconfirmed";

export function ErasureLocalCleanup({ locale }: { locale: InterfaceLocale }) {
  const copy = getTrustSurfaceCopy(locale).erasure.localCleanup;
  const [state, setState] = useState<CleanupState>("idle");

  const executeCleanup = async () => {
    if (state === "pending") return;
    setState("pending");
    try {
      const sessionResult = await authClient.getSession(
        AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
      );
      const ownerUserId = readOwnerUserId(sessionResult);
      const preparedSession = await prepareCurrentSessionSignOut(sessionResult);
      if (!ownerUserId || !preparedSession) {
        setState("unconfirmed");
        return;
      }
      const binding = await fetchAuthenticatedOwnerVaultBinding(
        preparedSession.binding,
      );
      if (!binding) {
        setState("unconfirmed");
        return;
      }
      const confirmation = await confirmPreparedCurrentSession(preparedSession);
      if (confirmation.status !== "matches") {
        setState("unconfirmed");
        return;
      }
      const receipt = await eraseCurrentDeviceOwnerOfflineStore(
        ownerUserId,
        binding,
      );
      setState(
        receipt.status === "erased_confirmed" ? "confirmed" : "unconfirmed",
      );
    } catch {
      setState("unconfirmed");
    }
  };

  return (
    <section
      className="grid gap-3 rounded-lg border border-destructive/40 p-4"
      data-erasure-local-cleanup="true"
    >
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      {state === "confirming" ? (
        <div className="grid gap-3" role="alertdialog" aria-modal="false">
          <p className="text-sm leading-6 text-foreground">
            {copy.confirmation}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void executeCleanup()}
            >
              {copy.confirm}
            </button>
            <button
              type="button"
              className={buttonVariants({ variant: "outline" })}
              onClick={() => setState("idle")}
            >
              {copy.cancel}
            </button>
          </div>
        </div>
      ) : state === "idle" ? (
        <button
          type="button"
          className={buttonVariants({
            variant: "destructive",
            className: "justify-self-start",
          })}
          onClick={() => setState("confirming")}
        >
          {copy.action}
        </button>
      ) : (
        <div className="grid gap-3">
          <p
            className="text-sm leading-6 text-foreground"
            role="status"
            aria-live="polite"
          >
            {state === "pending"
              ? copy.pending
              : state === "confirmed"
                ? copy.confirmed
                : copy.unconfirmed}
          </p>
          {state === "unconfirmed" ? (
            <button
              type="button"
              className={buttonVariants({
                variant: "outline",
                className: "justify-self-start",
              })}
              onClick={() => setState("confirming")}
            >
              {copy.retry}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function readOwnerUserId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const response = result as {
    data?: null | { user?: { id?: unknown } };
    error?: unknown;
  };
  const ownerUserId = response.error ? null : response.data?.user?.id;
  return typeof ownerUserId === "string" && ownerUserId.trim()
    ? ownerUserId
    : null;
}
