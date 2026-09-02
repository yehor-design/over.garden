import { revalidatePath } from "next/cache";

import { setEngagementBookmark } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return redirectToEngagementAuth(request, target, returnTo, "bookmark");
    }
    return mutationScopeResponse(admission);
  }

  const scope = admission.scope;
  const bookmarkState = String(formData.get("bookmarkState") ?? "");
  const result = await setEngagementBookmark(scope, {
    target,
    bookmarkState:
      bookmarkState === "active" || bookmarkState === "removed"
        ? bookmarkState
        : "active",
  });

  revalidatePath(new URL(returnTo, request.url).pathname);
  revalidatePath("/bookmarks");
  revalidatePath("/bg/bookmarks");
  revalidatePath("/ru/bookmarks");

  return redirectWithEngagementStatus(
    request,
    returnTo,
    result.active ? "bookmarked" : "bookmark-removed",
  );
}
