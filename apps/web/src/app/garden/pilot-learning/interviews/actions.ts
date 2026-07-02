"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import { assertFounderInterviewMutationAccess } from "@/server/founder-interview-access";
import { createFounderInterviewLearning } from "@/server/founder-interview-repository";

const FOUNDER_INTERVIEWS_PATH = "/garden/pilot-learning/interviews";

export async function createFounderInterviewLearningAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
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
