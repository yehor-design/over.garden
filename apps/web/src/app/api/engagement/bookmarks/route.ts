import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { toggleEngagementBookmark } from "@/server/engagement-repository";
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
    return redirectToEngagementAuth(request, target, returnTo, "bookmark");
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const result = await toggleEngagementBookmark(scope, { target });

  revalidatePath(new URL(returnTo, request.url).pathname);
  revalidatePath("/bookmarks");
  revalidatePath("/bg/bookmarks");
  revalidatePath("/ru/bookmarks");

  return redirectWithEngagementStatus(
    request,
    returnTo,
    result.active ? "bookmarked" : "bookmark-removed",
  );
}
