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

/**
 * `(previousState, formData)`, because the page submits through
 * `OwnerScopedProgressiveForm`: React gives a form a real endpoint only from a
 * Server Action reference, and a `(formData)` action has to be wrapped in a
 * client closure to fit — which renders `action="javascript:throw …"` and
 * silently makes the control need hydration (ADR-0024 D3, `OVE-459` AC6).
 */
export async function moderateCommentReportAction(
  _previousState: unknown,
  formData: FormData,
) {
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
