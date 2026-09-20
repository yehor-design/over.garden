"use server";

import { revalidatePath } from "next/cache";

import { executeApprovedErasureRequest } from "@/server/erasure-execution";
import {
  assertErasureExecutionAccess,
  assertErasureRequestMutationAccess,
} from "@/server/erasure-request-access";
import {
  markErasureRequestDryRunReviewed,
  markErasureRequestHandled,
  markErasureRequestReviewing,
} from "@/server/erasure-request-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { allPublicCacheFamilyTags } from "@/lib/public-cache-tags";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

/**
 * Every control on this surface is `(previousState, formData)` — the shape
 * `useActionState` calls, so `OwnerScopedProgressiveForm` hands React a Server
 * Action reference and the form has a real endpoint before the bundle runs
 * (ADR-0024 D3, `OVE-456`). The first argument is unused.
 */
export async function markErasureRequestReviewingAction(
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
  await assertErasureRequestMutationAccess(scope);

  await markErasureRequestReviewing({
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}

export async function markErasureRequestHandledAction(
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
  await assertErasureRequestMutationAccess(scope);
  const handledStatus = String(formData.get("handledStatus") ?? "");

  if (handledStatus === "completed") {
    throw new Error(
      "Completed erasure requests must use approved erasure execution.",
    );
  }

  await markErasureRequestHandled(scope, {
    requestId: String(formData.get("requestId") ?? ""),
    handledStatus,
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}

export async function executeApprovedErasureRequestAction(
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
  await assertErasureExecutionAccess(scope);

  await executeApprovedErasureRequest(scope, {
    requestId: String(formData.get("requestId") ?? ""),
    approvalText: String(formData.get("maintainerApprovalText") ?? ""),
  });

  revalidatePublicCacheTags(allPublicCacheFamilyTags(), "update");
  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  revalidatePath("/garden");
}

export async function markErasureRequestDryRunReviewedAction(
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
  await assertErasureRequestMutationAccess(scope);

  await markErasureRequestDryRunReviewed(scope, {
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}
