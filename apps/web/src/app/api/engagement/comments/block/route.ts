import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
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
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const userId = visualActor?.actorId ?? session?.user?.id;

  if (!userId) {
    return redirectToEngagementAuth(
      request,
      target,
      returnTo,
      "block",
      createAuthIntentControlRef("block", commentId),
    );
  }

  await blockEngagementCommentAuthor(
    scopedToUser(userId, visualActor ? null : getSessionId(session)),
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
