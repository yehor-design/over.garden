"use server";

import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import {
  moderateEngagementCommentReport,
  type EngagementModerationAction,
} from "@/server/engagement-repository";

export async function moderateCommentReportAction(formData: FormData) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { documentMutationAdmission: admission.transportResult };
  }
  const access = await resolveAdminCapabilityAccessBounded(
    admission.scope,
    "operator:mutate",
  );
  if (access.status !== "allowed") return;
  try {
    await moderateEngagementCommentReport(admission.scope, {
      reportId: String(formData.get("reportId") ?? ""),
      action: String(
        formData.get("action") ?? "",
      ) as EngagementModerationAction,
    });
    revalidatePath("/account/moderation/comments");
    return;
  } catch {
    return;
  }
}
