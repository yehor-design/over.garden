import {
  InternalReturnPathError,
  parseInternalReturnPath,
} from "./internal-return-path";

export const SIGN_IN_PATH = "/auth/sign-in";
export const SIGN_UP_PATH = "/auth/sign-up";

/**
 * Where the sign-in actions send somebody who arrived with no return path.
 * Kept in step with `auth-actions.ts` and `params.ts`, which both spell it as
 * the fallback of `normalizeInternalReturnPath`. Naming it here lets a link
 * that would only restate the default stay clean.
 */
const DEFAULT_POST_AUTH_PATH = "/garden";

/**
 * Returning somebody to one of these is a loop: each of them exists to send the
 * reader to the sign-in screen. Every other `/auth/**` path is a real
 * destination — `/auth/intent/resume` is how a held action continues.
 */
const LOOPING_RETURN_PATHS = new Set([
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/intent",
]);

/**
 * The one place a link to the sign-in screen is built.
 *
 * OVE-378 gave the product a single sign-in surface, but every caller still
 * assembled its own `"/auth/sign-in?next=" + encodeURIComponent(...)`, and the
 * site header assembled nothing at all — it kept a hard-coded `/garden`, which
 * sent the reader to the workspace empty state to press a second "sign in"
 * before reaching the form. One screen is only worth having if one function
 * addresses it.
 *
 * `returnTo` passes the same same-origin boundary every other return path
 * uses, and an unusable value drops out rather than throwing: a link is not
 * the place to fail. So does a path that would send the reader straight back to
 * the sign-in screen; `/auth/intent/resume` is not one of those and survives,
 * because that is how a held action continues after signing in.
 */
export function buildSignInHref(
  options: {
    returnTo?: string | null;
    intent?: string | null;
    signUp?: boolean;
  } = {},
) {
  const params = new URLSearchParams();

  const returnTo = resolveReturnTo(options.returnTo);
  if (returnTo) params.set("next", returnTo);
  if (options.intent) params.set("intent", options.intent);

  const path = options.signUp ? SIGN_UP_PATH : SIGN_IN_PATH;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function isSignInPath(pathname: string) {
  return pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH;
}

function resolveReturnTo(value: string | null | undefined) {
  if (typeof value !== "string" || value.length === 0) return null;

  let path: string;
  try {
    path = parseInternalReturnPath(value);
  } catch (error) {
    if (error instanceof InternalReturnPathError) return null;
    throw error;
  }

  const [withoutQuery] = path.split("?");
  if (LOOPING_RETURN_PATHS.has(withoutQuery ?? path)) return null;

  // `?next=/garden` and no `next` at all mean the same thing; prefer the
  // shorter address, so the plain "sign in" control reads as one URL.
  return path === DEFAULT_POST_AUTH_PATH ? null : path;
}
