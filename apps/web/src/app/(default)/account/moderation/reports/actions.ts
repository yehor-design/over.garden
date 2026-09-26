"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import {
  REPORT_DECISION_GROUNDS,
  REPORT_DECISIONS,
  OWNER_REPORTS_PATH,
  REPORT_FACTS_MAX,
  type ReportDecision,
  type ReportDecisionGround,
} from "@/lib/moderation/report-contract";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import { decideContentReport } from "@/server/moderation/content-reports";
import { drainModerationMessages } from "@/server/moderation/moderation-mail";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import { resolveWorkspaceAdminAccess } from "@/server/workspace-access";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * The owner's decision on one report (ADR-0038 D5). Answers with a redirect
 * back to the report, the outcome in the address, as comment moderation does:
 * a plain form post that works without JavaScript.
 */
export async function decideContentReportAction(
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
  const decision = String(formData.get("decision") ?? "");
  const ground = String(formData.get("ground") ?? "");
  const facts = String(formData.get("facts") ?? "").trim();

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(admission.scope, "operator:mutate"),
  );
  let result: "done" | "stale" | "failed" | "denied" | "invalid";
  if (access.status !== "allowed") {
    result = access.status === "denied" ? "denied" : "failed";
  } else if (
    !UUID_PATTERN.test(reportId) ||
    !(REPORT_DECISIONS as readonly string[]).includes(decision) ||
    facts.length < 1 ||
    facts.length > REPORT_FACTS_MAX ||
    (decision === "removed" &&
      !(REPORT_DECISION_GROUNDS as readonly string[]).includes(ground))
  ) {
    result = "invalid";
  } else {
    try {
      const outcome = await decideContentReport(admission.scope, {
        reportId,
        decision: decision as ReportDecision,
        ground:
          decision === "removed" ? (ground as ReportDecisionGround) : null,
        facts,
      });
      if (outcome.status === "done") {
        revalidatePublicCacheTags(outcome.cacheTags, "update");
        for (const path of outcome.paths) revalidatePath(path);
        revalidatePath(OWNER_REPORTS_PATH);
        // The letters go right after the answer; the daily cron sends any
        // that did not.
        after(async () => {
          try {
            await drainModerationMessages();
          } catch {
            // The outbox keeps them.
          }
        });
        result = "done";
      } else {
        result = "stale";
      }
    } catch {
      result = "failed";
    }
  }
  const query = new URLSearchParams();
  if (UUID_PATTERN.test(reportId)) query.set("report", reportId);
  query.set("result", result);
  redirect(
    `${OWNER_REPORTS_PATH}?${query.toString()}#${
      UUID_PATTERN.test(reportId) ? `report-${reportId}` : "content-reports"
    }`,
  );
}
