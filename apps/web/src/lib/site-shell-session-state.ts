/**
 * What the shell knows about who is reading (ADR-0022 D6, ADR-0032 D2).
 *
 * It lives outside `@/server/*` because both sides read it: the server
 * resolves it, and the shell's client regions receive it — as a value in a
 * request-time document, as a promise in a static one.
 */
export interface SiteShellSessionState {
  isAuthenticated: boolean;
  /** The signed-in owner the document is rendered for; null for a guest. */
  ownerUserId: string | null;
  hasOperatorAccess: boolean;
}

export const GUEST_SITE_SHELL_SESSION_STATE: SiteShellSessionState = {
  isAuthenticated: false,
  ownerUserId: null,
  hasOperatorAccess: false,
};

/**
 * A request-time document has awaited the session and hands the shell a value.
 * A static document cannot: it hands over the promise, and the regions that
 * differ between a guest and a gardener wait for it on their own.
 */
export type SiteShellSessionInput =
  | SiteShellSessionState
  | Promise<SiteShellSessionState>;

export function isPendingSiteShellSession(
  input: SiteShellSessionInput,
): input is Promise<SiteShellSessionState> {
  return typeof (input as Promise<SiteShellSessionState>).then === "function";
}
