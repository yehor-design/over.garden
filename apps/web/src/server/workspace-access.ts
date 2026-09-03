import "server-only";

import { cookies } from "next/headers";

import {
  AdminAccessDeniedError,
  type AdminAccess,
} from "@/server/admin-access";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { pingDatabase } from "@/server/health-repository";
import { scopedToUser, type RequestScope } from "@/server/request-scope";
import {
  describeWorkspaceFailure,
  settleSection,
  withWorkspaceSectionDeadline,
  workspaceSectionDeadlineMs,
  type WorkspaceFailureDescription,
} from "@/server/workspace-failure";

/**
 * Who is asking, and whether that question could even be answered.
 *
 * ADR-0023 allows exactly one read before a workspace shell renders — the
 * session — because which shell to render depends on the answer. That read
 * still touches the session store whenever the cookie cache is cold, so it can
 * fail like any other, and here too a failure has to be a value. `unavailable`
 * is the third answer that used to be missing: not signed out, not signed in,
 * but unable to tell. It is a different sentence on screen and a different fix.
 */
export type WorkspaceViewer =
  | { status: "signed-in"; userId: string; scope: RequestScope }
  | { status: "sign-in-required" }
  | { status: "unavailable"; failure: WorkspaceFailureDescription };

/** The session read costs one round trip when the cookie cache is cold. */
const SESSION_DEADLINE_MS = workspaceSectionDeadlineMs(1);

/**
 * Better Auth's cookie names under `advanced.cookiePrefix: "overgarden"`. The
 * `__Secure-` form is what a browser sends over HTTPS, and both are checked so
 * the answer does not depend on which environment is serving.
 */
const SESSION_COOKIE_NAMES = [
  "overgarden.session_token",
  "__Secure-overgarden.session_token",
] as const;

async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return SESSION_COOKIE_NAMES.some((name) => Boolean(store.get(name)?.value));
}

export async function resolveWorkspaceViewer(): Promise<WorkspaceViewer> {
  const session = await settleSection(() => getCurrentSession(), {
    deadlineMs: SESSION_DEADLINE_MS,
    surface: "workspace",
    section: "session",
  });
  if (session.status === "error") {
    return { status: "unavailable", failure: session };
  }

  const userId = session.value?.user?.id;
  if (userId) {
    return {
      status: "signed-in",
      userId,
      scope: scopedToUser(userId, getSessionId(session.value)),
    };
  }

  // A null session is not proof that nobody is signed in. Measured on
  // 2026-09-03 against a local production build with `DATABASE_URL` on a closed
  // port: Better Auth swallows the read failure and answers `null`, so a
  // signed-in gardener would be shown a sign-in panel during a database outage
  // — a false statement, and one that sends them to solve the wrong problem.
  //
  // Someone carrying a session cookie who resolved to nobody is exactly the
  // case worth a second question, and it costs one trivial round trip that a
  // genuine visitor, who carries no such cookie, never pays.
  if (await hasSessionCookie()) {
    const liveness = await settleSection(() => pingDatabase(), {
      deadlineMs: SESSION_DEADLINE_MS,
      surface: "workspace",
      section: "session-store-liveness",
    });
    if (liveness.status === "error") {
      return { status: "unavailable", failure: liveness };
    }
  }

  return { status: "sign-in-required" };
}

/**
 * The owner check for an owner-only workspace surface.
 *
 * It differs from `resolveAdminCapabilityAccess` in the one way that matters on
 * a screen: a rejection that is not a refusal keeps its own failure class,
 * instead of reaching the owner as a denial they cannot act on. Telling the
 * owner "access denied" while the role table is simply unreachable sends them
 * to audit permissions during a database outage.
 *
 * `settleSection` cannot make that distinction — a refusal and an outage both
 * arrive as a rejection — so it is made here, where the thrown value is still
 * in hand, and the deadline is applied around the read exactly as a section's
 * would be.
 */
export type WorkspaceAdminAccess<TAccess extends AdminAccess = AdminAccess> =
  | { status: "allowed"; access: TAccess }
  | { status: "denied" }
  | { status: "unavailable"; failure: WorkspaceFailureDescription };

/** Role, sealed-owner, and credential-only: three round trips. */
export const WORKSPACE_ADMIN_ACCESS_DEADLINE_MS = workspaceSectionDeadlineMs(3);

export async function resolveWorkspaceAdminAccess<TAccess extends AdminAccess>(
  load: () => Promise<TAccess>,
  options: { deadlineMs?: number } = {},
): Promise<WorkspaceAdminAccess<TAccess>> {
  try {
    const access = await withWorkspaceSectionDeadline(
      load,
      options.deadlineMs ?? WORKSPACE_ADMIN_ACCESS_DEADLINE_MS,
    );
    return { status: "allowed", access };
  } catch (reason) {
    if (reason instanceof AdminAccessDeniedError) return { status: "denied" };
    return { status: "unavailable", failure: describeWorkspaceFailure(reason) };
  }
}
