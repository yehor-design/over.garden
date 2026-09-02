"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import type { MutationScopeActionState } from "@/lib/auth/owner-scope-contract";
import { getCurrentSession } from "@/server/auth-session";
import { resolveMutationScope } from "@/server/mutation-scope";

export type AccountMethodPasswordActionResult =
  | { status: "success" }
  | { status: "error" }
  | MutationScopeActionState;

export async function setCurrentAccountPassword(
  newPassword: string,
  ownerUserId: string | null,
): Promise<AccountMethodPasswordActionResult> {
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    newPassword.length > 256
  ) {
    return { status: "error" };
  }

  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserId,
    authoritative: true,
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }

  const session = await getCurrentSession();
  if (
    !session?.user.emailVerified ||
    session.user.id !== admission.scope.userId
  ) {
    return { status: "error" };
  }

  try {
    await auth.api.setPassword({
      body: { newPassword },
      headers: await headers(),
    });
  } catch {
    return { status: "error" };
  }

  revalidatePath("/garden/profile");
  return { status: "success" };
}
