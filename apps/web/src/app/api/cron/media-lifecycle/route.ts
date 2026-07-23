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

  const drained = await drainMediaLifecycleQueue(16);
  const retention = await runRetentionWorkflow("execute");

  return NextResponse.json({
    ok: retention.failureClass !== "failed",
    issue: "OVE-195",
    drained: {
      claimedClass: classOf(drained.claimed),
      completedClass: classOf(drained.completed),
      failedClass: classOf(drained.failed),
      deadClass: classOf(drained.dead),
    },
    retention: {
      policyVersion: retention.policyVersion,
      failureClass: retention.failureClass,
      quarantineExpireClass: retention.quarantineExpireClass,
      pendingRevokeJobsClass: retention.pendingRevokeJobsClass,
    },
  });
}

function classOf(count: number): "empty" | "present" {
  return count === 0 ? "empty" : "present";
}
