import { NextResponse } from "next/server";

import {
  type AuthIntentDraft,
  type AuthIntentTarget,
  normalizeAuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";
import type {
  EngagementCommentTarget,
  EngagementTarget,
} from "@/server/engagement-repository";
import {
  engagementTargetPath,
  normalizeEngagementCommentTarget,
  normalizeEngagementReturnTo,
  normalizeEngagementTarget,
} from "@/server/engagement-repository";

export function parseEngagementTarget(formData: FormData): EngagementTarget {
  return normalizeEngagementTarget(
    String(formData.get("targetKind") ?? ""),
    String(formData.get("targetRef") ?? ""),
  );
}

export function parseEngagementCommentTarget(
  formData: FormData,
): EngagementCommentTarget {
  return normalizeEngagementCommentTarget(
    String(formData.get("targetKind") ?? ""),
    String(formData.get("targetRef") ?? ""),
  );
}

export function parseEngagementReturnTo(
  formData: FormData,
  target: EngagementCommentTarget,
) {
  return normalizeEngagementReturnTo(
    typeof formData.get("returnTo") === "string"
      ? String(formData.get("returnTo"))
      : null,
    target,
  );
}

export function redirectWithEngagementStatus(
  request: Request,
  returnTo: string,
  status: string,
) {
  const url = new URL(normalizeInternalReturnPath(returnTo, "/"), request.url);
  url.searchParams.set("engagement", status);
  return NextResponse.redirect(url, 303);
}

/**
 * The quota status a route reports when its own limit is the reason. Only the
 * two surfaces that meter per-actor volume have their own wording; everything
 * else shares the neutral one.
 */
type EngagementQuotaStatus =
  | "like-rate-limited"
  | "comment-rate-limited"
  | "interaction-unavailable";

/**
 * Turns one interaction mutation into a response the reader can act on.
 *
 * ADR-0023 established that a failure is a rendered value rather than a thrown
 * exception, because under Cache Components a throw is not reliably delivered
 * to anybody. That rule was written for pages; these handlers were left outside
 * it, and the cost was measured on 2026-09-04: `POST /api/engagement/likes`
 * answered `500` with `content-length: 0` on 7 of the 8 public journal entries,
 * so the reader was parked on a blank white page at the API URL with no way
 * back but the browser's back button.
 *
 * Everything the handler can raise settles here into the same 303 the happy
 * path uses, carrying a status the panel already knows how to say in all three
 * locales. Parsing runs inside the boundary too: `parseEngagementTarget` throws
 * on a malformed target, and that was one of the reachable 500s.
 */
export async function settleEngagementMutation(
  request: Request,
  route: string,
  run: (formData: FormData) => Promise<Response>,
  options: { quotaStatus?: EngagementQuotaStatus } = {},
): Promise<Response> {
  let formData: FormData | null = null;
  try {
    formData = await request.formData();
    return await run(formData);
  } catch (reason) {
    if (isFrameworkControlFlow(reason)) throw reason;

    const status = isInteractionAdmissionError(reason)
      ? reason.failure === "quota"
        ? (options.quotaStatus ?? "interaction-unavailable")
        : "interaction-unavailable"
      : "interaction-unavailable";

    // The class is derived where the driver error is still in hand; the same
    // line shape `settleSection` writes, so one grep finds page and mutation
    // failures together. Never the message, the statement, or a parameter.
    recordWorkspaceSectionFailure(describeWorkspaceFailure(reason), {
      surface: "engagement_mutation",
      section: route,
    });

    return redirectWithEngagementStatus(
      request,
      settledEngagementReturnTo(formData),
      status,
    );
  }
}

/**
 * Where a settled failure sends the reader. The declared `returnTo` is trusted
 * only through the same same-origin boundary the success path uses; when the
 * target itself is what failed to parse there is nothing better than the home
 * page, and that is still on this origin.
 */
function settledEngagementReturnTo(formData: FormData | null): string {
  if (!formData) return "/";
  try {
    const target = parseEngagementCommentTarget(formData);
    return parseEngagementReturnTo(formData, target);
  } catch {
    // Fall through: an unparseable target cannot supply a fallback path.
  }
  try {
    return normalizeInternalReturnPath(formData.get("returnTo"), "/");
  } catch {
    return "/";
  }
}

/**
 * `redirect()`, `notFound()`, and `forbidden()` travel as exceptions. Swallowing
 * one would turn a navigation into a silent 303 to the wrong place, so they pass
 * straight through the boundary.
 */
function isFrameworkControlFlow(reason: unknown): boolean {
  if (reason === null || typeof reason !== "object") return false;
  const digest = (reason as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      digest === "NEXT_NOT_FOUND")
  );
}

export function redirectToEngagementAuth(
  request: Request,
  target: EngagementCommentTarget,
  returnTo: string,
  intent: "bookmark" | "comment" | "follow" | "report" | "block",
  control?: string,
) {
  const normalizedReturnTo = normalizeInternalReturnPath(
    returnTo,
    engagementTargetPath(target),
  );
  const draft = {
    action: intent,
    returnTo: normalizedReturnTo,
    target: engagementAuthIntentTarget(target),
    ...(control ? { control } : {}),
  } as const;
  let safeDraft: AuthIntentDraft;
  try {
    safeDraft = normalizeAuthIntentDraft(draft);
  } catch {
    safeDraft = normalizeAuthIntentDraft({
      ...draft,
      returnTo: engagementTargetPath(target),
    });
  }
  const token = createAuthIntentToken(safeDraft);
  const url = new URL("/auth/intent", request.url);
  url.searchParams.set("intent", token);
  return NextResponse.redirect(url, 303);
}

function engagementAuthIntentTarget(
  target: EngagementCommentTarget,
): AuthIntentTarget {
  if (target.kind === "journal_entry") {
    return { kind: "journal", ref: target.ref };
  }
  if (target.kind === "lineage_object") {
    return { kind: "object", ref: target.ref };
  }
  if (target.kind === "community_contribution") {
    return { kind: "contribution", ref: target.ref };
  }
  return { kind: "collection", ref: target.ref };
}
