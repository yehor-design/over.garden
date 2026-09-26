"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import {
  parseReportForm,
  type ReportFormField,
} from "@/lib/moderation/report-contract";
import { getCurrentSession } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  reportFingerprint,
  resolveReportTarget,
  submitContentReport,
} from "@/server/moderation/content-reports";
import { drainModerationMessages } from "@/server/moderation/moderation-mail";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";

/**
 * The report form's endpoint (ADR-0038 D5, `OVE-526`). A plain form post, so
 * it works without JavaScript (ADR-0024 D3); what the reader typed comes back
 * with a refusal, so nothing has to be typed twice.
 */
export interface ReportFormState {
  status:
    | "idle"
    | "invalid"
    | "not_found"
    | "rate_limited"
    | "failed"
    | "received";
  errors: ReportFormField[];
  values: Record<"reason" | "explanation" | "name" | "email", string>;
}

const EMPTY_VALUES: ReportFormState["values"] = {
  reason: "",
  explanation: "",
  name: "",
  email: "",
};

export async function submitReportAction(
  _previous: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const fields = Object.fromEntries(
    ["address", "reason", "explanation", "name", "email", "goodFaith"].map(
      (name) => [name, formData.get(name)],
    ),
  );
  const values = {
    reason: stringOf(fields.reason),
    explanation: stringOf(fields.explanation).slice(0, 2000),
    name: stringOf(fields.name).slice(0, 120),
    email: stringOf(fields.email).slice(0, 254),
  };
  const parsed = parseReportForm(fields);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };

  try {
    const target = await resolveReportTarget(parsed.input.address);
    if (!target) return { status: "not_found", errors: [], values };
    const [requestHeaders, locale, session] = await Promise.all([
      headers(),
      getRequestInterfaceLocale(),
      getCurrentSession().catch(() => null),
    ]);
    const result = await submitContentReport({
      form: parsed.input,
      target,
      fingerprint: reportFingerprint(networkAddress(requestHeaders)),
      reporterUserId: session?.user?.id ?? null,
      locale,
    });
    if (result.status === "rate_limited") {
      return { status: "rate_limited", errors: [], values };
    }
    // The receipt goes right after the answer; the daily cron sends anything
    // that did not.
    after(async () => {
      try {
        await drainModerationMessages();
      } catch {
        // The outbox keeps it; nothing about the reporter is logged.
      }
    });
    return { status: "received", errors: [], values: EMPTY_VALUES };
  } catch (error) {
    recordWorkspaceSectionFailure(describeWorkspaceFailure(error), {
      surface: "report",
      section: "submit",
    });
    return { status: "failed", errors: [], values };
  }
}

/** The first address the platform put in front of the request. */
function networkAddress(requestHeaders: Headers): string {
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}
