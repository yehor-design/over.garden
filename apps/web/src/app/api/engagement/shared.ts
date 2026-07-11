import { NextResponse } from "next/server";

import {
  type AuthIntentDraft,
  type AuthIntentTarget,
  normalizeAuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import type { EngagementTarget } from "@/server/engagement-repository";
import {
  engagementTargetPath,
  normalizeEngagementReturnTo,
  normalizeEngagementTarget,
} from "@/server/engagement-repository";

export function parseEngagementTarget(formData: FormData): EngagementTarget {
  return normalizeEngagementTarget(
    String(formData.get("targetKind") ?? ""),
    String(formData.get("targetRef") ?? ""),
  );
}

export function parseEngagementReturnTo(
  formData: FormData,
  target: EngagementTarget,
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
  const url = new URL(returnTo, request.url);
  url.searchParams.set("engagement", status);
  return NextResponse.redirect(url, 303);
}

export function redirectToEngagementAuth(
  request: Request,
  target: EngagementTarget,
  returnTo: string,
  intent: "bookmark" | "comment",
  control?: string,
) {
  const normalizedReturnTo = returnTo || engagementTargetPath(target);
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
  target: EngagementTarget,
): AuthIntentTarget {
  if (target.kind === "journal_entry") {
    return { kind: "journal", ref: target.ref };
  }
  if (target.kind === "lineage_object") {
    return { kind: "object", ref: target.ref };
  }
  return { kind: "collection", ref: target.ref };
}
