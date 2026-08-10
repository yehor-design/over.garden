import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { setEngagementFollow } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";
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
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const admission = visualActor
    ? null
    : await admitDocumentMutation({
        transport: documentMutationGenerationFromRequest(request),
      });
  if (admission?.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
      return redirectToEngagementAuth(request, target, returnTo, "follow");
    }
    return documentMutationAdmissionResponse(admission);
  }

  const rawState = String(formData.get("followState") ?? "");
  const scope = visualActor
    ? scopedToUser(visualActor.actorId)
    : admission!.scope;
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
