import { connection } from "next/server";

/**
 * Liveness only (ADR-0022, D5): proves the function answers. Secret classes,
 * database details, and version facts stay on the owner-only `/health` page.
 */
export async function GET() {
  await connection();
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}
