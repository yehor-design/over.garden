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
    /**
     * Why the reader is here, when it is not an action (`OVE-504`). One line
     * above the form, from a closed set; like `intent`, it may change what the
     * screen says and never which fields or providers it has.
     */
    notice?: AuthScreenNotice | null;
  } = {},
) {
  const params = new URLSearchParams();

  const returnTo = resolveReturnTo(options.returnTo);
  if (returnTo) params.set("next", returnTo);
  if (options.intent) params.set("intent", options.intent);
  if (options.notice) params.set("notice", options.notice);

  const path = options.signUp ? SIGN_UP_PATH : SIGN_IN_PATH;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The reasons a reader can be sent to the sign-in screen that are not an
 * action of theirs (`OVE-504`, criterion 5): each is a different sentence,
 * because each needs a different next step.
 *
 * - `intent-expired`: the action they pressed is older than its signed token,
 *   so signing in returns them to the page and they press it again;
 * - `intent-invalid`: the action could not be verified at all;
 * - `password-reset`: a new password was just set, and every session with it;
 * - `return-to-tab`: unpublished writing lives in the tab that opened this
 *   one, so signing in here must not send them to an empty composer.
 */
export const AUTH_SCREEN_NOTICES = [
  "intent-expired",
  "intent-invalid",
  "password-reset",
  "return-to-tab",
] as const;

export type AuthScreenNotice = (typeof AUTH_SCREEN_NOTICES)[number];

export function isAuthScreenNotice(value: unknown): value is AuthScreenNotice {
  return (
    typeof value === "string" &&
    (AUTH_SCREEN_NOTICES as readonly string[]).includes(value)
  );
}

/**
 * Where an email-verification link returns the reader (`OVE-504`).
 *
 * Better Auth sends the reader to this address after verifying — signed in —
 * or to the same address with `error=…` when the link has expired. Pointing it
 * at the sign-in screen, and not at the destination directly, is what lets an
 * expired link say so instead of landing on a page that knows nothing about it.
 * The destination rides along as `next`, so an action begun before signing up
 * is still where the reader ends up.
 */
export function buildEmailVerificationCallbackHref(returnTo?: string | null) {
  const params = new URLSearchParams();
  const next = resolveReturnTo(returnTo);
  if (next) params.set("next", next);
  params.set("verified", "1");
  return `${SIGN_IN_PATH}?${params.toString()}`;
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
