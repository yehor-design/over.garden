import "server-only";

import { sql } from "kysely";

import { db } from "@/db";
import type { Health } from "@/db/schema";

const MAX_HEALTH_ROWS = 20;

export async function readRecentHealth(limit = 5): Promise<Health[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_HEALTH_ROWS);

  return db
    .selectFrom("health")
    .selectAll()
    .orderBy("created_at", "desc")
    .limit(boundedLimit)
    .execute();
}

export async function writeHealth(message: string): Promise<Health> {
  return db
    .insertInto("health")
    .values({ message })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function pingDatabase(): Promise<boolean> {
  const result = await sql<{ ok: number }>`select 1 as ok`.execute(db);
  return result.rows[0]?.ok === 1;
}
