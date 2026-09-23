"use client";

import NextLink from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { TransportBoundary } from "@/components/transport-boundary";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { PasswordInput } from "@/components/ui/password-input";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import { announceSessionSignal } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  buildSignInHref,
  type AuthScreenNotice,
} from "@/lib/navigation/sign-in-href";
import {
  formatTrustTemplate,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";
import type { AuthFormState } from "./auth-actions";
import { AuthFrame } from "./auth-frame";

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
 * Sign-in and sign-up are separate routes rather than two buttons on one form,
 * and since `OVE-504` a switch at the top names which one the reader is on
 * (`aria-current`) and carries the return path to the other. The old shape put
 * both submits on the same fields, so a reader could not tell which one they
 * were performing, and `autocomplete="current-password"` and `"new-password"`
 * could not both be right.
 *
 * The form posts to a Server Action, so it works with JavaScript switched off
 * and before hydration finishes. A sign-in screen is the worst possible place to
 * depend on the client bundle having run.
 *
 * What the reader typed lives above the transport boundary (`OVE-504`): a
 * refusal, a request lost on the way and React's own reset of a form after its
 * action all leave the address and the password where they were typed, so
 * recovering never means typing — or remembering — them again (WCAG 3.3.8).
 */

export type AuthMode = "sign-in" | "sign-up";

export function AuthSurface({
  mode,
  locale,
  next,
  cancelHref = next,
  intentPrompt,
  notice = null,
  providerError = null,
  verificationExpired = false,
  googleSignInEnabled,
  submit,
  startSocial,
}: {
  mode: AuthMode;
  locale: InterfaceLocale;
  /** Internal path the server returns the reader to. Already normalized. */
  next: string;
  /** The page behind the screen: `next` itself, or the page a held action is on. */
  cancelHref?: string;
  /** Why they were asked to sign in, when they arrived from an action. */
  intentPrompt: string | null;
  /** Why they were sent here, when it was not an action. */
  notice?: AuthScreenNotice | null;
  /** A provider sign-in that came back refused. */
  providerError?: string | null;
  /** An email-verification link that came back expired. */
  verificationExpired?: boolean;
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
  const screen = getAuthScreenCopy(locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [returnedToTab, setReturnedToTab] = useState(false);
  const isSignUp = mode === "sign-up";

  if (returnedToTab) {
    return <ReturnToTab locale={locale} />;
  }

  const noticeText = verificationExpired
    ? screen.notices.verificationExpired
    : notice
      ? screen.notices[notice]
      : null;

  return (
    <AuthFrame
      locale={locale}
      screen={mode}
      title={
        intentPrompt ?? (isSignUp ? screen.signUp.title : screen.signIn.title)
      }
      description={
        intentPrompt
          ? screen.intentDescription
          : isSignUp
            ? screen.signUp.description
            : screen.signIn.description
      }
      footer={
        <>
          <p className="text-text-secondary">
            {screen.help.trouble}{" "}
            <Link href={authHelpHref(next)} data-auth-help-link="true">
              {copy.signInHelp}
            </Link>
          </p>
          <Link
            href={cancelHref}
            variant="muted"
            className="justify-self-start"
            data-auth-cancel="true"
          >
            {screen.backToReading}
          </Link>
        </>
      }
    >
      <AuthModeSwitch locale={locale} mode={mode} next={next} />

      {noticeText ? (
        <Callout
          id="auth-notice"
          tone={notice === "password-reset" ? "success" : "info"}
          data-auth-notice={
            verificationExpired ? "verification-expired" : notice
          }
        >
          {noticeText}
        </Callout>
      ) : null}

      {providerError ? (
        <Callout
          id="auth-provider-error"
          tone="danger"
          data-auth-message="provider"
        >
          {providerError}
        </Callout>
      ) : null}

      {/* The provider above an `or` divider, then the labelled fields: the
          anatomy Intercom, Cal.com, Uxcel, Mixpanel and Relevance AI all
          ship, and all five show the Google mark. */}
      {googleSignInEnabled ? (
        <div className="grid gap-4">
          <TransportBoundary
            render={(failures) => (
              <SocialForm
                locale={locale}
                next={next}
                startSocial={startSocial}
                transportFailed={failures > 0}
              />
            )}
          />
          <OrDivider label={copy.orDivider} />
        </div>
      ) : null}

      <TransportBoundary
        render={(failures) => (
          <CredentialForm
            mode={mode}
            locale={locale}
            next={next}
            notice={notice}
            submit={submit}
            email={email}
            onEmailChange={setEmail}
            password={password}
            onPasswordChange={setPassword}
            transportFailed={failures > 0}
            onReturnToTab={() => setReturnedToTab(true)}
            // The field that takes focus on arrival also reads out why the
            // reader is here: a notice drawn with the page is not announced
            // by any live region, and focus skips past it.
            arrivalDescription={
              [
                noticeText ? "auth-notice" : null,
                providerError ? "auth-provider-error" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
        )}
      />
    </AuthFrame>
  );
}

function CredentialForm({
  mode,
  locale,
  next,
  notice,
  submit,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  transportFailed,
  onReturnToTab,
  arrivalDescription,
}: {
  mode: AuthMode;
  locale: InterfaceLocale;
  next: string;
  notice: AuthScreenNotice | null;
  submit: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  transportFailed: boolean;
  onReturnToTab: () => void;
  arrivalDescription?: string;
}) {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const screen = getAuthScreenCopy(locale);
  const isSignUp = mode === "sign-up";
  const [state, formAction] = useActionState(submit, {
    status: "idle" as const,
    message: null,
  });
  const refused = state.status === "error";
  const signedIn = state.status === "signed-in" && Boolean(state.redirectTo);
  const emailRef = useRef<HTMLInputElement>(null);
  const handledStateRef = useRef<AuthFormState | null>(null);

  // ADR-0022 D6: signing in reloads every *other* open tab that was drawn for
  // another account — a guest's, or somebody else's. The signal carries who
  // signed in, so a tab already drawn for this same account is left alone:
  // the composer whose session ended keeps its unpublished words while the
  // reader signs in here (`OVE-504`, criterion 4).
  //
  // The destination is reached by a **document navigation**, not
  // `router.replace`. The shell lives in the root layout, and a client
  // navigation inside the same layout does not re-render it — so a reader who
  // signed in landed on the page they asked for with the chrome still offering
  // them "sign in". Watched in a real browser on 2026-09-17 (`OVE-455`).
  useEffect(() => {
    if (state.status !== "signed-in" || !state.redirectTo) return;
    if (handledStateRef.current === state) return;
    handledStateRef.current = state;
    announceSessionSignal({
      type: "signed_in",
      ownerUserId: state.ownerUserId ?? null,
    });
    if (notice === "return-to-tab") {
      onReturnToTab();
      return;
    }
    window.location.assign(state.redirectTo);
  }, [notice, onReturnToTab, state]);

  // The first invalid control takes focus (DESIGN.md §5.3). A refusal never
  // says *which* credential was wrong — that would tell somebody probing which
  // half they had right — so the first control of the form is the first
  // invalid one, and it is where a reader continues from.
  useEffect(() => {
    if (refused) emailRef.current?.focus();
  }, [refused, state]);

  // A request that never came back re-mounts this form with nothing from the
  // server; the words above the boundary are still the reader's.
  const lostRequest = transportFailed && state.status === "idle";
  const message = lostRequest ? screen.transportFailed : state.message;
  const messageKind = lostRequest
    ? "transport"
    : refused
      ? "error"
      : state.status === "unverified"
        ? "verify-email"
        : "status";
  const alarming = refused || lostRequest;

  return (
    <form
      action={formAction}
      // A password manager can fill both fields without an `input` event —
      // Chrome does on page load — and the state behind them would then be
      // empty while the fields are not, and the render after a refusal would
      // clear them. Submitting is the one moment the values are certainly
      // readable, so that is when they are taken.
      onSubmit={(event) => {
        const fields = event.currentTarget.elements;
        onEmailChange(readField(fields, "email"));
        onPasswordChange(readField(fields, "password"));
      }}
      className="grid gap-4"
    >
      <HiddenField name="next" value={next} />

      {/* A refusal is a form-level error: a `Callout` with `role="alert"`
          above the fields, saying what to do next and never which of the
          two credentials was wrong (DESIGN.md §5.3). */}
      {message ? (
        <Callout
          id="auth-message"
          tone={
            alarming
              ? "danger"
              : state.status === "unverified"
                ? "warning"
                : "info"
          }
          live={alarming ? "assertive" : "polite"}
          data-auth-message={messageKind}
        >
          {message}
        </Callout>
      ) : null}

      <Field label={copy.email} required>
        <Input
          ref={emailRef}
          type="email"
          name="email"
          autoFocus
          required
          // `username`, not `email`, on both screens: it is the token
          // password managers pair with the password beside it, which is
          // what saves and fills the pair (criterion 3).
          autoComplete="username"
          inputMode="email"
          spellCheck={false}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={refused || undefined}
          aria-describedby={message ? "auth-message" : arrivalDescription}
        />
      </Field>

      <Field
        label={copy.password}
        required
        mark={
          isSignUp ? undefined : (
            <Link
              href={authHelpHref(next)}
              className="text-caption font-medium"
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
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
          aria-invalid={refused || undefined}
          aria-describedby={message ? "auth-message" : undefined}
        />
      </Field>

      <SubmitButton
        busy={signedIn}
        pendingLabel={isSignUp ? screen.pending.signUp : screen.pending.signIn}
        doneLabel={screen.signedInOpening}
      >
        {isSignUp ? copy.createAccount : copy.signIn}
      </SubmitButton>
    </form>
  );
}

/**
 * Pending, and then "signed in, opening the page", are two different
 * sentences: the first can still fail, the second is only waiting for the
 * browser (`OVE-504`, criterion 5). Both keep the button where it is, busy and
 * focusable (DESIGN.md §4.4), and a second press while either is showing does
 * nothing rather than posting the same credentials twice.
 */
function SubmitButton({
  children,
  busy,
  pendingLabel,
  doneLabel,
}: {
  children: React.ReactNode;
  busy: boolean;
  pendingLabel: string;
  doneLabel: string;
}) {
  const { pending } = useFormStatus();
  const working = pending || busy;
  return (
    <div className="grid gap-2">
      <Button
        type="submit"
        loading={working}
        onClick={(event) => {
          if (working) event.preventDefault();
        }}
      >
        {children}
      </Button>
      <p
        role="status"
        data-auth-progress={pending ? "pending" : busy ? "done" : "idle"}
        className={cn(
          "text-body-sm text-text-secondary",
          !working && "sr-only",
        )}
      >
        {pending ? pendingLabel : busy ? doneLabel : ""}
      </p>
    </div>
  );
}

function SocialForm({
  locale,
  next,
  startSocial,
  transportFailed,
}: {
  locale: InterfaceLocale;
  next: string;
  startSocial: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  transportFailed: boolean;
}) {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const screen = getAuthScreenCopy(locale);
  const [state, formAction] = useActionState(startSocial, {
    status: "idle" as const,
    message: null,
  });
  const leaving = state.status === "redirect" && Boolean(state.redirectTo);

  // A social handshake cannot redirect from inside the action without losing
  // the cookie it sets, so the provider URL comes back and the browser follows.
  useEffect(() => {
    if (state.status === "redirect" && state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state]);

  const lostRequest = transportFailed && state.status === "idle";
  const message = lostRequest ? screen.transportFailed : state.message;

  return (
    <form action={formAction} className="grid gap-2">
      <HiddenField name="provider" value="google" />
      <HiddenField name="next" value={next} />
      <GoogleSubmit
        label={formatTrustTemplate(copy.continueWith, { provider: "Google" })}
        busy={leaving}
        pendingLabel={screen.pending.social}
      />
      {message ? (
        <Callout
          tone="danger"
          live="assertive"
          data-auth-message={lostRequest ? "transport" : "provider"}
        >
          {message}
        </Callout>
      ) : null}
    </form>
  );
}

function GoogleSubmit({
  label,
  busy,
  pendingLabel,
}: {
  label: string;
  busy: boolean;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  const working = pending || busy;
  return (
    <>
      <GoogleSignInButton
        label={label}
        loading={working}
        onClick={(event) => {
          if (working) event.preventDefault();
        }}
        data-testid="google-sign-in-button"
      />
      <p
        role="status"
        className={cn(
          "text-body-sm text-text-secondary",
          !working && "sr-only",
        )}
      >
        {working ? pendingLabel : ""}
      </p>
    </>
  );
}

/**
 * Which of the two the reader is on, and the way to the other, carrying the
 * return path and nothing else. Links, not tabs: each mode is its own address,
 * and a reader who follows one lands on a screen that works without scripts.
 */
function AuthModeSwitch({
  locale,
  mode,
  next,
}: {
  locale: InterfaceLocale;
  mode: AuthMode;
  next: string;
}) {
  const screen = getAuthScreenCopy(locale);
  const items = [
    {
      key: "sign-in",
      label: screen.modes.signIn,
      href: buildSignInHref({ returnTo: next }),
    },
    {
      key: "sign-up",
      label: screen.modes.signUp,
      href: buildSignInHref({ returnTo: next, signUp: true }),
    },
  ] as const;

  return (
    <nav aria-label={screen.modes.label} data-auth-mode-switch="true">
      <ul className="grid list-none grid-cols-2 border-b border-border">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <NextLink
              href={item.href}
              aria-current={item.key === mode ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center justify-center border-b-2 px-3 text-center text-body-sm font-medium",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                item.key === mode
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {item.label}
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Signed in from the tab a composer opened: the words are in the other tab,
 * so this one says where to go instead of opening an empty composer beside
 * them (`OVE-504`, criterion 4). A tab opened by a link and never navigated is
 * one a script may close; where a browser refuses, the sentence still stands.
 */
function ReturnToTab({ locale }: { locale: InterfaceLocale }) {
  const screen = getAuthScreenCopy(locale);
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <AuthFrame
      locale={locale}
      screen="signed-in"
      title={screen.returnToTab.title}
    >
      <div
        ref={headingRef}
        tabIndex={-1}
        data-auth-returned-to-tab="true"
        className="grid gap-4 outline-none"
      >
        <Callout tone="success" live="polite">
          {screen.returnToTab.description}
        </Callout>
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          onClick={() => window.close()}
        >
          {screen.returnToTab.close}
        </Button>
      </div>
    </AuthFrame>
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

function readField(fields: HTMLFormControlsCollection, name: string) {
  const field = fields.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : "";
}

/** The help screen, carrying the return path so its way back keeps it. */
function authHelpHref(next: string) {
  return next === "/garden"
    ? AUTH_HELP_PATH
    : `${AUTH_HELP_PATH}?next=${encodeURIComponent(next)}`;
}
