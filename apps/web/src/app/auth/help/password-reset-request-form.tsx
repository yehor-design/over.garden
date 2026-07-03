"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  pilotPasswordResetRedirectUrl,
  PILOT_AUTH_RESET_PASSWORD_PATH,
} from "@/lib/auth/pilot-auth-recovery";
import { authClient } from "@/lib/auth-client";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function requestPasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage("Enter the email address for your OverGarden account.");
      return;
    }

    setIsPending(true);
    setMessage("");

    const { error } = await authClient.requestPasswordReset({
      email: trimmedEmail,
      redirectTo: passwordResetRedirectUrl(),
    });

    setIsPending(false);

    if (error) {
      setMessage(
        error.message ??
          "Could not send a reset link right now. Closed-pilot support can still help.",
      );
      return;
    }

    setMessage(
      "If that email has an OverGarden account, a one-time reset link is on its way.",
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-5">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">
          Email a reset link
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Use the same email address as your existing garden. The link sets a
          new password for that account.
        </p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
        Send reset link
      </Button>

      {message ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function passwordResetRedirectUrl(): string {
  if (typeof window === "undefined") return PILOT_AUTH_RESET_PASSWORD_PATH;

  return pilotPasswordResetRedirectUrl(window.location.origin);
}
