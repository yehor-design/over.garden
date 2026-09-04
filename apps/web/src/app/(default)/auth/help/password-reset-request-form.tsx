"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AUTH_RESET_PASSWORD_PATH,
  passwordResetRedirectUrl,
} from "@/lib/auth/auth-recovery";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

export function PasswordResetRequestForm({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).authHelp.reset;
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function requestPasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage(copy.emailRequired);
      return;
    }

    setIsPending(true);
    setMessage("");

    try {
      const { error } = await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: currentPasswordResetRedirectUrl(),
      });

      if (error) {
        setMessage(copy.error);
        return;
      }

      setMessage(copy.success);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-5">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {copy.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">{copy.email}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          required
        />
      </label>

      <Button
        type="button"
        onClick={requestPasswordReset}
        disabled={isPending}
        className="w-fit"
      >
        <Mail className="size-4" />
        {isPending ? copy.pending : copy.submit}
      </Button>

      {message ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function currentPasswordResetRedirectUrl(): string {
  if (typeof window === "undefined") return AUTH_RESET_PASSWORD_PATH;

  return passwordResetRedirectUrl(window.location.origin);
}
