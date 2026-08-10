import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import {
  markNotificationEventsRead,
  setNotificationReceipt,
} from "@/server/social-return-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";

export async function POST(request: Request) {
  const formData = await request.formData();
  const visualActor = resolveVisualSocialMutationActor(formData, [
    "notifications",
  ]);
  const returnTo = notificationReturnTo(formData.get("returnTo"));
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

  const scope = visualActor
    ? scopedToUser(visualActor.actorId)
    : admission!.scope;
  const keys = formData
    .getAll("eventKey")
    .map(String)
    .filter((value) => /^[a-f0-9]{32}$/.test(value))
    .slice(0, 60);
  const rawState = String(formData.get("receiptState") ?? "");
  const state =
    rawState === "unread" || rawState === "dismissed" ? rawState : "read";

  if (state === "read" && keys.length > 1) {
    await markNotificationEventsRead(scope, keys);
  } else {
    for (const eventKey of keys) {
      await setNotificationReceipt(scope, { eventKey, state });
    }
  }

  revalidatePath(new URL(returnTo, request.url).pathname);
  const url = new URL(returnTo, request.url);
  url.searchParams.set("engagement", "notification-updated");
  return NextResponse.redirect(url, 303);
}

function notificationReturnTo(value: FormDataEntryValue | null) {
  const raw = normalizeInternalReturnPath(value, "/notifications");
  const url = new URL(raw, "https://over.garden");
  if (!/^\/(?:(?:bg|ru)\/)?notifications$/.test(url.pathname)) {
    return "/notifications";
  }
  const safe = new URLSearchParams();
  for (const key of ["filter", "unread", "view", "cursor", "visualSocial"]) {
    const item = url.searchParams.get(key);
    if (item && /^[A-Za-z0-9._~-]{1,512}$/.test(item)) safe.set(key, item);
  }
  return safe.size ? `${url.pathname}?${safe}` : url.pathname;
}
