"use server";

import { redirect } from "next/navigation";

import { verifyPilotInviteToken } from "@/lib/garden/pilot-invite";
import { gardenFirstEntryInvitePath } from "@/lib/garden/public-paths";
import { setPilotInviteCookie } from "@/server/pilot-write-access";

// Claims a closed-pilot invitation. The raw token arrives only as a bound form
// field; we verify it server-side and, when valid, set the signed HTTP-only
// eligibility cookie. We never persist the raw invite link, referrer, or query
// string. The redirect always lands on the canonical first-entry path with the
// enum-only `source=invited-cohort` attribution.
export async function claimPilotInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("invite") ?? "");
  const verified = verifyPilotInviteToken(token);

  if (verified) {
    await setPilotInviteCookie(verified.cohort);
  }

  redirect(gardenFirstEntryInvitePath());
}
