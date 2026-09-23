"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NoResultError } from "kysely";

import {
  ErasureApprovalPhraseError,
  ErasureRequestNotExecutableError,
  executeApprovedErasureRequest,
} from "@/server/erasure-execution";
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

import { operatorErasureOutcomePath } from "./outcome";

const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

/**
 * Every control lands back on the list with its request named, and the list
 * reads the request back (`OVE-505`). A transition the request is no longer
 * in a state for — started or answered already, in another tab — writes
 * nothing and says so; so does a mistyped approval phrase. Anything else is a
 * failure and reaches the error boundary.
 */
function landOnRefusal(requestId: string, error: unknown): never {
  if (error instanceof ErasureApprovalPhraseError) {
    redirect(operatorErasureOutcomePath(requestId, "approval"));
  }
  if (
    error instanceof NoResultError ||
    error instanceof ErasureRequestNotExecutableError
  ) {
    redirect(operatorErasureOutcomePath(requestId, "stale"));
  }
  throw error;
}

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

  const requestId = String(formData.get("requestId") ?? "");
  try {
    await markErasureRequestReviewing({ requestId });
  } catch (error) {
    landOnRefusal(requestId, error);
  }

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  redirect(operatorErasureOutcomePath(requestId, "done"));
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

  const requestId = String(formData.get("requestId") ?? "");
  try {
    await markErasureRequestHandled(scope, { requestId, handledStatus });
  } catch (error) {
    landOnRefusal(requestId, error);
  }

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  redirect(operatorErasureOutcomePath(requestId, "done"));
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

  const requestId = String(formData.get("requestId") ?? "");
  // Idempotent (`executeApprovedErasureRequest`): a request in
  // `cleanup_pending` resumes its cleanup and is `completed` only once that is
  // verified; a completed one is a no-op. So "resume cleanup" is this action.
  try {
    await executeApprovedErasureRequest(scope, {
      requestId,
      approvalText: String(formData.get("maintainerApprovalText") ?? ""),
    });
  } catch (error) {
    landOnRefusal(requestId, error);
  }

  revalidatePublicCacheTags(allPublicCacheFamilyTags(), "update");
  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  revalidatePath("/garden");
  redirect(operatorErasureOutcomePath(requestId, "done"));
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

  const requestId = String(formData.get("requestId") ?? "");
  try {
    await markErasureRequestDryRunReviewed(scope, { requestId });
  } catch (error) {
    landOnRefusal(requestId, error);
  }

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  redirect(operatorErasureOutcomePath(requestId, "done"));
}
