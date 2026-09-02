"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicProfilePath } from "@/lib/garden/public-paths";
import { PUBLIC_LOCALES } from "@/lib/public-localization";
import type { MutationScopeCode } from "@/lib/auth/owner-scope-contract";
import { updateOwnerPublicProfile } from "@/server/owner-profile-repository";
import { unblockProfileByBlockId } from "@/server/profile-interaction-repository";
import {
  updateUserPublicHandle,
  type PublicHandleUpdateStatus,
} from "@/server/public-profile-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

export interface PublicHandleActionState {
  status: PublicHandleUpdateStatus | null;
  currentHandle: string;
  nextEligibleAt: string | null;
  mutationScope?: MutationScopeCode;
}

export async function updatePublicHandleAction(
  _previousState: PublicHandleActionState,
  formData: FormData,
): Promise<PublicHandleActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return {
      ..._previousState,
      mutationScope: admission.code,
    };
  }
  const scope = admission.scope;
  const result = await updateUserPublicHandle(
    scope,
    String(formData.get("handle") ?? ""),
  );

  revalidatePath("/garden");
  revalidatePath("/garden/profile");
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(publicProfilePath(locale, result.previousHandle));
    revalidatePath(publicProfilePath(locale, result.profile.handle));
  }

  return {
    status: result.status,
    currentHandle: result.profile.handle,
    nextEligibleAt: finiteIsoDate(result.nextEligibleAt),
  };
}

function finiteIsoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function updatePublicProfileAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  const result = await updateOwnerPublicProfile(scope, {
    avatarMediaAssetId: nullableString(formData.get("avatarMediaAssetId")),
    displayName: nullableString(formData.get("displayName")),
    bio: nullableString(formData.get("bio")),
    languages: formData.getAll("languages").map(String),
    locationVisibility: String(formData.get("locationVisibility") ?? "hidden"),
    coarseRegionCode: nullableString(formData.get("coarseRegionCode")),
    profileVisibility: String(formData.get("profileVisibility") ?? "public"),
    relationshipVisibility: String(
      formData.get("relationshipVisibility") ?? "counts",
    ),
  });

  revalidateProfilePaths(result.profile.handle);
  redirect(
    `/garden/profile?status=${encodeURIComponent(result.status)}#public-profile-editor`,
  );
}

export async function unblockProfileAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }
  const scope = admission.scope;
  const blockId = String(formData.get("blockId") ?? "");
  const result = await unblockProfileByBlockId(scope, blockId);

  revalidatePath("/garden/profile");
  redirect(`/garden/profile?relationshipStatus=${result}#blocked-profiles`);
}

function revalidateProfilePaths(handle: string) {
  revalidatePath("/garden");
  revalidatePath("/garden/profile");
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(publicProfilePath(locale, handle));
  }
}

function nullableString(value: FormDataEntryValue | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
