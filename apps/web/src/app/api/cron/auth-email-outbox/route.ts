import { NextResponse } from "next/server";

import { drainAuthEmailOutbox } from "@/server/auth/auth-email-outbox-consumer";

export async function GET(request: Request) {
  return await runAuthEmailOutboxCron(request);
}

export async function POST(request: Request) {
  return await runAuthEmailOutboxCron(request);
}

async function runAuthEmailOutboxCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainAuthEmailOutbox();
    const ready =
      result.failed === 0 && result.dead === 0 && !result.deadlineReached;
    return NextResponse.json({
      ok: ready,
      issue: "OVE-241",
      outbox: {
        claimedClass: countClass(result.claimed),
        sentClass: countClass(result.sent),
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
        issue: "OVE-241",
        outbox: { lifecycleClass: "unavailable" },
      },
      { status: 503 },
    );
  }
}

function countClass(count: number): "empty" | "present" {
  return count === 0 ? "empty" : "present";
}
