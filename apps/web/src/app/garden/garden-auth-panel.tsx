"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { useSiteShellLocale } from "@/components/site-shell/site-shell-locale-context";
import type { ActivationSource } from "@/lib/garden/entry-contracts";
import { PILOT_AUTH_HELP_PATH } from "@/lib/auth/pilot-auth-recovery";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";
import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  navigateToOAuthAuthorization,
  oauthCallbackPath,
} from "@/lib/auth/social-oauth";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";
import {
  formatTrustAuthPrompt,
  formatTrustTemplate,
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";

type SocialProviderId = typeof GOOGLE_PROVIDER_ID | typeof FACEBOOK_PROVIDER_ID;
type AuthPanelMessage = {
  kind: "error" | "status";
  text: string;
};

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
  prompt = null,
  title = null,
}: GardenAuthPanelProps) {
  const router = useRouter();
  const inheritedLocale = useSiteShellLocale();
  const locale = localeOverride ?? inheritedLocale;
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const authFormRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<AuthPanelMessage | null>(
    initialMessage ? { kind: "error", text: initialMessage } : null,
  );
  const [isPending, setIsPending] = useState(false);
  const [localeDirtyRevision, setLocaleDirtyRevision] = useState(0);
  useInterfaceLocaleChangeFormState({
    id: "garden-auth-mutation",
    dirty: email.length > 0 || password.length > 0,
    pending: isPending,
    revision: localeDirtyRevision,
  });
  const socialSignInOptions = availableSocialProviderOptions({
    facebookSignInEnabled,
    googleSignInEnabled,
  });

  async function signUp() {
    setIsPending(true);
    setMessage(null);
    void trackMetaMarketingEvent("signup_started", {
      browserPixel: false,
    });

    try {
      const { data, error } = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
        callbackURL: postAuthPath ?? "/garden",
      });

      const result = getLocalizedEmailSignUpResult(locale, error);
      setMessage({
        kind: result.kind === "accepted" ? "status" : "error",
        text: result.message,
      });

      if (error) return;

      // A non-null token proves that this client now has a session (for example,
      // in local development). It does not change the neutral sign-up message.
      if (hasAuthToken(data)) router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function signIn() {
    setIsPending(true);
    setMessage(null);

    try {
      const { error } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage({
          kind: "error",
          text:
            getLocalizedAuthClientErrorMessage(locale, error) ??
            copy.signInError,
        });
        return;
      }

      if (postAuthPath) {
        router.push(postAuthPath);
        return;
      }

      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function signInWithSocial(provider: SocialProviderId, label: string) {
    setIsPending(true);
    setMessage(null);

    try {
      const callbackURL = resolveAuthCallbackPath(postAuthPath);
      const { data, error } = await authClient.signIn.social({
        provider,
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
      });

      if (error || !navigateToOAuthAuthorization(provider, data?.url)) {
        setMessage({
          kind: "error",
          text:
            getLocalizedAuthClientErrorMessage(locale, error) ??
            formatTrustTemplate(copy.socialSignInError, { provider: label }),
        });
      }
    } finally {
      setIsPending(false);
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
        ref={authFormRef}
        data-interface-locale-form="explicit"
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
              onChange={(event) => {
                setEmail(event.target.value);
                setLocaleDirtyRevision((revision) => revision + 1);
              }}
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
              onChange={(event) => {
                setPassword(event.target.value);
                setLocaleDirtyRevision((revision) => revision + 1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              minLength={8}
              required
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() =>
              runNativeValidatedAuthAction(authFormRef.current, () => {
                void signUp();
              })
            }
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
          role={message.kind === "error" ? "alert" : "status"}
          aria-live={message.kind === "error" ? "assertive" : "polite"}
          className={cn(
            "text-sm",
            message.kind === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
          data-testid="garden-auth-message"
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

export function runNativeValidatedAuthAction(
  form: Pick<HTMLFormElement, "reportValidity"> | null,
  action: () => void,
): boolean {
  if (!form?.reportValidity()) return false;

  action();
  return true;
}

function hasAuthToken(data: unknown) {
  return (
    Boolean(data) &&
    typeof data === "object" &&
    typeof (data as { token?: unknown }).token === "string"
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
