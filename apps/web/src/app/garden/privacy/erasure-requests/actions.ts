"use server";

import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
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

const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

export async function markErasureRequestReviewingAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  await assertErasureRequestMutationAccess(scope);

  await markErasureRequestReviewing({
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}

export async function markErasureRequestHandledAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
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

export async function executeApprovedErasureRequestAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  await assertErasureExecutionAccess(scope);

  await executeApprovedErasureRequest(scope, {
    requestId: String(formData.get("requestId") ?? ""),
    approvalText: String(formData.get("maintainerApprovalText") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
  revalidatePath("/garden");
}

export async function markErasureRequestDryRunReviewedAction(
  formData: FormData,
) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  await assertErasureRequestMutationAccess(scope);

  await markErasureRequestDryRunReviewed(scope, {
    requestId: String(formData.get("requestId") ?? ""),
  });

  revalidatePath(ERASURE_REQUESTS_PATH);
  revalidatePath("/erasure");
}
