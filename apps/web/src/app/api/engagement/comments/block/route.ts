import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { blockEngagementCommentAuthor } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementCommentTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const commentId = String(formData.get("commentId") ?? "");
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return redirectToEngagementAuth(
        request,
        target,
        returnTo,
        "block",
        createAuthIntentControlRef("block", commentId),
      );
    }
    return mutationScopeResponse(admission);
  }

  await blockEngagementCommentAuthor(admission.scope, { commentId, target });
  const pathname = new URL(returnTo, request.url).pathname;
  revalidatePath(pathname);
  revalidatePath("/feed");
  revalidatePath("/notifications");
  revalidatePath("/bookmarks");
  return redirectWithEngagementStatus(
    request,
    returnTo,
    "comment-author-blocked",
  );
}
