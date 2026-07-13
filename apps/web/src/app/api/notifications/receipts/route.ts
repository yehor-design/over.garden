import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  markNotificationEventsRead,
  setNotificationReceipt,
} from "@/server/social-return-repository";
import { scopedToUser } from "@/server/request-scope";
import { resolveVisualSocialMutationActor } from "@/server/visual-fixtures/social-actor";

export async function POST(request: Request) {
  const formData = await request.formData();
  const session = await getCurrentSession();
  const visualActor = resolveVisualSocialMutationActor(formData, [
    "notifications",
  ]);
  const userId = visualActor?.actorId ?? session?.user?.id;
  const returnTo = notificationReturnTo(formData.get("returnTo"));
  if (!userId)
    return NextResponse.redirect(new URL(returnTo, request.url), 303);

  const scope = scopedToUser(
    userId,
    visualActor ? null : getSessionId(session),
  );
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
  const raw = typeof value === "string" ? value : "/notifications";
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
