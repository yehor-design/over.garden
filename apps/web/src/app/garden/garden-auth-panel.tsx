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
import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  oauthCallbackPath,
} from "@/lib/auth/social-oauth";
import { authClient } from "@/lib/auth-client";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";

type SocialProviderId = typeof GOOGLE_PROVIDER_ID | typeof FACEBOOK_PROVIDER_ID;

const SOCIAL_PROVIDER_OPTIONS = [
  {
    id: GOOGLE_PROVIDER_ID,
    label: "Google",
    signInTestId: "google-sign-in-button",
    linkTestId: "google-link-button",
  },
  {
    id: FACEBOOK_PROVIDER_ID,
    label: "Facebook",
    signInTestId: "facebook-sign-in-button",
    linkTestId: "facebook-link-button",
  },
] as const;

interface GardenAuthPanelProps {
  activationSource?: ActivationSource;
  catalogName?: string | null;
  facebookSignInEnabled?: boolean;
  googleSignInEnabled?: boolean;
  initialMessage?: string | null;
  postAuthPath?: string | null;
}

export function GardenAuthPanel({
  activationSource = "direct_garden",
  catalogName,
  facebookSignInEnabled = false,
  googleSignInEnabled = false,
  initialMessage = null,
  postAuthPath = null,
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
  const [message, setMessage] = useState<string>(initialMessage ?? "");
  const [isPending, setIsPending] = useState(false);
  const socialSignInOptions = availableSocialProviderOptions({
    facebookSignInEnabled,
    googleSignInEnabled,
  });

  async function signUp() {
    setIsPending(true);
    setMessage("");
    void trackMetaMarketingEvent("signup_started", {
      browserPixel: false,
    });

    const { error } = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: name.trim() || email.trim().split("@")[0] || "Gardener",
      callbackURL: postAuthPath ?? "/garden",
    });

    setIsPending(false);

    if (error) {
      setMessage(
        interpretAuthClientErrorMessage(error) ??
          "Could not create an account. Try again.",
      );
      return;
    }

    void trackMetaMarketingEvent("account_created", {
      browserPixel: false,
    });
    setMessage(
      "Check your email to verify the account, then open your garden.",
    );
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

    if (postAuthPath) {
      router.push(postAuthPath);
      return;
    }

    router.refresh();
  }

  async function signInWithSocial(provider: SocialProviderId, label: string) {
    setIsPending(true);
    setMessage("");

    const callbackURL = currentOAuthCallbackPath();
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL: callbackURL,
    });

    setIsPending(false);

    if (error) {
      setMessage(
        interpretAuthClientErrorMessage(error) ??
          `Could not start ${label} sign-in. Use email and password for now.`,
      );
    }
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

      {socialSignInOptions.length > 0 ? (
        <div className="grid gap-2 border-t border-border pt-4">
          {socialSignInOptions.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              onClick={() => signInWithSocial(provider.id, provider.label)}
              disabled={isPending}
              data-testid={provider.signInTestId}
            >
              Continue with {provider.label}
            </Button>
          ))}
        </div>
      ) : null}

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
        <p
          className="text-sm text-destructive"
          data-testid="garden-auth-message"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

interface SocialAccountLinkPanelProps {
  facebookSignInEnabled?: boolean;
  googleSignInEnabled?: boolean;
  initialMessage?: string | null;
}

export function SocialAccountLinkPanel({
  facebookSignInEnabled = false,
  googleSignInEnabled = false,
  initialMessage = null,
}: SocialAccountLinkPanelProps) {
  const [message, setMessage] = useState<string>(initialMessage ?? "");
  const [isPending, setIsPending] = useState(false);
  const socialLinkOptions = availableSocialProviderOptions({
    facebookSignInEnabled,
    googleSignInEnabled,
  });

  if (socialLinkOptions.length === 0) return null;

  async function linkSocial(provider: SocialProviderId, label: string) {
    setIsPending(true);
    setMessage("");

    const callbackURL = currentOAuthCallbackPath();
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL,
      errorCallbackURL: callbackURL,
    });

    setIsPending(false);

    if (error) {
      setMessage(
        interpretAuthClientErrorMessage(error) ??
          `Could not link ${label} sign-in. Keep using email and password for now.`,
      );
    }
  }

  return (
    <section
      className="flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4"
      data-testid="social-account-link-panel"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Sign-in methods
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Link a provider here before using it as the shortcut back to the same
          garden. OverGarden uses it only for sign-in.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {socialLinkOptions.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            onClick={() => linkSocial(provider.id, provider.label)}
            disabled={isPending}
            data-testid={provider.linkTestId}
          >
            Link {provider.label} sign-in
          </Button>
        ))}
      </div>
      {message ? (
        <p
          className="text-sm text-destructive"
          data-testid="social-link-message"
        >
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

function currentOAuthCallbackPath() {
  if (typeof window === "undefined") return "/garden";
  return oauthCallbackPath(window.location);
}

function availableSocialProviderOptions({
  facebookSignInEnabled,
  googleSignInEnabled,
}: {
  facebookSignInEnabled: boolean;
  googleSignInEnabled: boolean;
}) {
  return SOCIAL_PROVIDER_OPTIONS.filter((provider) => {
    if (provider.id === GOOGLE_PROVIDER_ID) return googleSignInEnabled;
    if (provider.id === FACEBOOK_PROVIDER_ID) return facebookSignInEnabled;
    return false;
  });
}
