"use server";

import { revalidatePath } from "next/cache";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { submitErasureRequest } from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export async function submitErasureRequestAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  const acknowledgementAccepted =
    formData.get("erasureAcknowledgementAccepted") === "on";

  if (!acknowledgementAccepted) {
    const locale = await getRequestInterfaceLocale();
    throw new Error(
      getTrustSurfaceCopy(locale).erasure.acknowledgementRequired,
    );
  }

  await submitErasureRequest(scope);

  revalidatePath("/erasure");
  revalidatePath("/garden/privacy/erasure-requests");
}
