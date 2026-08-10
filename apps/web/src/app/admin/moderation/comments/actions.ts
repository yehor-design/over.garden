"use server";

import { revalidatePath } from "next/cache";

import {
  admitDocumentMutation,
  documentMutationGenerationFromFormData,
} from "@/server/document-mutation-admission";
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
  try {
    await moderateEngagementCommentReport(admission.scope, {
      reportId: String(formData.get("reportId") ?? ""),
      action: String(
        formData.get("action") ?? "",
      ) as EngagementModerationAction,
    });
    revalidatePath("/admin/moderation/comments");
    return;
  } catch {
    return;
  }
}
