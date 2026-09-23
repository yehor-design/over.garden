"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  moderateEngagementCommentReport,
  type EngagementModerationAction,
} from "@/server/engagement-repository";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { resolveWorkspaceAdminAccess } from "@/server/workspace-access";

const COMMENT_MODERATION_PATH = "/account/moderation/comments";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set<EngagementModerationAction>([
  "review",
  "dismiss",
  "remove",
]);

/**
 * `(previousState, formData)`, because the page submits through
 * `OwnerScopedProgressiveForm`: React gives a form a real endpoint only from a
 * Server Action reference, and a `(formData)` action has to be wrapped in a
 * client closure to fit — which renders `action="javascript:throw …"` and
 * silently makes the control need hydration (ADR-0024 D3, `OVE-459` AC6).
 *
 * It used to answer nothing: a refused owner check, a failure and a success
 * all returned `undefined`, and the page re-rendered without saying which
 * (`OVE-500`, criterion 9). It now comes back to the same view with the
 * report and an outcome the page reads back from the record — `done`,
 * `stale` when the report was already decided, `denied`, or `failed` with
 * nothing changed.
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
  const reportId = String(formData.get("reportId") ?? "")
    .trim()
    .toLowerCase();
  const action = String(formData.get("action") ?? "");
  // Denied only when the owner check says so: a role table that cannot be
  // read is a failure the owner may retry, not a claim they lack access.
  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(admission.scope, "operator:mutate"),
  );
  let result: "done" | "stale" | "failed" | "denied";
  if (access.status !== "allowed") {
    result = access.status === "denied" ? "denied" : "failed";
  } else if (
    !UUID_PATTERN.test(reportId) ||
    !ACTIONS.has(action as EngagementModerationAction)
  ) {
    result = "stale";
  } else {
    try {
      const outcome = await moderateEngagementCommentReport(admission.scope, {
        reportId,
        action: action as EngagementModerationAction,
      });
      result = outcome.changed ? "done" : "stale";
    } catch {
      result = "failed";
    }
  }
  if (result === "done") revalidatePath(COMMENT_MODERATION_PATH);
  const query = new URLSearchParams();
  if (String(formData.get("view") ?? "") === "resolved") {
    query.set("view", "resolved");
  }
  if (UUID_PATTERN.test(reportId)) query.set("report", reportId);
  query.set("result", result);
  redirect(
    `${COMMENT_MODERATION_PATH}?${query.toString()}#${
      UUID_PATTERN.test(reportId) ? `report-${reportId}` : "moderation-queue"
    }`,
  );
}
