"use server";

import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import { resolveLineageClaim } from "@/server/lineage-repository";

const LINEAGE_CLAIMS_PATH = "/garden/lineage/claims";

export async function confirmLineageClaimAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const result = await resolveLineageClaim(scope, {
    edgeId: String(formData.get("edgeId") ?? ""),
    decision: "confirmed",
  });

  revalidateLineageClaimPaths(result.edge.subject_plant_object_id);
}

export async function declineLineageClaimAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  const result = await resolveLineageClaim(scope, {
    edgeId: String(formData.get("edgeId") ?? ""),
    decision: "declined",
  });

  revalidateLineageClaimPaths(result.edge.subject_plant_object_id);
}

function revalidateLineageClaimPaths(subjectPlantObjectId: string) {
  revalidatePath(LINEAGE_CLAIMS_PATH);
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${subjectPlantObjectId}`);
}
