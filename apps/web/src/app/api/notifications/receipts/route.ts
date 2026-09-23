import { revalidatePath } from "next/cache";

import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { updateNotificationReceipts } from "@/server/social-return-repository";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

/**
 * Read, unread or dismissed, for one row's events (`OVE-501`, criterion 4).
 *
 * The answer is a redirect back to the same view with what happened to which
 * row: `receipt` is the state that was written, or `failed`, and `event` is
 * the row's first key, so the page can say it beside that row. The row and
 * the count on the page are then read back from the receipts — nothing on the
 * page says "read" because a button was pressed. A failure used to escape as
 * an error page; now it is the row's own notice, and its buttons are the retry.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = notificationReturnTo(formData.get("returnTo"));
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") return seeOther(returnTo);
    return mutationScopeResponse(admission);
  }

  const keys = formData
    .getAll("eventKey")
    .map(String)
    .filter((value) => /^[a-f0-9]{32}$/.test(value))
    .slice(0, 60);
  const rawState = String(formData.get("receiptState") ?? "");
  const state =
    rawState === "unread" || rawState === "dismissed" ? rawState : "read";

  let outcome: "read" | "unread" | "dismissed" | "failed" = state;
  if (keys.length > 0) {
    try {
      await updateNotificationReceipts(admission.scope, {
        eventKeys: keys,
        state,
      });
    } catch (error) {
      console.error("[notifications] receipt write failed", {
        state,
        count: keys.length,
        error: error instanceof Error ? error.message : String(error),
      });
      outcome = "failed";
    }
  }

  const url = new URL(returnTo, "https://over.garden");
  if (outcome !== "failed" && keys.length > 0) revalidatePath(url.pathname);
  // Back to the row, or — when it has left the view — to the list's notice:
  // a dismissed row is gone, and a read one is gone from the unread view.
  const leftTheView =
    outcome === "dismissed" ||
    (outcome === "read" && url.searchParams.get("unread") === "1");
  url.searchParams.set("receipt", outcome);
  if (keys[0]) url.searchParams.set("event", keys[0]);
  url.hash =
    keys[0] && !leftTheView
      ? `notification-${keys[0]}`
      : "notification-outcome";
  return seeOther(`${url.pathname}${url.search}${url.hash}`);
}

/**
 * A relative `Location`, as `auth/intent/resume` answers (`OVE-504`):
 * `request.url` names the host the server thinks it has, and an absolute
 * redirect built from it moved the reader to another origin — away from the
 * session cookie, so the page they came back to said "sign in".
 */
function seeOther(path: string) {
  return new Response(null, { status: 303, headers: { location: path } });
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
