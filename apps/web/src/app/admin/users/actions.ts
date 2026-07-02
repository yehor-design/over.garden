"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  grantAdminRole,
  revokeAdminRole,
} from "@/server/admin-role-management-repository";

const ADMIN_USERS_PATH = "/admin/users";

export async function grantAdminRoleAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();

  await grantAdminRole(scope, {
    targetUserId: String(formData.get("targetUserId") ?? ""),
    role: String(formData.get("role") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  revalidatePath(ADMIN_USERS_PATH);
  revalidatePath("/admin");
}

export async function revokeAdminRoleAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();

  await revokeAdminRole(scope, {
    targetUserId: String(formData.get("targetUserId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  revalidatePath(ADMIN_USERS_PATH);
  revalidatePath("/admin");
}
