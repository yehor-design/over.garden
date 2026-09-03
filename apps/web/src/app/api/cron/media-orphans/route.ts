import { NextResponse } from "next/server";

import { sweepMediaOrphans } from "@/server/media/orphan-sweep";

/**
 * Weekly orphan sweep (OVE-372): deletes public derivative objects older
 * than seven days that no `media_assets` row names. The receipt carries
 * counts only.
 */
export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const receipt = await sweepMediaOrphans();
  return NextResponse.json({
    ok: receipt.failed === 0 && !receipt.deadlineReached,
    issue: "OVE-372",
    ...receipt,
  });
}
