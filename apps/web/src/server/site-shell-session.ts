import "server-only";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";

export interface SiteShellSessionState {
  isAuthenticated: boolean;
  /** The signed-in owner the document is rendered for; null for a guest. */
  ownerUserId: string | null;
  hasOperatorAccess: boolean;
}

/** The shell waits this long for the owner check before hiding the links. */
export const SHELL_OPERATOR_ACCESS_TIMEOUT_MS = 750;

export const GUEST_SITE_SHELL_SESSION_STATE: SiteShellSessionState = {
  isAuthenticated: false,
  ownerUserId: null,
  hasOperatorAccess: false,
};

/** One cookie-cached session read per document (ADR-0022, D6). */
export async function getSiteShellSessionState(): Promise<SiteShellSessionState> {
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    session = await getCurrentSession();
  } catch {
    return GUEST_SITE_SHELL_SESSION_STATE;
  }

  const ownerUserId = session?.user?.id;
  if (!ownerUserId) return GUEST_SITE_SHELL_SESSION_STATE;

  return {
    isAuthenticated: true,
    ownerUserId,
    hasOperatorAccess: await resolveShellOperatorAccess(
      ownerUserId,
      getSessionId(session),
    ),
  };
}

async function resolveShellOperatorAccess(
  userId: string,
  sessionId: string | null,
) {
  try {
    // The shell only decides whether to show the owner links; a slow answer
    // hides them and every owner page re-checks with the full budget.
    const access = await resolveAdminCapabilityAccessBounded(
      { userId, sessionId },
      "operator:mutate",
      undefined,
      { timeoutMs: SHELL_OPERATOR_ACCESS_TIMEOUT_MS },
    );
    return access.status === "allowed";
  } catch {
    return false;
  }
}
