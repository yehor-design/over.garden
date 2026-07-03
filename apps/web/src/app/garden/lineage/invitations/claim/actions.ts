"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import { resolveLineageInvitationClaim } from "@/server/lineage-repository";

const LINEAGE_INVITATION_CLAIM_PATH = "/garden/lineage/invitations/claim";

export async function confirmLineageInvitationClaimAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const result = await resolveLineageInvitationClaim(scope, {
    token: String(formData.get("token") ?? ""),
    decision: "confirmed",
  });

  revalidateLineageInvitationClaimPaths(result.edge.subject_plant_object_id);
}

export async function declineLineageInvitationClaimAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const result = await resolveLineageInvitationClaim(scope, {
    token: String(formData.get("token") ?? ""),
    decision: "declined",
  });

  revalidateLineageInvitationClaimPaths(result.edge.subject_plant_object_id);
}

function revalidateLineageInvitationClaimPaths(subjectPlantObjectId: string) {
  revalidatePath(LINEAGE_INVITATION_CLAIM_PATH);
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${subjectPlantObjectId}`);
}
