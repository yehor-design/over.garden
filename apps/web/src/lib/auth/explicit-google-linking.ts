import "server-only";

import { APIError } from "better-auth/api";

import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { configuredEnvValue, type EnvLike } from "@/lib/auth/oauth-env";
import { GOOGLE_PROVIDER_ID } from "@/lib/auth/social-oauth";

export const GOOGLE_ACCOUNT_LINKING_ENABLED_ENV =
  "GOOGLE_ACCOUNT_LINKING_ENABLED";
export const ACCOUNT_LINKING_UNAVAILABLE_CODE = "ACCOUNT_LINKING_UNAVAILABLE";

export type ExplicitGoogleLinkingAdmissionOutcome =
  | "not_link_social"
  | "admitted";

interface ExplicitGoogleLinkingContext {
  path: string;
  body?: unknown;
  getSignedCookie: (
    key: string,
    secret: string,
  ) => Promise<string | false | null>;
  context: {
    authCookies: {
      sessionToken: {
        name: string;
      };
    };
    secret: string;
    internalAdapter: {
      findSession: (sessionToken: string) => Promise<unknown>;
    };
  };
}

export function isExplicitGoogleLinkingEnabled(env: EnvLike = process.env) {
  return (
    configuredEnvValue(env[GOOGLE_ACCOUNT_LINKING_ENABLED_ENV]) === "true" &&
    isGoogleSignInEnabled(env)
  );
}

/**
 * Fail closed before Better Auth creates signed provider state. Better Auth's
 * global before hook runs before endpoint session middleware, so this gate
 * resolves the signed current-session cookie through the library's internal
 * adapter and admits only a verified local user. It deliberately returns no
 * identity/provider detail on every closed class.
 */
export async function admitExplicitGoogleLinking(
  context: ExplicitGoogleLinkingContext,
  options: { env?: EnvLike } = {},
): Promise<ExplicitGoogleLinkingAdmissionOutcome> {
  if (context.path !== "/link-social") return "not_link_social";

  const body = readObject(context.body);
  if (
    !isExplicitGoogleLinkingEnabled(options.env) ||
    body?.provider !== GOOGLE_PROVIDER_ID ||
    body.idToken !== undefined
  ) {
    throwUnavailable();
  }

  let sessionToken: string | false | null;
  try {
    sessionToken = await context.getSignedCookie(
      context.context.authCookies.sessionToken.name,
      context.context.secret,
    );
  } catch {
    throwUnavailable();
  }
  if (!sessionToken) throwUnavailable();

  let currentSession: unknown;
  try {
    currentSession =
      await context.context.internalAdapter.findSession(sessionToken);
  } catch {
    throwUnavailable();
  }
  if (!hasVerifiedCurrentUser(currentSession)) throwUnavailable();

  return "admitted";
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasVerifiedCurrentUser(value: unknown) {
  const session = readObject(value);
  const user = readObject(session?.user);
  return user?.emailVerified === true;
}

function throwUnavailable(): never {
  throw APIError.from("FORBIDDEN", {
    code: ACCOUNT_LINKING_UNAVAILABLE_CODE,
    message: "Account linking is unavailable.",
  });
}
