"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSiteShellLocale } from "@/components/site-shell/site-shell-locale-context";
import type { ActivationSource } from "@/lib/garden/entry-contracts";
import {
  LOCAL_DEV_DEFAULT_EMAIL,
  LOCAL_DEV_DEFAULT_NAME,
  LOCAL_DEV_DEFAULT_PASSWORD,
  PILOT_AUTH_HELP_PATH,
  shouldUseLocalDevAuthDefaults,
} from "@/lib/auth/pilot-auth-recovery";
import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  oauthCallbackPath,
} from "@/lib/auth/social-oauth";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";
import {
  formatTrustAuthPrompt,
  formatTrustTemplate,
  getLocalizedAuthClientErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";

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
  autoFocusEmail?: boolean;
  catalogName?: string | null;
  embedded?: boolean;
  facebookSignInEnabled?: boolean;
  googleSignInEnabled?: boolean;
  initialMessage?: string | null;
  locale?: InterfaceLocale;
  postAuthPath?: string | null;
  prefillDevelopmentDefaults?: boolean;
  prompt?: string | null;
  title?: string | null;
}

export function GardenAuthPanel({
  activationSource = "direct_garden",
  autoFocusEmail = false,
  catalogName,
  embedded = false,
  facebookSignInEnabled = false,
  googleSignInEnabled = false,
  initialMessage = null,
  locale: localeOverride,
  postAuthPath = null,
  prefillDevelopmentDefaults = true,
  prompt = null,
  title = null,
}: GardenAuthPanelProps) {
  const router = useRouter();
  const inheritedLocale = useSiteShellLocale();
  const locale = localeOverride ?? inheritedLocale;
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const useDevDefaults =
    prefillDevelopmentDefaults && shouldUseLocalDevAuthDefaults();
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
      name: name.trim() || email.trim().split("@")[0] || copy.defaultName,
      callbackURL: postAuthPath ?? "/garden",
    });

    setIsPending(false);

    if (error) {
      setMessage(
        getLocalizedAuthClientErrorMessage(locale, error) ??
          copy.createAccountError,
      );
      return;
    }

    void trackMetaMarketingEvent("account_created", {
      browserPixel: false,
    });
    setMessage(copy.verificationSent);
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
        getLocalizedAuthClientErrorMessage(locale, error) ?? copy.signInError,
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

    const callbackURL = resolveAuthCallbackPath(postAuthPath);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL: callbackURL,
    });

    setIsPending(false);

    if (error) {
      setMessage(
        getLocalizedAuthClientErrorMessage(locale, error) ??
          formatTrustTemplate(copy.socialSignInError, { provider: label }),
      );
    }
  }

  return (
    <section
      className={cn(
        "flex max-w-xl flex-col gap-4",
        !embedded && "rounded-lg border border-border p-4",
      )}
      data-testid="garden-auth-panel"
      lang={locale}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {title ?? copy.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {prompt ??
            formatTrustAuthPrompt(locale, activationSource, catalogName)}
        </p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{copy.email}</span>
            <input
              type="email"
              autoFocus={autoFocusEmail}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{copy.password}</span>
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
              {copy.newAccountName}
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
          <Button
            type="button"
            onClick={() => void signUp()}
            disabled={isPending}
          >
            {copy.createAccount}
          </Button>
          <Button type="submit" variant="outline" disabled={isPending}>
            {copy.signIn}
          </Button>
        </div>
      </form>

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
              {formatTrustTemplate(copy.continueWith, {
                provider: provider.label,
              })}
            </Button>
          ))}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        {copy.recoveryHint}{" "}
        <Link
          href={PILOT_AUTH_HELP_PATH}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.signInHelp}
        </Link>
      </p>

      {message ? (
        <p
          role="alert"
          aria-live="polite"
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
  locale?: InterfaceLocale;
}

export function SocialAccountLinkPanel({
  facebookSignInEnabled = false,
  googleSignInEnabled = false,
  initialMessage = null,
  locale: localeOverride,
}: SocialAccountLinkPanelProps) {
  const inheritedLocale = useSiteShellLocale();
  const locale = localeOverride ?? inheritedLocale;
  const copy = getTrustSurfaceCopy(locale).authPanel;
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
        getLocalizedAuthClientErrorMessage(locale, error) ??
          formatTrustTemplate(copy.methods.linkError, { provider: label }),
      );
    }
  }

  return (
    <section
      className="flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4"
      data-testid="social-account-link-panel"
      lang={locale}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.methods.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.methods.description}
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
            {formatTrustTemplate(copy.methods.link, {
              provider: provider.label,
            })}
          </Button>
        ))}
      </div>
      {message ? (
        <p
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive"
          data-testid="social-link-message"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function currentOAuthCallbackPath() {
  if (typeof window === "undefined") return "/garden";
  return oauthCallbackPath(window.location);
}

export function resolveAuthCallbackPath(
  postAuthPath: string | null,
  location?: Pick<Location, "pathname" | "search">,
) {
  if (postAuthPath) return postAuthPath;
  if (location) return oauthCallbackPath(location);
  return currentOAuthCallbackPath();
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
