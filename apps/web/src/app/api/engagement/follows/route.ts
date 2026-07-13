import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
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
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, ["journal"]);
  const userId = visualActor?.actorId ?? session?.user?.id;

  if (!userId) {
    return redirectToEngagementAuth(request, target, returnTo, "follow");
  }

  const rawState = String(formData.get("followState") ?? "");
  const scope = scopedToUser(
    userId,
    visualActor ? null : getSessionId(session),
  );
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
