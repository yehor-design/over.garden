"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
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
 *   * the form works with JavaScript disabled — which on this site is not a
 *     nicety: public pages do not hydrate below the shell (OVE-380, measured
 *     2026-09-04), so a screen that needs hydration to submit does not work;
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
  status: "idle" | "error" | "accepted" | "signed-in" | "redirect";
  message: string | null;
  /** Where the browser must go next: the return path, or a provider handshake. */
  redirectTo?: string;
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authPanel;

  try {
    await auth.api.signInEmail({
      body: {
        email: field(formData, "email").trim(),
        password: field(formData, "password"),
      },
      headers: await headers(),
    });
    return {
      status: "signed-in",
      message: null,
      redirectTo: safeNext(formData),
    };
  } catch (error) {
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

  if (!isGoogleSignInEnabled() || field(formData, "provider") !== "google") {
    return { status: "error", message: copy.socialSignInError };
  }

  try {
    const callbackURL = safeNext(formData);
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    const url = (result as { url?: unknown } | null)?.url;
    return typeof url === "string" && url.length > 0
      ? { status: "redirect", message: null, redirectTo: url }
      : { status: "error", message: copy.socialSignInError };
  } catch (error) {
    record(error, "sign_in_social");
    return { status: "error", message: copy.socialSignInError };
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
