"use server";

import { revalidatePath } from "next/cache";

import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  moderateEngagementCommentReport,
  type EngagementModerationAction,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";

export async function moderateCommentReportAction(formData: FormData) {
  const session = await getCurrentSession();
  if (!session?.user?.id) return;
  try {
    await moderateEngagementCommentReport(
      scopedToUser(session.user.id, getSessionId(session)),
      {
        reportId: String(formData.get("reportId") ?? ""),
        action: String(formData.get("action") ?? "") as EngagementModerationAction,
      },
    );
    revalidatePath("/admin/moderation/comments");
    return;
  } catch {
    return;
  }
}
