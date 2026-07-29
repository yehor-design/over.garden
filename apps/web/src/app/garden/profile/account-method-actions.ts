"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/server/auth-session";

export type AccountMethodPasswordActionResult =
  | { status: "success" }
  | { status: "error" };

export async function setCurrentAccountPassword(
  newPassword: string,
): Promise<AccountMethodPasswordActionResult> {
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    newPassword.length > 256
  ) {
    return { status: "error" };
  }

  const session = await getCurrentSession();
  if (!session?.user.emailVerified) {
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
