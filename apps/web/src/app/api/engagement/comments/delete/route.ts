import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { deleteEngagementComment } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementCommentTarget,
  redirectWithEngagementStatus,
} from "../../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementCommentTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
      return redirectWithEngagementStatus(
        request,
        returnTo,
        "comment-unavailable",
      );
    }
    return documentMutationAdmissionResponse(admission);
  }

  await deleteEngagementComment(
    admission.scope,
    String(formData.get("commentId") ?? ""),
    target,
  );
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-deleted");
}
