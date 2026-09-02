import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { addEngagementComment } from "@/server/engagement-repository";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementCommentTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const parentCommentId =
    typeof formData.get("parentCommentId") === "string"
      ? String(formData.get("parentCommentId"))
      : null;

  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
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
    return documentMutationAdmissionResponse(admission);
  }

  const scope = admission.scope;
  try {
    await addEngagementComment(scope, {
      target,
      body: String(formData.get("body") ?? ""),
      clientMutationId: String(formData.get("clientMutationId") ?? ""),
      parentCommentId,
    });
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
