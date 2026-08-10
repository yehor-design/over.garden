import { revalidatePath } from "next/cache";

import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { isPreciseLocationTextError } from "@/lib/privacy/precise-location-text";
import { addEngagementComment } from "@/server/engagement-repository";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";
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
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const parentCommentId =
    typeof formData.get("parentCommentId") === "string"
      ? String(formData.get("parentCommentId"))
      : null;

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
        "comment",
        parentCommentId
          ? createAuthIntentControlRef("reply", parentCommentId)
          : undefined,
      );
    }
    return documentMutationAdmissionResponse(admission);
  }

  const scope = visualActor
    ? scopedToUser(visualActor.actorId)
    : admission!.scope;
  try {
    await addEngagementComment(scope, {
      target,
      body: String(formData.get("body") ?? ""),
      clientMutationId: String(formData.get("clientMutationId") ?? ""),
      parentCommentId,
    });
  } catch (error) {
    // OVE-234: the refusal is reported as a localized status only. Neither the
    // redirect nor any log line carries the rejected text.
    if (isPreciseLocationTextError(error)) {
      return redirectWithEngagementStatus(
        request,
        returnTo,
        "comment-precise-location",
      );
    }
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
