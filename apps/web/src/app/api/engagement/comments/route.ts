import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { addEngagementComment } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
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
  const userId = session?.user?.id;

  if (!userId) {
    return redirectToEngagementAuth(request, target, returnTo, "comment");
  }

  const scope = scopedToUser(userId, getSessionId(session));
  await addEngagementComment(scope, {
    target,
    body: String(formData.get("body") ?? ""),
    parentCommentId:
      typeof formData.get("parentCommentId") === "string"
        ? String(formData.get("parentCommentId"))
        : null,
  });

  revalidatePath(new URL(returnTo, request.url).pathname);
  return redirectWithEngagementStatus(request, returnTo, "commented");
}
