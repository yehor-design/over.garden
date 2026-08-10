import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { blockEngagementCommentAuthor } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementCommentTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const commentId = String(formData.get("commentId") ?? "");
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const admission = visualActor
    ? null
    : await admitDocumentMutation({
        transport: documentMutationGenerationFromRequest(request),
      });
  if (admission?.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
      return redirectToEngagementAuth(
        request,
        target,
        returnTo,
        "block",
        createAuthIntentControlRef("block", commentId),
      );
    }
    return documentMutationAdmissionResponse(admission);
  }

  await blockEngagementCommentAuthor(
    visualActor ? scopedToUser(visualActor.actorId) : admission!.scope,
    { commentId, target },
  );
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
