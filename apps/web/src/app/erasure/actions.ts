"use server";

import { revalidatePath } from "next/cache";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import { submitErasureRequest } from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export async function submitErasureRequestAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
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
