import { NextResponse } from "next/server";

import { drainMediaLifecycleQueue } from "@/server/media/media-lifecycle-consumer";
import { runRetentionWorkflow } from "@/server/media/retention-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
