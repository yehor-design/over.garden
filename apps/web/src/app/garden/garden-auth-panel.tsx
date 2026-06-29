"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ActivationSource } from "@/lib/garden/entry-contracts";
import {
  interpretAuthClientErrorMessage,
  LOCAL_DEV_DEFAULT_EMAIL,
  LOCAL_DEV_DEFAULT_NAME,
  LOCAL_DEV_DEFAULT_PASSWORD,
  PILOT_AUTH_HELP_PATH,
  shouldUseLocalDevAuthDefaults,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";
import { authClient } from "@/lib/auth-client";

interface GardenAuthPanelProps {
  activationSource?: ActivationSource;
  catalogName?: string | null;
}

export function GardenAuthPanel({
  activationSource = "direct_garden",
  catalogName,
}: GardenAuthPanelProps) {
  const router = useRouter();
  const useDevDefaults = shouldUseLocalDevAuthDefaults();
  const [email, setEmail] = useState(
    useDevDefaults ? LOCAL_DEV_DEFAULT_EMAIL : "",
  );
  const [password, setPassword] = useState(
    useDevDefaults ? LOCAL_DEV_DEFAULT_PASSWORD : "",
  );
  const [name, setName] = useState(
    useDevDefaults ? LOCAL_DEV_DEFAULT_NAME : "",
  );
  const [message, setMessage] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  async function signUp() {
    setIsPending(true);
    setMessage("");

    const { error } = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: name.trim() || email.trim().split("@")[0] || "Gardener",
    });

    setIsPending(false);

    if (error) {
      setMessage(
        interpretAuthClientErrorMessage(error) ??
          "Could not create an account. Try again.",
      );
      return;
    }

    router.refresh();
  }

  async function signIn() {
    setIsPending(true);
    setMessage("");

    const { error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });

    setIsPending(false);

    if (error) {
      setMessage(
        interpretAuthClientErrorMessage(error) ??
          "Could not sign in. Check your email and password.",
      );
      return;
    }

    router.refresh();
  }

  return (
    <section
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4"
      data-testid="garden-auth-panel"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Garden workspace
        </h2>
        <p className="text-sm text-muted-foreground">
          {authPrompt({ activationSource, catalogName })}
        </p>
      </div>

      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-sm">
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            minLength={8}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">
            Name for new accounts
          </span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={signUp} disabled={isPending}>
          Create account
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={signIn}
          disabled={isPending}
        >
          Sign in
        </Button>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        {signInRecoveryHint()}{" "}
        <Link
          href={PILOT_AUTH_HELP_PATH}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign-in help
        </Link>
      </p>

      {message ? (
        <p className="text-sm text-destructive" data-testid="garden-auth-message">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function authPrompt({
  activationSource,
  catalogName,
}: {
  activationSource: ActivationSource;
  catalogName?: string | null;
}) {
  if (activationSource === "public_variety" && catalogName) {
    return `Sign in or create an account to start a private journal entry for ${catalogName}. Use the same email each time so your garden stays in one place.`;
  }

  if (activationSource === "homepage") {
    return "Sign in or create an account when you are ready to save the first private plant record. Use the same email each time so your garden stays in one place.";
  }

  if (activationSource === "invited_cohort") {
    return "Welcome to the OverGarden invite. Sign in or create an account with the email you were invited on, then save your first private plant note.";
  }

  return "Sign in or create an account to start or continue your garden journal. Use the same email each time so your plant records stay together.";
}
