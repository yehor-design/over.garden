"use server";

import { revalidatePath } from "next/cache";

import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import {
  moderateEngagementCommentReport,
  type EngagementModerationAction,
} from "@/server/engagement-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";

export async function moderateCommentReportAction(formData: FormData) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") {
    return { mutationScope: admission.code };
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
