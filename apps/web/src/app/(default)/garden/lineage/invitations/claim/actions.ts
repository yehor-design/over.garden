"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import {
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import { unsealLineageClaimToken } from "@/server/lineage-claim-cookie";
import {
  isLineageDecisionUnavailableError,
  resolveLineageInvitationClaim,
  type ResolveLineageInvitationClaimResult,
} from "@/server/lineage-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { invitationOutcomePath } from "./outcome";

/**
 * `(previousState, formData)` — the shape `useActionState` calls, and the one
 * that lets `OwnerScopedProgressiveForm` hand React a Server Action reference
 * rather than a client closure. React answers a closure with
 * `action="javascript:throw …"`, a placeholder it replaces on hydration and
 * never before, so the control did nothing until the bundle ran (ADR-0024 D3,
 * `OVE-457`). The first argument is the previous result and is unused here.
 */
export async function confirmLineageInvitationClaimAction(
  _previousState: unknown,
  formData: FormData,
) {
  return answerInvitation("confirmed", formData);
}

export async function declineLineageInvitationClaimAction(
  _previousState: unknown,
  formData: FormData,
) {
  return answerInvitation("declined", formData);
}

/**
 * The answer lands back on the invitation page, which reads the record again
 * (`OVE-495`). The cookie stays until its thirty minutes are up: the page
 * then says "you confirmed" from what is stored, and the token cannot be used
 * twice — the record is no longer pending. An answer that could not be given
 * — expired in the meantime, answered elsewhere, or the reader's own
 * invitation — wrote nothing, and the page says which.
 */
async function answerInvitation(
  decision: "confirmed" | "declined",
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirectToClaimAuthentication();
    }
    return { mutationScope: admission.code };
  }

  const cookieStore = await cookies();
  const token = unsealLineageClaimToken(
    cookieStore.get(LINEAGE_CLAIM_COOKIE_NAME)?.value,
  );
  if (!token) redirect(invitationOutcomePath("stale"));

  let result: ResolveLineageInvitationClaimResult;
  try {
    result = await resolveLineageInvitationClaim(admission.scope, {
      token,
      decision,
    });
  } catch (error) {
    if (isLineageDecisionUnavailableError(error)) {
      redirect(invitationOutcomePath("stale"));
    }
    throw error;
  }

  // Nothing public changes: an invitation's link is never on a passport.
  // The writer's own record does, on their object's provenance page.
  revalidatePath(LINEAGE_INVITATION_CLAIM_PATH);
  revalidatePath(
    gardenObjectSectionPath(result.edge.subject_plant_object_id, "provenance"),
  );
  redirect(invitationOutcomePath("done"));
}

function redirectToClaimAuthentication(): never {
  const token = createAuthIntentToken({
    action: "claim",
    returnTo: LINEAGE_INVITATION_CLAIM_PATH,
  });
  redirect(`/auth/intent?intent=${encodeURIComponent(token)}`);
}
