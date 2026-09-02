import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { updateNotificationPreferences } from "@/server/social-return-repository";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function POST(request: Request) {
  const formData = await request.formData();
  const locale = String(formData.get("locale") ?? "uk");
  const basePath =
    locale === "bg"
      ? "/bg/notifications"
      : locale === "ru"
        ? "/ru/notifications"
        : "/notifications";
  const returnTo = basePath;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return NextResponse.redirect(new URL(returnTo, request.url), 303);
    }
    return mutationScopeResponse(admission);
  }

  await updateNotificationPreferences(admission.scope, {
    comments: formData.get("comments") === "on",
    replies: formData.get("replies") === "on",
    follows: formData.get("follows") === "on",
    mentions: formData.get("mentions") === "on",
    claims: formData.get("claims") === "on",
    system: formData.get("system") === "on",
  });
  revalidatePath(returnTo);
  const url = new URL(returnTo, request.url);
  url.searchParams.set("engagement", "preferences-saved");
  return NextResponse.redirect(url, 303);
}
