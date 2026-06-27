"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import { submitErasureRequest } from "@/server/erasure-request-repository";

export async function submitErasureRequestAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const acknowledgementAccepted =
    formData.get("erasureAcknowledgementAccepted") === "on";

  if (!acknowledgementAccepted) {
    throw new Error("Erasure request acknowledgement is required.");
  }

  await submitErasureRequest(scope);

  revalidatePath("/erasure");
  revalidatePath("/garden/privacy/erasure-requests");
}
