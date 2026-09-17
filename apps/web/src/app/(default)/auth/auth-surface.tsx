"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import { announceSessionSignal } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatTrustTemplate,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import type { AuthFormState } from "./auth-actions";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

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
 * The form posts to a Server Action, so it works with JavaScript switched off
 * and before hydration finishes. A sign-in screen is the worst possible place to
 * depend on the client bundle having run.
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
  //
  // The destination is reached by a **document navigation**, not
  // `router.replace`. The shell lives in the root layout, and a client
  // navigation inside the same layout does not re-render it — so a reader who
  // signed in landed on the page they asked for with the chrome still offering
  // them "sign in". Watched in a real browser on 2026-09-17, which is what
  // `OVE-455` exists for: only the refusal path had ever been observed.
  if (
    (state.status === "signed-in" || state.status === "accepted") &&
    state.redirectTo &&
    !signalled
  ) {
    setSignalled(true);
    if (state.status === "signed-in") {
      announceSessionSignal({ type: "signed_in", ownerUserId: null });
      window.location.assign(state.redirectTo);
    }
  }

  // A social handshake cannot redirect from inside the action without losing
  // the cookie it sets, so the provider URL comes back and the browser follows.
  if (socialState.status === "redirect" && socialState.redirectTo) {
    window.location.assign(socialState.redirectTo);
  }

  const isSignUp = mode === "sign-up";
  const title = isSignUp ? copy.signUpScreenTitle : copy.signInScreenTitle;
  const otherHref = buildSignInHref({ returnTo: next, signUp: !isSignUp });
  const otherLabel = isSignUp ? copy.toSignIn : copy.toSignUp;
  const refused = state.status === "error";
  const emailRef = useRef<HTMLInputElement>(null);

  // The first invalid control takes focus (DESIGN.md §5.3). A refusal never
  // says *which* credential was wrong — that would tell somebody probing which
  // half they had right — so the first control of the form is the first
  // invalid one, and it is where a reader continues from.
  useEffect(() => {
    if (refused) emailRef.current?.focus();
  }, [refused, state.message]);

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

          {/* The provider above an `or` divider, then the labelled fields:
              the anatomy Intercom, Cal.com, Uxcel, Mixpanel and Relevance AI
              all ship, and all five show the Google mark. */}
          {googleSignInEnabled ? (
            <div className="grid gap-4">
              <form action={socialAction} className="grid gap-2">
                <HiddenField name="provider" value="google" />
                <HiddenField name="next" value={next} />
                <GoogleSubmit
                  label={formatTrustTemplate(copy.continueWith, {
                    provider: "Google",
                  })}
                />
                {socialState.message ? (
                  <Callout tone="danger" live="assertive">
                    {socialState.message}
                  </Callout>
                ) : null}
              </form>
              <OrDivider label={copy.orDivider} />
            </div>
          ) : null}

          <form action={formAction} className="grid gap-4">
            <HiddenField name="next" value={next} />

            {/* A refusal is a form-level error: a `Callout` with `role="alert"`
                above the fields, saying what to do next and never which of the
                two credentials was wrong (DESIGN.md §5.3). */}
            {state.message ? (
              <Callout
                id="auth-message"
                tone={refused ? "danger" : "info"}
                live={refused ? "assertive" : "polite"}
                data-auth-message={refused ? "error" : "status"}
              >
                {state.message}
              </Callout>
            ) : null}

            <Field label={copy.email} required>
              <Input
                ref={emailRef}
                type="email"
                name="email"
                autoFocus
                required
                autoComplete="email"
                aria-invalid={refused || undefined}
                aria-describedby={state.message ? "auth-message" : undefined}
              />
            </Field>

            <Field
              label={copy.password}
              required
              mark={
                isSignUp ? undefined : (
                  <Link
                    href={AUTH_HELP_PATH}
                    className="text-caption font-medium text-link underline-offset-4 hover:underline"
                  >
                    {copy.forgotPassword}
                  </Link>
                )
              }
            >
              <PasswordInput
                name="password"
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                showLabel={copy.showPassword}
                hideLabel={copy.hidePassword}
                aria-invalid={refused || undefined}
                aria-describedby={state.message ? "auth-message" : undefined}
              />
            </Field>

            <SubmitButton>
              {isSignUp ? copy.createAccount : copy.signIn}
            </SubmitButton>
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

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  // `loading` keeps the button's width, swaps the label for a spinner, marks it
  // busy and leaves it focusable (DESIGN.md §4.4). It never disappears, which
  // on a sign-in screen is the difference between "working" and "broken".
  return (
    <Button type="submit" loading={pending}>
      {children}
    </Button>
  );
}

function GoogleSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <GoogleSignInButton
      label={label}
      loading={pending}
      data-testid="google-sign-in-button"
    />
  );
}

/** The `or` between the provider and the fields, as a rule with a word on it. */
function OrDivider({ label }: { label: string }) {
  return (
    <p
      aria-hidden="true"
      data-auth-or-divider="true"
      className="flex items-center gap-3 text-caption text-text-muted"
    >
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </p>
  );
}

