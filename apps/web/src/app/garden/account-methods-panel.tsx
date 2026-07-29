"use client";

import { useState } from "react";

import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { Button } from "@/components/ui/button";
import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  navigateToOAuthAuthorization,
  oauthCallbackPath,
  type SocialProviderId,
} from "@/lib/auth/social-oauth";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatTrustTemplate,
  getLocalizedAuthClientErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import type { AccountMethodProjection } from "@/server/auth/account-methods";

import {
  setCurrentAccountPassword,
  type AccountMethodPasswordActionResult,
} from "./profile/account-method-actions";

type AccountMethodState = Pick<
  AccountMethodsPanelProps,
  "facebookSignInEnabled" | "googleSignInEnabled" | "hasFacebook" | "hasGoogle"
>;

const PROVIDERS = [
  {
    id: GOOGLE_PROVIDER_ID,
    label: "Google",
    enabled: (methods: AccountMethodState) => methods.googleSignInEnabled,
    connected: (methods: AccountMethodState) => methods.hasGoogle,
  },
  {
    id: FACEBOOK_PROVIDER_ID,
    label: "Facebook",
    enabled: (methods: AccountMethodState) => methods.facebookSignInEnabled,
    connected: (methods: AccountMethodState) => methods.hasFacebook,
  },
] as const;

type PendingAction = SocialProviderId | "password" | null;

export interface AccountMethodsPanelProps extends AccountMethodProjection {
  facebookSignInEnabled: boolean;
  googleSignInEnabled: boolean;
  initialMessage?: string | null;
  locale: InterfaceLocale;
}

export function AccountMethodsPanel({
  facebookSignInEnabled,
  googleSignInEnabled,
  hasCredential,
  hasFacebook,
  hasGoogle,
  canSetPassword,
  initialMessage = null,
  locale,
}: AccountMethodsPanelProps) {
  const copy = getTrustSurfaceCopy(locale).authPanel.methods;
  const [message, setMessage] = useState(initialMessage ?? "");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [password, setPasswordValue] = useState("");
  useInterfaceLocaleChangeFormState({
    id: "account-method-mutation",
    dirty: password.length > 0,
    pending: pendingAction !== null,
  });
  const methods = {
    facebookSignInEnabled,
    googleSignInEnabled,
    hasCredential,
    hasFacebook,
    hasGoogle,
  };
  const connectedMethodCount =
    Number(hasCredential) + Number(hasFacebook) + Number(hasGoogle);

  async function linkProvider(provider: SocialProviderId, label: string) {
    setPendingAction(provider);
    setMessage("");

    try {
      const callbackURL = currentOAuthCallbackPath();
      const { data, error } = await authClient.linkSocial({
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
      });
      if (error || !navigateToOAuthAuthorization(provider, data?.url)) {
        setMessage(
          getLocalizedAuthClientErrorMessage(locale, error) ??
            formatTrustTemplate(copy.linkError, { provider: label }),
        );
      }
    } catch {
      setMessage(formatTrustTemplate(copy.linkError, { provider: label }));
    } finally {
      setPendingAction(null);
    }
  }

  async function unlinkProvider(provider: SocialProviderId, label: string) {
    setPendingAction(provider);
    setMessage("");

    try {
      const { error } = await authClient.unlinkAccount({
        providerId: provider,
      });
      if (error) {
        setMessage(
          getLocalizedAuthClientErrorMessage(locale, error) ??
            formatTrustTemplate(copy.unlinkError, { provider: label }),
        );
        return;
      }

      window.location.reload();
    } catch {
      setMessage(formatTrustTemplate(copy.unlinkError, { provider: label }));
    } finally {
      setPendingAction(null);
    }
  }

  async function setPassword() {
    setPendingAction("password");
    setMessage("");

    try {
      const result: AccountMethodPasswordActionResult =
        await setCurrentAccountPassword(password);
      if (result.status !== "success") {
        setMessage(copy.passwordError);
        return;
      }

      setPasswordValue("");
      window.location.reload();
    } catch {
      setMessage(copy.passwordError);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4"
      data-testid="account-methods-panel"
      lang={locale}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      <ul className="grid gap-3">
        {PROVIDERS.filter(
          (provider) =>
            provider.enabled(methods) || provider.connected(methods),
        ).map((provider) => {
          const connected = provider.connected(methods);
          const isPending = pendingAction === provider.id;
          const canUnlink = connectedMethodCount > 1;

          return (
            <li
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3"
            >
              <div className="grid gap-0.5">
                <h3 className="font-medium text-foreground">
                  {provider.label}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {connected
                    ? copy.connected
                    : formatTrustTemplate(copy.available, {
                        provider: provider.label,
                      })}
                </p>
              </div>
              {connected ? (
                <div className="grid gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => unlinkProvider(provider.id, provider.label)}
                    disabled={!canUnlink || isPending}
                    aria-describedby={
                      canUnlink ? undefined : `${provider.id}-protected`
                    }
                    data-testid={`${provider.id}-unlink-button`}
                  >
                    {isPending
                      ? copy.actionInProgress
                      : formatTrustTemplate(copy.disconnect, {
                          provider: provider.label,
                        })}
                  </Button>
                  {!canUnlink ? (
                    <p
                      id={`${provider.id}-protected`}
                      className="max-w-56 text-xs leading-5 text-muted-foreground"
                    >
                      {copy.disconnectProtected}
                    </p>
                  ) : null}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => linkProvider(provider.id, provider.label)}
                  disabled={isPending}
                  data-testid={`${provider.id}-link-button`}
                >
                  {isPending
                    ? copy.actionInProgress
                    : formatTrustTemplate(copy.connect, {
                        provider: provider.label,
                      })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 border-t border-border pt-4">
        <div className="grid gap-0.5">
          <h3 className="font-medium text-foreground">{copy.passwordTitle}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {hasCredential
              ? copy.passwordSet
              : canSetPassword
                ? copy.passwordDescription
                : copy.passwordVerificationRequired}
          </p>
        </div>
        {!hasCredential && canSetPassword ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void setPassword();
            }}
          >
            <label className="sr-only" htmlFor="account-method-password">
              {copy.passwordLabel}
            </label>
            <input
              id="account-method-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
              minLength={8}
              required
              disabled={pendingAction === "password"}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <Button
              type="submit"
              disabled={pendingAction === "password"}
              data-testid="set-password-button"
            >
              {pendingAction === "password"
                ? copy.actionInProgress
                : copy.setPassword}
            </Button>
          </form>
        ) : null}
      </div>

      {message ? (
        <p
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive"
          data-testid="account-method-message"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function currentOAuthCallbackPath() {
  if (typeof window === "undefined") return "/garden/profile";
  return oauthCallbackPath(window.location);
}
