"use server";

import { revalidatePath } from "next/cache";

import {
  gardenSpacePath,
  gardenSpaceSettingsPath,
  isSpaceId,
  type SpaceDeletionBlockers,
} from "@/lib/garden/space-page";
import {
  normalizeSpaceName,
  validateSpaceSetup,
  type SpaceSetupFieldError,
} from "@/lib/garden/space-setup";
import { normalizeCoarseRegionCode } from "@/lib/garden/regions";
import { publicCacheTag } from "@/lib/public-cache-tags";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import {
  deleteEmptySpace,
  updateOwnedSpace,
} from "@/server/space-page-repository";

export type SpaceSettingsActionState =
  | undefined
  | { mutationScope: string }
  | { status: "saved"; displayName: string; savedAt: number }
  | {
      status: "invalid";
      errors: Partial<Record<"name" | "region", SpaceSetupFieldError>>;
    }
  | { status: "missing" };

/**
 * Rename a space, or change whether its region shows publicly (`OVE-490`).
 * `(previousState, formData)` so the form's endpoint is this Server Action
 * itself and the form works before the bundle does (ADR-0024 D3).
 */
export async function updateSpaceSettingsAction(
  _previousState: unknown,
  formData: FormData,
): Promise<SpaceSettingsActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const spaceId = String(formData.get("spaceId") ?? "");
  if (!isSpaceId(spaceId)) return { status: "missing" };

  const locationVisibility =
    formData.get("locationVisibility") === "region" ? "region" : "hidden";
  const rawRegion = String(formData.get("coarseRegionCode") ?? "");
  const errors = validateSpaceSetup({
    displayName: formData.get("displayName"),
    locationVisibility,
    coarseRegionCode: rawRegion,
  });
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };

  const result = await updateOwnedSpace(admission.scope, {
    spaceId,
    displayName: normalizeSpaceName(formData.get("displayName")),
    locationVisibility,
    coarseRegionCode:
      locationVisibility === "region"
        ? normalizeCoarseRegionCode(rawRegion)
        : null,
  });
  if (result.status === "missing") return { status: "missing" };

  revalidatePath("/garden");
  revalidatePath(gardenSpacePath(spaceId));
  revalidatePath(gardenSpaceSettingsPath(spaceId));
  // The space's name and region are shown on its objects' public passports
  // and entries; their cached documents must not keep the old ones.
  revalidatePublicCacheTags(
    [
      ...result.publicObjectIds.map((id) => publicCacheTag.object(id)),
      ...result.publicEntryIds.map((id) => publicCacheTag.entry(id)),
    ],
    "expire",
  );
  return {
    status: "saved",
    displayName: result.space.displayName,
    savedAt: Date.now(),
  };
}

export type SpaceDeleteActionState =
  | undefined
  | { mutationScope: string }
  | { status: "deleted" }
  | { status: "missing" }
  | { status: "not_empty"; blockers: SpaceDeletionBlockers };

/** Delete a space only when it is empty (see `deleteEmptySpace`). */
export async function deleteSpaceAction(
  _previousState: unknown,
  formData: FormData,
): Promise<SpaceDeleteActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const spaceId = String(formData.get("spaceId") ?? "");
  if (!isSpaceId(spaceId)) return { status: "missing" };

  const result = await deleteEmptySpace(admission.scope, spaceId);
  if (result.status === "deleted") {
    revalidatePath("/garden");
    revalidatePath(gardenSpacePath(spaceId));
  }
  return result;
}
