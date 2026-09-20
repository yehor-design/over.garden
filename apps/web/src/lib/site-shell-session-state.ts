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
  /**
   * Whether "nobody is signed in" is a fact or a symptom (`OVE-457`).
   *
   * `unreachable` is not signed out. Better Auth swallows a failed session
   * read and answers `null`, so the chrome used to offer "Sign in" over a
   * workspace page that had already said the session store could not be
   * reached — one reader, two answers, from one request. The shell asks the
   * same question the workspace asks (`@/server/session-store-liveness`), and
   * says so instead of guessing.
   */
  sessionStore: "reachable" | "unreachable";
}

export const GUEST_SITE_SHELL_SESSION_STATE: SiteShellSessionState = {
  isAuthenticated: false,
  ownerUserId: null,
  hasOperatorAccess: false,
  sessionStore: "reachable",
};

/** What the shell knows when the session store could not answer at all. */
export const UNREACHABLE_SITE_SHELL_SESSION_STATE: SiteShellSessionState = {
  ...GUEST_SITE_SHELL_SESSION_STATE,
  sessionStore: "unreachable",
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
