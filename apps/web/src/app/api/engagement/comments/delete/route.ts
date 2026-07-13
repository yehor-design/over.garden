import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { deleteEngagementComment } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectWithEngagementStatus,
} from "../../shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const userId = visualActor?.actorId ?? session?.user?.id;
  if (!userId) {
    return redirectWithEngagementStatus(
      request,
      returnTo,
      "comment-unavailable",
    );
  }

  await deleteEngagementComment(
    scopedToUser(userId, visualActor ? null : getSessionId(session)),
    String(formData.get("commentId") ?? ""),
  );
  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "comment-deleted");
}
