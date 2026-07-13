import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import { updateNotificationPreferences } from "@/server/social-return-repository";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";

export async function POST(request: Request) {
  const formData = await request.formData();
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, [
    "notifications",
  ]);
  const userId = visualActor?.actorId ?? session?.user?.id;
  const locale = String(formData.get("locale") ?? "uk");
  const basePath =
    locale === "bg"
      ? "/bg/notifications"
      : locale === "ru"
        ? "/ru/notifications"
        : "/notifications";
  const returnTo = visualActor
    ? `${basePath}?visualSocial=${encodeURIComponent(visualActor.scenario.id)}`
    : basePath;
  if (!userId)
    return NextResponse.redirect(new URL(returnTo, request.url), 303);

  await updateNotificationPreferences(
    scopedToUser(userId, visualActor ? null : getSessionId(session)),
    {
      comments: formData.get("comments") === "on",
      replies: formData.get("replies") === "on",
      follows: formData.get("follows") === "on",
      mentions: formData.get("mentions") === "on",
      claims: formData.get("claims") === "on",
      system: formData.get("system") === "on",
    },
  );
  revalidatePath(returnTo);
  const url = new URL(returnTo, request.url);
  url.searchParams.set("engagement", "preferences-saved");
  return NextResponse.redirect(url, 303);
}
