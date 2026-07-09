"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { publicProfilePath } from "@/lib/garden/public-paths";
import { PUBLIC_LOCALES } from "@/lib/public-localization";
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
  for (const locale of PUBLIC_LOCALES) {
    revalidatePath(publicProfilePath(locale, result.profile.handle));
  }

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
