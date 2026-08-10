import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { scopedToUser } from "@/server/request-scope";
import { updateNotificationPreferences } from "@/server/social-return-repository";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";

export async function POST(request: Request) {
  const formData = await request.formData();
  const visualActor = resolveVisualSocialMutationActor(formData, [
    "notifications",
  ]);
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
  const admission = visualActor
    ? null
    : await admitDocumentMutation({
        transport: documentMutationGenerationFromRequest(request),
      });
  if (admission?.status === "rejected") {
    if (admission.transportResult === "AUTHENTICATION_REQUIRED") {
      return NextResponse.redirect(new URL(returnTo, request.url), 303);
    }
    return documentMutationAdmissionResponse(admission);
  }

  await updateNotificationPreferences(
    visualActor ? scopedToUser(visualActor.actorId) : admission!.scope,
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
