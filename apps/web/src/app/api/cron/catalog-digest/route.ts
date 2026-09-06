import { sql } from "kysely";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { OWNER_CATALOG_DIGEST_KIND } from "@/server/auth/auth-email-outbox-consumer";
import { readCurationDigestSummary } from "@/server/catalog-curation-repository";

/**
 * The owner's weekly curation digest (ADR-0026 D10). Mondays: count the open
 * decisions, how many are new, how many carry a gardener's objects and how
 * many applied themselves, and enqueue one email through the auth email
 * outbox (migration 0063). Nothing is enqueued when there is nothing to
 * decide, and the outbox's partial unique index keeps one unsent digest per
 * owner however often this runs. Vercel Cron sends GET; the same handler
 * answers a manual POST.
 */
export async function GET(request: Request) {
  return await runCatalogDigestCron(request);
}

export async function POST(request: Request) {
  return await runCatalogDigestCron(request);
}

async function runCatalogDigestCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await readCurationDigestSummary();
    if (summary.openItems === 0 && summary.autoAppliedItems === 0) {
      return NextResponse.json({
        ok: true,
        issue: "OVE-391",
        digest: { enqueued: false, reason: "nothing_to_decide" },
      });
    }

    const enqueued = await sql<{ id: string }>`
      insert into auth_email_outbox (kind, payload, recipient_user_id)
      select ${OWNER_CATALOG_DIGEST_KIND}, ${JSON.stringify(summary)}::jsonb, owner.id
      from (
        select "user".id
        from "user"
        join admin_user_roles on admin_user_roles.user_id = "user".id
        where admin_user_roles.role = 'owner'
        order by admin_user_roles.granted_at
        limit 1
      ) as owner
      on conflict do nothing
      returning id
    `.execute(db);

    return NextResponse.json({
      ok: true,
      issue: "OVE-391",
      digest: {
        enqueued: enqueued.rows.length > 0,
        // Counts, never a name: this response is read from logs.
        openItems: summary.openItems,
        newItems: summary.newItems,
        withGardenerObjects: summary.withGardenerObjects,
        autoAppliedItems: summary.autoAppliedItems,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, issue: "OVE-391", digest: { lifecycleClass: "unavailable" } },
      { status: 503 },
    );
  }
}
