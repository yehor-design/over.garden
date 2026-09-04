import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { reportEngagementComment } from "@/server/engagement-repository";
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
        "report",
        createAuthIntentControlRef("report", commentId),
      );
    }
    return mutationScopeResponse(admission);
  }

  await reportEngagementComment(admission.scope, {
    commentId,
    reason: String(formData.get("reason") ?? "other"),
    target,
  });
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-reported");
}

export async function POST(request: Request) {
  return settleEngagementMutation(request, "comments_report", (formData) =>
    runEngagementMutation(request, formData),
  );
}
