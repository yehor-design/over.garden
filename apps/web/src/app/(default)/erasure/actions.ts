"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { submitErasureRequest } from "@/server/erasure-request-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { erasureOutcomePath } from "./outcome";

/**
 * `(previousState, formData)` so `OwnerScopedProgressiveForm` can hand the
 * reference straight to `useActionState`, which is the one shape that gives
 * the form a real endpoint before hydration (ADR-0024 D3, `OVE-456`). The
 * first argument is the previous result and is unused.
 *
 * Both ends land back on the page, which says what happened (`OVE-505`): a
 * request received — read back, with its reference — or not sent, because
 * its conditions were not accepted. The second used to be a thrown error and
 * the error page; the first a silent refresh.
 */
export async function submitErasureRequestAction(
  _previousState: unknown,
  formData: FormData,
) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
    // Asking for erasure is a right, not a use of the product (ADR-0038).
    legalAcceptance: "exempt",
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
  }

  if (formData.get("erasureAcknowledgementAccepted") !== "on") {
    redirect(erasureOutcomePath("acknowledgement-required"));
  }

  // Idempotent: an open request is returned rather than duplicated.
  await submitErasureRequest(admission.scope);

  revalidatePath("/erasure");
  revalidatePath("/garden/privacy/erasure-requests");
  redirect(erasureOutcomePath("received"));
}
