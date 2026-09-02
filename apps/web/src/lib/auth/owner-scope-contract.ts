/**
 * Server-authoritative sessions (ADR-0022, D6). The page renders the owner it
 * was built for; every mutation carries that id back so the server can refuse
 * a request from a tab whose account changed meanwhile. Nothing here is a
 * gate: a missing id only skips the comparison, the session itself decides.
 */

export const OWNER_USER_ID_FORM_FIELD = "ownerUserId";
export const OWNER_USER_ID_HEADER = "x-overgarden-owner-user-id";
export const OWNER_USER_ID_DOCUMENT_ATTRIBUTE = "data-owner-user-id";

export const MUTATION_SCOPE_CODES = [
  "session_required",
  "session_account_changed",
] as const;

export type MutationScopeCode = (typeof MUTATION_SCOPE_CODES)[number];

export function isMutationScopeCode(
  value: unknown,
): value is MutationScopeCode {
  return (
    typeof value === "string" &&
    (MUTATION_SCOPE_CODES as readonly string[]).includes(value)
  );
}

export function normalizeOwnerUserId(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

/** The only session-related shape a Server Action returns on refusal. */
export interface MutationScopeActionState {
  mutationScope: MutationScopeCode;
}

export const SESSION_SIGNAL_CHANNEL = "overgarden-session";

export interface SessionSignal {
  type: "signed_in" | "signed_out";
  ownerUserId: string | null;
  /** The announcing tab; a tab never reacts to its own signal. */
  sourceTabId: string;
}
