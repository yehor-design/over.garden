import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { setEngagementBookmark } from "@/server/engagement-repository";
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
  const visualActor = resolveVisualSocialMutationActor(formData, [
    "journal",
    "bookmarks",
  ]);
  const userId = visualActor?.actorId ?? session?.user?.id;

  if (!userId) {
    return redirectToEngagementAuth(request, target, returnTo, "bookmark");
  }

  const scope = scopedToUser(
    userId,
    visualActor ? null : getSessionId(session),
  );
  const bookmarkState = String(formData.get("bookmarkState") ?? "");
  const result = await setEngagementBookmark(scope, {
    target,
    bookmarkState:
      bookmarkState === "active" || bookmarkState === "removed"
        ? bookmarkState
        : "active",
  });

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
