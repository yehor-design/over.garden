"use server";

import { revalidatePath } from "next/cache";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { submitErasureRequest } from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

/**
 * `(previousState, formData)` so `OwnerScopedProgressiveForm` can hand the
 * reference straight to `useActionState`, which is the one shape that gives
 * the form a real endpoint before hydration (ADR-0024 D3, `OVE-456`). The
 * first argument is the previous result and is unused.
 */
export async function submitErasureRequestAction(
  _previousState: unknown,
  formData: FormData,
) {
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
