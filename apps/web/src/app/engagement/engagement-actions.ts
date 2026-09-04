"use server";

import { cookies } from "next/headers";

import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
import {
  type EngagementLikeOwner,
  type EngagementCommentTarget,
  type EngagementTarget,
  normalizeEngagementCommentTarget,
  normalizeEngagementTarget,
  addEngagementComment,
  claimVisitorEngagementLikes,
  blockEngagementCommentAuthor,
  deleteEngagementComment,
  reportEngagementComment,
  setEngagementBookmark,
  setEngagementFollow,
  toggleEngagementLike,
} from "@/server/engagement-repository";
import {
  ENGAGEMENT_VISITOR_COOKIE_MAX_AGE_SECONDS,
  ENGAGEMENT_VISITOR_COOKIE_NAME,
  issueEngagementVisitorIdentity,
  verifyEngagementVisitorIdentity,
} from "@/server/engagement-visitor-identity";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import { resolveMutationScope } from "@/server/mutation-scope";
import { getCurrentSession } from "@/server/auth-session";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";

/**
 * Every interaction the public panel offers, as a Server Action.
 *
 * Two rules hold for all of them, and both come from decisions already taken:
 *
 *   * **Nothing throws to the framework.** ADR-0023 established that a failure
 *     is a rendered value, because under Cache Components an exception raised
 *     after the shell never reaches the reader. Each action returns a result the
 *     panel renders beside the control. What this replaced answered `500` with an
 *     empty body on 7 of the 8 public journal entries (2026-09-04).
 *   * **Invalidation is by tag, never by path.** ADR-0022 D4. `update` gives the
 *     actor read-your-own-writes on the cached public page rather than making
 *     everyone wait for a fresh render.
 */

/** The closed set of reasons an interaction did not happen. */
export type EngagementActionFailure =
  | "sign_in_required"
  | "rate_limited"
  | "unavailable";

export type EngagementLikeActionResult =
  | { ok: true; liked: boolean; activeLikeCount: number }
  | { ok: false; reason: EngagementActionFailure };

export type EngagementActionResult =
  | { ok: true; active: boolean }
  | { ok: false; reason: EngagementActionFailure };

export type EngagementCommentActionResult =
  | { ok: true }
  | { ok: false; reason: EngagementActionFailure };

export async function toggleLikeAction(input: {
  targetKind: string;
  targetRef: string;
}): Promise<EngagementLikeActionResult> {
  return settle("likes", async () => {
    const target = normalizeEngagementTarget(input.targetKind, input.targetRef);
    const owner = await resolveLikeOwner();
    const result = await toggleEngagementLike({ target, owner });
    invalidate(target);
    return { ok: true as const, ...result };
  });
}

export async function setBookmarkAction(input: {
  targetKind: string;
  targetRef: string;
  bookmarked: boolean;
}): Promise<EngagementActionResult> {
  return settle("bookmarks", async () => {
    const target = normalizeEngagementTarget(input.targetKind, input.targetRef);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    const current = await setEngagementBookmark(scope, {
      target,
      bookmarkState: input.bookmarked ? "removed" : "active",
    });
    invalidate(target);
    return { ok: true as const, active: current.active };
  });
}

export async function setFollowAction(input: {
  targetKind: string;
  targetRef: string;
  following: boolean;
}): Promise<EngagementActionResult> {
  return settle("follows", async () => {
    const target = normalizeEngagementTarget(input.targetKind, input.targetRef);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    const current = await setEngagementFollow(scope, {
      target,
      followState: input.following ? "removed" : "active",
    });
    invalidate(target);
    return { ok: true as const, active: current.active };
  });
}

export async function addCommentAction(input: {
  targetKind: string;
  targetRef: string;
  body: string;
  clientMutationId: string;
  parentCommentId?: string | null;
}): Promise<EngagementCommentActionResult> {
  return settle("comments", async () => {
    const target = normalizeEngagementCommentTarget(
      input.targetKind,
      input.targetRef,
    );
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await addEngagementComment(scope, {
      target,
      body: input.body,
      clientMutationId: input.clientMutationId,
      parentCommentId: input.parentCommentId ?? null,
    });
    invalidateComment(target);
    return { ok: true as const };
  });
}

export async function deleteCommentAction(input: {
  targetKind: string;
  targetRef: string;
  commentId: string;
}): Promise<EngagementCommentActionResult> {
  return settle("comments/delete", async () => {
    const target = normalizeEngagementCommentTarget(
      input.targetKind,
      input.targetRef,
    );
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await deleteEngagementComment(scope, input.commentId, target);
    invalidateComment(target);
    return { ok: true as const };
  });
}

export async function reportCommentAction(input: {
  targetKind: string;
  targetRef: string;
  commentId: string;
  reason: string;
}): Promise<EngagementCommentActionResult> {
  return settle("comments/report", async () => {
    const target = normalizeEngagementCommentTarget(
      input.targetKind,
      input.targetRef,
    );
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await reportEngagementComment(scope, {
      commentId: input.commentId,
      reason: input.reason,
      target,
    });
    invalidateComment(target);
    return { ok: true as const };
  });
}

export async function blockCommentAuthorAction(input: {
  targetKind: string;
  targetRef: string;
  commentId: string;
}): Promise<EngagementCommentActionResult> {
  return settle("comments/block", async () => {
    const target = normalizeEngagementCommentTarget(
      input.targetKind,
      input.targetRef,
    );
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await blockEngagementCommentAuthor(scope, {
      commentId: input.commentId,
      target,
    });
    invalidateComment(target);
    return { ok: true as const };
  });
}

async function settle<T extends { ok: boolean }>(
  route: string,
  run: () => Promise<T>,
): Promise<T | { ok: false; reason: EngagementActionFailure }> {
  try {
    return await run();
  } catch (reason) {
    recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
      surface: "engagement_action",
      section: route,
    });
    if (isInteractionAdmissionError(reason) && reason.failure === "quota") {
      return { ok: false, reason: "rate_limited" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

function invalidate(target: EngagementTarget) {
  revalidatePublicCacheTags(
    publicEngagementChangeTags(target.kind, target.ref),
    "update",
  );
}

function invalidateComment(target: EngagementCommentTarget) {
  revalidatePublicCacheTags(
    publicEngagementChangeTags(target.kind, target.ref),
    "update",
  );
}

/**
 * The session this mutation runs under, or `null` when there is none.
 *
 * A refusal is a value here rather than a status code: ADR-0022 D6 keeps the
 * server authoritative, and ADR-0023 keeps the reader looking at a sentence
 * instead of a transport error.
 */
async function requireScope() {
  const admission = await resolveMutationScope({ expectedOwnerUserId: null });
  return admission.status === "rejected" ? null : admission.scope;
}

/**
 * The owner a like is recorded against, and the moment a visitor's history
 * becomes an account's.
 *
 * Three cases, in the order they are decided:
 *
 *   1. **Signed in, carrying a visitor cookie.** The reader liked things before
 *      they had an account. Those rows move onto the account and the cookie is
 *      retired, so signing up never costs somebody the likes they already gave.
 *      The claim is idempotent, so a retry cannot duplicate anything.
 *   2. **Signed in.** The account owns the like.
 *   3. **Signed out.** The browser owns it. A visitor id is minted *here and
 *      only here*, so the cookie exists for people who actually liked something
 *      and for nobody else — which is what keeps it a functional cookie for an
 *      action the reader asked for, rather than an identifier set on arrival.
 */
async function resolveLikeOwner(): Promise<EngagementLikeOwner> {
  const [session, cookieStore] = await Promise.all([
    getCurrentSession(),
    cookies(),
  ]);
  const userId = session?.user?.id;
  const visitor = verifyEngagementVisitorIdentity(
    cookieStore.get(ENGAGEMENT_VISITOR_COOKIE_NAME)?.value,
  );

  if (userId) {
    if (visitor) {
      await claimVisitorEngagementLikes({
        userId,
        visitorId: visitor.visitorId,
      });
      cookieStore.set({
        name: ENGAGEMENT_VISITOR_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return { kind: "user", userId };
  }

  if (visitor) return { kind: "visitor", visitorId: visitor.visitorId };

  const minted = issueEngagementVisitorIdentity();
  cookieStore.set({
    name: ENGAGEMENT_VISITOR_COOKIE_NAME,
    value: minted.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ENGAGEMENT_VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
  return { kind: "visitor", visitorId: minted.visitorId };
}
