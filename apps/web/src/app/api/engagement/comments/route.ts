import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { addEngagementComment } from "@/server/engagement-repository";
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
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const userId = visualActor?.actorId ?? session?.user?.id;
  const parentCommentId =
    typeof formData.get("parentCommentId") === "string"
      ? String(formData.get("parentCommentId"))
      : null;

  if (!userId) {
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

  const scope = scopedToUser(
    userId,
    visualActor ? null : getSessionId(session),
  );
  await addEngagementComment(scope, {
    target,
    body: String(formData.get("body") ?? ""),
    clientMutationId: String(formData.get("clientMutationId") ?? ""),
    parentCommentId,
  });

  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "commented");
}
