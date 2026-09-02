import "server-only";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";

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
    const access = await resolveAdminCapabilityAccessBounded(
      { userId, sessionId },
      "operator:mutate",
    );
    return access.status === "allowed";
  } catch {
    return false;
  }
}
