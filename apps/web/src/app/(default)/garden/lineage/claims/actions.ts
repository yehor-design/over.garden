"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PUBLIC_CACHE_TAGS, publicCacheTag } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

import {
  isLineageDecisionUnavailableError,
  resolveLineageClaim,
  type ResolveLineageClaimResult,
} from "@/server/lineage-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { lineageClaimOutcomePath } from "./outcome";

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
  return decideLineageClaim("confirmed", formData);
}

export async function declineLineageClaimAction(
  _previousState: unknown,
  formData: FormData,
) {
  return decideLineageClaim("declined", formData);
}

/**
 * Every answer ends on the inbox with the claim named in the address, and the
 * inbox reads that claim back to say what is stored now (`OVE-495`). A claim
 * that could no longer be answered — answered in another tab, or gone — is
 * not an error page: nothing was written, and the inbox says which it was.
 */
async function decideLineageClaim(
  decision: "confirmed" | "declined",
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const edgeId = String(formData.get("edgeId") ?? "");

  let result: ResolveLineageClaimResult;
  try {
    result = await resolveLineageClaim(admission.scope, { edgeId, decision });
  } catch (error) {
    if (isLineageDecisionUnavailableError(error)) {
      redirect(lineageClaimOutcomePath(edgeId, "stale"));
    }
    throw error;
  }

  revalidateLineageClaimPaths(result.edge);
  redirect(lineageClaimOutcomePath(result.edge.id, "done"));
}

function revalidateLineageClaimPaths(edge: ResolveLineageClaimResult["edge"]) {
  revalidatePath("/garden/lineage/claims");
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${edge.subject_plant_object_id}`);
  if (edge.source_plant_object_id) {
    revalidatePath(`/garden/objects/${edge.source_plant_object_id}`);
  }
  // A confirmed link appears on the claimed object's passport: public
  // lineage walks ancestry, from an object to where it came from.
  revalidatePublicCacheTags(
    [
      PUBLIC_CACHE_TAGS.catalog,
      PUBLIC_CACHE_TAGS.profiles,
      publicCacheTag.object(edge.subject_plant_object_id),
    ],
    "update",
  );
}
