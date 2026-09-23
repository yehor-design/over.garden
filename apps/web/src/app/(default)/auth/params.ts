import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  AUTH_INTENT_ACTIONS,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  isAuthScreenNotice,
  type AuthScreenNotice,
} from "@/lib/navigation/sign-in-href";
import {
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";

export type AuthScreenSearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface AuthScreenParams {
  /** Where the reader goes once they are in. Always an internal path. */
  next: string;
  /** Whether `next` was given, or is only the default. */
  hasNext: boolean;
  /** The heading, when they arrived from an action rather than the navigation. */
  intentPrompt: string | null;
  intentAction: AuthIntentAction | null;
  /** Why they were sent here, when it was not an action (`OVE-504`). */
  notice: AuthScreenNotice | null;
  /** A provider sign-in that came back refused, in the reader's words. */
  providerError: string | null;
  /**
   * An email-verification link came back: `done` when it signed the reader in,
   * `expired` when Better Auth refused it.
   */
  verification: "done" | "expired" | null;
}

/**
 * The whole query contract of the sign-in and sign-up screens.
 *
 * `next` decides where the reader lands; everything else decides only what the
 * screen says. Keeping them cosmetic is deliberate: a value in the address may
 * not change which providers, fields, or controls exist, so a crafted link
 * cannot turn the screen into a different screen. Each is read from a closed
 * set, so a crafted link cannot put words of its own on it either.
 */
export function readAuthScreenParams(
  params: AuthScreenSearchParams,
  locale: InterfaceLocale,
): AuthScreenParams {
  const rawNext = first(params.next);
  const next = normalizeInternalReturnPath(rawNext, "/garden");
  const action = first(params.intent);
  const intentAction = isAuthIntentAction(action) ? action : null;
  const intentPrompt = intentAction
    ? getTrustSurfaceCopy(locale).authIntent.actions[intentAction]
    : null;
  const notice = first(params.notice);
  const error = first(params.error);
  const verified = first(params.verified) === "1";

  return {
    next,
    hasNext: rawNext.length > 0 && next === rawNext,
    intentPrompt,
    intentAction,
    notice: isAuthScreenNotice(notice) ? notice : null,
    // Better Auth answers an expired verification link on the same address
    // with `error=…`; any other `error` is a provider handshake that failed.
    providerError:
      error && !verified ? getLocalizedOAuthErrorMessage(locale, error) : null,
    verification: verified ? (error ? "expired" : "done") : null,
  };
}

function isAuthIntentAction(value: string): value is AuthIntentAction {
  return (AUTH_INTENT_ACTIONS as readonly string[]).includes(value);
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
