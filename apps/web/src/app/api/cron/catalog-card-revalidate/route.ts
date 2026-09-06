import { NextResponse } from "next/server";

import {
  countUnconvergedCatalogCardIntents,
  drainCatalogCardIntents,
} from "@/server/catalog-card-outbox";

/**
 * Drain the organism card intents the worker wrote (ADR-0026 D9, migration
 * 0062) and expire each card's cache tags. Scheduled daily: Vercel's Hobby
 * plan refuses a deployment whose cron runs more than once a day (the
 * ten-minute cadence the task named needs the Pro plan), and the card read's
 * `cacheLife("hours")` bounds staleness to about an hour meanwhile. Vercel
 * Cron sends GET; the same handler answers a manual POST.
 */
export async function GET(request: Request) {
  return await runCatalogCardRevalidateCron(request);
}

export async function POST(request: Request) {
  return await runCatalogCardRevalidateCron(request);
}

async function runCatalogCardRevalidateCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const startedAt = performance.now();
    const results = await drainCatalogCardIntents({ limit: 200 });
    const remaining = await countUnconvergedCatalogCardIntents();
    const counts = { revalidated: 0, superseded: 0, retry_scheduled: 0, dead_lettered: 0 };
    for (const result of results) counts[result.outcome] += 1;
    return NextResponse.json({
      ok: true,
      issue: "OVE-389",
      drain: {
        ...counts,
        remainingClass: remaining === 0 ? "converged" : "pending",
        durationClass:
          performance.now() - startedAt < 5_000 ? "within_budget" : "slow",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, issue: "OVE-389", drain: { lifecycleClass: "unavailable" } },
      { status: 503 },
    );
  }
}
