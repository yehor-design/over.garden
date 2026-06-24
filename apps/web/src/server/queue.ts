import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Cross-runtime job queue — PRODUCER side (TypeScript).
 *
 * The queue is **pgmq** (a Postgres extension), chosen because the enqueue
 * contract is plain SQL: the TS app enqueues here and the Python worker consumes
 * the same queue (see `services/matching/app/worker.py`). This satisfies the
 * language-agnostic requirement WITHOUT Redis and WITHOUT a Python-only
 * framework (TECH_STACK §2.9 explicitly excludes Procrastinate, which is
 * Python-only). The queue is enabled/created by `infra/sql/0001_pgmq.sql`.
 *
 * Payload MUST be cast to ::jsonb explicitly or pgmq stores it as text.
 */
export async function enqueueJob(
  queue: string,
  payload: unknown,
  delaySeconds = 0,
): Promise<number> {
  const rows = await db.execute<{ msg_id: number }>(
    sql`select pgmq.send(${queue}, ${JSON.stringify(payload)}::jsonb, ${delaySeconds}) as msg_id`,
  );
  return rows[0].msg_id;
}
