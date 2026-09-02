"use server";

import { revalidatePath } from "next/cache";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { submitErasureRequest } from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function submitErasureRequestAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
