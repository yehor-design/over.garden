"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { unsealLineageClaimToken } from "@/server/lineage-claim-cookie";
import { resolveLineageInvitationClaim } from "@/server/lineage-repository";
import type { RequestScope } from "@/server/request-scope";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const LINEAGE_CLAIMS_PATH = "/garden/lineage/claims";

export async function confirmLineageInvitationClaimAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirectToClaimAuthentication();
    }
    return { mutationScope: admission.code };
  }
  return resolveInvitationClaim("confirmed", admission.scope);
}

export async function declineLineageInvitationClaimAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    if (admission.code === "session_required") {
      redirectToClaimAuthentication();
    }
    return { mutationScope: admission.code };
  }
  return resolveInvitationClaim("declined", admission.scope);
}

async function resolveInvitationClaim(
  decision: "confirmed" | "declined",
  scope: RequestScope,
) {
  const cookieStore = await cookies();
  const token = unsealLineageClaimToken(
    cookieStore.get(LINEAGE_CLAIM_COOKIE_NAME)?.value,
  );
  if (!token) {
    const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
    throw new Error(copy.invitation.actionUnavailable);
  }

  const result = await resolveLineageInvitationClaim(scope, {
    token,
    decision,
  });

  revalidateLineageInvitationClaimPaths(result.edge.subject_plant_object_id);
  cookieStore.delete({
    name: LINEAGE_CLAIM_COOKIE_NAME,
    path: LINEAGE_INVITATION_CLAIM_PATH,
  });
  redirect(`${LINEAGE_CLAIMS_PATH}?invitation=${decision}`);
}

function redirectToClaimAuthentication(): never {
  const token = createAuthIntentToken({
    action: "claim",
    returnTo: LINEAGE_INVITATION_CLAIM_PATH,
  });
  redirect(`/auth/intent?intent=${encodeURIComponent(token)}`);
}

function revalidateLineageInvitationClaimPaths(subjectPlantObjectId: string) {
  revalidatePath(LINEAGE_INVITATION_CLAIM_PATH);
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${subjectPlantObjectId}`);
}
