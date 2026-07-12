"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicProfilePath } from "@/lib/garden/public-paths";
import { PUBLIC_LOCALES } from "@/lib/public-localization";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { updateOwnerPublicProfile } from "@/server/owner-profile-repository";
import { unblockProfile } from "@/server/profile-interaction-repository";
import {
  updateUserPublicHandle,
  type PublicHandleUpdateStatus,
} from "@/server/public-profile-repository";

export async function updatePublicHandleAction(
  formData: FormData,
): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const result = await updateUserPublicHandle(
    scope,
    String(formData.get("handle") ?? ""),
  );

  revalidatePath("/garden");
  revalidatePath("/garden/profile");
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(publicProfilePath(locale, result.profile.handle));
  }

  redirect(`/garden/profile?status=${handleStatusParam(result.status)}`);
}

export async function updatePublicProfileAction(
  formData: FormData,
): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const result = await updateOwnerPublicProfile(scope, {
    handle: String(formData.get("handle") ?? ""),
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

export async function unblockProfileAction(formData: FormData): Promise<void> {
  const scope = await requireCurrentRequestScope();
  const handle = String(formData.get("handle") ?? "");
  const result = await unblockProfile(scope, handle);

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

function handleStatusParam(status: PublicHandleUpdateStatus) {
  switch (status) {
    case "updated":
    case "unchanged":
    case "taken":
    case "empty":
    case "format":
    case "reserved":
    case "blocked":
      return status;
  }
}
