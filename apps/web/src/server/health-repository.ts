import "server-only";

import { sql } from "kysely";

import { db } from "@/db";

/**
 * Database liveness. The owner's `/health` page went with ADR-0027 and took
 * the `health` table's only reader and writer with it; this probe stays
 * because `workspace-access.ts` classifies a workspace section with it.
 */
export async function pingDatabase(): Promise<boolean> {
  const result = await sql<{ ok: number }>`select 1 as ok`.execute(db);
  return result.rows[0]?.ok === 1;
}
