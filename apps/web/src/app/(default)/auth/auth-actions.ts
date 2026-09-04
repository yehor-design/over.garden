"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
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
 *   * the form works with JavaScript disabled;
 *   * an invalid credential arrives already rendered, with no flash of an empty
 *     panel while a fetch resolves;
 *   * the redirect to `next` is decided by the server, so an untrusted value
 *     never reaches `router.push`;
 *   * no authentication logic ships in the client bundle.
 *
 * Nothing throws. Better Auth signals a refusal with `APIError`, and everything
 * else settles into the same neutral message — a wrong password and an
 * unreachable database must not be distinguishable to somebody guessing.
 */

export type AuthActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export async function signInAction(
  locale: InterfaceLocale,
  input: { email: string; password: string },
): Promise<AuthActionResult> {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  try {
    await auth.api.signInEmail({
      body: { email: input.email.trim(), password: input.password },
      headers: await headers(),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: authMessage(locale, error, copy.signInError) };
  }
}

export async function signUpAction(
  locale: InterfaceLocale,
  input: { email: string; password: string },
): Promise<AuthActionResult> {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  try {
    await auth.api.signUpEmail({
      body: {
        email: input.email.trim(),
        password: input.password,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
      headers: await headers(),
    });
    // The accepted wording is deliberately the same whether the address was new
    // or already had an account: the response may not tell an enumerator which.
    return {
      ok: true,
      message: getLocalizedEmailSignUpResult(locale, null).message,
    };
  } catch (error) {
    if (error instanceof APIError) {
      const result = getLocalizedEmailSignUpResult(locale, {
        message: error.message,
        status: error.statusCode,
      });
      return result.kind === "accepted"
        ? { ok: true, message: result.message }
        : { ok: false, message: result.message };
    }
    record(error, "sign_up");
    return { ok: false, message: copy.createAccountError };
  }
}

/**
 * Starts an OAuth handshake and hands back the provider URL for the browser to
 * follow. The redirect is not performed here: a Server Action redirect would
 * lose the `Set-Cookie` the handshake needs.
 */
export async function startSocialSignInAction(
  locale: InterfaceLocale,
  input: { provider: string; callbackURL: string },
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  if (!isGoogleSignInEnabled() || input.provider !== "google") {
    return { ok: false, message: copy.socialSignInError };
  }

  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: input.callbackURL,
        newUserCallbackURL: input.callbackURL,
        errorCallbackURL: input.callbackURL,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    const url = (result as { url?: unknown } | null)?.url;
    return typeof url === "string" && url.length > 0
      ? { ok: true, url }
      : { ok: false, message: copy.socialSignInError };
  } catch (error) {
    record(error, "sign_in_social");
    return { ok: false, message: copy.socialSignInError };
  }
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

/** A fault the reader cannot act on still leaves one bounded line (ADR-0023). */
function record(error: unknown, section: string) {
  recordWorkspaceSectionFailure(describeWorkspaceFailure(error), {
    surface: "auth_surface",
    section,
  });
}
