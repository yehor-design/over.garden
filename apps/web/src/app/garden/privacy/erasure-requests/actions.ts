"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import { executeApprovedErasureRequest } from "@/server/erasure-execution";
import { resolveErasureRequestOperatorAccess } from "@/server/erasure-request-access";
import {
  markErasureRequestDryRunReviewed,
  markErasureRequestHandled,
  markErasureRequestReviewing,
} from "@/server/erasure-request-repository";

const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

export async function markErasureRequestReviewingAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  assertOperator(scope);

  await markErasureRequestReviewing({
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}

export async function markErasureRequestHandledAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  assertOperator(scope);
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

export async function executeApprovedErasureRequestAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  assertOperator(scope);

  await executeApprovedErasureRequest(scope, {
    requestId: String(formData.get("requestId") ?? ""),
    approvalText: String(formData.get("maintainerApprovalText") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  revalidatePath("/garden");
}

export async function markErasureRequestDryRunReviewedAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  assertOperator(scope);

  await markErasureRequestDryRunReviewed(scope, {
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}

function assertOperator(scope: Awaited<ReturnType<typeof requireCurrentRequestScope>>) {
  const access = resolveErasureRequestOperatorAccess(scope);
  if (access.status !== "allowed") {
    throw new Error("Erasure request operator access denied.");
  }
}
