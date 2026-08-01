import { NextResponse } from "next/server";

import { drainLearningAttributionOutbox } from "@/server/mvp-learning/attribution-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return await runLearningAttributionCron(request);
}

export async function POST(request: Request) {
  return await runLearningAttributionCron(request);
}

async function runLearningAttributionCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainLearningAttributionOutbox();
    const ready =
      result.failed === 0 && result.dead === 0 && !result.deadlineReached;
    return NextResponse.json({
      ok: ready,
      issue: "OVE-219",
      outbox: {
        claimedClass: countClass(result.claimed),
        attributedClass: countClass(result.attributed),
        failedClass: countClass(result.failed),
        deadClass: countClass(result.dead),
        cancelledClass: countClass(result.cancelled),
        reclaimedClass: countClass(result.reclaimed),
        remainingClass: countClass(result.remaining),
        deadlineClass: result.deadlineReached ? "reached" : "within_budget",
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        issue: "OVE-219",
        outbox: { lifecycleClass: "unavailable" },
      },
      { status: 503 },
    );
  }
}

function countClass(count: number): "empty" | "present" {
  return count === 0 ? "empty" : "present";
}
