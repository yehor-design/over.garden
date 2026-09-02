import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { addEngagementComment } from "@/server/engagement-repository";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementCommentTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const parentCommentId =
    typeof formData.get("parentCommentId") === "string"
      ? String(formData.get("parentCommentId"))
      : null;

  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return redirectToEngagementAuth(
        request,
        target,
        returnTo,
        "comment",
        parentCommentId
          ? createAuthIntentControlRef("reply", parentCommentId)
          : undefined,
      );
    }
    return mutationScopeResponse(admission);
  }

  const scope = admission.scope;
  try {
    await addEngagementComment(scope, {
      target,
      body: String(formData.get("body") ?? ""),
      clientMutationId: String(formData.get("clientMutationId") ?? ""),
      parentCommentId,
    });
    revalidatePublicCacheTags(
      publicEngagementChangeTags(target.kind, target.ref),
      "expire",
    );
  } catch (error) {
    if (isInteractionAdmissionError(error)) {
      return redirectWithEngagementStatus(
        request,
        returnTo,
        error.failure === "quota"
          ? "comment-rate-limited"
          : "interaction-unavailable",
      );
    }
    throw error;
  }

  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "commented");
}
