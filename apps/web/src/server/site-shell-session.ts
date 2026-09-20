import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import { settleSessionStoreLiveness } from "@/server/session-store-liveness";
import {
  GUEST_SITE_SHELL_SESSION_STATE,
  UNREACHABLE_SITE_SHELL_SESSION_STATE,
  type SiteShellSessionState,
} from "@/lib/site-shell-session-state";

export {
  GUEST_SITE_SHELL_SESSION_STATE,
  UNREACHABLE_SITE_SHELL_SESSION_STATE,
  type SiteShellSessionState,
} from "@/lib/site-shell-session-state";

/** The shell waits this long for the owner check before hiding the links. */
export const SHELL_OPERATOR_ACCESS_TIMEOUT_MS = 750;

/**
 * One cookie-cached session read per document (ADR-0022, D6).
 *
 * A static document starts this read and does not await it (ADR-0032 D2): the
 * promise travels to the shell, and only the regions that read it wait. So
 * the `catch` rethrows Next's own control-flow errors first — a blanket catch
 * here would answer "guest" *into the prerender*, and the static shell would
 * then tell every gardener they are signed out, with no hole left to correct
 * it (the defect `/communities` shipped on 2026-09-12, seen from the shell).
 */
export async function getSiteShellSessionState(): Promise<SiteShellSessionState> {
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    session = await getCurrentSession();
  } catch (error) {
    unstable_rethrow(error);
    // The read itself failed. Answering "guest" here is what let the header
    // offer "Sign in" over a page that had already said otherwise.
    return UNREACHABLE_SITE_SHELL_SESSION_STATE;
  }

  const ownerUserId = session?.user?.id;
  if (!ownerUserId) {
    // A null session is not proof of signed-out: the same question the
    // workspace asks, asked once, so the two cannot disagree (`OVE-457`).
    const liveness = await settleSessionStoreLiveness("site-shell");
    return liveness.status === "ready"
      ? GUEST_SITE_SHELL_SESSION_STATE
      : UNREACHABLE_SITE_SHELL_SESSION_STATE;
  }

  return {
    isAuthenticated: true,
    ownerUserId,
    hasOperatorAccess: await resolveShellOperatorAccess(
      ownerUserId,
      getSessionId(session),
    ),
    sessionStore: "reachable",
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
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
}
