"use server";

import { revalidatePath } from "next/cache";

import { resolveLineageClaim } from "@/server/lineage-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

const LINEAGE_CLAIMS_PATH = "/garden/lineage/claims";

/**
 * `(previousState, formData)` — the shape `useActionState` calls, and the one
 * that lets `OwnerScopedProgressiveForm` hand React a Server Action reference
 * rather than a client closure. React answers a closure with
 * `action="javascript:throw …"`, a placeholder it replaces on hydration and
 * never before, so the control did nothing until the bundle ran (ADR-0024 D3,
 * `OVE-457`). The first argument is the previous result and is unused here.
 */
export async function confirmLineageClaimAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  const result = await resolveLineageClaim(scope, {
    edgeId: String(formData.get("edgeId") ?? ""),
    decision: "confirmed",
  });

  revalidateLineageClaimPaths(result.edge.subject_plant_object_id);
}

export async function declineLineageClaimAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
