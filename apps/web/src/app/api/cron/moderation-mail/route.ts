import { NextResponse } from "next/server";

import {
  drainModerationMessages,
  purgeExpiredModerationRecords,
} from "@/server/moderation/moderation-mail";

/**
 * Daily, for the complaint procedure (ADR-0038 D5, `OVE-526`): send every
 * letter the requests did not (a receipt, a decision, a statement of reasons),
 * and delete reports and their letters a year after the decision — the
 * privacy policy's figure. Vercel Cron sends GET; a manual POST does the same.
 *
 * Counts are reported as classes: how many people complained on a given day
 * is not a figure a cron log needs.
 */
export async function GET(request: Request) {
  return await runModerationMailCron(request);
}

export async function POST(request: Request) {
  return await runModerationMailCron(request);
}

async function runModerationMailCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const drained = await drainModerationMessages({ limit: 100 });
    const purged = await purgeExpiredModerationRecords();
    return NextResponse.json({
      ok: drained.failed === 0,
      issue: "OVE-526",
      mail: {
        providerClass: drained.unconfigured ? "unconfigured" : "configured",
        sentClass: drained.sent === 0 ? "none" : "present",
        failedClass: drained.failed === 0 ? "none" : "present",
      },
      retention: {
        purgedClass:
          purged.reports + purged.commentMessages === 0
            ? "nothing_expired"
            : "expired_rows_removed",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, issue: "OVE-526", mail: { lifecycleClass: "unavailable" } },
      { status: 503 },
    );
  }
}
