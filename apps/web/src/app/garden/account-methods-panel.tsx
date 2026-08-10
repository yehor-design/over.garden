"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import {
  createDocumentMutationRequestHeaders,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  GOOGLE_PROVIDER_ID,
  navigateToOAuthAuthorization,
  oauthCallbackPath,
  type SocialProviderId,
} from "@/lib/auth/social-oauth";
import { authClient } from "@/lib/auth-client";
import { runBrowserAuthMutation } from "@/lib/auth/browser-auth-mutation-coordinator";
import { isDocumentMutationAdmissionTransportResult } from "@/lib/auth/document-mutation-generation-transport";
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
  "googleSignInEnabled" | "hasGoogle"
>;

const PROVIDERS = [
  {
    id: GOOGLE_PROVIDER_ID,
    label: "Google",
    enabled: (methods: AccountMethodState) => methods.googleSignInEnabled,
    connected: (methods: AccountMethodState) => methods.hasGoogle,
  },
] as const;

type PendingAction = SocialProviderId | "password" | null;

type DisconnectIntent = {
  label: string;
  provider: SocialProviderId;
  requiresPassword: boolean;
  credentialCreated: boolean;
};

export interface AccountMethodsPanelProps extends AccountMethodProjection {
  googleSignInEnabled: boolean;
  initialMessage?: string | null;
  locale: InterfaceLocale;
  onMethodsChanged?: () => void;
}

export function AccountMethodsPanel({
  googleSignInEnabled,
  hasCredential,
  hasGoogle,
  canSetPassword,
  initialMessage = null,
  locale,
  onMethodsChanged,
}: AccountMethodsPanelProps) {
  const router = useRouter();
  const documentMutation = useOptionalDocumentMutationGeneration();
  const copy = getTrustSurfaceCopy(locale).authPanel.methods;
  const [message, setMessage] = useState(initialMessage ?? "");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [password, setPasswordValue] = useState("");
  const [disconnectIntent, setDisconnectIntent] =
    useState<DisconnectIntent | null>(null);
  const [disconnectPassword, setDisconnectPassword] = useState("");
  const [disconnectMessage, setDisconnectMessage] = useState("");
  const disconnectPasswordRef = useRef<HTMLInputElement>(null);
  const disconnectCancelRef = useRef<HTMLButtonElement>(null);
  const disconnectTriggerRef = useRef<HTMLButtonElement>(null);
  useInterfaceLocaleChangeFormState({
    id: "account-method-mutation",
    dirty: password.length > 0 || disconnectPassword.length > 0,
    pending: pendingAction !== null,
  });
  const methods = {
    googleSignInEnabled,
    hasCredential,
    hasGoogle,
  };
  const connectedMethodCount = Number(hasCredential) + Number(hasGoogle);
  const refreshMethods = () => {
    if (onMethodsChanged) {
      onMethodsChanged();
      return;
    }
    router.refresh();
  };

  function openDisconnectDialog(
    event: MouseEvent<HTMLButtonElement>,
    provider: SocialProviderId,
    label: string,
  ) {
    disconnectTriggerRef.current = event.currentTarget;
    setDisconnectIntent({
      provider,
      label,
      requiresPassword: connectedMethodCount === 1,
      credentialCreated: false,
    });
    setDisconnectPassword("");
    setDisconnectMessage("");
    setMessage("");
  }

  function closeDisconnectDialog() {
    setDisconnectIntent(null);
    setDisconnectPassword("");
    setDisconnectMessage("");
  }

  function dismissDisconnectDialog() {
    if (pendingAction !== null) return;

    closeDisconnectDialog();
  }

  async function requestProviderUnlink(
    provider: SocialProviderId,
    label: string,
  ) {
    try {
      const mutation = await runBrowserAuthMutation({
        kind: "account_mutation",
        operation: () =>
          authClient.unlinkAccount(
            {
              providerId: provider,
            },
            {
              headers: createDocumentMutationRequestHeaders(
                documentMutation?.transport,
              ),
            },
          ),
      });
      if (mutation.status === "stale_operation") {
        return formatTrustTemplate(copy.unlinkError, { provider: label });
      }
      const { error } = mutation.value;
      if (!error) return null;
      if (isDocumentMutationAdmissionTransportResult(error.code)) {
        documentMutation?.handleTransportResult(error.code);
      }

      return (
        getLocalizedAuthClientErrorMessage(locale, error) ??
        formatTrustTemplate(copy.unlinkError, { provider: label })
      );
    } catch {
      return formatTrustTemplate(copy.unlinkError, { provider: label });
    }
  }

  async function linkProvider(provider: SocialProviderId, label: string) {
    setPendingAction(provider);
    setMessage("");

    try {
      const callbackURL = currentOAuthCallbackPath();
      const mutation = await runBrowserAuthMutation({
        kind: "account_mutation",
        operation: () =>
          authClient.linkSocial({
            provider,
            callbackURL,
            errorCallbackURL: callbackURL,
            disableRedirect: true,
          }),
      });
      if (mutation.status === "stale_operation") return;
      const { data, error } = mutation.value;
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

  async function confirmDisconnect() {
    if (
      !disconnectIntent ||
      disconnectIntent.requiresPassword ||
      pendingAction !== null
    ) {
      return;
    }

    setPendingAction(disconnectIntent.provider);
    setDisconnectMessage("");

    const unlinkError = await requestProviderUnlink(
      disconnectIntent.provider,
      disconnectIntent.label,
    );
    if (unlinkError) {
      setDisconnectMessage(unlinkError);
      setPendingAction(null);
      return;
    }

    setPendingAction(null);
    closeDisconnectDialog();
    refreshMethods();
  }

  async function setPasswordAndDisconnect() {
    if (
      !disconnectIntent ||
      !disconnectIntent.requiresPassword ||
      !canSetPassword ||
      disconnectIntent.credentialCreated ||
      pendingAction !== null
    ) {
      return;
    }

    setPendingAction(disconnectIntent.provider);
    setDisconnectMessage("");

    try {
      const result: AccountMethodPasswordActionResult =
        await setCurrentAccountPassword(
          disconnectPassword,
          documentMutation?.transport ?? null,
        );
      if ("documentMutationAdmission" in result) {
        documentMutation?.handleTransportResult(
          result.documentMutationAdmission,
        );
        setDisconnectMessage(copy.passwordError);
        return;
      }
      if (result.status !== "success") {
        setDisconnectMessage(copy.passwordError);
        return;
      }

      setDisconnectPassword("");
      const unlinkError = await requestProviderUnlink(
        disconnectIntent.provider,
        disconnectIntent.label,
      );
      if (unlinkError) {
        setDisconnectIntent((current) =>
          current ? { ...current, credentialCreated: true } : null,
        );
        setDisconnectMessage(
          formatTrustTemplate(copy.passwordCreatedDisconnectError, {
            provider: disconnectIntent.label,
          }),
        );
        refreshMethods();
        return;
      }

      closeDisconnectDialog();
      refreshMethods();
    } catch {
      setDisconnectMessage(copy.passwordError);
    } finally {
      setPendingAction(null);
    }
  }

  async function setPassword() {
    setPendingAction("password");
    setMessage("");

    try {
      const result: AccountMethodPasswordActionResult =
        await setCurrentAccountPassword(
          password,
          documentMutation?.transport ?? null,
        );
      if ("documentMutationAdmission" in result) {
        documentMutation?.handleTransportResult(
          result.documentMutationAdmission,
        );
        setMessage(copy.passwordError);
        return;
      }
      if (result.status !== "success") {
        setMessage(copy.passwordError);
        return;
      }

      setPasswordValue("");
      refreshMethods();
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
          const isFinalMethod = connectedMethodCount === 1;

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
                    onClick={(event) =>
                      openDisconnectDialog(event, provider.id, provider.label)
                    }
                    disabled={isPending}
                    data-testid={`${provider.id}-unlink-button`}
                  >
                    {isPending
                      ? copy.actionInProgress
                      : formatTrustTemplate(copy.disconnect, {
                          provider: provider.label,
                        })}
                  </Button>
                  {isFinalMethod ? (
                    <p className="max-w-56 text-xs leading-5 text-muted-foreground">
                      {canSetPassword
                        ? copy.disconnectPasswordBridgeHint
                        : copy.disconnectVerificationRequiredHint}
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

      <AlertDialog
        open={disconnectIntent !== null}
        onOpenChange={(open) => {
          if (!open) dismissDisconnectDialog();
        }}
      >
        <AlertDialogContent
          initialFocus={
            disconnectIntent?.requiresPassword && canSetPassword
              ? disconnectPasswordRef
              : disconnectCancelRef
          }
          finalFocus={disconnectTriggerRef}
          aria-busy={pendingAction !== null || undefined}
        >
          {disconnectIntent ? (
            <>
              <AlertDialogTitle>
                {disconnectIntent.requiresPassword
                  ? formatTrustTemplate(copy.disconnectPasswordBridgeTitle, {
                      provider: disconnectIntent.label,
                    })
                  : formatTrustTemplate(copy.disconnectConfirmTitle, {
                      provider: disconnectIntent.label,
                    })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {disconnectIntent.requiresPassword
                  ? canSetPassword
                    ? formatTrustTemplate(
                        copy.disconnectPasswordBridgeDescription,
                        { provider: disconnectIntent.label },
                      )
                    : copy.disconnectVerificationRequiredDescription
                  : formatTrustTemplate(copy.disconnectConfirmDescription, {
                      provider: disconnectIntent.label,
                    })}
              </AlertDialogDescription>

              {disconnectMessage ? (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-4 text-sm text-destructive"
                  data-testid="disconnect-dialog-message"
                >
                  {disconnectMessage}
                </p>
              ) : null}

              {disconnectIntent.requiresPassword &&
              canSetPassword &&
              !disconnectIntent.credentialCreated ? (
                <form
                  className="mt-5 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void setPasswordAndDisconnect();
                  }}
                >
                  <div className="grid gap-2">
                    <label
                      className="text-sm font-medium text-foreground"
                      htmlFor="disconnect-account-method-password"
                    >
                      {copy.passwordLabel}
                    </label>
                    <input
                      ref={disconnectPasswordRef}
                      id="disconnect-account-method-password"
                      type="password"
                      autoComplete="new-password"
                      value={disconnectPassword}
                      onChange={(event) =>
                        setDisconnectPassword(event.target.value)
                      }
                      minLength={8}
                      required
                      disabled={pendingAction !== null}
                      className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <AlertDialogClose
                      ref={disconnectCancelRef}
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
                      onClick={dismissDisconnectDialog}
                      disabled={pendingAction !== null}
                    >
                      {copy.cancelDisconnect}
                    </AlertDialogClose>
                    <Button
                      type="submit"
                      disabled={pendingAction !== null}
                      data-testid="password-and-disconnect-button"
                    >
                      {pendingAction === disconnectIntent.provider
                        ? copy.actionInProgress
                        : copy.createPasswordAndDisconnect}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialogClose
                    ref={disconnectCancelRef}
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
                    onClick={dismissDisconnectDialog}
                    disabled={pendingAction !== null}
                  >
                    {disconnectIntent.credentialCreated
                      ? copy.closeDisconnectDialog
                      : copy.cancelDisconnect}
                  </AlertDialogClose>
                  {!disconnectIntent.requiresPassword ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void confirmDisconnect()}
                      disabled={pendingAction !== null}
                      data-testid="confirm-disconnect-button"
                    >
                      {pendingAction === disconnectIntent.provider
                        ? copy.actionInProgress
                        : formatTrustTemplate(copy.confirmDisconnect, {
                            provider: disconnectIntent.label,
                          })}
                    </Button>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function currentOAuthCallbackPath() {
  if (typeof window === "undefined") return "/garden/profile";
  return oauthCallbackPath(window.location);
}
