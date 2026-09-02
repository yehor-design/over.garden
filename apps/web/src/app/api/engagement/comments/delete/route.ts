import { revalidatePath } from "next/cache";

import { deleteEngagementComment } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
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
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return redirectWithEngagementStatus(
        request,
        returnTo,
        "comment-unavailable",
      );
    }
    return mutationScopeResponse(admission);
  }

  await deleteEngagementComment(
    admission.scope,
    String(formData.get("commentId") ?? ""),
    target,
  );
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-deleted");
}
