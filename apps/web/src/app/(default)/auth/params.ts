import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  AUTH_INTENT_ACTIONS,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

export type AuthScreenSearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface AuthScreenParams {
  /** Where the reader goes once they are in. Always an internal path. */
  next: string;
  /** The heading, when they arrived from an action rather than the navigation. */
  intentPrompt: string | null;
}

/**
 * The whole query contract of the sign-in and sign-up screens.
 *
 * `next` decides where the reader lands; `intent` decides only what the heading
 * says. Keeping `intent` cosmetic is deliberate: a value in the address may not
 * change which providers, fields, or controls exist, so a crafted link cannot
 * turn the screen into a different screen.
 */
export function readAuthScreenParams(
  params: AuthScreenSearchParams,
  locale: InterfaceLocale,
): AuthScreenParams {
  const next = normalizeInternalReturnPath(first(params.next), "/garden");
  const action = first(params.intent);
  const intentPrompt = isAuthIntentAction(action)
    ? getTrustSurfaceCopy(locale).authIntent.actions[action]
    : null;

  return { next, intentPrompt };
}

function isAuthIntentAction(value: string): value is AuthIntentAction {
  return (AUTH_INTENT_ACTIONS as readonly string[]).includes(value);
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
