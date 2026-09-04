import { revalidatePath } from "next/cache";

import { deleteEngagementComment } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectWithEngagementStatus,
  settleEngagementMutation,
} from "../../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

async function runEngagementMutation(request: Request, formData: FormData) {
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
  revalidatePublicCacheTags(
    publicEngagementChangeTags(target.kind, target.ref),
    "expire",
  );
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-deleted");
}

export async function POST(request: Request) {
  return settleEngagementMutation(request, "comments_delete", (formData) =>
    runEngagementMutation(request, formData),
  );
}
