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
 * **Each one is form-shaped — `(previousState, formData)` — on purpose.** A form
 * whose `action` is a Server Action reference is given a real endpoint by React,
 * so the browser can post it with no JavaScript at all. A form whose `action` is
 * an ordinary client function is not: React renders
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"`
 * and the control does nothing until hydration replaces it. The first version of
 * this file used a client closure, and on 2026-09-04 that shipped a like button
 * that made no request at all on a page whose subtree never hydrated. The state
 * a control needs therefore travels through `formData`, never through a closure.
 *
 * Two more rules hold for all of them, and both come from decisions already taken:
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

/** What the like control renders, and what its action hands back. */
export interface EngagementLikeState {
  liked: boolean;
  activeLikeCount: number;
  failure: EngagementActionFailure | null;
}

export async function toggleLikeAction(
  previous: EngagementLikeState,
  formData: FormData,
): Promise<EngagementLikeState> {
  const outcome = await settle("likes", async () => {
    const target = readTarget(formData);
    const owner = await resolveLikeOwner();
    const result = await toggleEngagementLike({ target, owner });
    invalidate(target);
    return { ok: true as const, ...result };
  });

  return outcome.ok
    ? {
        liked: outcome.liked,
        activeLikeCount: outcome.activeLikeCount,
        failure: null,
      }
    : { ...previous, failure: outcome.reason };
}

/** What a two-state control renders, and what its action hands back. */
export interface EngagementToggleState {
  active: boolean;
  failure: EngagementActionFailure | null;
}

export async function setBookmarkAction(
  previous: EngagementToggleState,
  formData: FormData,
): Promise<EngagementToggleState> {
  const outcome = await settle("bookmarks", async () => {
    const target = readTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    const current = await setEngagementBookmark(scope, {
      target,
      bookmarkState: previous.active ? "removed" : "active",
    });
    invalidate(target);
    return { ok: true as const, active: current.active };
  });

  return outcome.ok
    ? { active: outcome.active, failure: null }
    : { ...previous, failure: outcome.reason };
}

export async function setFollowAction(
  previous: EngagementToggleState,
  formData: FormData,
): Promise<EngagementToggleState> {
  const outcome = await settle("follows", async () => {
    const target = readTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    const current = await setEngagementFollow(scope, {
      target,
      followState: previous.active ? "removed" : "active",
    });
    invalidate(target);
    return { ok: true as const, active: current.active };
  });

  return outcome.ok
    ? { active: outcome.active, failure: null }
    : { ...previous, failure: outcome.reason };
}

/** What a comment control renders after it runs. */
export interface EngagementCommentState {
  submitted: boolean;
  failure: EngagementActionFailure | null;
}

export async function addCommentAction(
  _previous: EngagementCommentState,
  formData: FormData,
): Promise<EngagementCommentState> {
  const outcome = await settle("comments", async () => {
    const target = readCommentTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await addEngagementComment(scope, {
      target,
      body: field(formData, "body"),
      clientMutationId: field(formData, "clientMutationId"),
      parentCommentId: field(formData, "parentCommentId") || null,
    });
    invalidateComment(target);
    return { ok: true as const };
  });

  return outcome.ok
    ? { submitted: true, failure: null }
    : { submitted: false, failure: outcome.reason };
}

export async function deleteCommentAction(
  _previous: EngagementCommentState,
  formData: FormData,
): Promise<EngagementCommentState> {
  const outcome = await settle("comments/delete", async () => {
    const target = readCommentTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await deleteEngagementComment(scope, field(formData, "commentId"), target);
    invalidateComment(target);
    return { ok: true as const };
  });

  return outcome.ok
    ? { submitted: true, failure: null }
    : { submitted: false, failure: outcome.reason };
}

export async function reportCommentAction(
  _previous: EngagementCommentState,
  formData: FormData,
): Promise<EngagementCommentState> {
  const outcome = await settle("comments/report", async () => {
    const target = readCommentTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await reportEngagementComment(scope, {
      commentId: field(formData, "commentId"),
      reason: field(formData, "reason") || "other",
      target,
    });
    invalidateComment(target);
    return { ok: true as const };
  });

  return outcome.ok
    ? { submitted: true, failure: null }
    : { submitted: false, failure: outcome.reason };
}

export async function blockCommentAuthorAction(
  _previous: EngagementCommentState,
  formData: FormData,
): Promise<EngagementCommentState> {
  const outcome = await settle("comments/block", async () => {
    const target = readCommentTarget(formData);
    const scope = await requireScope();
    if (!scope)
      return { ok: false as const, reason: "sign_in_required" as const };

    await blockEngagementCommentAuthor(scope, {
      commentId: field(formData, "commentId"),
      target,
    });
    invalidateComment(target);
    return { ok: true as const };
  });

  return outcome.ok
    ? { submitted: true, failure: null }
    : { submitted: false, failure: outcome.reason };
}

/**
 * The target travels in the form, because the form is the only channel a
 * browser without JavaScript has. Both readers normalize, so a tampered field
 * is refused here rather than reaching a query.
 */
function readTarget(formData: FormData): EngagementTarget {
  return normalizeEngagementTarget(
    field(formData, "targetKind"),
    field(formData, "targetRef"),
  );
}

function readCommentTarget(formData: FormData): EngagementCommentTarget {
  return normalizeEngagementCommentTarget(
    field(formData, "targetKind"),
    field(formData, "targetRef"),
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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
