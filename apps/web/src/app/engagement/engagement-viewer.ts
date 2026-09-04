import "server-only";

import { cookies } from "next/headers";

import { getCurrentSession } from "@/server/auth-session";
import {
  type EngagementLikeOwner,
  normalizeEngagementTarget,
  readEngagementLikeState,
} from "@/server/engagement-repository";
import {
  ENGAGEMENT_VISITOR_COOKIE_NAME,
  verifyEngagementVisitorIdentity,
} from "@/server/engagement-visitor-identity";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";

/**
 * Render-time reads for the engagement panel. Deliberately separate from
 * `engagement-actions.ts`: that module is `"use server"`, and every export in it
 * becomes a callable endpoint. A read the panel performs while rendering is not
 * a mutation and has no business being reachable from a browser.
 */

/**
 * Every identity this reader currently owns likes under.
 *
 * Usually one. It is two in exactly one window: a reader who liked things
 * signed out and has since signed in, but has not yet performed a mutation that
 * would claim those rows onto their account. Reading both keeps the button
 * honest during that window instead of telling them they never liked it.
 *
 * Never mints a visitor id and never sets a cookie. A reader who has liked
 * nothing leaves with no identifier at all, which is what makes the cookie
 * defensible as strictly necessary for an action they asked for.
 */
export async function readLikeOwners(): Promise<EngagementLikeOwner[]> {
  const [session, cookieStore] = await Promise.all([
    getCurrentSession(),
    cookies(),
  ]);
  const owners: EngagementLikeOwner[] = [];

  const userId = session?.user?.id;
  if (userId) owners.push({ kind: "user", userId });

  const visitor = verifyEngagementVisitorIdentity(
    cookieStore.get(ENGAGEMENT_VISITOR_COOKIE_NAME)?.value,
  );
  if (visitor) owners.push({ kind: "visitor", visitorId: visitor.visitorId });

  return owners;
}

/**
 * The count and this reader's own like state, settled into a value.
 *
 * ADR-0023: a read that renders may not throw. A panel that cannot reach the
 * database shows zero and an un-pressed button rather than taking the page down,
 * and the failure still leaves one line in the log.
 */
export interface ViewerLikeState {
  activeLikeCount: number;
  viewerLiked: boolean;
}

export async function readViewerLikeState(input: {
  kind: string;
  ref: string;
}): Promise<ViewerLikeState> {
  try {
    const target = normalizeEngagementTarget(input.kind, input.ref);
    return await readEngagementLikeState(target, await readLikeOwners());
  } catch (reason) {
    recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
      surface: "engagement_panel",
      section: "like_state",
    });
    return { activeLikeCount: 0, viewerLiked: false };
  }
}
