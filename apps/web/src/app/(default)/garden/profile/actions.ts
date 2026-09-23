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
import { publicProfileChangeTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

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
  revalidatePublicCacheTags(
    publicProfileChangeTags({
      ownerUserId: scope.userId,
      handle: result.profile.handle,
      previousHandle: result.previousHandle,
    }),
    "update",
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

export interface PublicProfileActionState {
  /** `updated`, `unchanged`, or the field the server refused. */
  status: string | null;
  mutationScope?: MutationScopeCode;
}

/**
 * Save the public profile's fields, and answer with what happened
 * (`OVE-503`).
 *
 * It answers the form instead of redirecting to `?status=…`. A redirect is a
 * navigation, the App Router keys a page by its search parameters, and so the
 * editor was mounted afresh — a display name the policy refused came back as
 * the stored one, and the gardener's words were gone. Answering in place keeps
 * them, and the form still works before hydration: React renders a progressive
 * `useActionState` form's answer into the page it posts to.
 */
export async function updatePublicProfileAction(
  _previousState: PublicProfileActionState,
  formData: FormData,
): Promise<PublicProfileActionState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { ..._previousState, mutationScope: admission.code };
  }
  const scope = admission.scope;
  const result = await updateOwnerPublicProfile(scope, {
    avatarMediaAssetId: nullableString(formData.get("avatarMediaAssetId")),
    displayName: nullableString(formData.get("displayName")),
    bio: nullableString(formData.get("bio")),
    languages: formData.getAll("languages").map(String),
    locationVisibility: String(formData.get("locationVisibility") ?? "hidden"),
    coarseRegionCode: nullableString(formData.get("coarseRegionCode")),
    relationshipVisibility: String(
      formData.get("relationshipVisibility") ?? "counts",
    ),
  });

  revalidateProfilePaths(result.profile.handle);
  revalidatePublicCacheTags(
    publicProfileChangeTags({
      ownerUserId: scope.userId,
      handle: result.profile.handle,
    }),
    "update",
  );
  return { status: result.status };
}

export async function unblockProfileAction(
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
  const blockId = String(formData.get("blockId") ?? "");
  const result = await unblockProfileByBlockId(scope, blockId);

  // The blocked list lives on the account's settings page since `OVE-503`.
  revalidatePath("/account/settings");
  redirect(`/account/settings?relationshipStatus=${result}#blocked-profiles`);
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
