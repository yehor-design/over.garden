import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { setEngagementFollow } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
      return redirectToEngagementAuth(request, target, returnTo, "follow");
    }
    return documentMutationAdmissionResponse(admission);
  }

  const rawState = String(formData.get("followState") ?? "");
  const scope = admission.scope;
  const result = await setEngagementFollow(scope, {
    target,
    followState: rawState === "removed" ? "removed" : "active",
  });

  revalidatePath(new URL(returnTo, request.url).pathname);
  revalidatePath("/feed");
  revalidatePath("/bg/feed");
  revalidatePath("/ru/feed");
  return redirectWithEngagementStatus(
    request,
    returnTo,
    result.active ? "followed" : "unfollowed",
  );
}
