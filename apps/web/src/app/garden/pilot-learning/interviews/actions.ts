"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentRequestScope } from "@/server/auth-session";
import { resolveFounderInterviewOperatorAccess } from "@/server/founder-interview-access";
import { createFounderInterviewLearning } from "@/server/founder-interview-repository";

const FOUNDER_INTERVIEWS_PATH = "/garden/pilot-learning/interviews";

export async function createFounderInterviewLearningAction(formData: FormData) {
  const scope = await requireCurrentRequestScope();
  assertOperator(scope);

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

function assertOperator(
  scope: Awaited<ReturnType<typeof requireCurrentRequestScope>>,
) {
  const access = resolveFounderInterviewOperatorAccess(scope);
  if (access.status !== "allowed") {
    throw new Error("Founder interview operator access denied.");
  }
}
