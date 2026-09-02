import "server-only";

import { APIError } from "better-auth/api";

import { isSealedOwnerUserId } from "@/lib/admin/owner-account-contract";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { configuredEnvValue, type EnvLike } from "@/lib/auth/oauth-env";
import { GOOGLE_PROVIDER_ID } from "@/lib/auth/social-oauth";

export const GOOGLE_ACCOUNT_LINKING_ENABLED_ENV =
  "GOOGLE_ACCOUNT_LINKING_ENABLED";
export const ACCOUNT_LINKING_UNAVAILABLE_CODE = "ACCOUNT_LINKING_UNAVAILABLE";

export type ExplicitGoogleLinkingAdmissionOutcome =
  | "not_link_social"
  | "admitted"
  | "served_unresolved";

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

export function isExplicitGoogleLinkingEnabledForUser(
  userId: string,
  env: EnvLike = process.env,
) {
  return (
    isExplicitGoogleLinkingEnabled(env) && !isSealedOwnerUserId(userId, env)
  );
}

/**
 * Reject definite local prohibitions before Better Auth creates signed
 * provider state. Because this global hook runs before Better Auth's own
 * endpoint session middleware, an inconclusive duplicate cookie/adapter proof
 * records `provider_link_unverified` and delegates to that authoritative
 * middleware; malformed requests, missing sessions, disabled providers,
 * unverified users, and the sealed owner remain closed without identity detail.
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
    return serveUnresolvedProviderLink();
  }
  if (!sessionToken) throwUnavailable();

  let currentSession: unknown;
  try {
    currentSession =
      await context.context.internalAdapter.findSession(sessionToken);
  } catch {
    return serveUnresolvedProviderLink();
  }
  const sessionClass = classifyCurrentNonOwnerUser(currentSession, options.env);
  if (sessionClass === "unresolved") {
    return serveUnresolvedProviderLink();
  }
  if (sessionClass === "refused") {
    throwUnavailable();
  }

  return "admitted";
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyCurrentNonOwnerUser(
  value: unknown,
  env?: EnvLike,
): "admitted" | "refused" | "unresolved" {
  if (value === null || value === undefined) return "refused";
  const session = readObject(value);
  if (!session) return "unresolved";
  const user = readObject(session?.user);
  if (!user || typeof user.id !== "string" || !user.id) return "unresolved";
  if (typeof user.emailVerified !== "boolean") return "unresolved";
  if (user.emailVerified === true && !isSealedOwnerUserId(user.id, env)) {
    return "admitted";
  }
  return "refused";
}

function serveUnresolvedProviderLink(): "served_unresolved" {
  return "served_unresolved";
}

function throwUnavailable(): never {
  throw APIError.from("FORBIDDEN", {
    code: ACCOUNT_LINKING_UNAVAILABLE_CODE,
    message: "Account linking is unavailable.",
  });
}
