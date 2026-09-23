"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import {
  passwordResetRedirectUrl,
  passwordResetSuccessPath,
} from "@/lib/auth/auth-recovery";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  buildEmailVerificationCallbackHref,
  buildSignInHref,
} from "@/lib/navigation/sign-in-href";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatTrustTemplate,
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getAuthBaseUrl } from "@/lib/runtime-url";
import { handlePasswordResetRequest } from "@/server/auth/password-reset-request";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";

/**
 * Sign-in and sign-up, on the server.
 *
 * `nextCookies()` is registered in `lib/auth.ts`, so `auth.api.*` sets the
 * session cookie from a Server Action exactly as the route handler did. Moving
 * the call here buys four things the client path could not have:
 *
 *   * the form works with JavaScript disabled, so the screen is usable before
 *     hydration finishes and on a client that never runs it at all;
 *   * an invalid credential arrives already rendered, with no flash of an empty
 *     panel while a fetch resolves;
 *   * the return path is validated and followed by the server, so an untrusted
 *     value never reaches `router.push`;
 *   * no authentication logic ships in the client bundle.
 *
 * Each action is form-shaped — `(previousState, formData)` — because that is the
 * one shape React gives a real endpoint to. Nothing throws: Better Auth signals
 * a refusal with `APIError`, and everything else settles into the same neutral
 * message, so a wrong password and an unreachable database stay
 * indistinguishable to somebody guessing.
 */

export interface AuthFormState {
  status:
    | "idle"
    | "error"
    | "accepted"
    | "unverified"
    | "expired"
    | "signed-in"
    | "redirect";
  message: string | null;
  /** Where the browser must go next: the return path, or a provider handshake. */
  redirectTo?: string;
  /**
   * Who just signed in, so the cross-tab signal can leave alone a tab already
   * drawn for this same account (ADR-0022 D6 reloads only for *another* one).
   * It is the reader's own id, which every document drawn for them carries.
   */
  ownerUserId?: string | null;
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authPanel;

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: field(formData, "email").trim(),
        password: field(formData, "password"),
        // Where the verification link returns an unverified reader: the
        // sign-in screen, carrying the same destination (`OVE-504`).
        callbackURL: buildEmailVerificationCallbackHref(safeNext(formData)),
      },
      headers: await headers(),
    });
    return {
      status: "signed-in",
      message: null,
      redirectTo: safeNext(formData),
      ownerUserId: result?.user?.id ?? null,
    };
  } catch (error) {
    // Better Auth checks the password before it checks verification, so this
    // answer reaches only somebody who typed the right password: saying the
    // address needs verifying tells an enumerator nothing they did not know.
    if (isEmailNotVerified(error)) {
      return {
        status: "unverified",
        message: getAuthScreenCopy(locale).verifyEmail,
      };
    }
    return {
      status: "error",
      message: authMessage(locale, error, copy.signInError),
    };
  }
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authPanel;

  try {
    await auth.api.signUpEmail({
      body: {
        email: field(formData, "email").trim(),
        password: field(formData, "password"),
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
        // The verification link signs the new gardener in and returns them to
        // what they were doing before signing up, not to the home page.
        callbackURL: buildEmailVerificationCallbackHref(safeNext(formData)),
      },
      headers: await headers(),
    });
    // Deliberately the same wording whether the address was new or already had
    // an account: the response may not tell an enumerator which.
    return {
      status: "accepted",
      message: getLocalizedEmailSignUpResult(locale, null).message,
      redirectTo: safeNext(formData),
    };
  } catch (error) {
    if (error instanceof APIError) {
      const result = getLocalizedEmailSignUpResult(locale, {
        message: error.message,
        status: error.statusCode,
      });
      return result.kind === "accepted"
        ? {
            status: "accepted",
            message: result.message,
            redirectTo: safeNext(formData),
          }
        : { status: "error", message: result.message };
    }
    record(error, "sign_up");
    return { status: "error", message: copy.createAccountError };
  }
}

/**
 * Setting a new password from a one-time link.
 *
 * It was `authClient.resetPassword` in the browser until `OVE-455`, so the one
 * screen a reader reaches from an email — often on a phone, often on a network
 * that has just made them wait — did nothing at all until its bundle had run.
 * Every other form on these five pages already posted to a real endpoint
 * (ADR-0024 D3); this one is the last of them.
 *
 * The token travels in the form rather than in a closure, because a form is
 * what a browser can submit without JavaScript. It is never echoed back: a
 * refusal says the link did not work and offers the help screen, and says
 * nothing about why, which is the same reason sign-in never names the wrong
 * credential.
 */
export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).resetPassword;
  const expired = getAuthScreenCopy(locale).reset.expiredDescription;
  const token = field(formData, "token").trim();
  const password = field(formData, "password");

  if (password !== field(formData, "confirmPassword")) {
    return { status: "error", message: copy.mismatch };
  }
  if (token.length === 0) {
    return { status: "expired", message: expired };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (error) {
    if (isPasswordOutOfBounds(error)) {
      return {
        status: "error",
        message: getAuthScreenCopy(locale).reset.passwordRule,
      };
    }
    if (!(error instanceof APIError)) record(error, "reset_password");
    return { status: "expired", message: expired };
  }

  // Outside the `try`: `redirect` throws by design, and catching it here would
  // turn a completed reset into "the link did not work". Every session ended
  // with the old password, so the sign-in screen is the next step, and it says
  // the password changed rather than leaving the reader to guess (`OVE-504`).
  redirect(passwordResetSuccessPath());
}

/**
 * Asking for a password-reset link, from the help screen (`OVE-504`).
 *
 * It was `authClient.requestPasswordReset` behind a `type="button"`, so the
 * one form a locked-out reader needs did nothing until the bundle had run, and
 * it was the last client-only form on the five authentication screens
 * (ADR-0024 D3). Now it is a Server Action — and it answers through the same
 * path as `POST /api/auth/request-password-reset`, not through `auth.api`:
 * Better Auth's rate limit lives in its HTTP router, and a direct call would
 * have quietly lost it. The reader's address headers go with the request, so
 * the limit is still per reader and not per server.
 *
 * Every address gets the same answer, whether or not it has an account.
 */
export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authHelp.reset;
  const screen = getAuthScreenCopy(locale);
  const email = field(formData, "email").trim();
  if (email.length === 0) {
    return { status: "error", message: copy.emailRequired };
  }

  const base = new URL(getAuthBaseUrl());
  const incoming = await headers();
  const forwarded = new Headers({
    "content-type": "application/json",
    origin: base.origin,
  });
  for (const name of FORWARDED_CLIENT_HEADERS) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }

  let response: Response;
  try {
    response = await handlePasswordResetRequest(
      new Request(new URL("/api/auth/request-password-reset", base), {
        method: "POST",
        headers: forwarded,
        body: JSON.stringify({
          email,
          redirectTo: passwordResetRedirectUrl(base.origin),
        }),
      }),
    );
  } catch (error) {
    record(error, "request_password_reset");
    return { status: "error", message: copy.error };
  }

  if (response.status === 429) {
    return { status: "error", message: screen.help.rateLimited };
  }
  if (response.status === 400) {
    return { status: "error", message: copy.emailRequired };
  }
  if (!response.ok) return { status: "error", message: copy.error };
  return { status: "accepted", message: copy.success };
}

/** What the rate limit keys on: the reader's address, as the edge saw it. */
const FORWARDED_CLIENT_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "user-agent",
] as const;

/**
 * Starts an OAuth handshake and hands the provider URL back for the browser to
 * follow. The redirect is not performed here: redirecting from inside the action
 * would drop the `Set-Cookie` the handshake depends on.
 */
export async function startSocialSignInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authPanel;

  const refused = formatTrustTemplate(copy.socialSignInError, {
    provider: "Google",
  });

  if (!isGoogleSignInEnabled() || field(formData, "provider") !== "google") {
    return { status: "error", message: refused };
  }

  try {
    const callbackURL = safeNext(formData);
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL,
        newUserCallbackURL: callbackURL,
        // A refusal at the provider comes back to this screen, which says
        // what happened, rather than to the destination, which knows
        // nothing about it (`OVE-504`, criterion 5).
        errorCallbackURL: buildSignInHref({ returnTo: callbackURL }),
        disableRedirect: true,
      },
      headers: await headers(),
    });
    const url = (result as { url?: unknown } | null)?.url;
    return typeof url === "string" && url.length > 0
      ? { status: "redirect", message: null, redirectTo: url }
      : { status: "error", message: refused };
  } catch (error) {
    record(error, "sign_in_social");
    return { status: "error", message: refused };
  }
}

/** The return path, through the same same-origin boundary every surface uses. */
function safeNext(formData: FormData): string {
  return normalizeInternalReturnPath(formData.get("next"), "/garden");
}

function authMessage(
  locale: InterfaceLocale,
  error: unknown,
  fallback: string,
): string {
  if (error instanceof APIError) {
    return (
      getLocalizedAuthClientErrorMessage(locale, {
        message: error.message,
        status: error.statusCode,
      }) ?? fallback
    );
  }
  record(error, "sign_in");
  return fallback;
}

function isPasswordOutOfBounds(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG";
}

function isEmailNotVerified(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  const body = error.body as { code?: unknown } | undefined;
  return (
    body?.code === "EMAIL_NOT_VERIFIED" ||
    /email not verified/iu.test(error.message)
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A fault the reader cannot act on still leaves one bounded line (ADR-0023). */
function record(error: unknown, section: string) {
  recordWorkspaceSectionFailure(describeWorkspaceFailure(error), {
    surface: "auth_surface",
    section,
  });
}
