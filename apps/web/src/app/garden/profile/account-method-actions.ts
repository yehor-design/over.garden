"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import type { DocumentMutationActionStateV1 } from "@/lib/auth/document-mutation-generation-transport";
import { getCurrentSession } from "@/server/auth-session";
import { admitDocumentMutation } from "@/server/document-mutation-admission";

export type AccountMethodPasswordActionResult =
  | { status: "success" }
  | { status: "error" }
  | DocumentMutationActionStateV1;

export async function setCurrentAccountPassword(
  newPassword: string,
  documentMutationGeneration: string | null,
): Promise<AccountMethodPasswordActionResult> {
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    newPassword.length > 256
  ) {
    return { status: "error" };
  }

  const admission = await admitDocumentMutation({
    transport: documentMutationGeneration,
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
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
