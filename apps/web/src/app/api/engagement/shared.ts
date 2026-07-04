import { NextResponse } from "next/server";

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
) {
  const url = new URL("/garden", request.url);
  url.searchParams.set("engagement", `${intent}-auth`);
  url.searchParams.set("targetKind", target.kind);
  url.searchParams.set("targetRef", target.ref);
  url.searchParams.set("returnTo", returnTo || engagementTargetPath(target));
  return NextResponse.redirect(url, 303);
}
