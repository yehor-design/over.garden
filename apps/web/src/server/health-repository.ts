import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/db";
import { health, type Health, type NewHealth } from "@/db/schema";

/**
 * Server-tier data-access layer (Variant D — ADR-0012).
 *
 * This module is the SINGLE DOOR to the `health` table. Every read/write goes
 * through here so authorization is structurally impossible to forget — the path
 * IS the gate. `import "server-only"` guarantees this never ships to the browser
 * (the browser gets no direct DB access; that is the access-topology invariant).
 *
 * Real per-user repositories will scope every query by user + visibility. The
 * tracer below has no ownership dimension yet — it only proves the seam.
 */

export async function readRecentHealth(limit = 5): Promise<Health[]> {
  return db.select().from(health).orderBy(desc(health.createdAt)).limit(limit);
}

export async function writeHealth(message: string): Promise<Health> {
  const row: NewHealth = { message };
  const [inserted] = await db.insert(health).values(row).returning();
  return inserted;
}
