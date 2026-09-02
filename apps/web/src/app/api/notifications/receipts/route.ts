import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  markNotificationEventsRead,
  setNotificationReceipt,
} from "@/server/social-return-repository";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = notificationReturnTo(formData.get("returnTo"));
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      return NextResponse.redirect(new URL(returnTo, request.url), 303);
    }
    return mutationScopeResponse(admission);
  }

  const scope = admission.scope;
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
  for (const key of ["filter", "unread", "view", "cursor"]) {
    const item = url.searchParams.get(key);
    if (item && /^[A-Za-z0-9._~-]{1,512}$/.test(item)) safe.set(key, item);
  }
  return safe.size ? `${url.pathname}?${safe}` : url.pathname;
}
