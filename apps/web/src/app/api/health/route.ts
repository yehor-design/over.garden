import { connection } from "next/server";

/**
 * Liveness only (ADR-0022, D5): proves the function answers, and says nothing
 * else. Secret classes, database details and version facts are not published
 * anywhere: the owner-only `/health` page that held them is retired
 * (ADR-0027).
 */
export async function GET() {
  await connection();
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}
