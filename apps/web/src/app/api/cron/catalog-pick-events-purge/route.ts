import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  CATALOG_PICK_EVENT_RETENTION_DAYS,
  purgeCatalogPickEvents,
} from "@/server/catalog-health-repository";

/**
 * Daily purge of pick events past their retention window (OVE-398, ADR-0026 D12).
 *
 * The health tab answers "is picking working now", and a table that answers
 * that has no reason to hold personal-adjacent rows for a year. Ninety days is
 * the window; this is what makes it true rather than documented. Vercel Cron
 * sends GET; the same handler answers a manual POST.
 *
 * The count is reported as a class, not a number: how many of a gardener's
 * rows expired on a given day is not a figure a cron log needs.
 */
export async function GET(request: Request) {
  return await runCatalogPickEventsPurge(request);
}

export async function POST(request: Request) {
  return await runCatalogPickEventsPurge(request);
}

async function runCatalogPickEventsPurge(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const purged = await purgeCatalogPickEvents(
      db,
      CATALOG_PICK_EVENT_RETENTION_DAYS,
    );
    return NextResponse.json({
      ok: true,
      issue: "OVE-398",
      purge: {
        retentionDays: CATALOG_PICK_EVENT_RETENTION_DAYS,
        purgedClass: purged === 0 ? "nothing_expired" : "expired_rows_removed",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, issue: "OVE-398", purge: { lifecycleClass: "unavailable" } },
      { status: 503 },
    );
  }
}
