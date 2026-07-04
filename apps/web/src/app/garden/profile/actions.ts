"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { requireCurrentRequestScope } from "@/server/auth-session";
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
  revalidatePath(
    publicProfilePath(DEFAULT_PUBLIC_LOCALE, result.profile.handle),
  );

  redirect(`/garden/profile?status=${handleStatusParam(result.status)}`);
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
