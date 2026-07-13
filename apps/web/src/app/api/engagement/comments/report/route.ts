import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import { reportEngagementComment } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
} from "../../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const commentId = String(formData.get("commentId") ?? "");
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const userId = visualActor?.actorId ?? session?.user?.id;

  if (!userId) {
    return redirectToEngagementAuth(
      request,
      target,
      returnTo,
      "report",
      createAuthIntentControlRef("report", commentId),
    );
  }

  await reportEngagementComment(
    scopedToUser(userId, visualActor ? null : getSessionId(session)),
    {
      commentId,
      reason: String(formData.get("reason") ?? "other"),
      target,
    },
  );
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-reported");
}
