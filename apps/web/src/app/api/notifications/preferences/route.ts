import { revalidatePath } from "next/cache";

import { updateNotificationPreferences } from "@/server/social-return-repository";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

/**
 * The Activity preferences (`OVE-501`, criterion 5). They have their own page
 * now, `/notifications/settings`, and the answer returns there with what
 * happened: `saved=1` when the choices were written, `saved=failed` when they
 * were not, and the form shows what is stored — a failure used to escape as
 * an error page.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const locale = String(formData.get("locale") ?? "uk");
  const settingsPath =
    locale === "bg"
      ? "/bg/notifications/settings"
      : locale === "ru"
        ? "/ru/notifications/settings"
        : "/notifications/settings";
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") return seeOther(settingsPath);
    return mutationScopeResponse(admission);
  }

  let saved = true;
  try {
    await updateNotificationPreferences(admission.scope, {
      comments: formData.get("comments") === "on",
      replies: formData.get("replies") === "on",
      follows: formData.get("follows") === "on",
      mentions: formData.get("mentions") === "on",
      claims: formData.get("claims") === "on",
      system: formData.get("system") === "on",
    });
  } catch (error) {
    console.error("[notifications] preference write failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    saved = false;
  }
  if (saved) {
    // The list reads the preferences too: a kind turned off leaves it.
    revalidatePath(settingsPath);
    revalidatePath(settingsPath.replace(/\/settings$/u, ""));
  }
  return seeOther(
    `${settingsPath}?saved=${saved ? "1" : "failed"}#notification-settings-outcome`,
  );
}

/** A relative `Location`: see `receipts/route.ts`. */
function seeOther(path: string) {
  return new Response(null, { status: 303, headers: { location: path } });
}
