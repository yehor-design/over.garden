"use server";

import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import { assertFounderInterviewMutationAccess } from "@/server/founder-interview-access";
import { createFounderInterviewLearning } from "@/server/founder-interview-repository";

const FOUNDER_INTERVIEWS_PATH = "/garden/pilot-learning/interviews";

export async function createFounderInterviewLearningAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const scope = admission.scope;
  await assertFounderInterviewMutationAccess(scope);

  await createFounderInterviewLearning(scope, {
    segment: String(formData.get("segment") ?? ""),
    activationResult: String(formData.get("activationResult") ?? ""),
    returnReason: String(formData.get("returnReason") ?? ""),
    mainObjection: String(formData.get("mainObjection") ?? ""),
    observedValue: String(formData.get("observedValue") ?? ""),
    nextAction: String(formData.get("nextAction") ?? ""),
    redactedNote: String(formData.get("redactedNote") ?? ""),
    subjectUserId: String(formData.get("subjectUserId") ?? ""),
    pilotCohort: String(formData.get("pilotCohort") ?? ""),
  });

  revalidatePath(FOUNDER_INTERVIEWS_PATH);
}
