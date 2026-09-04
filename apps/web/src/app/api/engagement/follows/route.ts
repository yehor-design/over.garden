import { revalidatePath } from "next/cache";

import { setEngagementFollow } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectToEngagementAuth,
  redirectWithEngagementStatus,
  settleEngagementMutation,
} from "../shared";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { publicEngagementChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

async function runEngagementMutation(request: Request, formData: FormData) {
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return redirectToEngagementAuth(request, target, returnTo, "follow");
    }
    return mutationScopeResponse(admission);
  }

  const rawState = String(formData.get("followState") ?? "");
  const scope = admission.scope;
  const result = await setEngagementFollow(scope, {
    target,
    followState: rawState === "removed" ? "removed" : "active",
  });
  revalidatePublicCacheTags(
    publicEngagementChangeTags(target.kind, target.ref),
    "expire",
  );

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

export async function POST(request: Request) {
  return settleEngagementMutation(request, "follows", (formData) =>
    runEngagementMutation(request, formData),
  );
}
