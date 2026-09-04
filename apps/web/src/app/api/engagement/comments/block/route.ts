import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { blockEngagementCommentAuthor } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
  settleEngagementMutation,
} from "../../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

async function runEngagementMutation(request: Request, formData: FormData) {
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

export async function POST(request: Request) {
  return settleEngagementMutation(request, "comments_block", (formData) =>
    runEngagementMutation(request, formData),
  );
}
