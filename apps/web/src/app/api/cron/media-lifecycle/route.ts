import { NextResponse } from "next/server";

import { drainMediaLifecycleQueue } from "@/server/media/media-lifecycle-consumer";
import { runRetentionWorkflow } from "@/server/media/retention-executor";

/**
 * Vercel Cron invokes a cron path with GET.
 *
 * This route exported POST only, so from the day the schedule was added the
 * daily invocation answered 405 and the whole workflow behind it never ran
 * once: `media_lifecycle_retention_runs` held zero rows, nine queue rows sat at
 * `attempts = 0`, and five derivatives of deleted journal entries were still
 * being served with HTTP 200. The other three cron routes export both methods;
 * this one was the exception, and nothing compared the schedule with the
 * handler. `vercel-cron-contract.test.ts` does now.
 */
export async function GET(request: Request) {
  return runMediaLifecycleCron(request);
}

export async function POST(request: Request) {
  return runMediaLifecycleCron(request);
}

async function runMediaLifecycleCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const retention = await runRetentionWorkflow("execute");
  const drained = await drainMediaLifecycleQueue(16);
  const ready =
    retention.failureClass === "none" &&
    drained.failed === 0 &&
    drained.dead === 0 &&
    drained.remaining === 0 &&
    !drained.deadlineReached;

  return NextResponse.json({
    ok: ready,
    issue: "OVE-216",
    drained: {
      claimedClass: classOf(drained.claimed),
      completedClass: classOf(drained.completed),
      failedClass: classOf(drained.failed),
      deadClass: classOf(drained.dead),
      reclaimedClass: classOf(drained.reclaimed),
      supersededClass: classOf(drained.superseded),
      remainingClass: classOf(drained.remaining),
      deadlineClass: drained.deadlineReached ? "reached" : "within_budget",
      durationClass: durationClass(drained.durationMs),
    },
    retention: {
      policyVersion: retention.policyVersion,
      failureClass: retention.failureClass,
      danglingCoverPointerClass: retention.danglingCoverPointerClass,
      orphanCoverOnlyClass: retention.orphanCoverOnlyClass,
      pendingRevokeJobsClass: retention.pendingRevokeJobsClass,
      // OVE-353. `due` counts tombstones past their seven-day horizon;
      // `purged` counts the subset this pass could actually remove. A due
      // class that stays elevated while purged stays empty is the visible
      // signal that some derived effect is not reaching a terminal receipt.
      journalTombstoneDueClass: retention.journalTombstoneDueClass,
      journalTombstonePurgedClass:
        retention.journalTombstonePurgedClass ?? "empty",
    },
  });
}

function classOf(count: number): "empty" | "present" {
  return count === 0 ? "empty" : "present";
}

function durationClass(durationMs: number): "fast" | "bounded" | "over_budget" {
  if (durationMs <= 5_000) return "fast";
  if (durationMs <= 45_000) return "bounded";
  return "over_budget";
}
