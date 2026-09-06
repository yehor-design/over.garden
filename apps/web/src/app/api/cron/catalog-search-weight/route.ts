import { sql } from "kysely";
import { NextResponse } from "next/server";

import { db } from "@/db";

/**
 * Daily recompute of the picker's ranking inputs (ADR-0026 D7): gardener
 * usage, registration markets, registered forms and host relations, written
 * by `catalog_recompute_search_weight()` from migration 0055. Vercel Cron
 * sends GET; the same handler answers a manual POST.
 */
export async function GET(request: Request) {
  return await runCatalogSearchWeightCron(request);
}

export async function POST(request: Request) {
  return await runCatalogSearchWeightCron(request);
}

async function runCatalogSearchWeightCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const startedAt = performance.now();
    const result = await sql<{
      touched: number;
    }>`select catalog_recompute_search_weight() as touched`.execute(db);
    const touched = Number(result.rows[0]?.touched ?? 0);
    return NextResponse.json({
      ok: true,
      issue: "OVE-387",
      recompute: {
        touchedClass: touched === 0 ? "unchanged" : "changed",
        durationClass:
          performance.now() - startedAt < 5_000 ? "within_budget" : "slow",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, issue: "OVE-387", recompute: { lifecycleClass: "unavailable" } },
      { status: 503 },
    );
  }
}
