"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import { announceSessionSignal } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatTrustTemplate,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import type { AuthFormState } from "./auth-actions";

/**
 * The one screen that signs somebody in, and the one that creates an account.
 *
 * What this replaces: `GardenAuthPanel`, embedded by fourteen pages that each
 * supplied their own chrome. Google rendered on two of them because
 * `googleSignInEnabled` defaulted to `false`; ten did not pass `postAuthPath`,
 * so signing in from the feed or bookmarks landed the reader in the workspace
 * instead of where they were. Both defects were structural — providers were
 * drawn in fourteen places and the return path was read in fourteen places — so
 * both are fixed by there being one place.
 *
 * Sign-in and sign-up are separate routes rather than two buttons on one form.
 * The old shape put both submits on the same fields, so a reader could not tell
 * which one they were performing, `autocomplete="current-password"` and
 * `"new-password"` could not both be right, and the error copy had to serve two
 * meanings at once.
 *
 * The form posts to a Server Action, so it works with JavaScript switched off.
 * That is not decoration on this site: measured 2026-09-04, public pages do not
 * hydrate below the shell (OVE-380), and a screen nobody can submit is worse
 * than a plain one.
 */

export type AuthMode = "sign-in" | "sign-up";

export function AuthSurface({
  mode,
  locale,
  next,
  intentPrompt,
  googleSignInEnabled,
  submit,
  startSocial,
}: {
  mode: AuthMode;
  locale: InterfaceLocale;
  /** Internal path the server returns the reader to. Already normalized. */
  next: string;
  /** Why they were asked to sign in, when they arrived from an action. */
  intentPrompt: string | null;
  googleSignInEnabled: boolean;
  submit: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  startSocial: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
}) {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const router = useRouter();
  const [state, formAction] = useActionState(submit, {
    status: "idle" as const,
    message: null,
  });
  const [socialState, socialAction] = useActionState(startSocial, {
    status: "idle" as const,
    message: null,
  });
  const [signalled, setSignalled] = useState(false);

  // ADR-0022 D6: signing in reloads every other open tab. The announcement
  // belongs on the destination, and this is the first render that knows the
  // session exists.
  if (
    (state.status === "signed-in" || state.status === "accepted") &&
    state.redirectTo &&
    !signalled
  ) {
    setSignalled(true);
    if (state.status === "signed-in") {
      announceSessionSignal({ type: "signed_in", ownerUserId: null });
      router.replace(state.redirectTo);
    }
  }

  // A social handshake cannot redirect from inside the action without losing
  // the cookie it sets, so the provider URL comes back and the browser follows.
  if (socialState.status === "redirect" && socialState.redirectTo) {
    window.location.assign(socialState.redirectTo);
  }

  const isSignUp = mode === "sign-up";
  const title = isSignUp ? copy.signUpScreenTitle : copy.signInScreenTitle;
  const otherHref = isSignUp
    ? `/auth/sign-in${nextQuery(next)}`
    : `/auth/sign-up${nextQuery(next)}`;
  const otherLabel = isSignUp ? copy.toSignIn : copy.toSignUp;

  return (
    <main
      lang={locale}
      data-auth-surface={mode}
      className="flex min-h-dvh w-full items-end bg-muted/35 px-0 pt-6 sm:items-center sm:justify-center sm:px-6 sm:py-10"
    >
      <section className="w-full border-t border-border bg-background px-5 py-6 shadow-lg sm:max-w-md sm:rounded-lg sm:border sm:p-6">
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">
              {intentPrompt ?? title}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.prompts.directGarden}
            </p>
          </div>

          {googleSignInEnabled ? (
            <form action={socialAction} className="grid gap-2">
              <input type="hidden" name="provider" value="google" />
              <input type="hidden" name="next" value={next} />
              <SubmitButton variant="outline" testId="google-sign-in-button">
                {formatTrustTemplate(copy.continueWith, { provider: "Google" })}
              </SubmitButton>
              {socialState.message ? (
                <AuthMessage status="error" message={socialState.message} />
              ) : null}
            </form>
          ) : null}

          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="next" value={next} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{copy.email}</span>
              <input
                type="email"
                name="email"
                autoFocus
                autoComplete="email"
                required
                aria-invalid={state.status === "error" || undefined}
                aria-describedby={state.message ? "auth-message" : undefined}
                className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground sm:min-h-9"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">
                {copy.password}
              </span>
              <input
                type="password"
                name="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                required
                aria-invalid={state.status === "error" || undefined}
                aria-describedby={state.message ? "auth-message" : undefined}
                className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground sm:min-h-9"
              />
            </label>

            <SubmitButton>
              {isSignUp ? copy.createAccount : copy.signIn}
            </SubmitButton>

            {state.message ? (
              <AuthMessage
                status={state.status === "error" ? "error" : "status"}
                message={state.message}
              />
            ) : null}
          </form>

          <div className="grid gap-2 border-t border-border pt-4 text-sm">
            <Link
              href={otherHref}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {otherLabel}
            </Link>
            <p className="text-xs leading-5 text-muted-foreground">
              {copy.recoveryHint}{" "}
              <Link
                href={AUTH_HELP_PATH}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.signInHelp}
              </Link>
            </p>
          </div>

          <Link
            href={next}
            className={buttonVariants({
              variant: "ghost",
              className: "justify-start",
            })}
          >
            {copy.cancel}
          </Link>
        </div>
      </section>
    </main>
  );
}

function SubmitButton({
  children,
  variant,
  testId,
}: {
  children: React.ReactNode;
  variant?: "outline";
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

function AuthMessage({
  status,
  message,
}: {
  status: "error" | "status";
  message: string;
}) {
  return (
    <p
      id="auth-message"
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={
        status === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {message}
    </p>
  );
}

function nextQuery(next: string) {
  return next === "/garden" ? "" : `?next=${encodeURIComponent(next)}`;
}
